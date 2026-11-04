import React, { useState, useMemo } from 'react';
import { InventoryItem, ItemCategory, StockAdjustment, SaleRecord } from '../types';
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  Copy,
  Check,
  Download,
  Package,
  Layers,
  DollarSign,
  AlertTriangle,
  Tag,
  Lock,
  FileText,
  Archive,
  RotateCcw,
  History,
  X,
  Clock,
  UserCheck,
  Camera
} from 'lucide-react';
import { useToast } from './Toast';
import { ConfirmModal } from './ConfirmModal';
import { CategoryModal } from './CategoryModal';
import { BarcodeScannerModal } from './BarcodeScannerModal';

interface InventoryTabProps {
  inventory: InventoryItem[];
  currency: string;
  categories: string[];
  stockAdjustments?: StockAdjustment[];
  sales?: SaleRecord[];
  isAdmin?: boolean;
  onOpenAddModal: () => void;
  onOpenEditModal: (item: InventoryItem) => void;
  onDeleteItem: (id: string) => void;
  onRestoreItem?: (id: string) => void;
  onAddCategory: (category: string) => void;
  onDeleteCategory: (category: string) => boolean;
  onOpenPdfReport?: () => void;
}

const InventoryTabComponent: React.FC<InventoryTabProps> = ({
  inventory,
  currency,
  categories,
  stockAdjustments = [],
  sales = [],
  isAdmin = true,
  onOpenAddModal,
  onOpenEditModal,
  onDeleteItem,
  onRestoreItem,
  onAddCategory,
  onDeleteCategory,
  onOpenPdfReport,
}) => {
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'ARCHIVED' | 'ALL'>('ALL');
  const [copiedImei, setCopiedImei] = useState<string | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isAdjustmentsModalOpen, setIsAdjustmentsModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<InventoryItem | null>(null);
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);

  // Check if a product is referenced in historical sales
  const isProductReferenced = (itemId: string): boolean => {
    return sales.some(s => s.items.some(i => i.id === itemId));
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();

    return inventory.filter(item => {
      // Status Filter
      if (statusFilter === 'ACTIVE' && item.status === 'ARCHIVED') return false;
      if (statusFilter === 'ARCHIVED' && item.status !== 'ARCHIVED') return false;

      // Category Filter
      if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;

      // Search Query
      if (!q) return true;

      const tokens = q.split(/\s+/).filter(Boolean);
      const imeiString = [
        item.imei || '',
        ...(item.imeis || []),
      ].join(' ');

      const combinedText = `${item.name} ${item.category} ${item.barcode || ''} ${imeiString}`.toLowerCase();
      return tokens.every(token => combinedText.includes(token));
    });
  }, [inventory, search, categoryFilter, statusFilter]);

  const activeItems = useMemo(() => {
    return inventory.filter(i => i.status !== 'ARCHIVED');
  }, [inventory]);

  const totalCostValuation = useMemo(() => {
    return activeItems.reduce((acc, i) => acc + i.costPrice * i.qty, 0);
  }, [activeItems]);

  const totalRetailValuation = useMemo(() => {
    return activeItems.reduce((acc, i) => acc + i.salePrice * i.qty, 0);
  }, [activeItems]);

  const totalUnits = useMemo(() => {
    return activeItems.reduce((acc, i) => acc + i.qty, 0);
  }, [activeItems]);

  // Low stock alert: only when an active product has 1 single unit remaining (or 0)
  const lowStockCount = useMemo(() => {
    return activeItems.filter(i => i.qty <= 1).length;
  }, [activeItems]);

  const handleCopyImei = (imei: string) => {
    navigator.clipboard.writeText(imei);
    setCopiedImei(imei);
    showToast(`IMEI ${imei} copied to clipboard`, 'info');
    setTimeout(() => setCopiedImei(null), 2000);
  };

  const handleExportCSV = () => {
    if (inventory.length === 0) {
      showToast('No inventory to export', 'warning');
      return;
    }

    const headers = ['ID', 'Product Name', 'Category', 'Status', 'IMEI', 'Cost Price', 'Sale Price', 'Stock Qty'];
    const rows = inventory.map(i => [
      i.id,
      `"${i.name}"`,
      `"${i.category}"`,
      i.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
      i.imei || '',
      i.costPrice,
      i.salePrice,
      i.qty,
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory_stock_${new Date().toISOString().substring(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Inventory exported to CSV', 'success');
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Metric Highlights */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
        <div className="bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-2.5 sm:p-4.5 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 line-clamp-1">
            Total Capital Invested
          </span>
          <h3 className="text-sm sm:text-xl font-extrabold text-slate-900 font-mono tabular-nums mt-0.5 sm:mt-1 truncate">
            {isAdmin ? `${currency} ${totalCostValuation.toLocaleString()}` : '••••••'}
          </h3>
          <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 sm:mt-1 truncate">
            {isAdmin ? 'Stock cost valuation' : 'Restricted (Admin)'}
          </p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-2.5 sm:p-4.5 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 line-clamp-1">
            Expected Retail Revenue
          </span>
          <h3 className="text-sm sm:text-xl font-extrabold text-emerald-600 font-mono tabular-nums mt-0.5 sm:mt-1 truncate">
            {currency} {totalRetailValuation.toLocaleString()}
          </h3>
          <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 sm:mt-1 truncate">
            Margin: +{currency} {(totalRetailValuation - totalCostValuation).toLocaleString()}
          </p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-2.5 sm:p-4.5 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 line-clamp-1">
            Total In-Stock Units
          </span>
          <h3 className="text-sm sm:text-xl font-extrabold text-slate-900 font-mono tabular-nums mt-0.5 sm:mt-1 truncate">
            {totalUnits.toLocaleString()} Units
          </h3>
          <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 sm:mt-1 truncate">Across {inventory.length} items</p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-2.5 sm:p-4.5 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 line-clamp-1">
            Low Stock Alert
          </span>
          <h3 className="text-sm sm:text-xl font-extrabold text-rose-600 font-mono tabular-nums mt-0.5 sm:mt-1 truncate">
            {lowStockCount} Items
          </h3>
          <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 sm:mt-1 truncate">≤ 1 unit remaining</p>
        </div>
      </div>

      {/* Main Stock Table Container */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-bold text-slate-900 text-base">Inventory & IMEI Master Stock</h3>
            <p className="text-xs text-slate-500">
              Manage mobile phones, serial numbers, chargers, displays, and screen protectors
            </p>
          </div>
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setIsAdjustmentsModalOpen(true)}
              className="flex-1 sm:flex-initial px-3 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs rounded-xl border border-amber-200/80 transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs min-h-[42px]"
              title="View Manual Stock Quantity Adjustment History"
            >
              <History className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="truncate">Stock Log</span>
              {stockAdjustments.length > 0 && (
                <span className="bg-amber-200 text-amber-900 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                  {stockAdjustments.length}
                </span>
              )}
            </button>
            {onOpenPdfReport && (
              <button
                type="button"
                onClick={onOpenPdfReport}
                className="flex-1 sm:flex-initial px-3.5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200/80 transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs min-h-[42px]"
                title="Export Stock Valuation & Low Stock PDF Report"
              >
                <FileText className="w-3.5 h-3.5 text-rose-600 shrink-0" /> Export PDF
              </button>
            )}
            <button
              onClick={handleExportCSV}
              className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer min-h-[42px]"
            >
              <Download className="w-3.5 h-3.5 shrink-0" /> CSV
            </button>
            <button
              type="button"
              onClick={() => setIsCategoryModalOpen(true)}
              className="px-3.5 py-2.5 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs rounded-xl border border-purple-200/60 transition flex items-center justify-center gap-1.5 cursor-pointer min-h-[42px]"
            >
              <Tag className="w-3.5 h-3.5 shrink-0" /> Categories
            </button>
            <button
              onClick={onOpenAddModal}
              className="w-full sm:w-auto px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-md shadow-blue-500/20 transition flex items-center justify-center gap-1.5 cursor-pointer min-h-[44px]"
            >
              <Plus className="w-4 h-4 shrink-0" /> Add Product
            </button>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 flex items-center">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by Brand, Category, Model, IMEI or Barcode..."
              className="w-full pl-10 pr-24 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-blue-600 focus:bg-white transition min-h-[44px]"
            />
            <div className="absolute right-1.5 flex items-center gap-1">
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsCameraScannerOpen(true)}
                className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs flex items-center gap-1 text-[11px] font-extrabold cursor-pointer transition min-h-[34px]"
                title="Live Camera Barcode Scanner"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Scan</span>
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl px-3 py-2 outline-none focus:border-blue-600 cursor-pointer"
            >
              <option value="ALL">All Statuses (Active & Archived)</option>
              <option value="ACTIVE">Active Stock Only</option>
              <option value="ARCHIVED">Archived / Discontinued</option>
            </select>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl px-3 py-2 outline-none focus:border-blue-600 cursor-pointer"
            >
              <option value="ALL">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Desktop Inventory Data Table (>= lg: breakpoint) */}
        <div className="hidden lg:block border border-slate-200/80 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="p-3">Product Name</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">IMEI / Barcode</th>
                  <th className="p-3 text-right">Cost Price</th>
                  <th className="p-3 text-right">Sale Price</th>
                  <th className="p-3 text-center">In Stock</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-400">
                      <Package className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      <p className="font-semibold text-slate-700">No matching products found</p>
                      <p className="text-[11px] text-slate-400">Try adjusting your search query or category filter</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map(item => {
                    const isArchived = item.status === 'ARCHIVED';

                    return (
                      <tr key={item.id} className={`transition ${isArchived ? 'bg-slate-50/70 opacity-75' : 'hover:bg-slate-50/60'}`}>
                        <td className="p-3 font-semibold text-slate-900">
                          <div className="flex items-center gap-2.5">
                            {item.image ? (
                              <div className="w-9 h-9 rounded-lg border border-slate-200 overflow-hidden bg-slate-50 shrink-0 shadow-2xs">
                                <img
                                  src={item.image}
                                  alt={item.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ) : (
                              <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 font-bold shrink-0 text-xs">
                                {item.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <p className="font-bold text-slate-900 leading-snug">{item.name}</p>
                              <span className="text-[10px] text-slate-400 font-mono">ID: {item.id}</span>
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="inline-block px-2 py-0.5 rounded-md font-medium text-[11px] bg-slate-100 text-slate-700">
                            {item.category}
                          </span>
                        </td>
                        <td className="p-3">
                          {isArchived ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                              <Archive className="w-3 h-3 text-slate-500" /> Archived
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                              Active
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          {item.imeis && item.imeis.length > 0 ? (
                            <div className="space-y-0.5">
                              {item.imeis.slice(0, 2).map((im, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center gap-1.5 font-mono text-[11px] text-blue-700"
                                >
                                  <span>{im}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyImei(im)}
                                    className="text-slate-400 hover:text-blue-600 p-0.5 rounded cursor-pointer"
                                    title="Copy IMEI"
                                  >
                                    {copiedImei === im ? (
                                      <Check className="w-3 h-3 text-emerald-600" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>
                                </div>
                              ))}
                              {item.imeis.length > 2 && (
                                <p className="text-[9px] text-blue-600 font-semibold">
                                  +{item.imeis.length - 2} more IMEIs
                                </p>
                              )}
                            </div>
                          ) : item.imei ? (
                            <div className="flex items-center gap-1.5 font-mono text-[11px] text-blue-700">
                              <span>{item.imei}</span>
                              <button
                                type="button"
                                onClick={() => handleCopyImei(item.imei!)}
                                className="text-slate-400 hover:text-blue-600 p-0.5 rounded cursor-pointer"
                                title="Copy IMEI"
                              >
                                {copiedImei === item.imei ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          ) : item.barcode ? (
                            <span className="font-mono text-[11px] text-slate-500">{item.barcode}</span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">--</span>
                          )}
                        </td>
                        <td className="p-3 text-right font-mono tabular-nums text-slate-600 font-medium">
                          {isAdmin ? `${currency} ${item.costPrice.toLocaleString()}` : '••••'}
                        </td>
                        <td className="p-3 text-right font-mono tabular-nums font-bold text-slate-900">
                          {currency} {item.salePrice.toLocaleString()}
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`font-mono font-bold text-xs px-2.5 py-0.5 rounded-full ${
                              item.qty > 1
                                ? 'bg-emerald-50 text-emerald-700'
                                : item.qty === 1
                                ? 'bg-amber-100 text-amber-800 font-extrabold border border-amber-300'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {item.qty === 1 ? '1 (Single Left)' : item.qty}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          {isAdmin ? (
                            <div className="inline-flex items-center gap-1">
                              {isArchived ? (
                                <button
                                  type="button"
                                  onClick={() => onRestoreItem && onRestoreItem(item.id)}
                                  className="px-2 py-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition flex items-center gap-1 cursor-pointer"
                                  title="Restore / Unarchive Product"
                                >
                                  <RotateCcw className="w-3 h-3" /> Restore
                                </button>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => onOpenEditModal(item)}
                                    className="p-1 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                                    title="Edit Product"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setProductToDelete(item)}
                                    className="p-1 text-slate-500 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                                    title="Delete / Archive Product"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] text-slate-400 font-semibold bg-slate-100 px-2 py-0.5 rounded-md cursor-not-allowed"
                              title="Editing and deletion locked in Salesman mode"
                            >
                              <Lock className="w-3 h-3 text-slate-400" />
                              Locked
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile Product Cards View (< lg: breakpoint) */}
        <div className="block lg:hidden space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-10 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-400 space-y-1">
              <Package className="w-8 h-8 mx-auto text-slate-300" />
              <p className="font-semibold text-slate-700">No matching products found</p>
              <p className="text-[11px] text-slate-400">Try adjusting your search query</p>
            </div>
          ) : (
            filtered.map(item => {
              const isArchived = item.status === 'ARCHIVED';

              return (
                <div
                  key={item.id}
                  className={`bg-white border rounded-2xl p-3.5 space-y-3 shadow-xs transition ${
                    isArchived ? 'border-slate-200 opacity-70 bg-slate-50' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {item.image ? (
                      <div className="w-12 h-12 rounded-xl border border-slate-200 overflow-hidden bg-slate-50 shrink-0 shadow-2xs">
                        <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 font-bold shrink-0 text-sm">
                        {item.name.charAt(0).toUpperCase()}
                      </div>
                    )}

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-start justify-between gap-1.5">
                        <h4 className="font-bold text-slate-900 text-xs leading-snug line-clamp-2">
                          {item.name}
                        </h4>
                        <span
                          className={`font-mono font-bold text-[10px] px-2 py-0.5 rounded-full shrink-0 ${
                            item.qty > 1
                              ? 'bg-emerald-50 text-emerald-700'
                              : item.qty === 1
                              ? 'bg-amber-100 text-amber-800 font-extrabold border border-amber-300'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {item.qty > 0 ? `${item.qty} in stock` : 'Out of stock'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1 text-[10px]">
                        <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                          {item.category}
                        </span>
                        {isArchived ? (
                          <span className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-bold">
                            Archived
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* Price & IMEI row */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Sale Price</span>
                      <span className="font-extrabold text-blue-600 text-sm font-mono tabular-nums">
                        {currency} {item.salePrice.toLocaleString()}
                      </span>
                      {isAdmin && (
                        <span className="text-[10px] text-slate-400 font-mono block">
                          Cost: {currency} {item.costPrice.toLocaleString()}
                        </span>
                      )}
                    </div>

                    {/* Touch-Friendly Action Buttons */}
                    <div className="flex items-center gap-1.5">
                      {isAdmin && (
                        <>
                          {isArchived ? (
                            <button
                              type="button"
                              onClick={() => onRestoreItem && onRestoreItem(item.id)}
                              className="px-3 py-2 bg-emerald-50 text-emerald-700 font-bold rounded-xl text-xs border border-emerald-200 transition flex items-center gap-1 min-h-[44px] cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" /> Restore
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => onOpenEditModal(item)}
                                className="px-3.5 py-2 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-600 font-bold rounded-xl text-xs border border-slate-200 transition flex items-center gap-1.5 min-h-[44px] cursor-pointer"
                              >
                                <Edit2 className="w-3.5 h-3.5" /> Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setProductToDelete(item)}
                                className="p-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl transition border border-rose-200 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* IMEI Barcode pills on mobile */}
                  {item.imeis && item.imeis.length > 0 ? (
                    <div className="pt-1.5 border-t border-slate-100 flex flex-wrap items-center gap-1">
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">IMEIs:</span>
                      {item.imeis.slice(0, 3).map((im, idx) => (
                        <span
                          key={idx}
                          onClick={() => handleCopyImei(im)}
                          className="font-mono text-[9px] text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded cursor-pointer"
                        >
                          {im}
                        </span>
                      ))}
                      {item.imeis.length > 3 && (
                        <span className="text-[9px] text-blue-600 font-semibold font-mono">
                          +{item.imeis.length - 3} more
                        </span>
                      )}
                    </div>
                  ) : item.imei ? (
                    <div className="pt-1.5 border-t border-slate-100 flex items-center gap-1 text-[10px] font-mono text-blue-700">
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">IMEI:</span>
                      <span
                        onClick={() => handleCopyImei(item.imei!)}
                        className="bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded cursor-pointer"
                      >
                        {item.imei}
                      </span>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Category Management Modal with Data Safety Lock */}
      <CategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        categories={categories}
        inventory={inventory}
        onAddCategory={onAddCategory}
        onDeleteCategory={onDeleteCategory}
      />

      {/* Stock Adjustments Audit History Modal */}
      {isAdjustmentsModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl space-y-4 border border-slate-100 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
                  <History className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">
                    Stock Quantity Adjustment Audit Log
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Chronological audit history of all manual quantity modifications
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAdjustmentsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {stockAdjustments.length === 0 ? (
                <div className="text-center py-12 text-slate-400 space-y-2">
                  <Clock className="w-8 h-8 mx-auto text-slate-300" />
                  <p className="font-semibold text-slate-600 text-xs">No manual stock adjustments recorded yet</p>
                  <p className="text-[11px] text-slate-400">
                    Adjustments made during inventory updates (damaged, lost, correction) will appear here.
                  </p>
                </div>
              ) : (
                stockAdjustments.map((adj, idx) => (
                  <div
                    key={adj.id || idx}
                    className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{adj.productName}</span>
                      <span
                        className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                          adj.difference > 0
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {adj.difference > 0 ? `+${adj.difference}` : adj.difference} Units
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      <span className="font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                        Reason: {adj.reason}
                      </span>
                      <span>
                        Previous: <strong>{adj.previousQty}</strong> $\rightarrow$ New: <strong>{adj.newQty}</strong>
                      </span>
                      <span>•</span>
                      <span>By: {adj.adjustedBy || 'Admin'}</span>
                      <span>•</span>
                      <span>{new Date(adj.adjustedAt).toLocaleString()}</span>
                    </div>

                    {adj.notes && (
                      <p className="text-[11px] text-slate-600 italic bg-white p-1.5 rounded border border-slate-200/60">
                        Note: {adj.notes}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setIsAdjustmentsModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Close Log
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reliable In-App Confirmation Modal for Product Deletion or Archiving */}
      <ConfirmModal
        isOpen={!!productToDelete}
        onClose={() => setProductToDelete(null)}
        onConfirm={() => {
          if (productToDelete) {
            onDeleteItem(productToDelete.id);
            const isRef = isProductReferenced(productToDelete.id);
            if (isRef) {
              showToast(`Product "${productToDelete.name}" archived safely to preserve sales & invoices`, 'info');
            } else {
              showToast(`Product "${productToDelete.name}" removed`, 'info');
            }
            setProductToDelete(null);
          }
        }}
        title={
          productToDelete && isProductReferenced(productToDelete.id)
            ? 'Archive Product (Historical Records Protected)'
            : 'Delete Product from Inventory?'
        }
        message={
          productToDelete && isProductReferenced(productToDelete.id)
            ? `"${productToDelete.name}" is referenced in past sales invoices or ledger transactions. To prevent breaking historical invoices, profit calculations, and audit reports, this product will be safely ARCHIVED instead of permanently deleted.`
            : `Are you sure you want to remove "${productToDelete?.name}"? This product has no past sales and will be removed.`
        }
        confirmText={
          productToDelete && isProductReferenced(productToDelete.id)
            ? 'Archive Product'
            : 'Delete Product'
        }
      />

      {/* Live Camera Barcode & IMEI Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isCameraScannerOpen}
        onClose={() => setIsCameraScannerOpen(false)}
        title="Scan Barcode / IMEI to Search Inventory"
        onScan={code => {
          setSearch(code);
          showToast(`Searched Code: ${code}`, 'success');
        }}
      />
    </div>
  );
};

export const InventoryTab = React.memo(InventoryTabComponent);
