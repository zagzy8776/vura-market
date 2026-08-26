#!/usr/bin/env node
/**
 * Vura Market – production server for Fly.io
 * Serves the Vite-built frontend + basic health endpoints.
 * Full API routes remain on Vercel (recommended).
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DIST = path.join(__dirname, 'dist');

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

function health(res) {
  send(res, 200, JSON.stringify({
    status: 'healthy',
    service: 'vura-market',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }), { 'Content-Type': 'application/json' });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const pathname = url.pathname;

  // Health checks used by Fly
  if (pathname === '/health' || pathname === '/api/health' || pathname === '/api/admin') {
    return health(res);
  }
  if (pathname.startsWith('/api/admin') && url.searchParams.get('resource') === 'health') {
    return health(res);
  }

  // Static files from Vite build
  let filePath = path.join(DIST, pathname === '/' ? 'index.html' : pathname);

  // SPA fallback
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    return send(res, 404, 'Not Found');
  }

  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';

  try {
    const data = fs.readFileSync(filePath);
    send(res, 200, data, {
      'Content-Type': type,
      'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
  } catch (err) {
    console.error(err);
    send(res, 500, 'Internal Server Error');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[${new Date().toISOString()}] Vura Market production server listening on :${PORT}`);
  console.log(`[${new Date().toISOString()}] Serving static files from ${DIST}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down…');
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down…');
  server.close(() => process.exit(0));
});
