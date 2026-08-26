#!/usr/bin/env node

/**
 * Vura Market - Production Start Script
 * Runs the application with proper error handling and graceful shutdown
 */

const http = require('http');
const path = require('path');

const PORT = process.env.PORT || 3000;

// Health check endpoint
const healthCheckHandler = (req, res) => {
  if (req.url === '/api/admin?resource=health' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
};

// Create and start server
const server = http.createServer(healthCheckHandler);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[${new Date().toISOString()}] Vura Market server running on port ${PORT}`);
  console.log(`[${new Date().toISOString()}] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[${new Date().toISOString()}] Health check available at http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log(`[${new Date().toISOString()}] SIGTERM received, gracefully shutting down...`);
  server.close(() => {
    console.log(`[${new Date().toISOString()}] Server closed`);
    process.exit(0);
  });
  
  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error(`[${new Date().toISOString()}] Forced shutdown after timeout`);
    process.exit(1);
  }, 30000);
});

process.on('SIGINT', () => {
  console.log(`[${new Date().toISOString()}] SIGINT received, gracefully shutting down...`);
  server.close(() => {
    console.log(`[${new Date().toISOString()}] Server closed`);
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error(`[${new Date().toISOString()}] Uncaught Exception:`, error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`[${new Date().toISOString()}] Unhandled Rejection at:`, promise, 'reason:', reason);
  process.exit(1);
});
