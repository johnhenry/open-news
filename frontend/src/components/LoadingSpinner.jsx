import React from 'react';
import './LoadingSpinner.css';

function LoadingSpinner({ 
  size = 'medium', 
  inline = false, 
  text = '', 
  overlay = false 
}) {
  const sizeClass = `spinner-${size}`;
  const containerClass = overlay ? 'loading-overlay' : (inline ? 'loading-inline' : 'loading-container');
  
  return (
    <div className={containerClass}>
      <div className={`loading-spinner ${sizeClass}`}>
        <div className="spinner"></div>
      </div>
      {text && <div className="loading-text">{text}</div>}
    </div>
  );
}

export default LoadingSpinner;