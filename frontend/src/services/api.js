import axios from 'axios';

const API_BASE = '/api';

// Admin API key for protected routes (stored in localStorage)
const ADMIN_KEY_STORAGE = 'open_news_admin_key';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor to add admin key header if available
api.interceptors.request.use((config) => {
  const adminKey = localStorage.getItem(ADMIN_KEY_STORAGE);
  if (adminKey) {
    config.headers['X-Admin-Key'] = adminKey;
  }
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Transform error to include our standardized format
    if (error.response?.data?.error) {
      const apiError = new Error(error.response.data.message || 'API Error');
      apiError.code = error.response.data.code;
      apiError.details = error.response.data.details;
      apiError.status = error.response.status;
      throw apiError;
    }
    throw error;
  }
);

/**
 * Set the admin API key
 */
export function setAdminKey(key) {
  if (key) {
    localStorage.setItem(ADMIN_KEY_STORAGE, key);
  } else {
    localStorage.removeItem(ADMIN_KEY_STORAGE);
  }
}

/**
 * Check if admin key is set
 */
export function hasAdminKey() {
  return !!localStorage.getItem(ADMIN_KEY_STORAGE);
}

export const newsAPI = {
  async getStats(options = {}) {
    const response = await api.get('/stats', { signal: options.signal });
    return response.data;
  },

  async getClusters(limit = 50, offset = 0, options = {}) {
    const response = await api.get('/clusters', {
      params: { limit, offset },
      signal: options.signal
    });
    return response.data;
  },

  async getCluster(id, options = {}) {
    const response = await api.get(`/clusters/${id}`, { signal: options.signal });
    return response.data;
  },

  async getClusterComparison(id, options = {}) {
    const response = await api.get(`/clusters/${id}/compare`, { signal: options.signal });
    return response.data;
  },

  async deleteCluster(id) {
    const response = await api.delete(`/clusters/${id}`);
    return response.data;
  },

  async getArticles(params = {}, options = {}) {
    const response = await api.get('/articles', { params, signal: options.signal });
    return response.data;
  },

  async getSources(options = {}) {
    const response = await api.get('/sources', { signal: options.signal });
    return response.data;
  },

  async triggerIngestion(sourceId = null) {
    const response = await api.post('/ingest', { source_id: sourceId });
    return response.data;
  },

  async getIngestionLogs(limit = 20, options = {}) {
    const response = await api.get('/ingestion/logs', {
      params: { limit },
      signal: options.signal
    });
    return response.data;
  },

  // Settings mode
  async getSettingsMode(options = {}) {
    const response = await api.get('/settings/mode', { signal: options.signal });
    return response.data;
  },

  // Settings endpoints
  async getSettings(category = null, options = {}) {
    const response = await api.get('/settings', {
      params: { category },
      signal: options.signal
    });
    return response.data;
  },

  async updateSettings(updates) {
    const response = await api.put('/settings', updates);
    return response.data;
  },

  async resetSettings(options = {}) {
    const response = await api.post('/settings/reset', options);
    return response.data;
  },

  // LLM endpoints
  async getLLMAdapters(options = {}) {
    const response = await api.get('/settings/llm/adapters', { signal: options.signal });
    return response.data;
  },

  async testLLMAdapter(adapter) {
    const response = await api.post('/settings/llm/test', { adapter });
    return response.data;
  },

  async getAdapterModels(adapter, options = {}) {
    const response = await api.get(`/settings/llm/adapters/${adapter}/models`, {
      signal: options.signal
    });
    return response.data;
  },

  async getAPIKeys(options = {}) {
    const response = await api.get('/settings/api-keys', { signal: options.signal });
    return response.data;
  },

  async updateAPIKeys(keys) {
    const response = await api.put('/settings/api-keys', keys);
    return response.data;
  },

  // Source management
  async getSettingsSources(options = {}) {
    const response = await api.get('/settings/sources', { signal: options.signal });
    return response.data;
  },

  async createSource(source) {
    const response = await api.post('/settings/sources', source);
    return response.data;
  },

  async updateSource(id, updates) {
    const response = await api.put(`/settings/sources/${id}`, updates);
    return response.data;
  },

  async deleteSource(id) {
    const response = await api.delete(`/settings/sources/${id}`);
    return response.data;
  },

  async toggleSource(id) {
    const response = await api.post(`/settings/sources/${id}/toggle`);
    return response.data;
  },

  // Scheduled jobs
  async getScheduledJobs(options = {}) {
    const response = await api.get('/settings/jobs', { signal: options.signal });
    return response.data;
  },

  async updateScheduledJob(name, updates) {
    const response = await api.put(`/settings/jobs/${name}`, updates);
    return response.data;
  },

  // Alias for backwards compatibility
  async updateJob(name, updates) {
    return this.updateScheduledJob(name, updates);
  },

  // Data management
  async getDataStats(options = {}) {
    const response = await api.get('/settings/data/stats', { signal: options.signal });
    return response.data;
  },

  async clearCache(type) {
    const response = await api.post('/settings/data/clear-cache', { type });
    return response.data;
  },

  async cleanupData(days) {
    const response = await api.post('/settings/data/cleanup', { days });
    return response.data;
  },

  async triggerClustering() {
    const response = await api.post('/settings/trigger-clustering');
    return response.data;
  },

  async triggerBackup() {
    const response = await api.post('/settings/trigger-backup');
    return response.data;
  },

  async triggerCleanup() {
    const response = await api.post('/settings/trigger-cleanup');
    return response.data;
  },

  async clearClusters() {
    const response = await api.post('/settings/data/clear-clusters');
    return response.data;
  },

  async exportData(type) {
    const response = await api.get('/settings/data/export', { params: { type } });
    return response.data;
  },

  async importData(type, data, merge = false) {
    const response = await api.post('/settings/data/import', { type, data, merge });
    return response.data;
  },

  // Search endpoints (fall back gracefully if not available)
  async searchArticles(params = {}, options = {}) {
    try {
      const response = await api.get('/search', { params, signal: options.signal });
      return response.data;
    } catch (err) {
      if (err.name === 'AbortError' || err.name === 'CanceledError' || err.code === 'ERR_CANCELED') throw err;
      console.warn('Search API not available, falling back to articles endpoint');
      return this.getArticles(params, options);
    }
  },

  async searchClusters(params = {}, options = {}) {
    try {
      const response = await api.get('/clusters/search', { params, signal: options.signal });
      return response.data;
    } catch (err) {
      if (err.name === 'AbortError' || err.name === 'CanceledError' || err.code === 'ERR_CANCELED') throw err;
      console.warn('Cluster search API not available');
      return { clusters: [] };
    }
  },

  async getBlindspots(options = {}) {
    try {
      const response = await api.get('/clusters/blindspots', { signal: options.signal });
      return response.data;
    } catch (err) {
      if (err.name === 'AbortError' || err.name === 'CanceledError' || err.code === 'ERR_CANCELED') throw err;
      console.warn('Blindspots API not available yet');
      return null;
    }
  },

  async getClusterHeadlines(id, options = {}) {
    try {
      const response = await api.get(`/clusters/${id}/headlines`, { signal: options.signal });
      return response.data;
    } catch (err) {
      if (err.name === 'AbortError' || err.name === 'CanceledError' || err.code === 'ERR_CANCELED') throw err;
      console.warn('Headlines API not available yet');
      return null;
    }
  }
};

export default api;
