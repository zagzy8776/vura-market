import { useEffect, useState, type FormEvent } from 'react';
import { Zap } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Link, useRouter } from '../router';
import { Button, Field, Input } from '../components/ui';
import { useWishlist } from '../context/WishlistContext';

export function AuthPage({ mode }: { mode: 'signin' | 'signup' }) {
  const router = useRouter();
  const { user, signIn, signUp } = useAuth();
  const wishlist = useWishlist();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const nextPath = router.query.get('next') || '/account';

  useEffect(() => {
    if (user) router.navigate(nextPath, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const result = mode === 'signin'
      ? await signIn(form.email.trim(), form.password)
      : await signUp(form.email.trim(), form.password, form.name.trim());
    if (result.error) {
      setError(result.error.message);
      setBusy(false);
      return;
    }
    if (mode === 'signin') await wishlist.mergeGuestList().catch(() => undefined);
  };

  return (
    <main id="main" className="mx-auto flex max-w-md flex-col px-4 py-16">
      <div className="mb-8 flex items-center justify-center gap-2.5">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-vura-500 text-white shadow-xl shadow-vura-500/30"><Zap size={20} fill="currentColor" aria-hidden /></span>
        <span className="font-display text-2xl font-bold tracking-[-0.07em] text-hi">VURA<span className="text-vura-400">.</span></span>
      </div>

      <div className="rounded-3xl border border-white/8 bg-surface/60 p-7">
        <h1 className="font-display text-2xl font-bold text-hi">{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="mt-1.5 text-sm text-mid">{mode === 'signin' ? 'Sign in to track orders and your wishlist.' : 'Track orders, save products and check out faster.'}</p>

        <form className="mt-6 space-y-4" onSubmit={submit}>
          {mode === 'signup' && (
            <Field label="Full name" required>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoComplete="name" required minLength={2} placeholder="Chinedu Okafor" />
            </Field>
          )}
          <Field label="Email" required>
            <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} autoComplete="email" required placeholder="you@example.com" />
          </Field>
          <Field label="Password" required hint={mode === 'signup' ? 'At least 8 characters.' : undefined}>
            <Input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required minLength={8} placeholder="••••••••" />
          </Field>
          {error && <p role="alert" className="text-sm font-semibold text-red-400">{error}</p>}
          <Button size="lg" className="w-full" loading={busy} type="submit">
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-mid">
          {mode === 'signin' ? (
            <>New to Vura? <Link to={`/signup${nextPath !== '/account' ? `?next=${encodeURIComponent(nextPath)}` : ''}`} className="font-bold text-vura-300 hover:text-vura-200">Create an account</Link></>
          ) : (
            <>Already have an account? <Link to={`/signin${nextPath !== '/account' ? `?next=${encodeURIComponent(nextPath)}` : ''}`} className="font-bold text-vura-300 hover:text-vura-200">Sign in</Link></>
          )}
        </p>
        <p className="mt-4 rounded-xl bg-white/[0.03] p-3 text-center text-xs leading-5 text-low">
          You can also check out as a guest — we'll offer to create your account after your first order.
        </p>
      </div>
    </main>
  );
}
