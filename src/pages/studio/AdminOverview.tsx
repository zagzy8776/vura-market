import { AlertCircle, TrendingDown, TrendingUp, Clock, CheckCircle, AlertTriangle } from 'lucide-react';
import { money } from '@/lib/money';
import type { Overview, ResourceState } from '@/types';

interface AdminOverviewProps {
  state: ResourceState<Overview>;
  onNavigate: (section: string) => void;
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
          <p className="mt-4 text-sm">Loading overview...</p>
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

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight">Command Center</h1>
        <p className="mt-2 text-sm text-white/45">Real-time commerce operations status and action items</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <KPICard
          label="Live products"
          value={overview.liveProducts}
          trend={null}
          icon={null}
        />
        <KPICard
          label="Orders this month"
          value={overview.monthlyOrders}
          trend={null}
          icon={null}
        />
        <KPICard
          label="Revenue this month"
          value={money(overview.monthlyRevenueKobo)}
          trend={null}
          icon="currency"
        />
        <KPICard
          label="Gross profit"
          value={money(overview.monthlyProfitKobo)}
          trend={null}
          icon="currency"
        />
      </div>

      {/* Actions Queue */}
      <div className="mb-8">
        <h2 className="text-lg font-bold mb-4">Needs Attention</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ActionCard
            title="Payment Verification"
            count={0}
            status="pending"
            description="Orders awaiting verification"
            onClick={() => onNavigate('payments')}
          />
          <ActionCard
            title="Orders Awaiting Sourcing"
            count={0}
            status="warning"
            description="Payment verified, not sourced"
            onClick={() => onNavigate('orders')}
          />
          <ActionCard
            title="Orders Awaiting Dispatch"
            count={0}
            status="warning"
            description="Sourced, not dispatched"
            onClick={() => onNavigate('delivery')}
          />
          <ActionCard
            title="Failed Deliveries"
            count={0}
            status="error"
            description="Delivery updates failed"
            onClick={() => onNavigate('delivery')}
          />
          <ActionCard
            title="Low Stock Products"
            count={0}
            status="warning"
            description="Below reorder level"
            onClick={() => onNavigate('inventory')}
          />
          <ActionCard
            title="Supplier SLA Violations"
            count={0}
            status="error"
            description="Missed delivery commitments"
            onClick={() => onNavigate('suppliers')}
          />
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Recent Orders */}
        <div>
          <h2 className="text-lg font-bold mb-4">Recent Orders</h2>
          <div className="rounded-2xl border border-white/10 bg-white/[.025] overflow-hidden">
            {overview.orderEvents && overview.orderEvents.length > 0 ? (
              <div className="divide-y divide-white/5">
                {overview.orderEvents.slice(0, 5).map((event) => (
                  <div key={event.id} className="p-4 hover:bg-white/[.02] transition cursor-pointer">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-sm">{event.order_number}</p>
                        <p className="text-xs text-white/50 mt-1">{event.event_type}</p>
                      </div>
                      <p className="text-[11px] text-white/40 whitespace-nowrap">
                        {new Date(event.created_at).toLocaleTimeString('en-NG', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-white/50">
                <p className="text-sm">No recent orders</p>
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <h2 className="text-lg font-bold mb-4">Recent Admin Activity</h2>
          <div className="rounded-2xl border border-white/10 bg-white/[.025] overflow-hidden">
            {overview.audit && overview.audit.length > 0 ? (
              <div className="divide-y divide-white/5">
                {overview.audit.slice(0, 5).map((audit) => (
                  <div key={audit.id} className="p-4 hover:bg-white/[.02] transition">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-sm">{audit.actor_name || 'System'}</p>
                        <p className="text-xs text-white/50 mt-1">
                          {audit.action} {audit.entity_type}
                        </p>
                      </div>
                      <p className="text-[11px] text-white/40 whitespace-nowrap">
                        {new Date(audit.created_at).toLocaleTimeString('en-NG', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-white/50">
                <p className="text-sm">No recent activity</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function KPICard({
  label,
  value,
  trend,
  icon,
}: {
  label: string;
  value: string | number;
  trend?: 'up' | 'down' | null;
  icon?: 'currency' | null;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[.025] p-5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-white/40">{label}</p>
      <div className="mt-4 flex items-end justify-between gap-3">
        <p className="text-2xl font-black">{value}</p>
        {trend && (
          <div
            className={`flex items-center gap-1 text-xs font-bold ${
              trend === 'up' ? 'text-green-400' : 'text-red-400'
            }`}
          >
            {trend === 'up' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {trend === 'up' ? 'Up' : 'Down'}
          </div>
        )}
      </div>
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

  return (
    <button
      onClick={onClick}
      className={`rounded-xl border p-4 text-left transition hover:bg-white/[.02] ${config.bg} ${config.border}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="font-semibold text-sm">{title}</p>
          <p className="text-xs text-white/50 mt-1">{description}</p>
        </div>
        <Icon className={`${config.color} shrink-0`} size={18} />
      </div>
      {count > 0 && (
        <div className="mt-3 inline-block rounded-full bg-white/10 px-2 py-1 text-xs font-bold">
          {count} action{count !== 1 ? 's' : ''}
        </div>
      )}
    </button>
  );
}
