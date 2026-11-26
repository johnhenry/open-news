import nodeFetch from 'node-fetch';

export const FEED_USER_AGENT = 'Mozilla/5.0 (compatible; OpenNews/1.0; +https://open-news.johnhenry.me)';
const FEED_TIMEOUT_MS = parseInt(process.env.FEED_TIMEOUT_MS || '20000', 10);
const HTTPS_MEMO_MS = 60 * 60 * 1000;

// host -> time until which we skip the https attempt (this host's https did not work)
const httpsFailed = new Map();
export function _resetHttpsMemo() { httpsFailed.clear(); }

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * URLs to try for a configured feed URL, best first. An http:// feed is tried over
 * https:// first (mixed content / cleartext), then as configured. Loopback, bare IPs
 * and hosts with an explicit port are left alone.
 */
export function feedUrlCandidates(rssUrl) {
  let u;
  try { u = new URL(rssUrl); } catch { return [rssUrl]; }
  if (u.protocol !== 'http:') return [rssUrl];
  const host = u.hostname;
  if (u.port || host === 'localhost' || host.endsWith('.localhost') || IPV4.test(host) || host.includes(':')) return [rssUrl];
  const https = new URL(rssUrl);
  https.protocol = 'https:';
  return [https.toString(), rssUrl];
}

function looksLikeHtml(contentType, body) {
  if (/html/i.test(contentType || '') && !/xml/i.test(contentType || '')) return true;
  return /^\s*(<!doctype html|<html)/i.test(body.slice(0, 200));
}

/**
 * Download a feed and return its XML text. Sends a real User-Agent, lets node-fetch
 * decompress gzip/deflate/br (some servers compress without being asked), enforces a
 * timeout, and refuses HTML pages that are not feeds.
 */
export async function fetchFeedXml(rssUrl, { fetchImpl = nodeFetch, timeoutMs = FEED_TIMEOUT_MS } = {}) {
  let candidates = feedUrlCandidates(rssUrl);
  if (candidates.length > 1) {
    const until = httpsFailed.get(new URL(rssUrl).hostname);
    if (until && until > Date.now()) candidates = candidates.slice(1);
  }

  let lastError;
  for (const url of candidates) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        signal: ctrl.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': FEED_USER_AGENT,
          'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5'
        }
      });
      if (!res.ok) throw new Error(`Feed request failed with HTTP ${res.status}`);
      const xml = await res.text();
      if (looksLikeHtml(res.headers.get('content-type'), xml)) {
        throw new Error(`Not a feed: ${url} returned an HTML page`);
      }
      return { xml, usedUrl: url };
    } catch (err) {
      lastError = ctrl.signal.aborted ? new Error(`Feed request timed out after ${timeoutMs} ms`) : err;
      if (url.startsWith('https://') && rssUrl.startsWith('http://')) {
        httpsFailed.set(new URL(rssUrl).hostname, Date.now() + HTTPS_MEMO_MS);
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}
