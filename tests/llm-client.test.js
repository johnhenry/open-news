import { jest } from '@jest/globals';
import { startStub, json } from './helpers/stub-server.js';
import { setupDb, addSource } from './helpers/db.js';

const db = setupDb();
const { default: LLMManager } = await import('../src/llm/manager.js');
const { LLM_CONFIG } = await import('../src/llm/config.js');
const { ArticleAnalyzer } = await import('../src/services/article-analyzer.js');
const { Article } = await import('../src/db/models.js');
const { analyzeSingleArticle } = await import('../src/ingestion/rss-parser.js');
const { runCleanup } = await import('../src/jobs/cleanup.js');

const GOOD = { bias_score: -0.4, confidence: 0.8, reasoning: 'loaded wording', indicators: ['x'] };
const chatReply = (obj) => ({ choices: [{ message: { content: typeof obj === 'string' ? obj : JSON.stringify(obj) } }] });

async function managerFor(stub, adapter = 'openai') {
  process.env.LLM_BASE_URL = stub.url;
  process.env.LLM_MODEL = 'local-model';
  process.env.LLM_API_KEY = 'k-test';
  const m = new LLMManager();
  const ok = await m.initialize(adapter);
  expect(ok).toBe(true);
  return m;
}
const clearEnv = () => { for (const k of ['LLM_BASE_URL', 'LLM_MODEL', 'LLM_API_KEY', 'LLM_TIMEOUT_MS', 'LLM_MAX_CONCURRENCY', 'LLM_QUEUE_MAX', 'LLM_JSON_MODE']) delete process.env[k]; };

