import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { apiRoutesPlugin } from './vite-api-plugin';

// Avoid relying on a browser-provided Promise.all. Some browser extensions
// have been observed to replace the global Promise with an incomplete shim.
// Async functions use the engine's intrinsic promise machinery and therefore
// keep the application independent from that global mutation.
const safePromiseAllPlugin = {
  name: 'safe-promise-all',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    if (!id.includes('/src/') || !code.includes('Promise.all(')) return null;

    const safeAll = `
const __safePromiseAll = async (values) => {
  const results = [];
  for (const value of values) results.push(await value);
  return results;
};
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
