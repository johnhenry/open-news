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
    // Truncate article to avoid overwhelming the model
    const truncated = articleText.length > 3000 ? articleText.substring(0, 3000) + '...' : articleText;
    const prompt = this.config.prompts.bias_detection.replace('{article}', truncated);

    try {
      const response = await this.complete(prompt, {
        temperature: 0.3,
        max_tokens: 1000
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

  async summarizeCluster(articles) {
    const articlesText = articles.map((a, i) =>
      `Article ${i + 1} (${a.source_name || 'Unknown'}, ${a.source_bias || 'unknown'} bias): ${a.title}\n${a.excerpt || ''}`
    ).join('\n\n');

    const prompt = this.config.prompts.cluster_summary.replace('{articles}', articlesText);

    try {
      const response = await this.complete(prompt, {
        temperature: 0.3,
        max_tokens: 800
      });

      return this.parseJSONResponse(response);
    } catch (error) {
      console.error(`Cluster summarization failed with ${this.name}:`, error.message);
      return null;
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
    if (!text || typeof text !== 'string') {
      return this._fallbackResponse('Empty LLM response');
    }

    // Strip markdown code fences (```json ... ``` or ``` ... ```)
    let cleaned = text.replace(/```(?:json)?\s*\n?/gi, '').replace(/```\s*$/g, '').trim();

    // Try to extract the outermost JSON object
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return this._fallbackResponse('No JSON object found in response');
    }

    let jsonText = jsonMatch[0];

    // Fix common LLM JSON errors
    // 1. Trailing commas before } or ]
    jsonText = jsonText.replace(/,\s*([}\]])/g, '$1');
    // 2. Missing commas between fields
    jsonText = jsonText.replace(/"\s*\n\s*"/g, '",\n"');
    jsonText = jsonText.replace(/(\d)\s*\n\s*"/g, '$1,\n"');
    jsonText = jsonText.replace(/(true|false|null)\s*\n\s*"/g, '$1,\n"');
    jsonText = jsonText.replace(/\]\s*\n\s*"/g, '],\n"');
    // 3. Single quotes to double quotes (but not inside strings)
    jsonText = jsonText.replace(/'/g, '"');

    // Try parsing with fixes
    try {
      return JSON.parse(jsonText);
    } catch (e1) {
      // Try truncated JSON recovery — close any open strings, arrays, objects
      try {
        let fixed = jsonText;
        // Count open brackets/braces
        const openBraces = (fixed.match(/{/g) || []).length;
        const closeBraces = (fixed.match(/}/g) || []).length;
        const openBrackets = (fixed.match(/\[/g) || []).length;
        const closeBrackets = (fixed.match(/\]/g) || []).length;

        // Close any unclosed string
        const quoteCount = (fixed.match(/"/g) || []).length;
        if (quoteCount % 2 !== 0) {
          fixed += '"';
        }

        // Close arrays then objects
        for (let i = 0; i < openBrackets - closeBrackets; i++) fixed += ']';
        for (let i = 0; i < openBraces - closeBraces; i++) fixed += '}';

        // Remove trailing comma before closing
        fixed = fixed.replace(/,\s*([}\]])/g, '$1');

        return JSON.parse(fixed);
      } catch (e2) {
        // Last resort: try to extract individual fields with regex
        const bias_score = text.match(/"bias_score"\s*:\s*(-?[\d.]+)/);
        const confidence = text.match(/"confidence"\s*:\s*([\d.]+)/);
        const reasoning = text.match(/"reasoning"\s*:\s*"([^"]*)/);

        if (bias_score) {
          return {
            bias_score: parseFloat(bias_score[1]),
            confidence: confidence ? parseFloat(confidence[1]) : 0.5,
            reasoning: reasoning ? reasoning[1] : 'Partial parse recovery',
            indicators: []
          };
        }

        return this._fallbackResponse('Failed to parse LLM response');
      }
    }
  }

  _fallbackResponse(reason) {
    return {
      bias_score: 0,
      confidence: 0,
      reasoning: reason,
      indicators: []
    };
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