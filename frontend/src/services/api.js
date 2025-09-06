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
  }
};

export default api;