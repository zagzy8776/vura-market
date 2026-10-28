import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, CheckCircle, Clock, MapPin, Package, ShieldCheck, ShoppingBag } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { money } from '@/lib/money';
import type { NigeriaState } from '@/types';
import { Link, useRouter } from '../router';
import { sellerApi, type SellerListing } from '../lib/sellerApi';
import { marketOrdersApi, type MarketplaceOrder, type MarketplaceEvent } from '../lib/marketOrdersApi';

function Status({ value }: { value: string }) {
 const map: Record<string,string> = {awaiting_seller:'Awaiting seller',seller_accepted:'Seller confirmed',declined:'Not available',expired:'Response expired',cancelled:'Cancelled'};
 const color = value === 'seller_accepted' ? 'text-emerald-700 bg-emerald-50' : value === 'awaiting_seller' ? 'text-amber-700 bg-amber-50' : 'text-slate-600 bg-slate-100';
 return <span className={'inline-flex rounded-full px-3 py-1 text-xs font-bold ' + color}>{map[value] || value}</span>;
}

export function CommunityBuyPage({ id }: { id: string }) {
 const { user, loading: authLoading } = useAuth();
 const router = useRouter();
 const [item,setItem] = useState<SellerListing|null>(null);
 const [states,setStates] = useState<NigeriaState[]>([]);
 const [loading,setLoading] = useState(true);
 const [error,setError] = useState('');
 const [busy,setBusy] = useState(false);
 const [quantity,setQuantity] = useState(1);
 const [phone,setPhone] = useState(user?.phone || '');
 const [state,setState] = useState('');
 const [city,setCity] = useState('');
 const requestKey = useRef<string>('');
 useEffect(()=>{if(!authLoading && !user)router.navigate('/signin?next='+encodeURIComponent('/buy/'+id),{replace:true});},[user,authLoading,id,router]);
 useEffect(()=>{if(user?.phone)setPhone(user.phone);},[user?.phone]);
 useEffect(()=>{
   if(!user)return;
   let live=true;
   void Promise.all([sellerApi.browse({id}), sellerApi.states()])
     .then(([listing,locations])=>{if(live){setItem(listing.listings[0]||null);setStates(locations.states);}})
     .catch(e=>{if(live)setError((e as Error).message);})
     .finally(()=>{if(live)setLoading(false);});
   return()=>{live=false;};
 },[id,user]);
 const submit=async(e:FormEvent)=>{
   e.preventDefault();
   if(!item)return;
   setBusy(true);setError('');
   if(!requestKey.current)requestKey.current=crypto.randomUUID();
   try{
     const result=await marketOrdersApi.create({listingId:item.id,requestId:requestKey.current,quantity,phone,stateCode:state,city});
     router.navigate('/market-orders?id='+result.order.id);
   }catch(e){setError((e as Error).message);}
   finally{setBusy(false);}
 };
 if(authLoading||!user)return <main id="main" className="mx-auto max-w-2xl p-8">Sign in to request this product…</main>;
 return <main id="main" className="min-h-[70vh] bg-[#f7f7fb] px-4 py-8 text-[#17182a] sm:py-12">
  <div className="mx-auto max-w-2xl"><Link to={'/listing/'+id} className="inline-flex items-center gap-2 text-sm font-bold text-[#747b8b]"><ArrowLeft size={16}/> Back to product</Link>
   <h1 className="mt-5 font-display text-3xl font-black">Confirm availability</h1>
   <p className="mt-2 text-sm text-[#70798b]">Your seller will confirm stock before you are asked to pay. There is no payment at this step.</p>
   {error&&<p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
   {loading&&<p className="mt-6 text-sm">Loading product information…</p>}
   {item&&<form onSubmit={submit} className="mt-6 space-y-5">
     <div className="flex items-start gap-4 rounded-2xl border border-[#e8e7ee] bg-white p-4">
      {item.images?.[0]&&<img src={item.images[0]} alt="" className="h-24 w-24 rounded-xl object-cover"/>}
      <div className="flex-1"><h2 className="font-bold">{item.title}</h2><p className="mt-1 text-lg font-black text-vura-500">{money(item.price_kobo)}</p><p className="mt-1 text-xs text-[#858b98]">From {item.shop_name}</p></div>
     </div>
     <div className="space-y-4 rounded-2xl border border-[#e8e7ee] bg-white p-5">
      <div><label className="block text-sm font-bold" htmlFor="buy-qty">Quantity</label><input id="buy-qty" type="number" min="1" max={Math.min(1000,item.quantity)} required value={quantity} onChange={e=>setQuantity(Number(e.target.value))} className="mt-2 w-full rounded-xl border px-4 py-3"/></div>
      <div><label className="block text-sm font-bold" htmlFor="buy-phone">Your phone number</label><input id="buy-phone" type="tel" required value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+2348012345678" className="mt-2 w-full rounded-xl border px-4 py-3"/><p className="mt-2 text-xs text-[#82899a]">Your phone will be shared with this seller for order coordination. It will not appear on public listings.</p></div>
      <div><label className="block text-sm font-bold" htmlFor="buy-state">Delivery state</label><select id="buy-state" required value={state} onChange={e=>setState(e.target.value)} className="mt-2 w-full rounded-xl border bg-white px-4 py-3"><option value="">Choose state</option>{states.map(s=><option key={s.id} value={s.code}>{s.name}</option>)}</select></div>
      <div><label className="block text-sm font-bold" htmlFor="buy-city">Delivery city or area</label><input id="buy-city" required minLength={2} maxLength={100} value={city} onChange={e=>setCity(e.target.value)} placeholder="e.g. Wuse 2, Abuja" className="mt-2 w-full rounded-xl border px-4 py-3"/></div>
     </div>
     <div className="rounded-2xl bg-[#ede9fd] p-4 text-sm text-[#514580]"><p className="flex items-center gap-2 font-bold"><ShieldCheck size={17}/> No payment collected</p><p className="mt-1 text-xs leading-5">Seller confirmation is required. Final delivery address, verified shipping quote and secure checkout will be collected only after those systems are ready.</p></div>
     <button type="submit" disabled={busy} className="w-full rounded-xl bg-vura-500 px-6 py-4 font-bold text-white disabled:opacity-50">{busy?'Sending request…':'Ask seller to confirm · '+money(item.price_kobo*quantity)}</button>
   </form>}
  </div>
 </main>;
}

export function MarketOrdersPage({ side }: {side:'buyer'|'seller'}) {
 const {user,loading: authLoading}=useAuth();
 const router=useRouter();
 const [orders,setOrders]=useState<MarketplaceOrder[]>([]);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState('');
 const [page,setPage]=useState(1);
 const [events,setEvents]=useState<MarketplaceEvent[]>([]);
 const [selected,setSelected]=useState('');
 const selectedFromUrl=router.query.get('id')||'';
 useEffect(()=>{if(!authLoading&&!user)router.navigate('/signin?next='+encodeURIComponent(side==='seller'?'/sell/orders':'/market-orders'),{replace:true});},[user,authLoading,side,router]);
 const load=async()=>{
   setLoading(true);setError('');
   try{
     const r=await marketOrdersApi.list(side,page);setOrders(r.orders);
     const id=selected||selectedFromUrl;
     if(id){const detail=await marketOrdersApi.detail(id);setEvents(detail.events);}
   }catch(e){setError((e as Error).message);}finally{setLoading(false);}
 };
 useEffect(()=>{if(user)void load();},[user,side,page,selected,selectedFromUrl]);
 const decide=async(id:string,action:'accept'|'decline'|'unavailable'|'cancel')=>{
   if(action==='unavailable'&&!window.confirm('Mark this item unavailable and pause the listing?'))return;
   setBusy(id);setError('');
   try{await marketOrdersApi.respond(id,action);await load();}catch(e){setError((e as Error).message);}finally{setBusy('');}
 };
 if(authLoading||!user)return <main id="main" className="p-8">Sign in to see your orders…</main>;
 return <main id="main" className="min-h-[70vh] bg-[#f7f7fb] px-4 py-8 text-[#17182a] sm:py-12">
  <div className="mx-auto max-w-5xl">
   <Link to={side==='seller'?'/sell':'/account'} className="inline-flex items-center gap-2 text-sm font-bold text-[#737b8c]"><ArrowLeft size={16}/> {side==='seller'?'My Shop':'My account'}</Link>
   <div className="mt-5 flex items-center gap-3"><ShoppingBag className="text-vura-500"/><div><h1 className="font-display text-3xl font-black">{side==='seller'?'Customer requests':'My community orders'}</h1>
    <p className="mt-2 text-sm text-[#77808f]">{side==='seller'?'Confirm availability as soon as a buyer requests your product.':'Follow requests and seller responses. No money is collected here yet.'}</p></div></div>
   {error&&<p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
   {loading&&<p className="mt-8 text-sm">Loading requests…</p>}
   {!loading&&!orders.length&&<div className="mt-8 rounded-3xl border border-dashed border-[#dedde8] bg-white p-14 text-center"><Package className="mx-auto text-vura-400" size={34}/><h2 className="mt-3 font-bold">No requests yet</h2><p className="mt-2 text-sm text-[#7f8798]">New purchase requests will appear here.</p></div>}
   <div className="mt-7 space-y-4">
    {orders.map(o=><article key={o.id} className="rounded-2xl border border-[#e9e8ef] bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
       <div><span className="text-xs font-bold text-[#858d9d]">Order #{o.order_number}</span><h2 className="mt-1 font-bold">{o.listing_title}</h2><p className="mt-1 text-sm text-[#747c8c]">Qty {o.quantity} · {side==='seller'?'Buyer: '+o.buyer_name:'Seller: '+o.shop_name}</p><p className="mt-2 font-black text-vura-500">{money(o.subtotal_kobo)}</p>{side==='seller'&&<p className="mt-2 text-xs text-[#737a8b]">Buyer contact: <a href={'tel:'+o.buyer_phone} className="font-bold text-vura-500">{o.buyer_phone}</a></p>}</div><Status value={o.status}/>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[#808899]"><MapPin size={14}/>{o.destination_city}, {o.destination_state_code}
       {o.status==='awaiting_seller'&&<span className="ml-auto flex items-center gap-1"><Clock size={14}/> Respond by {new Date(o.seller_response_deadline).toLocaleString('en-NG')}</span>}</div>
      {side==='seller'&&o.status==='awaiting_seller'&&<div className="mt-4 grid gap-2 sm:grid-cols-3">
        <button disabled={!!busy} onClick={()=>void decide(o.id,'accept')} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-40">Yes, available</button>
        <button disabled={!!busy} onClick={()=>void decide(o.id,'decline')} className="rounded-xl border px-4 py-3 text-sm font-bold disabled:opacity-40">Decline request</button>
        <button disabled={!!busy} onClick={()=>void decide(o.id,'unavailable')} className="rounded-xl border border-red-200 px-4 py-3 text-sm font-bold text-red-600 disabled:opacity-40">Mark sold out</button>
       </div>}
      {side==='buyer'&&['awaiting_seller','seller_accepted'].includes(o.status)&&<div className="mt-4 flex items-center justify-between gap-2 rounded-xl bg-[#f3f0ff] p-3">
        <p className="text-xs leading-5 text-[#67598c]">{o.status==='seller_accepted'?'Seller confirmed. Secure payment and courier checkout are not enabled yet. Do not send payment.':'We have notified the seller. You will receive an update when they respond.'}</p>
        <button disabled={!!busy} onClick={()=>void decide(o.id,'cancel')} className="shrink-0 text-xs font-bold text-red-600 disabled:opacity-40">Cancel</button>
       </div>}
      <button onClick={()=>setSelected(x=>x===o.id?'':o.id)} className="mt-4 text-xs font-bold text-vura-500">View order history</button>
      {(selected===o.id||selectedFromUrl===o.id)&&events.length>0&&<div className="mt-3 space-y-2 border-t border-[#e9e8f0] pt-4">
        {events.map((ev,i)=><div key={i} className="flex gap-3 text-xs"><CheckCircle size={14} className="shrink-0 text-vura-500"/><div><p className="font-bold">{ev.message}</p><p className="mt-1 text-[#838b98]">{new Date(ev.created_at).toLocaleString('en-NG')}</p></div></div>)}
       </div>}
    </article>)}
   </div>
   {orders.length===30&&<button className="mt-6 rounded-xl border bg-white px-4 py-3 text-sm font-bold" onClick={()=>setPage(x=>x+1)}>Next page</button>}
   {page>1&&<button className="mt-6 ml-3 rounded-xl border bg-white px-4 py-3 text-sm font-bold" onClick={()=>setPage(x=>x-1)}>Previous</button>}
  </div>
 </main>;
}
