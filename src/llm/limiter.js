import { LLM_CONFIG } from './config.js';

/** Thrown when the queue of waiting LLM calls is full (back-pressure). */
export class LLMQueueFullError extends Error {
  constructor(message = 'LLM queue full') {
    super(message);
    this.name = 'LLMQueueFullError';
    this.queueFull = true;
  }
}

// One limiter for the whole process, shared by every manager/adapter.
let active = 0;
const waiting = [];

function release() {
  active--;
  pump();
}

function pump() {
  while (waiting.length > 0 && active < LLM_CONFIG.max_concurrency) {
    active++;
    waiting.shift()();
  }
}

/**
 * Run fn when a slot is free: at most LLM_MAX_CONCURRENCY calls in flight, at most
 * LLM_QUEUE_MAX waiting. A call that finds the queue full is rejected at once with
 * LLMQueueFullError instead of piling up.
 */
export async function runLimited(fn) {
  if (active < LLM_CONFIG.max_concurrency) {
    active++;
  } else if (waiting.length >= LLM_CONFIG.queue_max) {
    throw new LLMQueueFullError();
  } else {
    await new Promise(resolve => waiting.push(resolve));
  }
  try {
    return await fn();
  } finally {
    release();
  }
}

export function limiterStats() {
  return { active, queued: waiting.length };
}
