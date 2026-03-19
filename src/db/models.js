import db from './database.js';

// Field whitelists for safe updates
const ALLOWED_SOURCE_FIELDS = ['name', 'url', 'rss_url', 'api_url', 'bias', 'bias_score', 'scraping_enabled', 'active', 'notes'];
const ALLOWED_ARTICLE_FIELDS = ['title', 'excerpt', 'content', 'image_url', 'bias', 'bias_score', 'sentiment_score'];

/**
 * Filter object to only include allowed fields
 */
function filterFields(updates, allowedFields) {
  const filtered = {};
  for (const key of Object.keys(updates)) {
    if (allowedFields.includes(key)) {
      filtered[key] = updates[key];
    }
  }
  return filtered;
}

export const Source = {
  getAll() {
    return db.prepare('SELECT * FROM sources WHERE active = 1').all();
  },

  getById(id) {
    return db.prepare('SELECT * FROM sources WHERE id = ?').get(id);
  },

  getByBias(bias) {
    return db.prepare('SELECT * FROM sources WHERE bias = ? AND active = 1').all(bias);
  },

  create(source) {
    const stmt = db.prepare(`
      INSERT INTO sources (name, url, rss_url, api_url, bias, bias_score, scraping_enabled, notes)
      VALUES (@name, @url, @rss_url, @api_url, @bias, @bias_score, @scraping_enabled, @notes)
    `);
    return stmt.run(source);
  },

  update(id, updates) {
    // Filter to only allowed fields
    const safeUpdates = filterFields(updates, ALLOWED_SOURCE_FIELDS);

    if (Object.keys(safeUpdates).length === 0) {
      return { changes: 0 };
    }

    const fields = Object.keys(safeUpdates).map(key => `${key} = @${key}`).join(', ');
    const stmt = db.prepare(`UPDATE sources SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`);
    return stmt.run({ ...safeUpdates, id });
  },

  delete(id) {
    const stmt = db.prepare('DELETE FROM sources WHERE id = ?');
    return stmt.run(id);
  }
};

