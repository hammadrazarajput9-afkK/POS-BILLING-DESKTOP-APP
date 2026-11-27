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
import { InventoryItem, ShopSettings, SupplierPurchase } from '../types';
import { smartFilterAndSort } from '../utils/smartSearch';
import { UsedReceiptModal } from './UsedReceiptModal';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { extractItemImeis } from '../utils/imeiManager';

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
};

const getItemCondition = (item: InventoryItem): string => {
  if (item.condition && item.condition.trim()) return item.condition.trim();
  const varCond = item.variants?.find(v => v.condition && v.condition.trim())?.condition?.trim();
  if (varCond) return varCond;
  return '';
};

const isRepairableItem = (item: InventoryItem): boolean => {
  const cond = getItemCondition(item).toLowerCase();
  const note = (item.note || '').toLowerCase();
  const varRepairable = (item.variants || []).some(
    v => (v.condition || '').toLowerCase() === 'repairable' || (v.note || '').toLowerCase().includes('repairable')
  );
  return cond === 'repairable' || note.includes('repairable') || varRepairable;
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
  const [selectedReceiptItem, setSelectedReceiptItem] = useState<InventoryItem | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleHardwareBack = (e: Event) => {
      if (isCameraScannerOpen || selectedReceiptItem) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('pos-hardware-back', handleHardwareBack);
    return () => window.removeEventListener('pos-hardware-back', handleHardwareBack);
  }, [isOpen, isCameraScannerOpen, selectedReceiptItem, onClose]);

  const allUsedItems = useMemo(() => {
    return (inventory || []).filter(isUsedMobileItem);
  }, [inventory]);

  const activeUsedItems = useMemo(() => {
    return allUsedItems.filter(i => i.status !== 'ARCHIVED');
  }, [allUsedItems]);

  const repairableCount = useMemo(() => {
    return activeUsedItems.filter(i => i.qty > 0 && isRepairableItem(i)).length;
  }, [activeUsedItems]);

  const lowStockCount = useMemo(() => {
    return activeUsedItems.filter(i => i.qty <= 1).length;
  }, [activeUsedItems]);

  const archivedCount = useMemo(() => {
    return allUsedItems.filter(i => i.status === 'ARCHIVED').length;
  }, [allUsedItems]);

  const usedCategoryList = useMemo(() => {
    const catSet = new Set<string>();
    categories.forEach(c => {
      const low = c.toLowerCase();
      if (low.includes('used') || low.includes('second') || low.includes('pre-owned') || low.includes('refurbished')) {
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
        const varQtySum = item.variants.reduce((s, v) => s + (Number(v.qty) || 0), 0);
        if (varQtySum > 0) {
          totalCost += item.variants.reduce((s, v) => {
            const vCost =
              v.costPrice !== '' && v.costPrice !== undefined && Number(v.costPrice) > 0
                ? Number(v.costPrice)
                : item.costPrice || 0;
            return s + vCost * (Number(v.qty) || 0);
          }, 0);
          totalSale += item.variants.reduce((s, v) => {
            const vSale =
              v.salePrice !== '' && v.salePrice !== undefined && Number(v.salePrice) > 0
                ? Number(v.salePrice)
                : item.salePrice || 0;
            return s + vSale * (Number(v.qty) || 0);
          }, 0);
          totalPcs += Number(item.qty) || varQtySum;
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

  const filteredItems = useMemo(() => {
    const base = allUsedItems.filter(item => {
      if (subTab === 'archived') {
        if (item.status !== 'ARCHIVED') return false;
      } else {
        if (item.status === 'ARCHIVED') return false;
        if (subTab === 'repairable' && !isRepairableItem(item)) return false;
        if (subTab === 'low' && item.qty > 1) return false;
      }

      if (categoryFilter !== 'ALL' && (item.category || '').toLowerCase() !== categoryFilter.toLowerCase()) {
        return false;
      }
      return true;
    });

    if (!search.trim()) return base;

    return smartFilterAndSort(base, search, item => ({
      primary: [item.name, item.category, getItemCondition(item), item.purchasedFrom],
      secondary: [item.barcode, item.note, ...extractItemImeis(item)],
    }));
  }, [allUsedItems, subTab, categoryFilter, search]);

  if (!isOpen) return null;

  const currency = settings.currency || 'Rs';

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col overflow-hidden animate-in fade-in duration-150">
      {/* Main Scrollable Container matching InventoryTab layout */}
      <div className="flex-1 overflow-y-auto px-2.5 sm:px-6 pt-2.5 pb-24 max-w-7xl w-full mx-auto space-y-3">
        {/* Top Blue Header + Overlapping Summary Card (Exact InventoryTab Design) */}
        <div>
          <div className="bg-blue-600 text-white rounded-2xl shadow-sm pt-3.5 pb-11 px-3.5 sm:px-5">
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
                { id: 'all', label: `All Used (${activeUsedItems.length})` },
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

          {/* Overlapping White Valuation Card (Total Cost, Total Sale, Margin, Total Pcs) */}
          <div className="-mt-8 mx-2 sm:mx-4 bg-white rounded-2xl border border-slate-200/90 shadow-sm px-3.5 py-3">
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
                {metrics.totalPcs.toLocaleString()} Pcs · {activeUsedItems.length} Models
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
              className="w-full pl-9 pr-20 h-10 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 shadow-2xs transition"
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
          <div className="h-10 bg-white border border-slate-200 p-1 rounded-xl inline-flex items-center gap-0.5 shadow-2xs shrink-0">
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
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
              }`}
            >
              <span className="text-[11px] font-extrabold">All Used</span>
              <span className={`text-[10px] font-bold tabular-nums ${categoryFilter === 'ALL' ? 'text-blue-100' : 'text-slate-400'}`}>
                {activeUsedItems.length}
              </span>
            </button>
            {usedCategoryList.map(cat => {
              const count = activeUsedItems.filter(i => (i.category || '').toLowerCase() === cat.toLowerCase()).length;
              const isActive = categoryFilter.toLowerCase() === cat.toLowerCase();
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(isActive ? 'ALL' : cat)}
                  className={`shrink-0 px-3 py-1.5 rounded-xl border text-left transition cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap ${
                    isActive
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
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
        {filteredItems.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl text-center py-14 px-4 space-y-3 shadow-2xs">
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
            {filteredItems.map(item => {
              const cond = getItemCondition(item);
              const repairable = isRepairableItem(item);
              const itemImeis = extractItemImeis(item);
              const specs = [item.ram, item.storage, item.color].filter(Boolean).join(' • ');

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedReceiptItem(item)}
                  className={`bg-white border rounded-2xl p-3.5 shadow-2xs hover:shadow-md transition cursor-pointer flex flex-col justify-between gap-2.5 ${
                    repairable
                      ? 'border-rose-300 hover:border-rose-400'
                      : 'border-slate-200/90 hover:border-blue-300'
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
                        {cond && (
                          <span
                            className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${
                              repairable
                                ? 'bg-rose-50 text-rose-700 border-rose-300'
                                : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}
                          >
                            {repairable ? <Wrench className="w-2.5 h-2.5" /> : <ShieldCheck className="w-2.5 h-2.5" />}
                            {cond}
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
                        {hideValuation ? '••••' : `${currency} ${(item.costPrice || 0).toLocaleString()}`}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-emerald-600 block font-semibold">Sale Price</span>
                      <span className="text-xs font-black text-emerald-700">
                        {currency} {(item.salePrice || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-blue-600 block font-semibold">Stock</span>
                      <span className="text-xs font-black text-blue-700">
                        {item.qty} Pcs
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-bold text-blue-600 pt-0.5">
                    <span className="truncate text-slate-500 font-medium">
                      {itemImeis.length > 0 ? `IMEI: ${itemImeis[0]}${itemImeis.length > 1 ? ` +${itemImeis.length - 1}` : ''}` : 'Tap to open Purchase Slip'}
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
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
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
                  {filteredItems.map(item => {
                    const cond = getItemCondition(item);
                    const repairable = isRepairableItem(item);
                    return (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedReceiptItem(item)}
                        className="hover:bg-blue-50/40 cursor-pointer transition"
                      >
                        <td className="py-2.5 px-3">
                          <div className="font-extrabold text-slate-900">{item.name}</div>
                          <div className="text-[10px] text-slate-500">{item.category}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          {cond ? (
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                repairable
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : 'bg-amber-50 text-amber-800 border-amber-200'
                              }`}
                            >
                              {cond}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-700">
                          {hideValuation ? '••••' : `${currency} ${(item.costPrice || 0).toLocaleString()}`}
                        </td>
                        <td className="py-2.5 px-3 text-right font-extrabold text-emerald-700">
                          {currency} {(item.salePrice || 0).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-black text-blue-700">
                          {item.qty}
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
        isOpen={Boolean(selectedReceiptItem)}
        onClose={() => setSelectedReceiptItem(null)}
        item={selectedReceiptItem}
        settings={settings}
        supplierPurchases={supplierPurchases}
        onEditItem={it => {
          setSelectedReceiptItem(null);
          onEditStockItem(it);
        }}
      />
    </div>
  );
};
