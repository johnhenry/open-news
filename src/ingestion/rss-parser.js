import Parser from 'rss-parser';
import { Article, IngestionLog } from '../db/models.js';
import { extractContent } from './content-extractor.js';
import { getArticleAnalyzer } from '../services/article-analyzer.js';
import { Settings } from '../db/settings-model.js';

const parser = new Parser({
  customFields: {
    item: [
      ['media:content', 'media'],
      ['content:encoded', 'contentEncoded'],
      ['dc:creator', 'creator']
    ]
  }
});

export async function fetchRSSFeed(source) {
  const results = {
    success: [],
    errors: [],
    skipped: []
  };

  try {
    console.log(`📡 Fetching RSS feed for ${source.name}: ${source.rss_url}`);
    const feed = await parser.parseURL(source.rss_url);
    
    // Get analyzer instance once for this feed
    const analyzer = await getArticleAnalyzer();
    const shouldAnalyze = Settings.get('analysis_method') !== 'source_default';
    
    for (const item of feed.items) {
      try {
        if (Article.exists(item.link)) {
          results.skipped.push(item.link);
          continue;
        }

        const content = process.env.CONTENT_MODE === 'research' 
          ? await extractContent(item.link, source.scraping_enabled)
          : null;

        // Prepare basic article data
        let articleData = {
          source_id: source.id,
          title: item.title,
          url: item.link,
          author: item.creator || item.author || null,
          published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
          excerpt: item.contentSnippet || item.summary || null,
          content: content?.text || item.contentEncoded || null,
          image_url: extractImageUrl(item),
          bias: source.bias,
          bias_score: source.bias_score,
          sentiment_score: 0
        };

        // Analyze article if needed
        if (shouldAnalyze && articleData.content) {
          const analysis = await analyzer.analyzeArticle(articleData, source.bias);
          articleData.bias = analysis.bias;
          articleData.bias_score = analysis.bias_score;
          articleData.sentiment_score = analysis.sentiment_score;
        }

        const article = articleData;

        const result = Article.create(article);
        results.success.push({
          id: result.lastInsertRowid,
          title: article.title,
          url: article.url
        });

      } catch (itemError) {
        console.error(`Error processing item ${item.link}:`, itemError.message);
        results.errors.push({
          url: item.link,
          error: itemError.message
        });
      }
    }

    IngestionLog.create({
      source_id: source.id,
      status: results.errors.length === 0 ? 'success' : 'partial',
      articles_fetched: results.success.length,
      error_message: results.errors.length > 0 ? JSON.stringify(results.errors) : null
    });

  } catch (error) {
    console.error(`Failed to fetch RSS feed for ${source.name}:`, error.message);
    IngestionLog.create({
      source_id: source.id,
      status: 'failure',
      articles_fetched: 0,
      error_message: error.message
    });
    throw error;
  }

  return results;
}

function extractImageUrl(item) {
  if (item.enclosure && item.enclosure.url) {
    return item.enclosure.url;
  }
  
  if (item.media && item.media.$ && item.media.$.url) {
    return item.media.$.url;
  }
  
  if (item['media:thumbnail'] && item['media:thumbnail'].$ && item['media:thumbnail'].$.url) {
    return item['media:thumbnail'].$.url;
  }
  
  const imgMatch = item.content?.match(/<img[^>]+src="([^">]+)"/);
  if (imgMatch) {
    return imgMatch[1];
  }
  
  return null;
}

export async function fetchAllFeeds(sources) {
  const results = [];
  
  for (const source of sources) {
    if (!source.rss_url) continue;
    
    try {
      const result = await fetchRSSFeed(source);
      results.push({
        source: source.name,
        ...result
      });
    } catch (error) {
      results.push({
        source: source.name,
        error: error.message
      });
    }
  }
  
  return results;
}