import { Source, Article, IngestionLog } from '../db/models.js';
import { fetchRSSFeed } from './rss-parser.js';

export async function runIngestion(sourceId = null) {
  const sources = sourceId 
    ? [Source.getById(sourceId)]
    : Source.getAll();
  
  const results = [];
  let totalArticles = 0;
  
  for (const source of sources) {
    if (!source || !source.active) continue;
    
    try {
      console.log(`📥 Ingesting from ${source.name}...`);
      
      let articles = [];
      
      if (source.rss_url) {
        articles = await fetchRSSFeed(source.rss_url, source.id);
      } else if (source.api_url) {
        // TODO: Implement API ingestion
        console.log(`⚠️  API ingestion not yet implemented for ${source.name}`);
      } else if (source.scraping_enabled) {
        // TODO: Implement web scraping
        console.log(`⚠️  Web scraping not yet implemented for ${source.name}`);
      }
      
      IngestionLog.create({
        source_id: source.id,
        status: 'success',
        articles_fetched: articles.length,
        error_message: null
      });
      
      results.push({
        source: source.name,
        articles: articles.length,
        status: 'success'
      });
      
      totalArticles += articles.length;
    } catch (error) {
      console.error(`❌ Failed to ingest from ${source.name}:`, error.message);
      
      IngestionLog.create({
        source_id: source.id,
        status: 'failure',
        articles_fetched: 0,
        error_message: error.message
      });
      
      results.push({
        source: source.name,
        articles: 0,
        status: 'failure',
        error: error.message
      });
    }
  }
  
  return { results, totalArticles };
}