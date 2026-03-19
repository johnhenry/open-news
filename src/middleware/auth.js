/**
 * Admin API key authentication middleware
 * Protects sensitive settings routes
 */

const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

/**
 * Check if admin authentication is configured
 */
export function isAuthConfigured() {
  return !!ADMIN_API_KEY;
}

/**
 * Fastify preHandler hook for admin authentication
 * Checks X-Admin-Key header against ADMIN_API_KEY env var
 */
export async function requireAdminAuth(request, reply) {
  // Skip auth if not configured (development mode)
  if (!ADMIN_API_KEY) {
    request.log.warn('Admin authentication not configured - ADMIN_API_KEY not set');
    return;
  }

  const providedKey = request.headers['x-admin-key'];

  if (!providedKey) {
    reply.code(401).send({
      error: true,
      code: 'UNAUTHORIZED',
      message: 'Admin authentication required. Provide X-Admin-Key header.'
    });
    return;
  }

  // Constant-time comparison to prevent timing attacks
  if (!timingSafeEqual(providedKey, ADMIN_API_KEY)) {
    reply.code(401).send({
      error: true,
      code: 'UNAUTHORIZED',
      message: 'Invalid admin key'
    });
    return;
  }
}

/**
 * Fastify preHandler hook for interactive mode check
 * Blocks write/mutate operations when SETTINGS_INTERACTIVE is not 'true'
 */
export async function requireInteractiveMode(request, reply) {
  if (process.env.SETTINGS_INTERACTIVE !== 'true') {
    reply.code(403).send({
      error: true,
      code: 'READ_ONLY',
      message: 'Settings are read-only. Set SETTINGS_INTERACTIVE=true to enable editing.'
    });
    return;
  }
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}
