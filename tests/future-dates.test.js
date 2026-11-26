import { jest } from '@jest/globals';
import { setupDb, addSource } from './helpers/db.js';

const db = setupDb();
const { normalizePublishedAt } = await import('../src/ingestion/dates.js');
const { Article } = await import('../src/db/models.js');

const NOW = new Date('2026-11-26T13:00:00.000Z');

describe('normalizePublishedAt (ingest)', () => {
  test('a normal past date is kept', () => {
    expect(normalizePublishedAt('Thu, 26 Nov 2026 12:00:00 GMT', NOW)).toEqual({ published_at: '2026-11-26T12:00:00.000Z', published_at_raw: null });
  });
  test('up to 24h ahead (timezone slop) is kept', () => {
    expect(normalizePublishedAt('2026-11-27T10:00:00Z', NOW).published_at).toBe('2026-11-27T10:00:00.000Z');
  });
  test('more than 24h ahead uses fetch time and keeps the raw value', () => {
    expect(normalizePublishedAt('Sat, 09 Jan 2027 16:08:00 GMT', NOW)).toEqual({
      published_at: '2026-11-26T13:00:00.000Z', published_at_raw: 'Sat, 09 Jan 2027 16:08:00 GMT' });
  });
  test('missing or unparseable dates use fetch time', () => {
    expect(normalizePublishedAt(undefined, NOW).published_at).toBe('2026-11-26T13:00:00.000Z');
    expect(normalizePublishedAt('garbage', NOW)).toEqual({ published_at: '2026-11-26T13:00:00.000Z', published_at_raw: 'garbage' });
  });
});

describe('read path corrects an existing future-dated row without rewriting it', () => {
  const sid = addSource('Future Source');
  const mk = (url, published_at, created_at) => {
    db.prepare(`INSERT INTO articles (source_id,title,url,published_at,created_at,bias,bias_score) VALUES (?,?,?,?,?, 'right', 0.6)`)
      .run(sid, `T ${url}`, `https://f.test/${url}`, published_at, created_at);
  };
  const now = new Date();
  const iso = d => d.toISOString();
  const sqlTs = d => iso(d).replace('T', ' ').slice(0, 19);
  beforeAll(() => {
    mk('future', '2099-01-09T16:08:00.000Z', sqlTs(new Date(now.getTime() - 3600e3 * 24 * 30)));
    mk('recent', iso(new Date(now.getTime() - 3600e3)), sqlTs(new Date(now.getTime() - 3600e3)));
    mk('older', iso(new Date(now.getTime() - 3600e3 * 5)), sqlTs(new Date(now.getTime() - 3600e3 * 5)));
  });

  test('search shows the created_at as the date and sorts it by that date, raw column untouched', () => {
    const { articles } = Article.search({ limit: 10 });
    const urls = articles.map(a => a.url.split('/').pop());
    expect(urls.slice(0, 3)).toEqual(['recent', 'older', 'future']);
    const fut = articles.find(a => a.url.endsWith('/future'));
    expect(new Date(fut.published_at).getFullYear()).toBe(new Date(now.getTime() - 3600e3 * 24 * 30).getFullYear());
    expect(fut.published_at).not.toMatch(/^2099/);
    expect(db.prepare("SELECT published_at FROM articles WHERE url = 'https://f.test/future'").get().published_at).toMatch(/^2099/);
  });
  test('getAll and getById agree', () => {
    expect(Article.getAll(10, 0).map(a => a.url.split('/').pop()).slice(0, 3)).toEqual(['recent', 'older', 'future']);
    const id = db.prepare("SELECT id FROM articles WHERE url = 'https://f.test/future'").get().id;
    expect(Article.getById(id).published_at).not.toMatch(/^2099/);
  });
});
