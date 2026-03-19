/**
 * Application constants and magic numbers
 * Centralized configuration for easy maintenance
 */

// Pagination defaults
export const PAGINATION = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 500,
  DEFAULT_OFFSET: 0
};

// Article-specific limits
export const ARTICLES = {
  DEFAULT_LIMIT: 100,
  MAX_LIMIT: 500,
  STATS_LIMIT: 1000,
  EXCERPT_LENGTH: 500,
  TITLE_MAX_LENGTH: 500
};

// Cluster-specific limits
export const CLUSTERS = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 200,
  STATS_LIMIT: 100
};

// Clustering algorithm parameters
export const CLUSTERING = {
  DEFAULT_SIMILARITY_THRESHOLD: 0.7,
  MIN_SIMILARITY_THRESHOLD: 0.3,
  MAX_SIMILARITY_THRESHOLD: 0.95,
  MIN_CLUSTER_SIZE: 2,
  MAX_ARTICLES_PER_RUN: 1000,
  EMBEDDING_BATCH_SIZE: 50
};

// Bias classification
export const BIAS = {
  VALUES: ['left', 'center-left', 'center', 'center-right', 'right'],
  DEFAULT_SCORE: 0
};

// Cache settings
export const CACHE = {
  STATS_TTL_MS: 60000,  // 60 seconds
  LLM_TTL_MS: 3600000,  // 1 hour
  DEFAULT_MAX_ENTRIES: 1000
};

// Rate limiting
export const RATE_LIMIT = {
  MAX_REQUESTS: 100,
  TIME_WINDOW_MS: 60000  // 1 minute
};

// Request timeouts
export const TIMEOUTS = {
  REQUEST_MS: 30000,
  KEEP_ALIVE_MS: 72000,
  LLM_REQUEST_MS: 60000,
  RSS_FETCH_MS: 30000
};

// Content limits
export const CONTENT = {
  MAX_BODY_SIZE: 1024 * 1024,  // 1MB
  MAX_URL_LENGTH: 2048,
  MAX_NOTES_LENGTH: 5000
};

// Database
export const DATABASE = {
  WAL_MODE: true,
  FOREIGN_KEYS: true,
  BUSY_TIMEOUT_MS: 5000
};

// Environment-based settings
export const ENV = {
  isDevelopment: process.env.NODE_ENV !== 'production',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test'
};
