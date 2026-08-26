import { AlertCircle, AlertTriangle, Clock, Package, Plus, ShoppingBag, ArrowRight } from 'lucide-react';
import { money } from '@/lib/money';
import type { Overview, OverviewRecentOrder, ResourceState, StudioTab } from '@/types';

interface AdminOverviewProps {
  state: ResourceState<Overview>;
  onNavigate: (section: StudioTab | string) => void;
  onRefresh: () => void;
}

export default function AdminOverview({ state, onNavigate, onRefresh }: AdminOverviewProps) {
  if (state.state === 'loading') {
    return (
      <div className="grid min-h-[50vh] place-items-center text-white/40">
        <div className="text-center">
          <div className="inline-block animate-spin">
            <div className="h-8 w-8 rounded-full border-4 border-white/20 border-t-vura-500" />
          </div>
          <p className="mt-4 text-sm">Loading overview…</p>
        </div>
      </div>
    );
  }

  if (state.state === 'error') {
    return (
      <div className="rounded-xl border border-red-400/20 bg-red-400/10 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 text-red-400" size={20} />
          <div className="flex-1">
            <h3 className="font-semibold text-red-200">Failed to load overview</h3>
            <p className="mt-1 text-sm text-red-300/70">{state.error}</p>
            {state.requestId && (
              <p className="mt-2 text-xs text-red-300/50">Request ID: {state.requestId}</p>
            )}
            <button
              type="button"
              onClick={onRefresh}
              className="mt-4 rounded-lg bg-red-500/20 px-3 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/30"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (state.state !== 'success' || !state.data) {
    return (
      <div className="text-center text-white/50">
        <p>No data available</p>
      </div>
    );
  }

  const overview = state.data;
  const attention = overview.attention || { pendingPayment: 0, toFulfill: 0, lowStock: 0 };
  const recent = overview.recentOrders || [];
  const totalAttention = attention.pendingPayment + attention.toFulfill + attention.lowStock;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Command Center</h1>
          <p className="mt-1 text-sm text-white/45">What needs you right now — and how the shop is doing</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onNavigate('products')}
            className="flex items-center gap-2 rounded-xl bg-vura-500 px-4 py-2 text-sm font-bold"
          >
            <Plus size={15} /> Add product
          </button>
          <button
            type="button"
            onClick={() => onNavigate('orders')}
            className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-bold hover:bg-white/5"
          >
            <ShoppingBag size={15} /> Orders
          </button>
        </div>
      </div>

      <div className="mb-8 grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KPICard label="Live products" value={overview.liveProducts} />
        <KPICard label="Orders this month" value={overview.monthlyOrders} />
        <KPICard label="Revenue this month" value={money(overview.monthlyRevenueKobo)} />
        <KPICard label="Gross profit" value={money(overview.monthlyProfitKobo)} />
      </div>

      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Needs attention</h2>
          {totalAttention === 0 && (
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
              All clear
            </span>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ActionCard
            title="Payment verification"
            count={attention.pendingPayment}
            status="pending"
            description="Unpaid or awaiting verification"
            onClick={() => onNavigate('orders')}
          />
          <ActionCard
            title="Orders to fulfill"
            count={attention.toFulfill}
            status="warning"
            description="Paid — not yet delivered"
            onClick={() => onNavigate('orders')}
          />
          <ActionCard
            title="Low / out of stock"
            count={attention.lowStock}
            status="warning"
            description="Active products need restock"
            onClick={() => onNavigate('products')}
          />
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Recent orders</h2>
          <button
            type="button"
            onClick={() => onNavigate('orders')}
            className="flex items-center gap-1 text-xs font-bold text-white/45 hover:text-white"
          >
            View all <ArrowRight size={12} />
          </button>
        </div>
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[.025]">
          {recent.length > 0 ? (
            <div className="divide-y divide-white/5">
              {recent.map((order) => (
                <RecentOrderRow key={order.id} order={order} onClick={() => onNavigate('orders')} />
              ))}
            </div>
          ) : (
            <div className="p-10 text-center text-white/40">
              <Package className="mx-auto mb-2 opacity-40" size={28} />
              <p className="text-sm">No orders yet</p>
              <p className="mt-1 text-xs text-white/30">New orders will show up here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KPICard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4 sm:p-5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-white/40">{label}</p>
      <p className="mt-3 text-xl font-black sm:text-2xl">{value}</p>
    </div>
  );
}

function ActionCard({
  title,
  count,
  status,
  description,
  onClick,
}: {
  title: string;
  count: number;
  status: 'pending' | 'warning' | 'error';
  description: string;
  onClick: () => void;
}) {
  const statusConfig = {
    pending: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', icon: Clock, color: 'text-blue-400' },
    warning: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: AlertTriangle, color: 'text-amber-400' },
    error: { bg: 'bg-red-500/10', border: 'border-red-500/30', icon: AlertCircle, color: 'text-red-400' },
  };
  const config = statusConfig[status];
  const Icon = config.icon;
  const active = count > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-4 text-left transition hover:bg-white/[.02] ${
        active ? `${config.bg} ${config.border}` : 'border-white/10 bg-white/[.02]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-xs text-white/50">{description}</p>
        </div>
        <Icon className={`${active ? config.color : 'text-white/25'} shrink-0`} size={18} />
      </div>
      <div className="mt-3 inline-block rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold">
        {count > 0 ? `${count} action${count === 1 ? '' : 's'}` : 'None'}
      </div>
    </button>
  );
}

function RecentOrderRow({ order, onClick }: { order: OverviewRecentOrder; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-white/[.03]"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-bold">{order.order_number}</p>
        <p className="mt-0.5 truncate text-xs text-white/45">
          {order.product_name || 'Product'} · {order.delivery_name || 'Customer'}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-bold">{money(order.total_kobo)}</p>
        <p className="mt-0.5 text-[11px] capitalize text-white/40">
          {String(order.payment_status || order.status || '—').replaceAll('_', ' ')}
        </p>
      </div>
    </button>
  );
}
