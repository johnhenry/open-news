import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(__dirname, '../../data/news.db');

if (!fs.existsSync(dirname(dbPath))) {
  fs.mkdirSync(dirname(dbPath), { recursive: true });
}

// Only enable verbose SQL logging in development mode
const isDevelopment = process.env.NODE_ENV !== 'production';
const verboseLogger = isDevelopment ? console.log : null;

const db = new Database(dbPath, { verbose: verboseLogger });

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

export default db;