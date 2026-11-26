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
      const response = await this.fetchWithTimeout(`${this.baseUrl}/models`, {
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
    const wantJson = !!options.json_mode && this.config.json_mode && !this.jsonModeUnsupported;
    const build = (withJsonMode) => ({
      model: this.model,
      messages: messages,
      temperature: options.temperature || this.options.temperature,
      max_tokens: options.max_tokens || this.options.max_tokens,
      response_format: withJsonMode ? { type: 'json_object' } : undefined
    });

    const send = (withJsonMode) => this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(build(withJsonMode))
    });

    const errorText = async (response) => {
      const text = await response.text();
      try {
        const parsed = JSON.parse(text);
        return parsed.error?.message || parsed.message || text;
      } catch {
        return text.slice(0, 300);
      }
    };

    try {
      let response = await send(wantJson);

      // Some OpenAI-compatible servers reject response_format: retry once without it
      // and remember, so later calls do not repeat the failed attempt.
      if (!response.ok && wantJson && response.status === 400) {
        const message = await errorText(response);
        if (/response_format|json_object|json mode/i.test(message)) {
          this.jsonModeUnsupported = true;
          response = await send(false);
        } else {
          throw new Error(`OpenAI request failed (HTTP 400): ${message}`);
        }
      }

      if (!response.ok) {
        throw new Error(`OpenAI request failed (HTTP ${response.status}): ${await errorText(response)}`);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new Error('OpenAI response had no message content');
      return content;
    } catch (error) {
      console.error('OpenAI completion error:', error.message);
      throw error;
    }
  }
}
