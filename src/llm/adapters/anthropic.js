import fetch from 'node-fetch';
import { BaseLLMAdapter } from '../base-adapter.js';

export class AnthropicAdapter extends BaseLLMAdapter {
  constructor(config) {
    super(config);
    this.name = 'anthropic';
    this.baseUrl = config.adapters.anthropic.base_url;
    this.apiKey = config.adapters.anthropic.api_key;
    this.model = config.adapters.anthropic.model;
    this.options = config.adapters.anthropic.options;
  }

  async initialize() {
    if (!this.apiKey) {
      console.error('Anthropic API key not configured');
      return false;
    }

    try {
      // Test the API with a minimal request
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }]
        })
      });

      if (response.status === 401) {
        throw new Error('Invalid Anthropic API key');
      }

      console.log(`✅ Anthropic connected. Using model: ${this.model}`);
      return true;
    } catch (error) {
      console.error('Failed to initialize Anthropic:', error.message);
      return false;
    }
  }

  async complete(prompt, options = {}) {
    const messages = [
      {
        role: 'user',
        content: prompt
      }
    ];

    const requestBody = {
      model: this.model,
      messages: messages,
      max_tokens: options.max_tokens || this.options.max_tokens,
      temperature: options.temperature || this.options.temperature,
      system: 'You are a helpful assistant that analyzes news articles. Always respond with valid JSON when requested.'
    };

    try {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Anthropic request failed: ${error.error?.message || JSON.stringify(error)}`);
      }

      const data = await response.json();
      return data.content[0].text;
    } catch (error) {
      console.error('Anthropic completion error:', error);
      throw error;
    }
  }

  async chat(messages, options = {}) {
    // Convert to Anthropic format if needed
    const anthropicMessages = messages.map(msg => {
      if (msg.role === 'system') {
        return null; // System messages handled separately
      }
      return {
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
      };
    }).filter(Boolean);

    const systemMessage = messages.find(m => m.role === 'system')?.content || 
      'You are a helpful assistant that analyzes news articles. Always respond with valid JSON when requested.';

    const requestBody = {
      model: this.model,
      messages: anthropicMessages,
      max_tokens: options.max_tokens || this.options.max_tokens,
      temperature: options.temperature || this.options.temperature,
      system: systemMessage
    };

    try {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Anthropic chat failed: ${error.error?.message || JSON.stringify(error)}`);
      }

      const data = await response.json();
      return data.content[0].text;
    } catch (error) {
      console.error('Anthropic chat error:', error);
      throw error;
    }
  }
}