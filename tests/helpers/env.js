// Runs before each test file: every test file gets its own throwaway SQLite
// database, so tests never touch ./data or a real DB_PATH.
import os from 'os';
import fs from 'fs';
import path from 'path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'open-news-test-'));
process.env.DB_PATH = path.join(dir, 'test.db');
process.env.NODE_ENV = 'test';
for (const k of [
  'LLM_BASE_URL', 'LLM_MODEL', 'LLM_API_KEY', 'LLM_TIMEOUT_MS', 'LLM_MAX_CONCURRENCY',
  'LLM_QUEUE_MAX', 'LLM_JSON_MODE', 'EMBEDDINGS_BASE_URL', 'EMBEDDINGS_MODEL',
  'EMBEDDINGS_API_KEY', 'ALLOW_ARTICLE_CLEANUP', 'LLM_ADAPTER', 'OLLAMA_BASE_URL',
  'OLLAMA_MODEL', 'OPENAI_BASE_URL', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'OLLAMA_API_KEY',
  'LLM_ANALYSIS_RATE_LIMIT', 'LLM_CLUSTER_SUMMARY_RATE_LIMIT', 'GIT_REV'
]) delete process.env[k];
