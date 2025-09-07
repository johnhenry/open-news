import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { newsAPI } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { format } from 'date-fns';

function ClusterDetail() {
  const { id } = useParams();
  const [cluster, setCluster] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadClusterDetail();
  }, [id]);

  async function loadClusterDetail() {
    try {
      setLoading(true);
      const [clusterData, comparisonData] = await Promise.all([
        newsAPI.getCluster(id),
        newsAPI.getClusterComparison(id)
      ]);
      
      setCluster(clusterData);
      setComparison(comparisonData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <LoadingSpinner text="Loading cluster details..." />;
  if (error) return <div className="error">Error: {error}</div>;
  if (!cluster || !comparison) return null;

  const biasOrder = ['left', 'center-left', 'center', 'center-right', 'right'];

  return (
    <div className="cluster-detail">
      <Link to="/clusters" style={{ color: '#60a5fa', textDecoration: 'none', marginBottom: '20px', display: 'inline-block' }}>
        ← Back to Clusters
      </Link>

      <h1>{cluster.title}</h1>
      <p style={{ color: '#6b7280', marginBottom: '20px' }}>{cluster.summary}</p>

      {cluster.fact_core && (
        <div className="card" style={{ background: '#eff6ff', borderLeft: '4px solid #2563eb' }}>
          <h3 style={{ marginBottom: '10px' }}>📊 Consensus Facts</h3>
          <p>{cluster.fact_core}</p>
        </div>
      )}

      <div className="card">
        <h2>Bias Distribution</h2>
        <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
          {Object.entries(cluster.bias_distribution.percentages).map(([bias, percent]) => (
            <div key={bias} style={{ textAlign: 'center' }}>
              <div className={`bias-badge bias-${bias}`} style={{ marginBottom: '8px' }}>
                {bias}
              </div>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{percent}%</div>
              <div style={{ color: '#6b7280', fontSize: '14px' }}>
                {cluster.article_counts[bias]} articles
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '20px' }}>
          <strong>Diversity Score:</strong> {cluster.bias_distribution.diversity_score} / 1.00
        </div>
      </div>

      <div className="comparison-view" style={{ marginTop: '40px' }}>
        <h2>Side-by-Side Coverage Comparison</h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginTop: '20px' }}>
          {biasOrder.map(bias => {
            const articles = comparison.comparisons[bias] || [];
            
            return (
              <div key={bias} className="card" style={{ borderTop: `3px solid ${COLORS[bias]}` }}>
                <h3 className={`bias-badge bias-${bias}`} style={{ marginBottom: '15px' }}>
                  {bias.toUpperCase()}
                </h3>
                
                {articles.length > 0 ? (
                  articles.map(article => (
                    <div key={article.id} style={{ marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid #e5e7eb' }}>
                      <a href={article.url} target="_blank" rel="noopener noreferrer" 
                         style={{ color: '#1f2937', textDecoration: 'none' }}>
                        <h4 style={{ fontSize: '14px', marginBottom: '8px', lineHeight: '1.4' }}>
                          {article.title}
                        </h4>
                      </a>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        <div>{article.source_name}</div>
                        {article.published_at && (
                          <div>{format(new Date(article.published_at), 'MMM d, yyyy h:mm a')}</div>
                        )}
                      </div>
                      {article.excerpt && (
                        <p style={{ fontSize: '13px', marginTop: '8px', color: '#4b5563' }}>
                          {article.excerpt.substring(0, 150)}...
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <p style={{ color: '#9ca3af', fontSize: '14px' }}>
                    No coverage from {bias} sources
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const COLORS = {
  left: '#2563eb',
  'center-left': '#60a5fa',
  center: '#6b7280',
  'center-right': '#f59e0b',
  right: '#dc2626'
};

export default ClusterDetail;