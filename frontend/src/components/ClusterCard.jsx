import React from 'react';
import { Link } from 'react-router-dom';
import BiasSpectrum from './BiasSpectrum';
import './ClusterCard.css';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function ClusterCard({ cluster }) {
  const articleCount = cluster.article_count || cluster.articles?.length || 0;
  const distribution = cluster.bias_distribution || {};
  const perspectiveCount = Object.values(distribution).filter(v => v > 0).length;

  // Find most recent article timestamp
  const latestDate = cluster.updated_at || cluster.created_at;

  return (
    <Link to={`/clusters/${cluster.id}`} className="cluster-card" style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="cluster-card__header">
        <span className="cluster-card__article-count">{articleCount} articles</span>
        {latestDate && (
          <span className="cluster-card__time">{timeAgo(latestDate)}</span>
        )}
      </div>

      <h3 className="cluster-card__title">{cluster.title}</h3>

      {cluster.summary && (
        <p className="cluster-card__summary">{cluster.summary}</p>
      )}

      <div className="cluster-card__spectrum">
        <BiasSpectrum
          distribution={distribution}
          articles={cluster.articles || []}
          showSummary={false}
        />
      </div>

      <div className="cluster-card__footer">
        <span className="cluster-card__coverage">
          Covered by {articleCount} {articleCount === 1 ? 'source' : 'sources'} from {perspectiveCount} {perspectiveCount === 1 ? 'perspective' : 'perspectives'}
        </span>
      </div>
    </Link>
  );
}

export default ClusterCard;
