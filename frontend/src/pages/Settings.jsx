import React, { useState, useEffect } from 'react';
import { newsAPI } from '../services/api';
import ConfirmDialog from '../components/ConfirmDialog';
import './Settings.css';

function Settings() {
  const [activeTab, setActiveTab] = useState('llm');
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  
  // LLM specific state
  const [adapters, setAdapters] = useState([]);
  const [testingAdapter, setTestingAdapter] = useState(null);
  
  // Sources state
  const [sources, setSources] = useState([]);
  const [editingSource, setEditingSource] = useState(null);
  const [showAddSource, setShowAddSource] = useState(false);
  
  // Jobs state
  const [jobs, setJobs] = useState([]);
  
  // Data stats
  const [dataStats, setDataStats] = useState(null);
  
  // Confirmation dialog state
  const [confirmAction, setConfirmAction] = useState(null);
  const [cleanupDays, setCleanupDays] = useState(30);

  useEffect(() => {
    loadSettings();
    loadAdditionalData();
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      const data = await newsAPI.getSettings();
      setSettings(data);
    } catch (err) {
      showMessage('Failed to load settings', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function loadAdditionalData() {
    try {
      // Load LLM adapters
      const adaptersData = await newsAPI.getLLMAdapters();
      setAdapters(adaptersData.adapters);
      
      // Load sources
      const sourcesData = await newsAPI.getSettingsSources();
      setSources(sourcesData.sources);
      
      // Load jobs
      const jobsData = await newsAPI.getScheduledJobs();
      setJobs(jobsData);
      
      // Load data stats
      const stats = await newsAPI.getDataStats();
      setDataStats(stats);
    } catch (err) {
      console.error('Failed to load additional data:', err);
    }
  }

  async function saveSettings(category = null) {
    try {
      setSaving(true);
      
      const updates = {};
      const categorySettings = category ? settings[category] : Object.values(settings).flat();
      
      categorySettings.forEach(setting => {
        updates[setting.key] = setting.value;
      });
      
      await newsAPI.updateSettings(updates);
      showMessage('Settings saved successfully', 'success');
      
      // Reload settings to get any server-side changes
      await loadSettings();
    } catch (err) {
      showMessage('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function resetSettings(category = null) {
    if (!confirm(`Reset ${category || 'all'} settings to defaults?`)) return;
    
    try {
      await newsAPI.resetSettings({ category });
      await loadSettings();
      showMessage('Settings reset to defaults', 'success');
    } catch (err) {
      showMessage('Failed to reset settings', 'error');
    }
  }

  async function testAdapter(adapterName) {
    try {
      setTestingAdapter(adapterName);
      const result = await newsAPI.testLLMAdapter(adapterName);
      
      if (result.success) {
        showMessage(`${adapterName} is working correctly`, 'success');
      } else {
        showMessage(`${adapterName} test failed: ${result.message}`, 'error');
      }
    } catch (err) {
      showMessage(`Failed to test ${adapterName}`, 'error');
    } finally {
      setTestingAdapter(null);
    }
  }

  async function saveSource(source) {
    try {
      if (source.id) {
        await newsAPI.updateSource(source.id, source);
      } else {
        await newsAPI.createSource(source);
      }
      
      await loadAdditionalData();
      setEditingSource(null);
      setShowAddSource(false);
      showMessage('Source saved successfully', 'success');
    } catch (err) {
      showMessage('Failed to save source', 'error');
    }
  }

  async function deleteSource(id) {
    if (!confirm('Delete this source?')) return;
    
    try {
      await newsAPI.deleteSource(id);
      await loadAdditionalData();
      showMessage('Source deleted', 'success');
    } catch (err) {
      showMessage('Failed to delete source', 'error');
    }
  }

  async function toggleSource(id) {
    try {
      await newsAPI.toggleSource(id);
      await loadAdditionalData();
    } catch (err) {
      showMessage('Failed to toggle source', 'error');
    }
  }

  async function updateJob(jobName, updates) {
    try {
      await newsAPI.updateScheduledJob(jobName, updates);
      await loadAdditionalData();
      showMessage('Job updated', 'success');
    } catch (err) {
      showMessage('Failed to update job', 'error');
    }
  }

  async function clearCache() {
    setConfirmAction({
      message: 'Clear all LLM cache?',
      onConfirm: async () => {
        try {
          await newsAPI.clearCache('llm');
          await loadAdditionalData();
          showMessage('Cache cleared', 'success');
        } catch (err) {
          showMessage('Failed to clear cache', 'error');
        }
        setConfirmAction(null);
      }
    });
  }

  async function cleanupData() {
    try {
      const days = parseInt(cleanupDays);
      const result = await newsAPI.cleanupData(days);
      await loadAdditionalData();
      const message = days === 0 
        ? `Deleted ${result.deleted} articles (cleared all)`
        : `Deleted ${result.deleted} articles older than ${days} days`;
      showMessage(message, 'success');
    } catch (err) {
      showMessage('Failed to cleanup data', 'error');
    }
  }

  async function exportData(type) {
    try {
      const data = await newsAPI.exportData(type);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `open-news-export-${type}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showMessage('Data exported', 'success');
    } catch (err) {
      showMessage('Failed to export data', 'error');
    }
  }

  async function triggerClustering() {
    try {
      showMessage('Running clustering...', 'info');
      const result = await newsAPI.triggerClustering();
      await loadAdditionalData();
      showMessage(`Clustering complete: ${result.clusters_created} clusters created from ${result.articles_processed} articles`, 'success');
    } catch (err) {
      showMessage('Failed to run clustering', 'error');
    }
  }

  async function clearClusters() {
    setConfirmAction({
      message: 'Clear all clusters? This will remove all article groupings.',
      onConfirm: async () => {
        try {
          const result = await newsAPI.clearClusters();
          await loadAdditionalData();
          showMessage(`Cleared ${result.deleted} clusters`, 'success');
        } catch (err) {
          showMessage('Failed to clear clusters', 'error');
        }
        setConfirmAction(null);
      }
    });
  }

  function showMessage(text, type) {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  }

  function updateSetting(category, key, value) {
    setSettings(prev => ({
      ...prev,
      [category]: prev[category].map(s => 
        s.key === key ? { ...s, value } : s
      )
    }));
  }

  if (loading) return <div className="loading">Loading settings...</div>;

  return (
    <div className="settings-page">
      <h1>Settings</h1>
      
      {message && (
        <div className={`message message-${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="settings-tabs">
        <button 
          className={activeTab === 'llm' ? 'active' : ''} 
          onClick={() => setActiveTab('llm')}
        >
          🤖 LLM Configuration
        </button>
        <button 
          className={activeTab === 'sources' ? 'active' : ''} 
          onClick={() => setActiveTab('sources')}
        >
          📰 Sources
        </button>
        <button 
          className={activeTab === 'ingestion' ? 'active' : ''} 
          onClick={() => setActiveTab('ingestion')}
        >
          ⚙️ Ingestion
        </button>
        <button 
          className={activeTab === 'data' ? 'active' : ''} 
          onClick={() => setActiveTab('data')}
        >
          🗄️ Data Management
        </button>
        <button 
          className={activeTab === 'content' ? 'active' : ''} 
          onClick={() => setActiveTab('content')}
        >
          🔬 Content & Research
        </button>
        <button 
          className={activeTab === 'display' ? 'active' : ''} 
          onClick={() => setActiveTab('display')}
        >
          🎨 Display
        </button>
      </div>

      <div className="settings-content">
        {activeTab === 'llm' && (
          <div className="settings-section">
            <h2>AI/LLM Configuration</h2>
            <p className="section-description">
              Configure AI-powered features for bias detection and fact extraction. 
              The system can use various AI providers to analyze articles automatically.
            </p>
            
            <div className="info-box">
              💡 <strong>Quick Setup:</strong> For local AI, install Ollama (brew install ollama) and run 'ollama serve'. 
              For cloud AI, add API keys to your .env file.
            </div>
            
            <div className="info-box" style={{marginTop: '1rem'}}>
              📊 <strong>Analysis Methods:</strong>
              <ul style={{marginTop: '0.5rem', marginBottom: 0, paddingLeft: '1.5rem'}}>
                <li><strong>Source Default:</strong> Use the source's configured bias (fastest, no processing)</li>
                <li><strong>Keyword-Based:</strong> Local sentiment and keyword analysis (moderate speed, privacy-focused)</li>
                <li><strong>LLM-Powered:</strong> AI-based bias detection (slowest, most accurate)</li>
              </ul>
            </div>
            
            <div className="adapters-grid">
              {adapters.map(adapter => (
                <div key={adapter.name} className={`adapter-card ${adapter.active ? 'active' : ''}`}>
                  <h3>{adapter.name.toUpperCase()}</h3>
                  <div className="adapter-status">
                    <span className={`status-dot ${adapter.available ? 'available' : 'unavailable'}`} />
                    {adapter.available ? 'Available' : 'Not Available'}
                  </div>
                  {!adapter.configured && adapter.name !== 'ollama' && adapter.name !== 'lmstudio' && (
                    <p className="warning">⚠️ API key required - Configure in .env file</p>
                  )}
                  {adapter.name === 'ollama' && !adapter.available && (
                    <p className="warning">⚠️ Ollama not running - Start with: ollama serve</p>
                  )}
                  {adapter.name === 'lmstudio' && !adapter.available && (
                    <p className="warning">⚠️ LM Studio not detected - Check if server is running on port 1234</p>
                  )}
                  {adapter.name === 'openai' && adapter.configured && !adapter.available && (
                    <p className="warning">⚠️ OpenAI API key configured but connection failed - Check your API key and internet connection</p>
                  )}
                  {adapter.name === 'gemini' && adapter.configured && !adapter.available && (
                    <p className="warning">⚠️ Gemini API key configured but connection failed - Check your API key and internet connection</p>
                  )}
                  <div className="adapter-actions">
                    <button 
                      onClick={() => testAdapter(adapter.name)}
                      disabled={!adapter.available || testingAdapter === adapter.name}
                    >
                      {testingAdapter === adapter.name ? 'Testing...' : 'Test'}
                    </button>
                    {!adapter.active && adapter.available && (
                      <button onClick={async () => {
                        try {
                          await newsAPI.updateSettings({ llm_adapter: adapter.name });
                          await loadSettings();
                          await loadAdditionalData();
                          showMessage(`${adapter.name} is now the active adapter`, 'success');
                        } catch (err) {
                          showMessage(`Failed to set ${adapter.name} as active`, 'error');
                        }
                      }}>
                        Set Active
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="settings-group">
              {settings.llm?.map(setting => (
                <div key={setting.key} className="setting-item">
                  <label>
                    <span className="setting-label">{setting.description}</span>
                    {setting.key === 'analysis_method' ? (
                      <select 
                        value={setting.value}
                        onChange={(e) => updateSetting('llm', setting.key, e.target.value)}
                      >
                        <option value="source_default">Source Default (No Analysis)</option>
                        <option value="keyword">Keyword-Based (Local)</option>
                        <option value="llm">LLM-Powered (AI)</option>
                      </select>
                    ) : setting.type === 'boolean' ? (
                      <input 
                        type="checkbox" 
                        checked={setting.value}
                        onChange={(e) => updateSetting('llm', setting.key, e.target.checked)}
                      />
                    ) : setting.type === 'number' ? (
                      <input 
                        type="number" 
                        value={setting.value}
                        step="0.1"
                        onChange={(e) => updateSetting('llm', setting.key, parseFloat(e.target.value))}
                      />
                    ) : (
                      <input 
                        type="text" 
                        value={setting.value}
                        onChange={(e) => updateSetting('llm', setting.key, e.target.value)}
                      />
                    )}
                  </label>
                </div>
              ))}
            </div>

            <div className="settings-actions">
              <button onClick={() => saveSettings('llm')} disabled={saving}>
                {saving ? 'Saving...' : 'Save LLM Settings'}
              </button>
              <button onClick={() => resetSettings('llm')} className="secondary">
                Reset to Defaults
              </button>
            </div>
          </div>
        )}

        {activeTab === 'sources' && (
          <div className="settings-section">
            <div className="section-header">
              <h2>News Source Management</h2>
              <button onClick={() => setShowAddSource(true)} className="add-button">
                + Add Source
              </button>
            </div>

            {(showAddSource || editingSource) && (
              <SourceForm 
                source={editingSource || {}}
                onSave={saveSource}
                onCancel={() => {
                  setEditingSource(null);
                  setShowAddSource(false);
                }}
              />
            )}

            <div className="sources-list">
              {sources.map(source => (
                <div key={source.id} className="source-item">
                  <div className="source-info">
                    <h4>{source.name}</h4>
                    <span className={`bias-badge bias-${source.bias}`}>{source.bias}</span>
                    <span className={`status ${source.active ? 'active' : 'inactive'}`}>
                      {source.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="source-actions">
                    <button 
                      onClick={() => toggleSource(source.id)}
                      className={source.active ? 'active-toggle' : 'inactive-toggle'}
                    >
                      {source.active ? '✓ Enabled' : '○ Disabled'}
                    </button>
                    <button onClick={() => setEditingSource(source)}>✏️ Edit</button>
                    <button onClick={() => deleteSource(source.id)} className="danger">
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'ingestion' && (
          <div className="settings-section">
            <h2>Automatic Ingestion & Clustering</h2>
            <p className="section-description">
              Control how often the system fetches new articles and groups similar stories together. 
              Use cron expressions (e.g., '*/15 * * * *' = every 15 minutes).
            </p>
            
            <div className="info-box">
              📅 <strong>Cron Expression Guide:</strong> Use standard cron format - "*/15 * * * *" = every 15 minutes, 
              "0 */2 * * *" = every 2 hours, "0 9 * * *" = daily at 9am. 
              Format: [minute] [hour] [day] [month] [day-of-week]
            </div>
            
            <div className="jobs-grid">
              {jobs.map(job => (
                <div key={job.job_name} className="job-card">
                  <h3>{job.job_name.charAt(0).toUpperCase() + job.job_name.slice(1)}</h3>
                  <div className="job-status">
                    <span className={`status-dot ${job.enabled ? 'enabled' : 'disabled'}`} />
                    {job.enabled ? 'Enabled' : 'Disabled'}
                  </div>
                  {job.last_run && (
                    <p>Last run: {new Date(job.last_run).toLocaleString()}</p>
                  )}
                  {job.next_run && job.enabled && (
                    <p>Next run: {new Date(job.next_run).toLocaleString()}</p>
                  )}
                  <div className="job-controls">
                    <input 
                      type="text" 
                      value={job.cron_expression || ''}
                      placeholder="Cron expression"
                      onChange={(e) => {
                        const updated = jobs.map(j => 
                          j.job_name === job.job_name 
                            ? { ...j, cron_expression: e.target.value }
                            : j
                        );
                        setJobs(updated);
                      }}
                    />
                    <button onClick={() => updateJob(job.job_name, {
                      enabled: !job.enabled,
                      cron_expression: job.cron_expression
                    })}>
                      {job.enabled ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'data' && (
          <div className="settings-section">
            <h2>Storage & Data Management</h2>
            <p className="section-description">
              Manage your database storage, clean up old articles, and export your data. 
              Keep your database lean and performant.
            </p>
            
            {dataStats && (
              <div className="data-stats">
                <h3>Database Statistics</h3>
                <div className="stats-grid">
                  <div className="stat">
                    <span className="stat-value">{dataStats.articles}</span>
                    <span className="stat-label">Articles</span>
                  </div>
                  <div className="stat">
                    <span className="stat-value">{dataStats.sources}</span>
                    <span className="stat-label">Sources</span>
                  </div>
                  <div className="stat">
                    <span className="stat-value">{dataStats.clusters}</span>
                    <span className="stat-label">Clusters</span>
                  </div>
                  <div className="stat">
                    <span className="stat-value">{dataStats.entities}</span>
                    <span className="stat-label">Entities</span>
                  </div>
                  <div className="stat">
                    <span className="stat-value">{dataStats.cache_entries}</span>
                    <span className="stat-label">Cache Entries</span>
                  </div>
                  <div className="stat">
                    <span className="stat-value">{(dataStats.database_size / 1024 / 1024).toFixed(2)} MB</span>
                    <span className="stat-label">Database Size</span>
                  </div>
                </div>
              </div>
            )}

            <div className="settings-group">
              {settings.data?.map(setting => (
                <div key={setting.key} className="setting-item">
                  <label>
                    <span className="setting-label">{setting.description}</span>
                    {setting.type === 'boolean' ? (
                      <input 
                        type="checkbox" 
                        checked={setting.value}
                        onChange={(e) => updateSetting('data', setting.key, e.target.checked)}
                      />
                    ) : setting.type === 'number' ? (
                      <input 
                        type="number" 
                        value={setting.value}
                        onChange={(e) => updateSetting('data', setting.key, parseInt(e.target.value))}
                      />
                    ) : (
                      <input 
                        type="text" 
                        value={setting.value}
                        onChange={(e) => updateSetting('data', setting.key, e.target.value)}
                      />
                    )}
                  </label>
                </div>
              ))}
            </div>

            <div className="data-actions">
              <h3>Actions</h3>
              <div className="cleanup-controls" style={{marginBottom: '1rem'}}>
                <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem'}}>
                  <label style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                    Delete articles older than
                    <input 
                      type="number" 
                      value={cleanupDays}
                      onChange={(e) => setCleanupDays(e.target.value)}
                      style={{width: '80px', padding: '0.25rem'}}
                      min="0"
                    />
                    days
                  </label>
                  <button onClick={cleanupData} className="button">Clean Old Articles</button>
                </div>
                <small style={{color: '#666'}}>Tip: Use 0 to delete ALL articles</small>
              </div>
              <div className="action-buttons">
                <button onClick={triggerClustering}>Run Clustering</button>
                <button onClick={clearClusters}>Clear All Clusters</button>
                <button onClick={clearCache}>Clear LLM Cache</button>
                <button onClick={() => exportData('all')}>Export All Data</button>
                <button onClick={() => exportData('settings')}>Export Settings</button>
                <button onClick={() => exportData('sources')}>Export Sources</button>
              </div>
            </div>

            <div className="settings-actions">
              <button onClick={() => saveSettings('data')} disabled={saving}>
                {saving ? 'Saving...' : 'Save Data Settings'}
              </button>
              <button onClick={() => resetSettings('data')} className="secondary">
                Reset to Defaults
              </button>
            </div>
          </div>
        )}

        {activeTab === 'content' && (
          <div className="settings-section">
            <h2>Content Filtering & Research Mode</h2>
            <p className="section-description">
              Control content filtering and safety settings. Research mode allows access to 
              potentially controversial content for academic or journalistic purposes.
            </p>
            
            <div className="settings-group">
              {settings.content?.map(setting => (
                <div key={setting.key} className="setting-item">
                  <label>
                    <span className="setting-label">{setting.description}</span>
                    {setting.key === 'content_mode' ? (
                      <select 
                        value={setting.value}
                        onChange={(e) => updateSetting('content', setting.key, e.target.value)}
                      >
                        <option value="safe">Safe Mode</option>
                        <option value="research">Research Mode</option>
                      </select>
                    ) : setting.type === 'boolean' ? (
                      <input 
                        type="checkbox" 
                        checked={setting.value}
                        onChange={(e) => updateSetting('content', setting.key, e.target.checked)}
                      />
                    ) : setting.type === 'number' ? (
                      <input 
                        type="number" 
                        value={setting.value}
                        onChange={(e) => updateSetting('content', setting.key, parseInt(e.target.value))}
                      />
                    ) : (
                      <input 
                        type="text" 
                        value={setting.value}
                        onChange={(e) => updateSetting('content', setting.key, e.target.value)}
                      />
                    )}
                  </label>
                </div>
              ))}
            </div>

            <div className="content-warning">
              <p>⚠️ <strong>Research Mode:</strong> Enables access to potentially controversial content for academic research purposes. Use responsibly.</p>
            </div>
            
            <div className="info-box">
              💡 <strong>What is Research Mode?</strong> In Safe Mode, the system filters out potentially harmful or controversial content. 
              Research Mode disables these filters for academic, journalistic, or research purposes where access to all content is necessary.
            </div>

            <div className="settings-actions">
              <button onClick={() => saveSettings('content')} disabled={saving}>
                {saving ? 'Saving...' : 'Save Content Settings'}
              </button>
              <button onClick={() => resetSettings('content')} className="secondary">
                Reset to Defaults
              </button>
            </div>
          </div>
        )}

        {activeTab === 'display' && (
          <div className="settings-section">
            <h2>Display & UI Preferences</h2>
            <p className="section-description">
              Customize how articles and data are displayed in the interface. 
              Set your preferred view options and date formatting.
            </p>
            
            <div className="settings-group">
              {settings.display?.map(setting => (
                <div key={setting.key} className="setting-item">
                  <label>
                    <span className="setting-label">{setting.description}</span>
                    {setting.key === 'default_bias_view' ? (
                      <select 
                        value={setting.value}
                        onChange={(e) => updateSetting('display', setting.key, e.target.value)}
                      >
                        <option value="all">All</option>
                        <option value="left">Left</option>
                        <option value="center-left">Center-Left</option>
                        <option value="center">Center</option>
                        <option value="center-right">Center-Right</option>
                        <option value="right">Right</option>
                      </select>
                    ) : setting.key === 'date_format' ? (
                      <select 
                        value={setting.value}
                        onChange={(e) => updateSetting('display', setting.key, e.target.value)}
                      >
                        <option value="relative">Relative (2 hours ago)</option>
                        <option value="absolute">Absolute (Dec 1, 2024)</option>
                      </select>
                    ) : setting.type === 'boolean' ? (
                      <input 
                        type="checkbox" 
                        checked={setting.value}
                        onChange={(e) => updateSetting('display', setting.key, e.target.checked)}
                      />
                    ) : setting.type === 'number' ? (
                      <input 
                        type="number" 
                        value={setting.value}
                        onChange={(e) => updateSetting('display', setting.key, parseInt(e.target.value))}
                      />
                    ) : (
                      <input 
                        type="text" 
                        value={setting.value}
                        onChange={(e) => updateSetting('display', setting.key, e.target.value)}
                      />
                    )}
                  </label>
                </div>
              ))}
            </div>

            <div className="settings-actions">
              <button onClick={() => saveSettings('display')} disabled={saving}>
                {saving ? 'Saving...' : 'Save Display Settings'}
              </button>
              <button onClick={() => resetSettings('display')} className="secondary">
                Reset to Defaults
              </button>
            </div>
          </div>
        )}
      </div>
      
      {confirmAction && (
        <ConfirmDialog
          message={confirmAction.message}
          onConfirm={confirmAction.onConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}

function SourceForm({ source, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    name: source.name || '',
    url: source.url || '',
    rss_url: source.rss_url || '',
    api_url: source.api_url || '',
    bias: source.bias || 'center',
    bias_score: source.bias_score || 0,
    notes: source.notes || '',
    active: source.active !== undefined ? source.active : true,
    scraping_enabled: source.scraping_enabled || false,
    ...source
  });

  function handleSubmit(e) {
    e.preventDefault();
    onSave(formData);
  }

  return (
    <form className="source-form" onSubmit={handleSubmit}>
      <h3>{source.id ? 'Edit Source' : 'Add New Source'}</h3>
      
      <div className="form-group">
        <label>
          Name *
          <input 
            type="text" 
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
        </label>
      </div>

      <div className="form-group">
        <label>
          Website URL *
          <input 
            type="url" 
            value={formData.url}
            onChange={(e) => setFormData({ ...formData, url: e.target.value })}
            required
          />
        </label>
      </div>

      <div className="form-group">
        <label>
          RSS Feed URL
          <input 
            type="url" 
            value={formData.rss_url}
            onChange={(e) => setFormData({ ...formData, rss_url: e.target.value })}
          />
        </label>
      </div>

      <div className="form-group">
        <label>
          API URL
          <input 
            type="url" 
            value={formData.api_url}
            onChange={(e) => setFormData({ ...formData, api_url: e.target.value })}
          />
        </label>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>
            Political Bias *
            <select 
              value={formData.bias}
              onChange={(e) => setFormData({ ...formData, bias: e.target.value })}
              required
            >
              <option value="left">Left</option>
              <option value="center-left">Center-Left</option>
              <option value="center">Center</option>
              <option value="center-right">Center-Right</option>
              <option value="right">Right</option>
            </select>
          </label>
        </div>

        <div className="form-group">
          <label>
            Bias Score (-1 to 1)
            <input 
              type="number" 
              value={formData.bias_score}
              min="-1" 
              max="1" 
              step="0.1"
              onChange={(e) => setFormData({ ...formData, bias_score: parseFloat(e.target.value) })}
            />
          </label>
        </div>
      </div>

      <div className="form-group">
        <label>
          Notes
          <textarea 
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows="3"
          />
        </label>
      </div>

      <div className="form-checkboxes">
        <label>
          <input 
            type="checkbox" 
            checked={formData.active}
            onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
          />
          Active
        </label>
        
        <label>
          <input 
            type="checkbox" 
            checked={formData.scraping_enabled}
            onChange={(e) => setFormData({ ...formData, scraping_enabled: e.target.checked })}
          />
          Enable Scraping
        </label>
      </div>

      <div className="form-actions">
        <button type="submit">Save Source</button>
        <button type="button" onClick={onCancel} className="secondary">Cancel</button>
      </div>
    </form>
  );
}

export default Settings;