import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { newsAPI } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import BiasSpectrum from '../components/BiasSpectrum';
import ClusterCard from '../components/ClusterCard';
import SearchBar from '../components/SearchBar';
import BlindspotSection from '../components/BlindspotSection';

const SORT_OPTIONS = [
  { key: 'most_covered', label: 'Most Covered' },
  { key: 'most_recent', label: 'Most Recent' },
  { key: 'most_one_sided', label: 'Most One-Sided' },
];

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

function sortClusters(clusters, sortBy) {
  const sorted = [...clusters];
  switch (sortBy) {
    case 'most_covered':
      return sorted.sort((a, b) => {
        const aCount = a.article_count || a.articles?.length || 0;
        const bCount = b.article_count || b.articles?.length || 0;
        return bCount - aCount;
      });
    case 'most_recent':
      return sorted.sort((a, b) => {
        const aDate = new Date(a.updated_at || a.created_at || 0);
        const bDate = new Date(b.updated_at || b.created_at || 0);
        return bDate - aDate;
      });
    case 'most_one_sided': {
      return sorted.sort((a, b) => {
        const aDiversity = getDiversity(a);
        const bDiversity = getDiversity(b);
        return aDiversity - bDiversity;
      });
    }
    default:
      return sorted;
  }
}

function getDiversity(cluster) {
  const dist = cluster.bias_distribution || {};
  const values = Object.values(dist).filter(v => v > 0);
  if (values.length <= 1) return 0;
  const total = values.reduce((s, v) => s + v, 0);
  if (total === 0) return 0;
  // Shannon entropy normalized
  let entropy = 0;
  for (const v of values) {
    const p = v / total;
    if (p > 0) entropy -= p * Math.log2(p);
  }
  return entropy;
}

