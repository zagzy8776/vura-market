import { useEffect, useState } from 'react';
import { Check, RefreshCw, Store, X } from 'lucide-react';
import { money } from '@/lib/money';
import { sellerApi, type SellerListing } from '@/customer/lib/sellerApi';

export default function StudioSellerListings() {
  const [items, setItems] = useState<SellerListing[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const load = () => {
    setLoading(true); setError('');
    sellerApi.reviewQueue().then(r => setItems(r.listings)).catch(e => setError((e as Error).message)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);
  const decide = async (item: SellerListing, status: 'approved' | 'rejected') => {
    if (status === 'rejected' && !window.confirm('Reject this listing?')) return;
    setBusy(item.id); setError('');
    try { await sellerApi.review(item.id, status); load(); } catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  };
  return <section className="text-[var(--admin-text-primary)]">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-vura-500">Admin only</p><h2 className="mt-2 text-2xl font-black">Community seller reviews</h2><p className="mt-2 text-sm text-[var(--admin-text-secondary)]">Approve real listings before they appear publicly. Sellers never get Studio access.</p></div><button onClick={load} className="flex items-center gap-2 rounded-xl border border-[var(--admin-border)] px-4 py-3 text-sm font-bold"><RefreshCw size={16}/> Refresh</button></div>
    {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {loading ? <p className="mt-8">Loading submitted products…</p> : <div className="mt-7 grid gap-4 lg:grid-cols-2">{items.map(item => <article key={item.id} className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] p-5"><div className="flex gap-4"><div className="h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-[var(--admin-table-row-hover)]">{item.images?.[0] && <img className="h-full w-full object-cover" src={item.images[0]} alt={item.title}/>}</div><div className="min-w-0"><span className="rounded-full bg-[var(--admin-table-row-hover)] px-2 py-1 text-xs font-bold uppercase">{item.status}</span><h3 className="mt-2 text-lg font-bold">{item.title}</h3><p className="mt-1 font-black text-vura-500">{money(item.price_kobo)}</p><p className="mt-1 text-xs text-[var(--admin-text-secondary)]">{item.category_name} · {item.condition_label}</p></div></div><p className="mt-4 whitespace-pre-wrap text-sm text-[var(--admin-text-secondary)]">{item.description}</p><div className="mt-4 rounded-xl bg-[var(--admin-table-row-hover)] p-3 text-xs"><p className="font-bold"><Store size={13} className="mr-1 inline"/>{item.shop_name}</p><p className="mt-1">{item.city}, {item.state_code} · {item.whatsapp}</p><p className="mt-1">{(item as SellerListing & { seller_email?: string }).seller_email}</p></div><div className="mt-4 flex gap-2"><button disabled={!!busy || item.status === 'approved'} onClick={() => void decide(item, 'approved')} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"><Check size={16}/> Approve</button><button disabled={!!busy || item.status === 'rejected'} onClick={() => void decide(item, 'rejected')} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-300 px-4 py-3 text-sm font-bold text-red-500 disabled:opacity-40"><X size={16}/> Reject</button></div></article>)}{!items.length && <div className="col-span-full rounded-2xl border border-dashed border-[var(--admin-border)] p-14 text-center text-[var(--admin-text-secondary)]">No community listings submitted yet.</div>}</div>}
  </section>;
}
