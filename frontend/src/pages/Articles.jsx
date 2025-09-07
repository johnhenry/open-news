import React, { useState, useEffect } from 'react';
import { newsAPI } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { format } from 'date-fns';

function Articles() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [filtering, setFiltering] = useState(false);

  useEffect(() => {
    loadArticles();
  }, [filter]);

  async function loadArticles() {
    try {
      // Show different loading states for initial load vs filtering
      if (articles.length === 0) {
        setLoading(true);
      } else {
        setFiltering(true);
      }
      const params = filter !== 'all' ? { bias: filter } : {};
      const data = await newsAPI.getArticles(params);
      setArticles(data.articles);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setFiltering(false);
    }
  }

  if (loading) return <LoadingSpinner text="Loading articles..." />;
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div className="articles-page">
      <h1>Recent Articles</h1>
      
      <div style={{ marginBottom: '30px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <label>Filter by bias:</label>
        <select 
          value={filter} 
          onChange={(e) => setFilter(e.target.value)}
          disabled={filtering}
          style={{ padding: '8px', borderRadius: '4px', border: '1px solid #e5e7eb' }}
        >
          <option value="all">All</option>
          <option value="left">Left</option>
          <option value="center-left">Center-Left</option>
          <option value="center">Center</option>
          <option value="center-right">Center-Right</option>
          <option value="right">Right</option>
        </select>
        {filtering && <LoadingSpinner size="small" inline />}
      </div>

      <div className="articles-list">
        {articles.map(article => (
          <div key={article.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '10px' }}>
              <span className={`bias-badge bias-${article.source_bias}`}>
                {article.source_bias}
              </span>
              <span style={{ color: '#6b7280', fontSize: '14px' }}>
                {article.source_name}
              </span>
            </div>
            
            <a href={article.url} target="_blank" rel="noopener noreferrer" 
               style={{ color: '#1f2937', textDecoration: 'none' }}>
              <h2 style={{ fontSize: '18px', marginBottom: '10px' }}>{article.title}</h2>
            </a>
            
            {article.excerpt && (
              <p style={{ color: '#4b5563', marginBottom: '10px' }}>
                {article.excerpt.substring(0, 200)}...
              </p>
            )}
            
            <div style={{ display: 'flex', gap: '20px', fontSize: '14px', color: '#6b7280' }}>
              {article.author && <span>By {article.author}</span>}
              {article.published_at && (
                <span>{format(new Date(article.published_at), 'MMM d, yyyy h:mm a')}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {articles.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
          <p style={{ color: '#6b7280' }}>No articles found. Run ingestion to fetch articles.</p>
        </div>
      )}
    </div>
  );
}

export default Articles;