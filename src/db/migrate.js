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
    
    // Add analysis_method column to articles if it doesn't exist
    try {
      db.exec("ALTER TABLE articles ADD COLUMN analysis_method TEXT DEFAULT 'source_default'");
      console.log('  Added analysis_method column to articles');
    } catch (err) {
      if (!err.message.includes('duplicate column') && !err.message.includes('already exists')) {
        // Column already exists, that's fine
        if (!err.message.includes('column') || !err.message.includes('analysis_method')) {
          console.warn('Warning adding analysis_method column:', err.message);
        }
      }
    }

    // Add LLM analysis columns to articles
    const llmColumns = [
      { name: 'llm_confidence', sql: 'ALTER TABLE articles ADD COLUMN llm_confidence REAL' },
      { name: 'llm_reasoning', sql: 'ALTER TABLE articles ADD COLUMN llm_reasoning TEXT' },
      { name: 'llm_indicators', sql: 'ALTER TABLE articles ADD COLUMN llm_indicators TEXT' },
      { name: 'llm_facts', sql: 'ALTER TABLE articles ADD COLUMN llm_facts TEXT' },
    ];

    for (const col of llmColumns) {
      try {
        db.exec(col.sql);
        console.log(`  Added ${col.name} column to articles`);
      } catch (err) {
        if (!err.message.includes('duplicate column') && !err.message.includes('already exists')) {
          if (!err.message.includes('column') || !err.message.includes(col.name)) {
            console.warn(`Warning adding ${col.name} column:`, err.message);
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