import cron from 'node-cron';
import { runIngestion } from '../ingestion/index.js';
import runClustering from '../jobs/cluster.js';
import { ScheduledJobs, Settings } from '../db/settings-model.js';

let ingestionJob = null;
let clusteringJob = null;

export async function initializeScheduler() {
  console.log('📅 Initializing scheduler...');
  
  // Initialize scheduled jobs in database
  await initializeJobs();
  
  // Schedule ingestion
  if (Settings.isIngestionEnabled()) {
    const interval = Settings.getIngestionInterval();
    await scheduleIngestion(interval);
  }
  
  // Schedule clustering
  if (Settings.isClusteringEnabled()) {
    const interval = Settings.get('clustering_interval');
    await scheduleClustering(interval);
  }
}

async function initializeJobs() {
  const db = getDb();
  
  // Create default jobs if they don't exist
  db.prepare(`
    INSERT OR IGNORE INTO scheduled_jobs (job_name, enabled, cron_expression, status)
    VALUES 
      ('ingestion', 1, '*/15 * * * *', 'idle'),
      ('clustering', 1, '*/30 * * * *', 'idle'),
      ('cleanup', 0, '0 3 * * *', 'idle'),
      ('backup', 0, '0 4 * * *', 'idle')
  `).run();
}

export async function scheduleIngestion(cronExpression = null) {
  // Stop existing job
  if (ingestionJob) {
    ingestionJob.stop();
    ingestionJob = null;
    console.log('⏹️  Stopped ingestion job');
  }
  
  // Start new job if expression provided
  if (cronExpression && cron.validate(cronExpression)) {
    ingestionJob = cron.schedule(cronExpression, async () => {
      console.log('🔄 Running scheduled ingestion...');
      
      try {
        ScheduledJobs.update('ingestion', { 
          status: 'running',
          last_run: new Date().toISOString()
        });
        
        const results = await runIngestion();
        
        ScheduledJobs.update('ingestion', {
          status: 'success',
          next_run: getNextRun(cronExpression)
        });
        
        console.log(`✅ Ingestion completed: ${results.totalArticles} articles from ${results.results.length} sources`);
      } catch (error) {
        console.error('❌ Ingestion failed:', error);
        
        ScheduledJobs.update('ingestion', {
          status: 'error',
          config: JSON.stringify({ error: error.message })
        });
      }
    });
    
    console.log(`📅 Scheduled ingestion: ${cronExpression}`);
    
    ScheduledJobs.update('ingestion', {
      enabled: 1,
      cron_expression: cronExpression,
      next_run: getNextRun(cronExpression)
    });
  }
}

export async function scheduleClustering(cronExpression = null) {
  // Stop existing job
  if (clusteringJob) {
    clusteringJob.stop();
    clusteringJob = null;
    console.log('⏹️  Stopped clustering job');
  }
  
  // Start new job if expression provided
  if (cronExpression && cron.validate(cronExpression)) {
    clusteringJob = cron.schedule(cronExpression, async () => {
      console.log('🔗 Running scheduled clustering...');
      
      try {
        ScheduledJobs.update('clustering', {
          status: 'running',
          last_run: new Date().toISOString()
        });
        
        const result = await runClustering();
        
        ScheduledJobs.update('clustering', {
          status: 'success',
          next_run: getNextRun(cronExpression),
          config: JSON.stringify({
            clusters_created: result.newClusters,
            clusters_updated: result.updatedClusters
          })
        });
        
        console.log(`✅ Clustering completed: ${result.newClusters} new, ${result.updatedClusters} updated`);
      } catch (error) {
        console.error('❌ Clustering failed:', error);
        
        ScheduledJobs.update('clustering', {
          status: 'error',
          config: JSON.stringify({ error: error.message })
        });
      }
    });
    
    console.log(`📅 Scheduled clustering: ${cronExpression}`);
    
    ScheduledJobs.update('clustering', {
      enabled: 1,
      cron_expression: cronExpression,
      next_run: getNextRun(cronExpression)
    });
  }
}

// Helper to calculate next run time
function getNextRun(cronExpression) {
  const interval = cron.parseExpression(cronExpression);
  return interval.next().toISOString();
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

// Get scheduler status
export function getSchedulerStatus() {
  return {
    ingestion: {
      running: ingestionJob !== null,
      ...ScheduledJobs.get('ingestion')
    },
    clustering: {
      running: clusteringJob !== null,
      ...ScheduledJobs.get('clustering')
    }
  };
}

// Import getDb
import { getDb } from '../db/index.js';