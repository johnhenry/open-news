import { jest } from '@jest/globals';
import { setupDb } from './helpers/db.js';

const db = setupDb();
const sched = await import('../src/jobs/scheduler.js');
const { ScheduledJobs } = await import('../src/db/settings-model.js');

beforeEach(() => { jest.spyOn(console, 'log').mockImplementation(() => {}); jest.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => jest.restoreAllMocks());

describe('nextCronRun', () => {
  // Cron fields are local time (node-cron's default), so build everything in local time.
  const L = (d, h, m) => new Date(2026, 10, d, h, m).toISOString();
  const from = new Date(2026, 10, 26, 13, 1, 39);
  test.each([
    ['0 */2 * * *', L(26, 14, 0)],
    ['10 */2 * * *', L(26, 14, 10)],
    ['*/15 * * * *', L(26, 13, 15)],
    ['0 3 * * *', L(27, 3, 0)],
    ['30 4 * * 1', L(30, 4, 30)],
    ['0,30 * * * *', L(26, 13, 30)],
  ])('%s -> %s', (expr, iso) => {
    expect(sched.nextCronRun(expr, from).toISOString()).toBe(iso);
  });
  test('strictly after "from" and invalid expressions give null', () => {
    expect(sched.nextCronRun('0 */2 * * *', new Date(2026, 10, 26, 14, 0)).toISOString()).toBe(L(26, 16, 0));
    expect(sched.nextCronRun('nonsense')).toBeNull();
  });
});

describe('job status reflects reality', () => {
  test('a job left "running" by a previous process is marked interrupted on boot, with a fresh next_run', () => {
    ScheduledJobs.update('ingestion', { status: 'running', last_run: '2026-11-05T21:02:57.527Z', next_run: '2026-11-05T21:02:57.527Z', enabled: 1, cron_expression: '0 */2 * * *' });
    ScheduledJobs.update('cleanup', { status: 'running', enabled: 0 });
    sched.recoverStaleJobs();
    const ing = ScheduledJobs.get('ingestion');
    expect(ing.status).toBe('interrupted');
    expect(new Date(ing.next_run).getTime()).toBeGreaterThan(Date.now());
    const cl = ScheduledJobs.get('cleanup');
    expect(cl.status).toBe('interrupted');
    expect(cl.next_run).toBeNull();
  });

  test('runJob records running -> success and recomputes next_run', async () => {
    ScheduledJobs.update('clustering', { enabled: 1, cron_expression: '10 */2 * * *', next_run: '2026-11-05T00:00:00.000Z', status: 'idle' });
    let during;
    const res = await sched.runJob('clustering', async () => { during = ScheduledJobs.get('clustering').status; return { clusters_created: 3, articles_processed: 10 }; });
    expect(during).toBe('running');
    const row = ScheduledJobs.get('clustering');
    expect(row.status).toBe('success');
    expect(new Date(row.next_run).getTime()).toBeGreaterThan(Date.now());
    expect(res.skipped).toBeUndefined();
  });

  test('a failing run records error AND still moves next_run forward', async () => {
    ScheduledJobs.update('ingestion', { enabled: 1, cron_expression: '0 */2 * * *', next_run: '2026-11-05T00:00:00.000Z', status: 'idle' });
    await sched.runJob('ingestion', async () => { throw new Error('feed exploded'); });
    const row = ScheduledJobs.get('ingestion');
    expect(row.status).toBe('error');
    expect(JSON.parse(row.config).error).toBe('feed exploded');
    expect(new Date(row.next_run).getTime()).toBeGreaterThan(Date.now());
  });

  test('a job scheduled without a summary function (ingestion) is recorded as success, not error', async () => {
    ScheduledJobs.update('ingestion', { enabled: 1, cron_expression: '0 */2 * * *', status: 'idle' });
    await sched.runJob('ingestion', async () => ({ results: [], totalArticles: 0 }), null);
    expect(ScheduledJobs.get('ingestion').status).toBe('success');
  });

  test('overlapping runs of the same job are skipped, not stacked', async () => {
    let release;
    const gate = new Promise(r => { release = r; });
    const first = sched.runJob('ingestion', async () => { await gate; return {}; });
    const second = await sched.runJob('ingestion', async () => { throw new Error('must not run'); });
    expect(second.skipped).toBe(true);
    release();
    await first;
    expect(ScheduledJobs.get('ingestion').status).toBe('success');
  });

  test('getJobsStatus never reports "running" for a job that is not running in this process', () => {
    db.prepare("UPDATE scheduled_jobs SET status='running', next_run='2026-11-05T00:00:00.000Z', enabled=1, cron_expression='0 */2 * * *' WHERE job_name='ingestion'").run();
    const ing = sched.getJobsStatus().find(j => j.job_name === 'ingestion');
    expect(ing.status).toBe('interrupted');
    expect(new Date(ing.next_run).getTime()).toBeGreaterThan(Date.now());
  });
});
