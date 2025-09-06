-- News sources table
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  rss_url TEXT,
  api_url TEXT,
  bias TEXT CHECK(bias IN ('left', 'center-left', 'center', 'center-right', 'right')) NOT NULL,
  bias_score REAL DEFAULT 0,
  scraping_enabled BOOLEAN DEFAULT 0,
  active BOOLEAN DEFAULT 1,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Articles table
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  author TEXT,
  published_at DATETIME,
  excerpt TEXT,
  content TEXT,
  image_url TEXT,
  bias TEXT,
  bias_score REAL,
  sentiment_score REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_id) REFERENCES sources(id)
);

-- Article clusters table
CREATE TABLE IF NOT EXISTS clusters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  summary TEXT,
  fact_core TEXT,
  confidence_score REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Article to cluster mapping
CREATE TABLE IF NOT EXISTS article_clusters (
  article_id INTEGER NOT NULL,
  cluster_id INTEGER NOT NULL,
  similarity_score REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (article_id, cluster_id),
  FOREIGN KEY (article_id) REFERENCES articles(id),
  FOREIGN KEY (cluster_id) REFERENCES clusters(id)
);

-- Entities extracted from articles
CREATE TABLE IF NOT EXISTS entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL,
  entity_type TEXT,
  entity_value TEXT,
  confidence REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (article_id) REFERENCES articles(id)
);

-- Article embeddings for clustering
CREATE TABLE IF NOT EXISTS embeddings (
  article_id INTEGER PRIMARY KEY,
  embedding BLOB,
  model_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (article_id) REFERENCES articles(id)
);

-- Ingestion history
CREATE TABLE IF NOT EXISTS ingestion_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER,
  status TEXT CHECK(status IN ('success', 'failure', 'partial')),
  articles_fetched INTEGER DEFAULT 0,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_id) REFERENCES sources(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_source_id ON articles(source_id);
CREATE INDEX IF NOT EXISTS idx_article_clusters_cluster_id ON article_clusters(cluster_id);
CREATE INDEX IF NOT EXISTS idx_entities_article_id ON entities(article_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_log_source_id ON ingestion_log(source_id);