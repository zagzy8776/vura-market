import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ImagePlus, Package, Pencil, Plus, RefreshCw, Sparkles, Trash2, X } from 'lucide-react';
import { uploadToCloudinary } from '@/lib/cloudinary';
import { money } from '@/lib/money';
import OrderActionPanel from './OrderActionPanel';

type Any = Record<string, any>;
type Category = { id: string; name: string; slug: string; icon: string };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: 'include', ...init });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `Request failed (${r.status})`);
  return b as T;
}

const field = 'mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-vura-400';

export function OperationalOrders({ orders, suppliers, onRefresh }: { orders: Any[]; suppliers: Any[]; onRefresh: () => void }) {
  const [selected, setSelected] = useState<Any | null>(null);
  const [q, setQ] = useState('');
  const rows = useMemo(() => orders.filter(o => `${o.order_number} ${o.delivery_name} ${o.product_name} ${o.buyer_email}`.toLowerCase().includes(q.toLowerCase())), [orders, q]);
  return <section>
    <Toolbar title="Orders" action={<div className="flex gap-2"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search orders…" className={field.replace('mt-1 ','')}/><button onClick={onRefresh} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10"><RefreshCw size={16}/></button></div>}/>
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[.02]"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-white/10 text-xs text-white/35"><tr>{['Order','Customer','Product','Payment','Sourcing','Total',''].map(h => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody>{rows.map(o => <tr key={o.id} onClick={() => setSelected(o)} className="cursor-pointer border-b border-white/5 hover:bg-white/[.035]"><td className="px-4 py-4 font-bold">{o.order_number}</td><td className="px-4 py-4">{o.delivery_name}<small className="block text-white/35">{o.delivery_phone}</small></td><td className="px-4 py-4">{o.product_name}<small className="block text-white/35">Qty {o.quantity}</small></td><td className="px-4 py-4"><Status value={o.payment_status}/></td><td className="px-4 py-4"><Status value={o.sourcing_status || o.status}/></td><td className="px-4 py-4 font-bold">{money(o.total_kobo)}</td><td className="px-4"><ChevronRight size={16} className="text-white/25"/></td></tr>)}</tbody></table>{!rows.length && <div className="p-8 text-center text-sm text-white/35">No orders match your search.</div>}</div>
    <OrderActionPanel order={selected} suppliers={suppliers} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); onRefresh(); }}/>
  </section>;
}

export function OperationalProducts({ products, suppliers = [], onRefresh }: { products: Any[]; suppliers?: Any[]; onRefresh: () => void }) {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Any | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const rows = useMemo(
    () => products.filter(p => p.is_active !== false && `${p.name} ${p.brand} ${p.category} ${p.supplier_name}`.toLowerCase().includes(q.toLowerCase())),
    [products, q],
  );
  const remove = async (p: Any) => {
    if (!window.confirm(`Delete "${p.name}"? This cannot be undone if there are no orders on it.`)) return;
    setDeletingId(p.id);
    try {
      const res = await api<{ deleted?: boolean; deactivated?: boolean; message?: string }>('/api/admin/products', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: p.id }),
      });
      if (res.deactivated) window.alert(res.message || 'Product was deactivated because it has related orders.');
      onRefresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Could not delete product.');
    } finally {
      setDeletingId(null);
    }
  };
  return <section>
    <Toolbar title="Products" action={<div className="flex flex-wrap gap-2"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search products…" className={field.replace('mt-1 ','')}/><button onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-xl bg-vura-500 px-4 py-2 text-sm font-bold"><Plus size={15}/> Add product</button></div>}/>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{rows.map(p => (
      <article key={p.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[.02]">
        <div className="aspect-[4/3] bg-white/5">{p.images?.[0] ? <img src={p.images[0]} alt={p.name} className="h-full w-full object-cover"/> : <div className="grid h-full place-items-center text-white/25"><Package size={30}/></div>}</div>
        <div className="p-4">
          <div className="font-bold">{p.name}</div>
          <div className="text-xs text-white/35">{p.brand || '—'} · {p.category || 'Uncategorised'}</div>
          <div className="mt-1 text-[11px] text-white/30">{Array.isArray(p.images) ? `${p.images.length} photo${p.images.length === 1 ? '' : 's'}` : 'No photos'}</div>
          <div className="mt-3 flex items-center justify-between"><b>{money(p.price_kobo)}</b><Status value={p.stock_status}/></div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setSelected(p)} className="flex items-center justify-center gap-2 rounded-lg border border-white/10 py-2 text-xs font-bold hover:bg-white/5"><Pencil size={13}/> Edit</button>
            <button type="button" disabled={deletingId === p.id} onClick={() => void remove(p)} className="flex items-center justify-center gap-2 rounded-lg border border-red-400/30 bg-red-500/10 py-2 text-xs font-bold text-red-200 hover:bg-red-500/20 disabled:opacity-50"><Trash2 size={13}/>{deletingId === p.id ? '…' : 'Delete'}</button>
          </div>
        </div>
      </article>
    ))}</div>
    {!rows.length && <Empty text="No products yet. Tap Add product, upload photos, and publish the first listing."/>}
    {(selected || creating) && <ProductModal product={selected} suppliers={suppliers} onClose={() => { setSelected(null); setCreating(false); }} onSaved={() => { setSelected(null); setCreating(false); onRefresh(); }}/>}
  </section>;
}

