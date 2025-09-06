import natural from 'natural';
import { Settings } from '../db/settings-model.js';
import LLMManager from '../llm/manager.js';
import { getBiasScore, getBiasLabel } from '../bias/classifier.js';

class ArticleAnalyzer {
  constructor() {
    this.llmManager = null;
  }

  async initialize() {
    const analysisMethod = Settings.get('analysis_method') || 'source_default';
    
    if (analysisMethod === 'llm' && Settings.isLLMEnabled()) {
      this.llmManager = new LLMManager();
      const adapter = Settings.get('llm_adapter') || 'ollama';
      await this.llmManager.initialize(adapter);
    }
  }

  async analyzeArticle(article, sourceDefaultBias) {
    const analysisMethod = Settings.get('analysis_method') || 'source_default';
    
    console.log(`📊 Analyzing article using ${analysisMethod} method`);
    
    switch (analysisMethod) {
      case 'keyword':
        return this.keywordAnalysis(article, sourceDefaultBias);
      
      case 'llm':
        if (Settings.isLLMEnabled() && this.llmManager?.currentAdapter) {
          const llmResult = await this.llmAnalysis(article);
          if (llmResult) return llmResult;
        }
        // Fall back to source default if LLM fails
        return this.defaultAnalysis(sourceDefaultBias);
      
      case 'source_default':
      default:
        return this.defaultAnalysis(sourceDefaultBias);
    }
  }

  defaultAnalysis(sourceDefaultBias) {
    return {
      bias: sourceDefaultBias,
      bias_score: getBiasScore(sourceDefaultBias),
      sentiment_score: 0,
      analysis_method: 'source_default'
    };
  }

  async keywordAnalysis(article, sourceDefaultBias) {
    if (!article.content) {
      return this.defaultAnalysis(sourceDefaultBias);
    }

    try {
      // Sentiment analysis using natural library
      const sentiment = new natural.SentimentAnalyzer('English', natural.PorterStemmer, 'afinn');
      const tokenizer = new natural.WordTokenizer();
      const tokens = tokenizer.tokenize(article.content);
      const sentimentScore = sentiment.getSentiment(tokens);
      
      // Keyword-based bias detection
      const biasKeywords = {
        left: [
          'progressive', 'liberal', 'equality', 'social justice', 'climate change',
          'regulation', 'diversity', 'inclusion', 'workers rights', 'universal healthcare',
          'medicare for all', 'green new deal', 'systemic', 'equity', 'redistribution'
        ],
        right: [
          'conservative', 'traditional', 'freedom', 'liberty', 'free market',
          'deregulation', 'individual responsibility', 'border security', 'law and order',
          'second amendment', 'limited government', 'fiscal responsibility', 'tax cuts'
        ]
      };
      
      const contentLower = article.content.toLowerCase();
      let leftScore = 0;
      let rightScore = 0;
      
      // Count keyword occurrences
      biasKeywords.left.forEach(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        const matches = contentLower.match(regex);
        if (matches) leftScore += matches.length;
      });
      
      biasKeywords.right.forEach(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        const matches = contentLower.match(regex);
        if (matches) rightScore += matches.length;
      });
      
      // Calculate adjusted bias score
      let adjustedBiasScore = getBiasScore(sourceDefaultBias);
      
      // Adjust based on keyword prevalence
      const totalKeywords = leftScore + rightScore;
      if (totalKeywords > 3) {
        const leftRatio = leftScore / totalKeywords;
        const rightRatio = rightScore / totalKeywords;
        
        if (leftRatio > 0.65) {
          adjustedBiasScore -= 0.3;
        } else if (leftRatio > 0.55) {
          adjustedBiasScore -= 0.15;
        } else if (rightRatio > 0.65) {
          adjustedBiasScore += 0.3;
        } else if (rightRatio > 0.55) {
          adjustedBiasScore += 0.15;
        }
      }
      
      // Clamp to valid range
      adjustedBiasScore = Math.max(-1, Math.min(1, adjustedBiasScore));
      
      return {
        bias: getBiasLabel(adjustedBiasScore),
        bias_score: adjustedBiasScore,
        sentiment_score: sentimentScore,
        analysis_method: 'keyword',
        keyword_stats: {
          left_keywords: leftScore,
          right_keywords: rightScore,
          total_keywords: totalKeywords
        }
      };
      
    } catch (error) {
      console.error('Error in keyword analysis:', error);
      return this.defaultAnalysis(sourceDefaultBias);
    }
  }

  async llmAnalysis(article) {
    if (!article.content || !this.llmManager?.currentAdapter) {
      return null;
    }

    try {
      const biasResult = await this.llmManager.detectBias(article.content);
      
      if (biasResult && biasResult.bias_score !== undefined) {
        return {
          bias: getBiasLabel(biasResult.bias_score),
          bias_score: biasResult.bias_score,
          sentiment_score: biasResult.sentiment_score || 0,
          analysis_method: 'llm',
          llm_confidence: biasResult.confidence || null,
          llm_reasoning: biasResult.reasoning || null
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error in LLM analysis:', error);
      return null;
    }
  }
}

// Singleton instance
let analyzerInstance = null;

export async function getArticleAnalyzer() {
  if (!analyzerInstance) {
    analyzerInstance = new ArticleAnalyzer();
    await analyzerInstance.initialize();
  }
  return analyzerInstance;
}

export { ArticleAnalyzer };