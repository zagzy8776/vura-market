import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { apiRoutesPlugin } from './vite-api-plugin';

const storefrontRuntimeFix = {
  name: 'vura-storefront-runtime-fix',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    if (!id.includes('/src/App.tsx')) return null;
    let next = code;

    if (next.includes('ArrowUpRight') && !next.includes('ArrowUpRight, Bell')) {
      next = `import { ArrowUpRight as __VuraArrowUpRight } from 'lucide-react';\n${next.replaceAll('ArrowUpRight', '__VuraArrowUpRight')}`;
    }

    next = next.replace(
      'Header user={user} view={view}',
      'Header categories={categories} user={user} view={view}'
    );
    next = next.replace(
      'function Header({ user, view, onView, onAuth, onSearch, search, onMenu }:',
      'function Header({ categories, user, view, onView, onAuth, onSearch, search, onMenu }:'
    );

    if (next === code) return null;
    return { code: next, map: null };
  },
};

export default defineConfig({
  plugins: [storefrontRuntimeFix, react(), apiRoutesPlugin()],
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
