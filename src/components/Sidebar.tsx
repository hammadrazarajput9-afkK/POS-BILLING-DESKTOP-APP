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
  Barcode
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
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, adminOnly: true },
    { id: 'pos', label: 'POS & Billing', icon: ShoppingCart },
    { id: 'inventory', label: 'Inventory Master', icon: Boxes },
    { id: 'purchases', label: 'Purchases (Stock Inward)', icon: Truck, adminOnly: true },
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
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-2xs lg:hidden animate-in fade-in"
        />
      )}

      {/* Sidebar Panel */}
      <aside
        className={`fixed lg:static top-0 left-0 bottom-0 z-40 bg-white dark:bg-black border-r border-slate-200 dark:border-neutral-900 flex flex-col overflow-y-auto transition-all duration-300 ease-in-out shrink-0 ${
          isOpen
            ? 'w-64 translate-x-0 opacity-100 shadow-xl lg:shadow-none'
            : 'w-0 -translate-x-full lg:-translate-x-full opacity-0 pointer-events-none overflow-hidden border-none'
        }`}
      >
        <div className="w-64 min-w-[16rem]">
          {/* Brand Header */}
          <div className="h-16 flex items-center justify-between px-5 border-b border-slate-100 dark:border-neutral-900">
            <div className="flex items-center gap-2.5 min-w-0">
              {logoSrc ? (
                <div className="w-12 h-12 rounded-full overflow-hidden bg-white shadow-sm flex items-center justify-center p-0.5 shrink-0">
                  <img
                    src={logoSrc}
                    alt={settings.shopName}
                    className="w-full h-full object-contain rounded-full"
                  />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-full brand-badge bg-blue-600 text-white flex items-center justify-center font-extrabold text-lg shadow-md shadow-blue-500/25 shrink-0">
                  <Smartphone className="w-6 h-6" />
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
              className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer shrink-0"
              title="Close Menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1">
            {visibleNavItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-semibold text-xs transition cursor-pointer ${
                    isActive
                      ? 'text-blue-600 bg-blue-50/80 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-blue-600 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>

                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-mono">
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
