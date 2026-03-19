import Fastify from 'fastify';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'vite';
import middie from '@fastify/middie';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read certificates
const key = fs.readFileSync(path.join(__dirname, '../certs/localhost+2-key.pem'));
const cert = fs.readFileSync(path.join(__dirname, '../certs/localhost+2.pem'));

// Create Fastify instance with HTTP/2 and HTTPS
const fastify = Fastify({
  http2: true,
  https: {
    allowHTTP1: true, // Fallback to HTTP/1.1 for clients that don't support HTTP/2
    key,
    cert
  },
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
  }
});

// Register middleware support
await fastify.register(middie);

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

// Create Vite server in middleware mode
const vite = await createServer({
  server: { 
    middlewareMode: true,
    hmr: {
      port: 5174, // Different port for HMR WebSocket
      protocol: 'wss'
    }
  },
  root: path.join(__dirname, '../frontend'),
  appType: 'spa'
});

// Use Vite's middleware for non-API routes
fastify.use((req, res, next) => {
  // Skip API routes
  if (req.url?.startsWith('/api/')) {
    return next();
  }
  // Handle with Vite
  vite.middlewares(req, res, next);
});

// Start server
const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = '0.0.0.0';

try {
  await fastify.listen({ port: PORT, host: HOST });
  
  console.log(`
    ⚡ Open News Dev Server Started (HTTP/2)
    ========================================
    🚀 Server: https://localhost:${PORT}
    📊 Environment: development
    🔒 HTTP/2: Enabled
    ⚡ Vite HMR: Enabled
    
    Note: Accept the certificate warning in your browser
  `);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  await fastify.close();
  await vite.close();
  process.exit(0);
});