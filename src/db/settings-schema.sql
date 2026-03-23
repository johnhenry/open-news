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
  ('analysis_method', 'source_default', 'string', 'llm', 'Article analysis method (source_default, keyword, llm)', 'source_default'),
  ('llm_analysis_rate_limit', '-1', 'number', 'llm', 'Max articles to LLM-analyze per ingestion cycle (-1 = unlimited)', '-1'),
  ('llm_cluster_summary_rate_limit', '-1', 'number', 'llm', 'Max clusters to LLM-summarize per cycle (-1 = unlimited)', '-1'),
  ('llm_prompt_bias_detection', 'Analyze the following news article for political bias. Consider:
1. Language tone and emotional words
2. Source selection and quotes
3. Framing of issues
4. Missing perspectives
5. Headlines vs content alignment

Article: {article}

Provide a JSON response with:
{
  "bias_score": -1.0 to 1.0 (-1 = far left, 0 = center, 1 = far right),
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation",
  "indicators": ["list", "of", "bias", "indicators", "found"]
}', 'string', 'llm', 'Prompt for bias detection analysis', 'Analyze the following news article for political bias. Consider:
1. Language tone and emotional words
2. Source selection and quotes
3. Framing of issues
4. Missing perspectives
5. Headlines vs content alignment

Article: {article}

Provide a JSON response with:
{
  "bias_score": -1.0 to 1.0 (-1 = far left, 0 = center, 1 = far right),
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation",
  "indicators": ["list", "of", "bias", "indicators", "found"]
}'),
  ('llm_prompt_fact_extraction', 'Extract key factual claims from this news article. Focus on:
1. Statistical claims with numbers
2. Quoted statements from officials
3. Event descriptions (who, what, when, where)
4. Cause-effect claims
5. Policy or legal facts

Article: {article}

Provide a JSON response with:
{
  "facts": [
    {
      "claim": "the factual claim",
      "type": "statistic|quote|event|cause-effect|policy",
      "confidence": 0.0 to 1.0,
      "source": "who made this claim if mentioned"
    }
  ],
  "entities": {
    "people": ["list of people mentioned"],
    "organizations": ["list of organizations"],
    "locations": ["list of locations"],
    "dates": ["list of dates/times mentioned"]
  }
}', 'string', 'llm', 'Prompt for fact extraction', 'Extract key factual claims from this news article. Focus on:
1. Statistical claims with numbers
2. Quoted statements from officials
3. Event descriptions (who, what, when, where)
4. Cause-effect claims
5. Policy or legal facts

Article: {article}

Provide a JSON response with:
{
  "facts": [
    {
      "claim": "the factual claim",
      "type": "statistic|quote|event|cause-effect|policy",
      "confidence": 0.0 to 1.0,
      "source": "who made this claim if mentioned"
    }
  ],
  "entities": {
    "people": ["list of people mentioned"],
    "organizations": ["list of organizations"],
    "locations": ["list of locations"],
    "dates": ["list of dates/times mentioned"]
  }
}'),
  ('llm_prompt_consensus_summary', 'Given multiple articles about the same topic, identify consensus facts that appear across different sources.

Articles:
{articles}

Provide a JSON response with:
{
  "consensus_facts": ["facts that appear in multiple sources"],
  "disputed_points": ["facts that sources disagree on"],
  "unique_angles": {
    "left": ["unique points from left sources"],
    "center": ["unique points from center sources"],
    "right": ["unique points from right sources"]
  }
}', 'string', 'llm', 'Prompt for consensus summary', 'Given multiple articles about the same topic, identify consensus facts that appear across different sources.

Articles:
{articles}

Provide a JSON response with:
{
  "consensus_facts": ["facts that appear in multiple sources"],
  "disputed_points": ["facts that sources disagree on"],
  "unique_angles": {
    "left": ["unique points from left sources"],
    "center": ["unique points from center sources"],
    "right": ["unique points from right sources"]
  }
}'),
  ('llm_prompt_cluster_summary', 'You are summarizing a news story cluster. Given the following articles about the same topic, generate:
1. A concise, descriptive title for this story (max 80 chars)
2. A 2-3 sentence summary of the overall story
3. A "fact core" — the key facts that all sources agree on

Articles:
{articles}

Provide a JSON response with:
{
  "title": "A descriptive title for this story",
  "summary": "2-3 sentence summary of the story across all sources.",
  "fact_core": "The key facts all sources agree on, stated neutrally."
}', 'string', 'llm', 'Prompt for cluster summary generation', 'You are summarizing a news story cluster. Given the following articles about the same topic, generate:
1. A concise, descriptive title for this story (max 80 chars)
2. A 2-3 sentence summary of the overall story
3. A "fact core" — the key facts that all sources agree on

Articles:
{articles}

Provide a JSON response with:
{
  "title": "A descriptive title for this story",
  "summary": "2-3 sentence summary of the story across all sources.",
  "fact_core": "The key facts all sources agree on, stated neutrally."
}'),

  -- Ingestion Settings
  ('ingestion_enabled', 'true', 'boolean', 'ingestion', 'Enable automatic ingestion', 'true'),
  ('ingestion_interval', '*/15 * * * *', 'string', 'ingestion', 'Cron expression for ingestion', '*/15 * * * *'),
  ('clustering_enabled', 'true', 'boolean', 'ingestion', 'Enable automatic clustering', 'true'),
  ('clustering_interval', '10 * * * *', 'string', 'ingestion', 'Cron expression for clustering', '*/30 * * * *'),
  ('min_cluster_size', '3', 'number', 'ingestion', 'Minimum articles for cluster', '3'),
  ('similarity_threshold', '0.5', 'number', 'ingestion', 'Similarity threshold for clustering', '0.5'),
  
  -- Data Management
  ('article_retention_days', '30', 'number', 'data', 'Days to keep articles', '30'),
  ('max_articles_per_source', '1000', 'number', 'data', 'Maximum articles per source', '1000'),
  ('auto_cleanup_enabled', 'false', 'boolean', 'data', 'Enable automatic cleanup', 'false'),
  ('database_backup_enabled', 'false', 'boolean', 'data', 'Enable automatic backups', 'false'),
  ('backup_location', './backups', 'string', 'data', 'Backup directory location', './backups'),
  
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
  ('clustering', 1, '*/30 * * * *', 'idle'),
  ('backup', 0, '0 2 * * *', 'idle'),
  ('cleanup', 0, '0 3 * * *', 'idle');

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category);
CREATE INDEX IF NOT EXISTS idx_llm_cache_article ON llm_analysis_cache(article_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_enabled ON scheduled_jobs(enabled);