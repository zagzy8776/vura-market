import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Zap, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import StudioApp from '@/StudioApp';

export default function AdminApp() {
  const { user, loading, signIn, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-[#0b0d17] text-white"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#5b35f5]"><Zap size={19} fill="currentColor" /></span><span className="text-xl font-black">Vura Studio</span></div></div>;
  }

  if (!user) {
    const submit = async (e: FormEvent) => {
      e.preventDefault();
      setBusy(true);
      setError('');
      const result = await signIn(email.trim().toLowerCase(), password);
      if (result.error) setError(result.error.message);
      setBusy(false);
    };
    return <div className="grid min-h-screen place-items-center bg-[#0b0d17] px-4 text-white"><form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-white/10 bg-[#121522] p-8 shadow-2xl"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#5b35f5]"><Zap size={20} fill="currentColor" /></span><div><h1 className="text-xl font-black">Vura Studio</h1><p className="text-xs text-white/40">Protected operations console</p></div></div><div className="mt-8 space-y-4"><label className="block"><span className="text-sm font-semibold text-white/70">Email</span><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-[#5b35f5]" autoComplete="username" /></label><label className="block"><span className="text-sm font-semibold text-white/70">Password</span><div className="relative mt-2"><input type={show?'text':'password'} required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-12 text-sm outline-none focus:border-[#5b35f5]" autoComplete="current-password"/><button type="button" onClick={()=>setShow(v=>!v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40">{show?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></label>{error&&<p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm font-semibold text-red-300">{error}</p>}<button disabled={busy} className="w-full rounded-xl bg-[#5b35f5] py-3.5 text-sm font-bold shadow-lg shadow-[#5b35f5]/30 disabled:opacity-60">{busy?'Signing in…':'Enter Studio'}</button></div><a href="/" className="mt-6 block text-center text-sm font-semibold text-white/40 hover:text-white">← Back to storefront</a></form></div>;
  }

  if (user.role !== 'admin') {
    return <div className="grid min-h-screen place-items-center bg-[#0b0d17] px-4 text-white"><div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-[#121522] p-8 text-center"><ShieldAlert className="mx-auto text-amber-400" size={36}/><h1 className="mt-4 text-xl font-black">Access restricted</h1><p className="mt-2 text-sm text-white/55">{user.email} is signed in, but this account does not have admin access.</p><button onClick={()=>void signOut()} className="mt-6 w-full rounded-xl border border-white/15 py-3 text-sm font-bold hover:bg-white/5">Sign out and try another account</button><a href="/" className="mt-4 block text-sm font-semibold text-white/40 hover:text-white">← Back to storefront</a></div></div>;
  }

  return <StudioApp />;
}
