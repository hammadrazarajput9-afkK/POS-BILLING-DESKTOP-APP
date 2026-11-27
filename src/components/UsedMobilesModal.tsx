import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Search,
  Plus,
  Smartphone,
  Package,
  ChevronRight,
  ArrowLeft,
  Camera,
  LayoutGrid,
  List,
  Eye,
  EyeOff,
  Edit2,
  Wrench,
  ShieldCheck,
  User,
} from 'lucide-react';
import { InventoryItem, MobileVariant, ShopSettings, SupplierPurchase } from '../types';
import { smartFilterAndSort } from '../utils/smartSearch';
import { UsedReceiptModal } from './UsedReceiptModal';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { extractItemImeis, isUsedCategory } from '../utils/imeiManager';

interface UsedMobilesModalProps {
  isOpen: boolean;
  onClose: () => void;
  inventory: InventoryItem[];
  categories?: string[];
  settings: ShopSettings;
  supplierPurchases?: SupplierPurchase[];
  isAdmin?: boolean;
  onOpenAddUsedStock: () => void;
  onEditStockItem: (item: InventoryItem) => void;
}

const isUsedMobileItem = (item: InventoryItem): boolean => {
  if (isUsedCategory(item.category)) return true;
  const name = (item.name || '').toLowerCase();
  return name.includes('used') || name.includes('second hand');
};

const getItemCondition = (item: InventoryItem, variant?: MobileVariant): string => {
  if (variant?.condition && variant.condition.trim()) return variant.condition.trim();
  if (item.condition && item.condition.trim()) return item.condition.trim();
  if (!variant) {
    const varCond = item.variants?.find(v => v.condition && v.condition.trim())?.condition?.trim();
    if (varCond) return varCond;
  }
  return '';
};

const isRepairableEntry = (item: InventoryItem, variant?: MobileVariant): boolean => {
  const cond = getItemCondition(item, variant).toLowerCase();
  const note = (variant ? variant.note || item.note || '' : item.note || '').toLowerCase();
  if (cond === 'repairable' || note.includes('repairable')) return true;
  if (!variant) {
    return (item.variants || []).some(
      v => (v.condition || '').toLowerCase() === 'repairable' || (v.note || '').toLowerCase().includes('repairable')
    );
  }
  return false;
};

interface UsedDisplayEntry {
  entryKey: string;
  item: InventoryItem;
  variant?: MobileVariant;
  variantIdx?: number;
  costPrice: number;
  salePrice: number;
  qty: number;
  condition: string;
  repairable: boolean;
  specs: string;
  imeis: string[];
}

const buildUsedDisplayEntries = (items: InventoryItem[]): UsedDisplayEntry[] => {
  const entries: UsedDisplayEntry[] = [];
  for (const item of items) {
    const vars = item.variants || [];
    if (vars.length > 1) {
      const hasActiveVar = vars.some(v => (Number(v.qty) || 0) > 0);
      vars.forEach((v, idx) => {
        const vQty = Math.max(0, Number(v.qty) || 0);
        if (hasActiveVar && vQty <= 0) return;
        const vCost =
          v.costPrice !== '' && v.costPrice !== undefined && Number(v.costPrice) > 0
            ? Number(v.costPrice)
            : Number(item.costPrice) || 0;
        const vSale =
          v.salePrice !== '' && v.salePrice !== undefined && Number(v.salePrice) > 0
            ? Number(v.salePrice)
            : Number(item.salePrice) || 0;
        const cond = getItemCondition(item, v);
        entries.push({
          entryKey: `${item.id}:::${v.id || idx}`,
          item,
          variant: v,
          variantIdx: idx,
          costPrice: vCost,
          salePrice: vSale,
          qty: vQty,
          condition: cond,
          repairable: isRepairableEntry(item, v),
          specs: [v.ram || item.ram, v.storage || item.storage, v.color || item.color].filter(Boolean).join(' • '),
          imeis: (v.imeis || []).map(s => s.trim()).filter(Boolean),
        });
      });
    } else {
      const singleVar = vars.length === 1 ? vars[0] : undefined;
      const cond = getItemCondition(item, singleVar);
      const vCost =
        singleVar && singleVar.costPrice !== '' && singleVar.costPrice !== undefined && Number(singleVar.costPrice) > 0
          ? Number(singleVar.costPrice)
          : Number(item.costPrice) || 0;
      const vSale =
        singleVar && singleVar.salePrice !== '' && singleVar.salePrice !== undefined && Number(singleVar.salePrice) > 0
          ? Number(singleVar.salePrice)
          : Number(item.salePrice) || 0;
      const singleImeis = singleVar
        ? (singleVar.imeis || []).map(s => s.trim()).filter(Boolean)
        : extractItemImeis(item);
      entries.push({
        entryKey: item.id,
        item,
        variant: singleVar,
        costPrice: vCost,
        salePrice: vSale,
        qty: Math.max(0, Number(item.qty) || 0),
        condition: cond,
        repairable: isRepairableEntry(item, singleVar),
        specs: [
          singleVar?.ram || item.ram,
          singleVar?.storage || item.storage,
          singleVar?.color || item.color,
        ]
          .filter(Boolean)
          .join(' • '),
        imeis: singleImeis.length > 0 ? singleImeis : extractItemImeis(item),
      });
    }
  }
  return entries;
};

