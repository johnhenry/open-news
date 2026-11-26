// Embeddings for cluster refinement.
//
// Default: a small local model (Xenova/all-MiniLM-L6-v2 via transformers.js, downloaded on
// first use, no API key). If EMBEDDINGS_BASE_URL is set, an OpenAI-compatible
// POST {base}/embeddings endpoint is used instead (EMBEDDINGS_MODEL, EMBEDDINGS_API_KEY).
// Any failure returns null; the caller then skips refinement and keeps the keyword clusters.
import fetch from 'node-fetch';

let embeddingPipeline = null;

export const LOCAL_EMBEDDING_MODEL = 'sentence-transformers/all-MiniLM-L6-v2';

export function getEmbeddingsConfig() {
  const base = (process.env.EMBEDDINGS_BASE_URL || '').replace(/\/+$/, '');
  return {
    remote: !!base,
    base_url: base,
    model: process.env.EMBEDDINGS_MODEL || (base ? 'nomic-embed-text' : LOCAL_EMBEDDING_MODEL),
    api_key: process.env.EMBEDDINGS_API_KEY || '',
    timeout_ms: parseInt(process.env.EMBEDDINGS_TIMEOUT_MS || process.env.LLM_TIMEOUT_MS || '30000', 10)
  };
}

async function getEmbeddingPipeline() {
  if (!embeddingPipeline) {
    console.log('Loading embedding model...');
    const { pipeline } = await import('@xenova/transformers');
    embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return embeddingPipeline;
}

async function remoteEmbedding(text, cfg) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeout_ms);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.api_key) headers.Authorization = `Bearer ${cfg.api_key}`;
    const res = await fetch(`${cfg.base_url}/embeddings`, {
      method: 'POST', headers, signal: ctrl.signal,
      body: JSON.stringify({ model: cfg.model, input: text })
    });
    if (!res.ok) throw new Error(`embeddings endpoint answered ${res.status}`);
    const data = await res.json();
    const vec = data?.data?.[0]?.embedding;
    if (!Array.isArray(vec)) throw new Error('embeddings endpoint returned no vector');
    return vec;
  } finally {
    clearTimeout(timer);
  }
}

export async function generateEmbedding(article) {
  try {
    const text = `${article.title} ${article.excerpt || ''}`.substring(0, 512);
    const cfg = getEmbeddingsConfig();
    if (cfg.remote) return await remoteEmbedding(text, cfg);

    const extractor = await getEmbeddingPipeline();
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  } catch (error) {
    console.error('Error generating embedding:', error.message);
    return null;
  }
}

export async function generateBatchEmbeddings(articles) {
  const embeddings = [];
  for (const article of articles) {
    embeddings.push(await generateEmbedding(article));
  }
  return embeddings;
}

export function cosineSimilarity(vec1, vec2) {
  if (!vec1 || !vec2 || vec1.length !== vec2.length) return 0;
  let dotProduct = 0, norm1 = 0, norm2 = 0;
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }
  if (norm1 === 0 || norm2 === 0) return 0;
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}
