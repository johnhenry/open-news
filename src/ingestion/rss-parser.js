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

// Rate limit: max articles to LLM-analyze per ingestion cycle (-1 = unlimited)
function getLLMAnalysisRateLimit() {
  const val = parseInt(Settings.get('llm_analysis_rate_limit') || process.env.getLLMAnalysisRateLimit() || '5');
  return val === -1 ? Infinity : val;
}

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
    const analysisMethod = Settings.get('analysis_method') || 'source_default';
    const shouldAnalyze = analysisMethod !== 'source_default';
    const useLLM = analysisMethod === 'llm';

    // Track articles needing async LLM analysis
    const articlesForLLMAnalysis = [];

    for (const item of feed.items) {
      try {
        if (Article.exists(item.link)) {
          results.skipped.push(item.link);
          continue;
        }

        let contentMode;
        try { contentMode = Settings.get('content_mode') || process.env.CONTENT_MODE || 'safe'; }
        catch { contentMode = process.env.CONTENT_MODE || 'safe'; }
        const content = contentMode === 'research'
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

        // For keyword analysis, do it synchronously (fast)
        if (shouldAnalyze && !useLLM && articleData.content) {
          const analysis = await analyzer.analyzeArticle(articleData, source.bias);
          articleData.bias = analysis.bias;
          articleData.bias_score = analysis.bias_score;
          articleData.sentiment_score = analysis.sentiment_score;
        }

        const article = articleData;

        const result = Article.create(article);
        const articleId = result.lastInsertRowid;
        results.success.push({
          id: articleId,
          title: article.title,
          url: article.url
        });

        // Queue for async LLM analysis if conditions met
        if (useLLM && contentMode === 'research' && articleData.content && articlesForLLMAnalysis.length < getLLMAnalysisRateLimit()) {
          articlesForLLMAnalysis.push({
            id: articleId,
            ...articleData
          });
        }

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

    // Fire off async LLM analysis (non-blocking)
    if (articlesForLLMAnalysis.length > 0) {
      runAsyncLLMAnalysis(articlesForLLMAnalysis, analyzer, source.bias).catch(err => {
        console.error('Async LLM analysis failed:', err.message);
      });
    }

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

/**
 * Run LLM bias analysis asynchronously after ingestion completes.
 * Processes articles sequentially to avoid overwhelming the LLM.
 */
async function runAsyncLLMAnalysis(articles, analyzer, sourceDefaultBias) {
  console.log(`🤖 Starting async LLM analysis for ${articles.length} articles (rate limit: ${getLLMAnalysisRateLimit()})`);

  let analyzed = 0;
  for (const article of articles) {
    try {
      const analysis = await analyzer.llmAnalysis(article);
      if (analysis) {
        Article.update(article.id, {
          bias: analysis.bias,
          bias_score: analysis.bias_score,
          sentiment_score: analysis.sentiment_score
        });
        analyzed++;
        console.log(`  ✅ LLM analyzed: "${article.title.substring(0, 50)}..." → bias: ${analysis.bias_score}`);
      }
    } catch (err) {
      console.error(`  ❌ LLM analysis failed for article ${article.id}:`, err.message);
    }
  }

  console.log(`🤖 Async LLM analysis complete: ${analyzed}/${articles.length} articles analyzed`);
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