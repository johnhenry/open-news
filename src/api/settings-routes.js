import { Settings, ScheduledJobs, LLMCache } from '../db/settings-model.js';
import { Source } from '../db/models.js';
import { getLLMManager } from '../llm/manager.js';
import { scheduleIngestion, scheduleClustering } from '../jobs/scheduler.js';
import { getDb } from '../db/index.js';
import fs from 'fs/promises';
import path from 'path';

export async function registerSettingsRoutes(fastify) {
  
  // Get all settings
  fastify.get('/api/settings', async (request, reply) => {
    const { category } = request.query;
    
    if (category) {
      return Settings.getAll(category);
    }
    
    return Settings.getByCategory();
  });

  // Update settings
  fastify.put('/api/settings', async (request, reply) => {
    const updates = request.body;
    
    try {
      Settings.bulkSet(updates);
      
      // Handle side effects
      if ('ingestion_enabled' in updates || 'ingestion_interval' in updates) {
        const enabled = Settings.isIngestionEnabled();
        const interval = Settings.getIngestionInterval();
        await scheduleIngestion(enabled ? interval : null);
      }
      
      if ('clustering_enabled' in updates || 'clustering_interval' in updates) {
        const enabled = Settings.isClusteringEnabled();
        const interval = Settings.get('clustering_interval');
        await scheduleClustering(enabled ? interval : null);
      }
      
      if ('llm_adapter' in updates) {
        const manager = getLLMManager();
        await manager.initialize(updates.llm_adapter);
      }
      
      return { success: true, settings: Settings.getByCategory() };
    } catch (error) {
      reply.code(400).send({ error: error.message });
    }
  });

  // Reset settings
  fastify.post('/api/settings/reset', async (request, reply) => {
    const { category, key } = request.body;
    
    if (key) {
      Settings.reset(key);
    } else {
      Settings.resetAll(category);
    }
    
    return { success: true, settings: Settings.getByCategory() };
  });

  // Get models for a specific adapter
  fastify.get('/api/settings/llm/adapters/:adapter/models', async (request, reply) => {
    const { adapter } = request.params;
    
    try {
      let models = [];
      
      switch(adapter) {
        case 'ollama':
          try {
            const response = await fetch('http://localhost:11434/api/tags');
            if (response.ok) {
              const data = await response.json();
              models = (data.models || []).map(m => ({ 
                id: m.name, 
                name: m.name,
                size: m.size ? `${(m.size / 1024 / 1024 / 1024).toFixed(1)}GB` : undefined
              }));
            }
          } catch (e) {
            // Ollama not running
          }
          break;
          
        case 'openai':
          // Common OpenAI models
          models = [
            { id: 'gpt-4-turbo-preview', name: 'GPT-4 Turbo' },
            { id: 'gpt-4', name: 'GPT-4' },
            { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
            { id: 'gpt-3.5-turbo-16k', name: 'GPT-3.5 Turbo 16K' }
          ];
          break;
          
        case 'anthropic':
          // Common Anthropic models
          models = [
            { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
            { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' },
            { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
            { id: 'claude-2.1', name: 'Claude 2.1' },
            { id: 'claude-2.0', name: 'Claude 2.0' }
          ];
          break;
          
        case 'gemini':
          // Common Gemini models
          models = [
            { id: 'gemini-pro', name: 'Gemini Pro' },
            { id: 'gemini-pro-vision', name: 'Gemini Pro Vision' }
          ];
          break;
          
        case 'lmstudio':
          // LM Studio uses local models, fetch from endpoint if available
          try {
            const response = await fetch('http://localhost:1234/v1/models');
            if (response.ok) {
              const data = await response.json();
              models = (data.data || []).map(m => ({ id: m.id, name: m.id }));
            }
          } catch (e) {
            // LM Studio not running
          }
          break;
      }
      
      // Get current model from settings
      const currentModel = Settings.get(`${adapter}_model`) || '';
      
      return { 
        models,
        currentModel,
        adapter
      };
    } catch (error) {
      reply.code(500).send({ error: error.message });
    }
  });

  // LLM adapter management
  fastify.get('/api/settings/llm/adapters', async (request, reply) => {
    const manager = getLLMManager();
    await manager.initialize();
    
    const status = manager.getStatus();
    const adapters = [];
    
    // Get the actual current adapter from settings
    const currentAdapter = Settings.get('llm_adapter');
    
    // Test each adapter's availability
    for (const adapterName of status.config.adapters) {
      let available = false;
      let error = null;
      
      // Check if adapter is configured
      const configured = checkAdapterConfig(adapterName);
      
      // Test actual availability
      if (configured || adapterName === 'ollama' || adapterName === 'lmstudio') {
        const testResult = await manager.testAdapter(adapterName);
        available = testResult.success;
        error = testResult.error;
      }
      
      adapters.push({
        name: adapterName,
        available,
        active: adapterName === currentAdapter,
        configured,
        error: error
      });
    }
    
    return { adapters, current: currentAdapter };
  });

  // Test LLM adapter
  fastify.post('/api/settings/llm/test', async (request, reply) => {
    const { adapter } = request.body;
    const manager = getLLMManager();
    
    try {
      const result = await manager.testAdapter(adapter);
      return { success: result.success, message: result.response || result.error };
    } catch (error) {
      reply.code(400).send({ error: error.message });
    }
  });

  // Get API keys status (without exposing actual keys)
  fastify.get('/api/settings/api-keys', async (request, reply) => {
    return {
      openai: !!process.env.OPENAI_API_KEY,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      gemini: !!process.env.GEMINI_API_KEY,
      lmstudio: !!process.env.LMSTUDIO_API_KEY
    };
  });

  // Update API keys
  fastify.put('/api/settings/api-keys', async (request, reply) => {
    const keys = request.body;
    const envPath = path.join(process.cwd(), '.env');
    
    try {
      let envContent = await fs.readFile(envPath, 'utf-8');
      
      for (const [key, value] of Object.entries(keys)) {
        if (!value) continue;
        
        const envKey = `${key.toUpperCase()}_API_KEY`;
        const regex = new RegExp(`^${envKey}=.*$`, 'm');
        
        if (regex.test(envContent)) {
          envContent = envContent.replace(regex, `${envKey}=${value}`);
        } else {
          envContent += `\n${envKey}=${value}`;
        }
        
        // Update process.env
        process.env[envKey] = value;
      }
      
      await fs.writeFile(envPath, envContent);
      return { success: true };
    } catch (error) {
      reply.code(500).send({ error: 'Failed to update API keys' });
    }
  });

  // Source management
  fastify.get('/api/settings/sources', async (request, reply) => {
    // Get ALL sources (including inactive) for settings management
    const db = getDb();
    const sources = db.prepare('SELECT * FROM sources ORDER BY name').all();
    const grouped = {};
    
    for (const source of sources) {
      if (!grouped[source.bias]) {
        grouped[source.bias] = [];
      }
      grouped[source.bias].push(source);
    }
    
    return { sources, grouped, total: sources.length };
  });

  // Add new source
  fastify.post('/api/settings/sources', async (request, reply) => {
    const sourceData = request.body;
    
    try {
      const id = Source.create(sourceData);
      const source = Source.getById(id);
      return { success: true, source };
    } catch (error) {
      reply.code(400).send({ error: error.message });
    }
  });

  // Update source
  fastify.put('/api/settings/sources/:id', async (request, reply) => {
    const { id } = request.params;
    const updates = request.body;
    
    try {
      Source.update(parseInt(id), updates);
      const source = Source.getById(parseInt(id));
      return { success: true, source };
    } catch (error) {
      reply.code(400).send({ error: error.message });
    }
  });

  // Delete source
  fastify.delete('/api/settings/sources/:id', async (request, reply) => {
    const { id } = request.params;
    
    try {
      Source.delete(parseInt(id));
      return { success: true };
    } catch (error) {
      reply.code(400).send({ error: error.message });
    }
  });

  // Toggle source active status
  fastify.post('/api/settings/sources/:id/toggle', async (request, reply) => {
    const { id } = request.params;
    
    try {
      const source = Source.getById(parseInt(id));
      if (!source) {
        return reply.code(404).send({ error: 'Source not found' });
      }
      
      Source.update(parseInt(id), { active: source.active ? 0 : 1 });
      const updated = Source.getById(parseInt(id));
      return { success: true, source: updated };
    } catch (error) {
      reply.code(400).send({ error: error.message });
    }
  });

  // Get scheduled jobs
  fastify.get('/api/settings/jobs', async (request, reply) => {
    return ScheduledJobs.getAll();
  });

  // Update scheduled job
  fastify.put('/api/settings/jobs/:name', async (request, reply) => {
    const { name } = request.params;
    const updates = request.body;
    
    try {
      const job = ScheduledJobs.update(name, updates);
      
      // Apply changes to scheduler
      if (name === 'ingestion' && ('enabled' in updates || 'cron_expression' in updates)) {
        const enabled = job.enabled;
        await scheduleIngestion(enabled ? job.cron_expression : null);
      }
      
      if (name === 'clustering' && ('enabled' in updates || 'cron_expression' in updates)) {
        const enabled = job.enabled;
        await scheduleClustering(enabled ? job.cron_expression : null);
      }
      
      return { success: true, job };
    } catch (error) {
      reply.code(400).send({ error: error.message });
    }
  });

  // Data management
  fastify.get('/api/settings/data/stats', async (request, reply) => {
    const db = getDb();
    
    const stats = {
      articles: db.prepare('SELECT COUNT(*) as count FROM articles').get().count,
      sources: db.prepare('SELECT COUNT(*) as count FROM sources').get().count,
      clusters: db.prepare('SELECT COUNT(*) as count FROM clusters').get().count,
      entities: db.prepare('SELECT COUNT(*) as count FROM entities').get().count,
      cache_entries: db.prepare('SELECT COUNT(*) as count FROM llm_analysis_cache').get().count,
      database_size: db.prepare("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()").get().size
    };
    
    return stats;
  });

  // Clear cache
  fastify.post('/api/settings/data/clear-cache', async (request, reply) => {
    const { type } = request.body;
    
    if (type === 'llm') {
      LLMCache.clear();
    }
    
    return { success: true };
  });

  // Trigger manual clustering
  fastify.post('/api/settings/trigger-clustering', async (request, reply) => {
    try {
      const { runClustering } = await import('../jobs/cluster.js');
      const result = await runClustering();
      return { success: true, ...result };
    } catch (error) {
      reply.code(500).send({ error: error.message });
    }
  });

  // Clear all clusters
  fastify.post('/api/settings/data/clear-clusters', async (request, reply) => {
    const db = getDb();
    
    try {
      // Delete article-cluster mappings first
      db.prepare('DELETE FROM article_clusters').run();
      // Then delete clusters
      const result = db.prepare('DELETE FROM clusters').run();
      
      return { success: true, deleted: result.changes };
    } catch (error) {
      reply.code(500).send({ error: error.message });
    }
  });

  // Clean old data
  fastify.post('/api/settings/data/cleanup', async (request, reply) => {
    const { days = 30 } = request.body;
    const db = getDb();
    
    // Special case: 0 days means delete ALL articles
    const cutoff = days === 0 
      ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // Tomorrow's date to catch everything
      : new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    // First, delete related records
    // Delete entities for these articles
    db.prepare(`
      DELETE FROM entities 
      WHERE article_id IN (
        SELECT id FROM articles 
        WHERE published_at < ?
      )
    `).run(cutoff);
    
    // Delete embeddings for these articles
    db.prepare(`
      DELETE FROM embeddings 
      WHERE article_id IN (
        SELECT id FROM articles 
        WHERE published_at < ?
      )
    `).run(cutoff);
    
    // Delete LLM cache for these articles
    db.prepare(`
      DELETE FROM llm_analysis_cache 
      WHERE article_id IN (
        SELECT id FROM articles 
        WHERE published_at < ?
      )
    `).run(cutoff);
    
    // Delete article-cluster mappings for these articles
    db.prepare(`
      DELETE FROM article_clusters 
      WHERE article_id IN (
        SELECT id FROM articles 
        WHERE published_at < ?
      )
    `).run(cutoff);
    
    // Now delete the articles themselves
    const result = db.prepare(`
      DELETE FROM articles 
      WHERE published_at < ?
    `).run(cutoff);
    
    return { success: true, deleted: result.changes };
  });

  // Export data
  fastify.get('/api/settings/data/export', async (request, reply) => {
    const { type } = request.query;
    const db = getDb();
    
    let data = {};
    
    if (type === 'sources' || type === 'all') {
      data.sources = db.prepare('SELECT * FROM sources').all();
    }
    
    if (type === 'settings' || type === 'all') {
      data.settings = Settings.getByCategory();
    }
    
    if (type === 'articles' || type === 'all') {
      data.articles = db.prepare('SELECT * FROM articles ORDER BY published_at DESC LIMIT 1000').all();
    }
    
    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="open-news-export-${Date.now()}.json"`);
    return data;
  });
}

// Helper function to check adapter configuration
function checkAdapterConfig(adapter) {
  switch (adapter) {
    case 'openai':
      return !!process.env.OPENAI_API_KEY;
    case 'anthropic':
      return !!process.env.ANTHROPIC_API_KEY;
    case 'gemini':
      return !!process.env.GEMINI_API_KEY;
    case 'lmstudio':
      return true; // Always available if server is running
    case 'ollama':
      return true; // Always available if server is running
    default:
      return false;
  }
}