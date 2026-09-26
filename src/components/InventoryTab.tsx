import React, { useState, useMemo } from 'react';
import { InventoryItem, ItemCategory } from '../types';
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
  FileText
} from 'lucide-react';
import { useToast } from './Toast';
import { ConfirmModal } from './ConfirmModal';
import { CategoryModal } from './CategoryModal';

interface InventoryTabProps {
  inventory: InventoryItem[];
  currency: string;
  categories: string[];
  isAdmin?: boolean;
  onOpenAddModal: () => void;
  onOpenEditModal: (item: InventoryItem) => void;
  onDeleteItem: (id: string) => void;
  onAddCategory: (category: string) => void;
  onDeleteCategory: (category: string) => boolean;
  onOpenPdfReport?: () => void;
}

export const InventoryTab: React.FC<InventoryTabProps> = ({
  inventory,
  currency,
  categories,
  isAdmin = true,
  onOpenAddModal,
  onOpenEditModal,
  onDeleteItem,
  onAddCategory,
  onDeleteCategory,
  onOpenPdfReport,
}) => {
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [copiedImei, setCopiedImei] = useState<string | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<InventoryItem | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) {
      return categoryFilter === 'ALL'
        ? inventory
        : inventory.filter(item => item.category === categoryFilter);
    }

    const tokens = q.split(/\s+/).filter(Boolean);

    return inventory.filter(item => {
      const imeiString = [
        item.imei || '',
        ...(item.imeis || []),
      ].join(' ');

      const combinedText = `${item.name} ${item.category} ${item.barcode || ''} ${imeiString}`.toLowerCase();

      // Check that every typed word/token matches in brand, name, category, or IMEI/barcode
      const matchSearch = tokens.every(token => combinedText.includes(token));
      const matchCat = categoryFilter === 'ALL' || item.category === categoryFilter;

      return matchSearch && matchCat;
    });
  }, [inventory, search, categoryFilter]);

  const totalCostValuation = useMemo(() => {
    return inventory.reduce((acc, i) => acc + i.costPrice * i.qty, 0);
  }, [inventory]);

  const totalRetailValuation = useMemo(() => {
    return inventory.reduce((acc, i) => acc + i.salePrice * i.qty, 0);
  }, [inventory]);

  const totalUnits = useMemo(() => {
    return inventory.reduce((acc, i) => acc + i.qty, 0);
  }, [inventory]);

  // Low stock alert: only when a product has 1 single unit remaining (or 0)
  const lowStockCount = useMemo(() => {
    return inventory.filter(i => i.qty <= 1).length;
  }, [inventory]);

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

    const headers = ['ID', 'Product Name', 'Category', 'IMEI', 'Cost Price', 'Sale Price', 'Stock Qty'];
    const rows = inventory.map(i => [
      i.id,
      `"${i.name}"`,
      `"${i.category}"`,
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
    <div className="space-y-6">
      {/* Metric Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4.5 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Total Capital Invested
          </span>
          <h3 className="text-xl font-extrabold text-slate-900 font-mono tabular-nums mt-1">
            {currency} {totalCostValuation.toLocaleString()}
          </h3>
          <p className="text-xs text-slate-400 mt-1">Stock cost valuation</p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-4.5 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Expected Retail Revenue
          </span>
          <h3 className="text-xl font-extrabold text-emerald-600 font-mono tabular-nums mt-1">
            {currency} {totalRetailValuation.toLocaleString()}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Potential margin: +{currency} {(totalRetailValuation - totalCostValuation).toLocaleString()}
          </p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-4.5 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Total In-Stock Units
          </span>
          <h3 className="text-xl font-extrabold text-slate-900 font-mono tabular-nums mt-1">
            {totalUnits.toLocaleString()} Units
          </h3>
          <p className="text-xs text-slate-400 mt-1">Across {inventory.length} distinct items</p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-4.5 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Single Unit Low Stock Alert
          </span>
          <h3 className="text-xl font-extrabold text-rose-600 font-mono tabular-nums mt-1">
            {lowStockCount} Items
          </h3>
          <p className="text-xs text-slate-400 mt-1">Products with $\le$ 1 single unit remaining</p>
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
          <div className="flex items-center gap-2">
            {onOpenPdfReport && (
              <button
                type="button"
                onClick={onOpenPdfReport}
                className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200/80 transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="Export Stock Valuation & Low Stock PDF Report"
              >
                <FileText className="w-3.5 h-3.5 text-rose-600" /> Export PDF Report
              </button>
            )}
            <button
              onClick={handleExportCSV}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
            <button
              type="button"
              onClick={() => setIsCategoryModalOpen(true)}
              className="px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs rounded-xl border border-purple-200/60 transition flex items-center gap-1.5 cursor-pointer"
            >
              <Tag className="w-3.5 h-3.5" /> Manage Categories
            </button>
            <button
              onClick={onOpenAddModal}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Add Product
            </button>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by Brand (e.g. Samsung, Infinix), Category, Model, IMEI or Barcode..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-blue-600 focus:bg-white transition"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl px-3 py-2 outline-none focus:border-blue-600"
          >
            <option value="ALL">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Inventory Data Table */}
        <div className="border border-slate-200/80 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="p-3">Product Name</th>
                  <th className="p-3">Category</th>
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
                    <td colSpan={7} className="text-center py-12 text-slate-400">
                      <Package className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      <p className="font-semibold text-slate-700">No matching products found</p>
                      <p className="text-[11px] text-slate-400">Try adjusting your search query or category filter</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50/60 transition">
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
                        {currency} {item.costPrice.toLocaleString()}
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
                              title="Delete Product"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
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
                  ))
                )}
              </tbody>
            </table>
          </div>
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

      {/* Reliable In-App Confirmation Modal for Product Deletion */}
      <ConfirmModal
        isOpen={!!productToDelete}
        onClose={() => setProductToDelete(null)}
        onConfirm={() => {
          if (productToDelete) {
            onDeleteItem(productToDelete.id);
            showToast(`Product "${productToDelete.name}" deleted`, 'info');
            setProductToDelete(null);
          }
        }}
        title="Delete Product from Inventory?"
        message={`Are you sure you want to remove "${productToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete Product"
      />
    </div>
  );
};
