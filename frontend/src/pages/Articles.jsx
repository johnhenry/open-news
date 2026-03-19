import React, { useState, useEffect, useCallback, useRef } from 'react';
import { newsAPI } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import SearchBar from '../components/SearchBar';
import { format } from 'date-fns';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function Articles() {
  const [articles, setArticles] = useState([]);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtering, setFiltering] = useState(false);
  const [searchParams, setSearchParams] = useState({});
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
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

  const loadArticles = useCallback(async (signal, params, currentPage, currentPageSize, isInitial = false) => {
    try {
      if (isInitial) {
        setLoading(true);
      } else {
        setFiltering(true);
      }
      setError(null);

      // Build API params
      const apiParams = {
        limit: currentPageSize,
        offset: currentPage * currentPageSize,
      };
      if (params.bias) apiParams.bias = params.bias;
      if (params.q) apiParams.q = params.q;
      if (params.from) apiParams.from = params.from;
      if (params.to) apiParams.to = params.to;
      if (params.source) apiParams.source = params.source;
      if (params.source_id) apiParams.source_id = params.source_id;

      let data;
      const hasFilters = params.q || params.bias || params.from || params.to || params.source;
      if (hasFilters) {
        data = await newsAPI.searchArticles(apiParams, { signal });
      } else {
        data = await newsAPI.getArticles(apiParams, { signal });
      }

      if (signal?.aborted) return;

      setArticles(data.articles || []);
      setTotalCount(data.total || 0);
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

    const isInitial = articles.length === 0 && page === 0;
    loadArticles(abortController.signal, searchParams, page, pageSize, isInitial);

    return () => {
      abortController.abort();
    };
  }, [searchParams, page, pageSize, loadArticles]);

  function handleSearch(params) {
    setPage(0);
    setSearchParams(prev => {
      const prevStr = JSON.stringify(prev);
      const nextStr = JSON.stringify(params);
      return prevStr === nextStr ? prev : params;
    });
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const rangeStart = totalCount === 0 ? 0 : page * pageSize + 1;
  const rangeEnd = Math.min((page + 1) * pageSize, totalCount);

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

      {totalCount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ fontSize: '14px', color: '#6b7280' }}>
            Showing {rangeStart}-{rangeEnd} of {totalCount}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}
              style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '14px' }}
            >
              {PAGE_SIZE_OPTIONS.map(n => (
                <option key={n} value={n}>{n} per page</option>
              ))}
            </select>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #d1d5db', background: page === 0 ? '#f3f4f6' : '#fff', cursor: page === 0 ? 'default' : 'pointer', fontSize: '14px' }}
            >
              Previous
            </button>
            <span style={{ fontSize: '14px', color: '#374151' }}>
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #d1d5db', background: page >= totalPages - 1 ? '#f3f4f6' : '#fff', cursor: page >= totalPages - 1 ? 'default' : 'pointer', fontSize: '14px' }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Articles;
