import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import AdminApp from '@/pages/studio/AdminApp';
import { AuthProvider } from '@/context/AuthContext';
import './index.css';

const isStudio = window.location.pathname.startsWith('/studio');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      {isStudio ? <AdminApp /> : <App />}
    </AuthProvider>
  </StrictMode>
);
