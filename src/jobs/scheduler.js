import cron from 'node-cron';
import { runIngestion } from '../ingestion/index.js';
import runClustering from '../jobs/cluster.js';
import { runBackup } from '../jobs/backup.js';
import { runCleanup } from '../jobs/cleanup.js';
import { ScheduledJobs } from '../db/settings-model.js';
import { getDb } from '../db/index.js';

// cron tasks, by job name (in-process node-cron handles)
const tasks = {};
// jobs that are executing right now IN THIS PROCESS (the only truthful "running")
const running = new Set();

// ---------------------------------------------------------------- cron arithmetic

function parseField(field, min, max) {
  const values = new Set();
  for (const part of field.split(',')) {
    const [rangeStr, stepStr] = part.split('/');
    const step = stepStr === undefined ? 1 : parseInt(stepStr, 10);
    if (!Number.isInteger(step) || step < 1) return null;
    let lo, hi;
    if (rangeStr === '*') { lo = min; hi = max; }
    else if (/^\d+$/.test(rangeStr)) { lo = parseInt(rangeStr, 10); hi = stepStr === undefined ? lo : max; }
    else if (/^\d+-\d+$/.test(rangeStr)) { [lo, hi] = rangeStr.split('-').map(Number); }
    else return null;
    if (lo < min || hi > max || lo > hi) return null;
    for (let v = lo; v <= hi; v += step) values.add(v);
  }
  return values;
}

/**
 * Next time (strictly after `from`) a 5-field cron expression fires, in the process's
 * local time zone like node-cron. Returns null for an expression it cannot understand.
 */
export function nextCronRun(expression, from = new Date()) {
  const parts = String(expression || '').trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const minutes = parseField(parts[0], 0, 59);
  const hours = parseField(parts[1], 0, 23);
  const doms = parseField(parts[2], 1, 31);
  const months = parseField(parts[3], 1, 12);
  const dowRaw = parseField(parts[4].replace(/\b7\b/g, '0'), 0, 7);
  if (!minutes || !hours || !doms || !months || !dowRaw) return null;
  const dows = new Set([...dowRaw].map(d => d % 7));
  const domRestricted = parts[2] !== '*' && !parts[2].startsWith('*/');
  const dowRestricted = parts[4] !== '*' && !parts[4].startsWith('*/');

  const t = new Date(from.getTime());
  t.setSeconds(0, 0);
  t.setMinutes(t.getMinutes() + 1);
  const limit = from.getTime() + 366 * 24 * 3600 * 1000;
  while (t.getTime() <= limit) {
    if (!months.has(t.getMonth() + 1)) { t.setMonth(t.getMonth() + 1, 1); t.setHours(0, 0, 0, 0); continue; }
    const domOk = doms.has(t.getDate());
    const dowOk = dows.has(t.getDay());
    const dayOk = domRestricted && dowRestricted ? (domOk || dowOk) : (domOk && dowOk);
    if (!dayOk) { t.setDate(t.getDate() + 1); t.setHours(0, 0, 0, 0); continue; }
    if (!hours.has(t.getHours())) { t.setHours(t.getHours() + 1, 0, 0, 0); continue; }
    if (!minutes.has(t.getMinutes())) { t.setMinutes(t.getMinutes() + 1); continue; }
    return t;
  }
  return null;
}

function nextRunIso(expression) {
  return nextCronRun(expression)?.toISOString() ?? null;
}

// ---------------------------------------------------------------- job status

/**
 * Run a job's task and record what really happened: running -> success|error, with
 * next_run recomputed from the cron expression either way. A job that is still running
 * is not started a second time.
 */
export async function runJob(name, task, summarize = () => null) {
  if (running.has(name)) {
    console.log(`⏭️  ${name} is still running, skipping this tick`);
    return { skipped: true };
  }
  running.add(name);
  ScheduledJobs.update(name, { status: 'running', last_run: new Date().toISOString() });
  try {
    const result = await task();
    ScheduledJobs.update(name, {
      status: 'success',
      next_run: nextRunIso(ScheduledJobs.get(name)?.cron_expression),
      config: summarize(result) ? JSON.stringify(summarize(result)) : null
    });
    return { result };
  } catch (error) {
    console.error(`❌ ${name} failed:`, error);
    ScheduledJobs.update(name, {
      status: 'error',
      next_run: nextRunIso(ScheduledJobs.get(name)?.cron_expression),
      config: JSON.stringify({ error: error.message })
    });
    return { error };
  } finally {
    running.delete(name);
  }
}

