import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Activity, Bell, CreditCard, LayoutDashboard, Package, RefreshCw, Search, ShieldCheck, ShoppingBag, Store, UserRound } from 'lucide-react';
import { money } from '@/lib/money';
import type { Audit, Customer, Notification, Order, OrderEvent, Overview, Product, ResourceState, StudioTab, Supplier } from '@/types';
import { OperationalOrders, OperationalProducts, OperationalSuppliers } from './StudioOperationalTables';

async function request<T>(url:string):Promise<{data:T;requestId?:string}>{const r=await fetch(url,{credentials:'include'});const b=await r.json().catch(()=>({}));if(!r.ok){const err=new Error(b?.error||`Request failed (${r.status})`);(err as any).requestId=r.headers.get('X-Request-ID')||undefined;throw err}return {data:b as T,requestId:r.headers.get('X-Request-ID')||undefined};}

const nav:Array<{id:StudioTab;label:string;icon:typeof LayoutDashboard}>=[
 {id:'overview',label:'Overview',icon:LayoutDashboard},{id:'orders',label:'Orders',icon:ShoppingBag},{id:'payments',label:'Payments',icon:CreditCard},{id:'products',label:'Products',icon:Package},{id:'sourcing',label:'Sourcing',icon:Store},{id:'suppliers',label:'Suppliers',icon:Store},{id:'customers',label:'Customers',icon:UserRound},{id:'notifications',label:'Notifications',icon:Bell},{id:'audit',label:'Audit log',icon:Activity}
];