const KNOWN_BRANDS = ['Apple','Samsung','Tecno','Infinix','Itel','Xiaomi','Redmi','Poco','Oppo','Vivo','Huawei','Honor','Nokia','Google','Sony','LG','HP','Dell','Lenovo','Asus','Acer','Microsoft','Toshiba','JBL','Oraimo','Anker','Beats','Canon','Nikon','Nintendo','PlayStation','Xbox','OnePlus','Realme','Motorola'];

function detectBrand(name: string) {
  const n = name.toLowerCase();
  if (/(iphone|ipad|macbook|airpods|imac|apple watch)/.test(n)) return 'Apple';
  if (n.includes('pixel')) return 'Google';
  if (n.includes('surface')) return 'Microsoft';
  if (n.includes('redmi') || n.includes('poco')) return 'Xiaomi';
  if (n.includes('playstation') || n.includes('ps5') || n.includes('ps4')) return 'PlayStation';
  for (const brand of KNOWN_BRANDS) {
    if (n.includes(brand.toLowerCase())) return brand;
  }
  return '';
}

function ProductModal({ product, suppliers, onClose, onSaved }: { product: Any | null; suppliers: Any[]; onClose: () => void; onSaved: () => void }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [brandTouched, setBrandTouched] = useState(Boolean(product?.brand));
  const [images, setImages] = useState<string[]>(Array.isArray(product?.images) ? product.images.filter(Boolean) : []);
  const [form, setForm] = useState({ name: product?.name || '', brand: product?.brand || '', description: product?.description || '', price: product ? String(Number(product.price_kobo)/100) : '', sourcePrice: product?.source_price_kobo ? String(Number(product.source_price_kobo)/100) : '', condition: product?.condition_label || 'New', storage: product?.storage || '', color: product?.color || '', stock: product?.stock_status || 'available', categoryId: product?.category_id || '', supplierId: product?.supplier_id || '', sourceLocation: product?.source_location || '', active: product?.is_active !== false });
  useEffect(() => { void api<{ categories: Category[] }>('/api/admin/categories').then(x => setCategories(x.categories || [])).catch(() => undefined); }, []);
  const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));
  const onName = (value: string) => {
    setForm(f => {
      const next = { ...f, name: value };
      if (!brandTouched) {
        const guessed = detectBrand(value);
        if (guessed) next.brand = guessed;
      }
      return next;
    });
  };
  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, 8 - images.length);
    if (!list.length) return;
    setUploading(true); setError('');
    try {
      const urls: string[] = [];
      for (const file of list) urls.push(await uploadToCloudinary(file));
      setImages(prev => [...prev, ...urls].slice(0, 8));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not upload photos.');
    } finally { setUploading(false); }
  };
  const createCategory = async () => {
    if (newCategory.trim().length < 2) return;
    setAddingCategory(true); setError('');
    try {
      const res = await api<{ category: Category }>('/api/admin/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newCategory.trim() }) });
      setCategories(prev => [...prev, res.category].sort((a, b) => a.name.localeCompare(b.name)));
      set('categoryId', res.category.id);
      setNewCategory('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create category.');
    } finally { setAddingCategory(false); }
  };
  const save = async () => {
    setBusy(true); setError('');
    try {
      if (!form.name.trim() || !form.brand.trim() || Number(form.price) <= 0) throw new Error('Name, brand and a valid price are required.');
      if (images.length < 1) throw new Error('Add at least one product photo so buyers can see what they are getting.');
      const payload: Any = { name: form.name, brand: form.brand, description: form.description, priceKobo: Math.round(Number(form.price)*100), sourcePriceKobo: form.sourcePrice ? Math.round(Number(form.sourcePrice)*100) : null, conditionLabel: form.condition, storage: form.storage || null, color: form.color || null, stockStatus: form.stock, categoryId: form.categoryId || null, supplierId: form.supplierId || null, sourceLocation: form.sourceLocation || null, isActive: form.active, images };
      if (product) await api('/api/admin/products', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ productId:product.id, ...payload }) });
      else await api('/api/admin/products', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
      onSaved();
    } catch(e) { setError(e instanceof Error ? e.message : 'Could not save product.'); } finally { setBusy(false); }
  };
  return <Modal title={product ? 'Edit product' : 'Add product'} onClose={onClose}>
    <div className="mb-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white/70">Photos</div>
          <p className="text-xs text-white/35">Upload 4–8 clear photos. First photo is the cover.</p>
        </div>
        <span className="text-xs text-white/40">{images.length}/8</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {images.map((url, i) => (
          <div key={url} className="relative overflow-hidden rounded-xl border border-white/10 bg-black/20">
            <img src={url} alt={`Product ${i + 1}`} className="aspect-square w-full object-cover" />
            {i === 0 && <span className="absolute left-2 top-2 rounded-full bg-vura-500 px-2 py-0.5 text-[10px] font-bold">Cover</span>}
            <button type="button" onClick={() => setImages(prev => prev.filter((_, idx) => idx !== i))} className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/70"><Trash2 size={13}/></button>
          </div>
        ))}
        {images.length < 8 && (
          <label className="grid aspect-square cursor-pointer place-items-center rounded-xl border border-dashed border-white/20 bg-white/[.03] text-center text-xs text-white/45 hover:border-vura-400 hover:text-white">
            <input type="file" accept="image/*" multiple className="hidden" onChange={e => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} />
            <span className="px-2">{uploading ? 'Uploading…' : <><ImagePlus className="mx-auto mb-1" size={18}/> Add photos</>}</span>
          </label>
        )}
      </div>
    </div>
    <div className="grid gap-4 md:grid-cols-2">
      <Label text="Product name"><input value={form.name} onChange={e=>onName(e.target.value)} placeholder="e.g. Samsung Galaxy A16 256GB" className={field}/></Label>
      <Label text="Brand">
        <div className="relative">
          <input value={form.brand} onChange={e=>{ setBrandTouched(true); set('brand', e.target.value); }} placeholder="Auto-detected from name" className={field}/>
          {!brandTouched && form.brand && <Sparkles size={14} className="absolute right-3 top-4 text-vura-300"/>}
        </div>
      </Label>
      <Label text="Selling price (₦)"><input type="number" min="1" value={form.price} onChange={e=>set('price',e.target.value)} className={field}/></Label>
      <Label text="Source cost (₦)"><input type="number" min="0" value={form.sourcePrice} onChange={e=>set('sourcePrice',e.target.value)} className={field}/></Label>
      <Label text="Category">
        <select value={form.categoryId} onChange={e=>set('categoryId',e.target.value)} className={field}><option value="">Uncategorised</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <div className="mt-2 flex gap-2">
          <input value={newCategory} onChange={e=>setNewCategory(e.target.value)} placeholder="New category name" className={field.replace('mt-1 ','')}/><button type="button" disabled={addingCategory || newCategory.trim().length < 2} onClick={() => void createCategory()} className="shrink-0 rounded-xl border border-white/10 px-3 text-xs font-bold disabled:opacity-40">{addingCategory ? '…' : 'Add'}</button>
        </div>
      </Label>
      <Label text="Supplier"><select value={form.supplierId} onChange={e=>set('supplierId',e.target.value)} className={field}><option value="">No supplier</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Label>
      <Label text="Stock status"><select value={form.stock} onChange={e=>set('stock',e.target.value)} className={field}><option value="available">Available</option><option value="low_stock">Low stock</option><option value="out_of_stock">Out of stock</option><option value="unavailable">Unavailable</option></select></Label>
      <Label text="Condition"><select value={form.condition} onChange={e=>set('condition',e.target.value)} className={field}><option>New</option><option>Open box</option><option>Used - like new</option><option>Used - good</option><option>Refurbished</option></select></Label>
      <Label text="Storage"><input value={form.storage} onChange={e=>set('storage',e.target.value)} placeholder="e.g. 256GB" className={field}/></Label>
      <Label text="Color"><input value={form.color} onChange={e=>set('color',e.target.value)} placeholder="e.g. Black" className={field}/></Label>
      <Label text="Source location"><input value={form.sourceLocation} onChange={e=>set('sourceLocation',e.target.value)} placeholder="e.g. Owerri" className={field}/></Label>
      <Label text="Description"><textarea value={form.description} onChange={e=>set('description',e.target.value)} rows={3} placeholder="What the buyer should know." className={field}/></Label>
    </div>
    <label className="mt-4 flex items-center gap-3 text-sm"><input type="checkbox" checked={form.active} onChange={e=>set('active',e.target.checked)} /> Product is active on storefront</label>
    {error && <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{error}</div>}
    <div className="mt-6 flex justify-end gap-2"><button onClick={onClose} className="rounded-xl border border-white/10 px-4 py-2 text-sm">Cancel</button><button disabled={busy || uploading} onClick={() => void save()} className="rounded-xl bg-vura-500 px-5 py-2 text-sm font-bold disabled:opacity-50">{busy?'Saving…':product?'Save changes':'Create product'}</button></div>
  </Modal>;
}

