import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type AppUser = { id: string; name: string; email: string };
type AuthContextValue = { user: AppUser | null; loading: boolean; signIn: (email: string, password: string) => Promise<{ error: Error | null }>; signUp: (email: string, password: string, name: string) => Promise<{ error: Error | null }>; signOut: () => void };
const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const STORAGE_KEY = 'vura-user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { const saved = localStorage.getItem(STORAGE_KEY); if (saved) { try { setUser(JSON.parse(saved) as AppUser); } catch { localStorage.removeItem(STORAGE_KEY); } } setLoading(false); }, []);
  const value = useMemo<AuthContextValue>(() => ({
    user, loading,
    async signIn(email, password) { try { const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }); const result = await response.json() as { user?: AppUser; error?: string }; if (!response.ok || !result.user) return { error: new Error(result.error || 'Unable to sign in') }; setUser(result.user); localStorage.setItem(STORAGE_KEY, JSON.stringify(result.user)); return { error: null }; } catch { return { error: new Error('Unable to sign in') }; } },
    async signUp(email, password, name) { try { const response = await fetch('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, name }) }); const result = await response.json() as { user?: AppUser; error?: string }; if (!response.ok || !result.user) return { error: new Error(result.error || 'Unable to create account') }; setUser(result.user); localStorage.setItem(STORAGE_KEY, JSON.stringify(result.user)); return { error: null }; } catch { return { error: new Error('Unable to create account') }; } },
    signOut() { setUser(null); localStorage.removeItem(STORAGE_KEY); },
  }), [loading, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { const context = useContext(AuthContext); if (!context) throw new Error('useAuth must be used within AuthProvider'); return context; }