export const UsedMobilesModal: React.FC<UsedMobilesModalProps> = ({
  isOpen,
  onClose,
  inventory = [],
  categories = [],
  settings,
  supplierPurchases = [],
  isAdmin = true,
  onOpenAddUsedStock,
  onEditStockItem,
}) => {
  const [search, setSearch] = useState('');
  const [subTab, setSubTab] = useState<'all' | 'repairable' | 'low' | 'archived'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [hideValuation, setHideValuation] = useState(false);
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<{
    item: InventoryItem;
    variant?: MobileVariant;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleHardwareBack = (e: Event) => {
      if (isCameraScannerOpen || selectedReceipt) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('pos-hardware-back', handleHardwareBack);
    return () => window.removeEventListener('pos-hardware-back', handleHardwareBack);
  }, [isOpen, isCameraScannerOpen, selectedReceipt, onClose]);

  const allUsedItems = useMemo(() => {
    return (inventory || []).filter(isUsedMobileItem);
  }, [inventory]);

  const activeUsedItems = useMemo(() => {
    return allUsedItems.filter(i => i.status !== 'ARCHIVED');
  }, [allUsedItems]);

  const activeUsedEntries = useMemo(() => {
    return buildUsedDisplayEntries(activeUsedItems);
  }, [activeUsedItems]);

  const archivedUsedEntries = useMemo(() => {
    return buildUsedDisplayEntries(allUsedItems.filter(i => i.status === 'ARCHIVED'));
  }, [allUsedItems]);

  const repairableCount = useMemo(() => {
    return activeUsedEntries.filter(e => e.qty > 0 && e.repairable).length;
  }, [activeUsedEntries]);

  const lowStockCount = useMemo(() => {
    return activeUsedEntries.filter(e => e.qty <= 1).length;
  }, [activeUsedEntries]);

  const archivedCount = archivedUsedEntries.length;

  const usedCategoryList = useMemo(() => {
    const catSet = new Set<string>();
    categories.forEach(c => {
      if (isUsedCategory(c)) {
        catSet.add(c);
      }
    });
    allUsedItems.forEach(i => {
      if (i.category) catSet.add(i.category);
    });
    return Array.from(catSet);
  }, [categories, allUsedItems]);

  // Top KPI totals across active used stock
  const metrics = useMemo(() => {
    let totalCost = 0;
    let totalSale = 0;
    let totalPcs = 0;

    for (const item of activeUsedItems) {
      if (item.variants && item.variants.length > 0) {
        const varQtySum = item.variants.reduce((s, v) => s + Math.max(0, Number(v.qty) || 0), 0);
        if (varQtySum > 0) {
          totalCost += item.variants.reduce((s, v) => {
            const vCost =
              v.costPrice !== '' && v.costPrice !== undefined && Number(v.costPrice) > 0
                ? Number(v.costPrice)
                : Number(item.costPrice) || 0;
            return s + vCost * Math.max(0, Number(v.qty) || 0);
          }, 0);
          totalSale += item.variants.reduce((s, v) => {
            const vSale =
              v.salePrice !== '' && v.salePrice !== undefined && Number(v.salePrice) > 0
                ? Number(v.salePrice)
                : Number(item.salePrice) || 0;
            return s + vSale * Math.max(0, Number(v.qty) || 0);
          }, 0);
          totalPcs += varQtySum;
          continue;
        }
      }
      const q = Math.max(0, Number(item.qty) || 0);
      totalCost += (Number(item.costPrice) || 0) * q;
      totalSale += (Number(item.salePrice) || 0) * q;
      totalPcs += q;
    }

    const margin = totalSale - totalCost;
    return { totalCost, totalSale, margin, totalPcs };
  }, [activeUsedItems]);

  const filteredEntries = useMemo(() => {
    const source = subTab === 'archived' ? archivedUsedEntries : activeUsedEntries;
    const base = source.filter(entry => {
      if (subTab === 'repairable' && !entry.repairable) return false;
      if (subTab === 'low' && entry.qty > 1) return false;

      if (
        categoryFilter !== 'ALL' &&
        (entry.item.category || '').toLowerCase() !== categoryFilter.toLowerCase()
      ) {
        return false;
      }
      return true;
    });

    if (!search.trim()) return base;

    return smartFilterAndSort(base, search, entry => ({
      primary: [entry.item.name, entry.item.category, entry.condition, entry.specs, entry.item.purchasedFrom],
      secondary: [entry.item.barcode, entry.variant?.note, entry.item.note, ...entry.imeis],
    }));
  }, [subTab, archivedUsedEntries, activeUsedEntries, categoryFilter, search]);

  if (!isOpen) return null;

  const currency = settings.currency || 'Rs';

  return (
    <div className="fixed inset-0 z-50 bg-[var(--theme-app-bg,#f4f7fb)] flex flex-col overflow-hidden animate-liquid-in">
      {/* Ambient Liquid Mesh & Color Blobs behind full-screen sheet */}
      <div className="ios-liquid-canvas print:hidden" aria-hidden="true">
        <div
          className="ios-liquid-orb-a absolute -top-24 -left-20 w-72 h-72 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(125,211,252,0.28) 0%, transparent 72%)' }}
        />
        <div
          className="ios-liquid-orb-b absolute top-1/3 -right-24 w-80 h-80 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(165,180,252,0.24) 0%, transparent 72%)' }}
        />
        <div
          className="ios-liquid-orb-c absolute -bottom-24 left-1/4 w-72 h-72 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(103,232,249,0.22) 0%, transparent 72%)' }}
        />
      </div>

      {/* Main Scrollable Container matching InventoryTab layout */}
      <div className="relative z-10 flex-1 overflow-y-auto px-2.5 sm:px-6 pt-[calc(env(safe-area-inset-top,0px)+0.625rem)] sm:pt-2.5 pb-24 max-w-7xl w-full mx-auto space-y-3">
        {/* Top Blue Header + Overlapping Summary Card (iOS Liquid Glass) */}
        <div>
          <div className="ios-liquid-banner-blue ios-liquid-sheen-layer text-white rounded-2xl pt-3.5 pb-11 px-3.5 sm:px-5">
            {/* Row 1: Back + Title + Add Used Mobile CTA */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 -ml-1 rounded-full hover:bg-white/15 flex items-center justify-center transition cursor-pointer shrink-0"
                  aria-label="Back to home"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="min-w-0">
                  <h2 className="text-lg sm:text-xl font-extrabold tracking-tight truncate flex items-center gap-2">
                    <Smartphone className="w-5 h-5 shrink-0 hidden sm:inline" />
                    Used Mobiles Stock
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={onOpenAddUsedStock}
                  className="px-3 py-1.5 rounded-full bg-white text-blue-700 hover:bg-blue-50 text-[11px] font-black shadow-xs transition cursor-pointer inline-flex items-center gap-1 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Used Mobile</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Row 2: Clean Underline Sub-Tabs */}
            <div className="mt-3.5 flex items-center gap-6 border-b border-white/15 overflow-x-auto no-scrollbar">
              {([
                { id: 'all', label: `All Used (${activeUsedEntries.length})` },
                { id: 'repairable', label: `Repairable (${repairableCount})` },
                { id: 'low', label: `Low Stock (${lowStockCount})` },
                { id: 'archived', label: `Archived (${archivedCount})` },
              ] as const).map(tab => {
                const active = subTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSubTab(tab.id)}
                    className={`pb-2.5 text-[13px] font-bold transition relative cursor-pointer whitespace-nowrap shrink-0 ${
                      active ? 'text-white' : 'text-blue-100/80 hover:text-white'
                    }`}
                  >
                    {tab.label}
                    {active && (
                      <span className="absolute left-0 right-0 bottom-0 h-[3px] rounded-full bg-sky-300" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Overlapping Frosted Valuation Card (Total Cost, Total Sale, Margin, Total Pcs) */}
          <div className="-mt-8 mx-2 sm:mx-4 ios-liquid-surface rounded-2xl px-3.5 py-3 relative z-10">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => setHideValuation(prev => !prev)}
                  className="text-[11px] font-medium text-slate-500 hover:text-slate-700 flex items-center gap-1 cursor-pointer"
                >
                  {hideValuation ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  <span>{hideValuation ? 'Show Valuation' : 'Hide Valuation'}</span>
                </button>
              ) : (
                <span className="text-[11px] font-medium text-slate-500">Used Stock Overview</span>
              )}

              <span className="text-[11px] font-bold text-blue-600 tabular-nums">
                {metrics.totalPcs.toLocaleString()} Pcs · {activeUsedEntries.length} Entries
              </span>
            </div>

            {isAdmin ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 text-center">
                <div className="bg-slate-50/80 border border-slate-200/70 rounded-xl py-2 px-2">
                  <p className="text-sm sm:text-lg font-extrabold text-slate-900 tabular-nums leading-tight">
                    {hideValuation
                      ? `${currency} •••••`
                      : `${currency} ${metrics.totalCost.toLocaleString()}`}
                  </p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">Total Cost</p>
                </div>

                <div className="bg-emerald-50/70 border border-emerald-200/70 rounded-xl py-2 px-2">
                  <p className="text-sm sm:text-lg font-extrabold text-emerald-700 tabular-nums leading-tight">
                    {hideValuation
                      ? `${currency} •••••`
                      : `${currency} ${metrics.totalSale.toLocaleString()}`}
                  </p>
                  <p className="text-[10px] font-bold text-emerald-600 uppercase mt-0.5">Total Sale</p>
                </div>

                <div className="bg-blue-50/70 border border-blue-200/70 rounded-xl py-2 px-2">
                  <p className="text-sm sm:text-lg font-extrabold text-blue-700 tabular-nums leading-tight">
                    {hideValuation
                      ? `${currency} •••••`
                      : `${metrics.margin >= 0 ? '+' : ''}${currency} ${metrics.margin.toLocaleString()}`}
                  </p>
                  <p className="text-[10px] font-bold text-blue-600 uppercase mt-0.5">Est. Margin</p>
                </div>

                <div className="bg-purple-50/70 border border-purple-200/70 rounded-xl py-2 px-2">
                  <p className="text-sm sm:text-lg font-extrabold text-purple-700 tabular-nums leading-tight">
                    {metrics.totalPcs.toLocaleString()} Pcs
                  </p>
                  <p className="text-[10px] font-bold text-purple-600 uppercase mt-0.5">Total Pcs</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-around py-1 text-center">
                <div>
                  <p className="text-lg font-extrabold text-blue-600 tabular-nums">
                    {metrics.totalPcs.toLocaleString()} Pcs
                  </p>
                  <p className="text-[11px] text-slate-500">Total Used Stock</p>
                </div>
                <div className="w-px h-8 bg-slate-200" />
                <div>
                  <p className="text-lg font-extrabold text-emerald-600 tabular-nums">
                    {currency} {metrics.totalSale.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-slate-500">Total Sale Value</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Smart Search + Camera Scan + Cards/Table Switcher */}
        <div className="flex items-center gap-2 px-0.5">
          <div className="relative flex-1 flex items-center">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search Used Model, IMEI, Condition, Seller..."
              className="w-full pl-9 pr-20 h-10 ios-liquid-chip rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 transition"
            />
            <div className="absolute right-1.5 flex items-center gap-1">
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsCameraScannerOpen(true)}
                className="h-7 px-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg flex items-center gap-1 text-[11px] font-bold cursor-pointer transition whitespace-nowrap"
                title="Scan Barcode / IMEI"
              >
                <Camera className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Scan</span>
              </button>
            </div>
          </div>

          {/* View Switcher */}
          <div className="h-10 ios-liquid-chip p-1 rounded-xl inline-flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`h-8 px-2.5 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                viewMode === 'grid' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cards</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`h-8 px-2.5 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                viewMode === 'table' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Table</span>
            </button>
          </div>
        </div>

        {/* Used Category Filter Strip */}
        {usedCategoryList.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar touch-pan-x px-0.5">
            <button
              type="button"
              onClick={() => setCategoryFilter('ALL')}
              className={`shrink-0 px-3 py-1.5 rounded-xl border text-left transition cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap ${
                categoryFilter === 'ALL'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'ios-liquid-chip text-slate-700 hover:bg-white/90'
              }`}
            >
              <span className="text-[11px] font-extrabold">All Used</span>
              <span className={`text-[10px] font-bold tabular-nums ${categoryFilter === 'ALL' ? 'text-blue-100' : 'text-slate-400'}`}>
                {activeUsedEntries.length}
              </span>
            </button>
            {usedCategoryList.map(cat => {
              const count = activeUsedEntries.filter(e => (e.item.category || '').toLowerCase() === cat.toLowerCase()).length;
              const isActive = categoryFilter.toLowerCase() === cat.toLowerCase();
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(isActive ? 'ALL' : cat)}
                  className={`shrink-0 px-3 py-1.5 rounded-xl border text-left transition cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap ${
                    isActive
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'ios-liquid-chip text-slate-700 hover:bg-white/90'
                  }`}
                >
                  <span className="text-[11px] font-extrabold">{cat}</span>
                  <span className={`text-[10px] font-bold tabular-nums ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Inventory Content (Grid Cards or Table) */}
        {filteredEntries.length === 0 ? (
          <div className="ios-liquid-surface rounded-2xl text-center py-14 px-4 space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
              <Smartphone className="w-7 h-7" />
            </div>
            <h3 className="text-base font-extrabold text-slate-900">No Used Mobiles Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Add used mobile stock using "+ Add Used Mobile" — it will automatically select the Used Android category with Condition grades.
            </p>
            <button
              type="button"
              onClick={onOpenAddUsedStock}
              className="mt-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-sm inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Add Used Mobile
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredEntries.map(entry => {
              const { item, variant, variantIdx, costPrice, salePrice, qty, condition, repairable, specs, imeis } = entry;

              return (
                <div
                  key={entry.entryKey}
                  onClick={() => setSelectedReceipt({ item, variant })}
                  className={`ios-liquid-tile rounded-2xl p-3.5 cursor-pointer flex flex-col justify-between gap-2.5 ${
                    repairable
                      ? '!border-rose-300 hover:!border-rose-400'
                      : 'hover:!border-blue-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-13 h-13 rounded-xl object-cover shrink-0 border border-slate-200"
                      />
                    ) : (
                      <div className="w-13 h-13 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <Package className="w-6 h-6" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-1.5">
                        <span className="block text-sm font-black text-slate-900 truncate">
                          {item.name}
                          {variantIdx !== undefined && (
                            <span className="ml-1.5 text-[10px] font-bold text-slate-500">
                              #{variantIdx + 1}
                            </span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            onEditStockItem(item);
                          }}
                          className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-700 flex items-center justify-center shrink-0 cursor-pointer transition"
                          title="Edit used mobile"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200/70 px-1.5 py-0.5 rounded">
                          {item.category}
                        </span>
                        {condition && (
                          <span
                            className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${
                              repairable
                                ? 'bg-rose-50 text-rose-700 border-rose-300'
                                : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}
                          >
                            {repairable ? <Wrench className="w-2.5 h-2.5" /> : <ShieldCheck className="w-2.5 h-2.5" />}
                            {condition}
                          </span>
                        )}
                      </div>

                      {(specs || item.purchasedFrom) && (
                        <div className="text-[11px] text-slate-500 mt-1 truncate flex items-center gap-2">
                          {specs && <span className="font-semibold">{specs}</span>}
                          {item.purchasedFrom && (
                            <span className="inline-flex items-center gap-1 text-slate-600 font-medium truncate">
                              <User className="w-3 h-3 text-slate-400 shrink-0" />
                              {item.purchasedFrom}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 tabular-nums">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Cost Price</span>
                      <span className="text-xs font-extrabold text-slate-800">
                        {hideValuation ? '••••' : `${currency} ${costPrice.toLocaleString()}`}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-emerald-600 block font-semibold">Sale Price</span>
                      <span className="text-xs font-black text-emerald-700">
                        {currency} {salePrice.toLocaleString()}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-blue-600 block font-semibold">Stock</span>
                      <span className="text-xs font-black text-blue-700">
                        {qty} Pcs
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-bold text-blue-600 pt-0.5">
                    <span className="truncate text-slate-500 font-medium">
                      {imeis.length > 0 ? `IMEI: ${imeis[0]}${imeis.length > 1 ? ` +${imeis.length - 1}` : ''}` : 'Tap to open Purchase Slip'}
                    </span>
                    <span className="inline-flex items-center gap-0.5 shrink-0">
                      Slip <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="ios-liquid-surface rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-extrabold uppercase text-slate-500">
                  <tr>
                    <th className="py-2.5 px-3">Mobile</th>
                    <th className="py-2.5 px-3">Condition</th>
                    <th className="py-2.5 px-3 text-right">Cost</th>
                    <th className="py-2.5 px-3 text-right">Sale</th>
                    <th className="py-2.5 px-3 text-right">Qty</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {filteredEntries.map(entry => {
                    const { item, variant, variantIdx, costPrice, salePrice, qty, condition, repairable, specs, imeis } = entry;
                    return (
                      <tr
                        key={entry.entryKey}
                        onClick={() => setSelectedReceipt({ item, variant })}
                        className="hover:bg-blue-50/40 cursor-pointer transition"
                      >
                        <td className="py-2.5 px-3">
                          <div className="font-extrabold text-slate-900">
                            {item.name}
                            {variantIdx !== undefined ? ` #${variantIdx + 1}` : ''}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate max-w-[200px]">
                            {[specs || item.category, imeis[0] ? `#${imeis[0].slice(-6)}` : ''].filter(Boolean).join(' · ')}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          {condition ? (
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                repairable
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : 'bg-amber-50 text-amber-800 border-amber-200'
                              }`}
                            >
                              {condition}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-700">
                          {hideValuation ? '••••' : `${currency} ${costPrice.toLocaleString()}`}
                        </td>
                        <td className="py-2.5 px-3 text-right font-extrabold text-emerald-700">
                          {currency} {salePrice.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-black text-blue-700">
                          {qty}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              onEditStockItem(item);
                            }}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-700 cursor-pointer"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Camera Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isCameraScannerOpen}
        onClose={() => setIsCameraScannerOpen(false)}
        onScan={code => {
          setSearch(code);
          setIsCameraScannerOpen(false);
        }}
        title="Scan Used Mobile IMEI / Barcode"
      />

      {/* Used Receipt Modal (Invoice style without sale price, with Share, Print, Edit) */}
      <UsedReceiptModal
        isOpen={Boolean(selectedReceipt)}
        onClose={() => setSelectedReceipt(null)}
        item={selectedReceipt?.item || null}
        variant={selectedReceipt?.variant || null}
        settings={settings}
        supplierPurchases={supplierPurchases}
        onEditItem={it => {
          setSelectedReceipt(null);
          onEditStockItem(it);
        }}
      />
    </div>
  );
};
