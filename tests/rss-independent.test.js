import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { startStub } from './helpers/stub-server.js';
import { setupDb, addSource } from './helpers/db.js';

const db = setupDb();
const { Settings } = await import('../src/db/settings-model.js');
const { fetchRSSFeed } = await import('../src/ingestion/rss-parser.js');
const fixture = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/independent-rss.xml.gz'));

describe('The Independent feed (gzip served without Accept-Encoding)', () => {
  beforeEach(() => { jest.spyOn(console, 'log').mockImplementation(() => {}); jest.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => jest.restoreAllMocks());

  test('parses a recorded real response that is gzip-encoded', async () => {
    Settings.set('content_mode', 'safe');
    Settings.set('analysis_method', 'source_default');
    const stub = await startStub((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8', 'Content-Encoding': 'gzip' });
      res.end(fixture);
    });
    const id = addSource('The Independent', 'center-left', -0.3, `${stub.url}/rss`);
    const source = db.prepare('SELECT * FROM sources WHERE id = ?').get(id);
    const result = await fetchRSSFeed(source);
    await stub.close();
    expect(result.success.length).toBeGreaterThan(10);
    expect(db.prepare('SELECT COUNT(*) c FROM articles WHERE source_id = ?').get(id).c).toBe(result.success.length);
    expect(stub.requests[0].headers['user-agent']).toMatch(/^OpenNews\//); // Guardian 403s Mozilla-style bot UAs
  });

  test('an HTML page where a feed should be gives a clear error, not an XML parse error', async () => {
    const stub = await startStub((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!doctype html><html><body>Subscribe</body></html>');
    });
    const id = addSource('Dead Feed', 'center', 0, `${stub.url}/rss`);
    const source = db.prepare('SELECT * FROM sources WHERE id = ?').get(id);
    await expect(fetchRSSFeed(source)).rejects.toThrow(/not a feed|HTML/i);
    await stub.close();
  });
});
