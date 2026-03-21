import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { newsAPI } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import BiasSpectrum from '../components/BiasSpectrum';
import { format } from 'date-fns';

const COLORS = {
  left: '#2563eb',
  'center-left': '#60a5fa',
  center: '#6b7280',
  'center-right': '#f59e0b',
  right: '#dc2626'
};

const BIAS_LABELS = {
  left: 'Left',
  'center-left': 'Center-Left',
  center: 'Center',
  'center-right': 'Center-Right',
  right: 'Right'
};

function ClusterDetail() {
  const { id } = useParams();
  const [cluster, setCluster] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState('framing');

  const loadClusterDetail = useCallback(async (signal) => {
    try {
      setLoading(true);
      setError(null);

      const [clusterData, comparisonData] = await Promise.all([
        newsAPI.getCluster(id, { signal }),
        newsAPI.getClusterComparison(id, { signal }),
      ]);

      if (signal?.aborted) return;

      setCluster(clusterData);
      setComparison(comparisonData);
    } catch (err) {
      if (err.name === 'AbortError' || err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      setError(err.message);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [id]);

  useEffect(() => {
    const abortController = new AbortController();
    loadClusterDetail(abortController.signal);
    return () => abortController.abort();
  }, [loadClusterDetail]);

  useEffect(() => {
    if (!cluster) return;

    const setMeta = (property, content) => {
      let el = document.querySelector(`meta[property="${property}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('property', property);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    document.title = `${cluster.title} - Open News`;
    setMeta('og:title', cluster.title);
    setMeta('og:description', cluster.summary || 'Compare how different news sources cover this story.');
    setMeta('og:type', 'article');
    setMeta('og:url', window.location.href);

    return () => { document.title = 'Open News'; };
  }, [cluster]);

  async function handleShare() {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (loading) return <LoadingSpinner text="Loading cluster details..." />;
  if (error) return <div className="error">Error: {error}</div>;
  if (!cluster || !comparison) return null;

  const biasOrder = ['left', 'center-left', 'center', 'center-right', 'right'];

  // Flatten all articles for spectrum
  const allArticles = biasOrder.flatMap(bias =>
    (comparison.comparisons[bias] || []).map(a => ({ ...a, bias }))
  );

  // All articles sorted by date for framing view
  const allArticlesSorted = [...allArticles].sort(
    (a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0)
  );

  const totalSources = new Set(allArticles.map(a => a.source_name)).size;
  const biasesPresent = biasOrder.filter(b => (comparison.comparisons[b] || []).length > 0);

  return (
    <div className="cluster-detail">
      <div className="cluster-detail__nav">
        <Link to="/clusters" className="cluster-detail__back">
          &larr; Back to Clusters
        </Link>
        <button className="cluster-detail__share-btn" onClick={handleShare}>
          {copied ? 'Copied!' : 'Share'}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '4px' }}>
            <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
        </button>
      </div>

      <h1>{cluster.title}</h1>
      {cluster.summary && (
        <p style={{ color: '#4b5563', marginBottom: '20px', fontSize: '16px', lineHeight: 1.6 }}>{cluster.summary}</p>
      )}

      {cluster.fact_core && (
        <div className="card" style={{ background: '#eff6ff', borderLeft: '4px solid #2563eb', marginBottom: '24px' }}>
          <h3 style={{ marginBottom: '8px', fontSize: '15px' }}>Key Facts</h3>
          <p style={{ margin: 0, lineHeight: 1.6 }}>{cluster.fact_core}</p>
        </div>
      )}

      {/* Coverage Spectrum */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 style={{ margin: 0 }}>Coverage Spectrum</h2>
          <span style={{ fontSize: '14px', color: '#6b7280' }}>
            {allArticles.length} articles from {totalSources} sources across {biasesPresent.length} perspectives
          </span>
        </div>
        <BiasSpectrum
          distribution={cluster.article_counts || cluster.bias_distribution?.counts || {}}
          articles={allArticles}
          size="large"
        />
      </div>

      {/* View Toggle */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <button
          onClick={() => setViewMode('framing')}
          style={{
            padding: '8px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer',
            border: '1px solid #d1d5db',
            background: viewMode === 'framing' ? '#1f2937' : '#fff',
            color: viewMode === 'framing' ? '#fff' : '#374151',
          }}
        >
          Headline Framing
        </button>
        <button
          onClick={() => setViewMode('sources')}
          style={{
            padding: '8px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer',
            border: '1px solid #d1d5db',
            background: viewMode === 'sources' ? '#1f2937' : '#fff',
            color: viewMode === 'sources' ? '#fff' : '#374151',
          }}
        >
          By Source
        </button>
      </div>

      {/* Headline Framing View */}
      {viewMode === 'framing' && (
        <div className="card">
          <h2 style={{ marginBottom: '4px' }}>How Each Source Frames This Story</h2>
          <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '20px' }}>
            Compare headlines side-by-side to see framing differences across the political spectrum.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {allArticlesSorted.map((article, i) => (
              <div key={article.id || i} style={{
                display: 'grid',
                gridTemplateColumns: '140px 1fr',
                gap: '16px',
                padding: '14px 0',
                borderBottom: i < allArticlesSorted.length - 1 ? '1px solid #f3f4f6' : 'none',
                alignItems: 'start',
              }}>
                {/* Source + bias badge */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#fff',
                    backgroundColor: COLORS[article.bias] || COLORS.center,
                    width: 'fit-content',
                  }}>
                    {BIAS_LABELS[article.bias] || article.bias}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>
                    {article.source_name}
                  </span>
                  {article.published_at && (
                    <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                      {format(new Date(article.published_at), 'MMM d, h:mm a')}
                    </span>
                  )}
                </div>

                {/* Headline + excerpt */}
                <div>
                  <a href={article.url} target="_blank" rel="noopener noreferrer"
                     style={{ color: '#1f2937', textDecoration: 'none', fontWeight: 500, fontSize: '15px', lineHeight: 1.4 }}>
                    {article.title}
                  </a>
                  {article.excerpt && (
                    <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '6px', lineHeight: 1.5 }}>
                      {article.excerpt.substring(0, 200)}{article.excerpt.length > 200 ? '...' : ''}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By Source View */}
      {viewMode === 'sources' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          {biasOrder.map(bias => {
            const articles = comparison.comparisons[bias] || [];
            if (articles.length === 0) return null;

            return (
              <div key={bias} className="card" style={{ borderTop: `3px solid ${COLORS[bias]}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h3 style={{
                    display: 'inline-block', padding: '4px 10px', borderRadius: '6px', fontSize: '13px',
                    color: '#fff', backgroundColor: COLORS[bias], margin: 0,
                  }}>
                    {BIAS_LABELS[bias]}
                  </h3>
                  <span style={{ fontSize: '13px', color: '#9ca3af' }}>
                    {articles.length} article{articles.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {articles.map(article => (
                  <div key={article.id} style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #f3f4f6' }}>
                    <a href={article.url} target="_blank" rel="noopener noreferrer"
                       style={{ color: '#1f2937', textDecoration: 'none' }}>
                      <h4 style={{ fontSize: '14px', marginBottom: '6px', lineHeight: 1.4, fontWeight: 500 }}>
                        {article.title}
                      </h4>
                    </a>
                    <div style={{ fontSize: '12px', color: '#6b7280', display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontWeight: 500 }}>{article.source_name}</span>
                      {article.published_at && (
                        <>
                          <span>·</span>
                          <span>{format(new Date(article.published_at), 'MMM d, h:mm a')}</span>
                        </>
                      )}
                    </div>
                    {article.excerpt && (
                      <p style={{ fontSize: '13px', marginTop: '8px', color: '#4b5563', lineHeight: 1.5 }}>
                        {article.excerpt.substring(0, 150)}{article.excerpt.length > 150 ? '...' : ''}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ClusterDetail;
