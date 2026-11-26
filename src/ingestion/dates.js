const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;

/**
 * Publication date to store for a feed item. Dates more than 24 h in the future (bad feed
 * data, wrong year/zone), missing and unparseable dates use the fetch time; the raw
 * value is kept in published_at_raw whenever we replaced something.
 */
export function normalizePublishedAt(raw, now = new Date()) {
  const fallback = now.toISOString();
  if (raw === undefined || raw === null || raw === '') {
    return { published_at: fallback, published_at_raw: null };
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime()) || d.getTime() - now.getTime() > MAX_FUTURE_MS) {
    return { published_at: fallback, published_at_raw: String(raw) };
  }
  return { published_at: d.toISOString(), published_at_raw: null };
}
