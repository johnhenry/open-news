import 'dotenv/config';
import { Article } from '../db/models.js';
import { clusterArticles } from '../clustering/cluster.js';
import migrate from '../db/migrate.js';

async function runClustering() {
  console.log(`\n🔗 Starting clustering at ${new Date().toISOString()}`);
  
  try {
    migrate();
    
    const recentArticles = Article.getAll(200, 0);
    
    if (recentArticles.length < 2) {
      console.log('⚠️  Not enough articles for clustering');
      return {
        articles_processed: recentArticles.length,
        clusters_created: 0,
        message: 'Not enough articles'
      };
    }
    
    console.log(`📊 Processing ${recentArticles.length} recent articles`);
    
    const clusters = await clusterArticles(recentArticles);
    
    console.log(`✅ Created ${clusters.length} new clusters`);
    
    clusters.forEach((cluster, i) => {
      console.log(`  Cluster ${i + 1}: ${cluster.articles} articles`);
    });
    
    return {
      articles_processed: recentArticles.length,
      clusters_created: clusters.length
    };
    
  } catch (error) {
    console.error('❌ Clustering failed:', error);
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runClustering()
    .then(results => {
      console.log('\nClustering complete:', results);
      process.exit(0);
    })
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

export default runClustering;
export { runClustering };