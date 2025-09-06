import fetch from 'node-fetch';
import { BaseLLMAdapter } from '../base-adapter.js';

export class GeminiAdapter extends BaseLLMAdapter {
  constructor(config) {
    super(config);
    this.name = 'gemini';
    this.baseUrl = config.adapters.gemini.base_url;
    this.apiKey = config.adapters.gemini.api_key;
    this.model = config.adapters.gemini.model;
    this.options = config.adapters.gemini.options;
  }

  async initialize() {
    if (!this.apiKey) {
      console.error('Gemini API key not configured');
      return false;
    }

    try {
      // Test the API with a minimal request
      const response = await fetch(
        `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: 'Hello' }]
            }],
            generationConfig: {
              maxOutputTokens: 10
            }
          })
        }
      );

      if (response.status === 401 || response.status === 403) {
        throw new Error('Invalid Gemini API key');
      }

      console.log(`✅ Gemini connected. Using model: ${this.model}`);
      return true;
    } catch (error) {
      console.error('Failed to initialize Gemini:', error.message);
      return false;
    }
  }

  async complete(prompt, options = {}) {
    const requestBody = {
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        temperature: options.temperature || this.options.temperature,
        maxOutputTokens: options.max_tokens || this.options.maxOutputTokens,
        candidateCount: 1
      },
      safetySettings: [
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_NONE'
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_NONE'
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_NONE'
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_NONE'
        }
      ]
    };

    try {
      const response = await fetch(
        `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Gemini request failed: ${error.error?.message || JSON.stringify(error)}`);
      }

      const data = await response.json();
      
      if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
        return data.candidates[0].content.parts[0].text;
      } else {
        throw new Error('Unexpected Gemini response format');
      }
    } catch (error) {
      console.error('Gemini completion error:', error);
      throw error;
    }
  }

  async chat(messages, options = {}) {
    // Convert messages to Gemini format
    const contents = messages.map(msg => {
      let role = 'user';
      if (msg.role === 'assistant') {
        role = 'model';
      } else if (msg.role === 'system') {
        // Gemini doesn't have system role, prepend to first user message
        return null;
      }
      
      return {
        role: role,
        parts: [{ text: msg.content }]
      };
    }).filter(Boolean);

    // Add system message as context to first message if present
    const systemMessage = messages.find(m => m.role === 'system');
    if (systemMessage && contents.length > 0) {
      contents[0].parts[0].text = `${systemMessage.content}\n\n${contents[0].parts[0].text}`;
    }

    const requestBody = {
      contents: contents,
      generationConfig: {
        temperature: options.temperature || this.options.temperature,
        maxOutputTokens: options.max_tokens || this.options.maxOutputTokens,
        candidateCount: 1
      },
      safetySettings: [
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_NONE'
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_NONE'
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_NONE'
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_NONE'
        }
      ]
    };

    try {
      const response = await fetch(
        `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Gemini chat failed: ${error.error?.message || JSON.stringify(error)}`);
      }

      const data = await response.json();
      
      if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
        return data.candidates[0].content.parts[0].text;
      } else {
        throw new Error('Unexpected Gemini response format');
      }
    } catch (error) {
      console.error('Gemini chat error:', error);
      throw error;
    }
  }
}