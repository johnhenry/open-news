import fetch from 'node-fetch';
import { BaseLLMAdapter } from '../base-adapter.js';

export class OllamaAdapter extends BaseLLMAdapter {
  constructor(config) {
    super(config);
    this.name = 'ollama';
    this.baseUrl = config.adapters.ollama.base_url;
    this.model = config.adapters.ollama.model;
    this.options = config.adapters.ollama.options;
  }

  async initialize() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        throw new Error(`Ollama not available at ${this.baseUrl}`);
      }
      
      const data = await response.json();
      const models = data.models || [];
      
      console.log(`✅ Ollama connected. Available models: ${models.map(m => m.name).join(', ')}`);
      
      // Check if the configured model exists
      const modelExists = models.some(m => m.name === this.model);
      if (!modelExists && models.length > 0) {
        console.warn(`⚠️  Model ${this.model} not found. Available: ${models.map(m => m.name).join(', ')}`);
        // Use first available model as fallback
        this.model = models[0].name;
        console.log(`📝 Using ${this.model} as fallback`);
      }
      
      return true;
    } catch (error) {
      console.error('Failed to initialize Ollama:', error.message);
      return false;
    }
  }

  async complete(prompt, options = {}) {
    const requestBody = {
      model: this.model,
      prompt: prompt,
      stream: false,
      options: {
        ...this.options,
        ...options,
        temperature: options.temperature || this.options.temperature,
        num_predict: options.max_tokens || this.options.max_tokens
      }
    };

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama request failed: ${error}`);
      }

      const data = await response.json();
      return data.response;
    } catch (error) {
      console.error('Ollama completion error:', error);
      throw error;
    }
  }

  async chat(messages, options = {}) {
    const requestBody = {
      model: this.model,
      messages: messages,
      stream: false,
      options: {
        ...this.options,
        ...options,
        temperature: options.temperature || this.options.temperature,
        num_predict: options.max_tokens || this.options.max_tokens
      }
    };

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama chat failed: ${error}`);
      }

      const data = await response.json();
      return data.message.content;
    } catch (error) {
      console.error('Ollama chat error:', error);
      throw error;
    }
  }

  async pullModel(modelName) {
    console.log(`📥 Pulling Ollama model: ${modelName}`);
    
    try {
      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: modelName,
          stream: false
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to pull model: ${error}`);
      }

      const data = await response.json();
      console.log(`✅ Model ${modelName} pulled successfully`);
      return data;
    } catch (error) {
      console.error('Failed to pull Ollama model:', error);
      throw error;
    }
  }

  async ensureModel() {
    try {
      const response = await fetch(`${this.baseUrl}/api/show`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: this.model })
      });

      if (response.status === 404) {
        console.log(`Model ${this.model} not found. Pulling...`);
        await this.pullModel(this.model);
      }
      
      return true;
    } catch (error) {
      console.error('Failed to ensure model:', error);
      return false;
    }
  }
}