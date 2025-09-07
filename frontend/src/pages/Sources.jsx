import React, { useState, useEffect } from 'react';
import { newsAPI } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';

function Sources() {
  const [sources, setSources] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ingesting, setIngesting] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loadSources();
  }, []);

  async function loadSources() {
    try {
      setLoading(true);
      const data = await newsAPI.getSources();
      setSources(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function showMessage(text, type = 'info') {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  }

  async function triggerIngestion(sourceId = null) {
    try {
      setIngesting(true);
      const result = await newsAPI.triggerIngestion(sourceId);
      showMessage(`Ingestion completed: ${result.results.length} sources processed`, 'success');
    } catch (err) {
      showMessage(`Ingestion failed: ${err.message}`, 'error');
    } finally {
      setIngesting(false);
    }
  }

  if (loading) return <LoadingSpinner text="Loading sources..." />;
  if (error) return <div className="error">Error: {error}</div>;
  if (!sources) return null;

  const biasOrder = ['left', 'center-left', 'center', 'center-right', 'right'];

  return (
    <div className="sources-page">
      {message && (
        <div className={`message message-${message.type}`} style={{
          padding: '1rem',
          marginBottom: '1rem',
          borderRadius: '4px',
          backgroundColor: message.type === 'success' ? '#d4edda' : '#f8d7da',
          color: message.type === 'success' ? '#155724' : '#721c24',
          border: `1px solid ${message.type === 'success' ? '#c3e6cb' : '#f5c6cb'}`
        }}>
          {message.text}
        </div>
      )}
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h1>News Sources</h1>
        <button 
          className="button" 
          onClick={() => triggerIngestion()}
          disabled={ingesting}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          {ingesting ? (
            <>
              <LoadingSpinner size="small" inline />
              Ingesting...
            </>
          ) : (
            'Trigger Full Ingestion'
          )}
        </button>
      </div>

      <div className="card" style={{ marginBottom: '30px' }}>
        <h3>Source Statistics</h3>
        <div style={{ display: 'flex', gap: '40px', marginTop: '20px' }}>
          <div>
            <span style={{ fontSize: '24px', fontWeight: 'bold' }}>{sources.total}</span>
            <span style={{ marginLeft: '10px', color: '#6b7280' }}>Total Sources</span>
          </div>
          {Object.entries(sources.by_bias).map(([bias, items]) => (
            <div key={bias}>
              <span style={{ fontSize: '24px', fontWeight: 'bold' }}>{items.length}</span>
              <span style={{ marginLeft: '10px', color: '#6b7280' }}>{bias}</span>
            </div>
          ))}
        </div>
      </div>

      {biasOrder.map(bias => (
        <div key={bias} className="card">
          <h2 className={`bias-badge bias-${bias}`} style={{ marginBottom: '20px' }}>
            {bias.toUpperCase()} SOURCES
          </h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
            {sources.by_bias[bias]?.map(source => (
              <div key={source.id} style={{ padding: '15px', background: '#f9fafb', borderRadius: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '16px', marginBottom: '5px' }}>
                      <a href={source.url} target="_blank" rel="noopener noreferrer" 
                         style={{ color: '#1f2937', textDecoration: 'none' }}>
                        {source.name}
                      </a>
                    </h3>
                    {source.notes && (
                      <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>
                        {source.notes}
                      </p>
                    )}
                    <div style={{ display: 'flex', gap: '10px', fontSize: '12px', color: '#9ca3af' }}>
                      {source.rss_url && <span>✓ RSS</span>}
                      {source.api_url && <span>✓ API</span>}
                      {source.scraping_enabled && <span>✓ Scraper</span>}
                      <span>Score: {source.bias_score}</span>
                    </div>
                  </div>
                  <button 
                    className="button" 
                    style={{ fontSize: '12px', padding: '5px 10px' }}
                    onClick={() => triggerIngestion(source.id)}
                    disabled={ingesting}
                  >
                    Ingest
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default Sources;