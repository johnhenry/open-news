export const LLM_CONFIG = {
  // Default adapter to use
  default_adapter: process.env.LLM_ADAPTER || 'ollama',
  
  // Adapter-specific configurations
  adapters: {
    ollama: {
      base_url: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      model: process.env.OLLAMA_MODEL || 'llama3.2:latest',
      options: {
        temperature: 0.7,
        max_tokens: 1000
      }
    },
    
    lmstudio: {
      base_url: process.env.LMSTUDIO_BASE_URL || 'http://localhost:1234/v1',
      model: process.env.LMSTUDIO_MODEL || 'local-model',
      api_key: process.env.LMSTUDIO_API_KEY || 'lm-studio'
    },
    
    openai: {
      base_url: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      api_key: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      options: {
        temperature: 0.7,
        max_tokens: 1000
      }
    },
    
    anthropic: {
      base_url: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1',
      api_key: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307',
      options: {
        max_tokens: 1000,
        temperature: 0.7
      }
    },
    
    gemini: {
      base_url: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
      api_key: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
      options: {
        temperature: 0.7,
        maxOutputTokens: 1000
      }
    }
  },
  
  // Prompts for different tasks
  prompts: {
    bias_detection: `Analyze the following news article for political bias. Consider:
1. Language tone and emotional words
2. Source selection and quotes
3. Framing of issues
4. Missing perspectives
5. Headlines vs content alignment

Article: {article}

Provide a JSON response with:
{
  "bias_score": -1.0 to 1.0 (-1 = far left, 0 = center, 1 = far right),
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation",
  "indicators": ["list", "of", "bias", "indicators", "found"]
}`,

    fact_extraction: `Extract key factual claims from this news article. Focus on:
1. Statistical claims with numbers
2. Quoted statements from officials
3. Event descriptions (who, what, when, where)
4. Cause-effect claims
5. Policy or legal facts

Article: {article}

Provide a JSON response with:
{
  "facts": [
    {
      "claim": "the factual claim",
      "type": "statistic|quote|event|cause-effect|policy",
      "confidence": 0.0 to 1.0,
      "source": "who made this claim if mentioned"
    }
  ],
  "entities": {
    "people": ["list of people mentioned"],
    "organizations": ["list of organizations"],
    "locations": ["list of locations"],
    "dates": ["list of dates/times mentioned"]
  }
}`,

    consensus_summary: `Given multiple articles about the same topic, identify consensus facts that appear across different sources.

Articles:
{articles}

Provide a JSON response with:
{
  "consensus_facts": ["facts that appear in multiple sources"],
  "disputed_points": ["facts that sources disagree on"],
  "unique_angles": {
    "left": ["unique points from left sources"],
    "center": ["unique points from center sources"],
    "right": ["unique points from right sources"]
  }
}`
  }
};