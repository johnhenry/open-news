import fetch from 'node-fetch';
import { BaseLLMAdapter } from '../base-adapter.js';

export class LMStudioAdapter extends BaseLLMAdapter {
  constructor(config) {
    super(config);
    this.name = 'lmstudio';
    this.baseUrl = config.adapters.lmstudio.base_url;
    this.model = config.adapters.lmstudio.model;
    this.apiKey = config.adapters.lmstudio.api_key;
  }

  async initialize() {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      if (!response.ok) {
        throw new Error(`LM Studio not available at ${this.baseUrl}`);
      }

      const data = await response.json();
      const models = data.data || [];
      
      console.log(`✅ LM Studio connected. Available models: ${models.map(m => m.id).join(', ')}`);
      
      // Check if configured model exists
      if (models.length > 0) {
        const modelExists = models.some(m => m.id === this.model);
        if (!modelExists) {
          console.warn(`⚠️  Model ${this.model} not found. Using first available: ${models[0].id}`);
          this.model = models[0].id;
        }
      }
      
      return true;
    } catch (error) {
      console.error('Failed to initialize LM Studio:', error.message);
      return false;
    }
  }

  async complete(prompt, options = {}) {
    const requestBody = {
      model: this.model,
      prompt: prompt,
      temperature: options.temperature || 0.7,
      max_tokens: options.max_tokens || 1000,
      stream: false
    };

    try {
      const response = await fetch(`${this.baseUrl}/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`LM Studio request failed: ${error}`);
      }

      const data = await response.json();
      return data.choices[0].text;
    } catch (error) {
      console.error('LM Studio completion error:', error);
      throw error;
    }
  }

  async chat(messages, options = {}) {
    const requestBody = {
      model: this.model,
      messages: messages,
      temperature: options.temperature || 0.7,
      max_tokens: options.max_tokens || 1000,
      stream: false
    };

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`LM Studio chat failed: ${error}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error('LM Studio chat error:', error);
      throw error;
    }
  }

  // Override complete to use chat endpoint with system message
  async complete(prompt, options = {}) {
    const messages = [
      {
        role: 'system',
        content: 'You are a helpful assistant that analyzes news articles. Always respond with valid JSON when requested.'
      },
      {
        role: 'user',
        content: prompt
      }
    ];

    return this.chat(messages, options);
  }
}