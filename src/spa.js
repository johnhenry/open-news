// Single-page-app fallback. The app shell (index.html) is served only for the client-side
// routes the React app defines. Everything else that is not a file answers a real 404:
// missing assets/robots.txt/etc. must not come back as 200 HTML.

const CLIENT_ROUTES = [
  /^\/$/,
  /^\/clusters\/?$/,
  /^\/clusters\/[^/]+\/?$/,
  /^\/articles\/?$/,
  /^\/sources\/?$/,
  /^\/settings\/?$/
];

export function isClientRoute(pathname) {
  return CLIENT_ROUTES.some(re => re.test(pathname));
}

export function registerSpa(fastify) {
  fastify.setNotFoundHandler((request, reply) => {
    const pathname = request.url.split('?')[0];

    if (pathname.startsWith('/api/') || pathname === '/api') {
      return reply.code(404).send({ error: true, code: 'NOT_FOUND', message: 'API endpoint not found' });
    }
    if ((request.method === 'GET' || request.method === 'HEAD') && isClientRoute(pathname)) {
      return reply.sendFile('index.html');
    }
    const wantsHtml = (request.headers.accept || '').includes('text/html');
    if (wantsHtml) {
      return reply.code(404).type('text/html; charset=utf-8')
        .send('<!doctype html><meta charset="utf-8"><title>Not found - Open News</title><h1>404</h1><p>Nothing here. <a href="/">Back to Open News</a></p>');
    }
    return reply.code(404).type('text/plain; charset=utf-8').send('Not found');
  });
}
