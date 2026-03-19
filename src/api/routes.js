import { Article, Cluster, Source, IngestionLog } from '../db/models.js';
import { calculateClusterBiasDistribution } from '../bias/classifier.js';
import { fetchRSSFeed } from '../ingestion/rss-parser.js';
import {
  articleQuerySchema,
  clusterQuerySchema,
  idParamSchema,
  sourceBodySchema,
  createErrorResponse
} from '../middleware/validation.js';
import { ARTICLES, CLUSTERS, CACHE } from '../config/constants.js';

// Simple in-memory cache for stats
const statsCache = {
  data: null,
  timestamp: 0
};

export async function registerRoutes(fastify) {

  fastify.get('/api/health', async (request, reply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  fastify.get('/api/articles', {
    schema: {
      querystring: articleQuerySchema
    }
  }, async (request, reply) => {
    const {
      limit = ARTICLES.DEFAULT_LIMIT,
      offset = 0,
      bias,
      source_id
    } = request.query;

    // Ensure limit and offset are positive integers
    const safeLimit = Math.max(1, Math.min(parseInt(limit) || ARTICLES.DEFAULT_LIMIT, ARTICLES.MAX_LIMIT));
    const safeOffset = Math.max(0, parseInt(offset) || 0);

    // If filters are used, delegate to search which handles total counts with proper WHERE clauses
    if (bias || source_id) {
      const searchParams = { limit: safeLimit, offset: safeOffset };
      if (bias) searchParams.bias = bias;
      if (source_id) searchParams.source_id = parseInt(source_id);
      const result = Article.search(searchParams);
      return {
        articles: result.articles,
        total: result.total,
        limit: safeLimit,
        offset: safeOffset
      };
    }

    const articles = Article.getAll(safeLimit, safeOffset);
    const totalCount = Article.getCount();

    return {
      articles,
      total: totalCount,
      limit: safeLimit,
      offset: safeOffset
    };
  });

  fastify.get('/api/articles/:id', {
    schema: {
      params: idParamSchema
    }
  }, async (request, reply) => {
    const id = parseInt(request.params.id);

    if (isNaN(id) || id < 1) {
      return reply.code(400).send(createErrorResponse(
        'INVALID_ID',
        'Article ID must be a positive integer'
      ));
    }

    const article = Article.getById(id);

    if (!article) {
      return reply.code(404).send(createErrorResponse(
        'NOT_FOUND',
        'Article not found'
      ));
    }

    return article;
  });

  fastify.get('/api/clusters', {
    schema: {
      querystring: clusterQuerySchema
    }
  }, async (request, reply) => {
    const {
      limit = CLUSTERS.DEFAULT_LIMIT,
      offset = 0
    } = request.query;

    const safeLimit = Math.max(1, Math.min(parseInt(limit) || CLUSTERS.DEFAULT_LIMIT, CLUSTERS.MAX_LIMIT));
    const safeOffset = Math.max(0, parseInt(offset) || 0);

    // Use optimized batch query instead of N+1
    const clustersWithBias = Cluster.getAllWithBiasDistribution(safeLimit, safeOffset);
    const totalCount = Cluster.getCount();

    return {
      clusters: clustersWithBias.map(cluster => ({
        ...cluster,
        bias_distribution: {
          left: cluster.left_count || 0,
          'center-left': cluster.center_left_count || 0,
          center: cluster.center_count || 0,
          'center-right': cluster.center_right_count || 0,
          right: cluster.right_count || 0
        }
      })),
      total: totalCount,
      limit: safeLimit,
      offset: safeOffset
    };
  });

  // Register static cluster routes BEFORE parametric :id route
  fastify.get('/api/clusters/search', async (request, reply) => {
    const { q, limit = 50, offset = 0 } = request.query;

    if (!q) {
      return reply.code(400).send(createErrorResponse(
        'VALIDATION_ERROR',
        'Query parameter "q" is required'
      ));
    }

    const safeLimit = Math.max(1, Math.min(parseInt(limit) || 50, CLUSTERS.MAX_LIMIT));
    const safeOffset = Math.max(0, parseInt(offset) || 0);

    try {
      const result = Cluster.search({
        q,
        limit: safeLimit,
        offset: safeOffset
      });

      return {
        clusters: result.clusters,
        total: result.total,
        limit: safeLimit,
        offset: safeOffset
      };
    } catch (error) {
      request.log.error({ err: error }, 'Cluster search failed');
      return reply.code(500).send(createErrorResponse(
        'SEARCH_FAILED',
        'Failed to search clusters',
        { detail: error.message }
      ));
    }
  });

  fastify.get('/api/clusters/blindspots', async (request, reply) => {
    try {
      const clusters = Cluster.getAllWithBiasDetails();

      const blindspots = [];

      for (const cluster of clusters) {
        const total = cluster.article_count;
        if (total === 0) continue;

        const leftSide = (cluster.left_count || 0) + (cluster.center_left_count || 0);
        const rightSide = (cluster.right_count || 0) + (cluster.center_right_count || 0);

        const reasons = [];

        // Check for one-sided coverage (>80% from one side)
        if (total >= 2) {
          const leftPct = leftSide / total;
          const rightPct = rightSide / total;

          if (leftPct > 0.8) {
            reasons.push('left_dominated');
          } else if (rightPct > 0.8) {
            reasons.push('right_dominated');
          }
        }

        // Check for underreported stories (only 1-2 sources)
        if (cluster.source_count <= 2) {
          reasons.push('underreported');
        }

        // Check average bias score skew
        if (cluster.avg_bias_score !== null) {
          if (cluster.avg_bias_score < -0.3) {
            if (!reasons.includes('left_dominated')) reasons.push('left_leaning');
          } else if (cluster.avg_bias_score > 0.3) {
            if (!reasons.includes('right_dominated')) reasons.push('right_leaning');
          }
        }

        if (reasons.length > 0) {
          blindspots.push({
            cluster_id: cluster.id,
            title: cluster.title,
            summary: cluster.summary,
            article_count: total,
            source_count: cluster.source_count,
            avg_bias_score: cluster.avg_bias_score ? parseFloat(cluster.avg_bias_score.toFixed(2)) : 0,
            bias_distribution: {
              left: cluster.left_count || 0,
              'center-left': cluster.center_left_count || 0,
              center: cluster.center_count || 0,
              'center-right': cluster.center_right_count || 0,
              right: cluster.right_count || 0
            },
            blindspot_type: reasons,
            created_at: cluster.created_at
          });
        }
      }

      // Sort: most extreme blindspots first
      blindspots.sort((a, b) => {
        const aScore = a.blindspot_type.length * a.article_count;
        const bScore = b.blindspot_type.length * b.article_count;
        return bScore - aScore;
      });

      // Categorize into left/right/underreported for frontend tabs
      const left = blindspots.filter(b =>
        b.blindspot_type.includes('left_dominated') || b.blindspot_type.includes('left_leaning')
      );
      const right = blindspots.filter(b =>
        b.blindspot_type.includes('right_dominated') || b.blindspot_type.includes('right_leaning')
      );
      const underreported = blindspots.filter(b =>
        b.blindspot_type.includes('underreported')
      );

      return {
        left,
        right,
        underreported,
        blindspots,
        total: blindspots.length
      };
    } catch (error) {
      request.log.error({ err: error }, 'Blindspot detection failed');
      return reply.code(500).send(createErrorResponse(
        'BLINDSPOT_FAILED',
        'Failed to detect coverage blindspots',
        { detail: error.message }
      ));
    }
  });

  fastify.get('/api/clusters/:id', {
    schema: {
      params: idParamSchema
    }
  }, async (request, reply) => {
    const clusterId = parseInt(request.params.id);

    if (isNaN(clusterId) || clusterId < 1) {
      return reply.code(400).send(createErrorResponse(
        'INVALID_ID',
        'Cluster ID must be a positive integer'
      ));
    }

    const cluster = Cluster.getById(clusterId);

    if (!cluster) {
      return reply.code(404).send(createErrorResponse(
        'NOT_FOUND',
        'Cluster not found'
      ));
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

  fastify.get('/api/clusters/:id/headlines', {
    schema: {
      params: idParamSchema
    }
  }, async (request, reply) => {
    const clusterId = parseInt(request.params.id);

    if (isNaN(clusterId) || clusterId < 1) {
      return reply.code(400).send(createErrorResponse(
        'INVALID_ID',
        'Cluster ID must be a positive integer'
      ));
    }

    const cluster = Cluster.getById(clusterId);

    if (!cluster) {
      return reply.code(404).send(createErrorResponse(
        'NOT_FOUND',
        'Cluster not found'
      ));
    }

    const articles = Article.getByCluster(clusterId);

    if (articles.length === 0) {
      return reply.code(404).send(createErrorResponse(
        'NOT_FOUND',
        'Cluster has no articles'
      ));
    }

    // Group headlines by bias category
    const headlines = {
      left: [],
      'center-left': [],
      center: [],
      'center-right': [],
      right: []
    };

    for (const article of articles) {
      const biasCategory = article.source_bias || 'center';
      if (headlines[biasCategory]) {
        headlines[biasCategory].push({
          id: article.id,
          source: article.source_name,
          title: article.title,
          bias_score: article.bias_score,
          published_at: article.published_at,
          url: article.url
        });
      }
    }

    return {
      cluster_id: clusterId,
      cluster_title: cluster.title,
      left: headlines.left,
      'center-left': headlines['center-left'],
      center: headlines.center,
      'center-right': headlines['center-right'],
      right: headlines.right,
      total_articles: articles.length
    };
  });

  fastify.get('/api/clusters/:id/compare', {
    schema: {
      params: idParamSchema
    }
  }, async (request, reply) => {
    const clusterId = parseInt(request.params.id);

    if (isNaN(clusterId) || clusterId < 1) {
      return reply.code(400).send(createErrorResponse(
        'INVALID_ID',
        'Cluster ID must be a positive integer'
      ));
    }

    const articles = Article.getByCluster(clusterId);

    if (articles.length === 0) {
      return reply.code(404).send(createErrorResponse(
        'NOT_FOUND',
        'Cluster not found or has no articles'
      ));
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

  fastify.get('/api/sources/:id', {
    schema: {
      params: idParamSchema
    }
  }, async (request, reply) => {
    const id = parseInt(request.params.id);

    if (isNaN(id) || id < 1) {
      return reply.code(400).send(createErrorResponse(
        'INVALID_ID',
        'Source ID must be a positive integer'
      ));
    }

    const source = Source.getById(id);

    if (!source) {
      return reply.code(404).send(createErrorResponse(
        'NOT_FOUND',
        'Source not found'
      ));
    }

    return source;
  });

  fastify.post('/api/sources', {
    schema: {
      body: sourceBodySchema
    }
  }, async (request, reply) => {
    const { name, url, rss_url, api_url, bias, bias_score, scraping_enabled, notes } = request.body;

    if (!name || !url || !bias) {
      return reply.code(400).send(createErrorResponse(
        'VALIDATION_ERROR',
        'Name, URL, and bias are required'
      ));
    }

    try {
      const result = Source.create({
        name,
        url,
        rss_url: rss_url || null,
        api_url: api_url || null,
        bias,
        bias_score: bias_score || 0,
        scraping_enabled: scraping_enabled ? 1 : 0,
        notes: notes || null
      });

      return {
        id: result.lastInsertRowid,
        message: 'Source created successfully'
      };
    } catch (error) {
      request.log.error({ err: error }, 'Failed to create source');
      return reply.code(500).send(createErrorResponse(
        'CREATE_FAILED',
        'Failed to create source',
        { detail: error.message }
      ));
    }
  });

  fastify.post('/api/ingest', async (request, reply) => {
    const { source_id } = request.body || {};

    try {
      let sources;

      if (source_id) {
        const id = parseInt(source_id);
        if (isNaN(id) || id < 1) {
          return reply.code(400).send(createErrorResponse(
            'INVALID_ID',
            'Source ID must be a positive integer'
          ));
        }

        const source = Source.getById(id);
        if (!source) {
          return reply.code(404).send(createErrorResponse(
            'NOT_FOUND',
            'Source not found'
          ));
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
          request.log.error({ err: error, source: source.name }, 'Ingestion failed for source');
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
      request.log.error({ err: error }, 'Ingestion failed');
      return reply.code(500).send(createErrorResponse(
        'INGESTION_FAILED',
        'Failed to run ingestion',
        { detail: error.message }
      ));
    }
  });

  fastify.get('/api/ingestion/logs', async (request, reply) => {
    const { limit = 20 } = request.query;
    const safeLimit = Math.max(1, Math.min(parseInt(limit) || 20, 100));
    const logs = IngestionLog.getRecent(safeLimit);

    return {
      logs,
      total: logs.length
    };
  });

  // ===== Search Endpoints =====

  fastify.get('/api/search', async (request, reply) => {
    const {
      q,
      bias,
      source,
      source_id,
      from,
      to,
      limit = 50,
      offset = 0
    } = request.query;

    if (!q && !bias && !source && !source_id && !from && !to) {
      return reply.code(400).send(createErrorResponse(
        'VALIDATION_ERROR',
        'At least one search parameter is required'
      ));
    }

    const safeLimit = Math.max(1, Math.min(parseInt(limit) || 50, ARTICLES.MAX_LIMIT));
    const safeOffset = Math.max(0, parseInt(offset) || 0);

    try {
      const result = Article.search({
        q,
        bias,
        source,
        source_id: source_id ? parseInt(source_id) : undefined,
        from,
        to,
        limit: safeLimit,
        offset: safeOffset
      });

      return {
        articles: result.articles,
        total: result.total,
        limit: safeLimit,
        offset: safeOffset
      };
    } catch (error) {
      request.log.error({ err: error }, 'Search failed');
      return reply.code(500).send(createErrorResponse(
        'SEARCH_FAILED',
        'Failed to search articles',
        { detail: error.message }
      ));
    }
  });

  // ===== Stats =====

  fastify.get('/api/stats', async (request, reply) => {
    // Check cache
    const now = Date.now();
    if (statsCache.data && (now - statsCache.timestamp) < CACHE.STATS_TTL_MS) {
      return statsCache.data;
    }

    try {
      // Use optimized SQL aggregation instead of loading all articles
      const stats = Article.getStats();

      // Update cache
      statsCache.data = stats;
      statsCache.timestamp = now;

      return stats;
    } catch (error) {
      request.log.error({ err: error }, 'Failed to get stats');
      return reply.code(500).send(createErrorResponse(
        'STATS_FAILED',
        'Failed to retrieve statistics'
      ));
    }
  });
}
