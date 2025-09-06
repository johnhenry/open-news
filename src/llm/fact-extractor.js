import { getLLMManager } from './manager.js';
import { Entity } from '../db/models.js';

export class FactExtractor {
  constructor() {
    this.llmManager = getLLMManager();
    this.cache = new Map();
  }

  async extractFromArticle(article) {
    // Check cache
    if (this.cache.has(article.url)) {
      return this.cache.get(article.url);
    }

    const articleText = `
Title: ${article.title}
Source: ${article.source_name}
Date: ${article.published_at}
${article.content || article.excerpt || ''}
    `.trim();

    let extraction = {
      facts: [],
      entities: {
        people: [],
        organizations: [],
        locations: [],
        dates: []
      },
      confidence: 0
    };

    if (!this.llmManager.currentAdapter) {
      console.warn('No LLM adapter available for fact extraction');
      // Fallback to basic extraction
      extraction = this.basicExtraction(article);
    } else {
      try {
        extraction = await this.llmManager.extractFacts(articleText);
        
        // Validate and clean the extraction
        extraction = this.validateExtraction(extraction);
        
        // Save entities to database
        await this.saveEntities(article.id, extraction.entities);
        
      } catch (error) {
        console.error('LLM fact extraction failed:', error);
        extraction = this.basicExtraction(article);
      }
    }

    // Cache the result
    this.cache.set(article.url, extraction);
    
    return extraction;
  }

  validateExtraction(extraction) {
    if (!extraction) {
      return {
        facts: [],
        entities: { people: [], organizations: [], locations: [], dates: [] },
        confidence: 0
      };
    }

    // Ensure facts array exists and is valid
    if (!Array.isArray(extraction.facts)) {
      extraction.facts = [];
    } else {
      extraction.facts = extraction.facts.filter(fact => 
        fact && typeof fact.claim === 'string' && fact.claim.length > 0
      );
    }

    // Ensure entities object exists with all required arrays
    if (!extraction.entities || typeof extraction.entities !== 'object') {
      extraction.entities = {};
    }
    
    const entityTypes = ['people', 'organizations', 'locations', 'dates'];
    entityTypes.forEach(type => {
      if (!Array.isArray(extraction.entities[type])) {
        extraction.entities[type] = [];
      } else {
        // Remove duplicates and empty strings
        extraction.entities[type] = [...new Set(
          extraction.entities[type].filter(e => e && e.length > 0)
        )];
      }
    });

    // Calculate confidence based on extraction quality
    extraction.confidence = this.calculateExtractionConfidence(extraction);

    return extraction;
  }

  calculateExtractionConfidence(extraction) {
    let score = 0;
    let factors = 0;

    // Facts quality
    if (extraction.facts.length > 0) {
      const avgFactConfidence = extraction.facts.reduce((sum, f) => 
        sum + (f.confidence || 0.5), 0
      ) / extraction.facts.length;
      score += avgFactConfidence * 0.5;
      factors++;
    }

    // Entities completeness
    const entityCount = Object.values(extraction.entities)
      .reduce((sum, arr) => sum + arr.length, 0);
    if (entityCount > 0) {
      score += Math.min(entityCount / 10, 1) * 0.3;
      factors++;
    }

    // Fact types diversity
    const factTypes = new Set(extraction.facts.map(f => f.type));
    if (factTypes.size > 0) {
      score += Math.min(factTypes.size / 5, 1) * 0.2;
      factors++;
    }

    return factors > 0 ? score / factors : 0;
  }

