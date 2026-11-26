import { Settings } from '../db/settings-model.js';

function intEnv(name, dflt) {
  const v = parseInt(process.env[name] || '', 10);
  return Number.isFinite(v) ? v : dflt;
}

export const LLM_CONFIG = {
  // Default adapter to use - DB takes priority over env var
  get default_adapter() {
    try {
      return Settings.get('llm_adapter') || process.env.LLM_ADAPTER || 'ollama';
    } catch {
      return process.env.LLM_ADAPTER || 'ollama';
    }
  },
  
  // Per-call timeout, concurrency and queue limits (read on every use, so env changes apply)
  get timeout_ms() { return intEnv('LLM_TIMEOUT_MS', 120000); },
  get max_concurrency() { return Math.max(1, intEnv('LLM_MAX_CONCURRENCY', 1)); },
  get queue_max() { return Math.max(0, intEnv('LLM_QUEUE_MAX', 50)); },
  // Ask for JSON/structured output where the endpoint supports it (LLM_JSON_MODE=false to disable)
  get json_mode() { return (process.env.LLM_JSON_MODE || 'true').toLowerCase() !== 'false'; },

  // Adapter-specific configurations.
  // Generic overrides: when LLM_BASE_URL / LLM_MODEL / LLM_API_KEY are set they replace the
  // base URL, model and key of the OpenAI-compatible and Ollama-compatible adapters
  // (ollama, openai, lmstudio). Unset, the per-provider variables below apply exactly as before.
  get adapters() {
    const e = process.env;
    const o = { base: e.LLM_BASE_URL, model: e.LLM_MODEL, key: e.LLM_API_KEY };
    return {
      ollama: {
        base_url: o.base || e.OLLAMA_BASE_URL || 'http://localhost:11434',
        model: o.model || e.OLLAMA_MODEL || 'llama3.2:latest',
        api_key: o.key || e.OLLAMA_API_KEY || e.OPENAI_API_KEY || '',
        options: { temperature: 0.7, max_tokens: 1000 }
      },

      lmstudio: {
        base_url: o.base || e.LMSTUDIO_BASE_URL || 'http://localhost:1234/v1',
        model: o.model || e.LMSTUDIO_MODEL || 'local-model',
        api_key: o.key || e.LMSTUDIO_API_KEY || 'lm-studio'
      },

      openai: {
        base_url: o.base || e.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        api_key: o.key || e.OPENAI_API_KEY,
        model: o.model || e.OPENAI_MODEL || 'gpt-4o-mini',
        options: { temperature: 0.7, max_tokens: 1000 }
      },

      anthropic: {
        base_url: e.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1',
        api_key: e.ANTHROPIC_API_KEY,
        model: e.ANTHROPIC_MODEL || 'claude-3-haiku-20240307',
        options: { max_tokens: 1000, temperature: 0.7 }
      },

      gemini: {
        base_url: e.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
        api_key: e.GEMINI_API_KEY,
        model: e.GEMINI_MODEL || 'gemini-1.5-flash',
        options: { temperature: 0.7, maxOutputTokens: 1000 }
      }
    };
  },

  // Prompts for different tasks - reads from Settings DB with hardcoded fallbacks
  prompts: {
    get bias_detection() {
      try {
        return Settings.get('llm_prompt_bias_detection') || DEFAULT_PROMPTS.bias_detection;
      } catch {
        return DEFAULT_PROMPTS.bias_detection;
      }
    },
    get fact_extraction() {
      try {
        return Settings.get('llm_prompt_fact_extraction') || DEFAULT_PROMPTS.fact_extraction;
      } catch {
        return DEFAULT_PROMPTS.fact_extraction;
      }
    },
    get consensus_summary() {
      try {
        return Settings.get('llm_prompt_consensus_summary') || DEFAULT_PROMPTS.consensus_summary;
      } catch {
        return DEFAULT_PROMPTS.consensus_summary;
      }
    },
    get cluster_summary() {
      try {
        return Settings.get('llm_prompt_cluster_summary') || DEFAULT_PROMPTS.cluster_summary;
      } catch {
        return DEFAULT_PROMPTS.cluster_summary;
      }
    }
  }
};

// Default prompts used as fallbacks when Settings DB is unavailable
const DEFAULT_PROMPTS = {
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
}`,

  cluster_summary: `You are summarizing a news story cluster. Given the following articles about the same topic, generate:
1. A concise, descriptive title for this story (max 80 chars)
2. A 2-3 sentence summary of the overall story
3. A "fact core" — the key facts that all sources agree on

Articles:
{articles}

Provide a JSON response with:
{
  "title": "A descriptive title for this story",
  "summary": "2-3 sentence summary of the story across all sources.",
  "fact_core": "The key facts all sources agree on, stated neutrally."
}`
};