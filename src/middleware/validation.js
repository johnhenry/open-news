/**
 * Shared validation schemas for Fastify routes
 * Uses JSON Schema format
 */

// Valid bias values
export const VALID_BIAS_VALUES = ['left', 'center-left', 'center', 'center-right', 'right'];

// Common query parameter schemas
export const paginationSchema = {
  type: 'object',
  properties: {
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 500,
      default: 50
    },
    offset: {
      type: 'integer',
      minimum: 0,
      default: 0
    }
  }
};

// Article query schema
export const articleQuerySchema = {
  type: 'object',
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
    offset: { type: 'integer', minimum: 0, default: 0 },
    bias: { type: 'string' },
    source_id: { type: 'integer', minimum: 1 }
  }
};

// Cluster query schema
export const clusterQuerySchema = {
  type: 'object',
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
    offset: { type: 'integer', minimum: 0, default: 0 }
  }
};

// ID parameter schema
export const idParamSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer', minimum: 1 }
  },
  required: ['id']
};

// Source creation/update schema
export const sourceBodySchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 255 },
    url: { type: 'string', format: 'uri', maxLength: 2048 },
    rss_url: { type: 'string', format: 'uri', maxLength: 2048 },
    api_url: { type: 'string', format: 'uri', maxLength: 2048 },
    bias: { type: 'string', enum: VALID_BIAS_VALUES },
    bias_score: { type: 'number', minimum: -1, maximum: 1 },
    scraping_enabled: { type: 'boolean' },
    active: { type: 'boolean' },
    notes: { type: 'string', maxLength: 5000 }
  },
  required: ['name', 'url', 'bias']
};

// Source update schema (no required fields)
export const sourceUpdateSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 255 },
    url: { type: 'string', format: 'uri', maxLength: 2048 },
    rss_url: { type: 'string', format: 'uri', maxLength: 2048 },
    api_url: { type: 'string', format: 'uri', maxLength: 2048 },
    bias: { type: 'string', enum: VALID_BIAS_VALUES },
    bias_score: { type: 'number', minimum: -1, maximum: 1 },
    scraping_enabled: { type: 'boolean' },
    active: { type: 'boolean' },
    notes: { type: 'string', maxLength: 5000 }
  },
  additionalProperties: false
};

// Settings update schema
export const settingsUpdateSchema = {
  type: 'object',
  additionalProperties: true
};

// API keys update schema
export const apiKeysSchema = {
  type: 'object',
  properties: {
    openai: { type: 'string', maxLength: 200 },
    anthropic: { type: 'string', maxLength: 200 },
    gemini: { type: 'string', maxLength: 200 },
    lmstudio: { type: 'string', maxLength: 200 }
  },
  additionalProperties: false
};

// Job update schema
export const jobUpdateSchema = {
  type: 'object',
  properties: {
    enabled: { type: 'boolean' },
    cron_expression: { type: 'string', maxLength: 100 }
  }
};

// Data cleanup schema
export const cleanupBodySchema = {
  type: 'object',
  properties: {
    days: { type: 'integer', minimum: -1, maximum: 365 }
  }
};

// Import data schema
export const importBodySchema = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['sources', 'settings', 'all'] },
    data: { type: 'object' },
    merge: { type: 'boolean', default: false }
  },
  required: ['type', 'data']
};

/**
 * Create standardized error response
 */
export function createErrorResponse(code, message, details = null) {
  const response = {
    error: true,
    code,
    message
  };

  if (details) {
    response.details = details;
  }

  return response;
}

/**
 * Validation error handler for Fastify
 */
export function validationErrorHandler(error, request, reply) {
  if (error.validation) {
    reply.code(400).send(createErrorResponse(
      'VALIDATION_ERROR',
      'Request validation failed',
      error.validation
    ));
    return;
  }
  throw error;
}
