import React, { useState, useEffect } from 'react';
import { newsAPI } from '../services/api';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner from '../components/LoadingSpinner';
import './Settings.css';

function Settings() {
  const [activeTab, setActiveTab] = useState('sources');
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [saveTimeout, setSaveTimeout] = useState(null);
  
  // LLM specific state
  const [adapters, setAdapters] = useState([]);
  const [testingAdapter, setTestingAdapter] = useState(null);
  const [adapterModels, setAdapterModels] = useState({});
  const [loadingModels, setLoadingModels] = useState({});
  const [settingActiveAdapter, setSettingActiveAdapter] = useState(null);
  
  // Sources state
  const [sources, setSources] = useState([]);
  const [editingSource, setEditingSource] = useState(null);
  const [showAddSource, setShowAddSource] = useState(false);
  const [loadingSources, setLoadingSources] = useState(true);
  const [savingSource, setSavingSource] = useState(false);
  const [deletingSource, setDeletingSource] = useState(null);
  const [togglingSource, setTogglingSource] = useState(null);
  
  // Jobs state
  const [jobs, setJobs] = useState([]);
  const [togglingJob, setTogglingJob] = useState(null);
  const [triggeringJob, setTriggeringJob] = useState(null);
  
  // Data stats
  const [dataStats, setDataStats] = useState(null);
  const [loadingDataStats, setLoadingDataStats] = useState(true);
  const [cleaningData, setCleaningData] = useState(false);
  const [clearingClusters, setClearingClusters] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [exportingData, setExportingData] = useState(null);
  const [triggeringClustering, setTriggeringClustering] = useState(false);
  
  // Confirmation dialog state
  const [confirmAction, setConfirmAction] = useState(null);
  const [cleanupDays, setCleanupDays] = useState(30);

  useEffect(() => {
    loadSettings();
    loadAdditionalData();
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }
    };
  }, [saveTimeout]);

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
      
      // Load models for available adapters
      const models = {};
      for (const adapter of adaptersData.adapters) {
        if (adapter.available) {
          try {
            const modelData = await newsAPI.getAdapterModels(adapter.name);
            models[adapter.name] = modelData.models;
            // Set current model on adapter
            adapter.currentModel = modelData.currentModel;
          } catch (err) {
            console.error(`Failed to load models for ${adapter.name}:`, err);
          }
        }
      }
      setAdapterModels(models);
      
      // Load sources
      setLoadingSources(true);
      const sourcesData = await newsAPI.getSettingsSources();
      setSources(sourcesData.sources);
      setLoadingSources(false);
      
      // Load jobs
      const jobsData = await newsAPI.getScheduledJobs();
      setJobs(jobsData);
      
      // Load data stats
      setLoadingDataStats(true);
      const stats = await newsAPI.getDataStats();
      setDataStats(stats);
      setLoadingDataStats(false);
    } catch (err) {
      console.error('Failed to load additional data:', err);
      setLoadingSources(false);
      setLoadingDataStats(false);
    }
  }

  async function fetchModelsForAdapter(adapterName) {
    setLoadingModels({ ...loadingModels, [adapterName]: true });
    try {
      const modelData = await newsAPI.getAdapterModels(adapterName);
      setAdapterModels({ ...adapterModels, [adapterName]: modelData.models });
      
      // Update adapter's current model
      const updatedAdapters = adapters.map(a => 
        a.name === adapterName ? { ...a, currentModel: modelData.currentModel } : a
      );
      setAdapters(updatedAdapters);
    } catch (err) {
      showMessage(`Failed to fetch models for ${adapterName}`, 'error');
    } finally {
      setLoadingModels({ ...loadingModels, [adapterName]: false });
    }
  }

  async function updateAdapterModel(adapterName, modelId) {
    try {
      await newsAPI.updateSettings({ [`${adapterName}_model`]: modelId });
      
      // Update adapter's current model
      const updatedAdapters = adapters.map(a => 
        a.name === adapterName ? { ...a, currentModel: modelId } : a
      );
      setAdapters(updatedAdapters);
      
      showMessage(`Model updated for ${adapterName}`, 'success', 2000);
      await loadSettings();
    } catch (err) {
      showMessage(`Failed to update model for ${adapterName}`, 'error');
    }
  }

  // Auto-save settings with debouncing
  async function autoSaveSettings(key, value) {
    // Clear existing timeout
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    // Show saving indicator
    setSaving(true);
    
    // Set new timeout for debounced save
    const timeout = setTimeout(async () => {
      try {
        await newsAPI.updateSettings({ [key]: value });
        showMessage('Settings updated', 'success', 2000);
        
        // Reload settings to get any server-side changes
        await loadSettings();
        
        // Reload jobs if schedule was changed
        if (key.includes('schedule') || key.includes('cron')) {
          const jobsData = await newsAPI.getScheduledJobs();
          setJobs(jobsData);
        }
      } catch (err) {
        showMessage('Failed to save settings', 'error');
      } finally {
        setSaving(false);
      }
    }, 500); // 500ms debounce
    
    setSaveTimeout(timeout);
  }

  async function resetSettings(category = null) {
    setConfirmAction({
      title: 'Reset Settings',
      message: `Are you sure you want to reset ${category || 'all'} settings to defaults?`,
      onConfirm: async () => {
        try {
          await newsAPI.resetSettings({ category });
          await loadSettings();
          showMessage('Settings reset to defaults', 'success');
        } catch (err) {
          showMessage('Failed to reset settings', 'error');
        }
        setConfirmAction(null);
      },
      onCancel: () => setConfirmAction(null)
    });
  }

  function showMessage(text, type = 'info', duration = 3000) {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), duration);
  }

  async function testAdapter(adapterName) {
    try {
      setTestingAdapter(adapterName);
      const result = await newsAPI.testLLMAdapter(adapterName);
      
      if (result.success) {
        showMessage(`${adapterName} is working correctly!`, 'success');
      } else {
        showMessage(`${adapterName} test failed: ${result.error}`, 'error');
      }
    } catch (err) {
      showMessage(`Failed to test ${adapterName}`, 'error');
    } finally {
      setTestingAdapter(null);
    }
  }

  // Source management functions
  async function saveSource(sourceData) {
    try {
      setSavingSource(true);
      if (sourceData.id) {
        await newsAPI.updateSource(sourceData.id, sourceData);
        showMessage('Source updated successfully', 'success');
      } else {
        await newsAPI.createSource(sourceData);
        showMessage('Source created successfully', 'success');
      }
      
      const sourcesData = await newsAPI.getSettingsSources();
      setSources(sourcesData.sources);
      setEditingSource(null);
      setShowAddSource(false);
    } catch (err) {
      showMessage('Failed to save source', 'error');
    } finally {
      setSavingSource(false);
    }
  }

  async function deleteSource(sourceId) {
    setConfirmAction({
      title: 'Delete Source',
      message: 'Are you sure you want to delete this source? All articles from this source will also be deleted.',
      onConfirm: async () => {
        try {
          setDeletingSource(sourceId);
          await newsAPI.deleteSource(sourceId);
          const sourcesData = await newsAPI.getSettingsSources();
          setSources(sourcesData.sources);
          showMessage('Source deleted successfully', 'success');
        } catch (err) {
          showMessage('Failed to delete source', 'error');
        } finally {
          setDeletingSource(null);
        }
        setConfirmAction(null);
      },
      onCancel: () => setConfirmAction(null)
    });
  }

  async function toggleSource(sourceId) {
    try {
      setTogglingSource(sourceId);
      const source = sources.find(s => s.id === sourceId);
      await newsAPI.updateSource(sourceId, { active: !source.active });
      const sourcesData = await newsAPI.getSettingsSources();
      setSources(sourcesData.sources);
      showMessage(`Source ${source.active ? 'disabled' : 'enabled'}`, 'success');
    } catch (err) {
      showMessage('Failed to toggle source', 'error');
    } finally {
      setTogglingSource(null);
    }
  }

  // Job management functions
  async function toggleJob(jobName) {
    const job = jobs.find(j => j.job_name === jobName);
    try {
      setTogglingJob(jobName);
      await newsAPI.updateJob(jobName, { enabled: !job.enabled });
      const jobsData = await newsAPI.getScheduledJobs();
      setJobs(jobsData);
      showMessage(`${jobName} ${job.enabled ? 'disabled' : 'enabled'}`, 'success');
    } catch (err) {
      showMessage(`Failed to toggle ${jobName}`, 'error');
    } finally {
      setTogglingJob(null);
    }
  }

  async function updateJobSchedule(jobName, cronExpression) {
    try {
      await newsAPI.updateJob(jobName, { cron_expression: cronExpression });
      const jobsData = await newsAPI.getScheduledJobs();
      setJobs(jobsData);
      showMessage(`${jobName} schedule updated`, 'success');
    } catch (err) {
      showMessage(`Failed to update ${jobName} schedule`, 'error');
    }
  }

  async function triggerJob(jobName) {
    try {
      setTriggeringJob(jobName);
      if (jobName === 'ingestion') {
        await newsAPI.triggerIngestion();
        showMessage('Ingestion started', 'success');
      } else if (jobName === 'clustering') {
        await newsAPI.triggerClustering();
        showMessage('Clustering started', 'success');
      }
    } catch (err) {
      showMessage(`Failed to trigger ${jobName}`, 'error');
    } finally {
      setTriggeringJob(null);
    }
  }

  // Data management functions
  async function cleanupData() {
    const days = parseInt(cleanupDays);
    setConfirmAction({
      title: days === 0 ? 'Delete ALL Articles' : 'Clean Old Articles',
      message: days === 0 
        ? 'Are you sure you want to delete ALL articles? This cannot be undone.'
        : `Are you sure you want to delete articles older than ${days} days?`,
      onConfirm: async () => {
        try {
          setCleaningData(true);
          await newsAPI.cleanupOldArticles(days);
          const stats = await newsAPI.getDataStats();
          setDataStats(stats);
          showMessage(days === 0 ? 'All articles deleted' : `Old articles cleaned (${days} days)`, 'success');
        } catch (err) {
          showMessage('Failed to cleanup articles', 'error');
        } finally {
          setCleaningData(false);
        }
        setConfirmAction(null);
      },
      onCancel: () => setConfirmAction(null)
    });
  }

  async function clearClusters() {
    setConfirmAction({
      title: 'Clear All Clusters',
      message: 'Are you sure you want to delete all article clusters?',
      onConfirm: async () => {
        try {
          setClearingClusters(true);
          await newsAPI.clearClusters();
          const stats = await newsAPI.getDataStats();
          setDataStats(stats);
          showMessage('All clusters cleared', 'success');
        } catch (err) {
          showMessage('Failed to clear clusters', 'error');
        } finally {
          setClearingClusters(false);
        }
        setConfirmAction(null);
      },
      onCancel: () => setConfirmAction(null)
    });
  }

  async function clearCache() {
    setConfirmAction({
      title: 'Clear LLM Cache',
      message: 'Are you sure you want to clear the LLM response cache?',
      onConfirm: async () => {
        try {
          setClearingCache(true);
          await newsAPI.clearCache();
          const stats = await newsAPI.getDataStats();
          setDataStats(stats);
          showMessage('Cache cleared successfully', 'success');
        } catch (err) {
          showMessage('Failed to clear cache', 'error');
        } finally {
          setClearingCache(false);
        }
        setConfirmAction(null);
      },
      onCancel: () => setConfirmAction(null)
    });
  }

  async function exportData(type) {
    try {
      setExportingData(type);
      const data = await newsAPI.exportData(type);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `opennews-${type}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showMessage(`Exported ${type} data`, 'success');
    } catch (err) {
      showMessage(`Failed to export ${type}`, 'error');
    } finally {
      setExportingData(null);
    }
  }

  async function triggerClustering() {
    try {
      setTriggeringClustering(true);
      await newsAPI.triggerClustering();
      showMessage('Clustering started', 'success');
    } catch (err) {
      showMessage('Failed to trigger clustering', 'error');
    } finally {
      setTriggeringClustering(false);
    }
  }

  // Update a setting value and auto-save
  function updateSetting(category, key, value) {
    setSettings(prev => ({
      ...prev,
      [category]: prev[category].map(s => 
        s.key === key ? { ...s, value } : s
      )
    }));
    
    // Auto-save the change
    autoSaveSettings(key, value);
  }

  if (loading) return <LoadingSpinner text="Loading settings..." />;

  return (
    <div className="settings-page">
      <h1>Settings</h1>
      
      {message && (
        <div className={`message message-${message.type}`}>
          {message.text}
        </div>
      )}

      {confirmAction && (
        <ConfirmDialog
          title={confirmAction.title}
          message={confirmAction.message}
          onConfirm={confirmAction.onConfirm}
          onCancel={confirmAction.onCancel}
        />
      )}

      <div className="settings-tabs">
        <button 
          className={activeTab === 'sources' ? 'active' : ''} 
          onClick={() => setActiveTab('sources')}
        >
          📰 Sources
        </button>
        <button 
          className={activeTab === 'collection' ? 'active' : ''} 
          onClick={() => setActiveTab('collection')}
        >
          📥 Collection
        </button>
        <button 
          className={activeTab === 'processing' ? 'active' : ''} 
          onClick={() => setActiveTab('processing')}
        >
          🔗 Processing
        </button>
        <button 
          className={activeTab === 'ai' ? 'active' : ''} 
          onClick={() => setActiveTab('ai')}
        >
          🤖 AI/LLM
        </button>
        <button 
          className={activeTab === 'database' ? 'active' : ''} 
          onClick={() => setActiveTab('database')}
        >
          💾 Database
        </button>
        <button 
          className={activeTab === 'display' ? 'active' : ''} 
          onClick={() => setActiveTab('display')}
        >
          🎨 Display
        </button>
        <button 
          className={activeTab === 'privacy' ? 'active' : ''} 
          onClick={() => setActiveTab('privacy')}
        >
          🔒 Privacy
        </button>
      </div>

      <div className="settings-content">
        {saving && (
          <div className="saving-indicator">
            💾 Saving changes...
          </div>
        )}

        {activeTab === 'sources' && (
          <div className="settings-section">
            <div className="section-header">
              <h2>News Sources</h2>
              <button onClick={() => setShowAddSource(true)} className="add-button">
                + Add Source
              </button>
            </div>
            <p className="section-description">
              Manage RSS feeds and news sources. Add new sources, edit existing ones, or toggle them on/off.
            </p>

            {(showAddSource || editingSource) && (
              <SourceForm 
                source={editingSource || {}}
                onSave={saveSource}
                onCancel={() => {
                  setEditingSource(null);
                  setShowAddSource(false);
                }}
                savingSource={savingSource}
              />
            )}

            {loadingSources ? (
              <LoadingSpinner text="Loading sources..." />
            ) : (
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
                        disabled={togglingSource === source.id}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                      >
                        {togglingSource === source.id ? (
                          <>
                            <LoadingSpinner size="small" inline />
                            Updating...
                          </>
                        ) : (
                          source.active ? '✓ Enabled' : '○ Disabled'
                        )}
                      </button>
                      <button onClick={() => setEditingSource(source)}>✏️ Edit</button>
                      <button 
                        onClick={() => deleteSource(source.id)} 
                        className="danger"
                        disabled={deletingSource === source.id}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                      >
                        {deletingSource === source.id ? (
                          <>
                            <LoadingSpinner size="small" inline />
                            Deleting...
                          </>
                        ) : (
                          '🗑️ Delete'
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'collection' && (
          <div className="settings-section">
            <h2>Article Collection</h2>
            <p className="section-description">
              Configure how and when the system fetches new articles from your sources.
            </p>
            
            <div className="info-box">
              📅 <strong>Cron Expression Guide:</strong> Use standard cron format
              <ul style={{marginTop: '0.5rem', marginBottom: 0, paddingLeft: '1.5rem'}}>
                <li>"*/15 * * * *" = every 15 minutes</li>
                <li>"0 */2 * * *" = every 2 hours</li>
                <li>"0 9 * * *" = daily at 9am</li>
              </ul>
            </div>
            
            <div className="job-section">
              <h3>Ingestion Schedule</h3>
              {jobs.filter(j => j.job_name === 'ingestion').map(job => (
                <div key={job.job_name} className="job-config">
                  <div className="job-header">
                    <div className="job-status">
                      <span className={`status-dot ${job.enabled ? 'enabled' : 'disabled'}`} />
                      {job.enabled ? 'Enabled' : 'Disabled'}
                    </div>
                    <button 
                      onClick={() => toggleJob(job.job_name)}
                      className={job.enabled ? 'disable-button' : 'enable-button'}
                      disabled={togglingJob === job.job_name}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                      {togglingJob === job.job_name ? (
                        <>
                          <LoadingSpinner size="small" inline />
                          {job.enabled ? 'Disabling...' : 'Enabling...'}
                        </>
                      ) : (
                        job.enabled ? 'Disable' : 'Enable'
                      )}
                    </button>
                  </div>
                  
                  <div className="job-schedule">
                    <label>
                      Schedule (cron expression):
                      <input 
                        type="text" 
                        value={job.cron_expression}
                        onChange={(e) => updateJobSchedule(job.job_name, e.target.value)}
                        onBlur={() => updateJobSchedule(job.job_name, job.cron_expression)}
                      />
                    </label>
                  </div>
                  
                  {job.last_run && (
                    <div className="job-info">
                      <small>Last run: {new Date(job.last_run).toLocaleString()}</small>
                    </div>
                  )}
                  
                  <button 
                    onClick={() => triggerJob(job.job_name)} 
                    className="trigger-button"
                    disabled={triggeringJob === job.job_name}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    {triggeringJob === job.job_name ? (
                      <>
                        <LoadingSpinner size="small" inline />
                        Running...
                      </>
                    ) : (
                      '▶️ Run Now'
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'processing' && (
          <div className="settings-section">
            <h2>Article Processing</h2>
            <p className="section-description">
              Configure how articles are analyzed, clustered, and processed after collection.
            </p>

            <div className="job-section">
              <h3>Clustering Schedule</h3>
              {jobs.filter(j => j.job_name === 'clustering').map(job => (
                <div key={job.job_name} className="job-config">
                  <div className="job-header">
                    <div className="job-status">
                      <span className={`status-dot ${job.enabled ? 'enabled' : 'disabled'}`} />
                      {job.enabled ? 'Enabled' : 'Disabled'}
                    </div>
                    <button 
                      onClick={() => toggleJob(job.job_name)}
                      className={job.enabled ? 'disable-button' : 'enable-button'}
                      disabled={togglingJob === job.job_name}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                      {togglingJob === job.job_name ? (
                        <>
                          <LoadingSpinner size="small" inline />
                          {job.enabled ? 'Disabling...' : 'Enabling...'}
                        </>
                      ) : (
                        job.enabled ? 'Disable' : 'Enable'
                      )}
                    </button>
                  </div>
                  
                  <div className="job-schedule">
                    <label>
                      Schedule (cron expression):
                      <input 
                        type="text" 
                        value={job.cron_expression}
                        onChange={(e) => updateJobSchedule(job.job_name, e.target.value)}
                        onBlur={() => updateJobSchedule(job.job_name, job.cron_expression)}
                      />
                    </label>
                  </div>
                  
                  {job.last_run && (
                    <div className="job-info">
                      <small>Last run: {new Date(job.last_run).toLocaleString()}</small>
                    </div>
                  )}
                  
                  <button 
                    onClick={() => triggerJob(job.job_name)} 
                    className="trigger-button"
                    disabled={triggeringJob === job.job_name}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    {triggeringJob === job.job_name ? (
                      <>
                        <LoadingSpinner size="small" inline />
                        Running...
                      </>
                    ) : (
                      '▶️ Run Now'
                    )}
                  </button>
                </div>
              ))}
            </div>

            <div className="settings-group">
              <h3>Clustering Parameters</h3>
              
              <div className="setting-item">
                <label>
                  <span className="setting-label">Similarity Threshold</span>
                  <div style={{display: 'flex', alignItems: 'center', gap: '1rem'}}>
                    <input 
                      type="range"
                      min="0.2"
                      max="0.9"
                      step="0.1"
                      value={settings.ingestion?.find(s => s.key === 'similarity_threshold')?.value || 0.7}
                      onChange={(e) => updateSetting('ingestion', 'similarity_threshold', parseFloat(e.target.value))}
                      style={{flex: 1}}
                    />
                    <span style={{minWidth: '3rem', textAlign: 'right'}}>
                      {settings.ingestion?.find(s => s.key === 'similarity_threshold')?.value || 0.7}
                    </span>
                  </div>
                  <small style={{color: '#666', display: 'block', marginTop: '0.5rem'}}>
                    Lower values group more diverse articles together (0.2 = very loose, 0.5 = moderate, 0.8 = strict)
                  </small>
                </label>
              </div>
              
              <div className="setting-item">
                <label>
                  <span className="setting-label">Minimum Cluster Size</span>
                  <input 
                    type="number"
                    min="2"
                    max="10"
                    value={settings.ingestion?.find(s => s.key === 'min_cluster_size')?.value || 2}
                    onChange={(e) => updateSetting('ingestion', 'min_cluster_size', parseInt(e.target.value))}
                    style={{width: '100px'}}
                  />
                  <small style={{color: '#666', display: 'block', marginTop: '0.5rem'}}>
                    Minimum number of articles required to form a cluster
                  </small>
                </label>
              </div>
            </div>

            <div className="settings-group">
              <h3>Analysis Method</h3>
              <div className="info-box">
                📊 <strong>Analysis Methods:</strong>
                <ul style={{marginTop: '0.5rem', marginBottom: 0, paddingLeft: '1.5rem'}}>
                  <li><strong>Source Default:</strong> Use the source's configured bias (fastest, no processing)</li>
                  <li><strong>Keyword-Based:</strong> Local sentiment and keyword analysis (moderate speed, privacy-focused)</li>
                  <li><strong>LLM-Powered:</strong> AI-based bias detection (slowest, most accurate)</li>
                </ul>
              </div>
              
              <div className="setting-item">
                <label>
                  <span className="setting-label">Article Analysis Method</span>
                  <select 
                    value={settings.llm?.find(s => s.key === 'analysis_method')?.value || 'source_default'}
                    onChange={(e) => updateSetting('llm', 'analysis_method', e.target.value)}
                  >
                    <option value="source_default">Source Default (No Analysis)</option>
                    <option value="keyword">Keyword-Based (Local)</option>
                    <option value="llm">LLM-Powered (AI)</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="action-buttons" style={{marginTop: '2rem'}}>
              <button 
                onClick={clearClusters}
                disabled={clearingClusters}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                {clearingClusters ? (
                  <>
                    <LoadingSpinner size="small" inline />
                    Clearing...
                  </>
                ) : (
                  '🗑️ Clear All Clusters'
                )}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="settings-section">
            <h2>AI/LLM Configuration</h2>
            <p className="section-description">
              Configure AI providers for advanced article analysis and fact extraction.
            </p>
            
            <div className="info-box">
              💡 <strong>Quick Setup:</strong> For local AI, install Ollama (brew install ollama) and run 'ollama serve'. 
              For cloud AI, add API keys to your .env file.
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
                    <p className="warning">⚠️ OpenAI API key configured but connection failed</p>
                  )}
                  {adapter.name === 'gemini' && adapter.configured && !adapter.available && (
                    <p className="warning">⚠️ Gemini API key configured but connection failed</p>
                  )}
                  
                  {/* Model selector for available adapters */}
                  {adapter.available && (
                    <div className="adapter-model">
                      <div className="model-selector-group">
                        <label>Model:</label>
                        <select 
                          value={adapter.currentModel || ''}
                          onChange={(e) => updateAdapterModel(adapter.name, e.target.value)}
                          disabled={loadingModels[adapter.name]}
                        >
                          <option value="">Select a model...</option>
                          {(adapterModels[adapter.name] || []).map(model => (
                            <option key={model.id} value={model.id}>
                              {model.name} {model.size ? `(${model.size})` : ''}
                            </option>
                          ))}
                        </select>
                        <button 
                          onClick={() => fetchModelsForAdapter(adapter.name)}
                          disabled={loadingModels[adapter.name]}
                          className="refresh-models-btn"
                          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                          {loadingModels[adapter.name] ? (
                            <>
                              <LoadingSpinner size="small" inline />
                              Loading...
                            </>
                          ) : (
                            'Refresh'
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                  
                  <div className="adapter-actions">
                    <button 
                      onClick={() => testAdapter(adapter.name)}
                      disabled={!adapter.available || testingAdapter === adapter.name}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                      {testingAdapter === adapter.name ? (
                        <>
                          <LoadingSpinner size="small" inline />
                          Testing...
                        </>
                      ) : (
                        'Test'
                      )}
                    </button>
                    {!adapter.active && adapter.available && (
                      <button 
                        onClick={async () => {
                          try {
                            setSettingActiveAdapter(adapter.name);
                            await newsAPI.updateSettings({ llm_adapter: adapter.name });
                            await loadSettings();
                            await loadAdditionalData();
                            showMessage(`${adapter.name} is now the active adapter`, 'success');
                          } catch (err) {
                            showMessage(`Failed to set ${adapter.name} as active`, 'error');
                          } finally {
                            setSettingActiveAdapter(null);
                          }
                        }}
                        disabled={settingActiveAdapter === adapter.name}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                      >
                        {settingActiveAdapter === adapter.name ? (
                          <>
                            <LoadingSpinner size="small" inline />
                            Setting Active...
                          </>
                        ) : (
                          'Set Active'
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="settings-group">
              <h3>LLM Settings</h3>
              {settings.llm?.filter(s => s.key !== 'analysis_method' && s.key !== 'llm_adapter').map(setting => (
                <div key={setting.key} className="setting-item">
                  <label>
                    <span className="setting-label">{setting.description}</span>
                    {setting.type === 'boolean' ? (
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
          </div>
        )}

        {activeTab === 'database' && (
          <div className="settings-section">
            <h2>Database Management</h2>
            <p className="section-description">
              Monitor database size, manage storage, and perform maintenance tasks.
            </p>
            
            {loadingDataStats ? (
              <LoadingSpinner text="Loading database statistics..." />
            ) : dataStats && (
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
              <h3>Storage Settings</h3>
              {settings.data?.filter(setting => 
                setting.key !== 'auto_cleanup_enabled' && 
                setting.key !== 'database_backup_enabled'
              ).map(setting => (
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
              <h3>Maintenance</h3>
              
              <div className="maintenance-section">
                <h4>Article Cleanup</h4>
                <div className="cleanup-controls">
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
                    <button 
                      onClick={cleanupData} 
                      className="button"
                      disabled={cleaningData}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                      {cleaningData ? (
                        <>
                          <LoadingSpinner size="small" inline />
                          Cleaning...
                        </>
                      ) : (
                        'Clean Articles'
                      )}
                    </button>
                  </div>
                  <small style={{color: '#666'}}>Tip: Use 0 to delete ALL articles</small>
                </div>
              </div>

              <div className="maintenance-section">
                <h4>Cache Management</h4>
                <button 
                  onClick={clearCache}
                  disabled={clearingCache}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  {clearingCache ? (
                    <>
                      <LoadingSpinner size="small" inline />
                      Clearing...
                    </>
                  ) : (
                    '🗑️ Clear LLM Cache'
                  )}
                </button>
              </div>

              <div className="maintenance-section">
                <h4>Backup & Export</h4>
                <div className="action-buttons">
                  <button 
                    onClick={() => exportData('all')}
                    disabled={exportingData === 'all'}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    {exportingData === 'all' ? (
                      <>
                        <LoadingSpinner size="small" inline />
                        Exporting...
                      </>
                    ) : (
                      '📦 Export All Data'
                    )}
                  </button>
                  <button 
                    onClick={() => exportData('settings')}
                    disabled={exportingData === 'settings'}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    {exportingData === 'settings' ? (
                      <>
                        <LoadingSpinner size="small" inline />
                        Exporting...
                      </>
                    ) : (
                      '⚙️ Export Settings'
                    )}
                  </button>
                  <button 
                    onClick={() => exportData('sources')}
                    disabled={exportingData === 'sources'}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    {exportingData === 'sources' ? (
                      <>
                        <LoadingSpinner size="small" inline />
                        Exporting...
                      </>
                    ) : (
                      '📰 Export Sources'
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="settings-group">
              <h3>Automated Maintenance</h3>
              
              {/* Info boxes explaining what backup and cleanup do */}
              <div className="info-box" style={{marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px'}}>
                <p style={{margin: '0 0 0.5rem 0', fontWeight: '500', color: '#0c4a6e'}}>ℹ️ About Automated Maintenance:</p>
                <ul style={{margin: '0', paddingLeft: '1.5rem', color: '#0f172a'}}>
                  <li><strong>Backup:</strong> Automatically exports your database (articles, sources, settings) to JSON files at scheduled intervals. Useful for data recovery and migration.</li>
                  <li><strong>Cleanup:</strong> Automatically removes old articles from the database based on age criteria to manage storage space and maintain performance.</li>
                </ul>
                <p style={{margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#64748b'}}>Configure cron expressions to set when these tasks run (e.g., "0 2 * * *" for daily at 2 AM).</p>
              </div>
              
              {jobs.filter(j => j.job_name === 'cleanup' || j.job_name === 'backup').map(job => (
                <div key={job.job_name} className="job-config">
                  <h4>{job.job_name.charAt(0).toUpperCase() + job.job_name.slice(1)}</h4>
                  <div className="job-header">
                    <div className="job-status">
                      <span className={`status-dot ${job.enabled ? 'enabled' : 'disabled'}`} />
                      {job.enabled ? 'Enabled' : 'Disabled'}
                    </div>
                    <button 
                      onClick={() => toggleJob(job.job_name)}
                      className={job.enabled ? 'disable-button' : 'enable-button'}
                      disabled={togglingJob === job.job_name}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                      {togglingJob === job.job_name ? (
                        <>
                          <LoadingSpinner size="small" inline />
                          {job.enabled ? 'Disabling...' : 'Enabling...'}
                        </>
                      ) : (
                        job.enabled ? 'Disable' : 'Enable'
                      )}
                    </button>
                  </div>
                  
                  <div className="job-schedule">
                    <label>
                      Schedule (cron expression):
                      <input 
                        type="text" 
                        value={job.cron_expression}
                        onChange={(e) => updateJobSchedule(job.job_name, e.target.value)}
                        onBlur={() => updateJobSchedule(job.job_name, job.cron_expression)}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'privacy' && (
          <div className="settings-section">
            <h2>Privacy & Content Filtering</h2>
            <p className="section-description">
              Control content filtering, safety settings, and research mode access.
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
          </div>
        )}

        {activeTab === 'display' && (
          <div className="settings-section">
            <h2>Display Settings</h2>
            <p className="section-description">
              Customize how articles and information are displayed in the interface.
            </p>
            
            <div className="settings-group">
              {settings.display?.map(setting => (
                <div key={setting.key} className="setting-item">
                  <label>
                    <span className="setting-label">{setting.description}</span>
                    {setting.type === 'boolean' ? (
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
          </div>
        )}
      </div>
    </div>
  );
}

// Source Form Component
function SourceForm({ source, onSave, onCancel, savingSource }) {
  const [formData, setFormData] = useState({
    name: source.name || '',
    url: source.url || '',
    rss_url: source.rss_url || '',
    api_url: source.api_url || '',
    bias: source.bias || 'center',
    bias_score: source.bias_score || 0,
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
          Source Name *
          <input 
            type="text" 
            value={formData.name}
            onChange={e => setFormData({...formData, name: e.target.value})}
            required
          />
        </label>
      </div>

      <div className="form-group">
        <label>
          Website URL
          <input 
            type="url" 
            value={formData.url}
            onChange={e => setFormData({...formData, url: e.target.value})}
          />
        </label>
      </div>

      <div className="form-group">
        <label>
          RSS Feed URL *
          <input 
            type="url" 
            value={formData.rss_url}
            onChange={e => setFormData({...formData, rss_url: e.target.value})}
            required
          />
        </label>
      </div>

      <div className="form-group">
        <label>
          API URL (optional)
          <input 
            type="url" 
            value={formData.api_url}
            onChange={e => setFormData({...formData, api_url: e.target.value})}
          />
        </label>
      </div>

      <div className="form-group">
        <label>
          Bias
          <select 
            value={formData.bias}
            onChange={e => setFormData({...formData, bias: e.target.value})}
          >
            <option value="far-left">Far Left</option>
            <option value="left">Left</option>
            <option value="center-left">Center Left</option>
            <option value="center">Center</option>
            <option value="center-right">Center Right</option>
            <option value="right">Right</option>
            <option value="far-right">Far Right</option>
          </select>
        </label>
      </div>

      <div className="form-group">
        <label>
          Bias Score (-100 to 100)
          <input 
            type="number" 
            min="-100" 
            max="100"
            value={formData.bias_score}
            onChange={e => setFormData({...formData, bias_score: parseInt(e.target.value)})}
          />
        </label>
      </div>

      <div className="form-group">
        <label>
          <input 
            type="checkbox" 
            checked={formData.active}
            onChange={e => setFormData({...formData, active: e.target.checked})}
          />
          Active
        </label>
      </div>

      <div className="form-group">
        <label>
          <input 
            type="checkbox" 
            checked={formData.scraping_enabled}
            onChange={e => setFormData({...formData, scraping_enabled: e.target.checked})}
          />
          Enable Web Scraping (for full article content)
        </label>
      </div>

      <div className="form-actions">
        <button 
          type="submit"
          disabled={savingSource}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          {savingSource ? (
            <>
              <LoadingSpinner size="small" inline />
              Saving...
            </>
          ) : (
            'Save'
          )}
        </button>
        <button type="button" onClick={onCancel} className="secondary">Cancel</button>
      </div>
    </form>
  );
}

export default Settings;