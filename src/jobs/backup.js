import { getDb } from '../db/index.js';
import { Settings } from '../db/settings-model.js';
import fs from 'fs/promises';
import path from 'path';

export async function runBackup() {
  console.log('💾 Running backup...');
  
  const backupLocation = Settings.get('backup_location') || './backups';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(backupLocation, `backup-${timestamp}`);
  
  try {
    // Create backup directory
    await fs.mkdir(backupDir, { recursive: true });
    
    const db = getDb();
    
    // Backup articles
    const articles = db.prepare('SELECT * FROM articles ORDER BY published_at DESC').all();
    await fs.writeFile(
      path.join(backupDir, 'articles.json'),
      JSON.stringify(articles, null, 2)
    );
    console.log(`  ✓ Backed up ${articles.length} articles`);
    
    // Backup sources
    const sources = db.prepare('SELECT * FROM sources').all();
    await fs.writeFile(
      path.join(backupDir, 'sources.json'),
      JSON.stringify(sources, null, 2)
    );
    console.log(`  ✓ Backed up ${sources.length} sources`);
    
    // Backup settings
    const settings = db.prepare('SELECT * FROM settings').all();
    await fs.writeFile(
      path.join(backupDir, 'settings.json'),
      JSON.stringify(settings, null, 2)
    );
    console.log(`  ✓ Backed up ${settings.length} settings`);
    
    // Backup clusters
    const clusters = db.prepare('SELECT * FROM clusters').all();
    await fs.writeFile(
      path.join(backupDir, 'clusters.json'),
      JSON.stringify(clusters, null, 2)
    );
    console.log(`  ✓ Backed up ${clusters.length} clusters`);
    
    // Backup article_clusters mappings
    const articleClusters = db.prepare('SELECT * FROM article_clusters').all();
    await fs.writeFile(
      path.join(backupDir, 'article_clusters.json'),
      JSON.stringify(articleClusters, null, 2)
    );
    
    // Create backup metadata
    const metadata = {
      timestamp,
      articles: articles.length,
      sources: sources.length,
      settings: settings.length,
      clusters: clusters.length,
      articleClusters: articleClusters.length,
      databaseSize: db.prepare("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()").get().size
    };
    
    await fs.writeFile(
      path.join(backupDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );
    
    console.log(`✅ Backup completed: ${backupDir}`);
    
    return {
      success: true,
      location: backupDir,
      ...metadata
    };
  } catch (error) {
    console.error('❌ Backup failed:', error);
    throw error;
  }
}