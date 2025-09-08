import { getDb } from '../db/index.js';
import { Settings } from '../db/settings-model.js';

export async function runCleanup() {
  console.log('🗑️  Running cleanup...');
  
  const retentionDays = Settings.get('article_retention_days') || 30;
  const db = getDb();
  
  try {
    let cutoff;
    let message;
    
    if (retentionDays === -1 || retentionDays === 0) {
      // Special case: -1 or 0 means delete ALL articles
      cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // Tomorrow's date to catch everything
      message = 'Deleting ALL articles';
    } else {
      // Normal case: delete articles older than retention days
      cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
      message = `Deleting articles older than ${retentionDays} days`;
    }
    
    console.log(`  ${message}...`);
    
    // First, delete related records
    // Delete entities for these articles
    const entitiesResult = db.prepare(`
      DELETE FROM entities 
      WHERE article_id IN (
        SELECT id FROM articles 
        WHERE published_at < ?
      )
    `).run(cutoff);
    
    // Delete embeddings for these articles
    const embeddingsResult = db.prepare(`
      DELETE FROM embeddings 
      WHERE article_id IN (
        SELECT id FROM articles 
        WHERE published_at < ?
      )
    `).run(cutoff);
    
    // Delete LLM cache for these articles
    const cacheResult = db.prepare(`
      DELETE FROM llm_analysis_cache 
      WHERE article_id IN (
        SELECT id FROM articles 
        WHERE published_at < ?
      )
    `).run(cutoff);
    
    // Delete article-cluster mappings for these articles
    const clusterMappingsResult = db.prepare(`
      DELETE FROM article_clusters 
      WHERE article_id IN (
        SELECT id FROM articles 
        WHERE published_at < ?
      )
    `).run(cutoff);
    
    // Now delete the articles themselves
    const articlesResult = db.prepare(`
      DELETE FROM articles 
      WHERE published_at < ?
    `).run(cutoff);
    
    console.log(`  ✓ Deleted ${articlesResult.changes} articles`);
    console.log(`  ✓ Deleted ${entitiesResult.changes} entities`);
    console.log(`  ✓ Deleted ${embeddingsResult.changes} embeddings`);
    console.log(`  ✓ Deleted ${cacheResult.changes} cache entries`);
    console.log(`  ✓ Deleted ${clusterMappingsResult.changes} cluster mappings`);
    
    // Clean up orphaned clusters (clusters with no articles)
    const orphanedClustersResult = db.prepare(`
      DELETE FROM clusters 
      WHERE id NOT IN (
        SELECT DISTINCT cluster_id FROM article_clusters
      )
    `).run();
    
    if (orphanedClustersResult.changes > 0) {
      console.log(`  ✓ Deleted ${orphanedClustersResult.changes} orphaned clusters`);
    }
    
    // Run VACUUM to reclaim space
    console.log('  ✓ Optimizing database...');
    db.prepare('VACUUM').run();
    
    const result = {
      success: true,
      articlesDeleted: articlesResult.changes,
      entitiesDeleted: entitiesResult.changes,
      embeddingsDeleted: embeddingsResult.changes,
      cacheEntriesDeleted: cacheResult.changes,
      clusterMappingsDeleted: clusterMappingsResult.changes,
      orphanedClustersDeleted: orphanedClustersResult.changes,
      retentionDays,
      cutoffDate: retentionDays === -1 || retentionDays === 0 ? 'All articles' : cutoff
    };
    
    console.log(`✅ Cleanup completed`);
    
    return result;
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    throw error;
  }
}