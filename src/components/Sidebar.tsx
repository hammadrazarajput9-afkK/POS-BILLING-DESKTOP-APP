import React from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Boxes,
  Truck,
  BookOpen,
  Receipt,
  BarChart3,
  Settings,
  Smartphone,
  X,
  Activity,
  Calculator,
  Barcode,
  Home,
} from 'lucide-react';
import { ShopSettings, UserRole } from '../types';

interface SidebarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  settings: ShopSettings;
  activityCount?: number;
  currentRole?: UserRole;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isOpen,
  onClose,
  onOpenSettings,
  settings,
  activityCount = 0,
  currentRole = 'admin',
}) => {
  const navItems: {
    id: string;
    label: string;
    icon: React.FC<{ className?: string }>;
    adminOnly?: boolean;
    mobileOnly?: boolean;
    badge?: number;
  }[] = [
    { id: 'home', label: 'Home Menu', icon: Home, mobileOnly: true },
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, adminOnly: true },
    { id: 'pos', label: 'POS & Billing', icon: ShoppingCart },
    { id: 'inventory', label: 'Inventory Master', icon: Boxes },
    {
      id: 'purchases',
      label: currentRole === 'salesman' ? 'Stock Inward' : 'Purchases (Stock Inward)',
      icon: Truck,
    },
    { id: 'barcode', label: 'Barcode Generator', icon: Barcode },
    { id: 'khata', label: 'Customer Ledger (Credit)', icon: BookOpen },
    { id: 'expenses', label: 'Daily Expense', icon: Receipt },
    { id: 'dailyClosing', label: 'Daily Closing', icon: Calculator },
    { id: 'reports', label: 'Reports', icon: BarChart3, adminOnly: true },
    { id: 'activity', label: 'Activity Center', icon: Activity, badge: activityCount, adminOnly: true },
    { id: 'settings', label: 'Shop Settings', icon: Settings, adminOnly: true },
  ];

  const visibleNavItems = navItems.filter(item => currentRole === 'admin' || !item.adminOnly);

  const handleNavClick = (id: string) => {
    if (id === 'settings') {
      onOpenSettings();
    } else {
      onSelectTab(id);
    }
    if (window.innerWidth < 1024) {
      onClose();
    }
  };

  const logoSrc = settings.shopLogo || settings.logo;

  return (
    <>
      {/* Backdrop for mobile screens when open */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 glass-modal-backdrop lg:hidden animate-in fade-in"
        />
      )}

      {/* Sidebar Panel */}
      <aside
        className={`fixed lg:static top-0 left-0 bottom-0 z-40 ios-liquid-sidebar flex flex-col overflow-y-auto transition-all duration-300 ease-in-out shrink-0 ${
          isOpen
            ? 'w-64 translate-x-0 opacity-100 shadow-xl lg:shadow-none'
            : 'w-0 -translate-x-full lg:-translate-x-full opacity-0 pointer-events-none overflow-hidden border-none'
        }`}
      >
        <div className="w-64 min-w-[16rem]">
          {/* Brand Header */}
          <div className="app-sidebar-header min-h-[4rem] pt-[calc(env(safe-area-inset-top,0px)+0.85rem)] pb-3 lg:py-0 lg:h-16 flex items-center justify-between px-5 border-b border-white/50 dark:border-white/10">
            <div className="flex items-center gap-2.5 min-w-0">
              {logoSrc ? (
                <div className="w-11 h-11 rounded-full overflow-hidden flex items-center justify-center shrink-0 ring-2 ring-white/70 shadow-sm">
                  <img
                    src={logoSrc}
                    alt={settings.shopName}
                    className="w-full h-full object-cover rounded-full"
                  />
                </div>
              ) : (
                <div className="w-11 h-11 rounded-full brand-badge bg-blue-600 text-white flex items-center justify-center font-extrabold text-lg shrink-0 shadow-sm">
                  <Smartphone className="w-5 h-5" />
                </div>
              )}
              <div className="min-w-0">
                <h1 className="font-extrabold text-slate-900 dark:text-white leading-tight text-sm tracking-tight truncate">
                  {settings.shopName || 'Mobile POS Pro'}
                </h1>
                <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold tracking-wide uppercase truncate block">
                  VIP Business Suite
                </span>
              </div>
            </div>

            {/* Menu Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-white/60 transition cursor-pointer shrink-0"
              title="Close Menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] lg:pb-3 space-y-1">
            {visibleNavItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className={`group relative w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-semibold text-xs transition-all duration-200 cursor-pointer active:scale-[0.98] ${
                    item.mobileOnly ? 'lg:hidden ' : ''
                  }${
                    isActive
                      ? 'ios-liquid-chip text-blue-600 font-bold ring-1 ring-blue-300/60'
                      : 'text-slate-600 hover:text-blue-600 hover:bg-white/55 dark:hover:bg-white/5 border border-transparent'
                  }`}
                >
                  {isActive && (
                    <span className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-blue-600" />
                  )}
                  <div className="flex items-center gap-3 pl-1">
                    <Icon
                      className={`w-4 h-4 transition-transform duration-200 group-hover:scale-110 ${
                        isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-blue-600'
                      }`}
                    />
                    <span className="transition-transform duration-200 group-hover:translate-x-0.5">{item.label}</span>
                  </div>

                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100/80 text-blue-700 tabular-nums">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </aside>
    </>
  );
};
