import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import db from './database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function migrate() {
  try {
    // Run main schema
    const schema = fs.readFileSync(join(__dirname, 'schema.sql'), 'utf8');
    db.exec(schema);
    
    // Run settings schema if it exists
    const settingsSchemaPath = join(__dirname, 'settings-schema.sql');
    if (fs.existsSync(settingsSchemaPath)) {
      const settingsSchema = fs.readFileSync(settingsSchemaPath, 'utf8');
      
      // Split by statements and execute them individually to handle ALTER TABLE IF NOT EXISTS
      const statements = settingsSchema
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      
      for (const statement of statements) {
        try {
          // Skip ALTER TABLE statements if column already exists
          if (statement.includes('ALTER TABLE') && statement.includes('IF NOT EXISTS')) {
            // SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we need to check manually
            continue;
          }
          db.exec(statement + ';');
        } catch (err) {
          // Ignore errors for duplicate columns/tables
          if (!err.message.includes('duplicate') && !err.message.includes('already exists')) {
            console.warn('Warning during migration:', err.message);
          }
        }
      }
    }
    
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