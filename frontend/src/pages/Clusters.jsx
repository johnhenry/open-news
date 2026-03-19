import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { newsAPI } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import BiasSpectrum from '../components/BiasSpectrum';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function Clusters() {
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);

  const loadClusters = useCallback(async (signal, currentPage, currentPageSize) => {
    try {
      setLoading(true);
      setError(null);
      const data = await newsAPI.getClusters(currentPageSize, currentPage * currentPageSize, { signal });

      if (signal?.aborted) return;

      setClusters(data.clusters);
      setTotalCount(data.total || 0);
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
    loadClusters(abortController.signal, page, pageSize);

    return () => {
      abortController.abort();
    };
  }, [loadClusters, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const rangeStart = totalCount === 0 ? 0 : page * pageSize + 1;
  const rangeEnd = Math.min((page + 1) * pageSize, totalCount);

  if (loading) return <LoadingSpinner text="Loading clusters..." />;
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div className="clusters-page">
      <h1>News Clusters</h1>
      <p style={{ color: '#6b7280', marginBottom: '30px' }}>
        Stories grouped by topic, showing coverage across the political spectrum.
        Click any cluster to see how different sources frame the same story.
      </p>

      <div className="info-box" style={{ marginBottom: '30px', padding: '15px', background: '#eff6ff', borderRadius: '8px' }}>
        <strong>Understanding Clusters:</strong> Each cluster represents the same news story covered by multiple sources.
        The spectrum bar shows how many articles from each political perspective cover this story.
        Hover over any segment to see the source names. This helps you see which parts of the media spectrum are paying attention.
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

              <BiasSpectrum
                distribution={cluster.bias_distribution || {}}
                articles={cluster.articles || []}
              />
            </Link>
          </div>
        ))}
      </div>

      {clusters.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
          <p style={{ color: '#6b7280' }}>No clusters found. Run ingestion to fetch articles first.</p>
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

export default Clusters;
