// jest's globalSetup runs the whole suite in America/Los_Angeles: the bug only shows in a non-UTC browser
const { parseApiDate, timeAgo } = await import('../frontend/src/utils/time.mjs');

const NOW = Date.UTC(2026, 10, 26, 10, 10, 7);
const ago = (ms) => new Date(NOW - ms).toISOString();

describe('parseApiDate', () => {
  test('SQLite CURRENT_TIMESTAMP strings are UTC, not local time', () => {
    expect(parseApiDate('2026-11-26 08:10:07').getTime()).toBe(Date.UTC(2026, 10, 26, 8, 10, 7));
    expect(parseApiDate('2026-11-26T08:10:07').getTime()).toBe(Date.UTC(2026, 10, 26, 8, 10, 7));
  });
  test('strings that carry a zone are unchanged', () => {
    expect(parseApiDate('2026-11-26T08:10:07Z').getTime()).toBe(Date.UTC(2026, 10, 26, 8, 10, 7));
    expect(parseApiDate('2026-11-26T08:10:07.123Z').getTime()).toBe(Date.UTC(2026, 10, 26, 8, 10, 7, 123));
    expect(parseApiDate('2026-11-26T09:10:07+01:00').getTime()).toBe(Date.UTC(2026, 10, 26, 8, 10, 7));
  });
  test('empty/invalid give null', () => {
    expect(parseApiDate('')).toBeNull();
    expect(parseApiDate(null)).toBeNull();
    expect(parseApiDate('nope')).toBeNull();
  });
});

describe('timeAgo', () => {
  test('a 2h-old SQLite timestamp reads 2h, not "just now" (UTC vs local bug)', () => {
    expect(timeAgo('2026-11-26 08:10:07', NOW)).toBe('2h ago');
  });
  test.each([
    [0, 'just now'], [59e3, 'just now'], [60e3, '1m ago'], [59 * 60e3 + 59e3, '59m ago'],
    [60 * 60e3, '1h ago'], [23 * 3600e3 + 59 * 60e3, '23h ago'], [24 * 3600e3, '1d ago'], [48 * 3600e3 + 1, '2d ago'],
  ])('%i ms old -> %s', (ms, expected) => {
    expect(timeAgo(ago(ms), NOW)).toBe(expected);
  });
  test('slightly in the future (clock skew) is "just now"; invalid is empty', () => {
    expect(timeAgo(new Date(NOW + 5 * 60e3).toISOString(), NOW)).toBe('just now');
    expect(timeAgo('', NOW)).toBe('');
    expect(timeAgo('garbage', NOW)).toBe('');
  });
});