/**
 * Called on boot: whatever a previous process left as "running" cannot still be running.
 */
export function recoverStaleJobs() {
  for (const row of ScheduledJobs.getAll()) {
    if (row.status === 'running' && !running.has(row.job_name)) {
      ScheduledJobs.update(row.job_name, {
        status: 'interrupted',
        next_run: row.enabled ? nextRunIso(row.cron_expression) : null
      });
    }
  }
}

/** Job rows as the API reports them: status and next_run that match reality. */
export function getJobsStatus() {
  return ScheduledJobs.getAll().map(row => ({
    ...row,
    status: row.status === 'running' && !running.has(row.job_name) ? 'interrupted' : row.status,
    is_running: running.has(row.job_name),
    next_run: row.enabled ? nextRunIso(row.cron_expression) : null
  }));
}

// ---------------------------------------------------------------- scheduling

async function initializeJobs() {
  const db = getDb();
  db.prepare(`
    INSERT OR IGNORE INTO scheduled_jobs (job_name, enabled, cron_expression, status)
    VALUES
      ('ingestion', 1, '*/15 * * * *', 'idle'),
      ('clustering', 1, '*/30 * * * *', 'idle'),
      ('cleanup', 0, '0 3 * * *', 'idle'),
      ('backup', 0, '0 4 * * *', 'idle')
  `).run();
}

export async function initializeScheduler() {
  console.log('📅 Initializing scheduler...');
  await initializeJobs();
  recoverStaleJobs();

  const starters = {
    ingestion: scheduleIngestion,
    clustering: scheduleClustering,
    backup: scheduleBackup,
    cleanup: scheduleCleanup
  };
  for (const [name, start] of Object.entries(starters)) {
    const job = ScheduledJobs.get(name);
    if (job && job.enabled) await start(job.cron_expression);
  }
}

function schedule(name, label, cronExpression, taskFn, summarize) {
  if (tasks[name]) {
    tasks[name].stop();
    tasks[name] = null;
    console.log(`⏹️  Stopped ${name} job`);
  }
  if (!cronExpression || !cron.validate(cronExpression)) return;

  tasks[name] = cron.schedule(cronExpression, async () => {
    console.log(`${label} Running scheduled ${name}...`);
    await runJob(name, taskFn, summarize);
  });
  tasks[name].start();
  console.log(`📅 Scheduled ${name}: ${cronExpression}`);

  ScheduledJobs.update(name, {
    enabled: 1,
    cron_expression: cronExpression,
    next_run: nextRunIso(cronExpression)
  });
}

export async function scheduleIngestion(cronExpression = null) {
  schedule('ingestion', '🔄', cronExpression, runIngestion, null);
}

export async function scheduleClustering(cronExpression = null) {
  schedule('clustering', '🔗', cronExpression, runClustering, r => ({
    clusters_created: r.clusters_created,
    articles_processed: r.articles_processed
  }));
}

export async function scheduleBackup(cronExpression = null) {
  schedule('backup', '💾', cronExpression, runBackup, r => ({
    location: r.location, articles: r.articles, sources: r.sources
  }));
}

export async function scheduleCleanup(cronExpression = null) {
  schedule('cleanup', '🗑️ ', cronExpression, runCleanup, r => ({
    articles_deleted: r.articlesDeleted,
    entities_deleted: r.entitiesDeleted,
    retention_days: r.retentionDays,
    skipped: r.skipped || undefined
  }));
}

// Manual trigger functions
export async function triggerIngestion() {
  console.log('🔄 Manually triggering ingestion...');
  return await runIngestion();
}

export async function triggerClustering() {
  console.log('🔗 Manually triggering clustering...');
  return await runClustering();
}

export async function triggerBackup() {
  console.log('💾 Manually triggering backup...');
  return await runBackup();
}

export async function triggerCleanup() {
  console.log('🗑️  Manually triggering cleanup...');
  return await runCleanup();
}

// Get scheduler status
export function getSchedulerStatus() {
  const status = {};
  for (const job of getJobsStatus()) {
    status[job.job_name] = { running: !!tasks[job.job_name], ...job };
  }
  return status;
}
