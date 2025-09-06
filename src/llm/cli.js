#!/usr/bin/env node

import 'dotenv/config';
import { getLLMManager } from './manager.js';
import { getBiasDetector } from './bias-detector.js';
import { getFactExtractor } from './fact-extractor.js';
import { Article, Cluster } from '../db/models.js';
import migrate from '../db/migrate.js';

const commands = {
  async test() {
    console.log('🧪 Testing LLM adapters...\n');
    const manager = getLLMManager();
    const results = await manager.testAllAdapters();
    
    Object.entries(results).forEach(([name, result]) => {
      const status = result.success ? '✅' : '❌';
      console.log(`${status} ${name}: ${result.success ? 'Connected' : result.error}`);
      if (result.response) {
        console.log(`   Response: ${result.response.substring(0, 50)}...`);
      }
    });
  },

  async init(adapter = null) {
    console.log('🚀 Initializing LLM Manager...\n');
    const manager = getLLMManager();
    const success = await manager.initialize(adapter);
    
    if (success) {
      const status = manager.getStatus();
      console.log(`✅ LLM Manager initialized`);
      console.log(`   Current adapter: ${status.current}`);
      console.log(`   Available adapters: ${status.available.join(', ')}`);
    } else {
      console.log('❌ Failed to initialize LLM Manager');
    }
  },

  async bias(articleId) {
    if (!articleId) {
      console.log('Usage: npm run llm bias <article_id>');
      return;
    }

    migrate();
    
    const article = Article.getById(parseInt(articleId));
    if (!article) {
      console.log(`Article ${articleId} not found`);
      return;
    }

    console.log(`\n📰 Analyzing bias for: ${article.title}\n`);
    
    const manager = getLLMManager();
    await manager.initialize();
    
    const detector = getBiasDetector();
    const analysis = await detector.analyze(article);
    
    console.log('Basic NLP Analysis:');
    if (analysis.basic) {
      console.log(`  Bias: ${analysis.basic.bias} (${analysis.basic.bias_score.toFixed(2)})`);
      console.log(`  Sentiment: ${analysis.basic.sentiment_score.toFixed(2)}`);
    } else {
      console.log('  Not available');
    }
    
    console.log('\nLLM Analysis:');
    if (analysis.llm) {
      console.log(`  Bias Score: ${analysis.llm.bias_score.toFixed(2)}`);
      console.log(`  Confidence: ${(analysis.llm.confidence * 100).toFixed(0)}%`);
      console.log(`  Reasoning: ${analysis.llm.reasoning}`);
      if (analysis.llm.indicators) {
        console.log(`  Indicators: ${analysis.llm.indicators.join(', ')}`);
      }
    } else {
      console.log('  Not available');
    }
    
    console.log('\nCombined Analysis:');
    if (analysis.combined) {
      console.log(`  Bias: ${analysis.combined.bias_label} (${analysis.combined.bias_score.toFixed(2)})`);
      console.log(`  Confidence: ${(analysis.combined.confidence * 100).toFixed(0)}%`);
    }
  },

  async facts(articleId) {
    if (!articleId) {
      console.log('Usage: npm run llm facts <article_id>');
      return;
    }

    migrate();
    
    const article = Article.getById(parseInt(articleId));
    if (!article) {
      console.log(`Article ${articleId} not found`);
      return;
    }

    console.log(`\n📰 Extracting facts from: ${article.title}\n`);
    
    const manager = getLLMManager();
    await manager.initialize();
    
    const extractor = getFactExtractor();
    const extraction = await extractor.extractFromArticle(article);
    
    console.log('Extracted Facts:');
    if (extraction.facts.length > 0) {
      extraction.facts.forEach((fact, i) => {
        console.log(`\n${i + 1}. ${fact.claim}`);
        console.log(`   Type: ${fact.type}`);
        console.log(`   Confidence: ${(fact.confidence * 100).toFixed(0)}%`);
        if (fact.source) {
          console.log(`   Source: ${fact.source}`);
        }
      });
    } else {
      console.log('  No facts extracted');
    }
    
    console.log('\nExtracted Entities:');
    Object.entries(extraction.entities).forEach(([type, values]) => {
      if (values.length > 0) {
        console.log(`  ${type}: ${values.join(', ')}`);
      }
    });
    
    console.log(`\nOverall Confidence: ${(extraction.confidence * 100).toFixed(0)}%`);
    if (extraction.method) {
      console.log(`Method: ${extraction.method}`);
    }
  },

  async consensus(clusterId) {
    if (!clusterId) {
      console.log('Usage: npm run llm consensus <cluster_id>');
      return;
    }

    migrate();
    
    const cluster = Cluster.getById(parseInt(clusterId));
    if (!cluster) {
      console.log(`Cluster ${clusterId} not found`);
      return;
    }

    const articles = Article.getByCluster(parseInt(clusterId));
    if (articles.length === 0) {
      console.log('No articles in cluster');
      return;
    }

    console.log(`\n🔗 Finding consensus in cluster: ${cluster.title}`);
    console.log(`   ${articles.length} articles from different sources\n`);
    
    const manager = getLLMManager();
    await manager.initialize();
    
    const extractor = getFactExtractor();
    const consensus = await extractor.findConsensusFactsInCluster(articles);
    
    console.log('Consensus Facts (appearing across sources):');
    if (consensus.consensus_facts.length > 0) {
      consensus.consensus_facts.forEach((fact, i) => {
        console.log(`  ${i + 1}. ${fact}`);
      });
    } else {
      console.log('  No consensus facts found');
    }
    
    console.log('\nDisputed Points:');
    if (consensus.disputed_points.length > 0) {
      consensus.disputed_points.forEach((point, i) => {
        console.log(`  ${i + 1}. ${point}`);
      });
    } else {
      console.log('  No disputed points identified');
    }
    
    console.log('\nUnique Angles by Bias:');
    Object.entries(consensus.unique_angles).forEach(([bias, points]) => {
      if (points.length > 0) {
        console.log(`  ${bias}: ${points.join(', ')}`);
      }
    });
    
    if (consensus.method) {
      console.log(`\nMethod: ${consensus.method}`);
    }
  },

  async analyze() {
    console.log('🔍 Analyzing all recent articles...\n');
    
    migrate();
    
    const manager = getLLMManager();
    await manager.initialize();
    
    const articles = Article.getAll(20, 0);
    const detector = getBiasDetector();
    
    console.log(`Analyzing ${articles.length} articles...\n`);
    
    const sourceAnalysis = await detector.compareSourceBias(articles);
    
    Object.entries(sourceAnalysis).forEach(([source, analysis]) => {
      console.log(`\n${source}:`);
      console.log(`  Articles analyzed: ${analysis.articles_analyzed}`);
      console.log(`  Average bias: ${analysis.bias_label} (${analysis.average_bias_score.toFixed(2)})`);
      console.log(`  Average confidence: ${(analysis.average_confidence * 100).toFixed(0)}%`);
    });
  },

  async status() {
    const manager = getLLMManager();
    await manager.initialize();
    
    const status = manager.getStatus();
    
    console.log('🤖 LLM Manager Status\n');
    console.log(`Current Adapter: ${status.current || 'None'}`);
    console.log(`Available Adapters: ${status.available.join(', ') || 'None'}`);
    console.log(`Configured Adapters: ${status.config.adapters.join(', ')}`);
    console.log(`Default Adapter: ${status.config.default}`);
    
    console.log('\nEnvironment Variables:');
    console.log(`  LLM_ADAPTER: ${process.env.LLM_ADAPTER || 'not set'}`);
    console.log(`  OLLAMA_BASE_URL: ${process.env.OLLAMA_BASE_URL || 'default'}`);
    console.log(`  OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? 'set' : 'not set'}`);
    console.log(`  ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? 'set' : 'not set'}`);
    console.log(`  GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? 'set' : 'not set'}`);
  }
};

// Parse command line arguments
const command = process.argv[2];
const args = process.argv.slice(3);

if (!command || !commands[command]) {
  console.log(`
📚 Open News LLM CLI

Usage: npm run llm <command> [options]

Commands:
  test                    Test all LLM adapters
  init [adapter]          Initialize LLM manager with optional adapter
  status                  Show LLM manager status
  bias <article_id>       Analyze bias of an article
  facts <article_id>      Extract facts from an article
  consensus <cluster_id>  Find consensus facts in a cluster
  analyze                 Analyze bias of recent articles by source

Examples:
  npm run llm test
  npm run llm init ollama
  npm run llm bias 1
  npm run llm facts 1
  npm run llm consensus 1
  `);
} else {
  commands[command](...args).catch(console.error);
}