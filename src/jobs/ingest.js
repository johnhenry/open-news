import 'dotenv/config';
import cron from 'node-cron';
import { Source, Article } from '../db/models.js';
import { fetchAllFeeds } from '../ingestion/rss-parser.js';
import { clusterArticles } from '../clustering/cluster.js';
import migrate from '../db/migrate.js';

async function runIngestion() {
  console.log(`\n🔄 Starting ingestion at ${new Date().toISOString()}`);
  
  try {
    const sources = Source.getAll();
    
    if (sources.length === 0) {
      console.log('⚠️  No sources configured. Please add sources first.');
      return;
    }
    
    console.log(`📡 Found ${sources.length} active sources`);
    
    const results = await fetchAllFeeds(sources);
    
    const totalFetched = results.reduce((sum, r) => sum + (r.success?.length || 0), 0);
    const totalErrors = results.reduce((sum, r) => sum + (r.errors?.length || 0), 0);
    
    console.log(`✅ Ingestion complete: ${totalFetched} new articles, ${totalErrors} errors`);
    
    return {
      sources_processed: results.length,
      articles_fetched: totalFetched,
      errors: totalErrors
    };
    
  } catch (error) {
    console.error('❌ Ingestion failed:', error);
    throw error;
  }
}

async function runClustering() {
  console.log(`\n🔗 Starting clustering at ${new Date().toISOString()}`);
  
  try {
    const recentArticles = Article.getAll(200, 0);
    
    if (recentArticles.length < 2) {
      console.log('⚠️  Not enough articles for clustering');
      return;
    }
    
    console.log(`📊 Clustering ${recentArticles.length} recent articles`);
    
    const clusters = await clusterArticles(recentArticles);
    
    console.log(`✅ Created ${clusters.length} clusters`);
    
    return {
      articles_processed: recentArticles.length,
      clusters_created: clusters.length
    };
    
  } catch (error) {
    console.error('❌ Clustering failed:', error);
    throw error;
  }
}

export function startScheduledJobs() {
  const ingestInterval = process.env.INGEST_INTERVAL || '*/15 * * * *';
  const clusterInterval = process.env.CLUSTER_INTERVAL || '*/30 * * * *';
  
  console.log(`
  ⏰ Scheduling Jobs
  ==================
  📥 Ingestion: ${ingestInterval}
  🔗 Clustering: ${clusterInterval}
  `);
  
  cron.schedule(ingestInterval, async () => {
    try {
      await runIngestion();
    } catch (error) {
      console.error('Scheduled ingestion error:', error);
    }
  });
  
  cron.schedule(clusterInterval, async () => {
    try {
      await runClustering();
    } catch (error) {
      console.error('Scheduled clustering error:', error);
    }
  });
  
  console.log('✅ Scheduled jobs started');
}

async function runOnce() {
  console.log('🚀 Running one-time ingestion and clustering');
  
  migrate();
  
  const ingestResults = await runIngestion();
  console.log('Ingestion results:', ingestResults);
  
  const clusterResults = await runClustering();
  console.log('Clustering results:', clusterResults);
  
  console.log('✅ One-time run complete');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2];
  
  if (mode === '--daemon') {
    console.log('Starting in daemon mode...');
    migrate();
    startScheduledJobs();
    
    console.log('Press Ctrl+C to stop');
  } else {
    runOnce().then(() => process.exit(0)).catch(err => {
      console.error(err);
      process.exit(1);
    });
  }
}

export { runIngestion, runClustering };