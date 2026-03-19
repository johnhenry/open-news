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

const BIAS_GROUPS = {
  left: { label: 'Left', biases: ['left'] },
  center: { label: 'Center', biases: ['center-left', 'center', 'center-right'] },
  right: { label: 'Right', biases: ['right'] },
};

function ClusterDetail() {
  const { id } = useParams();
  const [cluster, setCluster] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [headlines, setHeadlines] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const loadClusterDetail = useCallback(async (signal) => {
    try {
      setLoading(true);
      setError(null);

      const [clusterData, comparisonData, headlinesData] = await Promise.all([
        newsAPI.getCluster(id, { signal }),
        newsAPI.getClusterComparison(id, { signal }),
        newsAPI.getClusterHeadlines(id, { signal })
      ]);

      if (signal?.aborted) return;

      setCluster(clusterData);
      setComparison(comparisonData);
      setHeadlines(headlinesData);
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

    return () => {
      abortController.abort();
    };
  }, [loadClusterDetail]);

  // Set Open Graph meta tags for social sharing
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

    return () => {
      document.title = 'Open News';
    };
  }, [cluster]);

  async function handleShare() {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
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

  // Flatten all articles from comparison for the spectrum tooltip
  const allArticles = biasOrder.flatMap(bias =>
    (comparison.comparisons[bias] || []).map(a => ({ ...a, bias }))
  );

  // Build headline groups for the headline comparison section
  const headlineGroups = headlines ? headlines : buildHeadlineGroupsFromComparison(comparison);

  function buildHeadlineGroupsFromComparison(comp) {
    const groups = { left: [], center: [], right: [] };
    for (const bias of biasOrder) {
      const articles = comp.comparisons[bias] || [];
      let groupKey;
      if (bias === 'left') groupKey = 'left';
      else if (bias === 'right') groupKey = 'right';
      else groupKey = 'center';

      for (const a of articles) {
        groups[groupKey].push({
          title: a.title,
          source_name: a.source_name,
          url: a.url,
          bias
        });
      }
    }
    return groups;
  }

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
      <p style={{ color: '#6b7280', marginBottom: '20px' }}>{cluster.summary}</p>

      {cluster.fact_core && (
        <div className="card" style={{ background: '#eff6ff', borderLeft: '4px solid #2563eb' }}>
          <h3 style={{ marginBottom: '10px' }}>Consensus Facts</h3>
          <p>{cluster.fact_core}</p>
        </div>
      )}

      <div className="card">
        <h2>Coverage Spectrum</h2>
        <BiasSpectrum
          distribution={cluster.article_counts || cluster.bias_distribution?.counts || {}}
          articles={allArticles}
          size="large"
        />
        {cluster.bias_distribution?.diversity_score != null && (
          <div style={{ marginTop: '16px', color: '#6b7280', fontSize: '14px' }}>
            <strong>Diversity Score:</strong> {cluster.bias_distribution.diversity_score} / 1.00
          </div>
        )}
      </div>

      {/* Headline Comparison Section */}
      {headlineGroups && (
        <div className="card headline-comparison">
          <h2>Headline Comparison</h2>
          <p className="section-hint">
            See how different parts of the political spectrum frame this story through their headlines.
          </p>
          <div className="headline-comparison__grid">
            {Object.entries(BIAS_GROUPS).map(([groupKey, config]) => {
              const groupHeadlines = headlineGroups[groupKey] || [];
              const groupColor = groupKey === 'left' ? COLORS.left : groupKey === 'right' ? COLORS.right : COLORS.center;

              return (
                <div key={groupKey} className="headline-comparison__column">
                  <div className="headline-comparison__column-header" style={{ borderTopColor: groupColor }}>
                    {config.label}
                  </div>
                  {groupHeadlines.length > 0 ? (
                    groupHeadlines.map((h, i) => (
                      <div key={i} className="headline-comparison__item">
                        <a href={h.url} target="_blank" rel="noopener noreferrer" className="headline-comparison__title">
                          {h.title}
                        </a>
                        <span className="headline-comparison__source">{h.source_name}</span>
                      </div>
                    ))
                  ) : (
                    <div className="headline-comparison__empty">
                      No {config.label.toLowerCase()} coverage
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

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

export default ClusterDetail;
