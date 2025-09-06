import * as cheerio from 'cheerio';
import fetch from 'node-fetch';

export async function extractContent(url, useScraperPlugin = false) {
  if (useScraperPlugin) {
    const scraperModule = await loadScraperPlugin(url);
    if (scraperModule) {
      return await scraperModule.scrape(url);
    }
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OpenNews/1.0; +https://github.com/open-news)'
      },
      timeout: 10000
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    $('script, style, nav, header, footer, aside, .advertisement, .ads').remove();

    const selectors = [
      'article',
      '[role="main"]',
      '.article-content',
      '.entry-content',
      '.post-content',
      '.story-body',
      'main'
    ];

    let content = '';
    for (const selector of selectors) {
      const element = $(selector);
      if (element.length > 0) {
        content = element.text().trim();
        if (content.length > 100) break;
      }
    }

    if (!content) {
      content = $('body').text().trim();
    }

    content = content
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const maxLength = parseInt(process.env.MAX_ARTICLE_LENGTH || '10000');
    if (content.length > maxLength) {
      content = content.substring(0, maxLength) + '...';
    }

    return {
      text: content,
      title: $('title').text() || $('h1').first().text(),
      author: extractAuthor($),
      publishedAt: extractPublishedDate($)
    };

  } catch (error) {
    console.error(`Failed to extract content from ${url}:`, error.message);
    return null;
  }
}

function extractAuthor($) {
  const selectors = [
    '[rel="author"]',
    '.author',
    '.by-author',
    '.byline',
    '[itemprop="author"]',
    'meta[name="author"]'
  ];

  for (const selector of selectors) {
    const element = $(selector);
    if (element.length > 0) {
      if (element.is('meta')) {
        return element.attr('content');
      }
      return element.text().trim().replace(/^by\s+/i, '');
    }
  }

  return null;
}

function extractPublishedDate($) {
  const selectors = [
    'time[datetime]',
    '[itemprop="datePublished"]',
    'meta[property="article:published_time"]',
    'meta[name="publish_date"]',
    '.publish-date',
    '.date'
  ];

  for (const selector of selectors) {
    const element = $(selector);
    if (element.length > 0) {
      const dateStr = element.attr('datetime') || 
                     element.attr('content') || 
                     element.text().trim();
      try {
        return new Date(dateStr).toISOString();
      } catch (e) {
        continue;
      }
    }
  }

  return null;
}

async function loadScraperPlugin(url) {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    const pluginPath = `../../plugins/scrapers/${domain}.mjs`;
    
    try {
      const module = await import(pluginPath);
      return module;
    } catch (e) {
      return null;
    }
  } catch (error) {
    return null;
  }
}