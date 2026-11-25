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
  ChevronRight,
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
      label: 'Closing',
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
      sublabel: 'Profit & Sales',
      icon: BarChart3,
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/60',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      adminOnly: true,
      action: () => onSelectTab('reports'),
    },
    {
      id: 'activity',
      label: 'Activity',
      sublabel: 'Audit Log',
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
    <div className="h-full w-full flex flex-col justify-between gap-2.5 overflow-hidden select-none px-0.5 py-0.5">
      {/* Section 1: Compact Quick Actions (Sale & Party) */}
      <div className="space-y-1.5 shrink-0 animate-card-in animate-stagger-1">
        <div className="flex items-center justify-between px-1">
          <span className="text-[9.5px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500">
            Quick Actions
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {/* 1. Primary Box: Sale (POS & Billing) */}
          <button
            type="button"
            onClick={() => onSelectTab('pos')}
            className="btn-primary relative overflow-hidden bg-blue-600 hover:bg-blue-700 text-white rounded-2xl px-2.5 py-2 shadow-md flex items-center gap-2 h-[58px] text-left cursor-pointer active:scale-[0.95] transition-all"
          >
            <div className="w-8 h-8 rounded-xl bg-white/18 flex items-center justify-center shrink-0">
              <ShoppingCart className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-[14px] font-black leading-tight tracking-tight truncate">
                Sale
              </span>
              <span className="block text-[9.5px] font-semibold opacity-85 truncate mt-0.5">
                POS &amp; Billing
              </span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 opacity-75 shrink-0" />
          </button>

          {/* 2. Second Primary Box: Party (Stock Inward) */}
          <button
            type="button"
            onClick={() => onSelectTab('purchases')}
            className="bg-white dark:bg-black border border-slate-200/90 dark:border-neutral-900 hover:border-amber-400 rounded-2xl px-2.5 py-2 shadow-xs flex items-center gap-2 h-[58px] text-left cursor-pointer active:scale-[0.95] transition-all"
          >
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Truck className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-[14px] font-black text-slate-900 dark:text-white leading-tight tracking-tight truncate">
                Party
              </span>
              <span className="block text-[9.5px] font-semibold text-slate-500 dark:text-neutral-400 truncate mt-0.5">
                Stock Inward
              </span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>
        </div>
      </div>

      {/* Section 2: Compact Smart App Tiles Grid (Never Stretched, Zero Scroll) */}
      <div className="flex-1 min-h-0 flex flex-col justify-center space-y-1.5">
        <div className="flex items-center justify-between px-1 shrink-0">
          <span className="text-[9.5px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500">
            Store Modules
          </span>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          {secondaryBoxes.map((box, idx) => {
            const Icon = box.icon;
            const staggerClass = `animate-stagger-${Math.min(6, (idx % 6) + 1)}`;
            return (
              <button
                key={box.id}
                type="button"
                onClick={box.action}
                className={`animate-card-in ${staggerClass} bg-white dark:bg-black border border-slate-200/80 dark:border-neutral-900 hover:border-blue-300 rounded-xl px-2.5 py-1.5 shadow-2xs flex items-center gap-2 text-left cursor-pointer active:scale-[0.95] transition-all h-[46px] overflow-hidden`}
              >
                <div
                  className={`w-7 h-7 rounded-lg ${box.iconBg} ${box.iconColor} flex items-center justify-center shrink-0`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11.5px] font-extrabold text-slate-900 dark:text-white leading-tight truncate">
                      {box.label}
                    </span>
                    {box.badge !== undefined && box.badge > 0 && (
                      <span className="px-1.5 py-0.2 rounded-md bg-orange-50 dark:bg-orange-950/60 text-[9px] font-black text-orange-600 dark:text-orange-400 tabular-nums shrink-0">
                        {box.badge}
                      </span>
                    )}
                  </div>
                  <span className="block text-[9px] font-medium text-slate-500 dark:text-neutral-400 leading-tight truncate mt-0.5">
                    {box.sublabel}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 3: Compact View Dashboard CTA (Admin Only) */}
      {isAdmin && (
        <button
          type="button"
          onClick={() => onSelectTab('dashboard')}
          className="dashboard-hero-card animate-card-in animate-stagger-5 relative overflow-hidden rounded-2xl px-3 py-2 text-white border flex items-center justify-between gap-2.5 shrink-0 cursor-pointer active:scale-[0.96] transition-all h-[48px]"
        >
          <div className="flex items-center gap-2.5 min-w-0 relative z-10">
            <div className="w-7.5 h-7.5 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <LayoutDashboard className="w-3.5 h-3.5 text-emerald-300" />
            </div>
            <div className="text-left min-w-0">
              <span className="block text-[12.5px] font-black leading-tight tracking-tight truncate">
                View Dashboard
              </span>
              <span className="block text-[9px] text-slate-300 font-medium truncate">
                Cash In Hand, Profit &amp; Analytics
              </span>
            </div>
          </div>
          <div className="w-6.5 h-6.5 rounded-lg bg-white/10 flex items-center justify-center shrink-0 relative z-10">
            <ChevronRight className="w-3.5 h-3.5 text-white/90" />
          </div>
        </button>
      )}
    </div>
  );
};
