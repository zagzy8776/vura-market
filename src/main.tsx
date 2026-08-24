import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from '@/context/AuthContext';
import './index.css';

// Defensive compatibility for environments/extensions that replace Promise
// with a constructor that does not expose Promise.all.
const PromiseCtor = globalThis.Promise as typeof Promise & { all?: typeof Promise.all };
if (typeof PromiseCtor.all !== 'function') {
  PromiseCtor.all = (values: Iterable<unknown>) => new Promise<unknown[]>((resolve, reject) => {
    const items = Array.from(values);
    const results: unknown[] = new Array(items.length);
    let remaining = items.length;
    if (remaining === 0) return resolve(results);
    items.forEach((item, index) => {
      PromiseCtor.resolve(item).then(value => {
        results[index] = value;
        remaining -= 1;
        if (remaining === 0) resolve(results);
      }, reject);
    });
  }) as typeof Promise.all;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);
