import { LLM_CONFIG } from './config.js';
import { OllamaAdapter } from './adapters/ollama.js';
import { LMStudioAdapter } from './adapters/lmstudio.js';
import { OpenAIAdapter } from './adapters/openai.js';
import { AnthropicAdapter } from './adapters/anthropic.js';
import { GeminiAdapter } from './adapters/gemini.js';

class LLMManager {
  constructor() {
    this.adapters = {};
    this.currentAdapter = null;
    this.config = LLM_CONFIG;
  }

  async initialize(adapterName = null) {
    const targetAdapter = adapterName || this.config.default_adapter;
    
    console.log(`🤖 Initializing LLM Manager with ${targetAdapter} adapter...`);
    
    // Create adapter instance
    const adapter = this.createAdapter(targetAdapter);
    if (!adapter) {
      console.error(`Failed to create adapter: ${targetAdapter}`);
      return false;
    }

    // Try to initialize the adapter
    const initialized = await adapter.initialize();
    if (initialized) {
      this.adapters[targetAdapter] = adapter;
      this.currentAdapter = adapter;
      console.log(`✅ LLM Manager ready with ${targetAdapter}`);
      return true;
    }

    // Fallback to other adapters if primary fails
    console.warn(`⚠️  ${targetAdapter} failed to initialize. Trying fallbacks...`);
    
    const fallbackOrder = ['ollama', 'lmstudio', 'openai', 'anthropic', 'gemini']
      .filter(name => name !== targetAdapter);
    
    for (const fallbackName of fallbackOrder) {
      console.log(`Trying ${fallbackName}...`);
      const fallbackAdapter = this.createAdapter(fallbackName);
      
      if (fallbackAdapter) {
        const fallbackInitialized = await fallbackAdapter.initialize();
        if (fallbackInitialized) {
          this.adapters[fallbackName] = fallbackAdapter;
          this.currentAdapter = fallbackAdapter;
          console.log(`✅ LLM Manager ready with fallback: ${fallbackName}`);
          return true;
        }
      }
    }

    console.error('❌ No LLM adapters could be initialized');
    return false;
  }

  createAdapter(name) {
    try {
      switch (name) {
        case 'ollama':
          return new OllamaAdapter(this.config);
        case 'lmstudio':
          return new LMStudioAdapter(this.config);
        case 'openai':
          return new OpenAIAdapter(this.config);
        case 'anthropic':
          return new AnthropicAdapter(this.config);
        case 'gemini':
          return new GeminiAdapter(this.config);
        default:
          console.error(`Unknown adapter: ${name}`);
          return null;
      }
    } catch (error) {
      console.error(`Failed to create ${name} adapter:`, error.message);
      return null;
    }
  }

  async switchAdapter(adapterName) {
    if (this.adapters[adapterName]) {
      this.currentAdapter = this.adapters[adapterName];
      console.log(`Switched to ${adapterName} adapter`);
      return true;
    }

    const adapter = this.createAdapter(adapterName);
    if (adapter) {
      const initialized = await adapter.initialize();
      if (initialized) {
        this.adapters[adapterName] = adapter;
        this.currentAdapter = adapter;
        console.log(`Switched to ${adapterName} adapter`);
        return true;
      }
    }

    console.error(`Failed to switch to ${adapterName} adapter`);
    return false;
  }

  async detectBias(articleText) {
    if (!this.currentAdapter) {
      console.error('No LLM adapter available');
      return null;
    }

    return this.currentAdapter.detectBias(articleText);
  }

  async extractFacts(articleText) {
    if (!this.currentAdapter) {
      console.error('No LLM adapter available');
      return null;
    }

    return this.currentAdapter.extractFacts(articleText);
  }

  async findConsensus(articles) {
    if (!this.currentAdapter) {
      console.error('No LLM adapter available');
      return null;
    }

    return this.currentAdapter.findConsensus(articles);
  }

  async testAllAdapters() {
    const results = {};
    const adapterNames = ['ollama', 'lmstudio', 'openai', 'anthropic', 'gemini'];
    
    for (const name of adapterNames) {
      console.log(`Testing ${name}...`);
      const adapter = this.createAdapter(name);
      
      if (adapter) {
        const initialized = await adapter.initialize();
        if (initialized) {
          const test = await adapter.testConnection();
          results[name] = test;
        } else {
          results[name] = { success: false, error: 'Failed to initialize' };
        }
      } else {
        results[name] = { success: false, error: 'Failed to create adapter' };
      }
    }

    return results;
  }

  getStatus() {
    return {
      current: this.currentAdapter?.name || null,
      available: Object.keys(this.adapters),
      config: {
        default: this.config.default_adapter,
        adapters: Object.keys(this.config.adapters)
      }
    };
  }
}

// Singleton instance
let llmManager = null;

export function getLLMManager() {
  if (!llmManager) {
    llmManager = new LLMManager();
  }
  return llmManager;
}

export default LLMManager;