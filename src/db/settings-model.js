import { getDb } from './index.js';

export class Settings {
  static get(key) {
    const db = getDb();
    const row = db.prepare('SELECT * FROM settings WHERE key = ?').get(key);
    if (!row) return null;
    
    // Convert value based on type
    if (row.type === 'boolean') return row.value === 'true';
    if (row.type === 'number') return parseFloat(row.value);
    if (row.type === 'json') return JSON.parse(row.value);
    return row.value;
  }

  static getAll(category = null) {
    const db = getDb();
    const query = category
      ? 'SELECT * FROM settings WHERE category = ? ORDER BY key'
      : 'SELECT * FROM settings ORDER BY category, key';
    
    const rows = category
      ? db.prepare(query).all(category)
      : db.prepare(query).all();
    
    return rows.map(row => ({
      ...row,
      value: this.parseValue(row.value, row.type),
      default_value: this.parseValue(row.default_value, row.type)
    }));
  }

  static getByCategory() {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM settings ORDER BY category, key').all();
    
    const categorized = {};
    for (const row of rows) {
      if (!categorized[row.category]) {
        categorized[row.category] = [];
      }
      categorized[row.category].push({
        ...row,
        value: this.parseValue(row.value, row.type),
        default_value: this.parseValue(row.default_value, row.type)
      });
    }
    
    return categorized;
  }

  static set(key, value) {
    const db = getDb();
    
    // Get the setting to check its type
    const setting = db.prepare('SELECT type FROM settings WHERE key = ?').get(key);
    if (!setting) {
      throw new Error(`Setting ${key} does not exist`);
    }
    
    // Convert value to string for storage
    let stringValue = value;
    if (setting.type === 'boolean') {
      stringValue = value ? 'true' : 'false';
    } else if (setting.type === 'json') {
      stringValue = JSON.stringify(value);
    } else {
      stringValue = String(value);
    }
    
    // Update the setting
    db.prepare(`
      UPDATE settings 
      SET value = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE key = ?
    `).run(stringValue, key);
    
    return this.get(key);
  }

  static bulkSet(settings) {
    const db = getDb();
    const stmt = db.prepare(`
      UPDATE settings 
      SET value = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE key = ?
    `);
    
    const transaction = db.transaction((settingsArray) => {
      for (const [key, value] of settingsArray) {
        const setting = db.prepare('SELECT type FROM settings WHERE key = ?').get(key);
        if (!setting) continue;
        
        let stringValue = value;
        if (setting.type === 'boolean') {
          stringValue = value ? 'true' : 'false';
        } else if (setting.type === 'json') {
          stringValue = JSON.stringify(value);
        } else {
          stringValue = String(value);
        }
        
        stmt.run(stringValue, key);
      }
    });
    
    transaction(Object.entries(settings));
    return true;
  }

  static reset(key) {
    const db = getDb();
    db.prepare(`
      UPDATE settings 
      SET value = default_value, updated_at = CURRENT_TIMESTAMP 
      WHERE key = ?
    `).run(key);
    
    return this.get(key);
  }

  static resetAll(category = null) {
    const db = getDb();
    const query = category
      ? 'UPDATE settings SET value = default_value, updated_at = CURRENT_TIMESTAMP WHERE category = ?'
      : 'UPDATE settings SET value = default_value, updated_at = CURRENT_TIMESTAMP';
    
    if (category) {
      db.prepare(query).run(category);
    } else {
      db.prepare(query).run();
    }
    
    return true;
  }

  static parseValue(value, type) {
    if (value === null || value === undefined) return null;
    if (type === 'boolean') return value === 'true';
    if (type === 'number') return parseFloat(value);
    if (type === 'json') {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return value;
  }

  // Helper methods for specific settings
  static isLLMEnabled() {
    return this.get('llm_enabled') === true;
  }

  static getLLMAdapter() {
    return this.get('llm_adapter');
  }

  static getIngestionInterval() {
    return this.get('ingestion_interval');
  }

  static getContentMode() {
    return this.get('content_mode');
  }

  static isIngestionEnabled() {
    return this.get('ingestion_enabled') === true;
  }

  static isClusteringEnabled() {
    return this.get('clustering_enabled') === true;
  }
}

export class ScheduledJobs {
  static getAll() {
    const db = getDb();
    return db.prepare('SELECT * FROM scheduled_jobs ORDER BY job_name').all();
  }

  static get(jobName) {
    const db = getDb();
    return db.prepare('SELECT * FROM scheduled_jobs WHERE job_name = ?').get(jobName);
  }

  static update(jobName, updates) {
    const db = getDb();
    const fields = [];
    const values = [];
    
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'config' && typeof value === 'object') {
        fields.push(`${key} = ?`);
        values.push(JSON.stringify(value));
      } else if (key === 'enabled' && typeof value === 'boolean') {
        fields.push(`${key} = ?`);
        values.push(value ? 1 : 0);
      } else {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }
    
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(jobName);
    
    const query = `UPDATE scheduled_jobs SET ${fields.join(', ')} WHERE job_name = ?`;
    db.prepare(query).run(...values);
    
    return this.get(jobName);
  }

  static setEnabled(jobName, enabled) {
    return this.update(jobName, { enabled: enabled ? 1 : 0 });
  }

  static updateLastRun(jobName, status = 'success') {
    return this.update(jobName, {
      last_run: new Date().toISOString(),
      status
    });
  }
}

export class LLMCache {
  static get(articleId, analysisType) {
    const db = getDb();
    const row = db.prepare(`
      SELECT * FROM llm_analysis_cache 
      WHERE article_id = ? AND analysis_type = ?
    `).get(articleId, analysisType);
    
    if (row && row.result) {
      try {
        row.result = JSON.parse(row.result);
      } catch {}
    }
    
    return row;
  }

  static set(articleId, analysisType, result, adapter, confidence = null) {
    const db = getDb();
    const resultStr = typeof result === 'object' ? JSON.stringify(result) : result;
    
    db.prepare(`
      INSERT OR REPLACE INTO llm_analysis_cache 
      (article_id, analysis_type, adapter_used, result, confidence, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(articleId, analysisType, adapter, resultStr, confidence);
    
    return true;
  }

  static clear(articleId = null) {
    const db = getDb();
    if (articleId) {
      db.prepare('DELETE FROM llm_analysis_cache WHERE article_id = ?').run(articleId);
    } else {
      db.prepare('DELETE FROM llm_analysis_cache').run();
    }
    return true;
  }

  static clearOld(ttlSeconds) {
    const db = getDb();
    const cutoff = new Date(Date.now() - ttlSeconds * 1000).toISOString();
    const result = db.prepare('DELETE FROM llm_analysis_cache WHERE created_at < ?').run(cutoff);
    return result.changes;
  }
}