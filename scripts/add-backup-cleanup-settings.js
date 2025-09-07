import db from '../src/db/database.js';

// Add backup_location setting if it doesn't exist
const addBackupLocationSetting = db.prepare(`
  INSERT OR IGNORE INTO settings (key, value, type, category, description, default_value) 
  VALUES (?, ?, ?, ?, ?, ?)
`);

addBackupLocationSetting.run(
  'backup_location',
  './backups',
  'string',
  'data',
  'Backup directory location',
  './backups'
);

// Add backup and cleanup scheduled jobs if they don't exist
const addScheduledJob = db.prepare(`
  INSERT OR IGNORE INTO scheduled_jobs (job_name, enabled, cron_expression, status) 
  VALUES (?, ?, ?, ?)
`);

addScheduledJob.run('backup', 0, '0 2 * * *', 'idle');
addScheduledJob.run('cleanup', 0, '0 3 * * *', 'idle');

console.log('✅ Added backup_location setting and scheduled jobs for backup/cleanup');

// Verify the settings
const backupSetting = db.prepare('SELECT * FROM settings WHERE key = ?').get('backup_location');
const backupJob = db.prepare('SELECT * FROM scheduled_jobs WHERE job_name = ?').get('backup');
const cleanupJob = db.prepare('SELECT * FROM scheduled_jobs WHERE job_name = ?').get('cleanup');

console.log('\n📊 Current configuration:');
console.log('Backup location setting:', backupSetting);
console.log('Backup job:', backupJob);
console.log('Cleanup job:', cleanupJob);