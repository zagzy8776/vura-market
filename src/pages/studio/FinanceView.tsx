import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, TrendingUp, Wallet, Clock3, XCircle } from 'lucide-react';
import { money } from '@/lib/money';
import { authHeaders } from '@/lib/session';

type Row = Record<string, any>;
type Finance = { summary: Row; monthly: Row[]; payments: Row[]; sourcing: Row[] };

async function request<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include', headers: authHeaders() });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

export default function FinanceView() {
  const [data, setData] = useState<Finance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true); setError('');
    try { setData(await request<Finance>('/api/admin/finance')); }
    catch (e) { setError(e instanceof Error ? e.message : 'Finance data could not be loaded.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const s = data?.summary;
  const margin = useMemo(() => Number(s?.revenue_kobo || 0) ? (Number(s?.profit_kobo || 0) / Number(s?.revenue_kobo || 1)) * 100 : 0, [s]);
  if (loading && !data) return <div className="grid min-h-[60vh] place-items-center text-white/40"><RefreshCw className="mr-2 inline animate-spin" size={18}/> Loading finance…</div>;
  return <div className="p-5 md:p-8">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-black tracking-[-.05em] md:text-4xl">Finance & Reports</h1><p className="mt-2 text-sm text-white/45">Revenue, real costs, profit, payment status, and sourcing exposure from live orders.</p></div>
      <button onClick={() => void load()} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-white/55 hover:bg-white/5" aria-label="Refresh finance"><RefreshCw size={17} className={loading ? 'animate-spin' : ''}/></button>
    </div>
    {error && <div className="mt-5 flex items-center gap-3 border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200"><AlertTriangle size={17}/><span className="flex-1">{error}</span><button onClick={() => setError('')}><XCircle size={16}/></button></div>}
    {s && <>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat icon={<Wallet size={17}/>} label="Paid revenue" value={money(s.revenue_kobo)}/>
        <Stat icon={<TrendingUp size={17}/>} label="Actual profit" value={money(s.profit_kobo)} hint={`${margin.toFixed(1)}% realized margin`}/>
        <Stat icon={<Clock3 size={17}/>} label="Awaiting verification" value={String(s.pending_orders)}/>
        <Stat icon={<XCircle size={17}/>} label="Rejected payments" value={String(s.rejected_orders)}/>
      </div>
      <div className="mt-6 grid gap-5 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2"><h2 className="font-black">Cost breakdown</h2><div className="mt-5 space-y-3"><Line label="Revenue" value={s.revenue_kobo}/><Line label="Purchase cost" value={s.purchase_cost_kobo}/><Line label="Delivery cost" value={s.delivery_cost_kobo}/><Line label="Other cost" value={s.other_cost_kobo}/><div className="border-t border-white/10 pt-3"><Line label="Actual profit" value={s.profit_kobo} strong/></div></div></Card>
        <Card className="p-5"><h2 className="font-black">Payment ledger</h2><div className="mt-4 space-y-2">{data.payments.map(r => <div key={r.payment_status} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[.02] p-3"><span className="text-sm capitalize text-white/55">{String(r.payment_status).replaceAll('_',' ')}</span><span className="text-right"><b>{r.orders}</b><small className="ml-2 text-white/35">{money(r.amount_kobo)}</small></span></div>)}</div></Card>
      </div>
      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <Card className="overflow-hidden"><div className="p-5"><h2 className="font-black">12-month performance</h2></div><Table headers={['Month','Orders','Revenue','Profit']} rows={data.monthly.map(r => [r.month,r.orders,money(r.revenue_kobo),money(r.profit_kobo)])}/></Card>
        <Card className="overflow-hidden"><div className="p-5"><h2 className="font-black">Sourcing exposure</h2></div><Table headers={['Stage','Orders','Paid value']} rows={data.sourcing.map(r => [String(r.sourcing_status).replaceAll('_',' '),r.orders,money(r.paid_value_kobo)])}/></Card>
      </div>
    </>}
  </div>;
}

function Stat({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint?: string }) { return <div className="rounded-2xl border border-white/10 bg-white/[.025] p-5"><div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.13em] text-white/30">{icon}{label}</div><div className="mt-3 text-2xl font-black tracking-tight">{value}</div>{hint && <div className="mt-1 text-xs text-vura-300">{hint}</div>}</div>; }
function Line({ label, value, strong }: { label: string; value: number; strong?: boolean }) { return <div className={`flex items-center justify-between ${strong ? 'text-white' : 'text-white/55'}`}><span>{label}</span><b className={strong ? 'text-lg' : ''}>{money(value)}</b></div>; }
function Card({ children, className='' }: { children: ReactNode; className?: string }) { return <div className={`rounded-2xl border border-white/10 bg-white/[.025] ${className}`}>{children}</div>; }
function Table({ headers, rows }: { headers: ReactNode[]; rows: ReactNode[][] }) { return <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead><tr>{headers.map(h => <th key={String(h)} className="border-b border-white/10 px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-white/35">{h}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i} className="border-b border-white/5 last:border-0">{r.map((c,j)=><td key={j} className="px-5 py-3">{c}</td>)}</tr>)}{!rows.length&&<tr><td colSpan={headers.length} className="px-5 py-8 text-center text-white/30">No data yet.</td></tr>}</tbody></table></div>; }
