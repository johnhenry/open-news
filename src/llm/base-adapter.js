export class BaseLLMAdapter {
  constructor(config) {
    this.config = config;
    this.name = 'base';
  }

  async initialize() {
    throw new Error('initialize() must be implemented by adapter');
  }

  async complete(prompt, options = {}) {
    throw new Error('complete() must be implemented by adapter');
  }

  async detectBias(articleText) {
    const prompt = this.config.prompts.bias_detection.replace('{article}', articleText);
    
    try {
      const response = await this.complete(prompt, {
        temperature: 0.3,
        max_tokens: 500
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
        max_tokens: 800
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

  async findConsensus(articles) {
    const articlesText = articles.map((a, i) => 
      `Article ${i + 1} (${a.source_bias}): ${a.title}\n${a.excerpt || ''}`
    ).join('\n\n');
    
    const prompt = this.config.prompts.consensus_summary.replace('{articles}', articlesText);
    
    try {
      const response = await this.complete(prompt, {
        temperature: 0.3,
        max_tokens: 1000
      });
      
      return this.parseJSONResponse(response);
    } catch (error) {
      console.error(`Consensus finding failed with ${this.name}:`, error.message);
      return {
        consensus_facts: [],
        disputed_points: [],
        unique_angles: {
          left: [],
          center: [],
          right: []
        },
        error: error.message
      };
    }
  }

  parseJSONResponse(text) {
    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      // If no JSON found, try to parse the entire response
      return JSON.parse(text);
    } catch (error) {
      console.error('Failed to parse JSON response:', error);
      console.error('Raw response:', text);
      return null;
    }
  }

  async testConnection() {
    try {
      const response = await this.complete('Hello, please respond with "OK"', {
        max_tokens: 10
      });
      return {
        success: true,
        response,
        adapter: this.name
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        adapter: this.name
      };
    }
  }
}