function Dashboard() {
  const [stats, setStats] = useState(null);
  const [allClusters, setAllClusters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [dataStats, setDataStats] = useState(null);
  const [ingestionLogs, setIngestionLogs] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState('most_covered');
  const [searchParams, setSearchParams] = useState({});
  const [newArticleCount, setNewArticleCount] = useState(0);
  const [showActivity, setShowActivity] = useState(false);
  const prevArticleCount = useRef(null);
  const pollIntervalRef = useRef(null);

  const loadDashboard = useCallback(async (signal) => {
    try {
      setLoading(true);
      setError(null);

      const [statsData, clustersData, jobsData, dataStatsData, logsData] = await Promise.all([
        newsAPI.getStats({ signal }),
        newsAPI.getClusters(100, 0, { signal }),
        newsAPI.getScheduledJobs({ signal }),
        newsAPI.getDataStats({ signal }),
        newsAPI.getIngestionLogs(10, { signal })
      ]);

      if (signal?.aborted) return;

      setStats(statsData);
      setAllClusters(clustersData.clusters);
      setJobs(Array.isArray(jobsData) ? jobsData : []);
      setDataStats(dataStatsData);
      setIngestionLogs(logsData.logs || []);

      // Track article count for "new articles" indicator
      const currentCount = dataStatsData?.articles ?? statsData.total_articles;
      if (prevArticleCount.current !== null && currentCount > prevArticleCount.current) {
        setNewArticleCount(currentCount - prevArticleCount.current);
      }
      prevArticleCount.current = currentCount;
    } catch (err) {
      if (err.name === 'AbortError' || err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      setError(err.message);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const abortController = new AbortController();
    loadDashboard(abortController.signal);

    return () => {
      abortController.abort();
    };
  }, [loadDashboard]);

  // Polling: refresh stats and jobs every 30 seconds
  useEffect(() => {
    pollIntervalRef.current = setInterval(async () => {
      try {
        const [dataStatsData, jobsData] = await Promise.all([
          newsAPI.getDataStats(),
          newsAPI.getScheduledJobs()
        ]);
        setDataStats(dataStatsData);
        setJobs(Array.isArray(jobsData) ? jobsData : []);

        const currentCount = dataStatsData?.articles;
        if (currentCount != null && prevArticleCount.current !== null && currentCount > prevArticleCount.current) {
          setNewArticleCount(currentCount - prevArticleCount.current);
        }
      } catch {
        // Silent fail for polling
      }
    }, 30000);

    return () => clearInterval(pollIntervalRef.current);
  }, []);

  async function handleRefreshNow() {
    try {
      setRefreshing(true);
      await newsAPI.triggerIngestion();
      setNewArticleCount(0);
      const abortController = new AbortController();
      await loadDashboard(abortController.signal);
    } catch (err) {
      setError('Failed to trigger ingestion: ' + err.message);
    } finally {
      setRefreshing(false);
    }
  }

  function handleDismissNewArticles() {
    prevArticleCount.current = dataStats?.articles ?? stats?.total_articles;
    setNewArticleCount(0);
    // Reload clusters
    const abortController = new AbortController();
    loadDashboard(abortController.signal);
  }

  function handleSearch(params) {
    setSearchParams(prev => {
      const prevStr = JSON.stringify(prev);
      const nextStr = JSON.stringify(params);
      return prevStr === nextStr ? prev : params;
    });
  }

  if (loading) return <LoadingSpinner text="Loading dashboard..." />;
  if (error) return <div className="error">Error: {error}</div>;
  if (!stats) return null;

  const ingestionJob = jobs.find(j => j.job_name === 'ingestion');
  const clusteringJob = jobs.find(j => j.job_name === 'clustering');

  function getJobConfig(job) {
    if (!job?.config) return null;
    try {
      return typeof job.config === 'string' ? JSON.parse(job.config) : job.config;
    } catch { return null; }
  }

  const clusteringConfig = getJobConfig(clusteringJob);

  // Filter clusters by search params
  let filteredClusters = allClusters;
  if (searchParams.q) {
    const q = searchParams.q.toLowerCase();
    filteredClusters = filteredClusters.filter(c =>
      (c.title || '').toLowerCase().includes(q) ||
      (c.summary || '').toLowerCase().includes(q)
    );
  }
  if (searchParams.bias) {
    const biases = searchParams.bias.split(',');
    filteredClusters = filteredClusters.filter(c => {
      const dist = c.bias_distribution || {};
      return biases.some(b => (dist[b] || 0) > 0);
    });
  }

  const displayedClusters = sortClusters(filteredClusters, sortBy);

  const totalArticles = dataStats?.articles ?? stats.total_articles;
  const totalClusters = dataStats?.clusters ?? stats.total_clusters;
  const totalSources = dataStats?.sources ?? stats.active_sources;

  return (
    <div className="dashboard">
      <div className="dashboard__hero">
        <h1>Open News</h1>
        <p className="page-description">
          See how stories are covered across the political spectrum. Compare perspectives and identify blind spots.
        </p>
      </div>

      {/* Status Banner */}
      <div className="dashboard__status-banner">
        <div className="dashboard__status-items">
          {/* Ingestion Status */}
          <div className="dashboard__status-item">
            <div className="dashboard__status-label">Last Ingestion</div>
            {ingestionJob?.last_run ? (
              <div className="dashboard__status-value">
                <span className={`dashboard__status-dot dashboard__status-dot--${ingestionJob.status === 'success' ? 'success' : ingestionJob.status === 'error' ? 'error' : 'idle'}`} />
                {timeAgo(ingestionJob.last_run)}
                {ingestionJob.status === 'success' && ' - Success'}
                {ingestionJob.status === 'error' && ' - Failed'}
                {ingestionJob.status === 'running' && ' - Running...'}
              </div>
            ) : (
              <div className="dashboard__status-value dashboard__status-value--empty">No runs yet</div>
            )}
            {ingestionJob?.next_run && (
              <div className="dashboard__status-next">
                Next: {new Date(ingestionJob.next_run).toLocaleString()}
              </div>
            )}
          </div>

          {/* Clustering Status */}
          <div className="dashboard__status-item">
            <div className="dashboard__status-label">Last Clustering</div>
            {clusteringJob?.last_run ? (
              <div className="dashboard__status-value">
                <span className={`dashboard__status-dot dashboard__status-dot--${clusteringJob.status === 'success' ? 'success' : clusteringJob.status === 'error' ? 'error' : 'idle'}`} />
                {timeAgo(clusteringJob.last_run)}
                {clusteringConfig?.clusters_created !== undefined && (
                  <span> - {clusteringConfig.clusters_created} new clusters</span>
                )}
                {clusteringJob.status === 'error' && ' - Failed'}
              </div>
            ) : (
              <div className="dashboard__status-value dashboard__status-value--empty">No runs yet</div>
            )}
            {clusteringJob?.next_run && (
              <div className="dashboard__status-next">
                Next: {new Date(clusteringJob.next_run).toLocaleString()}
              </div>
            )}
          </div>
        </div>

        <button
          onClick={handleRefreshNow}
          disabled={refreshing}
          className={`dashboard__refresh-btn ${refreshing ? 'dashboard__refresh-btn--loading' : ''}`}
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

      {/* Stats Bar */}
      <div className="dashboard__stats-bar">
        <div className="dashboard__stat">
          <span className="dashboard__stat-value">{totalClusters}</span>
          <span className="dashboard__stat-label">Stories Tracked</span>
        </div>
        <div className="dashboard__stat-divider" />
        <div className="dashboard__stat">
          <span className="dashboard__stat-value">{totalSources}</span>
          <span className="dashboard__stat-label">Sources</span>
        </div>
        <div className="dashboard__stat-divider" />
        <div className="dashboard__stat">
          <span className="dashboard__stat-value">{totalArticles}</span>
          <span className="dashboard__stat-label">Articles</span>
        </div>
        <div className="dashboard__stat-divider" />
        <div className="dashboard__stat">
          <span className="dashboard__stat-value">{stats.avg_cluster_size}</span>
          <span className="dashboard__stat-label">Avg Coverage</span>
        </div>
      </div>

      {/* New articles indicator */}
      {newArticleCount > 0 && (
        <div className="dashboard__new-articles" onClick={handleDismissNewArticles}>
          <span>{newArticleCount} new {newArticleCount === 1 ? 'article' : 'articles'} available</span>
          <span className="dashboard__new-articles-action">Click to refresh</span>
        </div>
      )}

      {/* Search */}
      <SearchBar onSearch={handleSearch} placeholder="Search stories..." />

      {/* Sort controls */}
      <div className="dashboard__sort-row">
        <h2 className="dashboard__section-title">
          Top Stories
          <span className="dashboard__cluster-count">{displayedClusters.length}</span>
        </h2>
        <div className="dashboard__sort-controls">
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.key}
              className={`dashboard__sort-btn ${sortBy === opt.key ? 'dashboard__sort-btn--active' : ''}`}
              onClick={() => setSortBy(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cluster Cards */}
      <div className="dashboard__clusters-grid">
        {displayedClusters.length > 0 ? (
          displayedClusters.map(cluster => (
            <ClusterCard key={cluster.id} cluster={cluster} />
          ))
        ) : (
          <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px' }}>
            <p style={{ color: '#6b7280' }}>
              {searchParams.q || searchParams.bias
                ? 'No stories match your search criteria.'
                : 'No story clusters yet. Run ingestion and clustering to get started.'}
            </p>
          </div>
        )}
      </div>

      {/* Blindspot / Coverage Gap Section */}
      <BlindspotSection />

      {/* Activity Log (collapsible) */}
      {ingestionLogs.length > 0 && (
        <div className="card">
          <div
            className="dashboard__activity-header"
            onClick={() => setShowActivity(!showActivity)}
            style={{ cursor: 'pointer' }}
          >
            <h2>Recent Activity</h2>
            <span className="dashboard__activity-toggle">
              {showActivity ? 'Hide' : 'Show'}
            </span>
          </div>
          {showActivity && (
            <>
              <p className="section-hint">
                Latest ingestion results showing articles fetched from each source.
              </p>
              <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                {ingestionLogs.map((log, i) => (
                  <div key={log.id || i} className="dashboard__activity-row">
                    <span className={`dashboard__status-dot dashboard__status-dot--${log.status === 'success' ? 'success' : log.status === 'failure' ? 'error' : 'warning'}`} />
                    <span className="dashboard__activity-time">
                      {timeAgo(log.created_at)}
                    </span>
                    <span className="dashboard__activity-text">
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
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default Dashboard;
