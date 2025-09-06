import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { registerRoutes } from './api/routes.js';
import migrate from './db/migrate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
  }
});

await fastify.register(cors, {
  origin: true,
  credentials: true
});

await fastify.register(fastifyStatic, {
  root: join(__dirname, '../frontend/build'),
  prefix: '/'
});

await registerRoutes(fastify);

fastify.get('/*', async (request, reply) => {
  return reply.sendFile('index.html');
});

async function start() {
  try {
    console.log('🔄 Running database migrations...');
    migrate();
    
    const port = parseInt(process.env.API_PORT || '3001');
    const host = process.env.HOST || '0.0.0.0';
    
    await fastify.listen({ port, host });
    
    console.log(`
    ⚡ Open News API Server Started
    ================================
    🚀 API running at: http://localhost:${port}
    📊 Environment: ${process.env.NODE_ENV || 'development'}
    💾 Database: ${process.env.DB_PATH || './data/news.db'}
    🔄 Content Mode: ${process.env.CONTENT_MODE || 'safe'}
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