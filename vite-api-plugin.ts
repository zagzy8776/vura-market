import type { Plugin, ViteDevServer } from 'vite';
import { loadEnv } from 'vite';

const routes: Record<string, string> = {
  '/api/auth/login': '/api/auth/login.ts',
  '/api/auth/signup': '/api/auth/signup.ts',
  '/api/categories': '/api/categories/index.ts',
  '/api/products': '/api/products/index.ts',
  '/api/orders': '/api/orders/index.ts',
  '/api/health': '/api/health.ts',
};

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
        const handlerPath = routes[url.pathname];
        if (!handlerPath) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Not found' }));
          return;
        }

        let body: unknown = undefined;
        if (req.method === 'POST' || req.method === 'PUT') {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const raw = Buffer.concat(chunks).toString();
          try { body = JSON.parse(raw); } catch { body = raw; }
        }

        try {
          const module = await server.ssrLoadModule(handlerPath);
          const handler = module.default;
          (req as unknown as Record<string, unknown>).body = body;

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
