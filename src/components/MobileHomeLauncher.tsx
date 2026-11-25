import React from 'react';
import {
  ShoppingCart,
  Truck,
  Boxes,
  BookOpen,
  Receipt,
  Calculator,
  Barcode,
  BarChart3,
  Activity,
  Settings,
  LayoutDashboard,
  ArrowRight,
} from 'lucide-react';
import { UserRole } from '../types';

interface MobileHomeLauncherProps {
  currentRole?: UserRole;
  activityCount?: number;
  onSelectTab: (tab: string) => void;
  onOpenSettings: () => void;
}

interface LauncherBox {
  id: string;
  label: string;
  sublabel: string;
  icon: React.FC<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  badge?: number;
  adminOnly?: boolean;
  action: () => void;
}

export const MobileHomeLauncher: React.FC<MobileHomeLauncherProps> = ({
  currentRole = 'admin',
  activityCount = 0,
  onSelectTab,
  onOpenSettings,
}) => {
  const isAdmin = currentRole === 'admin';

  const secondaryBoxes: LauncherBox[] = [
    {
      id: 'inventory',
      label: 'Inventory',
      sublabel: 'Stock & IMEI',
      icon: Boxes,
      iconBg: 'bg-indigo-50 dark:bg-indigo-950/60',
      iconColor: 'text-indigo-600 dark:text-indigo-400',
      action: () => onSelectTab('inventory'),
    },
    {
      id: 'khata',
      label: 'Khata',
      sublabel: 'Customer Credit',
      icon: BookOpen,
      iconBg: 'bg-purple-50 dark:bg-purple-950/60',
      iconColor: 'text-purple-600 dark:text-purple-400',
      action: () => onSelectTab('khata'),
    },
    {
      id: 'expenses',
      label: 'Expenses',
      sublabel: 'Daily Bills',
      icon: Receipt,
      iconBg: 'bg-rose-50 dark:bg-rose-950/60',
      iconColor: 'text-rose-600 dark:text-rose-400',
      action: () => onSelectTab('expenses'),
    },
    {
      id: 'dailyClosing',
      label: 'Daily Closing',
      sublabel: 'Cash Tally',
      icon: Calculator,
      iconBg: 'bg-teal-50 dark:bg-teal-950/60',
      iconColor: 'text-teal-600 dark:text-teal-400',
      action: () => onSelectTab('dailyClosing'),
    },
    {
      id: 'barcode',
      label: 'Barcodes',
      sublabel: 'Print Labels',
      icon: Barcode,
      iconBg: 'bg-sky-50 dark:bg-sky-950/60',
      iconColor: 'text-sky-600 dark:text-sky-400',
      action: () => onSelectTab('barcode'),
    },
    {
      id: 'reports',
      label: 'Reports',
      sublabel: 'Sales & Profit',
      icon: BarChart3,
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/60',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      adminOnly: true,
      action: () => onSelectTab('reports'),
    },
    {
      id: 'activity',
      label: 'Activity',
      sublabel: 'Audit History',
      icon: Activity,
      iconBg: 'bg-orange-50 dark:bg-orange-950/60',
      iconColor: 'text-orange-600 dark:text-orange-400',
      badge: activityCount,
      adminOnly: true,
      action: () => onSelectTab('activity'),
    },
    {
      id: 'settings',
      label: 'Settings',
      sublabel: 'Shop & Backup',
      icon: Settings,
      iconBg: 'bg-slate-100 dark:bg-neutral-900',
      iconColor: 'text-slate-700 dark:text-neutral-300',
      adminOnly: true,
      action: onOpenSettings,
    },
  ].filter(item => isAdmin || !item.adminOnly);

  return (
    <div className="h-full w-full flex flex-col justify-between gap-2 overflow-hidden select-none">
      {/* Primary Action Row: Sale (POS & Billing) + Party (Stock Inward) */}
      <div className="grid grid-cols-2 gap-2.5 shrink-0">
        {/* 1. Primary Box: Sale (POS & Billing) */}
        <button
          type="button"
          onClick={() => onSelectTab('pos')}
          className="btn-primary bg-blue-600 hover:bg-blue-700 text-white rounded-2xl p-3 sm:p-4 shadow-md flex flex-col justify-between min-h-[82px] sm:min-h-[96px] text-left cursor-pointer active:scale-[0.98] transition-transform"
        >
          <div className="flex items-center justify-between w-full">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <ArrowRight className="w-4 h-4 opacity-80 shrink-0" />
          </div>
          <div className="mt-2 min-w-0">
            <span className="block text-base sm:text-lg font-black leading-tight tracking-tight truncate">
              Sale
            </span>
            <span className="block text-[10.5px] font-semibold opacity-85 truncate">
              POS &amp; Billing
            </span>
          </div>
        </button>

        {/* 2. Second Primary Box: Party (Stock Inward) */}
        <button
          type="button"
          onClick={() => onSelectTab('purchases')}
          className="bg-white dark:bg-black border border-slate-200/90 dark:border-neutral-900 hover:border-amber-400 rounded-2xl p-3 sm:p-4 shadow-sm flex flex-col justify-between min-h-[82px] sm:min-h-[96px] text-left cursor-pointer active:scale-[0.98] transition-all"
        >
          <div className="flex items-center justify-between w-full">
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
          </div>
          <div className="mt-2 min-w-0">
            <span className="block text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight tracking-tight truncate">
              Party
            </span>
            <span className="block text-[10.5px] font-semibold text-slate-500 dark:text-neutral-400 truncate">
              Stock Inward
            </span>
          </div>
        </button>
      </div>

      {/* Secondary Modules Grid — Auto-fits remaining space with ZERO scrolling */}
      <div
        className={`grid grid-cols-2 gap-2 flex-1 min-h-0 ${
          secondaryBoxes.length <= 6 ? 'grid-rows-3' : 'grid-rows-4'
        }`}
      >
        {secondaryBoxes.map(box => {
          const Icon = box.icon;
          return (
            <button
              key={box.id}
              type="button"
              onClick={box.action}
              className="bg-white dark:bg-black border border-slate-200/90 dark:border-neutral-900 hover:border-blue-300 rounded-xl px-2.5 py-2 shadow-2xs flex items-center gap-2.5 text-left cursor-pointer active:scale-[0.98] transition-all min-h-0 h-full overflow-hidden"
            >
              <div
                className={`w-9 h-9 rounded-xl ${box.iconBg} ${box.iconColor} flex items-center justify-center shrink-0`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white leading-tight truncate">
                    {box.label}
                  </span>
                  {box.badge !== undefined && box.badge > 0 && (
                    <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 tabular-nums shrink-0">
                      {box.badge}
                    </span>
                  )}
                </div>
                <span className="block text-[10px] font-medium text-slate-500 dark:text-neutral-400 leading-tight truncate">
                  {box.sublabel}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Bottom Primary CTA Box: View Dashboard (Admin Only) */}
      {isAdmin && (
        <button
          type="button"
          onClick={() => onSelectTab('dashboard')}
          className="dashboard-hero-card rounded-2xl px-4 py-3 text-white border flex items-center justify-between gap-3 shrink-0 cursor-pointer active:scale-[0.98] transition-transform min-h-[54px]"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <LayoutDashboard className="w-5 h-5 text-emerald-300" />
            </div>
            <div className="text-left min-w-0">
              <span className="block text-sm font-black leading-tight tracking-tight truncate">
                View Dashboard
              </span>
              <span className="block text-[10px] text-slate-300 font-medium truncate">
                Cash Drawer, Profit &amp; Store Analytics
              </span>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-white/80 shrink-0" />
        </button>
      )}
    </div>
  );
};
