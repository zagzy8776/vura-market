FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx vite build
RUN npx --yes esbuild@0.25.0 api/_lib/agents/worker-entry.ts --bundle --platform=node --format=esm --outfile=agent-worker.mjs \
  || printf '%s\n' 'export function startWorker(){ console.warn("worker bundle missing"); }' > agent-worker.mjs

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache dumb-init
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/agent-worker.mjs ./agent-worker.mjs
COPY --from=builder /app/api ./api
COPY --from=builder /app/node_modules ./node_modules
COPY server.mjs .
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 && chown -R nodejs:nodejs /app
USER nodejs
ENV NODE_ENV=production
ENV PORT=3000
ENV AGENT_WORKER_ENABLED=true
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.mjs"]
