-- Settings table for configuration management
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  type TEXT CHECK(type IN ('string', 'number', 'boolean', 'json')) DEFAULT 'string',
  category TEXT,
  description TEXT,
  default_value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT DEFAULT 'default',
  preference_key TEXT NOT NULL,
  preference_value TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, preference_key)
);

-- Source management enhancements
ALTER TABLE sources ADD COLUMN IF NOT EXISTS custom_config TEXT;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS last_successful_ingest DATETIME;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS error_count INTEGER DEFAULT 0;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;

-- LLM analysis cache
CREATE TABLE IF NOT EXISTS llm_analysis_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL,
  analysis_type TEXT CHECK(analysis_type IN ('bias', 'facts', 'summary')),
  adapter_used TEXT,
  result TEXT,
  confidence REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (article_id) REFERENCES articles(id),
  UNIQUE(article_id, analysis_type)
);

-- Scheduled jobs configuration
CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_name TEXT NOT NULL UNIQUE,
  enabled BOOLEAN DEFAULT 1,
  cron_expression TEXT,
  last_run DATETIME,
  next_run DATETIME,
  status TEXT,
  config TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Default settings
INSERT OR IGNORE INTO settings (key, value, type, category, description, default_value) VALUES
  -- LLM Settings
  ('llm_enabled', 'true', 'boolean', 'llm', 'Enable LLM features', 'true'),
  ('llm_adapter', 'ollama', 'string', 'llm', 'Active LLM adapter', 'ollama'),
  ('llm_auto_analyze', 'false', 'boolean', 'llm', 'Automatically analyze new articles', 'false'),
  ('llm_confidence_threshold', '0.7', 'number', 'llm', 'Minimum confidence for LLM results', '0.7'),
  ('llm_cache_ttl', '86400', 'number', 'llm', 'Cache TTL in seconds', '86400'),
  
  -- Ingestion Settings
  ('ingestion_enabled', 'true', 'boolean', 'ingestion', 'Enable automatic ingestion', 'true'),
  ('ingestion_interval', '*/15 * * * *', 'string', 'ingestion', 'Cron expression for ingestion', '*/15 * * * *'),
  ('clustering_enabled', 'true', 'boolean', 'ingestion', 'Enable automatic clustering', 'true'),
  ('clustering_interval', '*/30 * * * *', 'string', 'ingestion', 'Cron expression for clustering', '*/30 * * * *'),
  ('min_cluster_size', '2', 'number', 'ingestion', 'Minimum articles for cluster', '2'),
  ('similarity_threshold', '0.7', 'number', 'ingestion', 'Similarity threshold for clustering', '0.7'),
  
  -- Data Management
  ('article_retention_days', '30', 'number', 'data', 'Days to keep articles', '30'),
  ('max_articles_per_source', '1000', 'number', 'data', 'Maximum articles per source', '1000'),
  ('auto_cleanup_enabled', 'false', 'boolean', 'data', 'Enable automatic cleanup', 'false'),
  ('database_backup_enabled', 'false', 'boolean', 'data', 'Enable automatic backups', 'false'),
  
  -- Content Settings
  ('content_mode', 'safe', 'string', 'content', 'Content mode (safe/research)', 'safe'),
  ('content_filter_enabled', 'true', 'boolean', 'content', 'Enable content filtering', 'true'),
  ('max_article_length', '10000', 'number', 'content', 'Maximum article length', '10000'),
  
  -- Display Settings
  ('articles_per_page', '20', 'number', 'display', 'Articles per page', '20'),
  ('default_bias_view', 'all', 'string', 'display', 'Default bias filter', 'all'),
  ('show_confidence_scores', 'true', 'boolean', 'display', 'Show LLM confidence scores', 'true'),
  ('date_format', 'relative', 'string', 'display', 'Date format (relative/absolute)', 'relative');

-- Default scheduled jobs
INSERT OR IGNORE INTO scheduled_jobs (job_name, enabled, cron_expression, status) VALUES 
  ('ingestion', 1, '*/15 * * * *', 'idle'),
  ('clustering', 1, '*/30 * * * *', 'idle');

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category);
CREATE INDEX IF NOT EXISTS idx_llm_cache_article ON llm_analysis_cache(article_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_enabled ON scheduled_jobs(enabled);