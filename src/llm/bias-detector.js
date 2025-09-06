import { getLLMManager } from './manager.js';
import { analyzeArticleBias as basicAnalysis } from '../bias/classifier.js';

export class AdvancedBiasDetector {
  constructor() {
    this.llmManager = getLLMManager();
    this.cache = new Map();
  }

  async analyze(article) {
    // Check cache first
    if (this.cache.has(article.url)) {
      return this.cache.get(article.url);
    }

    const results = {
      basic: null,
      llm: null,
      combined: null,
      confidence: 0
    };

    // Get basic NLP analysis
    try {
      results.basic = await basicAnalysis(article, article.source_bias);
    } catch (error) {
      console.error('Basic bias analysis failed:', error);
    }

    // Get LLM analysis if available
    if (this.llmManager.currentAdapter) {
      try {
        const articleText = `
Title: ${article.title}
Source: ${article.source_name}
${article.content || article.excerpt || ''}
        `.trim();

        results.llm = await this.llmManager.detectBias(articleText);
      } catch (error) {
        console.error('LLM bias analysis failed:', error);
      }
    }

    // Combine results
    results.combined = this.combineAnalyses(results.basic, results.llm);
    
    // Calculate confidence
    results.confidence = this.calculateConfidence(results);

    // Cache the result
    this.cache.set(article.url, results);
    
    return results;
  }

  combineAnalyses(basic, llm) {
    if (!basic && !llm) {
      return {
        bias_score: 0,
        bias_label: 'center',
        confidence: 0,
        reasoning: 'No analysis available'
      };
    }

    if (!llm) {
      return {
        bias_score: basic.bias_score,
        bias_label: basic.bias,
        confidence: 0.3,
        reasoning: 'Basic NLP analysis only'
      };
    }

    if (!basic) {
      return {
        bias_score: llm.bias_score,
        bias_label: this.scoreToLabel(llm.bias_score),
        confidence: llm.confidence || 0.5,
        reasoning: llm.reasoning,
        indicators: llm.indicators
      };
    }

    // Weighted average of both scores
    const weightBasic = 0.3;
    const weightLLM = 0.7;
    
    const combinedScore = (basic.bias_score * weightBasic) + (llm.bias_score * weightLLM);
    
    return {
      bias_score: combinedScore,
      bias_label: this.scoreToLabel(combinedScore),
      confidence: (llm.confidence || 0.5) * 0.8 + 0.2, // Boost confidence when both methods agree
      reasoning: llm.reasoning || 'Combined analysis',
      indicators: llm.indicators || [],
      basic_score: basic.bias_score,
      llm_score: llm.bias_score,
      sentiment: basic.sentiment_score
    };
  }

  scoreToLabel(score) {
    if (score <= -0.6) return 'left';
    if (score <= -0.2) return 'center-left';
    if (score <= 0.2) return 'center';
    if (score <= 0.6) return 'center-right';
    return 'right';
  }

  calculateConfidence(results) {
    let confidence = 0;
    let factors = 0;

    if (results.basic) {
      confidence += 0.3;
      factors++;
    }

    if (results.llm && results.llm.confidence) {
      confidence += results.llm.confidence * 0.7;
      factors++;
    }

    // Agreement bonus
    if (results.basic && results.llm) {
      const scoreDiff = Math.abs(results.basic.bias_score - results.llm.bias_score);
      if (scoreDiff < 0.3) {
        confidence += 0.2; // Bonus for agreement
      }
    }

    return Math.min(confidence, 1.0);
  }

  async batchAnalyze(articles) {
    const results = [];
    
    for (const article of articles) {
      const analysis = await this.analyze(article);
      results.push({
        article_id: article.id,
        url: article.url,
        title: article.title,
        analysis
      });
    }

    return results;
  }

  async compareSourceBias(articles) {
    // Group articles by source
    const bySource = {};
    
    for (const article of articles) {
      if (!bySource[article.source_name]) {
        bySource[article.source_name] = [];
      }
      bySource[article.source_name].push(article);
    }

    const sourceAnalysis = {};
    
    for (const [source, sourceArticles] of Object.entries(bySource)) {
      const analyses = await this.batchAnalyze(sourceArticles);
      
      const avgScore = analyses.reduce((sum, a) => sum + (a.analysis.combined?.bias_score || 0), 0) / analyses.length;
      const avgConfidence = analyses.reduce((sum, a) => sum + a.analysis.confidence, 0) / analyses.length;
      
      sourceAnalysis[source] = {
        articles_analyzed: analyses.length,
        average_bias_score: avgScore,
        average_confidence: avgConfidence,
        bias_label: this.scoreToLabel(avgScore),
        articles: analyses
      };
    }

    return sourceAnalysis;
  }

  clearCache() {
    this.cache.clear();
  }
}

// Singleton instance
let biasDetector = null;

export function getBiasDetector() {
  if (!biasDetector) {
    biasDetector = new AdvancedBiasDetector();
  }
  return biasDetector;
}

export default AdvancedBiasDetector;