  basicExtraction(article) {
    const text = article.content || article.excerpt || article.title || '';
    
    const facts = [];
    const entities = {
      people: [],
      organizations: [],
      locations: [],
      dates: []
    };

    // Extract numbers and statistics
    const numberPattern = /\b\d+(?:,\d{3})*(?:\.\d+)?%?\b/g;
    const numbers = text.match(numberPattern) || [];
    numbers.forEach(num => {
      const context = this.getContextAround(text, num, 50);
      if (context) {
        facts.push({
          claim: context,
          type: 'statistic',
          confidence: 0.3,
          source: 'pattern_matching'
        });
      }
    });

    // Extract quoted text
    const quotePattern = /"([^"]+)"/g;
    let match;
    while ((match = quotePattern.exec(text)) !== null) {
      if (match[1].length > 10 && match[1].length < 200) {
        facts.push({
          claim: match[1],
          type: 'quote',
          confidence: 0.4,
          source: 'pattern_matching'
        });
      }
    }

    // Extract dates
    const datePattern = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}\b/gi;
    const dates = text.match(datePattern) || [];
    entities.dates = [...new Set(dates)];

    // Extract capitalized words (potential names/orgs)
    const capitalPattern = /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g;
    const capitalWords = text.match(capitalPattern) || [];
    
    capitalWords.forEach(word => {
      // Simple heuristic: if it contains common org words, it's an organization
      if (/Corp|Inc|LLC|Ltd|Company|Department|Agency|Committee/i.test(word)) {
        entities.organizations.push(word);
      } else {
        // Otherwise assume it's a person
        entities.people.push(word);
      }
    });

    // Remove duplicates
    entities.people = [...new Set(entities.people)].slice(0, 10);
    entities.organizations = [...new Set(entities.organizations)].slice(0, 10);

    return {
      facts: facts.slice(0, 10),
      entities,
      confidence: 0.3,
      method: 'basic_extraction'
    };
  }

  getContextAround(text, target, contextLength = 50) {
    const index = text.indexOf(target);
    if (index === -1) return null;
    
    const start = Math.max(0, index - contextLength);
    const end = Math.min(text.length, index + target.length + contextLength);
    
    return text.substring(start, end).trim();
  }

  async saveEntities(articleId, entities) {
    const entitiesToSave = [];
    
    for (const [type, values] of Object.entries(entities)) {
      for (const value of values) {
        entitiesToSave.push({
          article_id: articleId,
          entity_type: type,
          entity_value: value,
          confidence: 0.8
        });
      }
    }

    if (entitiesToSave.length > 0) {
      try {
        Entity.bulkCreate(entitiesToSave);
      } catch (error) {
        console.error('Failed to save entities:', error);
      }
    }
  }

  async findConsensusFactsInCluster(clusterArticles) {
    if (!this.llmManager.currentAdapter) {
      return this.basicConsensusFinding(clusterArticles);
    }

    try {
      const consensus = await this.llmManager.findConsensus(clusterArticles);
      return this.validateConsensus(consensus);
    } catch (error) {
      console.error('LLM consensus finding failed:', error);
      return this.basicConsensusFinding(clusterArticles);
    }
  }

  validateConsensus(consensus) {
    if (!consensus) {
      return {
        consensus_facts: [],
        disputed_points: [],
        unique_angles: { left: [], center: [], right: [] }
      };
    }

    // Ensure arrays exist
    if (!Array.isArray(consensus.consensus_facts)) {
      consensus.consensus_facts = [];
    }
    if (!Array.isArray(consensus.disputed_points)) {
      consensus.disputed_points = [];
    }

    // Ensure unique_angles structure
    if (!consensus.unique_angles || typeof consensus.unique_angles !== 'object') {
      consensus.unique_angles = {};
    }
    ['left', 'center', 'right'].forEach(bias => {
      if (!Array.isArray(consensus.unique_angles[bias])) {
        consensus.unique_angles[bias] = [];
      }
    });

    return consensus;
  }

  basicConsensusFinding(articles) {
    // Extract all facts from articles
    const allFacts = new Map();
    const biasGroups = { left: [], center: [], right: [] };
    
    articles.forEach(article => {
      const bias = this.simplifyBias(article.source_bias);
      if (!biasGroups[bias]) {
        biasGroups[bias] = [];
      }
      biasGroups[bias].push(article);
      
      // Extract key phrases from title and excerpt
      const text = `${article.title} ${article.excerpt || ''}`.toLowerCase();
      const words = text.split(/\s+/).filter(w => w.length > 4);
      
      words.forEach(word => {
        if (!allFacts.has(word)) {
          allFacts.set(word, new Set());
        }
        allFacts.get(word).add(bias);
      });
    });

    // Find consensus (words appearing in multiple bias groups)
    const consensus_facts = [];
    const disputed_points = [];
    
    allFacts.forEach((biases, word) => {
      if (biases.size >= 2) {
        consensus_facts.push(word);
      } else if (biases.size === 1) {
        disputed_points.push(word);
      }
    });

    // Find unique angles
    const unique_angles = {
      left: [],
      center: [],
      right: []
    };
    
    Object.entries(biasGroups).forEach(([bias, articles]) => {
      if (articles.length > 0) {
        const uniqueWords = new Set();
        articles.forEach(article => {
          const text = `${article.title} ${article.excerpt || ''}`.toLowerCase();
          const words = text.split(/\s+/).filter(w => w.length > 6);
          words.forEach(w => uniqueWords.add(w));
        });
        unique_angles[bias] = Array.from(uniqueWords).slice(0, 5);
      }
    });

    return {
      consensus_facts: consensus_facts.slice(0, 10),
      disputed_points: disputed_points.slice(0, 10),
      unique_angles,
      method: 'basic_consensus'
    };
  }

  simplifyBias(bias) {
    if (bias.includes('left')) return 'left';
    if (bias.includes('right')) return 'right';
    return 'center';
  }

  clearCache() {
    this.cache.clear();
  }
}

// Singleton instance
let factExtractor = null;

export function getFactExtractor() {
  if (!factExtractor) {
    factExtractor = new FactExtractor();
  }
  return factExtractor;
}

export default FactExtractor;