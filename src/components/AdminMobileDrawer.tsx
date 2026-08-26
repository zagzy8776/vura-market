import { Activity, BarChart3, Bell, CreditCard, Home, Layers, Package, RefreshCcw, Settings, ShieldCheck, ShoppingBag, Store, TrendingUp, UserRound, X } from 'lucide-react';
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
    label: 'SYSTEM',
    items: [
      { id: 'audit', label: 'Audit log', icon: Activity },
      { id: 'settings', label: 'Settings', icon: Settings },
    ],
  },
];

interface AdminMobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: StudioTab;
  onTabChange: (tab: StudioTab) => void;
}

export default function AdminMobileDrawer({ isOpen, onClose, activeTab, onTabChange }: AdminMobileDrawerProps) {
  const handleTabChange = (tab: StudioTab) => {
    onTabChange(tab);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 overflow-y-auto border-r border-white/10 bg-[#0b0d17] transition-transform duration-300 lg:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-vura-500 font-black">V</span>
            <div>
              <b className="block text-sm">Vura Studio</b>
              <div className="text-[11px] text-white/35">Commerce OS</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-white/5"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="space-y-6 px-2 py-6">
          {navSections.map((section) => (
            <div key={section.label}>
              <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-white/40">
                {section.label}
              </p>
              <div className="mt-3 space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleTabChange(item.id)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
                        isActive
                          ? 'bg-vura-500 text-white shadow-lg shadow-vura-500/20'
                          : 'text-white/55 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <Icon size={16} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 p-4 text-[11px] text-white/40">
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} />
            <span>Server-authorized</span>
          </div>
        </div>
      </div>
    </>
  );
}
