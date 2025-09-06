import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import db from './database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function migrate() {
  try {
    const schema = fs.readFileSync(join(__dirname, 'schema.sql'), 'utf8');
    
    db.exec(schema);
    
    console.log('✅ Database migration completed successfully');
  } catch (error) {
    console.error('❌ Database migration failed:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate();
}

export default migrate;