export default function ProductionStudioOps(){
 const [tab,setTab]=useState<StudioTab>('overview');
 const [q,setQ]=useState('');
 const [overview,setOverview]=useState<ResourceState<Overview>>({state:'idle'});
 const [orders,setOrders]=useState<ResourceState<Order[]>>({state:'idle'});
 const [products,setProducts]=useState<ResourceState<Product[]>>({state:'idle'});
 const [suppliers,setSuppliers]=useState<ResourceState<Supplier[]>>({state:'idle'});
 const [notifications,setNotifications]=useState<ResourceState<Notification[]>>({state:'idle'});

 const loadOverview=async()=>{setOverview({state:'loading'});try{const {data}=await request<Overview>('/api/admin/overview');setOverview({state:'success',data});}catch(e){setOverview({state:'error',error:e instanceof Error?e.message:'Failed to load overview',requestId:(e as any).requestId});}};
 const loadOrders=async()=>{setOrders({state:'loading'});try{const {data}=await request<{orders:Order[]}>('/api/admin/orders');setOrders({state:'success',data:data.orders||[]});}catch(e){setOrders({state:'error',error:e instanceof Error?e.message:'Failed to load orders',requestId:(e as any).requestId});}};
 const loadProducts=async()=>{setProducts({state:'loading'});try{const {data}=await request<{products:Product[]}>('/api/admin/products');setProducts({state:'success',data:data.products||[]});}catch(e){setProducts({state:'error',error:e instanceof Error?e.message:'Failed to load products',requestId:(e as any).requestId});}};
 const loadSuppliers=async()=>{setSuppliers({state:'loading'});try{const {data}=await request<{suppliers:Supplier[]}>('/api/admin/suppliers');setSuppliers({state:'success',data:data.suppliers||[]});}catch(e){setSuppliers({state:'error',error:e instanceof Error?e.message:'Failed to load suppliers',requestId:(e as any).requestId});}};
 const loadNotifications=async()=>{setNotifications({state:'loading'});try{const {data}=await request<{notifications:Notification[]}>('/api/admin/notifications');setNotifications({state:'success',data:data.notifications||[]});}catch(e){setNotifications({state:'error',error:e instanceof Error?e.message:'Failed to load notifications',requestId:(e as any).requestId});}};

 const loadAll=async()=>{await Promise.all([loadOverview(),loadOrders(),loadProducts(),loadSuppliers(),loadNotifications()]);};

 useEffect(()=>{void loadAll();const id=window.setInterval(()=>void loadAll(),30000);return()=>window.clearInterval(id)},[]);
 
 const ordersData=useMemo(()=>orders.state==='success'?orders.data.filter(x=>`${x.order_number} ${x.delivery_name} ${x.product_name} ${x.buyer_email}`.toLowerCase().includes(q.toLowerCase())):[],[orders,q]);
 const productsData=useMemo(()=>products.state==='success'?products.data.filter(x=>`${x.name} ${x.brand} ${x.category} ${x.supplier_name}`.toLowerCase().includes(q.toLowerCase())):[],[products,q]);
 const suppliersData=useMemo(()=>suppliers.state==='success'?suppliers.data.filter(x=>`${x.name} ${x.location} ${x.phone}`.toLowerCase().includes(q.toLowerCase())):[],[suppliers,q]);
 const customersData=useMemo(()=>overview.state==='success'?overview.data.customers?.filter(x=>`${x.name} ${x.email}`.toLowerCase().includes(q.toLowerCase()))||[]:[],[overview,q]);
 const isLoading=overview.state==='loading'||orders.state==='loading'||products.state==='loading'||suppliers.state==='loading'||notifications.state==='loading';
 return <main className="min-h-screen bg-[#080a12] text-white"><div className="mx-auto flex min-h-screen max-w-[1800px]">
  <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/10 bg-[#0b0d17] p-4 lg:flex"><div className="flex items-center gap-3 px-2 py-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-vura-500 font-black">V</span><div><b>Vura Studio</b><div className="text-[11px] text-white/35">Commerce operating system</div></div></div><nav className="mt-6 flex-1 space-y-1">{nav.map(x=>{const I=x.icon;return <button key={x.id} onClick={()=>setTab(x.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold ${tab===x.id?'bg-vura-500 shadow-lg shadow-vura-500/20':'text-white/55 hover:bg-white/5 hover:text-white'}`}><I size={16}/>{x.label}</button>})}</nav><div className="border-t border-white/10 pt-3 text-xs text-white/35"><div className="flex items-center gap-2"><ShieldCheck size={14}/> Server-authorized workspace</div></div></aside>
  <section className="min-w-0 flex-1"><header className="sticky top-0 z-40 border-b border-white/10 bg-[#080a12]/90 backdrop-blur-xl"><div className="flex h-[72px] items-center gap-3 px-5 md:px-8"><div className="relative max-w-2xl flex-1"><Search className="absolute left-3.5 top-3.5 text-white/30" size={17}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search orders, products, customers, suppliers…" className="w-full rounded-xl border border-white/10 bg-white/[.035] py-3 pl-10 pr-4 text-sm outline-none focus:border-vura-400"/></div><button onClick={()=>void loadAll()} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10" aria-label="Refresh"><RefreshCw size={17} className={isLoading?'animate-spin':''}/></button></div><div className="flex gap-2 overflow-x-auto px-5 pb-3 lg:hidden">{nav.map(x=><button key={x.id} onClick={()=>setTab(x.id)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold ${tab===x.id?'bg-vura-500':'bg-white/5 text-white/55'}`}>{x.label}</button>)}</div></header>
  <div className="p-5 md:p-8">
   {tab==='overview'&&<OverviewView state={overview} notifications={notifications.state==='success'?notifications.data:[]} onTab={setTab} onRefresh={loadOverview}/>} 
   {tab==='orders'&&(orders.state==='loading'?<Loading/>:orders.state==='error'?<ErrorState error={orders.error} requestId={orders.requestId} onRetry={loadOrders}/>:<OperationalOrders orders={orders.state==='success'?orders.data:[]} suppliers={suppliersData} onRefresh={loadOrders}/>)} 
   {tab==='payments'&&<Payments state={orders}/>} 
   {tab==='products'&&(products.state==='loading'?<Loading/>:products.state==='error'?<ErrorState error={products.error} requestId={products.requestId} onRetry={loadProducts}/>:<OperationalProducts products={products.state==='success'?products.data:[]} suppliers={suppliersData} onRefresh={loadProducts}/>)} 
   {tab==='sourcing'&&<Sourcing state={orders}/>} 
   {tab==='suppliers'&&(suppliers.state==='loading'?<Loading/>:suppliers.state==='error'?<ErrorState error={suppliers.error} requestId={suppliers.requestId} onRetry={loadSuppliers}/>:<OperationalSuppliers suppliers={suppliers.state==='success'?suppliers.data:[]} onRefresh={loadSuppliers}/>)} 
   {tab==='customers'&&<Customers customers={customersData}/>} 
   {tab==='notifications'&&<Notifications state={notifications}/>} 
   {tab==='audit'&&<AuditView state={overview}/>}
  </div></section></div></main>;
}
function OverviewView({state,notifications,onTab,onRefresh}:{state:ResourceState<Overview>;notifications:Notification[];onTab:(x:StudioTab)=>void;onRefresh:()=>void}){
 if(state.state==='loading') return <Loading/>;
 if(state.state==='error') return <ErrorState error={state.error} requestId={state.requestId} onRetry={onRefresh}/>;
 if(state.state!=='success'||!state.data) return <Empty text="No overview data."/>;
 const o=state.data;
 return <><Header title="Overview" subtitle="Live commerce operations, revenue, sourcing and admin activity."/><div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Stat label="Live products" value={String(o.liveProducts)}/><Stat label="Orders this month" value={String(o.monthlyOrders)}/><Stat label="Revenue this month" value={money(o.monthlyRevenueKobo)}/><Stat label="Profit this month" value={money(o.monthlyProfitKobo)}/></div><div className="mt-6 grid gap-5 xl:grid-cols-3"><Card className="p-5 xl:col-span-2"><b>Recent activity</b><div className="mt-4 space-y-3">{(o.audit||[]).slice(0,8).map(a=><div key={a.id} className="flex gap-3 border-b border-white/5 pb-3 text-sm"><Activity size={15} className="mt-0.5 text-vura-300"/><div><b>{a.actor_name||'System'}</b> · {a.action} {a.entity_type}<div className="text-xs text-white/35">{new Date(a.created_at).toLocaleString('en-NG')}</div></div></div>)}{!o.audit?.length&&<Empty text="No audit events yet."/>}</div></Card><Card className="p-5"><b>Operations</b><div className="mt-4 space-y-2"><Metric label="Notifications" value={notifications.length} onClick={()=>onTab('notifications')}/><Metric label="Order events" value={o.orderEvents?.length||0} onClick={()=>onTab('audit')}/><Metric label="Audit events" value={o.audit?.length||0} onClick={()=>onTab('audit')}/></div></Card></div></>}
function Payments({state}:{state:ResourceState<Order[]>}){
 if(state.state==='loading') return <Loading/>;
 if(state.state==='error') return <ErrorState error={state.error} requestId={state.requestId}/>;
 if(state.state!=='success') return <Empty text="No payment data."/>;
 const orders=state.data;
 const pending=orders.filter(x=>x.payment_status==='pending_verification');
 const paid=orders.filter(x=>x.payment_status==='paid');
 return <><Header title="Payments" subtitle="Payment verification and paid-order visibility."/><div className="mt-6 grid gap-4 md:grid-cols-3"><Stat label="Pending verification" value={String(pending.length)}/><Stat label="Paid orders" value={String(paid.length)}/><Stat label="Paid volume" value={money(paid.reduce((n,x)=>n+Number(x.total_kobo),0))}/></div><Card className="mt-6 p-5"><b>Verification queue</b><div className="mt-4 space-y-2">{pending.map(x=><div key={x.id} className="flex justify-between border-b border-white/5 py-3"><span><b>{x.order_number}</b><small className="block text-white/35">{x.delivery_name}</small></span><b>{money(x.total_kobo)}</b></div>)}{!pending.length&&<Empty text="No payments awaiting verification."/>}</div></Card></>}
function Sourcing({state}:{state:ResourceState<Order[]>}){
 if(state.state==='loading') return <Loading/>;
 if(state.state==='error') return <ErrorState error={state.error} requestId={state.requestId}/>;
 if(state.state!=='success') return <Empty text="No sourcing data."/>;
 const rows=state.data.filter(x=>x.payment_status==='paid'&&!['delivered','cancelled'].includes(x.status));
 return <><Header title="Sourcing & delivery" subtitle="Paid orders awaiting purchasing, dispatch or delivery completion."/><Card className="mt-6 overflow-x-auto"><table className="w-full min-w-[800px] text-sm"><thead><tr>{['Order','Customer','Product','Supplier','Status','Total'].map(x=><th key={x} className="border-b border-white/10 px-4 py-3 text-left text-xs text-white/35">{x}</th>)}</tr></thead><tbody>{rows.map(x=><tr key={x.id} className="border-b border-white/5"><td className="px-4 py-3 font-bold">{x.order_number}</td><td className="px-4">{x.delivery_name}</td><td className="px-4">{x.product_name}</td><td className="px-4">{x.supplier_name||'Unassigned'}</td><td className="px-4"><Pill value={x.sourcing_status||x.status}/></td><td className="px-4 font-bold">{money(x.total_kobo)}</td></tr>)}</tbody></table>{!rows.length&&<Empty text="No sourcing work queued."/>}</Card></>}
function Customers({customers}:{customers:Customer[]}){return <><Header title="Customers" subtitle="Customer accounts and lifetime commercial value."/><Card className="mt-6 overflow-x-auto"><table className="w-full min-w-[700px] text-sm"><thead><tr>{['Customer','Email','Orders','Lifetime spend'].map(x=><th key={x} className="border-b border-white/10 px-4 py-3 text-left text-xs text-white/35">{x}</th>)}</tr></thead><tbody>{customers.map(x=><tr key={x.id} className="border-b border-white/5"><td className="px-4 py-3 font-bold">{x.name}</td><td className="px-4">{x.email}</td><td className="px-4">{x.order_count}</td><td className="px-4 font-bold">{money(x.total_spend_kobo)}</td></tr>)}</tbody></table>{!customers.length&&<Empty text="No customers found."/>}</Card></>}
function Notifications({state}:{state:ResourceState<Notification[]>}){
 if(state.state==='loading') return <Loading/>;
 if(state.state==='error') return <ErrorState error={state.error} requestId={state.requestId}/>;
 if(state.state!=='success') return <Empty text="No notifications."/>;
 return <><Header title="Notifications" subtitle="System and customer notification records."/><div className="mt-6 space-y-3">{state.data.map(x=><Card key={x.id} className="p-4"><div className="flex justify-between"><b>{x.title}</b><small className="text-white/30">{new Date(x.created_at).toLocaleString('en-NG')}</small></div><p className="mt-1 text-sm text-white/55">{x.body}</p><small className="text-white/30">{x.user_email||'System'}{x.order_number?` · ${x.order_number}`:''}</small></Card>)}</div></>}
function AuditView({state}:{state:ResourceState<Overview>}){
 if(state.state==='loading') return <Loading/>;
 if(state.state==='error') return <ErrorState error={state.error} requestId={state.requestId}/>;
 if(state.state!=='success') return <Empty text="No audit data."/>;
 const {audit=[],orderEvents=[]}=state.data;
 return <><Header title="Audit log" subtitle="Immutable operational history for admin actions and order state changes."/><Card className="mt-6 p-5"><b>Admin changes</b><div className="mt-4 space-y-3">{audit.map(x=><div key={x.id} className="border-b border-white/5 pb-3 text-sm"><b>{x.actor_name||'System'}</b> · {x.action} · {x.entity_type}{x.entity_id?` #${x.entity_id}`:''}<div className="text-xs text-white/35">{new Date(x.created_at).toLocaleString('en-NG')}</div></div>)}{!audit.length&&<Empty text="No audit events."/>}</div></Card><Card className="mt-6 p-5"><b>Order events</b><div className="mt-4 space-y-3">{orderEvents.map(x=><div key={x.id} className="border-b border-white/5 pb-3 text-sm"><b>{x.actor_name||'System'}</b> · {x.event_type} · {x.order_number||x.order_id}<div className="text-xs text-white/35">{new Date(x.created_at).toLocaleString('en-NG')}</div></div>)}{!orderEvents.length&&<Empty text="No order events."/>}</div></Card></>}
function Header({title,subtitle}:{title:string;subtitle:string}){return <div><h1 className="text-3xl font-black tracking-tight">{title}</h1><p className="mt-2 text-sm text-white/45">{subtitle}</p></div>}
function Card({children,className=''}:{children:ReactNode;className?:string}){return <div className={`rounded-2xl border border-white/10 bg-white/[.025] ${className}`}>{children}</div>}
function ErrorState({error,requestId,onRetry}:{error:string;requestId?:string;onRetry?:()=>void}){return <div className="rounded-xl border border-red-400/20 bg-red-400/10 p-4"><div className="text-sm text-red-200"><b>Error:</b> {error}</div>{requestId&&<div className="mt-2 text-xs text-red-300/60">Request ID: {requestId}</div>}{onRetry&&<button onClick={onRetry} className="mt-3 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/30">Retry</button>}</div>}
function Stat({label,value}:{label:string;value:string}){return <Card className="p-5"><div className="text-[11px] font-bold uppercase tracking-wider text-white/30">{label}</div><div className="mt-3 text-2xl font-black">{value}</div></Card>}
function Metric({label,value,onClick}:{label:string;value:number;onClick:()=>void}){return <button onClick={onClick} className="flex w-full justify-between rounded-xl border border-white/10 bg-white/[.02] p-3 text-left text-sm hover:bg-white/5"><span className="text-white/55">{label}</span><b>{value}</b></button>}
function Pill({value}:{value:string}){return <span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-bold capitalize">{String(value||'—').replaceAll('_',' ')}</span>}
function Empty({text}:{text:string}){return <div className="py-12 text-center text-sm text-white/30"><Package className="mx-auto mb-2" size={26}/>{text}</div>}
function Loading(){return <div className="grid min-h-[50vh] place-items-center text-white/40"><RefreshCw className="animate-spin" size={18}/></div>}
