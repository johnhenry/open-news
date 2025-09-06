import 'dotenv/config';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Source } from '../db/models.js';
import migrate from '../db/migrate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function seedSources() {
  try {
    console.log('🔄 Running database migration...');
    migrate();
    
    console.log('📝 Loading sources configuration...');
    const configPath = join(__dirname, '../../config/sources.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    console.log(`📥 Seeding ${config.sources.length} sources...`);
    
    let added = 0;
    let skipped = 0;
    
    for (const source of config.sources) {
      try {
        const existing = Source.getAll().find(s => s.name === source.name);
        
        if (existing) {
          console.log(`⏭️  Skipping ${source.name} (already exists)`);
          skipped++;
          continue;
        }
        
        Source.create({
          name: source.name,
          url: source.url,
          rss_url: source.rss_url || null,
          api_url: source.api_url || null,
          bias: source.bias,
          bias_score: source.bias_score || 0,
          scraping_enabled: source.scraping_enabled || false,
          notes: source.notes || null
        });
        
        console.log(`✅ Added ${source.name} (${source.bias})`);
        added++;
        
      } catch (error) {
        console.error(`❌ Failed to add ${source.name}:`, error.message);
      }
    }
    
    console.log(`
    ✨ Seeding Complete
    ===================
    ✅ Added: ${added} sources
    ⏭️  Skipped: ${skipped} sources
    📊 Total: ${Source.getAll().length} sources in database
    `);
    
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedSources().then(() => process.exit(0));
}

export default seedSources;