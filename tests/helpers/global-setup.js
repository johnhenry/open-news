// A non-UTC zone for every test: local-vs-UTC bugs (cron next-run, SQLite timestamps parsed as
// local time) only show up when the process is not running in UTC.
export default async function () {
  process.env.TZ = 'America/Los_Angeles';
}
