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
  shopName?: string;
  currency?: string;
  cashInHand?: number;
  todaySales?: number;
  pendingKhataTotal?: number;
  inventoryCount?: number;
  activityCount?: number;
  onSelectTab: (tab: string) => void;
  onOpenSettings: () => void;
}

interface LauncherBox {
  id: string;
  label: string;
  sublabel: string;
  icon: React.FC<{ className?: string }>;
  iconGradient: string;
  cardTint: string;
  adminOnly?: boolean;
  action: () => void;
}

export const MobileHomeLauncher: React.FC<MobileHomeLauncherProps> = ({
  currentRole = 'admin',
  inventoryCount = 0,
  activityCount = 0,
  onSelectTab,
  onOpenSettings,
}) => {
  const isAdmin = currentRole === 'admin';

  const secondaryBoxes: LauncherBox[] = [
    {
      id: 'inventory',
      label: 'Inventory',
      sublabel: inventoryCount > 0 ? `${inventoryCount} Models · Stock` : 'Stock & IMEI',
      icon: Boxes,
      iconGradient: 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-xs',
      cardTint: 'hover:border-blue-300',
      action: () => onSelectTab('inventory'),
    },
    {
      id: 'expenses',
      label: 'Expenses',
      sublabel: 'Daily Shop Bills',
      icon: Receipt,
      iconGradient: 'bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-xs',
      cardTint: 'hover:border-rose-300',
      action: () => onSelectTab('expenses'),
    },
    {
      id: 'barcode',
      label: 'Barcodes',
      sublabel: 'Print Stickers',
      icon: Barcode,
      iconGradient: 'bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-xs',
      cardTint: 'hover:border-sky-300',
      action: () => onSelectTab('barcode'),
    },
    {
      id: 'reports',
      label: 'Reports',
      sublabel: 'Profit & Sales PDF',
      icon: BarChart3,
      iconGradient: 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-xs',
      cardTint: 'hover:border-emerald-300',
      adminOnly: true,
      action: () => onSelectTab('reports'),
    },
    {
      id: 'activity',
      label: 'Activity',
      sublabel: activityCount > 0 ? `${activityCount} Audit Logs` : 'Audit Log',
      icon: Activity,
      iconGradient: 'bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-xs',
      cardTint: 'hover:border-amber-300',
      adminOnly: true,
      action: () => onSelectTab('activity'),
    },
    {
      id: 'settings',
      label: 'Settings',
      sublabel: 'Shop & Backup',
      icon: Settings,
      iconGradient: 'bg-gradient-to-br from-slate-700 to-slate-800 text-white shadow-xs',
      cardTint: 'hover:border-slate-400',
      adminOnly: true,
      action: onOpenSettings,
    },
  ].filter(item => isAdmin || !item.adminOnly);

  return (
    <div className="h-full w-full flex flex-col justify-evenly gap-2 overflow-hidden select-none px-0.5 py-1">
      {/* Section 1: Quick Actions (Sale, Party, Khata, Daily Closing) */}
      <div className="space-y-1.5 shrink-0 animate-card-in">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-extrabold tracking-wide text-slate-500 dark:text-neutral-400">
            Quick Actions
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {/* 1. Sale (POS & Billing) */}
          <button
            type="button"
            onClick={() => onSelectTab('pos')}
            className="relative overflow-hidden bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-2xl px-3 py-2 shadow-md shadow-blue-600/20 flex items-center gap-2.5 h-[56px] text-left cursor-pointer active:scale-[0.96] transition-all duration-150"
          >
            <div className="w-8.5 h-8.5 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <ShoppingCart className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-[13px] font-black leading-tight tracking-tight truncate">
                Sale
              </span>
              <span className="block text-[10px] font-semibold text-blue-100 truncate mt-0.5">
                POS &amp; Billing
              </span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 opacity-80 shrink-0" />
          </button>

          {/* 2. Party (Stock Inward) */}
          <button
            type="button"
            onClick={() => onSelectTab('purchases')}
            className="bg-gradient-to-br from-amber-50/90 to-white dark:from-neutral-950 dark:to-black border border-amber-200/80 dark:border-neutral-800 hover:border-amber-400 rounded-2xl px-3 py-2 shadow-xs flex items-center gap-2.5 h-[56px] text-left cursor-pointer active:scale-[0.96] transition-all duration-150"
          >
            <div className="w-8.5 h-8.5 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-xs flex items-center justify-center shrink-0">
              <Truck className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-[13px] font-black text-slate-900 dark:text-white leading-tight tracking-tight truncate">
                Party
              </span>
              <span className="block text-[10px] font-semibold text-slate-500 dark:text-neutral-400 truncate mt-0.5">
                Stock Inward
              </span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-amber-500/80 shrink-0" />
          </button>

          {/* 3. Khata (Customer & Party Ledger) */}
          <button
            type="button"
            onClick={() => onSelectTab('khata')}
            className="bg-gradient-to-br from-emerald-50/90 to-white dark:from-neutral-950 dark:to-black border border-emerald-200/80 dark:border-neutral-800 hover:border-emerald-400 rounded-2xl px-3 py-2 shadow-xs flex items-center gap-2.5 h-[56px] text-left cursor-pointer active:scale-[0.96] transition-all duration-150"
          >
            <div className="w-8.5 h-8.5 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-xs flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-[13px] font-black text-slate-900 dark:text-white leading-tight tracking-tight truncate">
                Khata
              </span>
              <span className="block text-[10px] font-semibold text-slate-500 dark:text-neutral-400 truncate mt-0.5">
                Party Ledger
              </span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-emerald-500/80 shrink-0" />
          </button>

          {/* 4. Daily Closing (Cash & Digital Tally) */}
          <button
            type="button"
            onClick={() => onSelectTab('dailyClosing')}
            className="bg-gradient-to-br from-indigo-50/90 to-white dark:from-neutral-950 dark:to-black border border-indigo-200/80 dark:border-neutral-800 hover:border-indigo-400 rounded-2xl px-3 py-2 shadow-xs flex items-center gap-2.5 h-[56px] text-left cursor-pointer active:scale-[0.96] transition-all duration-150"
          >
            <div className="w-8.5 h-8.5 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-xs flex items-center justify-center shrink-0">
              <Calculator className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-[13px] font-black text-slate-900 dark:text-white leading-tight tracking-tight truncate">
                Daily Closing
              </span>
              <span className="block text-[10px] font-semibold text-slate-500 dark:text-neutral-400 truncate mt-0.5">
                Cash &amp; Digital
              </span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-indigo-500/80 shrink-0" />
          </button>
        </div>
      </div>

      {/* Section 2: Store Modules (Matched Exact Same Box Size as Quick Actions) */}
      <div className="space-y-1.5 shrink-0">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-extrabold tracking-wide text-slate-500 dark:text-neutral-400">
            Store Modules
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {secondaryBoxes.map((box, idx) => {
            const Icon = box.icon;
            const staggerClass = `animate-stagger-${Math.min(6, (idx % 6) + 1)}`;
            return (
              <button
                key={box.id}
                type="button"
                onClick={box.action}
                className={`animate-card-in ${staggerClass} bg-white dark:bg-black border border-slate-200/85 dark:border-neutral-900 ${box.cardTint} rounded-2xl px-3 py-2 shadow-[0_2px_8px_-3px_rgba(15,23,42,0.08)] flex items-center gap-2.5 text-left cursor-pointer active:scale-[0.96] transition-all duration-150 h-[56px] overflow-hidden`}
              >
                <div
                  className={`w-8.5 h-8.5 rounded-xl ${box.iconGradient} flex items-center justify-center shrink-0`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block text-[13px] font-black text-slate-900 dark:text-white leading-tight tracking-tight truncate">
                    {box.label}
                  </span>
                  <span className="block text-[10px] font-semibold text-slate-500 dark:text-neutral-400 leading-tight truncate mt-0.5 tabular-nums">
                    {box.sublabel}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 3: View Dashboard CTA (Admin Only, Matching Height) */}
      {isAdmin && (
        <button
          type="button"
          onClick={() => onSelectTab('dashboard')}
          className="animate-card-in animate-stagger-5 relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950 border border-slate-800 px-3.5 py-2 text-white shadow-md flex items-center justify-between gap-2.5 shrink-0 cursor-pointer active:scale-[0.97] transition-all duration-150 h-[56px]"
        >
          <div className="flex items-center gap-2.5 min-w-0 relative z-10">
            <div className="w-8.5 h-8.5 rounded-xl bg-emerald-500/20 border border-emerald-400/20 flex items-center justify-center shrink-0">
              <LayoutDashboard className="w-4 h-4 text-emerald-300" />
            </div>
            <div className="text-left min-w-0">
              <span className="block text-[13px] font-black leading-tight tracking-tight truncate">
                View Dashboard
              </span>
              <span className="block text-[10px] text-slate-300 font-semibold truncate">
                Sales, Profit &amp; Analytics
              </span>
            </div>
          </div>
          <div className="w-7.5 h-7.5 rounded-xl bg-white/10 flex items-center justify-center shrink-0 relative z-10">
            <ChevronRight className="w-4 h-4 text-emerald-300" />
          </div>
        </button>
      )}
    </div>
  );
};
