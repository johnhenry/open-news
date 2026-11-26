// Dates from the API come in two shapes: ISO strings with a zone ("2026-11-26T08:10:07.000Z")
// and SQLite CURRENT_TIMESTAMP strings ("2026-11-26 08:10:07"), which are UTC but carry no
// zone marker. new Date() would read the latter as LOCAL time, so a UTC timestamp looks hours
// off (or "in the future") in any browser not on UTC. Treat zone-less strings as UTC.

const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

export function parseApiDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  let s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00:00';
  else if (/^\d{4}-\d{2}-\d{2} \d/.test(s)) s = s.replace(' ', 'T');
  if (!HAS_ZONE.test(s) && /T\d{2}:\d{2}/.test(s)) s += 'Z';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "just now", "5m ago", "3h ago", "2d ago". `now` is injectable for tests. */
export function timeAgo(value, now = Date.now()) {
  const d = parseApiDate(value);
  if (!d) return '';
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now'; // includes small negative values from clock skew
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatDateTime(value) {
  const d = parseApiDate(value);
  return d ? d.toLocaleString() : '';
}
