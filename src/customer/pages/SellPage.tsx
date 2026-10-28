import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Camera, Clock3, Copy, ImagePlus, Package, PauseCircle, Pencil, Plus, Store, Trash2, UploadCloud, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { uploadFilesToCloudinary } from '@/lib/cloudinary';
import { money } from '@/lib/money';
import type { CategoryPublic, NigeriaState } from '@/types';
import { Link, useRouter } from '../router';
import { sellerApi, type SellerListing, type SellerProfile } from '../lib/sellerApi';

const input = 'mt-1.5 w-full rounded-xl border border-[#dfe1ec] bg-white px-4 py-3 text-[15px] text-[#17182a] outline-none transition focus:border-vura-500 focus:ring-2 focus:ring-vura-500/10';
const label = 'block text-sm font-bold text-[#30354b]';
type Form = { title: string; description: string; price: string; quantity: string; condition: string; categoryId: string; shopName: string; whatsapp: string; stateCode: string; city: string; campus: string; images: string[] };
const blank: Form = { title: '', description: '', price: '', quantity: '1', condition: 'New', categoryId: '', shopName: '', whatsapp: '', stateCode: '', city: '', campus: '', images: [] };
const statuses: Record<string, { text: string; className: string }> = {
  pending: { text: 'Awaiting review', className: 'bg-amber-50 text-amber-700' },
  approved: { text: 'Live', className: 'bg-emerald-50 text-emerald-700' },
  rejected: { text: 'Needs changes', className: 'bg-red-50 text-red-700' },
  paused: { text: 'Paused', className: 'bg-slate-100 text-slate-600' },
};

function useSellerAuth(next: string) {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !user) router.navigate('/signin?next=' + encodeURIComponent(next), { replace: true });
  }, [loading, user, router, next]);
  return { user, loading };
}

function Status({ status }: { status: string }) {
  const s = statuses[status] || statuses.pending;
  return <span className={'inline-flex rounded-full px-3 py-1 text-xs font-bold ' + s.className}>{s.text}</span>;
}

