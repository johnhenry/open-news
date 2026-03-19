import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { newsAPI } from '../services/api';
import './BlindspotSection.css';

function BlindspotSection() {
  const [blindspots, setBlindspots] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('left');

  useEffect(() => {
    const abortController = new AbortController();

    async function load() {
      try {
        const data = await newsAPI.getBlindspots({ signal: abortController.signal });
        if (!abortController.signal.aborted) {
          setBlindspots(data);
        }
      } catch (err) {
        if (err.name === 'AbortError' || err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        // Endpoint not available yet - that's fine
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    }

    load();
    return () => abortController.abort();
  }, []);

  if (loading || !blindspots) return null;

  const tabs = [
    { key: 'left', label: 'Left Blindspots', color: '#1d4ed8', description: 'Stories only covered by left-leaning sources' },
    { key: 'right', label: 'Right Blindspots', color: '#dc2626', description: 'Stories only covered by right-leaning sources' },
    { key: 'underreported', label: 'Underreported', color: '#6b7280', description: 'Stories with very few sources covering them' },
  ];

  const activeData = blindspots[activeTab] || [];

  return (
    <div className="blindspot-section card">
      <h2>Coverage Gaps</h2>
      <p className="section-hint">
        Identify stories that may be missing from parts of the political spectrum.
      </p>

      <div className="blindspot-tabs">
        {tabs.map(tab => (
          <button
            key={tab.key}
            className={`blindspot-tab ${activeTab === tab.key ? 'blindspot-tab--active' : ''}`}
            style={activeTab === tab.key ? { borderBottomColor: tab.color, color: tab.color } : {}}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
            {blindspots[tab.key]?.length > 0 && (
              <span className="blindspot-tab__count">{blindspots[tab.key].length}</span>
            )}
          </button>
        ))}
      </div>

      <p className="blindspot-description">
        {tabs.find(t => t.key === activeTab)?.description}
      </p>

      {activeData.length > 0 ? (
        <div className="blindspot-list">
          {activeData.slice(0, 5).map(cluster => (
            <Link
              key={cluster.id}
              to={`/clusters/${cluster.id}`}
              className="blindspot-item"
            >
              <div className="blindspot-item__title">{cluster.title}</div>
              <div className="blindspot-item__meta">
                {cluster.article_count || cluster.articles?.length || 0} articles
                {cluster.sources && ` from ${cluster.sources.length} sources`}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="blindspot-empty">
          No coverage gaps detected in this category.
        </div>
      )}
    </div>
  );
}

export default BlindspotSection;
