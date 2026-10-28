import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Camera, Clock3, Copy, MapPin, Package, Pause, Pencil, Plus, Store, Trash2, UploadCloud, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { uploadFilesToCloudinary } from '@/lib/cloudinary';
import { money } from '@/lib/money';
import type { CategoryPublic, NigeriaState } from '@/types';
import { Link, useRouter } from '../router';
import { sellerApi, type ListingInput, type SellerListing, type SellerProfile } from '../lib/sellerApi';

const inputStyle = 'mt-1.5 w-full rounded-xl border border-[#dedfe9] bg-white px-4 py-3 text-base text-[#17182a] outline-none focus:border-vura-500 focus:ring-2 focus:ring-vura-500/10';
const initial = { title: '', description: '', price: '', quantity: '1', categoryId: '', condition: 'New', images: [] as string[],
  shopName: '', whatsapp: '', stateCode: '', city: '', campus: '' };
type FormValue = typeof initial;
const badge: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700', approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-700', paused: 'bg-slate-100 text-slate-700',
};
function useSellerGuard(next: string) {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => { if (!loading && !user) router.navigate('/signin?next=' + encodeURIComponent(next), { replace: true }); }, [user, loading, next, router]);
  return { user, loading };
}

export function SellerDashboard() {
  const { user, loading } = useSellerGuard('/sell');
  const router = useRouter();
  const [list, setList] = useState<SellerListing[]>([]);
  const [shop, setShop] = useState<SellerProfile | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const load = () => {
    setError('');
    void sellerApi.mine(page).then(r => { setList(r.listings); setTotal(r.total); setShop(r.profile); setLoaded(true); })
      .catch(e => { setError((e as Error).message); setLoaded(true); });
  };
  useEffect(() => { if (user) load(); }, [user, page]);
  const action = async (id: string, change: 'pause' | 'resume' | 'remove') => {
    if (change === 'remove' && !window.confirm('Remove this product from your shop?')) return;
    setBusy(id);
    try { if (change === 'remove') await sellerApi.remove(id); else await sellerApi.change(id, change); load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  };
  if (loading || !user) return <main id="main" className="mx-auto max-w-6xl p-8">Opening your shop…</main>;
  return <main id="main" className="min-h-[75vh] bg-[#f7f7fb] px-4 py-8 text-[#17182a] md:px-6 md:py-12">
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-vura-500"><Store size={16}/> Your selling space</p>
          <h1 className="mt-2 font-display text-3xl font-black tracking-tight sm:text-4xl">{shop?.shop_name || 'My Vura shop'}</h1>
          <p className="mt-2 text-sm text-[#757d8c]">Your listings and enquiries. Your shop stays separate from Vura administration.</p></div>
        <Link to="/sell/new" className="inline-flex items-center gap-2 rounded-xl bg-vura-500 px-5 py-3 font-black text-white shadow-lg shadow-vura-500/20"><Plus size={19}/> Post a product</Link>
      </header>
      <div className="mt-7 grid grid-cols-3 gap-2 sm:gap-4">
        {[{n:total,t:'Total listings'},{n:list.filter(x=>x.status==='approved').length,t:'Live on page'},{n:list.filter(x=>x.status==='pending').length,t:'Pending on page'}].map(v=>
          <div key={v.t} className="rounded-2xl border border-[#e6e7ed] bg-white p-4 sm:p-6"><strong className="text-2xl font-black">{v.n}</strong><p className="mt-1 text-xs text-[#868b99]">{v.t}</p></div>)}
      </div>
      {shop && <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-[#757d8e]"><span className="inline-flex items-center gap-1"><MapPin size={14}/>{shop.city} · {shop.state_code}</span>
        {shop.campus && <span>{shop.campus}</span>}<Link to={'/shop/' + user.id} className="font-bold text-vura-500">Public shop <ArrowRight size={14} className="inline"/></Link></div>}
      <section className="mt-7 rounded-3xl border border-[#e6e7ef] bg-white p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2"><h2 className="font-display text-xl font-black">My products</h2><span className="text-sm text-[#828a99]">{total} posts</span></div>
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {!loaded && <p className="mt-8 text-sm text-[#7e8494]">Loading your listings…</p>}
        {loaded && !list.length && <div className="py-14 text-center"><Package className="mx-auto text-vura-400" size={38}/><h3 className="mt-4 text-lg font-bold">Your shop starts here</h3>
          <p className="mt-2 text-sm text-[#7c8391]">Post a product with clear photos, a price and location.</p>
          <Link to="/sell/new" className="mt-5 inline-flex rounded-xl bg-vura-500 px-5 py-3 text-sm font-bold text-white">Create my first post</Link></div>}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{list.map(p=>
          <article key={p.id} className="overflow-hidden rounded-2xl border border-[#ecebf1] bg-white">
            <div className="flex gap-4 p-3 sm:block">
              <div className="h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-[#f4f3f8] sm:aspect-[4/3] sm:h-auto sm:w-full">
                {p.images?.[0] && <img src={p.images[0]} alt="" className="h-full w-full object-cover"/>}</div>
              <div className="min-w-0 flex-1 sm:mt-3">
                <span className={'rounded-full px-2.5 py-1 text-xs font-bold ' + (badge[p.status] || badge.pending)}>{p.status === 'approved' ? 'Live' : p.status === 'pending' ? 'Awaiting review' : p.status === 'rejected' ? 'Needs changes' : 'Paused'}</span>
                <h3 className="mt-2 line-clamp-2 font-bold">{p.title}</h3><p className="mt-1 font-black text-vura-500">{money(p.price_kobo)}</p>
                <p className="mt-1 text-xs text-[#868c9a]">{p.quantity} available</p>
              </div>
            </div>
            <div className="grid grid-cols-3 border-t border-[#ecebf1] p-2 text-xs font-bold">
              <button onClick={()=>router.navigate('/sell/new?edit='+p.id+'&page='+page)} className="flex items-center justify-center gap-1 rounded-lg p-2 hover:bg-[#f3f1ff]"><Pencil size={13}/> Edit</button>
              <button disabled={!!busy} onClick={()=>void action(p.id,p.status==='paused'||p.status==='rejected'?'resume':'pause')} className="flex items-center justify-center gap-1 rounded-lg p-2 hover:bg-[#f3f1ff] disabled:opacity-40"><Pause size={13}/>{p.status==='paused'||p.status==='rejected'?'Resubmit':'Pause'}</button>
              <button disabled={!!busy} onClick={()=>void action(p.id,'remove')} className="flex items-center justify-center gap-1 rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-40"><Trash2 size={13}/> Remove</button>
            </div>
            {p.status==='approved' && <button onClick={()=>void navigator.clipboard.writeText(window.location.origin+'/listing/'+p.id)} className="flex w-full items-center justify-center gap-2 border-t border-[#ecebf1] py-2 text-xs font-bold text-vura-500"><Copy size={13}/> Copy listing link</button>}
          </article>)}</div>
        {total>24 && <div className="mt-6 flex justify-end gap-2"><button disabled={page<=1} onClick={()=>setPage(x=>x-1)} className="rounded-lg border p-2 text-sm disabled:opacity-30">Previous</button><span className="p-2 text-sm">Page {page}</span><button disabled={page*24>=total} onClick={()=>setPage(x=>x+1)} className="rounded-lg border p-2 text-sm disabled:opacity-30">Next</button></div>}
      </section>
    </div>
  </main>;
}

export function PostPage({categories}: {categories:CategoryPublic[]}) {
  const {user,loading} = useSellerGuard('/sell/new');
  const router = useRouter();
  const editId = router.query.get('edit');
  const editPage = Math.max(1, Number(router.query.get('page')) || 1);
  const [form,setForm] = useState<FormValue>(initial);
  const [states,setStates] = useState<NigeriaState[]>([]);
  const [busy,setBusy] = useState(false);
  const [uploading,setUploading] = useState(false);
  const [ready,setReady] = useState(!editId);
  const [error,setError] = useState('');
  const set = <K extends keyof FormValue>(key:K,val:FormValue[K]) => setForm(f=>({...f,[key]:val}));
  useEffect(()=>{
    if (!user) return;
    void Promise.all([sellerApi.mine(editPage), sellerApi.states()]).then(([r,locations])=>{
      setStates(locations.states);
      const item = r.listings.find(p=>p.id===editId);
      if (editId && !item) {setError('Listing not found. Open your shop and select Edit again.');return;}
      setForm(f=>({...f,shopName:r.profile?.shop_name||f.shopName,whatsapp:r.profile?.whatsapp||f.whatsapp,
        stateCode:r.profile?.state_code||f.stateCode,city:r.profile?.city||f.city,campus:r.profile?.campus||f.campus,
        ...(item?{title:item.title,description:item.description,price:String(Number(item.price_kobo)/100),
          quantity:String(item.quantity),condition:item.condition_label,categoryId:item.category_id||'',images:item.images}:{}),
      }));
    }).catch(e=>setError((e as Error).message)).finally(()=>setReady(true));
  },[user,editId,editPage]);
  const upload = async(files:FileList|null) => {
    const chosen = Array.from(files||[]);
    if (!chosen.length)return;
    if (chosen.length+form.images.length>8) {setError('Maximum 8 photos per product.');return;}
    if (chosen.some(f=>!f.type.startsWith('image/')||f.size>8*1024*1024)){setError('Please upload images smaller than 8MB each.');return;}
    setUploading(true);setError('');
    try {const urls=await uploadFilesToCloudinary(chosen);setForm(f=>({...f,images:[...f.images,...urls]}));}
    catch(e){setError((e as Error).message);}
    finally{setUploading(false);}
  };
  const submit = async(e:FormEvent)=>{
    e.preventDefault();setError('');
    if(!form.images.length){setError('Please upload at least one product photo.');return;}
    if(!form.categoryId){setError('Choose a category.');return;}
    setBusy(true);
    const payload:ListingInput={...form,quantity:Number(form.quantity),priceKobo:Math.round(Number(form.price)*100)};
    try {if(editId)await sellerApi.edit(editId,payload);else await sellerApi.create(payload);router.navigate('/sell');}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  const formLabel='mb-1 block text-sm font-bold text-[#34394b]';
  if(loading||!user)return <main id="main" className="p-10 text-center">Opening your posting form…</main>;
  return <main id="main" className="min-h-[75vh] bg-[#f7f7fb] px-4 py-8 text-[#17182a] md:px-6 md:py-12">
    <div className="mx-auto max-w-3xl">
      <Link to="/sell" className="inline-flex items-center gap-2 text-sm font-bold text-[#757c8d]"><ArrowLeft size={16}/> My shop</Link>
      <h1 className="mt-5 font-display text-3xl font-black tracking-tight sm:text-4xl">{editId?'Edit your product':'What are you selling?'}</h1>
      <p className="mt-2 text-sm text-[#7a8191]">Your own Vura listing. Clear details help buyers find and trust your products.</p>
      <form onSubmit={submit} className="mt-6 space-y-5">
        <section className="rounded-3xl border border-[#e6e7ee] bg-white p-5 shadow-sm sm:p-7">
          <h2 className="flex items-center gap-2 text-lg font-black"><Camera size={19} className="text-vura-500"/> Product photos</h2>
          <p className="mt-1 text-sm text-[#7b8395]">Add up to eight clear photos. The first one is your cover.</p>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">{form.images.map((src,i)=>
            <div key={src+i} className="relative aspect-square overflow-hidden rounded-xl bg-[#f5f4f9]"><img src={src} alt={'Product photo '+(i+1)} className="h-full w-full object-cover"/>
              <button type="button" aria-label={'Remove photo '+(i+1)} className="absolute right-1 top-1 rounded-full bg-[#17182a] p-1.5 text-white" onClick={()=>set('images',form.images.filter((_,n)=>n!==i))}><X size={14}/></button>
            </div>)}
            {form.images.length<8&&<label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#c6bbed] bg-[#f9f7ff] text-center text-xs font-bold text-vura-500"><UploadCloud size={25}/>{uploading?'Uploading…':'Add photos'}<input className="sr-only" type="file" accept="image/*" multiple disabled={uploading} onChange={e=>{void upload(e.target.files);e.target.value='';}}/></label>}
          </div>
        </section>
        <section className="space-y-4 rounded-3xl border border-[#e6e7ee] bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-lg font-black">Product information</h2>
          <div><label htmlFor="post-title" className={formLabel}>Product name *</label><input id="post-title" className={inputStyle} required minLength={3} maxLength={150} value={form.title} onChange={e=>set('title',e.target.value)} placeholder="iPhone 12, 128GB, neatly used"/></div>
          <div><label htmlFor="post-desc" className={formLabel}>Description *</label><textarea id="post-desc" className={inputStyle} rows={4} required maxLength={3000} value={form.description} onChange={e=>set('description',e.target.value)} placeholder="Describe the product, condition, and what comes with it"/></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="post-category" className={formLabel}>Category *</label><select id="post-category" required className={inputStyle} value={form.categoryId} onChange={e=>set('categoryId',e.target.value)}><option value="">Choose category</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label htmlFor="post-condition" className={formLabel}>Condition *</label><select id="post-condition" className={inputStyle} value={form.condition} onChange={e=>set('condition',e.target.value)}>{['New','Like new','Used - good','Used - fair'].map(s=><option key={s}>{s}</option>)}</select></div>
            <div><label htmlFor="post-price" className={formLabel}>Price (₦) *</label><input id="post-price" type="number" className={inputStyle} min={100} step=".01" required value={form.price} onChange={e=>set('price',e.target.value)} placeholder="85000"/></div>
            <div><label htmlFor="post-qty" className={formLabel}>Quantity *</label><input id="post-qty" type="number" className={inputStyle} min={1} max={100000} required value={form.quantity} onChange={e=>set('quantity',e.target.value)}/></div>
          </div>
        </section>
        <section className="space-y-4 rounded-3xl border border-[#e6e7ee] bg-white p-5 shadow-sm sm:p-7">
          <h2 className="flex items-center gap-2 text-lg font-black"><Store size={19} className="text-vura-500"/> Your selling details</h2>
          <div><label htmlFor="post-shop" className={formLabel}>Shop or seller name *</label><input id="post-shop" className={inputStyle} minLength={2} maxLength={100} required value={form.shopName} onChange={e=>set('shopName',e.target.value)} placeholder="Chisom's Gadgets"/></div>
          <div><label htmlFor="post-whatsapp" className={formLabel}>WhatsApp number *</label><input id="post-whatsapp" className={inputStyle} type="tel" required value={form.whatsapp} onChange={e=>set('whatsapp',e.target.value)} placeholder="2348012345678"/><p className="mt-1 text-xs text-[#838999]">Customers will contact you here when a listing is approved.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="post-state" className={formLabel}>State *</label><select id="post-state" className={inputStyle} required value={form.stateCode} onChange={e=>set('stateCode',e.target.value)}><option value="">Choose state</option>{states.map(s=><option key={s.id} value={s.code}>{s.name}</option>)}</select></div>
            <div><label htmlFor="post-city" className={formLabel}>City or area *</label><input id="post-city" className={inputStyle} required minLength={2} maxLength={100} value={form.city} onChange={e=>set('city',e.target.value)} placeholder="Owerri"/></div>
          </div>
          <div><label htmlFor="post-campus" className={formLabel}>School or campus (optional)</label><input id="post-campus" className={inputStyle} maxLength={120} value={form.campus} onChange={e=>set('campus',e.target.value)} placeholder="UNN, UNILAG, FUTO…"/></div>
        </section>
        {error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
        <div className="rounded-2xl bg-[#efeaff] p-4 text-sm text-[#5a4c87]"><p className="flex items-center gap-2 font-bold"><Clock3 size={17}/> Your listing is reviewed before appearing publicly</p><p className="mt-1 text-xs leading-5">Buyer enquiries go to your WhatsApp. This community listing is separate from Vura's managed checkout.</p></div>
        <button type="submit" disabled={busy||uploading||!ready} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-vura-500 px-5 py-4 text-base font-black text-white shadow-xl shadow-vura-500/20 disabled:opacity-40">{busy?'Saving…':editId?'Save and resubmit':'Post my product'}<ArrowRight size={18}/></button>
      </form>
    </div>
  </main>;
}