export function SellerDashboard() {
  const router = useRouter();
  const { user, loading } = useSellerAuth('/sell');
  const [listings, setListings] = useState<SellerListing[]>([]);
  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const reload = () => {
    setError('');
    sellerApi.mine(page).then(r => { setListings(r.listings); setProfile(r.profile); setTotal(r.total); setLoaded(true); }).catch(e => { setError((e as Error).message); setLoaded(true); });
  };
  useEffect(() => { if (user) reload(); }, [user, page]);

  const change = async (listing: SellerListing, action: 'pause' | 'resume' | 'delete') => {
    if (action === 'delete' && !window.confirm('Remove this listing from your shop?')) return;
    setBusy(listing.id); setError('');
    try {
      if (action === 'delete') await sellerApi.remove(listing.id);
      else await sellerApi.change(listing.id, action);
      reload();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  };

  if (loading || !user) return <main id="main" className="mx-auto max-w-5xl px-5 py-16 text-[#5f6678]">Opening your shop…</main>;
  return <main id="main" className="min-h-[70vh] bg-[#f7f7fb] px-4 py-8 text-[#17182a] md:px-6 md:py-12">
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-vura-500"><Store size={15}/> Your selling space</p>
          <h1 className="mt-2 font-display text-3xl font-black tracking-tight md:text-4xl">{profile?.shop_name || 'My Vura shop'}</h1>
          <p className="mt-2 text-sm text-[#747c8d]">Your products, your customers, your shop. No admin dashboard needed.</p>
        </div>
        <Link to="/sell/new" className="inline-flex items-center gap-2 rounded-xl bg-vura-500 px-5 py-3 font-bold text-white shadow-lg shadow-vura-500/20"><Plus size={18}/> Post a product</Link>
      </div>
      <div className="mt-7 grid grid-cols-3 gap-2 sm:gap-4">
        {[
          { v: total, t: 'Total posts' },
          { v: listings.filter(x => x.status === 'approved').length, t: 'Live on this page' },
          { v: listings.filter(x => x.status === 'pending').length, t: 'Awaiting review' },
        ].map(x => <div key={x.t} className="rounded-2xl border border-[#e8e7f1] bg-white p-4 sm:p-6"><p className="text-2xl font-black">{x.v}</p><p className="mt-1 text-xs font-medium text-[#838b9e]">{x.t}</p></div>)}
      </div>
      {profile && <div className="mt-5 flex flex-wrap gap-3 text-sm font-medium text-[#6b7284]"><span>{profile.city} · {profile.state_code}</span>{profile.campus && <span>· {profile.campus}</span>}<Link to={'/shop/' + user.id} className="font-bold text-vura-500">View public shop <ArrowRight size={14} className="inline"/></Link></div>}
      <div className="mt-7 rounded-3xl border border-[#e6e7ef] bg-white p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-xl font-bold">My listings</h2><span className="text-sm text-[#81899a]">Page {page} · {total} posts</span></div>
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {!loaded && <p className="mt-8 text-sm text-[#7e879b]">Loading your products…</p>}
        {loaded && !listings.length && <div className="py-14 text-center"><Package size={38} className="mx-auto text-[#c3b9fd]"/><h3 className="mt-4 text-xl font-bold">Your shop starts here</h3><p className="mt-2 text-sm text-[#777f91]">Post your first product, then add as many more as you need.</p><Link to="/sell/new" className="mt-5 inline-flex rounded-xl bg-vura-500 px-5 py-3 text-sm font-bold text-white">Create my first post</Link></div>}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map(item => <article key={item.id} className="overflow-hidden rounded-2xl border border-[#e9e8ef] bg-white">
            <div className="flex gap-4 p-3 sm:block">
              <div className="h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-[#f5f4fb] sm:aspect-[4/3] sm:h-auto sm:w-full">{item.images?.[0] && <img src={item.images[0]} alt="" className="h-full w-full object-cover"/>}</div>
              <div className="min-w-0 flex-1 sm:mt-3">
                <Status status={item.status}/>
                <h3 className="mt-2 line-clamp-2 text-sm font-bold">{item.title}</h3>
                <p className="mt-1 text-sm font-black text-vura-500">{money(item.price_kobo)}</p>
                <p className="mt-1 text-xs text-[#82899a]">{item.quantity} available</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1 border-t border-[#edeef3] p-2">
              <button disabled={!!busy} onClick={() => router.navigate('/sell/new?edit=' + item.id)} className="flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-bold text-[#4c5162] hover:bg-[#f3f1ff]"><Pencil size={13}/> Edit</button>
              <button disabled={!!busy} onClick={() => void change(item, item.status === 'paused' || item.status === 'rejected' ? 'resume' : 'pause')} className="flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-bold text-[#4c5162] hover:bg-[#f3f1ff]"><PauseCircle size={13}/>{item.status === 'paused' || item.status === 'rejected' ? 'Resubmit' : 'Pause'}</button>
              <button disabled={!!busy} onClick={() => void change(item, 'delete')} className="flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-bold text-red-600 hover:bg-red-50"><Trash2 size={13}/> Remove</button>
            </div>
            {item.status === 'approved' && <button onClick={() => void navigator.clipboard.writeText(window.location.origin + '/listing/' + item.id)} className="flex w-full items-center justify-center gap-2 border-t border-[#edeef3] py-2 text-xs font-bold text-vura-500"><Copy size={14}/> Copy product link</button>}
          </article>)}
        </div>
        {total > 24 && <div className="mt-6 flex items-center justify-end gap-3"><button className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button><button className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40" disabled={page * 24 >= total} onClick={() => setPage(p => p + 1)}>Next</button></div>}
      </div>
    </div>
  </main>;
}

export function PostPage({ categories }: { categories: CategoryPublic[] }) {
  const router = useRouter();
  const { user, loading } = useSellerAuth('/sell/new');
  const editId = router.query.get('edit');
  const [form, setForm] = useState<Form>(blank);
  const [states, setStates] = useState<NigeriaState[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(!editId);
  const set = (key: keyof Form, value: string | string[]) => setForm(f => ({ ...f, [key]: value }));

  useEffect(() => {
    if (!user) return;
    void Promise.all([editId ? sellerApi.one(editId) : sellerApi.mine(1), sellerApi.locations()])
      .then(([r, locations]) => {
        setStates(locations.states);
        const item = r.listings.find(p => p.id === editId);
        const shop = r.profile;
        setForm(f => ({ ...f,
          shopName: shop?.shop_name || f.shopName, whatsapp: shop?.whatsapp || f.whatsapp,
          stateCode: shop?.state_code || f.stateCode, city: shop?.city || f.city, campus: shop?.campus || f.campus,
          ...(item ? { title: item.title, description: item.description, price: String(Number(item.price_kobo) / 100), quantity: String(item.quantity), categoryId: item.category_id || '', condition: item.condition_label, images: item.images } : {}),
        }));
        if (editId && !item) setError('Listing not found in your shop.');
      })
      .catch(e => setError((e as Error).message))
      .finally(() => setReady(true));
  }, [user, editId]);

  const upload = async (files: FileList | null) => {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    if (selected.some(file => !file.type.startsWith('image/') || file.size > 8 * 1024 * 1024)) { setError('Choose images under 8MB each.'); return; }
    if (selected.length + form.images.length > 8) { setError('You can attach up to 8 photos.'); return; }
    setError(''); setUploading(true);
    try { const urls = await uploadFilesToCloudinary(selected); setForm(f => ({ ...f, images: [...f.images, ...urls] })); }
    catch (e) { setError((e as Error).message); }
    finally { setUploading(false); }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError('');
    if (!form.images.length) { setError('Upload at least one clear product photo.'); return; }
    if (!form.categoryId) { setError('Choose a category.'); return; }
    if (!form.whatsapp.replace(/\D/g, '').match(/^[0-9]{10,15}$/)) { setError('Enter a valid WhatsApp number with country code.'); return; }
    setSubmitting(true);
    try {
      const payload = { ...form, priceKobo: Math.round(Number(form.price) * 100), quantity: Number(form.quantity) };
      if (editId) await sellerApi.edit(editId, payload);
      else await sellerApi.post(payload);
      router.navigate('/sell?posted=1');
    } catch (err) { setError((err as Error).message); }
    finally { setSubmitting(false); }
  };

  if (loading || !user) return <main id="main" className="px-5 py-16 text-center text-[#70798e]">Opening your posting form…</main>;
  return <main id="main" className="min-h-[70vh] bg-[#f7f7fb] px-4 py-7 text-[#17182a] md:px-6 md:py-12">
    <div className="mx-auto max-w-3xl">
      <Link to="/sell" className="inline-flex items-center gap-2 text-sm font-bold text-[#747c8d]"><ArrowLeft size={17}/> My shop</Link>
      <div className="mt-5 flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-vura-500">VURA SELL</p><h1 className="mt-2 font-display text-3xl font-black tracking-tight sm:text-4xl">{editId ? 'Edit your product' : 'What are you selling?'}</h1><p className="mt-2 text-sm text-[#777f91]">A few good photos and clear details help customers trust your listing.</p></div><span className="hidden rounded-2xl bg-[#ede8ff] p-3 text-vura-500 sm:block"><ImagePlus size={26}/></span></div>
      <form onSubmit={submit} className="mt-7 space-y-5">
        <section className="rounded-3xl border border-[#e8e8f0] bg-white p-5 shadow-sm sm:p-7">
          <h2 className="flex items-center gap-2 text-lg font-black"><Camera size={19} className="text-vura-500"/> Product photos</h2><p className="mt-1 text-sm text-[#838b9b]">Add up to 8 photos. Use your own clear images.</p>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {form.images.map((src, i) => <div key={src + i} className="relative aspect-square overflow-hidden rounded-xl bg-[#f3f2f8]"><img src={src} alt={'Product photo ' + (i + 1)} className="h-full w-full object-cover"/><button aria-label={'Remove photo ' + (i + 1)} type="button" onClick={() => set('images', form.images.filter((_, x) => x !== i))} className="absolute right-1 top-1 rounded-full bg-[#17182a] p-1.5 text-white"><X size={14}/></button></div>)}
            {form.images.length < 8 && <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#c9c2ea] bg-[#faf9ff] text-center text-xs font-bold text-vura-500"><UploadCloud size={25}/>{uploading ? 'Uploading…' : 'Add photos'}<input type="file" accept="image/*" multiple className="sr-only" disabled={uploading} onChange={e => { void upload(e.target.files); e.target.value = ''; }}/></label>}
          </div>
        </section>
        <section className="space-y-5 rounded-3xl border border-[#e8e8f0] bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-lg font-black">Product information</h2>
          <div><label htmlFor="seller-title" className={label}>Product name *</label><input id="seller-title" className={input} required maxLength={150} minLength={3} value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. iPhone 12 128GB, neatly used"/></div>
          <div><label htmlFor="seller-description" className={label}>Description *</label><textarea id="seller-description" rows={4} className={input} required maxLength={3000} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Condition, specifications, what is included, and anything a buyer should know"/></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="seller-category" className={label}>Category *</label><select required id="seller-category" className={input} value={form.categoryId} onChange={e => set('categoryId', e.target.value)}><option value="">Choose category</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label htmlFor="seller-condition" className={label}>Condition *</label><select id="seller-condition" className={input} value={form.condition} onChange={e => set('condition', e.target.value)}>{['New', 'Like new', 'Used - good', 'Used - fair'].map(v => <option key={v}>{v}</option>)}</select></div>
            <div><label htmlFor="seller-price" className={label}>Price in naira (₦) *</label><input id="seller-price" type="number" required min="100" step="0.01" className={input} value={form.price} onChange={e => set('price', e.target.value)} placeholder="85000"/></div>
            <div><label htmlFor="seller-quantity" className={label}>Quantity available *</label><input id="seller-quantity" type="number" required min="1" max="100000" step="1" className={input} value={form.quantity} onChange={e => set('quantity', e.target.value)}/></div>
          </div>
        </section>
        <section className="space-y-5 rounded-3xl border border-[#e8e8f0] bg-white p-5 shadow-sm sm:p-7">
          <h2 className="flex items-center gap-2 text-lg font-black"><Store size={20} className="text-vura-500"/> Your selling details</h2>
          <p className="text-sm text-[#838b9b]">Your shop information will appear on approved listings. Your private account and Vura Studio are separate.</p>
          <div><label htmlFor="seller-shop" className={label}>Shop or seller name *</label><input id="seller-shop" required minLength={2} maxLength={100} value={form.shopName} onChange={e => set('shopName', e.target.value)} className={input} placeholder="e.g. Chisom's Gadgets"/></div>
          <div><label htmlFor="seller-phone" className={label}>WhatsApp for customer enquiries *</label><input id="seller-phone" type="tel" required className={input} value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)} placeholder="2348012345678"/><p className="mt-1.5 text-xs text-[#868c9d]">Visible to interested buyers after your listing is approved.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="seller-state" className={label}>State *</label><select id="seller-state" required className={input} value={form.stateCode} onChange={e => set('stateCode', e.target.value)}><option value="">Select state</option>{states.map(s => <option key={s.id} value={s.code}>{s.name}</option>)}</select></div>
            <div><label htmlFor="seller-city" className={label}>City or area *</label><input id="seller-city" required minLength={2} maxLength={100} className={input} value={form.city} onChange={e => set('city', e.target.value)} placeholder="e.g. Owerri"/></div>
          </div>
          <div><label htmlFor="seller-campus" className={label}>Campus or school (optional)</label><input id="seller-campus" maxLength={120} className={input} value={form.campus} onChange={e => set('campus', e.target.value)} placeholder="e.g. FUTO, UNILAG, UNN"/></div>
        </section>
        {error && <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700">{error}</p>}
        <div className="rounded-2xl border border-[#e8e5f5] bg-[#f0edff] p-4"><p className="flex items-center gap-2 text-sm font-bold text-[#514187]"><Clock3 size={17}/> Your post goes to review first</p><p className="mt-1 text-xs leading-5 text-[#716690]">Once approved, buyers can view your listing and contact you. Vura is not collecting buyer payments for community listings in this first phase.</p></div>
        <button type="submit" disabled={submitting || uploading || !ready} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-vura-500 px-6 py-4 text-base font-black text-white shadow-xl shadow-vura-500/20 disabled:opacity-50">{submitting ? 'Submitting…' : editId ? 'Save and resubmit' : 'Post my product'}<ArrowRight size={19}/></button>
        <p className="text-center text-xs text-[#858b9b]">You can return to My Shop to edit, pause or remove any post.</p>
      </form>
    </div>
  </main>;
}
