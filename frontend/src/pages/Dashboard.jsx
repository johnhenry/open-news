import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { newsAPI } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import BiasSpectrum from '../components/BiasSpectrum';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const COLORS = {
  left: '#2563eb',
  'center-left': '#60a5fa',
  center: '#6b7280',
  'center-right': '#f59e0b',
  right: '#dc2626'
};

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function Dashboard() {
  const [stats, setStats] = useState(null);
  const [recentClusters, setRecentClusters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [dataStats, setDataStats] = useState(null);
  const [ingestionLogs, setIngestionLogs] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboard = useCallback(async (signal) => {
    try {
      setLoading(true);
      setError(null);

      const [statsData, clustersData, jobsData, dataStatsData, logsData] = await Promise.all([
        newsAPI.getStats({ signal }),
        newsAPI.getClusters(5, 0, { signal }),
        newsAPI.getScheduledJobs({ signal }),
        newsAPI.getDataStats({ signal }),
        newsAPI.getIngestionLogs(10, { signal })
      ]);

      // Check if request was aborted
      if (signal?.aborted) return;

      setStats(statsData);
      setRecentClusters(clustersData.clusters);
      setJobs(Array.isArray(jobsData) ? jobsData : []);
      setDataStats(dataStatsData);
      setIngestionLogs(logsData.logs || []);
    } catch (err) {
      // Ignore abort/cancel errors (AbortError for fetch, CanceledError for axios)
      if (err.name === 'AbortError' || err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      setError(err.message);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    // Create abort controller for cleanup
    const abortController = new AbortController();

    loadDashboard(abortController.signal);

    // Cleanup function to abort pending requests on unmount
    return () => {
      abortController.abort();
    };
  }, [loadDashboard]);

  async function handleRefreshNow() {
    try {
      setRefreshing(true);
      await newsAPI.triggerIngestion();
      // Reload dashboard data after ingestion
      const abortController = new AbortController();
      await loadDashboard(abortController.signal);
    } catch (err) {
      setError('Failed to trigger ingestion: ' + err.message);
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) return <LoadingSpinner text="Loading dashboard..." />;
  if (error) return <div className="error">Error: {error}</div>;
  if (!stats) return null;

  const biasData = Object.entries(stats.articles_by_bias || {}).map(([bias, count]) => ({
    name: bias,
    value: count
  }));

  const ingestionJob = jobs.find(j => j.job_name === 'ingestion');
  const clusteringJob = jobs.find(j => j.job_name === 'clustering');

  function getJobConfig(job) {
    if (!job?.config) return null;
    try {
      return typeof job.config === 'string' ? JSON.parse(job.config) : job.config;
    } catch { return null; }
  }

  const clusteringConfig = getJobConfig(clusteringJob);

  return (
    <div className="dashboard">
      <h1>News Aggregator Dashboard</h1>
      <p className="page-description">
        Monitor news coverage across the political spectrum. Track how different sources
        cover the same stories to identify bias patterns and get a complete picture.
      </p>

      {/* Status Banner */}
      <div style={{
        background: '#f0f9ff',
        border: '1px solid #bae6fd',
        borderRadius: '8px',
        padding: '16px 20px',
        marginBottom: '24px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '20px',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', flex: 1 }}>
          {/* Ingestion Status */}
          <div style={{ minWidth: '200px' }}>
            <div style={{ fontWeight: '600', fontSize: '13px', color: '#0c4a6e', marginBottom: '4px' }}>
              Last Ingestion
            </div>
            {ingestionJob?.last_run ? (
              <div style={{ fontSize: '13px', color: '#1e3a5f' }}>
                <span style={{
                  display: 'inline-block',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: ingestionJob.status === 'success' ? '#10b981' : ingestionJob.status === 'error' ? '#ef4444' : '#6b7280',
                  marginRight: '6px'
                }} />
                {timeAgo(ingestionJob.last_run)}
                {ingestionJob.status === 'success' && ' - Success'}
                {ingestionJob.status === 'error' && ' - Failed'}
                {ingestionJob.status === 'running' && ' - Running...'}
              </div>
            ) : (
              <div style={{ fontSize: '13px', color: '#6b7280' }}>No runs yet</div>
            )}
            {ingestionJob?.next_run && (
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                Next: {new Date(ingestionJob.next_run).toLocaleString()}
              </div>
            )}
          </div>

          {/* Clustering Status */}
          <div style={{ minWidth: '200px' }}>
            <div style={{ fontWeight: '600', fontSize: '13px', color: '#0c4a6e', marginBottom: '4px' }}>
              Last Clustering
            </div>
            {clusteringJob?.last_run ? (
              <div style={{ fontSize: '13px', color: '#1e3a5f' }}>
                <span style={{
                  display: 'inline-block',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: clusteringJob.status === 'success' ? '#10b981' : clusteringJob.status === 'error' ? '#ef4444' : '#6b7280',
                  marginRight: '6px'
                }} />
                {timeAgo(clusteringJob.last_run)}
                {clusteringConfig?.clusters_created !== undefined && (
                  <span> - {clusteringConfig.clusters_created} new clusters</span>
                )}
                {clusteringJob.status === 'error' && ' - Failed'}
              </div>
            ) : (
              <div style={{ fontSize: '13px', color: '#6b7280' }}>No runs yet</div>
            )}
            {clusteringJob?.next_run && (
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                Next: {new Date(clusteringJob.next_run).toLocaleString()}
              </div>
            )}
          </div>
        </div>

        {/* Refresh Now Button */}
        <button
          onClick={handleRefreshNow}
          disabled={refreshing}
          style={{
            padding: '8px 16px',
            background: refreshing ? '#94a3b8' : '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: refreshing ? 'not-allowed' : 'pointer',
            fontSize: '13px',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            whiteSpace: 'nowrap'
          }}
        >
          {refreshing ? (
            <>
              <LoadingSpinner size="small" inline />
              Fetching...
            </>
          ) : (
            'Refresh Now'
          )}
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{dataStats?.articles ?? stats.total_articles}</div>
          <div className="stat-label">Total Articles</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{dataStats?.clusters ?? stats.total_clusters}</div>
          <div className="stat-label">News Clusters</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{dataStats?.sources ?? stats.active_sources}</div>
          <div className="stat-label">Active Sources</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.avg_cluster_size}</div>
          <div className="stat-label">Avg Cluster Size</div>
        </div>
      </div>

      {/* Activity Log */}
      {ingestionLogs.length > 0 && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <h2>Recent Activity</h2>
          <p className="section-hint">
            Latest ingestion results showing articles fetched from each source.
          </p>
          <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
            {ingestionLogs.map((log, i) => (
              <div key={log.id || i} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 12px',
                borderBottom: i < ingestionLogs.length - 1 ? '1px solid #f3f4f6' : 'none',
                fontSize: '13px'
              }}>
                <span style={{
                  display: 'inline-block',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  flexShrink: 0,
                  backgroundColor: log.status === 'success' ? '#10b981' : log.status === 'failure' ? '#ef4444' : '#f59e0b'
                }} />
                <span style={{ color: '#6b7280', minWidth: '70px', flexShrink: 0 }}>
                  {timeAgo(log.created_at)}
                </span>
                <span style={{ color: '#1f2937' }}>
                  {log.status === 'success' && (
                    <>Fetched <strong>{log.articles_fetched}</strong> articles from <strong>{log.source_name}</strong></>
                  )}
                  {log.status === 'partial' && (
                    <>Fetched <strong>{log.articles_fetched}</strong> articles from <strong>{log.source_name}</strong> (with errors)</>
                  )}
                  {log.status === 'failure' && (
                    <>Failed to fetch from <strong>{log.source_name}</strong>{log.error_message ? `: ${log.error_message.substring(0, 80)}` : ''}</>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2>Article Distribution by Bias</h2>
        <p className="section-hint">
          This chart shows the political leaning of your news sources. A balanced diet includes perspectives from across the spectrum.
        </p>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={biasData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {biasData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[entry.name]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <h2>Recent News Clusters</h2>
        <p className="section-hint">
          News clusters group similar stories from different sources, revealing how the same event is covered differently.
        </p>
        <div className="clusters-list">
          {recentClusters.map(cluster => (
            <div key={cluster.id} className="cluster-item" style={{ marginBottom: '20px', padding: '15px', background: '#f9fafb', borderRadius: '6px' }}>
              <Link to={`/clusters/${cluster.id}`} style={{ color: '#1f2937', textDecoration: 'none' }}>
                <h3 style={{ marginBottom: '8px' }}>{cluster.title}</h3>
                <p style={{ color: '#6b7280', marginBottom: '10px' }}>{cluster.summary}</p>
                <BiasSpectrum
                  distribution={cluster.bias_distribution || {}}
                  articles={cluster.articles || []}
                />
              </Link>
            </div>
          ))}
        </div>
        <Link to="/clusters" className="button" style={{ display: 'inline-block', marginTop: '20px' }}>
          View All Clusters
        </Link>
      </div>
    </div>
  );
}

export default Dashboard;