export function OperationalSuppliers({ suppliers, onRefresh }: { suppliers: Any[]; onRefresh: () => void }) {
  const [selected, setSelected] = useState<Any | null>(null); const [creating, setCreating] = useState(false);
  return <section><Toolbar title="Suppliers" action={<button onClick={()=>setCreating(true)} className="flex items-center gap-2 rounded-xl bg-vura-500 px-4 py-2 text-sm font-bold"><Plus size={15}/> Add supplier</button>}/><div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[.02]"><table className="w-full min-w-[700px] text-left text-sm"><thead className="border-b border-white/10 text-xs text-white/35"><tr>{['Supplier','Location','Phone','Reliability',''].map(h=><th className="px-4 py-3" key={h}>{h}</th>)}</tr></thead><tbody>{suppliers.map(s=><tr key={s.id} className="border-b border-white/5"><td className="px-4 py-4 font-bold">{s.name}</td><td className="px-4">{s.location||'—'}</td><td className="px-4">{s.phone||'—'}</td><td className="px-4">{s.reliability_score==null?'—':`${s.reliability_score}/5`}</td><td className="px-4"><button onClick={()=>setSelected(s)} className="text-white/45 hover:text-white"><Pencil size={15}/></button></td></tr>)}</tbody></table></div>{(selected||creating)&&<SupplierModal supplier={selected} onClose={()=>{setSelected(null);setCreating(false)}} onSaved={()=>{setSelected(null);setCreating(false);onRefresh()}}/>}</section>;
}

