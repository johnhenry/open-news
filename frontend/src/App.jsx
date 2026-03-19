import React from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Clusters from './pages/Clusters';
import ClusterDetail from './pages/ClusterDetail';
import Articles from './pages/Articles';
import Sources from './pages/Sources';
import Settings from './pages/Settings';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <div className="app">
          <header className="header">
            <div className="container">
              <div className="header-content">
                <NavLink to="/" className="logo">
                  Open News
                </NavLink>
                <nav className="nav">
                  <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
                    Dashboard
                  </NavLink>
                  <NavLink to="/clusters" className={({ isActive }) => isActive ? 'active' : ''}>
                    Clusters
                  </NavLink>
                  <NavLink to="/articles" className={({ isActive }) => isActive ? 'active' : ''}>
                    Articles
                  </NavLink>
                  <NavLink to="/sources" className={({ isActive }) => isActive ? 'active' : ''}>
                    Sources
                  </NavLink>
                  <NavLink to="/settings" className={({ isActive }) => isActive ? 'active' : ''}>
                    Settings
                  </NavLink>
                </nav>
                {/* Mobile hamburger placeholder */}
                <button className="nav-mobile-toggle" aria-label="Toggle navigation">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
          </header>

          <main className="main">
            <div className="container">
              <ErrorBoundary>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/clusters" element={<Clusters />} />
                  <Route path="/clusters/:id" element={<ClusterDetail />} />
                  <Route path="/articles" element={<Articles />} />
                  <Route path="/sources" element={<Sources />} />
                  <Route path="/settings" element={<Settings />} />
                </Routes>
              </ErrorBoundary>
            </div>
          </main>
        </div>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
