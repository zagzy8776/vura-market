import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import CustomerApp from '@/customer/CustomerApp';
import AdminApp from '@/pages/studio/AdminApp';
import AccountClaimPage from '@/pages/AccountClaim';
import { AuthProvider } from '@/context/AuthContext';
import { initOneSignal } from '@/lib/onesignal';
import PushPromptBanner from '@/components/PushPromptBanner';
import './index.css';

void initOneSignal();

const path = window.location.pathname;
const isStudio = path.startsWith('/studio');
const isClaim = path.startsWith('/account/claim');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      {isClaim ? <AccountClaimPage /> : isStudio ? <AdminApp /> : <CustomerApp />}
      <PushPromptBanner />
    </AuthProvider>
  </StrictMode>
);
