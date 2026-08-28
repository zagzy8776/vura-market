import { Activity, BarChart3, Bell, CreditCard, Home, Layers, Package, RefreshCcw, Settings, ShieldCheck, ShoppingBag, Store, TrendingUp, UserRound, Zap, Radar } from 'lucide-react';
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
  isCollapsed?: boolean;
}

export default function AdminSidebar({ activeTab, onTabChange, isCollapsed = false }: AdminSidebarProps) {
  return (
    <aside className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-white/10 bg-[#0b0d17] lg:flex ${isCollapsed ? 'w-20' : 'w-64'} transition-all duration-300 overflow-y-auto`}>
      <div className={`flex items-center gap-3 border-b border-white/10 ${isCollapsed ? 'px-3 py-4' : 'px-4 py-4'}`}>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-vura-500 font-black text-sm">V</span>
        {!isCollapsed && (
          <div className="min-w-0 flex-1">
            <b className="block truncate text-sm">Vura Studio</b>
            <div className="truncate text-[11px] text-white/35">Commerce OS</div>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-6 px-2 py-6">
        {navSections.map((section) => (
          <div key={section.label}>
            {!isCollapsed && (
              <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-white/40">{section.label}</p>
            )}
            <div className={`mt-${isCollapsed ? '2' : '3'} space-y-1`}>
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onTabChange(item.id)}
                    title={isCollapsed ? item.label : undefined}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
                      isActive
                        ? 'bg-vura-500 text-white shadow-lg shadow-vura-500/20'
                        : 'text-white/55 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <Icon size={16} className="shrink-0" />
                    {!isCollapsed && <span className="truncate">{item.label}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className={`border-t border-white/10 ${isCollapsed ? 'p-3' : 'p-4'} text-[11px] text-white/40`}>
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} className="shrink-0" />
          {!isCollapsed && <span>Server-authorized</span>}
        </div>
      </div>
    </aside>
  );
}
