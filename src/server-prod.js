import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read certificates (optional in production - you might use a reverse proxy instead)
let httpsOptions = null;
const certPath = path.join(__dirname, '../certs/localhost+2.pem');
const keyPath = path.join(__dirname, '../certs/localhost+2-key.pem');

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  httpsOptions = {
    allowHTTP1: true,
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
  };
}

// Create Fastify instance with HTTP/2 (if certificates available)
const fastify = Fastify({
  http2: !!httpsOptions,
  https: httpsOptions,
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
  }
});

// Initialize database
import migrate from './db/migrate.js';
migrate();

// Initialize scheduler
import('./jobs/scheduler.js').then(({ initializeScheduler }) => {
  initializeScheduler();
});

// Register API routes
import { registerRoutes } from './api/routes.js';
import { registerSettingsRoutes } from './api/settings-routes.js';

await registerRoutes(fastify);
await registerSettingsRoutes(fastify);

// Serve static files from the built frontend
const frontendDistPath = path.join(__dirname, '../frontend/build');

// Register static file serving
await fastify.register(fastifyStatic, {
  root: frontendDistPath,
  prefix: '/'
});

// SPA fallback - serve index.html for all non-API routes
fastify.setNotFoundHandler((request, reply) => {
  if (request.url.startsWith('/api/')) {
    reply.code(404).send({ error: 'API endpoint not found' });
  } else {
    reply.sendFile('index.html');
  }
});

// Start server
const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0';

try {
  await fastify.listen({ port: PORT, host: HOST });
  
  const protocol = httpsOptions ? 'https' : 'http';
  console.log(`
    ⚡ Open News Production Server Started
    ========================================
    🚀 Server: ${protocol}://localhost:${PORT}
    📊 Environment: production
    🔒 HTTP/2: ${httpsOptions ? 'Enabled' : 'Disabled (no certificates)'}
    📁 Serving: ${frontendDistPath}
  `);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  await fastify.close();
  process.exit(0);
});