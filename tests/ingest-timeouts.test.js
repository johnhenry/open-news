import { jest } from '@jest/globals';
import { startStub } from './helpers/stub-server.js';
import { setupDb } from './helpers/db.js';

setupDb();
const { extractContent } = await import('../src/ingestion/content-extractor.js');
const { withTimeout } = await import('../src/ingestion/index.js');

beforeEach(() => { jest.spyOn(console, 'log').mockImplementation(() => {}); jest.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { jest.restoreAllMocks(); delete process.env.CONTENT_TIMEOUT_MS; });

describe('ingestion cannot hang', () => {
  test('an article page that never answers is abandoned after CONTENT_TIMEOUT_MS', async () => {
    const stub = await startStub(() => { /* never respond */ });
    process.env.CONTENT_TIMEOUT_MS = '300';
    const t0 = Date.now();
    const r = await extractContent(`${stub.url}/story`, false);
    await stub.close();
    expect(r).toBeNull();
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  test('a page that sends headers then stalls mid-body is also abandoned', async () => {
    const stub = await startStub((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.write('<html><body><article>start'); /* never end */ });
    process.env.CONTENT_TIMEOUT_MS = '300';
    const t0 = Date.now();
    const r = await extractContent(`${stub.url}/story`, false);
    await stub.close();
    expect(r).toBeNull();
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  test('withTimeout rejects a source that takes too long and passes fast ones through', async () => {
    await expect(withTimeout(new Promise(() => {}), 100, 'slow feed')).rejects.toThrow(/slow feed.*timed out/i);
    await expect(withTimeout(Promise.resolve(7), 100, 'x')).resolves.toBe(7);
  });
});
