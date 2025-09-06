import axios from 'axios';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json'
  }
});

export const newsAPI = {
  async getStats() {
    const response = await api.get('/stats');
    return response.data;
  },

  async getClusters(limit = 50, offset = 0) {
    const response = await api.get('/clusters', { params: { limit, offset } });
    return response.data;
  },

  async getCluster(id) {
    const response = await api.get(`/clusters/${id}`);
    return response.data;
  },

  async getClusterComparison(id) {
    const response = await api.get(`/clusters/${id}/compare`);
    return response.data;
  },

  async getArticles(params = {}) {
    const response = await api.get('/articles', { params });
    return response.data;
  },

  async getSources() {
    const response = await api.get('/sources');
    return response.data;
  },

  async triggerIngestion(sourceId = null) {
    const response = await api.post('/ingest', { source_id: sourceId });
    return response.data;
  },

  async getIngestionLogs(limit = 20) {
    const response = await api.get('/ingestion/logs', { params: { limit } });
    return response.data;
  },

  // Settings endpoints
  async getSettings(category = null) {
    const response = await api.get('/settings', { params: { category } });
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
  async getLLMAdapters() {
    const response = await api.get('/settings/llm/adapters');
    return response.data;
  },

  async testLLMAdapter(adapter) {
    const response = await api.post('/settings/llm/test', { adapter });
    return response.data;
  },

  async getAPIKeys() {
    const response = await api.get('/settings/api-keys');
    return response.data;
  },

  async updateAPIKeys(keys) {
    const response = await api.put('/settings/api-keys', keys);
    return response.data;
  },

  // Source management
  async getSettingsSources() {
    const response = await api.get('/settings/sources');
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
  async getScheduledJobs() {
    const response = await api.get('/settings/jobs');
    return response.data;
  },

  async updateScheduledJob(name, updates) {
    const response = await api.put(`/settings/jobs/${name}`, updates);
    return response.data;
  },

  // Data management
  async getDataStats() {
    const response = await api.get('/settings/data/stats');
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

  async exportData(type) {
    const response = await api.get('/settings/data/export', { params: { type } });
    return response.data;
  }
};

export default api;