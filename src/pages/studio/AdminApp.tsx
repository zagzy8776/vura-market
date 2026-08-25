import { useState, type FormEvent } from 'react';
import { BarChart3, Eye, EyeOff, Zap, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import ProductionStudioOps from './ProductionStudioOps';
import FinanceView from './FinanceView';

export default function AdminApp() {
  const { user, loading, signIn, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState<'studio' | 'finance'>('studio');

  if (loading) return <div className="grid min-h-screen place-items-center bg-[#080a12] text-white"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-vura-500"><Zap size={19} fill="currentColor" /></span><span className="text-xl font-black">Vura Studio</span></div></div>;

  if (!user) {
    const submit = async (e: FormEvent) => { e.preventDefault(); setBusy(true); setError(''); const result = await signIn(email.trim().toLowerCase(), password); if (result.error) setError(result.error.message); setBusy(false); };
    return <div className="grid min-h-screen place-items-center bg-[#080a12] px-4 text-white"><form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[.035] p-8 shadow-2xl backdrop-blur-xl"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-vura-500"><Zap size={20} fill="currentColor" /></span><div><h1 className="text-xl font-black">Vura Studio</h1><p className="text-xs text-white/40">Protected operations console</p></div></div><div className="mt-8 space-y-4"><label className="block"><span className="text-sm font-semibold text-white/70">Email</span><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:border-vura-400" autoComplete="username" /></label><label className="block"><span className="text-sm font-semibold text-white/70">Password</span><div className="relative mt-2"><input type={show?'text':'password'} required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 pr-12 text-sm outline-none focus:border-vura-400" autoComplete="current-password"/><button type="button" onClick={()=>setShow(v=>!v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40">{show?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></label>{error&&<p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm font-semibold text-red-300">{error}</p>}<button disabled={busy} className="w-full rounded-xl bg-vura-500 py-3.5 text-sm font-bold shadow-lg shadow-[#6a4cff]/25 disabled:opacity-60">{busy?'Signing in…':'Enter Studio'}</button></div><a href="/" className="mt-6 block text-center text-sm font-semibold text-white/40 hover:text-white">← Back to storefront</a></form></div>;
  }

  if (user.role !== 'admin') return <div className="grid min-h-screen place-items-center bg-[#080a12] px-4 text-white"><div className="w-full max-w-md rounded-3xl border border-amber-500/30 bg-white/[.035] p-8 text-center"><ShieldAlert className="mx-auto text-amber-400" size={36}/><h1 className="mt-4 text-xl font-black">Access restricted</h1><p className="mt-2 text-sm text-white/55">{user.email} is signed in, but this account does not have admin access.</p><button onClick={()=>void signOut()} className="mt-6 w-full rounded-xl border border-white/15 py-3 text-sm font-bold hover:bg-white/5">Sign out and try another account</button><a href="/" className="mt-4 block text-sm font-semibold text-white/40 hover:text-white">← Back to storefront</a></div></div>;

  return <div className="min-h-screen bg-[#080a12] text-white">
    <div className="flex items-center justify-between border-b border-white/10 bg-[#0b0d17] px-5 py-3 md:px-8">
      <div className="text-xs font-semibold text-white/35">Admin workspace</div>
      <div className="flex gap-2">
        <button onClick={()=>setSection('studio')} className={`rounded-lg px-3 py-2 text-xs font-bold ${section==='studio'?'bg-vura-500':'bg-white/5 text-white/55'}`}>Operations</button>
        <button onClick={()=>setSection('finance')} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold ${section==='finance'?'bg-vura-500':'bg-white/5 text-white/55'}`}><BarChart3 size={14}/> Finance & Reports</button>
      </div>
    </div>
    {section==='studio' ? <ProductionStudioOps /> : <div className="mx-auto max-w-[1800px] p-5 md:p-8"><FinanceView /></div>}
  </div>;
}
