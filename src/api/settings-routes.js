import { Settings, ScheduledJobs, LLMCache } from '../db/settings-model.js';
import { Source } from '../db/models.js';
import { getLLMManager } from '../llm/manager.js';
import { scheduleIngestion, scheduleClustering, scheduleBackup, scheduleCleanup } from '../jobs/scheduler.js';
import { getDb } from '../db/index.js';
import fs from 'fs/promises';
import path from 'path';
import { requireAdminAuth, isAuthConfigured } from '../middleware/auth.js';
import {
  sourceBodySchema,
  sourceUpdateSchema,
  settingsUpdateSchema,
  apiKeysSchema,
  jobUpdateSchema,
  cleanupBodySchema,
  importBodySchema,
  idParamSchema,
  createErrorResponse
} from '../middleware/validation.js';

export async function registerSettingsRoutes(fastify) {

  // Get all settings (public - read-only)
  fastify.get('/api/settings', async (request, reply) => {
    const { category } = request.query;

    if (category) {
      return Settings.getAll(category);
    }

    return Settings.getByCategory();
  });

  // Update settings (requires auth)
  fastify.put('/api/settings', {
    preHandler: requireAdminAuth,
    schema: {
      body: settingsUpdateSchema
    }
  }, async (request, reply) => {
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
      request.log.error({ err: error }, 'Failed to update settings');
      return reply.code(400).send(createErrorResponse(
        'UPDATE_FAILED',
        error.message
      ));
    }
  });

  // Reset settings (requires auth)
  fastify.post('/api/settings/reset', {
    preHandler: requireAdminAuth
  }, async (request, reply) => {
    const { category, key } = request.body || {};

    if (key) {
      Settings.reset(key);
    } else {
      Settings.resetAll(category);
    }

    return { success: true, settings: Settings.getByCategory() };
  });

  // Get models for a specific adapter (public)
  fastify.get('/api/settings/llm/adapters/:adapter/models', async (request, reply) => {
    const { adapter } = request.params;

    try {
      let models = [];

      switch(adapter) {
        case 'ollama':
          try {
            const ollamaUrl = process.env.OLLAMA_BASE_URL || process.env.OLLAMA_HOST || 'http://localhost:11434';
            const ollamaResponse = await fetch(`${ollamaUrl}/api/tags`);
            if (ollamaResponse.ok) {
              const data = await ollamaResponse.json();
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
          try {
            const openaiUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
            const openaiKey = process.env.OPENAI_API_KEY || '';
            const openaiResponse = await fetch(`${openaiUrl}/models`, {
              headers: openaiKey ? { 'Authorization': `Bearer ${openaiKey}` } : {}
            });
            if (openaiResponse.ok) {
              const data = await openaiResponse.json();
              models = (data.data || []).map(m => ({
                id: m.id,
                name: m.id
              }));
            }
          } catch (e) {
            // Fallback to common models
            models = [
              { id: 'gpt-4-turbo-preview', name: 'GPT-4 Turbo' },
              { id: 'gpt-4', name: 'GPT-4' },
              { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
            ];
          }
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
      request.log.error({ err: error }, 'Failed to get adapter models');
      return reply.code(500).send(createErrorResponse(
        'FETCH_FAILED',
        error.message
      ));
    }
  });

  // LLM adapter management (public - read-only)
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

  // Test LLM adapter (public)
  fastify.post('/api/settings/llm/test', async (request, reply) => {
    const { adapter } = request.body || {};

    if (!adapter) {
      return reply.code(400).send(createErrorResponse(
        'VALIDATION_ERROR',
        'Adapter name is required'
      ));
    }

    const manager = getLLMManager();

    try {
      const result = await manager.testAdapter(adapter);
      return { success: result.success, message: result.response || result.error };
    } catch (error) {
      return reply.code(400).send(createErrorResponse(
        'TEST_FAILED',
        error.message
      ));
    }
  });

  // Get API keys status (public - only shows boolean status)
  fastify.get('/api/settings/api-keys', async (request, reply) => {
    return {
      openai: !!process.env.OPENAI_API_KEY,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      gemini: !!process.env.GEMINI_API_KEY,
      lmstudio: !!process.env.LMSTUDIO_API_KEY,
      authRequired: isAuthConfigured()
    };
  });

  // Update API keys (requires auth - sensitive operation)
  fastify.put('/api/settings/api-keys', {
    preHandler: requireAdminAuth,
    schema: {
      body: apiKeysSchema
    }
  }, async (request, reply) => {
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
      request.log.error({ err: error }, 'Failed to update API keys');
      return reply.code(500).send(createErrorResponse(
        'UPDATE_FAILED',
        'Failed to update API keys'
      ));
    }
  });

  // Source management (public - read)
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

  // Add new source (requires auth)
  fastify.post('/api/settings/sources', {
    preHandler: requireAdminAuth,
    schema: {
      body: sourceBodySchema
    }
  }, async (request, reply) => {
    const sourceData = request.body;

    try {
      const id = Source.create(sourceData);
      const source = Source.getById(id);
      return { success: true, source };
    } catch (error) {
      request.log.error({ err: error }, 'Failed to create source');
      return reply.code(400).send(createErrorResponse(
        'CREATE_FAILED',
        error.message
      ));
    }
  });

  // Update source (requires auth)
  fastify.put('/api/settings/sources/:id', {
    preHandler: requireAdminAuth,
    schema: {
      params: idParamSchema,
      body: sourceUpdateSchema
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const updates = request.body;

    try {
      Source.update(parseInt(id), updates);
      const source = Source.getById(parseInt(id));
      return { success: true, source };
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update source');
      return reply.code(400).send(createErrorResponse(
        'UPDATE_FAILED',
        error.message
      ));
    }
  });

  // Delete source (requires auth)
  fastify.delete('/api/settings/sources/:id', {
    preHandler: requireAdminAuth,
    schema: {
      params: idParamSchema
    }
  }, async (request, reply) => {
    const { id } = request.params;

    try {
      Source.delete(parseInt(id));
      return { success: true };
    } catch (error) {
      request.log.error({ err: error }, 'Failed to delete source');
      return reply.code(400).send(createErrorResponse(
        'DELETE_FAILED',
        error.message
      ));
    }
  });

  // Toggle source active status (requires auth)
  fastify.post('/api/settings/sources/:id/toggle', {
    preHandler: requireAdminAuth,
    schema: {
      params: idParamSchema
    }
  }, async (request, reply) => {
    const { id } = request.params;

    try {
      const source = Source.getById(parseInt(id));
      if (!source) {
        return reply.code(404).send(createErrorResponse(
          'NOT_FOUND',
          'Source not found'
        ));
      }

      Source.update(parseInt(id), { active: source.active ? 0 : 1 });
      const updated = Source.getById(parseInt(id));
      return { success: true, source: updated };
    } catch (error) {
      request.log.error({ err: error }, 'Failed to toggle source');
      return reply.code(400).send(createErrorResponse(
        'UPDATE_FAILED',
        error.message
      ));
    }
  });

  // Get scheduled jobs (public - read-only)
  fastify.get('/api/settings/jobs', async (request, reply) => {
    return ScheduledJobs.getAll();
  });

  // Update scheduled job (requires auth)
  fastify.put('/api/settings/jobs/:name', {
    preHandler: requireAdminAuth,
    schema: {
      body: jobUpdateSchema
    }
  }, async (request, reply) => {
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

      if (name === 'backup' && ('enabled' in updates || 'cron_expression' in updates)) {
        const enabled = job.enabled;
        await scheduleBackup(enabled ? job.cron_expression : null);
      }

      if (name === 'cleanup' && ('enabled' in updates || 'cron_expression' in updates)) {
        const enabled = job.enabled;
        await scheduleCleanup(enabled ? job.cron_expression : null);
      }

      return { success: true, job };
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update job');
      return reply.code(400).send(createErrorResponse(
        'UPDATE_FAILED',
        error.message
      ));
    }
  });

  // Data management - stats (public)
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

  // Clear cache (requires auth)
  fastify.post('/api/settings/data/clear-cache', {
    preHandler: requireAdminAuth
  }, async (request, reply) => {
    const { type } = request.body || {};

    if (type === 'llm') {
      LLMCache.clear();
    }

    return { success: true };
  });

  // Trigger manual clustering (requires auth)
  fastify.post('/api/settings/trigger-clustering', {
    preHandler: requireAdminAuth
  }, async (request, reply) => {
    try {
      const { runClustering } = await import('../jobs/cluster.js');
      const result = await runClustering();
      return { success: true, ...result };
    } catch (error) {
      request.log.error({ err: error }, 'Clustering failed');
      return reply.code(500).send(createErrorResponse(
        'CLUSTERING_FAILED',
        error.message
      ));
    }
  });

  // Trigger manual backup (requires auth)
  fastify.post('/api/settings/trigger-backup', {
    preHandler: requireAdminAuth
  }, async (request, reply) => {
    try {
      const { runBackup } = await import('../jobs/backup.js');
      const result = await runBackup();
      return { success: true, ...result };
    } catch (error) {
      request.log.error({ err: error }, 'Backup failed');
      return reply.code(500).send(createErrorResponse(
        'BACKUP_FAILED',
        error.message
      ));
    }
  });

  // Trigger manual cleanup (requires auth)
  fastify.post('/api/settings/trigger-cleanup', {
    preHandler: requireAdminAuth
  }, async (request, reply) => {
    try {
      const { runCleanup } = await import('../jobs/cleanup.js');
      const result = await runCleanup();
      return { success: true, ...result };
    } catch (error) {
      request.log.error({ err: error }, 'Cleanup failed');
      return reply.code(500).send(createErrorResponse(
        'CLEANUP_FAILED',
        error.message
      ));
    }
  });

  // Clear all clusters (requires auth - destructive)
  fastify.post('/api/settings/data/clear-clusters', {
    preHandler: requireAdminAuth
  }, async (request, reply) => {
    const db = getDb();

    try {
      // Delete article-cluster mappings first
      db.prepare('DELETE FROM article_clusters').run();
      // Then delete clusters
      const result = db.prepare('DELETE FROM clusters').run();

      return { success: true, deleted: result.changes };
    } catch (error) {
      request.log.error({ err: error }, 'Failed to clear clusters');
      return reply.code(500).send(createErrorResponse(
        'DELETE_FAILED',
        error.message
      ));
    }
  });

  // Clean old data (requires auth - destructive)
  fastify.post('/api/settings/data/cleanup', {
    preHandler: requireAdminAuth,
    schema: {
      body: cleanupBodySchema
    }
  }, async (request, reply) => {
    const { days = 30 } = request.body || {};
    const db = getDb();

    // Validate days parameter
    if (typeof days !== 'number' || days < -1) {
      return reply.code(400).send(createErrorResponse(
        'VALIDATION_ERROR',
        'Days must be a number >= -1'
      ));
    }

    // Special case: -1 or 0 days means delete ALL articles
    const cutoff = (days === -1 || days === 0)
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

  // Export data (requires auth)
  fastify.get('/api/settings/data/export', {
    preHandler: requireAdminAuth
  }, async (request, reply) => {
    const { type } = request.query;
    const db = getDb();

    if (!type) {
      return reply.code(400).send(createErrorResponse(
        'VALIDATION_ERROR',
        'Export type is required (sources, settings, articles, or all)'
      ));
    }

    let data = {};

    if (type === 'sources' || type === 'all') {
      data.sources = db.prepare('SELECT * FROM sources').all();
    }

    if (type === 'settings' || type === 'all') {
      data.settings = Settings.getByCategory();
    }

    if (type === 'articles' || type === 'all') {
      data.articles = db.prepare('SELECT * FROM articles ORDER BY published_at DESC').all();
      data.clusters = db.prepare('SELECT * FROM clusters').all();
      data.article_clusters = db.prepare('SELECT * FROM article_clusters').all();
    }

    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="open-news-export-${type}-${Date.now()}.json"`);
    return data;
  });

  // Import data (requires auth - destructive potential)
  fastify.post('/api/settings/data/import', {
    preHandler: requireAdminAuth,
    schema: {
      body: importBodySchema
    }
  }, async (request, reply) => {
    const { type, data, merge = false } = request.body;
    const db = getDb();

    if (!type || !data) {
      return reply.code(400).send(createErrorResponse(
        'VALIDATION_ERROR',
        'Type and data are required'
      ));
    }

    try {
      db.prepare('BEGIN TRANSACTION').run();

      let imported = {};

      // Import sources
      if (data.sources && (type === 'sources' || type === 'all')) {
        if (!merge) {
          db.prepare('DELETE FROM sources').run();
        }

        const insertSource = db.prepare(`
          INSERT OR REPLACE INTO sources (
            name, url, rss_url, api_url, bias, bias_score,
            scraping_enabled, active, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const source of data.sources) {
          insertSource.run(
            source.name, source.url, source.rss_url, source.api_url,
            source.bias, source.bias_score, source.scraping_enabled, source.active,
            source.notes
          );
        }
        imported.sources = data.sources.length;
      }

      // Import settings
      if (data.settings && (type === 'settings' || type === 'all')) {
        let count = 0;
        for (const category in data.settings) {
          for (const setting of data.settings[category]) {
            Settings.set(setting.key, setting.value);
            count++;
          }
        }
        imported.settings = count;
      }

      // Import articles and related data
      if (data.articles && (type === 'all')) {
        if (!merge) {
          // Clear existing data
          db.prepare('DELETE FROM article_clusters').run();
          db.prepare('DELETE FROM articles').run();
          db.prepare('DELETE FROM clusters').run();
        }

        // Import articles
        const insertArticle = db.prepare(`
          INSERT OR IGNORE INTO articles (
            source_id, title, url, author, published_at, excerpt,
            content, image_url, bias, bias_score, sentiment_score
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const article of data.articles) {
          insertArticle.run(
            article.source_id, article.title, article.url,
            article.author, article.published_at, article.excerpt,
            article.content, article.image_url, article.bias,
            article.bias_score, article.sentiment_score
          );
        }
        imported.articles = data.articles.length;

        // Import clusters if present
        if (data.clusters) {
          const insertCluster = db.prepare(`
            INSERT OR REPLACE INTO clusters (
              title, summary, fact_core, confidence_score
            ) VALUES (?, ?, ?, ?)
          `);

          for (const cluster of data.clusters) {
            insertCluster.run(
              cluster.title, cluster.summary, cluster.fact_core,
              cluster.confidence_score
            );
          }
          imported.clusters = data.clusters.length;
        }

        // Import article_clusters if present
        if (data.article_clusters) {
          const insertMapping = db.prepare(`
            INSERT OR IGNORE INTO article_clusters (
              article_id, cluster_id, similarity_score
            ) VALUES (?, ?, ?)
          `);

          for (const mapping of data.article_clusters) {
            insertMapping.run(
              mapping.article_id, mapping.cluster_id,
              mapping.similarity_score
            );
          }
          imported.article_clusters = data.article_clusters.length;
        }
      }

      db.prepare('COMMIT').run();

      return {
        success: true,
        message: `Successfully imported data`,
        imported
      };
    } catch (error) {
      db.prepare('ROLLBACK').run();
      request.log.error({ err: error }, 'Import failed');
      return reply.code(500).send(createErrorResponse(
        'IMPORT_FAILED',
        error.message
      ));
    }
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
