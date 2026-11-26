import migrate from '../../src/db/migrate.js';
import db from '../../src/db/database.js';

let ready = false;
export function setupDb() {
  if (!ready) { migrate(); ready = true; }
  return db;
}

export function addSource(name, bias = 'right', bias_score = 0.6, rss_url = null) {
  const d = setupDb();
  const r = d.prepare(
    `INSERT INTO sources (name, url, rss_url, bias, bias_score, scraping_enabled) VALUES (?,?,?,?,?,0)`
  ).run(name, 'https://example.test', rss_url, bias, bias_score);
  return Number(r.lastInsertRowid);
}
