import React, { useState, useEffect, useRef } from 'react';
import { newsAPI } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import SearchBar from '../components/SearchBar';
import { format } from 'date-fns';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function LLMAnalysisPanel({ article }) {
  const hasLLMData = article.analysis_method === 'llm' && (
    article.llm_confidence != null || article.llm_reasoning || article.llm_indicators || article.llm_facts
  );

  if (!hasLLMData) return null;

  const indicators = (() => {
    try { return JSON.parse(article.llm_indicators || '[]'); } catch { return []; }
  })();
  const facts = (() => {
    try { return JSON.parse(article.llm_facts || '[]'); } catch { return []; }
  })();

  const confidencePct = article.llm_confidence != null ? Math.round(article.llm_confidence * 100) : null;

  // Don't show panel if reasoning is just an error message and nothing else useful
  const hasRealData = (article.llm_reasoning && !article.llm_reasoning.startsWith('Failed'))
    || indicators.length > 0 || facts.length > 0 || (confidencePct != null && confidencePct > 0);

  if (!hasRealData) return null;

  return (
    <div style={{
      marginTop: '10px', padding: '12px', background: '#faf5ff', borderRadius: '8px',
      border: '1px solid #e9d5ff', fontSize: '13px'
    }}>
      {/* Confidence + Reasoning on one line when short */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'start' }}>
        {confidencePct != null && confidencePct > 0 && (
          <div style={{ minWidth: '120px' }}>
            <span style={{ fontWeight: 600, color: '#6b21a8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Confidence</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
              <div style={{ width: '80px', height: '5px', background: '#e9d5ff', borderRadius: '3px' }}>
                <div style={{
                  width: `${confidencePct}%`, height: '100%', borderRadius: '3px',
                  background: confidencePct > 70 ? '#7c3aed' : confidencePct > 40 ? '#a78bfa' : '#c4b5fd'
                }} />
              </div>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#7c3aed' }}>{confidencePct}%</span>
            </div>
          </div>
        )}

        {article.llm_reasoning && !article.llm_reasoning.startsWith('Failed') && (
          <div style={{ flex: 1, minWidth: '200px' }}>
            <span style={{ fontWeight: 600, color: '#6b21a8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>AI Reasoning</span>
            <p style={{ margin: '4px 0 0', color: '#4b5563', lineHeight: 1.5 }}>{article.llm_reasoning}</p>
          </div>
        )}
      </div>

      {/* Indicators */}
      {indicators.length > 0 && (
        <div style={{ marginTop: '10px' }}>
          <span style={{ fontWeight: 600, color: '#6b21a8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Bias Indicators</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
            {indicators.map((ind, i) => (
              <span key={i} style={{
                display: 'inline-block', padding: '2px 8px', borderRadius: '12px',
                fontSize: '11px', background: '#ede9fe', color: '#7c3aed', border: '1px solid #c4b5fd'
              }}>
                {typeof ind === 'string' ? ind : ind.label || ind.indicator || JSON.stringify(ind)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Facts */}
      {facts.length > 0 && (
        <div style={{ marginTop: '10px' }}>
          <span style={{ fontWeight: 600, color: '#6b21a8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Extracted Facts</span>
          <ul style={{ margin: '4px 0 0', paddingLeft: '16px', color: '#4b5563', lineHeight: 1.6 }}>
            {facts.map((fact, i) => (
              <li key={i} style={{ marginBottom: '2px' }}>
                {fact.type && (
                  <span style={{
                    display: 'inline-block', padding: '1px 6px', borderRadius: '8px',
                    fontSize: '10px', fontWeight: 600, marginRight: '6px',
                    background: fact.type === 'statistic' ? '#dbeafe' : fact.type === 'quote' ? '#fef3c7' : fact.type === 'event' ? '#d1fae5' : '#f3f4f6',
                    color: fact.type === 'statistic' ? '#1d4ed8' : fact.type === 'quote' ? '#92400e' : fact.type === 'event' ? '#065f46' : '#374151'
                  }}>
                    {fact.type}
                  </span>
                )}
                {fact.claim || (typeof fact === 'string' ? fact : JSON.stringify(fact))}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Articles() {
  const [articles, setArticles] = useState([]);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchParams, setSearchParams] = useState({});
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const requestIdRef = useRef(0);

  // Load sources for filter dropdown (once)
  useEffect(() => {
    newsAPI.getSources().then(data => {
      const allSources = [];
      if (data?.by_bias) {
        for (const group of Object.values(data.by_bias)) {
          if (Array.isArray(group)) allSources.push(...group);
        }
      }
      setSources(allSources);
    }).catch(() => {});
  }, []);

  // Fetch articles whenever page, pageSize, or searchParams change
  useEffect(() => {
    const requestId = ++requestIdRef.current;

    async function fetchArticles() {
      try {
        setError(null);

        const apiParams = {
          limit: pageSize,
          offset: page * pageSize,
        };
        if (searchParams.bias) apiParams.bias = searchParams.bias;
        if (searchParams.q) apiParams.q = searchParams.q;
        if (searchParams.from) apiParams.from = searchParams.from;
        if (searchParams.to) apiParams.to = searchParams.to;
        if (searchParams.source) apiParams.source = searchParams.source;
        if (searchParams.source_id) apiParams.source_id = searchParams.source_id;
        if (searchParams.analysis_method) apiParams.analysis_method = searchParams.analysis_method;

        const hasFilters = searchParams.q || searchParams.bias || searchParams.from || searchParams.to || searchParams.source || searchParams.source_id || searchParams.analysis_method;

        let data;
        if (hasFilters) {
          data = await newsAPI.searchArticles(apiParams);
        } else {
          data = await newsAPI.getArticles(apiParams);
        }

        // Only apply if this is still the latest request
        if (requestId !== requestIdRef.current) return;

        setArticles(data.articles || []);
        setTotalCount(data.total || 0);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setError(err.message);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    }

    fetchArticles();
  }, [page, pageSize, searchParams]);

  function handleSearch(params) {
    setPage(0);
    setSearchParams(params);
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
        showAnalysisFilter={true}
        placeholder="Search articles..."
      />

      <div className="articles-list">
        {articles.map(article => (
          <div key={article.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '10px' }}>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span className={`bias-badge bias-${article.source_bias}`}>
                  {article.source_bias}
                </span>
                {article.analysis_method === 'llm' && (
                  <span style={{
                    display: 'inline-block', padding: '2px 7px', borderRadius: '10px',
                    fontSize: '11px', fontWeight: 600, letterSpacing: '0.02em',
                    background: '#ede9fe', color: '#7c3aed', border: '1px solid #c4b5fd'
                  }}>AI</span>
                )}
                {article.analysis_method === 'keyword' && (
                  <span style={{
                    display: 'inline-block', padding: '2px 7px', borderRadius: '10px',
                    fontSize: '11px', fontWeight: 600, letterSpacing: '0.02em',
                    background: '#ccfbf1', color: '#0d9488', border: '1px solid #99f6e4'
                  }}>KW</span>
                )}
              </div>
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

            <LLMAnalysisPanel article={article} />
          </div>
        ))}
      </div>

      {articles.length === 0 && (
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
