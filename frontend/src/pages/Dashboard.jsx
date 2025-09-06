import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { newsAPI } from '../services/api';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

const COLORS = {
  left: '#2563eb',
  'center-left': '#60a5fa',
  center: '#6b7280',
  'center-right': '#f59e0b',
  right: '#dc2626'
};

function Dashboard() {
  const [stats, setStats] = useState(null);
  const [recentClusters, setRecentClusters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      setLoading(true);
      const [statsData, clustersData] = await Promise.all([
        newsAPI.getStats(),
        newsAPI.getClusters(5, 0)
      ]);
      
      setStats(statsData);
      setRecentClusters(clustersData.clusters);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="loading">Loading dashboard...</div>;
  if (error) return <div className="error">Error: {error}</div>;
  if (!stats) return null;

  const biasData = Object.entries(stats.articles_by_bias || {}).map(([bias, count]) => ({
    name: bias,
    value: count
  }));

  return (
    <div className="dashboard">
      <h1>News Aggregator Dashboard</h1>
      
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.total_articles}</div>
          <div className="stat-label">Total Articles</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.total_clusters}</div>
          <div className="stat-label">News Clusters</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.active_sources}</div>
          <div className="stat-label">Active Sources</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.avg_cluster_size}</div>
          <div className="stat-label">Avg Cluster Size</div>
        </div>
      </div>

      <div className="card">
        <h2>Article Distribution by Bias</h2>
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
        <div className="clusters-list">
          {recentClusters.map(cluster => (
            <div key={cluster.id} className="cluster-item" style={{ marginBottom: '20px', padding: '15px', background: '#f9fafb', borderRadius: '6px' }}>
              <Link to={`/clusters/${cluster.id}`} style={{ color: '#1f2937', textDecoration: 'none' }}>
                <h3 style={{ marginBottom: '8px' }}>{cluster.title}</h3>
                <p style={{ color: '#6b7280', marginBottom: '10px' }}>{cluster.summary}</p>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {Object.entries(cluster.bias_distribution || {}).map(([bias, count]) => (
                    count > 0 && (
                      <span key={bias} className={`bias-badge bias-${bias}`}>
                        {bias}: {count}
                      </span>
                    )
                  ))}
                </div>
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