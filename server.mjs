#!/usr/bin/env node
/**
 * Vura Market – Fly.io production server
 *
 * Architecture:
 *   - Vercel = public frontend (customers use vura-market.vercel.app)
 *   - Fly    = API host (and optional static fallback)
 *
 * Until native API handlers run on Fly, /api/* is proxied to API_ORIGIN
 * (default: the Vercel deployment that already has working serverless APIs).
 *
 * Env:
 *   PORT              – listen port (Fly sets this)
 *   API_ORIGIN        – upstream API base, e.g. https://vura-market.vercel.app
 *   FRONTEND_URL      – if set, GET / redirects here (keep shop on Vercel only)
 *   CORS_ORIGIN       – allowed browser origin(s), comma-separated; default FRONTEND_URL or *
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DIST = path.join(__dirname, 'dist');
const API_ORIGIN = (process.env.API_ORIGIN || 'https://vura-market.vercel.app').replace(/\/$/, '');
const FRONTEND_URL = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
const CORS_ORIGIN = process.env.CORS_ORIGIN || FRONTEND_URL || '*';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  const allowed = CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
  let value = '*';
  if (allowed.includes('*')) {
    value = origin || '*';
  } else if (origin && allowed.includes(origin)) {
    value = origin;
  } else if (allowed[0] && allowed[0] !== '*') {
    value = allowed[0];
  }
  res.setHeader('Access-Control-Allow-Origin', value);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    req.headers['access-control-request-headers'] || 'Content-Type, Authorization, Cookie',
  );
  res.setHeader('Vary', 'Origin');
}

function health(res) {
  send(res, 200, JSON.stringify({
    status: 'healthy',
    service: 'vura-market',
    role: 'api-gateway',
    apiOrigin: API_ORIGIN,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }), { 'Content-Type': 'application/json' });
}

function isLocalHealth(pathname, url) {
  if (pathname === '/health' || pathname === '/api/health') return true;
  if (pathname === '/api/admin' && (!url.search || url.searchParams.get('resource') === 'health')) return true;
  if (pathname.startsWith('/api/admin') && url.searchParams.get('resource') === 'health') return true;
  return false;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function proxyApi(req, res, url) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const target = `${API_ORIGIN}${url.pathname}${url.search}`;
  const headers = { ...req.headers };
  delete headers.host;
  delete headers.connection;
  // Let upstream set content-length
  delete headers['content-length'];

  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await readBody(req);
  }

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      redirect: 'manual',
    });

    const outHeaders = {};
    upstream.headers.forEach((value, key) => {
      const k = key.toLowerCase();
      // Hop-by-hop / conflicting headers
      if (['transfer-encoding', 'connection', 'content-encoding'].includes(k)) return;
      outHeaders[key] = value;
    });

    // Ensure CORS on the response even if upstream omitted it
    applyCors(req, res);
    for (const [k, v] of Object.entries(outHeaders)) {
      try { res.setHeader(k, v); } catch { /* ignore invalid */ }
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status);
    res.end(buf);
  } catch (err) {
    console.error('[proxy]', target, err);
    applyCors(req, res);
    send(res, 502, JSON.stringify({ error: 'API unavailable' }), {
      'Content-Type': 'application/json',
    });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const pathname = url.pathname;

    // Local health (do not proxy — Fly machine checks)
    if (isLocalHealth(pathname, url)) {
      return health(res);
    }

    // API → upstream (Vercel serverless today; native Fly API later)
    if (pathname.startsWith('/api/')) {
      return await proxyApi(req, res, url);
    }

    // Optional: send shoppers to Vercel frontend only
    if (FRONTEND_URL && (pathname === '/' || pathname === '')) {
      res.writeHead(302, { Location: FRONTEND_URL });
      res.end();
      return;
    }

    // Static files from Vite build (fallback)
    let filePath = path.join(DIST, pathname === '/' ? 'index.html' : pathname);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST, 'index.html');
    }
    if (!fs.existsSync(filePath)) {
      return send(res, 404, 'Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const data = fs.readFileSync(filePath);
    send(res, 200, data, {
      'Content-Type': type,
      'Cache-Control': pathname.startsWith('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    });
  } catch (err) {
    console.error(err);
    send(res, 500, 'Internal Server Error');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[${new Date().toISOString()}] Vura Market listening on :${PORT}`);
  console.log(`[${new Date().toISOString()}] API proxy → ${API_ORIGIN}`);
  if (FRONTEND_URL) console.log(`[${new Date().toISOString()}] / redirects → ${FRONTEND_URL}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down…');
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down…');
  server.close(() => process.exit(0));
});
