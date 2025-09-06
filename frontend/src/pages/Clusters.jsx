import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { newsAPI } from '../services/api';

function Clusters() {
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadClusters();
  }, []);

  async function loadClusters() {
    try {
      setLoading(true);
      const data = await newsAPI.getClusters(100, 0);
      setClusters(data.clusters);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="loading">Loading clusters...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div className="clusters-page">
      <h1>News Clusters</h1>
      <p style={{ color: '#6b7280', marginBottom: '30px' }}>
        Stories grouped by topic, showing coverage across the political spectrum. 
        Click any cluster to see how different sources frame the same story.
      </p>
      
      <div className="info-box" style={{ marginBottom: '30px', padding: '15px', background: '#eff6ff', borderRadius: '8px' }}>
        💡 <strong>Understanding Clusters:</strong> Each cluster represents the same news story covered by multiple sources. 
        The colored badges show how many articles from each political perspective (left, center, right) are covering this story. 
        This helps you see which stories are getting attention from which parts of the media spectrum.
      </div>

      <div className="clusters-grid">
        {clusters.map(cluster => (
          <div key={cluster.id} className="card">
            <Link to={`/clusters/${cluster.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <h2 style={{ marginBottom: '10px', fontSize: '18px' }}>{cluster.title}</h2>
              <p style={{ color: '#6b7280', marginBottom: '15px' }}>{cluster.summary}</p>
              
              {cluster.fact_core && (
                <div style={{ background: '#f3f4f6', padding: '10px', borderRadius: '4px', marginBottom: '15px' }}>
                  <strong style={{ fontSize: '12px', color: '#4b5563' }}>FACTS:</strong>
                  <p style={{ fontSize: '14px', marginTop: '5px' }}>{cluster.fact_core}</p>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {Object.entries(cluster.bias_distribution || {}).map(([bias, count]) => (
                    count > 0 && (
                      <span key={bias} className={`bias-badge bias-${bias}`}>
                        {count}
                      </span>
                    )
                  ))}
                </div>
                <span style={{ color: '#6b7280', fontSize: '14px' }}>
                  {cluster.article_count} articles
                </span>
              </div>
            </Link>
          </div>
        ))}
      </div>

      {clusters.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
          <p style={{ color: '#6b7280' }}>No clusters found. Run ingestion to fetch articles first.</p>
        </div>
      )}
    </div>
  );
}

export default Clusters;