import React, { useState, useCallback, useEffect, useRef } from 'react';
import './SearchBar.css';

const BIAS_OPTIONS = [
  { key: 'left', label: 'Left', color: '#1d4ed8' },
  { key: 'center-left', label: 'Center-Left', color: '#60a5fa' },
  { key: 'center', label: 'Center', color: '#6b7280' },
  { key: 'center-right', label: 'Center-Right', color: '#f59e0b' },
  { key: 'right', label: 'Right', color: '#dc2626' },
];

const DATE_OPTIONS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'all', label: 'All Time' },
];

function getDateRange(key) {
  const now = new Date();
  switch (key) {
    case 'today': {
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { from: from.toISOString(), to: now.toISOString() };
    }
    case 'week': {
      const from = new Date(now);
      from.setDate(from.getDate() - 7);
      return { from: from.toISOString(), to: now.toISOString() };
    }
    case 'month': {
      const from = new Date(now);
      from.setMonth(from.getMonth() - 1);
      return { from: from.toISOString(), to: now.toISOString() };
    }
    default:
      return {};
  }
}

function SearchBar({ onSearch, sources = [], showSourceFilter = false, placeholder = 'Search stories...' }) {
  const [query, setQuery] = useState('');
  const [selectedBiases, setSelectedBiases] = useState([]);
  const [dateRange, setDateRange] = useState('all');
  const [selectedSource, setSelectedSource] = useState('');
  const debounceRef = useRef(null);

  const emitSearch = useCallback((q, biases, dr, source) => {
    const params = {};
    if (q.trim()) params.q = q.trim();
    if (biases.length > 0) params.bias = biases.join(',');
    const range = getDateRange(dr);
    if (range.from) params.from = range.from;
    if (range.to) params.to = range.to;
    if (source) params.source = source;
    onSearch(params);
  }, [onSearch]);

  // Debounce text input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      emitSearch(query, selectedBiases, dateRange, selectedSource);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, selectedBiases, dateRange, selectedSource, emitSearch]);

  function toggleBias(bias) {
    setSelectedBiases(prev =>
      prev.includes(bias) ? prev.filter(b => b !== bias) : [...prev, bias]
    );
  }

  const hasFilters = selectedBiases.length > 0 || dateRange !== 'all' || selectedSource;

  function clearFilters() {
    setQuery('');
    setSelectedBiases([]);
    setDateRange('all');
    setSelectedSource('');
  }

  return (
    <div className="search-bar">
      <div className="search-bar__input-row">
        <div className="search-bar__input-wrapper">
          <svg className="search-bar__icon" viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
          </svg>
          <input
            type="text"
            className="search-bar__input"
            placeholder={placeholder}
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {query && (
            <button className="search-bar__clear-input" onClick={() => setQuery('')} title="Clear search">
              &times;
            </button>
          )}
        </div>
      </div>

      <div className="search-bar__filters">
        <div className="search-bar__bias-chips">
          {BIAS_OPTIONS.map(opt => (
            <button
              key={opt.key}
              className={`search-bar__chip ${selectedBiases.includes(opt.key) ? 'search-bar__chip--active' : ''}`}
              style={selectedBiases.includes(opt.key) ? { backgroundColor: opt.color, borderColor: opt.color, color: '#fff' } : {}}
              onClick={() => toggleBias(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="search-bar__selects">
          <select
            className="search-bar__select"
            value={dateRange}
            onChange={e => setDateRange(e.target.value)}
          >
            {DATE_OPTIONS.map(opt => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>

          {showSourceFilter && sources.length > 0 && (
            <select
              className="search-bar__select"
              value={selectedSource}
              onChange={e => setSelectedSource(e.target.value)}
            >
              <option value="">All Sources</option>
              {sources.map(s => (
                <option key={s.id || s.name} value={s.id || s.name}>{s.name}</option>
              ))}
            </select>
          )}

          {hasFilters && (
            <button className="search-bar__clear-btn" onClick={clearFilters}>
              Clear Filters
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default SearchBar;
