import React from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Clusters from './pages/Clusters';
import ClusterDetail from './pages/ClusterDetail';
import Articles from './pages/Articles';
import Sources from './pages/Sources';

function App() {
  return (
    <Router>
      <div className="app">
        <header className="header">
          <div className="container">
            <div className="header-content">
              <NavLink to="/" className="logo">
                📰 Open News
              </NavLink>
              <nav className="nav">
                <NavLink to="/" className={({ isActive }) => isActive ? 'active' : ''}>
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
              </nav>
            </div>
          </div>
        </header>
        
        <main className="main">
          <div className="container">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/clusters" element={<Clusters />} />
              <Route path="/clusters/:id" element={<ClusterDetail />} />
              <Route path="/articles" element={<Articles />} />
              <Route path="/sources" element={<Sources />} />
            </Routes>
          </div>
        </main>
      </div>
    </Router>
  );
}

export default App;