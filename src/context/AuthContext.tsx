import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppUser } from '@/types';
import { linkOneSignalUser, unlinkOneSignalUser } from '@/lib/onesignal';

export type { AppUser };
type AuthContextValue = { user: AppUser | null; loading: boolean; signIn: (email: string, password: string) => Promise<{ error: Error | null }>; signUp: (email: string, password: string, name: string) => Promise<{ error: Error | null }>; signOut: () => Promise<void> };
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function readUser(response: Response) {
  const result = await response.json() as { user?: AppUser | null; error?: string };
  return { result, ok: response.ok };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(readUser)
      .then(({ result }) => {
        const u = result.user || null;
        setUser(u);
        void linkOneSignalUser(u?.id);
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    async signIn(email, password) {
      try {
        const response = await fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
        const { result } = await readUser(response);
        if (!response.ok || !result.user) return { error: new Error(result.error || 'Unable to sign in') };
        setUser(result.user);
        void linkOneSignalUser(result.user.id);
        return { error: null };
      } catch {
        return { error: new Error('Unable to sign in') };
      }
    },
    async signUp(email, password, name) {
      try {
        const response = await fetch('/api/auth/signup', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, name }) });
        const { result } = await readUser(response);
        if (!response.ok || !result.user) return { error: new Error(result.error || 'Unable to create account') };
        setUser(result.user);
        void linkOneSignalUser(result.user.id);
        return { error: null };
      } catch {
        return { error: new Error('Unable to create account') };
      }
    },
    async signOut() {
      try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } finally { void unlinkOneSignalUser(); setUser(null); }
    },
  }), [loading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { const context = useContext(AuthContext); if (!context) throw new Error('useAuth must be used within AuthProvider'); return context; }
