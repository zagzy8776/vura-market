import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Lock, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';

type Status = 'pending' | 'success' | 'error';

export default function AccountClaimPage() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>('pending');
  const [error, setError] = useState('');

  if (!token) {
    return <Splash>Your claim link is missing a token. Open the link from your email instead.</Splash>;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true); setError('');
    try {
      await api.post('/api/auth/claim', { token, password });
      setStatus('success');
      // The storefront routes do not include /account, /orders, or /studio
      // (those entries exist only as types). Send the user back to the
      // storefront after a brief pause so they can sign in.
      setTimeout(() => { window.location.href = '/'; }, 1500);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'We could not claim that account.');
    } finally { setBusy(false); }
  };

  if (status === 'success') {
    return <Splash><Sparkles className="mx-auto text-emerald-500" size={32}/><h1 className="mt-4 text-2xl font-black">You are in</h1><p className="mt-2 text-sm text-[#5f6678]">Your account is ready. Taking you to your orders…</p></Splash>;
  }

  return <main className="min-h-screen bg-[#f7f8fc] grid place-items-center px-4 py-10">
    <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-[#e7e9f1] bg-white p-8 shadow-2xl">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-vura-500 text-white shadow-lg shadow-[#5b35f5]/20"><Lock size={20}/></span>
        <div><h1 className="text-xl font-black">Set your password</h1><p className="text-xs text-[#7c8495]">Create one to sign in again and track future orders.</p></div>
      </div>
      <div className="mt-7 space-y-4">
        <label className="block"><span className="text-sm font-semibold text-[#3a3f55]">New password</span>
          <div className="relative mt-2">
            <input type={show ? 'text' : 'password'} required minLength={8} value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-xl border border-[#e2e5ee] bg-[#fafbfe] px-4 py-3 pr-12 text-sm outline-none focus:border-vura-500 focus:bg-white" autoComplete="new-password"/>
            <button type="button" onClick={() => setShow(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#98a0b3]">{show ? <EyeOff size={17}/> : <Eye size={17}/>}</button>
          </div>
        </label>
        <label className="block"><span className="text-sm font-semibold text-[#3a3f55]">Confirm password</span>
          <input type={show ? 'text' : 'password'} required minLength={8} value={confirm} onChange={e => setConfirm(e.target.value)} className="mt-2 w-full rounded-xl border border-[#e2e5ee] bg-[#fafbfe] px-4 py-3 text-sm outline-none focus:border-vura-500 focus:bg-white" autoComplete="new-password"/>
        </label>
        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-vura-500 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#5b35f5]/25 disabled:opacity-60">{busy ? 'Saving…' : 'Save and sign in'}</button>
      </div>
      <a href="/" className="mt-6 block text-center text-sm font-semibold text-[#7c8495] hover:text-[#17182a]">← Back to storefront</a>
    </form>
  </main>;
}

function Splash({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-[#f7f8fc] grid place-items-center px-4 py-10">
    <div className="w-full max-w-md rounded-3xl border border-[#e7e9f1] bg-white p-8 text-center shadow-2xl">{children}</div>
  </main>;
}
