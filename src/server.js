import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { registerRoutes } from './api/routes.js';
import { registerSettingsRoutes } from './api/settings-routes.js';
import migrate from './db/migrate.js';
import { initializeScheduler } from './jobs/scheduler.js';
import { RATE_LIMIT, TIMEOUTS, CONTENT } from './config/constants.js';
import { Settings } from './db/settings-model.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';

// Parse allowed origins from environment variable
function getAllowedOrigins() {
  const originsEnv = process.env.CORS_ORIGINS;
  if (originsEnv) {
    return originsEnv.split(',').map(origin => origin.trim());
  }
  // Default: allow localhost in development
  if (!isProduction) {
    return ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173'];
  }
  // Production: require explicit configuration
  return [];
}

const fastify = Fastify({
  logger: {
    level: isProduction ? 'info' : 'debug',
    transport: !isProduction ? {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname'
      }
    } : undefined
  },
  // Connection settings for better parallel request handling
  connectionTimeout: 0, // No timeout
  keepAliveTimeout: TIMEOUTS.KEEP_ALIVE_MS,
  maxRequestsPerSocket: 0, // No limit
  requestTimeout: TIMEOUTS.REQUEST_MS,
  bodyLimit: CONTENT.MAX_BODY_SIZE
});

// Security headers
await fastify.register(helmet, {
  contentSecurityPolicy: isProduction ? undefined : false, // Disable CSP in dev for Vite HMR
  crossOriginEmbedderPolicy: false // Allow embedding
});

// Rate limiting
await fastify.register(rateLimit, {
  max: RATE_LIMIT.MAX_REQUESTS,
  timeWindow: RATE_LIMIT.TIME_WINDOW_MS,
  allowList: ['127.0.0.1', '::1'], // Exempt localhost
  errorResponseBuilder: (request, context) => ({
    error: true,
    code: 'RATE_LIMITED',
    message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
    retryAfter: Math.ceil(context.ttl / 1000)
  })
});

// CORS configuration
const allowedOrigins = getAllowedOrigins();
await fastify.register(cors, {
  origin: (origin, cb) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) {
      cb(null, true);
      return;
    }
    // Check if origin is in allowed list
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      cb(null, true);
      return;
    }
    // In development, log blocked origins
    if (!isProduction) {
      fastify.log.warn({ origin }, 'CORS blocked origin');
    }
    cb(new Error('CORS not allowed'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key']
});

// Only register static file serving if the build directory exists
import fs from 'fs';
const frontendBuildPath = join(__dirname, '../frontend/build');
if (fs.existsSync(frontendBuildPath)) {
  await fastify.register(fastifyStatic, {
    root: frontendBuildPath,
    prefix: '/',
    wildcard: false
  });

  // Serve index.html for all non-API routes (SPA support)
  fastify.setNotFoundHandler((request, reply) => {
    if (!request.url.startsWith('/api')) {
      return reply.sendFile('index.html');
    }
    reply.code(404).send({
      error: true,
      code: 'NOT_FOUND',
      message: 'Resource not found'
    });
  });
}

await registerRoutes(fastify);
await registerSettingsRoutes(fastify);

async function start() {
  try {
    fastify.log.info('Running database migrations...');
    migrate();

    fastify.log.info('Initializing scheduler...');
    await initializeScheduler();

    const port = parseInt(process.env.API_PORT || '3001');
    const host = process.env.HOST || '0.0.0.0';

    await fastify.listen({ port, host });

    fastify.log.info(`
    ⚡ Open News API Server Started
    ================================
    🚀 API running at: http://localhost:${port}
    📊 Environment: ${process.env.NODE_ENV || 'development'}
    💾 Database: ${process.env.DB_PATH || './data/news.db'}
    🔄 Content Mode: ${Settings.get('content_mode') || process.env.CONTENT_MODE || 'safe'}
    🔒 CORS Origins: ${allowedOrigins.length > 0 ? allowedOrigins.join(', ') : 'all (development mode)'}
    `);

  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}

export default fastify;
