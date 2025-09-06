import { Article, Cluster, Source, IngestionLog } from '../db/models.js';
import { calculateClusterBiasDistribution } from '../bias/classifier.js';
import { fetchRSSFeed } from '../ingestion/rss-parser.js';

export async function registerRoutes(fastify) {
  
  fastify.get('/api/health', async (request, reply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  fastify.get('/api/articles', async (request, reply) => {
    const { limit = 100, offset = 0, bias, source_id } = request.query;
    
    let articles = Article.getAll(limit, offset);
    
    if (bias) {
      articles = articles.filter(a => a.source_bias === bias);
    }
    
    if (source_id) {
      articles = articles.filter(a => a.source_id === parseInt(source_id));
    }
    
    return {
      articles,
      total: articles.length,
      limit,
      offset
    };
  });

  fastify.get('/api/articles/:id', async (request, reply) => {
    const article = Article.getById(parseInt(request.params.id));
    
    if (!article) {
      reply.code(404).send({ error: 'Article not found' });
      return;
    }
    
    return article;
  });

  fastify.get('/api/clusters', async (request, reply) => {
    const { limit = 50, offset = 0 } = request.query;
    
    const clusters = Cluster.getAll(limit, offset);
    
    const clustersWithBias = clusters.map(cluster => {
      const biasData = Cluster.getWithBiasDistribution(cluster.id);
      return {
        ...cluster,
        bias_distribution: {
          left: biasData?.left_count || 0,
          'center-left': biasData?.center_left_count || 0,
          center: biasData?.center_count || 0,
          'center-right': biasData?.center_right_count || 0,
          right: biasData?.right_count || 0
        }
      };
    });
    
    return {
      clusters: clustersWithBias,
      total: clustersWithBias.length,
      limit,
      offset
    };
  });

  fastify.get('/api/clusters/:id', async (request, reply) => {
    const clusterId = parseInt(request.params.id);
    const cluster = Cluster.getById(clusterId);
    
    if (!cluster) {
      reply.code(404).send({ error: 'Cluster not found' });
      return;
    }
    
    const articles = Article.getByCluster(clusterId);
    const biasDistribution = calculateClusterBiasDistribution(articles);
    const biasData = Cluster.getWithBiasDistribution(clusterId);
    
    return {
      ...cluster,
      articles,
      bias_distribution: biasDistribution,
      article_counts: {
        left: biasData?.left_count || 0,
        'center-left': biasData?.center_left_count || 0,
        center: biasData?.center_count || 0,
        'center-right': biasData?.center_right_count || 0,
        right: biasData?.right_count || 0
      }
    };
  });

  fastify.get('/api/clusters/:id/compare', async (request, reply) => {
    const clusterId = parseInt(request.params.id);
    const articles = Article.getByCluster(clusterId);
    
    if (articles.length === 0) {
      reply.code(404).send({ error: 'Cluster not found' });
      return;
    }
    
    const groupedByBias = {
      left: [],
      'center-left': [],
      center: [],
      'center-right': [],
      right: []
    };
    
    articles.forEach(article => {
      if (groupedByBias[article.source_bias]) {
        groupedByBias[article.source_bias].push(article);
      }
    });
    
    return {
      cluster_id: clusterId,
      comparisons: groupedByBias,
      total_articles: articles.length
    };
  });

  fastify.get('/api/sources', async (request, reply) => {
    const sources = Source.getAll();
    
    const grouped = {
      left: [],
      'center-left': [],
      center: [],
      'center-right': [],
      right: []
    };
    
    sources.forEach(source => {
      if (grouped[source.bias]) {
        grouped[source.bias].push(source);
      }
    });
    
    return {
      sources,
      by_bias: grouped,
      total: sources.length
    };
  });

  fastify.get('/api/sources/:id', async (request, reply) => {
    const source = Source.getById(parseInt(request.params.id));
    
    if (!source) {
      reply.code(404).send({ error: 'Source not found' });
      return;
    }
    
    return source;
  });

  fastify.post('/api/sources', async (request, reply) => {
    const { name, url, rss_url, api_url, bias, bias_score, scraping_enabled, notes } = request.body;
    
    if (!name || !url || !bias) {
      reply.code(400).send({ error: 'Name, URL, and bias are required' });
      return;
    }
    
    try {
      const result = Source.create({
        name,
        url,
        rss_url: rss_url || null,
        api_url: api_url || null,
        bias,
        bias_score: bias_score || 0,
        scraping_enabled: scraping_enabled || false,
        notes: notes || null
      });
      
      return {
        id: result.lastInsertRowid,
        message: 'Source created successfully'
      };
    } catch (error) {
      reply.code(500).send({ error: error.message });
    }
  });

  fastify.post('/api/ingest', async (request, reply) => {
    const { source_id } = request.body;
    
    try {
      let sources;
      
      if (source_id) {
        const source = Source.getById(source_id);
        if (!source) {
          reply.code(404).send({ error: 'Source not found' });
          return;
        }
        sources = [source];
      } else {
        sources = Source.getAll();
      }
      
      const results = [];
      for (const source of sources) {
        if (!source.rss_url) continue;
        
        try {
          const result = await fetchRSSFeed(source);
          results.push({
            source: source.name,
            status: 'success',
            ...result
          });
        } catch (error) {
          results.push({
            source: source.name,
            status: 'error',
            error: error.message
          });
        }
      }
      
      return {
        message: 'Ingestion completed',
        results
      };
    } catch (error) {
      reply.code(500).send({ error: error.message });
    }
  });

  fastify.get('/api/ingestion/logs', async (request, reply) => {
    const { limit = 20 } = request.query;
    const logs = IngestionLog.getRecent(limit);
    
    return {
      logs,
      total: logs.length
    };
  });

  fastify.get('/api/stats', async (request, reply) => {
    const articles = Article.getAll(1000, 0);
    const clusters = Cluster.getAll(100, 0);
    const sources = Source.getAll();
    
    const biasCount = {
      left: 0,
      'center-left': 0,
      center: 0,
      'center-right': 0,
      right: 0
    };
    
    articles.forEach(article => {
      if (biasCount.hasOwnProperty(article.source_bias)) {
        biasCount[article.source_bias]++;
      }
    });
    
    return {
      total_articles: articles.length,
      total_clusters: clusters.length,
      total_sources: sources.length,
      active_sources: sources.filter(s => s.active).length,
      articles_by_bias: biasCount,
      avg_cluster_size: clusters.length > 0 
        ? (clusters.reduce((sum, c) => sum + c.article_count, 0) / clusters.length).toFixed(1)
        : 0
    };
  });
}