function SupplierModal({ supplier, onClose, onSaved }: { supplier: Any|null; onClose:()=>void; onSaved:()=>void }) {
  const [form,setForm]=useState({name:supplier?.name||'',location:supplier?.location||'',phone:supplier?.phone||'',notes:supplier?.notes||'',score:supplier?.reliability_score==null?'':String(supplier.reliability_score)}); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const set=(k:string,v:string)=>setForm(f=>({...f,[k]:v}));
  const save=async()=>{setBusy(true);setError('');try{if(form.name.trim().length<2)throw new Error('Supplier name is required.');const body:Any={name:form.name,location:form.location,phone:form.phone,notes:form.notes,reliabilityScore:form.score};await api('/api/admin/suppliers',{method:supplier?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(supplier?{supplierId:supplier.id,...body}:body)});onSaved()}catch(e){setError(e instanceof Error?e.message:'Could not save supplier.')}finally{setBusy(false)}};
  return <Modal title={supplier?'Edit supplier':'Add supplier'} onClose={onClose}><div className="space-y-4"><Label text="Name"><input value={form.name} onChange={e=>set('name',e.target.value)} className={field}/></Label><Label text="Location"><input value={form.location} onChange={e=>set('location',e.target.value)} className={field}/></Label><Label text="Phone"><input value={form.phone} onChange={e=>set('phone',e.target.value)} className={field}/></Label><Label text="Reliability score (0–5)"><input type="number" min="0" max="5" step="0.1" value={form.score} onChange={e=>set('score',e.target.value)} className={field}/></Label><Label text="Notes"><textarea rows={4} value={form.notes} onChange={e=>set('notes',e.target.value)} className={field}/></Label></div>{error&&<div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{error}</div>}<div className="mt-6 flex justify-end gap-2"><button onClick={onClose} className="rounded-xl border border-white/10 px-4 py-2 text-sm">Cancel</button><button disabled={busy} onClick={()=>void save()} className="rounded-xl bg-vura-500 px-5 py-2 text-sm font-bold disabled:opacity-50">{busy?'Saving…':'Save supplier'}</button></div></Modal>;
}

function Toolbar({ title, action }: { title: string; action?: ReactNode }) { return <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-black tracking-tight">{title}</h2><p className="mt-1 text-sm text-white/35">Real operational data. Changes are server-authorized and audited.</p></div>{action}</div>; }
function Label({text,children}:{text:string;children:ReactNode}){return <label className="block text-sm font-semibold text-white/65">{text}{children}</label>}
function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){return <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm md:items-center md:p-6"><div className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-t-3xl border border-white/10 bg-[#0b0d17] p-5 shadow-2xl md:rounded-3xl md:p-6"><div className="flex items-center justify-between"><h3 className="text-xl font-black">{title}</h3><button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10"><X size={16}/></button></div><div className="mt-6">{children}</div></div></div>}
function Status({ value }: { value: string }) { return <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold capitalize text-white/65">{String(value||'—').replaceAll('_',' ')}</span>; }
function Empty({ text }: { text: string }) { return <div className="py-16 text-center text-sm text-white/30"><Package className="mx-auto mb-2" size={28}/>{text}</div>; }
