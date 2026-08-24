import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { apiRoutesPlugin } from './vite-api-plugin';

// Keep application code independent of Promise.all because browser extensions
// can replace the Promise constructor with an incomplete implementation.
const safePromiseAllPlugin = {
  name: 'safe-promise-all',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    if (!id.includes('/src/') || !code.includes('Promise.all(')) return null;

    const safeAll = `
const __safePromiseAll = (values) => new Promise((resolve, reject) => {
  const items = Array.from(values);
  const results = new Array(items.length);
  let remaining = items.length;
  if (remaining === 0) return resolve(results);
  items.forEach((item, index) => {
    Promise.resolve(item).then(value => {
      results[index] = value;
      remaining -= 1;
      if (remaining === 0) resolve(results);
    }, reject);
  });
});
`;

    return {
      code: `${safeAll}\n${code.replaceAll('Promise.all(', '__safePromiseAll(')}`,
      map: null,
    };
  },
};

export default defineConfig({
  plugins: [safePromiseAllPlugin, react(), apiRoutesPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  ssr: {
    noExternal: ['@neondatabase/serverless', 'bcryptjs'],
  },
});
