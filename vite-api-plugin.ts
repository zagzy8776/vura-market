import type { Plugin, ViteDevServer } from 'vite';
import { loadEnv } from 'vite';

const ADMIN_HANDLER = '/api/admin.ts';
const COMMERCE_HANDLER = '/api/commerce.ts';

const COMMERCE_ROUTES: Record<string, string> = {
  '/api/analytics': 'analytics',
  '/api/wishlist': 'wishlist',
  '/api/delivery/quote': 'delivery_quote',
  '/api/couriers/webhook': 'courier_webhook',
};

const routes: Record<string, string> = {
  '/api/auth/login': '/api/auth/[action].ts',
  '/api/auth/signup': '/api/auth/[action].ts',
  '/api/auth/logout': '/api/auth/[action].ts',
  '/api/auth/me': '/api/auth/[action].ts',
  '/api/auth/claim': '/api/auth/[action].ts',
  '/api/categories': '/api/categories/index.ts',
  '/api/products': '/api/products/index.ts',
  '/api/orders': '/api/orders/index.ts',
  '/api/orders/payment-submission': '/api/orders/payment-submission.ts',
  '/api/payment-info': '/api/payment-info.ts',
  '/api/notifications': '/api/notifications.ts',
  '/api/health': '/api/health.ts',
};

function resolveAdminHandler(pathname: string): { handler: string; resource?: string } {
  if (pathname === '/api/admin' || pathname === '/api/admin/') return { handler: ADMIN_HANDLER };
  if (pathname.startsWith('/api/admin/')) return { handler: ADMIN_HANDLER, resource: pathname.slice('/api/admin/'.length) };
  return { handler: '' };
}

export function apiRoutesPlugin(): Plugin {
  return {
    name: 'vura-api-routes',
    config(_config, { mode }) {
      const env = loadEnv(mode, process.cwd(), '');
      for (const [key, value] of Object.entries(env)) {
        if (!(key in process.env)) process.env[key] = value;
      }
    },
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();

        const url = new URL(req.url, 'http://localhost');
        let handlerPath = routes[url.pathname];
        let adminResource: string | undefined;
        let commerceFn: string | undefined;
        if (!handlerPath) {
          const admin = resolveAdminHandler(url.pathname);
          if (admin.handler) {
            handlerPath = admin.handler;
            adminResource = admin.resource;
          }
        }
        if (!handlerPath && COMMERCE_ROUTES[url.pathname]) {
          handlerPath = COMMERCE_HANDLER;
          commerceFn = COMMERCE_ROUTES[url.pathname];
        }
        if (!handlerPath) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Not found' }));
          return;
        }

        let body: unknown = undefined;
        let rawBody: string | undefined = undefined;
        if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const raw = Buffer.concat(chunks).toString();
          rawBody = raw;
          try { body = JSON.parse(raw); } catch { body = raw; }
        }

        try {
          const module = await server.ssrLoadModule(handlerPath);
          const handler = module.default;
          (req as unknown as Record<string, unknown>).body = body;
          if (rawBody !== undefined) (req as unknown as Record<string, unknown>).rawBody = rawBody;

          const query: Record<string, string | string[]> = {};
          url.searchParams.forEach((val, key) => { query[key] = val; });
          if (url.pathname.startsWith('/api/auth/')) {
            query.action = url.pathname.slice('/api/auth/'.length);
          }
          if (adminResource) query.resource = adminResource;
          if (commerceFn) query.fn = commerceFn;
          (req as unknown as Record<string, unknown>).query = query;

          const resAdapter = {
            setHeader: (key: string, value: string) => res.setHeader(key, value),
            status: (code: number) => ({
              json: (data: unknown) => {
                res.statusCode = code;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(data));
              },
            }),
          };

          await handler(req, resAdapter);
        } catch (err) {
          console.error('[api] error in', url.pathname, err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      });
    },
  };
}
