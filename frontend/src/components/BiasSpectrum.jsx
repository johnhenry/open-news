import React, { useState } from 'react';
import './BiasSpectrum.css';

const BIAS_CONFIG = [
  { key: 'left',         label: 'Left',         color: '#1d4ed8' },
  { key: 'center-left',  label: 'Center-Left',  color: '#60a5fa' },
  { key: 'center',       label: 'Center',        color: '#6b7280' },
  { key: 'center-right', label: 'Center-Right',  color: '#f59e0b' },
  { key: 'right',        label: 'Right',          color: '#dc2626' },
];

/**
 * BiasSpectrum - A horizontal bar showing source distribution across the political spectrum.
 *
 * Props:
 *   distribution  - Object like { left: 2, center: 5, right: 1 }
 *   articles      - Optional array of article objects (used for hover tooltips with source names)
 *   size          - "default" | "large" (large = taller bar, used on detail pages)
 *   showSummary   - Whether to show the "X sources from Y perspectives" line below
 */
function BiasSpectrum({ distribution = {}, articles = [], size = 'default', showSummary = true }) {
  const [hoveredSegment, setHoveredSegment] = useState(null);

  // Build segments from the ordered bias config
  const segments = BIAS_CONFIG.map(({ key, label, color }) => {
    const count = distribution[key] || 0;
    return { key, label, color, count };
  }).filter(s => s.count > 0);

  const total = segments.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) return null;

  const perspectives = segments.length;

  // Group articles by bias for tooltips
  const articlesByBias = {};
  if (articles.length > 0) {
    for (const article of articles) {
      const bias = article.bias || 'center';
      if (!articlesByBias[bias]) articlesByBias[bias] = [];
      articlesByBias[bias].push(article);
    }
  }

  const barHeight = size === 'large' ? 40 : 32;

  return (
    <div className={`bias-spectrum bias-spectrum--${size}`}>
      <div
        className="bias-spectrum__bar"
        style={{ height: `${barHeight}px` }}
        role="img"
        aria-label={`Bias spectrum: ${segments.map(s => `${s.label} ${s.count}`).join(', ')}`}
      >
        {segments.map((segment, i) => {
          const widthPercent = (segment.count / total) * 100;
          const isFirst = i === 0;
          const isLast = i === segments.length - 1;
          const sourceNames = (articlesByBias[segment.key] || [])
            .map(a => a.source_name)
            .filter(Boolean);
          const uniqueSources = [...new Set(sourceNames)];

          return (
            <div
              key={segment.key}
              className={`bias-spectrum__segment ${hoveredSegment === segment.key ? 'bias-spectrum__segment--active' : ''}`}
              style={{
                width: `${widthPercent}%`,
                backgroundColor: segment.color,
                borderRadius: isFirst && isLast
                  ? '6px'
                  : isFirst
                    ? '6px 0 0 6px'
                    : isLast
                      ? '0 6px 6px 0'
                      : '0',
              }}
              onMouseEnter={() => setHoveredSegment(segment.key)}
              onMouseLeave={() => setHoveredSegment(null)}
            >
              {widthPercent >= 14 && (
                <span className="bias-spectrum__count">{segment.count}</span>
              )}

              {hoveredSegment === segment.key && (
                <div className="bias-spectrum__tooltip">
                  <div className="bias-spectrum__tooltip-header">{segment.label}</div>
                  <div className="bias-spectrum__tooltip-count">
                    {segment.count} {segment.count === 1 ? 'article' : 'articles'}
                  </div>
                  {uniqueSources.length > 0 && (
                    <div className="bias-spectrum__tooltip-sources">
                      {uniqueSources.map(name => (
                        <div key={name} className="bias-spectrum__tooltip-source">{name}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend labels below bar */}
      <div className="bias-spectrum__labels">
        {segments.map(segment => {
          const widthPercent = (segment.count / total) * 100;
          return (
            <div
              key={segment.key}
              className="bias-spectrum__label"
              style={{ width: `${widthPercent}%` }}
            >
              {widthPercent >= 18 && (
                <span className="bias-spectrum__label-text">{segment.label}</span>
              )}
            </div>
          );
        })}
      </div>

      {showSummary && (
        <div className="bias-spectrum__summary">
          {total} {total === 1 ? 'source' : 'sources'} from {perspectives} {perspectives === 1 ? 'perspective' : 'perspectives'}
        </div>
      )}
    </div>
  );
}

export default BiasSpectrum;
