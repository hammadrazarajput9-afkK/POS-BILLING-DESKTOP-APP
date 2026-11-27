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
  Smartphone,
  Plus,
} from 'lucide-react';
import { UserRole, InventoryItem } from '../types';

interface MobileHomeLauncherProps {
  currentRole?: UserRole;
  shopName?: string;
  currency?: string;
  cashInHand?: number;
  todaySales?: number;
  pendingKhataTotal?: number;
  inventoryCount?: number;
  activityCount?: number;
  inventory?: InventoryItem[];
  categories?: string[];
  onSelectTab: (tab: string) => void;
  onOpenSettings: () => void;
  onOpenAddUsedStock: () => void;
  onOpenUsedMobiles: () => void;
  onEditStockItem?: (item: InventoryItem) => void;
}

interface LauncherBox {
  id: string;
  label: string;
  sublabel: string;
  icon: React.FC<{ className?: string }>;
  iconGradient: string;
  glowTint: string;
  adminOnly?: boolean;
  action: () => void;
}

export const MobileHomeLauncher: React.FC<MobileHomeLauncherProps> = ({
  currentRole = 'admin',
  currency = 'Rs',
  inventoryCount = 0,
  activityCount = 0,
  inventory = [],
  onSelectTab,
  onOpenSettings,
  onOpenAddUsedStock,
  onOpenUsedMobiles,
}) => {
  const isAdmin = currentRole === 'admin';

  // Filter active used mobile items
  const usedItems = inventory.filter(item => {
    if (item.status === 'ARCHIVED') return false;
    const cat = (item.category || '').toLowerCase();
    const name = (item.name || '').toLowerCase();
    return (
      cat.includes('used') ||
      cat.includes('second') ||
      cat.includes('pre-owned') ||
      cat.includes('refurbished') ||
      name.includes('used') ||
      name.includes('second hand')
    );
  });

  const usedTotals = usedItems.reduce(
    (acc, item) => {
      const q = Math.max(0, Number(item.qty) || 0);
      acc.cost += (Number(item.costPrice) || 0) * q;
      acc.sale += (Number(item.salePrice) || 0) * q;
      acc.pcs += q;
      return acc;
    },
    { cost: 0, sale: 0, pcs: 0 }
  );

  const secondaryBoxes: LauncherBox[] = [
    {
      id: 'inventory',
      label: 'Inventory',
      sublabel: inventoryCount > 0 ? `${inventoryCount} Models · Stock` : 'Stock & IMEI',
      icon: Boxes,
      iconGradient: 'bg-gradient-to-br from-blue-400/90 to-blue-600/95 text-white shadow-md shadow-blue-500/25',
      glowTint: 'from-blue-400/20 via-transparent to-transparent',
      action: () => onSelectTab('inventory'),
    },
    {
      id: 'expenses',
      label: 'Expenses',
      sublabel: 'Daily Shop Bills',
      icon: Receipt,
      iconGradient: 'bg-gradient-to-br from-rose-400/90 to-rose-600/95 text-white shadow-md shadow-rose-500/25',
      glowTint: 'from-rose-400/20 via-transparent to-transparent',
      action: () => onSelectTab('expenses'),
    },
    {
      id: 'barcode',
      label: 'Barcodes',
      sublabel: 'Print Stickers',
      icon: Barcode,
      iconGradient: 'bg-gradient-to-br from-sky-400/90 to-cyan-600/95 text-white shadow-md shadow-sky-500/25',
      glowTint: 'from-sky-400/20 via-transparent to-transparent',
      action: () => onSelectTab('barcode'),
    },
    {
      id: 'reports',
      label: 'Reports',
      sublabel: 'Profit & Sales PDF',
      icon: BarChart3,
      iconGradient: 'bg-gradient-to-br from-emerald-400/90 to-emerald-600/95 text-white shadow-md shadow-emerald-500/25',
      glowTint: 'from-emerald-400/20 via-transparent to-transparent',
      adminOnly: true,
      action: () => onSelectTab('reports'),
    },
    {
      id: 'activity',
      label: 'Activity',
      sublabel: activityCount > 0 ? `${activityCount} Audit Logs` : 'Audit Log',
      icon: Activity,
      iconGradient: 'bg-gradient-to-br from-amber-400/90 to-orange-500/95 text-white shadow-md shadow-amber-500/25',
      glowTint: 'from-amber-400/20 via-transparent to-transparent',
      adminOnly: true,
      action: () => onSelectTab('activity'),
    },
    {
      id: 'settings',
      label: 'Settings',
      sublabel: 'Shop & Backup',
      icon: Settings,
      iconGradient: 'bg-gradient-to-br from-slate-600/90 to-slate-800/95 text-white shadow-md shadow-slate-700/25',
      glowTint: 'from-slate-400/20 via-transparent to-transparent',
      adminOnly: true,
      action: onOpenSettings,
    },
  ].filter(item => isAdmin || !item.adminOnly);

  return (
    <div className="relative h-full w-full flex flex-col justify-between gap-2.5 overflow-y-auto select-none px-1.5 py-2 pb-20">
      {/* Ambient Fluid iOS Liquid Mesh Background (refraction layer behind glass tiles) */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <div className="ios-liquid-orb-a absolute -top-12 -left-14 w-64 h-64 rounded-full bg-gradient-to-br from-sky-400/28 via-blue-500/20 to-indigo-400/15 blur-3xl" />
        <div className="ios-liquid-orb-b absolute top-1/3 -right-16 w-72 h-72 rounded-full bg-gradient-to-br from-violet-400/24 via-purple-400/18 to-pink-400/15 blur-3xl" />
        <div className="ios-liquid-orb-a absolute bottom-12 left-8 w-60 h-60 rounded-full bg-gradient-to-tr from-emerald-400/20 via-teal-300/15 to-cyan-400/15 blur-3xl" />
      </div>

      {/* Section 1: Quick Actions (Sale, Party, Khata, Daily Closing) */}
      <div className="relative z-10 space-y-1.5 shrink-0 animate-liquid-in">
        <div className="flex items-center justify-between px-1.5">
          <span className="text-[11px] font-extrabold tracking-wider uppercase text-slate-500/90 dark:text-neutral-400">
            Quick Actions
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {/* 1. Sale (POS & Billing) */}
          <button
            type="button"
            onClick={() => onSelectTab('pos')}
            className="ios-liquid-hero ios-liquid-sheen-layer relative overflow-hidden bg-gradient-to-br from-blue-500/88 via-blue-600/82 to-indigo-700/90 text-white rounded-[22px] px-3 py-2.5 flex items-center gap-2.5 h-[60px] text-left cursor-pointer"
          >
            <div className="absolute -right-5 -bottom-5 w-20 h-20 bg-white/20 rounded-full blur-xl pointer-events-none" />
            <div className="w-9 h-9 rounded-[14px] bg-white/22 border border-white/35 backdrop-blur-md flex items-center justify-center shrink-0 shadow-inner">
              <ShoppingCart className="w-4.5 h-4.5 text-white" />
            </div>
            <div className="min-w-0 flex-1 relative z-10">
              <span className="block text-[13px] font-black leading-tight tracking-tight truncate">
                Sale
              </span>
              <span className="block text-[10px] font-semibold text-blue-50/90 truncate mt-0.5">
                POS &amp; Billing
              </span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-white/75 shrink-0 relative z-10" />
          </button>

          {/* 2. Party (Stock Inward) */}
          <button
            type="button"
            onClick={() => onSelectTab('purchases')}
            className="ios-liquid-glass relative overflow-hidden rounded-[22px] px-3 py-2.5 flex items-center gap-2.5 h-[60px] text-left cursor-pointer"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-amber-400/18 via-transparent to-transparent pointer-events-none" />
            <div className="w-9 h-9 rounded-[14px] bg-gradient-to-br from-amber-400/90 to-orange-500/95 text-white border border-white/40 shadow-md shadow-amber-500/25 flex items-center justify-center shrink-0 relative z-10">
              <Truck className="w-4.5 h-4.5 text-white" />
            </div>
            <div className="min-w-0 flex-1 relative z-10">
              <span className="block text-[13px] font-black text-slate-900 dark:text-white leading-tight tracking-tight truncate">
                Party
              </span>
              <span className="block text-[10px] font-semibold text-slate-600/90 dark:text-neutral-400 truncate mt-0.5">
                Stock Inward
              </span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-amber-600/75 shrink-0 relative z-10" />
          </button>

          {/* 3. Khata (Customer & Party Ledger) */}
          <button
            type="button"
            onClick={() => onSelectTab('khata')}
            className="ios-liquid-glass relative overflow-hidden rounded-[22px] px-3 py-2.5 flex items-center gap-2.5 h-[60px] text-left cursor-pointer"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/18 via-transparent to-transparent pointer-events-none" />
            <div className="w-9 h-9 rounded-[14px] bg-gradient-to-br from-emerald-400/90 to-teal-600/95 text-white border border-white/40 shadow-md shadow-emerald-500/25 flex items-center justify-center shrink-0 relative z-10">
              <BookOpen className="w-4.5 h-4.5 text-white" />
            </div>
            <div className="min-w-0 flex-1 relative z-10">
              <span className="block text-[13px] font-black text-slate-900 dark:text-white leading-tight tracking-tight truncate">
                Khata
              </span>
              <span className="block text-[10px] font-semibold text-slate-600/90 dark:text-neutral-400 truncate mt-0.5">
                Party Ledger
              </span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-emerald-600/75 shrink-0 relative z-10" />
          </button>

          {/* 4. Daily Closing (Cash & Digital Tally) */}
          <button
            type="button"
            onClick={() => onSelectTab('dailyClosing')}
            className="ios-liquid-glass relative overflow-hidden rounded-[22px] px-3 py-2.5 flex items-center gap-2.5 h-[60px] text-left cursor-pointer"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-400/18 via-transparent to-transparent pointer-events-none" />
            <div className="w-9 h-9 rounded-[14px] bg-gradient-to-br from-indigo-400/90 to-purple-600/95 text-white border border-white/40 shadow-md shadow-indigo-500/25 flex items-center justify-center shrink-0 relative z-10">
              <Calculator className="w-4.5 h-4.5 text-white" />
            </div>
            <div className="min-w-0 flex-1 relative z-10">
              <span className="block text-[13px] font-black text-slate-900 dark:text-white leading-tight tracking-tight truncate">
                Daily Closing
              </span>
              <span className="block text-[10px] font-semibold text-slate-600/90 dark:text-neutral-400 truncate mt-0.5">
                Cash &amp; Digital
              </span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-indigo-600/75 shrink-0 relative z-10" />
          </button>
        </div>
      </div>

      {/* Used Mobile Box (Opens full screen inventory view of used mobiles + Add shortcut) */}
      <div className="relative z-10 space-y-1.5 shrink-0 animate-liquid-in animate-stagger-2">
        <div className="flex items-center justify-between px-1.5">
          <span className="text-[11px] font-extrabold tracking-wider uppercase text-slate-500/90 dark:text-neutral-400">
            Used Devices Hub
          </span>
          <button
            type="button"
            onClick={onOpenAddUsedStock}
            className="ios-liquid-glass px-2.5 py-1 rounded-full text-[11px] font-extrabold text-blue-700 dark:text-blue-300 flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3 h-3" /> Add Used Mobile
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenUsedMobiles}
          className="ios-liquid-hero ios-liquid-sheen-layer w-full relative overflow-hidden bg-gradient-to-r from-violet-600/86 via-purple-600/82 to-indigo-700/88 text-white rounded-[22px] p-3 flex items-center justify-between gap-3 cursor-pointer text-left"
        >
          <div className="absolute -right-6 -top-6 w-28 h-28 bg-white/18 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3 min-w-0 relative z-10">
            <div className="w-10 h-10 rounded-[15px] bg-white/20 border border-white/35 backdrop-blur-md flex items-center justify-center shrink-0 shadow-inner">
              <Smartphone className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0 text-left">
              <span className="block text-[13px] font-black leading-tight tracking-tight truncate">
                Used Mobile ({usedTotals.pcs} Pcs · {usedItems.length} Models)
              </span>
              <span className="block text-[10px] font-semibold text-purple-100/95 truncate mt-0.5 tabular-nums">
                {isAdmin
                  ? `Cost: ${currency} ${usedTotals.cost.toLocaleString()} · Sale: ${currency} ${usedTotals.sale.toLocaleString()}`
                  : `Sale Value: ${currency} ${usedTotals.sale.toLocaleString()}`}
              </span>
            </div>
          </div>
          <div className="w-8 h-8 rounded-[12px] bg-white/18 border border-white/25 backdrop-blur-sm flex items-center justify-center shrink-0 relative z-10">
            <ChevronRight className="w-4 h-4 text-white" />
          </div>
        </button>
      </div>

      {/* Section 2: Store Modules */}
      <div className="relative z-10 space-y-1.5 shrink-0">
        <div className="flex items-center justify-between px-1.5">
          <span className="text-[11px] font-extrabold tracking-wider uppercase text-slate-500/90 dark:text-neutral-400">
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
                className={`animate-liquid-in ${staggerClass} ios-liquid-glass relative rounded-[22px] px-3 py-2.5 flex items-center gap-2.5 text-left cursor-pointer h-[60px] overflow-hidden`}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${box.glowTint} pointer-events-none`} />
                <div
                  className={`w-9 h-9 rounded-[14px] ${box.iconGradient} border border-white/40 flex items-center justify-center shrink-0 relative z-10`}
                >
                  <Icon className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0 flex-1 relative z-10">
                  <span className="block text-[13px] font-black text-slate-900 dark:text-white leading-tight tracking-tight truncate">
                    {box.label}
                  </span>
                  <span className="block text-[10px] font-semibold text-slate-600/90 dark:text-neutral-400 leading-tight truncate mt-0.5 tabular-nums">
                    {box.sublabel}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 3: View Dashboard CTA (Admin Only) */}
      {isAdmin && (
        <button
          type="button"
          onClick={() => onSelectTab('dashboard')}
          className="animate-liquid-in animate-stagger-5 ios-liquid-hero ios-liquid-sheen-layer relative z-10 overflow-hidden rounded-[22px] bg-gradient-to-r from-slate-900/88 via-neutral-900/84 to-emerald-950/90 px-3.5 py-2.5 text-white flex items-center justify-between gap-2.5 shrink-0 cursor-pointer h-[60px]"
        >
          <div className="flex items-center gap-3 min-w-0 relative z-10">
            <div className="w-9 h-9 rounded-[14px] bg-emerald-400/22 border border-emerald-300/35 backdrop-blur-md flex items-center justify-center shrink-0 shadow-inner">
              <LayoutDashboard className="w-4.5 h-4.5 text-emerald-300" />
            </div>
            <div className="text-left min-w-0">
              <span className="block text-[13px] font-black leading-tight tracking-tight truncate">
                View Dashboard
              </span>
              <span className="block text-[10px] text-slate-200/90 font-semibold truncate">
                Sales, Profit &amp; Analytics
              </span>
            </div>
          </div>
          <div className="w-8 h-8 rounded-[12px] bg-white/14 border border-white/25 backdrop-blur-sm flex items-center justify-center shrink-0 relative z-10">
            <ChevronRight className="w-4 h-4 text-emerald-300" />
          </div>
        </button>
      )}
    </div>
  );
};
