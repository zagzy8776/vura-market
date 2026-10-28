import {
  Activity,
  BarChart3,
  Bell,
  CreditCard,
  Home,
  Layers,
  LogOut,
  Package,
  RefreshCcw,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  ClipboardCheck,
  TrendingUp,
  UserRound,
  Radar,
  Bot,
} from 'lucide-react';
import type { StudioTab } from '@/types';

type NavSection = {
  label: string;
  items: Array<{ id: StudioTab; label: string; icon: typeof Home }>;
};

const navSections: NavSection[] = [
  {
    label: 'HOME',
    items: [
      { id: 'overview', label: 'Overview', icon: Home },
      { id: 'health', label: 'Health & Alerts', icon: ShieldCheck },
    ],
  },
  {
    label: 'COMMERCE',
    items: [
      { id: 'orders', label: 'Orders', icon: ShoppingBag },
      { id: 'payments', label: 'Payments', icon: CreditCard },
      { id: 'products', label: 'Products', icon: Package },
      { id: 'seller-listings', label: 'Seller reviews', icon: ClipboardCheck },
      { id: 'inventory', label: 'Inventory', icon: Layers },
    ],
  },
  {
    label: 'OPERATIONS',
    items: [
      { id: 'sourcing', label: 'Sourcing', icon: Store },
      { id: 'suppliers', label: 'Suppliers', icon: TrendingUp },
      { id: 'delivery', label: 'Fulfillment', icon: RefreshCcw },
    ],
  },
  {
    label: 'CUSTOMERS',
    items: [
      { id: 'customers', label: 'Customers', icon: UserRound },
      { id: 'notifications', label: 'Notifications', icon: Bell },
    ],
  },
  {
    label: 'INSIGHTS',
    items: [
      { id: 'finance', label: 'Finance', icon: BarChart3 },
      { id: 'analytics', label: 'Analytics', icon: TrendingUp },
    ],
  },
  {
    label: 'AGENTS',
    items: [
      { id: 'agents', label: 'Command Center', icon: Bot },
      { id: 'opportunities', label: 'Opportunities', icon: Radar },
    ],
  },
  {
    label: 'SYSTEM',
    items: [
      { id: 'audit', label: 'Audit log', icon: Activity },
      { id: 'settings', label: 'Settings', icon: Settings },
    ],
  },
];

interface AdminSidebarProps {
  activeTab: StudioTab;
  onTabChange: (tab: StudioTab) => void;
  onSignOut?: () => void;
}

export default function AdminSidebar({ activeTab, onTabChange, onSignOut }: AdminSidebarProps) {
  return (
    <aside
      className="fixed inset-y-0 left-0 z-50 hidden w-60 flex-col border-r border-[var(--admin-sidebar-border)] bg-[var(--admin-sidebar-bg)] lg:flex"
      aria-label="Admin navigation"
    >
      <div className="flex h-full flex-col">
        <div className="flex h-16 shrink-0 items-center border-b border-[var(--admin-sidebar-border)] px-5">
          <button
            type="button"
            onClick={() => onTabChange('overview')}
            className="flex items-center gap-2"
          >
            <span className="font-display text-lg font-bold tracking-[0.18em] text-[var(--admin-sidebar-accent)]">
              VURA
            </span>
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4 studio-scroll" aria-label="Main navigation">
          {navSections.map((section) => (
            <div key={section.label}>
              <p className="px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-sidebar-muted)]">
                {section.label}
              </p>
              <div className="mt-2 space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onTabChange(item.id)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition ${
                        isActive
                          ? 'bg-[#c9a35d]/15 text-[#e3c989]'
                          : 'text-stone-400 hover:bg-white/5 hover:text-stone-100'
                      }`}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <Icon size={17} strokeWidth={isActive ? 2.2 : 1.8} className="shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-[var(--admin-sidebar-border)] p-3">
          {onSignOut ? (
            <button
              type="button"
              onClick={onSignOut}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold text-red-400 transition hover:bg-red-500/10 hover:text-red-300"
            >
              <LogOut size={17} />
              Sign Out
            </button>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-[var(--admin-sidebar-muted)]">
              <ShieldCheck size={14} className="shrink-0" />
              <span>Server-authorized</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
