import fs from 'fs';
import os from 'os';
import path from 'path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
const { registerSpa } = await import('../src/spa.js');

async function app() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spa-'));
  fs.mkdirSync(path.join(root, 'assets'));
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>Open News SPA</title>');
  fs.writeFileSync(path.join(root, 'assets', 'index-abc.js'), 'console.log(1)');
  fs.writeFileSync(path.join(root, 'favicon.svg'), '<svg/>');
  const f = Fastify();
  await f.register(fastifyStatic, { root, prefix: '/', wildcard: false });
  registerSpa(f);
  return f;
}

describe('SPA fallback', () => {
  test.each(['/', '/clusters', '/clusters/42', '/articles', '/sources', '/settings'])('client route %s serves the app shell', async (url) => {
    const f = await app();
    const r = await f.inject({ url, headers: { accept: 'text/html' } });
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain('Open News SPA');
  });
  test('existing assets are served as themselves', async () => {
    const f = await app();
    const r = await f.inject({ url: '/assets/index-abc.js' });
    expect(r.statusCode).toBe(200);
    expect(r.body).toBe('console.log(1)');
  });
  test.each(['/robots.txt', '/assets/missing-123.js', '/assets/missing.css', '/sitemap.xml', '/favicon.ico'])('missing file %s is a real 404, not HTML', async (url) => {
    const f = await app();
    const r = await f.inject({ url, headers: { accept: '*/*' } });
    expect(r.statusCode).toBe(404);
    expect(r.body).not.toContain('Open News SPA');
  });
  test('unknown page paths are 404 (not the shell)', async () => {
    const f = await app();
    const r = await f.inject({ url: '/nope-xyz', headers: { accept: 'text/html' } });
    expect(r.statusCode).toBe(404);
    expect(r.body).not.toContain('Open News SPA');
  });
  test('unknown API paths stay JSON 404; non-GET never gets the shell', async () => {
    const f = await app();
    const a = await f.inject({ url: '/api/nope' });
    expect(a.statusCode).toBe(404);
    expect(a.headers['content-type']).toMatch(/json/);
    const p = await f.inject({ method: 'POST', url: '/clusters' });
    expect(p.statusCode).toBe(404);
  });
});
