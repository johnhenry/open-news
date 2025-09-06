import db from './database.js';

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
    const fields = Object.keys(updates).map(key => `${key} = @${key}`).join(', ');
    const stmt = db.prepare(`UPDATE sources SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`);
    return stmt.run({ ...updates, id });
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
    const fields = Object.keys(updates).map(key => `${key} = @${key}`).join(', ');
    const stmt = db.prepare(`UPDATE articles SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`);
    return stmt.run({ ...updates, id });
  },
  
  exists(url) {
    const result = db.prepare('SELECT COUNT(*) as count FROM articles WHERE url = ?').get(url);
    return result.count > 0;
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