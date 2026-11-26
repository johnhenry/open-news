import { jest } from '@jest/globals';
import { startStub, json } from './helpers/stub-server.js';
import { setupDb, addSource } from './helpers/db.js';

const db = setupDb();
const { Settings } = await import('../src/db/settings-model.js');
const { Article } = await import('../src/db/models.js');
const { clusterArticles } = await import('../src/clustering/cluster.js');

function seedArticles(sourceId, group, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const url = `https://example.test/${group}/${i}`;
    Article.create({
      source_id: sourceId, title: `Chelsea appoint Rosenior as head coach ${group}`,
      url, author: null, published_at: new Date().toISOString(),
      excerpt: `Chelsea have appointed Rosenior as head coach (${group}) report ${i}`,
      content: null, image_url: null, bias: 'right', bias_score: 0.6, sentiment_score: 0
    });
  }
  return db.prepare('SELECT a.*, s.name as source_name, s.bias as source_bias FROM articles a JOIN sources s ON s.id=a.source_id').all();
}

describe('clustering', () => {
  let stub;
  let errSpy;
  beforeAll(async () => {
    // OpenAI-compatible /embeddings stub: "alpha" texts and "beta" texts are far apart.
    stub = await startStub((req, res, body) => {
      const input = JSON.parse(body).input;
      const text = Array.isArray(input) ? input[0] : input;
      json(res, 200, { data: [{ embedding: /alpha/i.test(text) ? [1, 0, 0] : [0, 1, 0] }] });
    });
    Settings.set('llm_enabled', false); // never reach a real provider from tests
    Settings.set('content_mode', 'research');
    Settings.set('min_cluster_size', 3);
    Settings.set('similarity_threshold', 0.5);
  });
  afterAll(async () => { await stub.close(); });
  beforeEach(() => { errSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); jest.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => { jest.restoreAllMocks(); });

  test('kmeans refinement splits one keyword cluster into subclusters (no "kmeans is not a function")', async () => {
    process.env.EMBEDDINGS_BASE_URL = stub.url;
    const sid = addSource('Cluster Test Source');
    seedArticles(sid, 'alpha', 3);
    const articles = seedArticles(sid, 'beta', 3);
    const clusters = await clusterArticles(articles);
    const msgs = errSpy.mock.calls.map(c => String(c[0]) + String(c[1] ?? ''));
    expect(msgs.join('\n')).not.toMatch(/kmeans is not a function/);
    expect(msgs.join('\n')).not.toMatch(/Error refining cluster/);
    expect(clusters.length).toBeGreaterThan(0);
    expect(clusters.length).toBe(2);
    expect(clusters.map(c => c.articles)).toEqual([3, 3]);
  });

  test('degrades gracefully when the embeddings endpoint is down: keyword clusters are still produced', async () => {
    const down = await startStub((req, res) => json(res, 500, { error: 'boom' }));
    process.env.EMBEDDINGS_BASE_URL = down.url;
    const sid = addSource('Cluster Test Source 2');
    const before = db.prepare('SELECT COUNT(*) c FROM articles').get().c;
    seedArticles(sid, 'gamma', 4);
    const articles = db.prepare('SELECT a.*, s.name as source_name, s.bias as source_bias FROM articles a JOIN sources s ON s.id=a.source_id WHERE a.url LIKE ?').all('%/gamma/%');
    expect(before).toBeGreaterThan(0);
    const clusters = await clusterArticles(articles);
    await down.close();
    expect(clusters.length).toBeGreaterThan(0);
  });
});
