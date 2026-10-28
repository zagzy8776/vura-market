import { useEffect, useState } from 'react';
import { Check, RefreshCw, X } from 'lucide-react';
import { money } from '@/lib/money';
import { sellerApi, type SellerListing } from '@/customer/lib/sellerApi';

export default function StudioSellerListings() {
  const [list, setList] = useState<SellerListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const load = () => {
    setLoading(true); setError('');
    void sellerApi.moderation().then(r => setList(r.listings)).catch(e => setError((e as Error).message)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);
  const review = async (id: string, status: 'approved' | 'rejected') => {
    setBusy(id);
    try { await sellerApi.review(id, status); load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  };
  return <section className="text-[var(--admin-text-primary)]">
    <div className="flex items-center justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-widest text-vura-500">Only Vura administrators</p><h1 className="mt-2 text-2xl font-black">Seller listing reviews</h1><p className="mt-2 text-sm text-[var(--admin-text-secondary)]">Approve posts before they appear on Vura. Sellers cannot access this screen.</p></div>
      <button onClick={load} className="rounded-xl border border-[var(--admin-border)] p-3" aria-label="Refresh submissions"><RefreshCw size={18}/></button>
    </div>
    {error && <p role="alert" className="mt-5 rounded-lg bg-red-100 p-3 text-sm text-red-800">{error}</p>}
    {loading && <p className="mt-8 text-sm">Loading seller submissions…</p>}
    {!loading && <div className="mt-6 grid gap-4 lg:grid-cols-2">{list.map(p =>
      <article key={p.id} className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] p-4">
        <div className="flex gap-4">
          {p.images?.[0] && <img src={p.images[0]} alt="" className="h-28 w-28 rounded-xl object-cover"/>}
          <div className="min-w-0"><span className="text-xs font-bold uppercase text-vura-500">{p.status}</span><h2 className="mt-2 text-lg font-bold">{p.title}</h2><p className="mt-1 font-black">{money(p.price_kobo)}</p><p className="mt-1 text-xs text-[var(--admin-text-secondary)]">{p.condition_label} · {p.category_name}</p></div>
        </div>
        <p className="mt-4 whitespace-pre-wrap text-sm text-[var(--admin-text-secondary)]">{p.description}</p>
        <div className="mt-4 rounded-xl bg-[var(--admin-table-row-hover)] p-3 text-xs">
          <strong>{p.shop_name}</strong><p className="mt-1">{p.city}, {p.state_code} · {p.whatsapp}</p>
          <p className="mt-1">{p.seller_email}</p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button disabled={!!busy || p.status === 'approved'} onClick={() => void review(p.id, 'approved')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"><Check size={16}/> Approve</button>
          <button disabled={!!busy || p.status === 'rejected'} onClick={() => void review(p.id, 'rejected')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500 px-4 py-3 text-sm font-bold text-red-500 disabled:opacity-40"><X size={16}/> Reject</button>
        </div>
      </article>)}
      {!list.length && <div className="col-span-full rounded-2xl border border-dashed border-[var(--admin-border)] p-12 text-center text-sm">No submitted listings yet.</div>}
    </div>}
  </section>;
}
