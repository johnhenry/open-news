import fetch from 'node-fetch';
import { BaseLLMAdapter } from '../base-adapter.js';

export class OpenAIAdapter extends BaseLLMAdapter {
  constructor(config) {
    super(config);
    this.name = 'openai';
    this.baseUrl = config.adapters.openai.base_url;
    this.apiKey = config.adapters.openai.api_key;
    this.model = config.adapters.openai.model;
    this.options = config.adapters.openai.options;
  }

  async initialize() {
    if (!this.apiKey) {
      console.error('OpenAI API key not configured');
      return false;
    }

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      if (!response.ok) {
        throw new Error(`OpenAI API not accessible: ${response.status}`);
      }

      const data = await response.json();
      const models = data.data || [];
      
      console.log(`✅ OpenAI connected. Models available: ${models.length}`);
      
      // Check if configured model is available
      const modelExists = models.some(m => m.id === this.model);
      if (!modelExists) {
        console.warn(`⚠️  Model ${this.model} may not be available. Will attempt to use it anyway.`);
      }
      
      return true;
    } catch (error) {
      console.error('Failed to initialize OpenAI:', error.message);
      return false;
    }
  }

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

  async chat(messages, options = {}) {
    const requestBody = {
      model: this.model,
      messages: messages,
      temperature: options.temperature || this.options.temperature,
      max_tokens: options.max_tokens || this.options.max_tokens,
      response_format: options.json_mode ? { type: 'json_object' } : undefined
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
        const error = await response.json();
        throw new Error(`OpenAI request failed: ${error.error?.message || JSON.stringify(error)}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error('OpenAI completion error:', error);
      throw error;
    }
  }

  // Override for better JSON responses
  async detectBias(articleText) {
    const prompt = this.config.prompts.bias_detection.replace('{article}', articleText);
    
    try {
      const response = await this.complete(prompt, {
        temperature: 0.3,
        max_tokens: 500,
        json_mode: true
      });
      
      return this.parseJSONResponse(response);
    } catch (error) {
      console.error(`Bias detection failed with ${this.name}:`, error.message);
      return {
        bias_score: 0,
        confidence: 0,
        reasoning: 'Analysis failed',
        indicators: [],
        error: error.message
      };
    }
  }

  async extractFacts(articleText) {
    const prompt = this.config.prompts.fact_extraction.replace('{article}', articleText);
    
    try {
      const response = await this.complete(prompt, {
        temperature: 0.2,
        max_tokens: 800,
        json_mode: true
      });
      
      return this.parseJSONResponse(response);
    } catch (error) {
      console.error(`Fact extraction failed with ${this.name}:`, error.message);
      return {
        facts: [],
        entities: {
          people: [],
          organizations: [],
          locations: [],
          dates: []
        },
        error: error.message
      };
    }
  }
}