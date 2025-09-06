import natural from 'natural';
import kmeans from 'ml-kmeans';
import { euclidean } from 'ml-distance';
import { Article, Cluster, Embedding } from '../db/models.js';
import { generateEmbedding } from './embeddings.js';

const TfIdf = natural.TfIdf;

export async function clusterArticles(articles) {
  if (articles.length < 2) {
    console.log('Not enough articles to cluster');
    return [];
  }

  const keywordClusters = clusterByKeywords(articles);
  
  const refinedClusters = [];
  for (const cluster of keywordClusters) {
    if (cluster.length >= parseInt(process.env.MIN_CLUSTER_SIZE || '2')) {
      const refined = await refineClusterWithEmbeddings(cluster);
      refinedClusters.push(...refined);
    }
  }

  const savedClusters = [];
  for (const clusterArticles of refinedClusters) {
    const clusterId = await saveCluster(clusterArticles);
    if (clusterId) {
      savedClusters.push({
        id: clusterId,
        articles: clusterArticles.length
      });
    }
  }

  return savedClusters;
}

function clusterByKeywords(articles) {
  const tfidf = new TfIdf();
  
  articles.forEach(article => {
    const text = `${article.title} ${article.excerpt || ''}`.toLowerCase();
    tfidf.addDocument(text);
  });

  const clusters = [];
  const clustered = new Set();

  articles.forEach((article, i) => {
    if (clustered.has(i)) return;

    const cluster = [article];
    clustered.add(i);

    articles.forEach((otherArticle, j) => {
      if (i === j || clustered.has(j)) return;

      const similarity = calculateTitleSimilarity(article.title, otherArticle.title);
      
      if (similarity > 0.3) {
        const tfidfSimilarity = calculateTfidfSimilarity(tfidf, i, j);
        
        if (tfidfSimilarity > 0.2 || similarity > 0.5) {
          cluster.push(otherArticle);
          clustered.add(j);
        }
      }
    });

    if (cluster.length >= parseInt(process.env.MIN_CLUSTER_SIZE || '2')) {
      clusters.push(cluster);
    }
  });

  return clusters;
}

function calculateTitleSimilarity(title1, title2) {
  const words1 = new Set(title1.toLowerCase().split(/\s+/));
  const words2 = new Set(title2.toLowerCase().split(/\s+/));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

function calculateTfidfSimilarity(tfidf, doc1, doc2) {
  const terms1 = tfidf.listTerms(doc1);
  const terms2 = tfidf.listTerms(doc2);
  
  const termMap1 = new Map(terms1.map(t => [t.term, t.tfidf]));
  const termMap2 = new Map(terms2.map(t => [t.term, t.tfidf]));
  
  const allTerms = new Set([...termMap1.keys(), ...termMap2.keys()]);
  
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  allTerms.forEach(term => {
    const val1 = termMap1.get(term) || 0;
    const val2 = termMap2.get(term) || 0;
    
    dotProduct += val1 * val2;
    norm1 += val1 * val1;
    norm2 += val2 * val2;
  });
  
  if (norm1 === 0 || norm2 === 0) return 0;
  
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

async function refineClusterWithEmbeddings(articles) {
  if (process.env.CONTENT_MODE !== 'research') {
    return [articles];
  }

  try {
    const embeddings = [];
    
    for (const article of articles) {
      let embedding = Embedding.getVector(article.id);
      
      if (!embedding) {
        embedding = await generateEmbedding(article);
        if (embedding) {
          Embedding.create(article.id, embedding, 'sentence-transformers/all-MiniLM-L6-v2');
        }
      }
      
      if (embedding) {
        embeddings.push(embedding);
      }
    }

    if (embeddings.length < articles.length || embeddings.length < 3) {
      return [articles];
    }

    const k = Math.min(Math.floor(embeddings.length / 3), 3);
    const result = kmeans(embeddings, k, {
      initialization: 'kmeans++',
      distanceFunction: euclidean
    });

    const subclusters = [];
    for (let i = 0; i < k; i++) {
      subclusters.push([]);
    }

    result.clusters.forEach((clusterIdx, articleIdx) => {
      subclusters[clusterIdx].push(articles[articleIdx]);
    });

    return subclusters.filter(
      cluster => cluster.length >= parseInt(process.env.MIN_CLUSTER_SIZE || '2')
    );

  } catch (error) {
    console.error('Error refining cluster with embeddings:', error);
    return [articles];
  }
}

async function saveCluster(articles) {
  try {
    const clusterTitle = generateClusterTitle(articles);
    const summary = generateClusterSummary(articles);
    const factCore = await extractFactCore(articles);
    const confidenceScore = calculateConfidenceScore(articles);

    const result = Cluster.create({
      title: clusterTitle,
      summary: summary,
      fact_core: factCore,
      confidence_score: confidenceScore
    });

    const clusterId = result.lastInsertRowid;

    for (const article of articles) {
      const similarityScore = 0.8;
      Cluster.addArticle(clusterId, article.id, similarityScore);
    }

    return clusterId;

  } catch (error) {
    console.error('Error saving cluster:', error);
    return null;
  }
}

function generateClusterTitle(articles) {
  const titles = articles.map(a => a.title);
  const commonWords = findCommonWords(titles);
  
  if (commonWords.length > 0) {
    return commonWords.slice(0, 5).join(' ');
  }
  
  return articles[0].title.substring(0, 50) + '...';
}

function generateClusterSummary(articles) {
  const biases = [...new Set(articles.map(a => a.source_bias))];
  const sources = [...new Set(articles.map(a => a.source_name))];
  
  return `Coverage from ${sources.length} sources across ${biases.length} perspectives`;
}

async function extractFactCore(articles) {
  const facts = [];
  
  articles.forEach(article => {
    const sentences = article.excerpt?.split('.') || [];
    sentences.forEach(sentence => {
      if (sentence.length > 20 && containsFactualIndicators(sentence)) {
        facts.push(sentence.trim());
      }
    });
  });
  
  const uniqueFacts = [...new Set(facts)];
  return uniqueFacts.slice(0, 3).join('. ');
}

function containsFactualIndicators(sentence) {
  const indicators = [
    /\d+/,
    /percent|%/i,
    /million|billion|thousand/i,
    /according to/i,
    /reported/i,
    /announced/i
  ];
  
  return indicators.some(pattern => pattern.test(sentence));
}

function calculateConfidenceScore(articles) {
  const factors = {
    articleCount: Math.min(articles.length / 10, 1) * 0.3,
    sourceCount: Math.min([...new Set(articles.map(a => a.source_id))].length / 5, 1) * 0.3,
    biasCount: Math.min([...new Set(articles.map(a => a.source_bias))].length / 5, 1) * 0.4
  };
  
  return Object.values(factors).reduce((sum, val) => sum + val, 0);
}

function findCommonWords(titles) {
  const wordFreq = {};
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'been', 'be'
  ]);
  
  titles.forEach(title => {
    const words = title.toLowerCase().split(/\s+/);
    words.forEach(word => {
      const cleaned = word.replace(/[^a-z0-9]/g, '');
      if (cleaned && !stopWords.has(cleaned) && cleaned.length > 2) {
        wordFreq[cleaned] = (wordFreq[cleaned] || 0) + 1;
      }
    });
  });
  
  const minFreq = Math.max(2, Math.floor(titles.length * 0.4));
  
  return Object.entries(wordFreq)
    .filter(([word, freq]) => freq >= minFreq)
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word);
}