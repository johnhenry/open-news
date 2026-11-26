import { jest } from '@jest/globals';
const { feedUrlCandidates, fetchFeedXml, _resetHttpsMemo } = await import('../src/ingestion/feed-url.js');

describe('feed URL normalisation', () => {
  test('http feeds are tried over https first, then the original', () => {
    expect(feedUrlCandidates('http://feeds.bbci.co.uk/news/rss.xml')).toEqual([
      'https://feeds.bbci.co.uk/news/rss.xml', 'http://feeds.bbci.co.uk/news/rss.xml']);
  });
  test('https feeds stay as they are', () => {
    expect(feedUrlCandidates('https://x.test/rss')).toEqual(['https://x.test/rss']);
  });
  test('loopback, IPs and explicit ports are never upgraded', () => {
    expect(feedUrlCandidates('http://127.0.0.1:8080/rss')).toEqual(['http://127.0.0.1:8080/rss']);
    expect(feedUrlCandidates('http://localhost/rss')).toEqual(['http://localhost/rss']);
    expect(feedUrlCandidates('http://10.0.0.5/rss')).toEqual(['http://10.0.0.5/rss']);
    expect(feedUrlCandidates('http://example.test:8000/rss')).toEqual(['http://example.test:8000/rss']);
  });
  test('garbage in, same garbage out', () => {
    expect(feedUrlCandidates('not a url')).toEqual(['not a url']);
  });

  test('falls back to http when https fails, and remembers that https failed for the host', async () => {
    _resetHttpsMemo();
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      if (url.startsWith('https://')) throw new Error('TLS connect error');
      return { ok: true, status: 200, headers: new Map([['content-type', 'text/xml']]), text: async () => '<rss/>' };
    };
    const a = await fetchFeedXml('http://rss.cnn.test/feed', { fetchImpl });
    expect(a.xml).toBe('<rss/>');
    expect(a.usedUrl).toBe('http://rss.cnn.test/feed');
    await fetchFeedXml('http://rss.cnn.test/feed', { fetchImpl });
    expect(calls).toEqual(['https://rss.cnn.test/feed', 'http://rss.cnn.test/feed', 'http://rss.cnn.test/feed']);
  });

  test('uses https when it works and never touches http', async () => {
    _resetHttpsMemo();
    const calls = [];
    const fetchImpl = async (url) => { calls.push(url); return { ok: true, status: 200, headers: new Map([['content-type', 'application/rss+xml']]), text: async () => '<rss/>' }; };
    const r = await fetchFeedXml('http://feeds.bbci.test/rss.xml', { fetchImpl });
    expect(r.usedUrl).toBe('https://feeds.bbci.test/rss.xml');
    expect(calls).toEqual(['https://feeds.bbci.test/rss.xml']);
  });
});
