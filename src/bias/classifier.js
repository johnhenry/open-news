import natural from 'natural';

const BIAS_MAPPING = {
  'left': -1.0,
  'center-left': -0.5,
  'center': 0,
  'center-right': 0.5,
  'right': 1.0
};

const REVERSE_BIAS_MAPPING = {
  '-1': 'left',
  '-0.5': 'center-left',
  '0': 'center',
  '0.5': 'center-right',
  '1': 'right'
};

export function getBiasScore(biasLabel) {
  return BIAS_MAPPING[biasLabel] || 0;
}

export function getBiasLabel(biasScore) {
  const closest = Object.keys(REVERSE_BIAS_MAPPING)
    .map(key => parseFloat(key))
    .reduce((prev, curr) => {
      return Math.abs(curr - biasScore) < Math.abs(prev - biasScore) ? curr : prev;
    });
  
  return REVERSE_BIAS_MAPPING[closest.toString()];
}

export async function analyzeArticleBias(article, sourceDefaultBias) {
  if (process.env.CONTENT_MODE !== 'research' || !article.content) {
    return {
      bias: sourceDefaultBias,
      bias_score: getBiasScore(sourceDefaultBias),
      sentiment_score: 0
    };
  }

  try {
    const sentiment = new natural.SentimentAnalyzer('English', natural.PorterStemmer, 'afinn');
    const tokenizer = new natural.WordTokenizer();
    const tokens = tokenizer.tokenize(article.content);
    
    const sentimentScore = sentiment.getSentiment(tokens);
    
    const biasKeywords = {
      left: [
        'progressive', 'liberal', 'equality', 'social justice', 'climate change',
        'regulation', 'diversity', 'inclusion', 'workers rights', 'universal healthcare'
      ],
      right: [
        'conservative', 'traditional', 'freedom', 'liberty', 'free market',
        'deregulation', 'individual responsibility', 'border security', 'law and order'
      ]
    };
    
    const contentLower = article.content.toLowerCase();
    let leftScore = 0;
    let rightScore = 0;
    
    biasKeywords.left.forEach(keyword => {
      if (contentLower.includes(keyword)) leftScore++;
    });
    
    biasKeywords.right.forEach(keyword => {
      if (contentLower.includes(keyword)) rightScore++;
    });
    
    let adjustedBiasScore = getBiasScore(sourceDefaultBias);
    
    if (leftScore > rightScore && leftScore > 2) {
      adjustedBiasScore -= 0.2;
    } else if (rightScore > leftScore && rightScore > 2) {
      adjustedBiasScore += 0.2;
    }
    
    adjustedBiasScore = Math.max(-1, Math.min(1, adjustedBiasScore));
    
    return {
      bias: getBiasLabel(adjustedBiasScore),
      bias_score: adjustedBiasScore,
      sentiment_score: sentimentScore
    };
    
  } catch (error) {
    console.error('Error analyzing article bias:', error);
    return {
      bias: sourceDefaultBias,
      bias_score: getBiasScore(sourceDefaultBias),
      sentiment_score: 0
    };
  }
}

export function calculateClusterBiasDistribution(articles) {
  const distribution = {
    left: 0,
    'center-left': 0,
    center: 0,
    'center-right': 0,
    right: 0
  };
  
  articles.forEach(article => {
    if (distribution.hasOwnProperty(article.source_bias)) {
      distribution[article.source_bias]++;
    }
  });
  
  const total = articles.length;
  const percentages = {};
  
  Object.keys(distribution).forEach(bias => {
    percentages[bias] = total > 0 ? (distribution[bias] / total * 100).toFixed(1) : '0.0';
  });
  
  return {
    counts: distribution,
    percentages,
    total,
    diversity_score: calculateDiversityScore(distribution, total)
  };
}

function calculateDiversityScore(distribution, total) {
  if (total === 0) return 0;
  
  const biases = Object.values(distribution).filter(count => count > 0);
  const uniqueBiases = biases.length;
  
  const entropy = biases.reduce((sum, count) => {
    if (count === 0) return sum;
    const p = count / total;
    return sum - (p * Math.log2(p));
  }, 0);
  
  const maxEntropy = Math.log2(5);
  
  return (entropy / maxEntropy).toFixed(2);
}