export const Article = {
  getAll(limit = 100, offset = 0) {
    return db.prepare(`
      SELECT a.*, s.name as source_name, s.bias as source_bias
      FROM articles a
      JOIN sources s ON a.source_id = s.id
      ORDER BY a.published_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);
  },

  getById(id) {
    return db.prepare(`
      SELECT a.*, s.name as source_name, s.bias as source_bias
      FROM articles a
      JOIN sources s ON a.source_id = s.id
      WHERE a.id = ?
    `).get(id);
  },

  getUnclustered(limit = 200) {
    return db.prepare(`
      SELECT a.*, s.name as source_name, s.bias as source_bias
      FROM articles a
      JOIN sources s ON a.source_id = s.id
      WHERE a.id NOT IN (SELECT article_id FROM article_clusters)
      ORDER BY a.published_at DESC
      LIMIT ?
    `).all(limit);
  },

  getByUrl(url) {
    return db.prepare('SELECT * FROM articles WHERE url = ?').get(url);
  },

  getByCluster(clusterId) {
    return db.prepare(`
      SELECT a.*, s.name as source_name, s.bias as source_bias, ac.similarity_score
      FROM articles a
      JOIN sources s ON a.source_id = s.id
      JOIN article_clusters ac ON a.id = ac.article_id
      WHERE ac.cluster_id = ?
      ORDER BY ac.similarity_score DESC
    `).all(clusterId);
  },

  create(article) {
    const stmt = db.prepare(`
      INSERT INTO articles (
        source_id, title, url, author, published_at, excerpt, content,
        image_url, bias, bias_score, sentiment_score
      ) VALUES (
        @source_id, @title, @url, @author, @published_at, @excerpt, @content,
        @image_url, @bias, @bias_score, @sentiment_score
      )
    `);
    return stmt.run(article);
  },

  update(id, updates) {
    // Filter to only allowed fields
    const safeUpdates = filterFields(updates, ALLOWED_ARTICLE_FIELDS);

    if (Object.keys(safeUpdates).length === 0) {
      return { changes: 0 };
    }

    const fields = Object.keys(safeUpdates).map(key => `${key} = @${key}`).join(', ');
    const stmt = db.prepare(`UPDATE articles SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`);
    return stmt.run({ ...safeUpdates, id });
  },

  exists(url) {
    const result = db.prepare('SELECT COUNT(*) as count FROM articles WHERE url = ?').get(url);
    return result.count > 0;
  },

  /**
   * Search articles by keyword with optional filters.
   * Uses LIKE for full-text search on title, excerpt, and content.
   */
  search({ q, bias, source, from, to, limit = 50, offset = 0 }) {
    const conditions = [];
    const params = [];

    if (q) {
      conditions.push('(a.title LIKE ? OR a.excerpt LIKE ? OR a.content LIKE ?)');
      const pattern = `%${q}%`;
      params.push(pattern, pattern, pattern);
    }

    if (bias) {
      const biasValues = bias.split(',').map(b => b.trim());
      const placeholders = biasValues.map(() => '?').join(', ');
      conditions.push(`s.bias IN (${placeholders})`);
      params.push(...biasValues);
    }

    if (source) {
      conditions.push('s.name LIKE ?');
      params.push(`%${source}%`);
    }

    if (from) {
      conditions.push('a.published_at >= ?');
      params.push(from);
    }

    if (to) {
      conditions.push('a.published_at <= ?');
      params.push(to + 'T23:59:59.999Z');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM articles a
      JOIN sources s ON a.source_id = s.id
      ${whereClause}
    `;
    const total = db.prepare(countQuery).get(...params).total;

    // Get results
    const query = `
      SELECT a.*, s.name as source_name, s.bias as source_bias
      FROM articles a
      JOIN sources s ON a.source_id = s.id
      ${whereClause}
      ORDER BY a.published_at DESC
      LIMIT ? OFFSET ?
    `;
    params.push(limit, offset);

    const articles = db.prepare(query).all(...params);

    return { articles, total };
  },

  /**
   * Get aggregated statistics using SQL instead of loading all articles
   */
  getStats() {
    // Get article counts by bias using efficient SQL aggregation
    const biasCounts = db.prepare(`
      SELECT s.bias, COUNT(*) as count
      FROM articles a
      JOIN sources s ON a.source_id = s.id
      GROUP BY s.bias
    `).all();

    // Convert to object
    const articlesByBias = {
      left: 0,
      'center-left': 0,
      center: 0,
      'center-right': 0,
      right: 0
    };
    for (const row of biasCounts) {
      if (articlesByBias.hasOwnProperty(row.bias)) {
        articlesByBias[row.bias] = row.count;
      }
    }

    // Get total counts
    const totalArticles = db.prepare('SELECT COUNT(*) as count FROM articles').get().count;
    const totalClusters = db.prepare('SELECT COUNT(*) as count FROM clusters').get().count;
    const totalSources = db.prepare('SELECT COUNT(*) as count FROM sources').get().count;
    const activeSources = db.prepare('SELECT COUNT(*) as count FROM sources WHERE active = 1').get().count;

    // Get average cluster size
    const avgClusterSize = db.prepare(`
      SELECT COALESCE(AVG(article_count), 0) as avg_size
      FROM (
        SELECT COUNT(article_id) as article_count
        FROM article_clusters
        GROUP BY cluster_id
      )
    `).get().avg_size;

    return {
      total_articles: totalArticles,
      total_clusters: totalClusters,
      total_sources: totalSources,
      active_sources: activeSources,
      articles_by_bias: articlesByBias,
      avg_cluster_size: avgClusterSize ? parseFloat(avgClusterSize.toFixed(1)) : 0
    };
  }
};

export const Cluster = {
  getAll(limit = 50, offset = 0) {
    return db.prepare(`
      SELECT c.*, COUNT(ac.article_id) as article_count
      FROM clusters c
      LEFT JOIN article_clusters ac ON c.id = ac.cluster_id
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);
  },

  /**
   * Get all clusters with bias distribution in a single query (fixes N+1)
   */
  getAllWithBiasDistribution(limit = 50, offset = 0) {
    return db.prepare(`
      SELECT
        c.*,
        COUNT(ac.article_id) as article_count,
        SUM(CASE WHEN s.bias = 'left' THEN 1 ELSE 0 END) as left_count,
        SUM(CASE WHEN s.bias = 'center-left' THEN 1 ELSE 0 END) as center_left_count,
        SUM(CASE WHEN s.bias = 'center' THEN 1 ELSE 0 END) as center_count,
        SUM(CASE WHEN s.bias = 'center-right' THEN 1 ELSE 0 END) as center_right_count,
        SUM(CASE WHEN s.bias = 'right' THEN 1 ELSE 0 END) as right_count
      FROM clusters c
      LEFT JOIN article_clusters ac ON c.id = ac.cluster_id
      LEFT JOIN articles a ON ac.article_id = a.id
      LEFT JOIN sources s ON a.source_id = s.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);
  },

  getById(id) {
    return db.prepare('SELECT * FROM clusters WHERE id = ?').get(id);
  },

  getWithBiasDistribution(id) {
    return db.prepare(`
      SELECT
        c.*,
        COUNT(CASE WHEN s.bias = 'left' THEN 1 END) as left_count,
        COUNT(CASE WHEN s.bias = 'center-left' THEN 1 END) as center_left_count,
        COUNT(CASE WHEN s.bias = 'center' THEN 1 END) as center_count,
        COUNT(CASE WHEN s.bias = 'center-right' THEN 1 END) as center_right_count,
        COUNT(CASE WHEN s.bias = 'right' THEN 1 END) as right_count
      FROM clusters c
      JOIN article_clusters ac ON c.id = ac.cluster_id
      JOIN articles a ON ac.article_id = a.id
      JOIN sources s ON a.source_id = s.id
      WHERE c.id = ?
      GROUP BY c.id
    `).get(id);
  },

  create(cluster) {
    const stmt = db.prepare(`
      INSERT INTO clusters (title, summary, fact_core, confidence_score)
      VALUES (@title, @summary, @fact_core, @confidence_score)
    `);
    return stmt.run(cluster);
  },

  update(id, updates) {
    const allowedFields = ['title', 'summary', 'fact_core', 'confidence_score'];
    const safeUpdates = {};
    for (const key of Object.keys(updates)) {
      if (allowedFields.includes(key)) {
        safeUpdates[key] = updates[key];
      }
    }

    if (Object.keys(safeUpdates).length === 0) {
      return { changes: 0 };
    }

    const fields = Object.keys(safeUpdates).map(key => `${key} = @${key}`).join(', ');
    const stmt = db.prepare(`UPDATE clusters SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`);
    return stmt.run({ ...safeUpdates, id });
  },

  /**
   * Search clusters by keyword in title and summary.
   */
  search({ q, limit = 50, offset = 0 }) {
    const pattern = `%${q}%`;

    const total = db.prepare(`
      SELECT COUNT(*) as total FROM clusters
      WHERE title LIKE ? OR summary LIKE ? OR fact_core LIKE ?
    `).get(pattern, pattern, pattern).total;

    const clusters = db.prepare(`
      SELECT c.*, COUNT(ac.article_id) as article_count
      FROM clusters c
      LEFT JOIN article_clusters ac ON c.id = ac.cluster_id
      WHERE c.title LIKE ? OR c.summary LIKE ? OR c.fact_core LIKE ?
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `).all(pattern, pattern, pattern, limit, offset);

    return { clusters, total };
  },

  /**
   * Get clusters with bias distribution info for blindspot detection.
   * Returns all clusters with their article bias counts.
   */
  getAllWithBiasDetails() {
    return db.prepare(`
      SELECT
        c.id, c.title, c.summary, c.fact_core, c.created_at,
        COUNT(ac.article_id) as article_count,
        SUM(CASE WHEN s.bias = 'left' THEN 1 ELSE 0 END) as left_count,
        SUM(CASE WHEN s.bias = 'center-left' THEN 1 ELSE 0 END) as center_left_count,
        SUM(CASE WHEN s.bias = 'center' THEN 1 ELSE 0 END) as center_count,
        SUM(CASE WHEN s.bias = 'center-right' THEN 1 ELSE 0 END) as center_right_count,
        SUM(CASE WHEN s.bias = 'right' THEN 1 ELSE 0 END) as right_count,
        COUNT(DISTINCT a.source_id) as source_count,
        AVG(a.bias_score) as avg_bias_score
      FROM clusters c
      JOIN article_clusters ac ON c.id = ac.cluster_id
      JOIN articles a ON ac.article_id = a.id
      JOIN sources s ON a.source_id = s.id
      GROUP BY c.id
      HAVING article_count >= 1
      ORDER BY c.created_at DESC
    `).all();
  },

  addArticle(clusterId, articleId, similarityScore) {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO article_clusters (cluster_id, article_id, similarity_score)
      VALUES (?, ?, ?)
    `);
    return stmt.run(clusterId, articleId, similarityScore);
  }
};

export const Entity = {
  getByArticle(articleId) {
    return db.prepare('SELECT * FROM entities WHERE article_id = ?').all(articleId);
  },

  create(entity) {
    const stmt = db.prepare(`
      INSERT INTO entities (article_id, entity_type, entity_value, confidence)
      VALUES (@article_id, @entity_type, @entity_value, @confidence)
    `);
    return stmt.run(entity);
  },

  bulkCreate(entities) {
    const stmt = db.prepare(`
      INSERT INTO entities (article_id, entity_type, entity_value, confidence)
      VALUES (@article_id, @entity_type, @entity_value, @confidence)
    `);

    const transaction = db.transaction((entities) => {
      for (const entity of entities) {
        stmt.run(entity);
      }
    });

    return transaction(entities);
  }
};

export const Embedding = {
  get(articleId) {
    return db.prepare('SELECT * FROM embeddings WHERE article_id = ?').get(articleId);
  },

  create(articleId, embedding, modelName) {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO embeddings (article_id, embedding, model_name)
      VALUES (?, ?, ?)
    `);
    return stmt.run(articleId, Buffer.from(JSON.stringify(embedding)), modelName);
  },

  getVector(articleId) {
    const result = db.prepare('SELECT embedding FROM embeddings WHERE article_id = ?').get(articleId);
    if (result && result.embedding) {
      return JSON.parse(result.embedding.toString());
    }
    return null;
  }
};

export const IngestionLog = {
  create(log) {
    const stmt = db.prepare(`
      INSERT INTO ingestion_log (source_id, status, articles_fetched, error_message)
      VALUES (@source_id, @status, @articles_fetched, @error_message)
    `);
    return stmt.run(log);
  },

  getRecent(limit = 10) {
    return db.prepare(`
      SELECT il.*, s.name as source_name
      FROM ingestion_log il
      LEFT JOIN sources s ON il.source_id = s.id
      ORDER BY il.created_at DESC
      LIMIT ?
    `).all(limit);
  }
};