beforeEach(() => { jest.spyOn(console, 'log').mockImplementation(() => {}); jest.spyOn(console, 'error').mockImplementation(() => {}); jest.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { jest.restoreAllMocks(); clearEnv(); });

describe('configuration', () => {
  test('with no new variables the current provider settings are the defaults', () => {
    process.env.OLLAMA_BASE_URL = 'https://api.ollama.com';
    process.env.OLLAMA_MODEL = 'deepseek-v3.2';
    expect(LLM_CONFIG.adapters.ollama.base_url).toBe('https://api.ollama.com');
    expect(LLM_CONFIG.adapters.ollama.model).toBe('deepseek-v3.2');
    expect(LLM_CONFIG.timeout_ms).toBe(120000);
    expect(LLM_CONFIG.max_concurrency).toBe(1);
    delete process.env.OLLAMA_BASE_URL; delete process.env.OLLAMA_MODEL;
  });
  test('LLM_BASE_URL / LLM_MODEL / LLM_API_KEY override the selected adapter; LIMIT variables are read', () => {
    process.env.LLM_BASE_URL = 'http://gateway.test/v1';
    process.env.LLM_MODEL = 'qwen';
    process.env.LLM_API_KEY = 'abc';
    process.env.LLM_TIMEOUT_MS = '5000';
    process.env.LLM_MAX_CONCURRENCY = '2';
    expect(LLM_CONFIG.adapters.openai.base_url).toBe('http://gateway.test/v1');
    expect(LLM_CONFIG.adapters.openai.model).toBe('qwen');
    expect(LLM_CONFIG.adapters.openai.api_key).toBe('abc');
    expect(LLM_CONFIG.adapters.ollama.base_url).toBe('http://gateway.test/v1');
    expect(LLM_CONFIG.timeout_ms).toBe(5000);
    expect(LLM_CONFIG.max_concurrency).toBe(2);
  });
});

describe('OpenAI-compatible endpoint', () => {
  test('success: model, bearer key and JSON mode are sent; result parsed', async () => {
    const stub = await startStub((req, res) => {
      if (req.url === '/models') return json(res, 200, { data: [{ id: 'local-model' }] });
      json(res, 200, chatReply(GOOD));
    });
    const m = await managerFor(stub);
    const r = await m.detectBias('Some article text');
    await stub.close();
    expect(r.bias_score).toBe(-0.4);
    const chat = stub.requests.find(q => q.url === '/chat/completions');
    const body = JSON.parse(chat.body);
    expect(body.model).toBe('local-model');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(chat.headers.authorization).toBe('Bearer k-test');
  });

  test('server rejecting response_format is retried once without it', async () => {
    let n = 0;
    const stub = await startStub((req, res, body) => {
      if (req.url === '/models') return json(res, 200, { data: [] });
      n++;
      if (JSON.parse(body).response_format) return json(res, 400, { error: { message: "'response_format' is not supported" } });
      json(res, 200, chatReply(GOOD));
    });
    const m = await managerFor(stub);
    const r = await m.detectBias('text');
    await stub.close();
    expect(n).toBe(2);
    expect(r.bias_score).toBe(-0.4);
  });

  test('malformed JSON from the model is a failure, not bias 0', async () => {
    const stub = await startStub((req, res) => req.url === '/models' ? json(res, 200, { data: [] }) : json(res, 200, chatReply('I think this article is quite balanced overall.')));
    const m = await managerFor(stub);
    const r = await m.detectBias('text');
    await stub.close();
    expect(r._failed).toBe(true);
  });

  test.each([[402, 'Add usage credits'], [429, 'Rate limit reached']])('HTTP %i is a failure carrying the provider message', async (status, msg) => {
    const stub = await startStub((req, res) => req.url === '/models' ? json(res, 200, { data: [] }) : json(res, status, { error: { message: msg } }));
    const m = await managerFor(stub);
    const r = await m.detectBias('text');
    await stub.close();
    expect(r._failed).toBe(true);
    expect(r.reasoning).toContain(msg);
  });

  test('a hung endpoint times out (LLM_TIMEOUT_MS) and fails', async () => {
    const stub = await startStub((req, res) => { if (req.url === '/models') return json(res, 200, { data: [] }); /* never answer */ });
    const m = await managerFor(stub);
    process.env.LLM_TIMEOUT_MS = '300';
    const t0 = Date.now();
    const r = await m.detectBias('text');
    await stub.close();
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(r._failed).toBe(true);
    expect(r.reasoning).toMatch(/timed out/i);
  });

  test('concurrency is bounded and the queue pushes back when full', async () => {
    let inFlight = 0, maxInFlight = 0, chats = 0;
    const stub = await startStub((req, res) => {
      if (req.url === '/models') return json(res, 200, { data: [] });
      chats++; inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      setTimeout(() => { inFlight--; json(res, 200, chatReply(GOOD)); }, 150);
    });
    const m = await managerFor(stub);
    process.env.LLM_MAX_CONCURRENCY = '2';
    process.env.LLM_QUEUE_MAX = '3';
    const results = await Promise.all(Array.from({ length: 8 }, () => m.detectBias('text')));
    await stub.close();
    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(chats).toBe(5);                       // 2 running + 3 queued
    const rejected = results.filter(r => r._failed);
    expect(rejected).toHaveLength(3);
    expect(rejected[0].reasoning).toMatch(/queue full/i);
    expect(results.filter(r => !r._failed)).toHaveLength(5);
  });
});

describe('Ollama-compatible endpoint', () => {
  test('uses /api/generate with format json and the configured model', async () => {
    const stub = await startStub((req, res) => {
      if (req.url === '/api/tags') return json(res, 200, { models: [{ name: 'local-model' }] });
      json(res, 200, { response: JSON.stringify(GOOD) });
    });
    const m = await managerFor(stub, 'ollama');
    const r = await m.detectBias('text');
    await stub.close();
    expect(r.bias_score).toBe(-0.4);
    const gen = JSON.parse(stub.requests.find(q => q.url === '/api/generate').body);
    expect(gen.model).toBe('local-model');
    expect(gen.format).toBe('json');
  });
});

describe('failure is recorded as "not analysed", never as bias 0', () => {
  function newArticle() {
    const sid = addSource(`Src ${Math.random()}`, 'right', 0.6);
    const url = `https://a.test/${Math.random()}`;
    Article.create({ source_id: sid, title: 'T', url, author: null, published_at: new Date().toISOString(), excerpt: 'x', content: 'some long content', image_url: null, bias: 'right', bias_score: 0.6, sentiment_score: 0 });
    return { ...db.prepare('SELECT * FROM articles WHERE url = ?').get(url), source_name: 's' };
  }
  const factExtractor = { extractFromArticle: async () => ({ facts: [] }) };

  test('provider outage (402): row keeps its source-default score, method llm_failed, no confidence', async () => {
    const stub = await startStub((req, res) => req.url === '/models' ? json(res, 200, { data: [] }) : json(res, 402, { error: { message: 'Add usage credits' } }));
    const analyzer = new ArticleAnalyzer();
    analyzer.llmManager = await managerFor(stub);
    const art = newArticle();
    const ok = await analyzeSingleArticle(art, analyzer, factExtractor);
    await stub.close();
    expect(ok).toBe(false);
    const row = db.prepare('SELECT * FROM articles WHERE id = ?').get(art.id);
    expect(row.analysis_method).toBe('llm_failed');
    expect(row.bias_score).toBe(0.6);
    expect(row.llm_confidence).toBeNull();
    expect(row.llm_retry_count).toBe(1);
  });

  test('success is stored as llm with its real score', async () => {
    const stub = await startStub((req, res) => req.url === '/models' ? json(res, 200, { data: [] }) : json(res, 200, chatReply(GOOD)));
    const analyzer = new ArticleAnalyzer();
    analyzer.llmManager = await managerFor(stub);
    const art = newArticle();
    expect(await analyzeSingleArticle(art, analyzer, factExtractor)).toBe(true);
    await stub.close();
    const row = db.prepare('SELECT * FROM articles WHERE id = ?').get(art.id);
    expect(row.analysis_method).toBe('llm');
    expect(row.bias_score).toBe(-0.4);
    expect(row.llm_confidence).toBe(0.8);
  });

  test('queue back-pressure leaves the article retryable without burning a retry', async () => {
    const stub = await startStub((req, res) => req.url === '/models' ? json(res, 200, { data: [] }) : setTimeout(() => json(res, 200, chatReply(GOOD)), 200));
    const analyzer = new ArticleAnalyzer();
    analyzer.llmManager = await managerFor(stub);
    process.env.LLM_MAX_CONCURRENCY = '1';
    process.env.LLM_QUEUE_MAX = '0';
    const [a, b] = [newArticle(), newArticle()];
    const [ra, rb] = await Promise.all([analyzeSingleArticle(a, analyzer, factExtractor), analyzeSingleArticle(b, analyzer, factExtractor)]);
    await stub.close();
    expect([ra, rb].filter(Boolean)).toHaveLength(1);
    const loser = ra ? b : a;
    const row = db.prepare('SELECT * FROM articles WHERE id = ?').get(loser.id);
    expect(row.analysis_method).toBe('llm_failed');
    expect(row.llm_retry_count).toBe(0);
  });
});

describe('only new articles are ever (re)analysed', () => {
  test('getFailedLLM ignores old rows, so there is no backfill of history', () => {
    const sid = addSource('Backfill Src', 'left', -0.6);
    const ins = (u, created) => db.prepare(`INSERT INTO articles (source_id,title,url,published_at,created_at,updated_at,content,analysis_method,llm_retry_count,bias_score) VALUES (?,?,?,?,?,?, 'body','llm_failed',1,-0.6)`).run(sid, u, `https://b.test/${u}`, created, created, created);
    const ts = (ms) => new Date(Date.now() - ms).toISOString().replace('T', ' ').slice(0, 19);
    ins('old', '2026-01-01 00:00:00');
    ins('fresh', ts(60e3));            // failed a minute ago: backed off, not retried yet
    ins('new', ts(3600e3));            // failed an hour ago: due for a retry
    const urls = Article.getFailedLLM(50, 3).map(a => a.url);
    expect(urls).toContain('https://b.test/new');
    expect(urls).not.toContain('https://b.test/old');
    expect(urls).not.toContain('https://b.test/fresh');
  });
});

describe('retention cleanup stays off unless explicitly allowed', () => {
  test('runCleanup deletes nothing without ALLOW_ARTICLE_CLEANUP=true', async () => {
    const sid = addSource('Cleanup Src');
    db.prepare(`INSERT INTO articles (source_id,title,url,published_at) VALUES (?,?,?,?)`).run(sid, 'ancient', 'https://c.test/ancient', '2020-01-01T00:00:00.000Z');
    const before = db.prepare('SELECT COUNT(*) c FROM articles').get().c;
    const r = await runCleanup();
    expect(r.skipped).toBe(true);
    expect(db.prepare('SELECT COUNT(*) c FROM articles').get().c).toBe(before);
  });
});
