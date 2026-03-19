import React, { useState, useEffect, useCallback, useRef } from 'react';
import { newsAPI } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import SearchBar from '../components/SearchBar';
import { format } from 'date-fns';

function Articles() {
  const [articles, setArticles] = useState([]);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtering, setFiltering] = useState(false);
  const [searchParams, setSearchParams] = useState({});
  const abortControllerRef = useRef(null);

  // Load sources for filter dropdown
  useEffect(() => {
    async function loadSources() {
      try {
        const data = await newsAPI.getSources();
        const allSources = [];
        if (data?.by_bias) {
          for (const group of Object.values(data.by_bias)) {
            if (Array.isArray(group)) allSources.push(...group);
          }
        }
        setSources(allSources);
      } catch {
        // Non-critical
      }
    }
    loadSources();
  }, []);

  const loadArticles = useCallback(async (signal, params, isInitial = false) => {
    try {
      if (isInitial) {
        setLoading(true);
      } else {
        setFiltering(true);
      }
      setError(null);

      // Build API params
      const apiParams = {};
      if (params.bias) apiParams.bias = params.bias;
      if (params.q) apiParams.q = params.q;
      if (params.from) apiParams.from = params.from;
      if (params.to) apiParams.to = params.to;
      if (params.source) apiParams.source = params.source;

      let data;
      if (params.q) {
        data = await newsAPI.searchArticles(apiParams, { signal });
      } else {
        data = await newsAPI.getArticles(apiParams, { signal });
      }

      if (signal?.aborted) return;

      setArticles(data.articles || []);
    } catch (err) {
      if (err.name === 'AbortError' || err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      setError(err.message);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setFiltering(false);
      }
    }
  }, []);

  useEffect(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const isInitial = articles.length === 0;
    loadArticles(abortController.signal, searchParams, isInitial);

    return () => {
      abortController.abort();
    };
  }, [searchParams, loadArticles]);

  function handleSearch(params) {
    setSearchParams(params);
  }

  if (loading) return <LoadingSpinner text="Loading articles..." />;
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div className="articles-page">
      <h1>Recent Articles</h1>

      <SearchBar
        onSearch={handleSearch}
        sources={sources}
        showSourceFilter={true}
        placeholder="Search articles..."
      />

      {filtering && (
        <div style={{ textAlign: 'center', padding: '8px' }}>
          <LoadingSpinner size="small" inline text="Filtering..." />
        </div>
      )}

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

      {articles.length === 0 && !filtering && (
        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
          <p style={{ color: '#6b7280' }}>
            {searchParams.q || searchParams.bias
              ? 'No articles match your search criteria.'
              : 'No articles found. Run ingestion to fetch articles.'}
          </p>
        </div>
      )}
    </div>
  );
}

export default Articles;
