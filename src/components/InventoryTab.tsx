import React, { useState, useMemo } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { InventoryItem, ItemCategory, StockAdjustment, SaleRecord, MobileVariant } from '../types';
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
  Camera,
  LayoutGrid,
  List,
  Share2
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
  onPermanentDeleteItem?: (id: string) => void;
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
  onPermanentDeleteItem,
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
  const [productToPermanentDelete, setProductToPermanentDelete] = useState<InventoryItem | null>(null);
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);

  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [selectedProductPopup, setSelectedProductPopup] = useState<InventoryItem | null>(null);

  const handleWhatsAppShareProduct = (item: InventoryItem) => {
    const shopName = 'FMZ Friends Mobile Zone';
    const lines: string[] = [];
    lines.push(`📦 *${shopName.toUpperCase()} - PRODUCT DETAILS*`);
    lines.push(`----------------------------------------`);
    lines.push(`• *Product:* ${item.name}`);
    lines.push(`• *Category:* ${item.category}`);
    lines.push(`• *Price:* ${currency} ${item.salePrice.toLocaleString()}`);
    lines.push(`• *In Stock:* ${item.qty} units`);
    if (item.barcode) {
      lines.push(`• *Barcode:* ${item.barcode}`);
    }

    if (item.variants && item.variants.length > 0) {
      lines.push(`\n*COLOR / SPECIFICATION VARIANTS:*`);
      item.variants.forEach((v: MobileVariant, idx: number) => {
        const col = v.color || `${v.ram || ''} ${v.storage || ''}`.trim() || `Variant ${idx + 1}`;
        const imeisStr = (v.imeis || []).filter(Boolean).join(', ');
        lines.push(`${idx + 1}. *${col}* - ${v.qty || 1} units${imeisStr ? `\n   IMEIs: ${imeisStr}` : ''}`);
      });
    } else if (item.imeis && item.imeis.filter(Boolean).length > 0) {
      lines.push(`\n*IMEIs:* ${item.imeis.filter(Boolean).join(', ')}`);
    } else if (item.imei) {
      lines.push(`\n*IMEI:* ${item.imei}`);
    }

    lines.push(`----------------------------------------`);
    lines.push(`Visit our shop or order now!`);

    const encoded = encodeURIComponent(lines.join('\n'));
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
    showToast('Product details shared to WhatsApp!', 'success');
  };

  const handleDownloadProductPdf = (item: InventoryItem) => {
    const doc = new jsPDF();
    const shopName = 'FMZ Friends Mobile Zone';

    doc.setFontSize(18);
    doc.setTextColor(30, 58, 138);
    doc.text(shopName.toUpperCase(), 14, 20);

    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.text('PRODUCT SPECIFICATION & IMEI RECORD', 14, 28);

    doc.setLineWidth(0.5);
    doc.setDrawColor(200, 200, 200);
    doc.line(14, 32, 196, 32);

    doc.setFontSize(11);
    doc.setTextColor(20, 20, 20);
    doc.text(`Product Name: ${item.name}`, 14, 42);
    doc.text(`Category: ${item.category}`, 14, 50);
    doc.text(`Sale Price: ${currency} ${item.salePrice.toLocaleString()}`, 14, 58);
    doc.text(`In-Stock Units: ${item.qty}`, 14, 66);
    doc.text(`Barcode / SKU: ${item.barcode || 'N/A'}`, 14, 74);
    doc.text(`Date Generated: ${new Date().toLocaleDateString()}`, 14, 82);

    const rows: any[] = [];
    if (item.variants && item.variants.length > 0) {
      item.variants.forEach((v: MobileVariant, idx: number) => {
        const imeisStr = (v.imeis || []).filter(Boolean).join(', ') || 'N/A';
        rows.push([
          `Variant #${idx + 1}`,
          v.color || `${v.ram || ''} ${v.storage || ''}`.trim() || 'Standard',
          `${v.qty || 1} Units`,
          imeisStr
        ]);
      });
    } else if (item.imeis && item.imeis.length > 0) {
      rows.push(['Standard', 'Default', `${item.qty} Units`, item.imeis.join(', ')]);
    } else if (item.imei) {
      rows.push(['Standard', 'Default', `${item.qty} Units`, item.imei]);
    } else {
      rows.push(['Standard', 'Default', `${item.qty} Units`, 'N/A']);
    }

    autoTable(doc, {
      startY: 92,
      head: [['#', 'Color / Specification', 'Quantity', 'Dedicated IMEIs / Serial Numbers']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235] },
      styles: { fontSize: 9, cellPadding: 4 },
    });

    doc.save(`product_${item.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_details.pdf`);
    showToast('Product PDF downloaded successfully!', 'success');
  };

  // Check if a product is referenced in historical sales
  const isProductReferenced = (itemId: string): boolean => {
    return sales.some(s => s.items.some(i => i.id === itemId));
  };

  // Consolidates products by base model title and category so all color variants live inside 1 product
  const unifiedInventory = useMemo(() => {
    const map = new Map<string, InventoryItem>();

    for (const item of inventory) {
      // Remove any trailing parentheses from older legacy items (e.g. "Model (Black)" -> "Model")
      const baseName = item.name.replace(/\s*\([^)]*\)\s*$/, '').trim();
      const groupKey = `${(item.category || '').toLowerCase()}:::${(baseName || item.name).toLowerCase()}`;

      if (!map.has(groupKey)) {
        const initialVariants: MobileVariant[] = item.variants && item.variants.length > 0
          ? [...item.variants]
          : [{
              id: 'var-' + item.id,
              ram: item.ram || '',
              storage: item.storage || '',
              color: item.color || (item.name.match(/\(([^)]+)\)/)?.[1] || ''),
              costPrice: item.costPrice,
              wholesalePrice: item.wholesalePrice !== undefined ? item.wholesalePrice : '',
              salePrice: item.salePrice,
              qty: item.qty,
              imeis: item.imeis && item.imeis.length > 0 ? [...item.imeis] : item.imei ? [item.imei] : [],
            }];

        map.set(groupKey, {
          ...item,
          name: baseName || item.name,
          variants: initialVariants,
        });
      } else {
        // Merge with existing product group
        const existing = map.get(groupKey)!;
        const newQty = existing.qty + item.qty;
        const existingImeisList = existing.imeis || (existing.imei ? existing.imei.split(',').map(s => s.trim()).filter(Boolean) : []);
        const itemImeisList = item.imeis || (item.imei ? item.imei.split(',').map(s => s.trim()).filter(Boolean) : []);
        const combinedImeis = Array.from(new Set([...existingImeisList, ...itemImeisList]));

        const curVariants = [...(existing.variants || [])];
        if (item.variants && item.variants.length > 0) {
          curVariants.push(...item.variants);
        } else {
          curVariants.push({
            id: 'var-' + item.id,
            ram: item.ram || '',
            storage: item.storage || '',
            color: item.color || (item.name.match(/\(([^)]+)\)/)?.[1] || ''),
            costPrice: item.costPrice,
            wholesalePrice: item.wholesalePrice !== undefined ? item.wholesalePrice : '',
            salePrice: item.salePrice,
            qty: item.qty,
            imeis: itemImeisList,
          });
        }

        map.set(groupKey, {
          ...existing,
          qty: newQty,
          image: existing.image || item.image,
          imeis: combinedImeis,
          imei: combinedImeis.join(', '),
          variants: curVariants,
        });
      }
    }

    return Array.from(map.values());
  }, [inventory]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();

    return unifiedInventory.filter(item => {
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
        ...(item.variants?.flatMap(v => v.imeis || []) || []),
      ].join(' ');

      const variantColors = (item.variants || []).map(v => v.color || '').join(' ');
      const combinedText = `${item.name} ${item.category} ${variantColors} ${item.barcode || ''} ${imeiString}`.toLowerCase();
      return tokens.every(token => combinedText.includes(token));
    });
  }, [unifiedInventory, search, categoryFilter, statusFilter]);

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
      <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-5 space-y-3 sm:space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 border-b border-slate-100 pb-3 sm:pb-4">
          <div>
            <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">Inventory & IMEI Master Stock</h3>
            <p className="text-[11px] sm:text-xs text-slate-500">
              Manage mobile phones, serial numbers, chargers, displays, and screen protectors
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setIsAdjustmentsModalOpen(true)}
              className="flex-1 sm:flex-initial px-2.5 sm:px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs rounded-xl border border-amber-200/80 transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs h-8.5 sm:h-9.5"
              title="View Manual Stock Quantity Adjustment History"
            >
              <History className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="truncate">Log</span>
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
                className="flex-1 sm:flex-initial px-2.5 sm:px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200/80 transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs h-8.5 sm:h-9.5"
                title="Export Stock Valuation & Low Stock PDF Report"
              >
                <FileText className="w-3.5 h-3.5 text-rose-600 shrink-0" /> <span className="truncate">PDF</span>
              </button>
            )}
            <button
              onClick={handleExportCSV}
              className="flex-1 sm:flex-initial px-2.5 sm:px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer h-8.5 sm:h-9.5"
            >
              <Download className="w-3.5 h-3.5 shrink-0" /> CSV
            </button>
            <button
              type="button"
              onClick={() => setIsCategoryModalOpen(true)}
              className="flex-1 sm:flex-initial px-2.5 sm:px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs rounded-xl border border-purple-200/60 transition flex items-center justify-center gap-1.5 cursor-pointer h-8.5 sm:h-9.5"
            >
              <Tag className="w-3.5 h-3.5 shrink-0" /> Categories
            </button>
            <button
              onClick={onOpenAddModal}
              className="w-full sm:w-auto px-3.5 sm:px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-md shadow-blue-500/20 transition flex items-center justify-center gap-1.5 cursor-pointer h-9 sm:h-9.5"
            >
              <Plus className="w-4 h-4 shrink-0" /> Add Product
            </button>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
          <div className="relative flex-1 flex items-center">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by Brand, Category, Model, IMEI or Barcode..."
              className="w-full pl-9 pr-24 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-blue-600 focus:bg-white transition h-9 sm:h-10"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl px-3 py-2.5 outline-none focus:border-blue-600 cursor-pointer h-10"
            >
              <option value="ALL">All Statuses (Active & Archived)</option>
              <option value="ACTIVE">Active Stock Only</option>
              <option value="ARCHIVED">Archived / Discontinued</option>
            </select>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl px-3 py-2.5 outline-none focus:border-blue-600 cursor-pointer h-10 truncate"
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

        {/* View Mode Toggle & Product Grid / Table */}
        <div className="space-y-4 pt-1">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">Display Layout:</span>
              <div className="bg-white p-1 rounded-xl border border-slate-200 flex items-center gap-1 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    viewMode === 'grid' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" /> Product Cards (Daraz Style)
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    viewMode === 'table' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <List className="w-3.5 h-3.5" /> Table View
                </button>
              </div>
            </div>
            <span className="text-xs font-bold text-slate-600">
              Showing {filtered.length} products
            </span>
          </div>

          {viewMode === 'grid' ? (
            /* Daraz / Amazon Style Product Card Grid */
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5 sm:gap-4">
              {filtered.length === 0 ? (
                <div className="col-span-full text-center py-16 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                  <Package className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                  <p className="font-semibold text-slate-700 text-xs">No matching products found</p>
                  <p className="text-[11px] text-slate-400">Try adjusting your search query or category filter</p>
                </div>
              ) : (
                filtered.map(item => {
                  const isArchived = item.status === 'ARCHIVED';
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedProductPopup(item)}
                      className={`bg-white border border-slate-200/90 rounded-2xl p-2.5 sm:p-3.5 shadow-2xs hover:shadow-xl hover:border-blue-400 transition-all duration-200 cursor-pointer flex flex-col justify-between group ${
                        isArchived ? 'opacity-75 bg-slate-50' : ''
                      }`}
                    >
                      <div>
                        {/* Normal Sized Product Image (Daraz / Amazon Style) */}
                        <div className="relative w-full h-28 sm:h-44 rounded-xl overflow-hidden bg-slate-50 border border-slate-100 flex items-center justify-center p-2">
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={item.name}
                              className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
                            />
                          ) : (
                            <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-black text-lg sm:text-xl shadow-inner">
                              {item.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          {isArchived && (
                            <span className="absolute top-2 right-2 bg-slate-800 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                              Archived
                            </span>
                          )}
                        </div>

                        {/* Category & Color Variants Badge */}
                        <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                          <span className="inline-block text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md truncate max-w-full">
                            {item.category}
                          </span>
                          {item.variants && item.variants.length > 0 && (
                            <span className="inline-block text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200/60 px-1.5 py-0.5 rounded-md">
                              {item.variants.length} Colors
                            </span>
                          )}
                        </div>

                        {/* Product Name */}
                        <h4 className="font-extrabold text-slate-900 text-xs sm:text-sm line-clamp-2 mt-1 leading-snug group-hover:text-blue-600 transition">
                          {item.name}
                        </h4>
                      </div>

                      {/* Price & Stock */}
                      <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-slate-400 block uppercase font-semibold">Price</span>
                          <span className="font-mono font-extrabold text-blue-600 text-xs sm:text-sm">
                            {currency} {item.salePrice.toLocaleString()}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block uppercase font-semibold">Stock</span>
                          <span className={`font-mono font-bold text-xs px-2 py-0.5 rounded-full ${
                            item.qty > 1 ? 'bg-emerald-50 text-emerald-700' : item.qty === 1 ? 'bg-amber-100 text-amber-800' : 'bg-rose-50 text-rose-700'
                          }`}>
                            {item.qty} left
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            /* Table View */
            <div className="border border-slate-200/80 rounded-xl overflow-hidden">
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
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => onRestoreItem && onRestoreItem(item.id)}
                                        className="px-2 py-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition flex items-center gap-1 cursor-pointer"
                                        title="Restore / Unarchive Product"
                                      >
                                        <RotateCcw className="w-3 h-3" /> Restore
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setProductToPermanentDelete(item)}
                                        className="px-2 py-1 text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition flex items-center gap-1 cursor-pointer"
                                        title="Permanently delete from database"
                                      >
                                        <Trash2 className="w-3 h-3 text-rose-600" /> Permanent Delete
                                      </button>
                                    </>
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
          )}
        </div>

      {/* Animated Product Details Popup Modal (WhatsApp Share & Product PDF excluding wholesale/cost) */}
      {selectedProductPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl space-y-5 border border-slate-100 my-auto animate-in zoom-in-95 duration-200 overflow-y-auto max-h-[90dvh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm sm:text-base">Product Details & IMEI Record</h3>
                  <p className="text-[11px] text-slate-500">Complete stock specifications & customer share options</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProductPopup(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Product Card / Image & Info */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3 sm:gap-4 bg-slate-50 p-3 sm:p-4 rounded-2xl border border-slate-200/80">
              {selectedProductPopup.image ? (
                <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-xl border border-slate-200 overflow-hidden bg-white shadow-xs shrink-0 flex items-center justify-center p-1">
                  <img
                    src={selectedProductPopup.image}
                    alt={selectedProductPopup.name}
                    className="w-full h-full object-contain rounded-lg"
                  />
                </div>
              ) : (
                <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-2xl sm:text-3xl shadow-md shrink-0">
                  {selectedProductPopup.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="space-y-2 text-left w-full">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-blue-100 text-blue-800 rounded-md">
                    {selectedProductPopup.category}
                  </span>
                  <h4 className="font-extrabold text-slate-900 text-base sm:text-lg mt-1">{selectedProductPopup.name}</h4>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">Sale Price</span>
                    <span className="font-mono font-black text-blue-600 text-sm sm:text-base">
                      {currency} {selectedProductPopup.salePrice.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">In Stock</span>
                    <span className="font-mono font-bold text-slate-800 text-sm sm:text-base">
                      {selectedProductPopup.qty} units
                    </span>
                  </div>
                </div>
                {selectedProductPopup.barcode && (
                  <div className="text-xs">
                    <span className="text-slate-400 text-[10px] font-bold uppercase">Barcode / SKU: </span>
                    <span className="font-mono font-bold text-slate-700">{selectedProductPopup.barcode}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Colors & IMEIs Breakdown */}
            <div className="space-y-3">
              <h5 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                Color Variants & Dedicated IMEIs
              </h5>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {selectedProductPopup.variants && selectedProductPopup.variants.length > 0 ? (
                  selectedProductPopup.variants.map((v: MobileVariant, vIdx: number) => (
                    <div key={v.id || vIdx} className="p-3 bg-white border border-slate-200 rounded-xl space-y-1.5 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center font-mono text-[10px]">
                            #{vIdx + 1}
                          </span>
                          {v.color || `${v.ram || ''} ${v.storage || ''}`.trim() || 'Standard Variant'}
                        </span>
                        <span className="font-mono text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                          {v.qty || 1} units
                        </span>
                      </div>
                      {v.imeis && v.imeis.filter(Boolean).length > 0 && (
                        <div className="pt-1 border-t border-slate-100 flex flex-wrap gap-1">
                          {v.imeis.filter(Boolean).map((im: string, imIdx: number) => (
                            <button
                              key={imIdx}
                              type="button"
                              onClick={() => handleCopyImei(im)}
                              className="font-mono text-[10px] bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer transition"
                              title="Click to copy IMEI"
                            >
                              <span>IMEI: {im}</span>
                              {copiedImei === im ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3 text-blue-400" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                ) : selectedProductPopup.imeis && selectedProductPopup.imeis.filter(Boolean).length > 0 ? (
                  <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
                    <span className="text-xs font-bold text-slate-700 block">Registered IMEIs / Serials:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedProductPopup.imeis.filter(Boolean).map((im, imIdx) => (
                        <button
                          key={imIdx}
                          type="button"
                          onClick={() => handleCopyImei(im)}
                          className="font-mono text-[10px] bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer transition"
                          title="Click to copy IMEI"
                        >
                          <span>{im}</span>
                          {copiedImei === im ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3 text-blue-400" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : selectedProductPopup.imei ? (
                  <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">IMEI: </span>
                    <button
                      type="button"
                      onClick={() => handleCopyImei(selectedProductPopup.imei!)}
                      className="font-mono text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-1 rounded flex items-center gap-1 cursor-pointer"
                    >
                      <span>{selectedProductPopup.imei}</span>
                      {copiedImei === selectedProductPopup.imei ? (
                        <Check className="w-3 h-3 text-emerald-600" />
                      ) : (
                        <Copy className="w-3 h-3 text-blue-400" />
                      )}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic py-2 text-center bg-slate-50 rounded-xl">
                    No specific IMEI tracked for this product item.
                  </p>
                )}
              </div>
            </div>

            {/* Action Buttons: WhatsApp Share & Separate Product PDF (strictly excluding wholesale & cost) */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex flex-col sm:flex-row items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleWhatsAppShareProduct(selectedProductPopup)}
                  className="w-full sm:flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-2 min-h-[42px]"
                >
                  <Share2 className="w-4 h-4" /> Share to WhatsApp
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadProductPdf(selectedProductPopup)}
                  className="w-full sm:flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-2 min-h-[42px]"
                >
                  <FileText className="w-4 h-4" /> Download Product PDF
                </button>
              </div>

              {isAdmin && (
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const item = selectedProductPopup;
                      setSelectedProductPopup(null);
                      onOpenEditModal(item);
                    }}
                    className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 min-h-[38px]"
                  >
                    <Edit2 className="w-3.5 h-3.5" /> Edit Product
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const item = selectedProductPopup;
                      setSelectedProductPopup(null);
                      setProductToDelete(item);
                    }}
                    className="py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 min-h-[38px]"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
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

      {/* Multi-Option Delete Modal for Active Products */}
      {productToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4 border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">
                    Delete Product
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold truncate max-w-[220px]">
                    {productToDelete.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Choose how you want to delete <strong className="text-slate-900">"{productToDelete.name}"</strong>:
            </p>

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  if (productToDelete) {
                    onDeleteItem(productToDelete.id);
                    setProductToDelete(null);
                  }
                }}
                className="w-full p-3 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 rounded-xl text-left transition flex items-start gap-3 group cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-amber-200/60 text-amber-800 flex items-center justify-center font-bold shrink-0 mt-0.5">
                  <Archive className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-amber-900 text-xs">
                    Archive Product (Safe Soft Delete)
                  </div>
                  <div className="text-[11px] text-amber-700/90 mt-0.5">
                    Hides product from active stock list while keeping past sales & invoice records safe.
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (productToDelete) {
                    if (onPermanentDeleteItem) {
                      onPermanentDeleteItem(productToDelete.id);
                    } else {
                      onDeleteItem(productToDelete.id);
                    }
                    setProductToDelete(null);
                  }
                }}
                className="w-full p-3 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 rounded-xl text-left transition flex items-start gap-3 group cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-rose-200/60 text-rose-800 flex items-center justify-center font-bold shrink-0 mt-0.5">
                  <Trash2 className="w-4 h-4 text-rose-700" />
                </div>
                <div>
                  <div className="font-extrabold text-rose-900 text-xs">
                    Permanent Delete
                  </div>
                  <div className="text-[11px] text-rose-700/90 mt-0.5">
                    Completely erases product record, IMEIs, and stock details from the database forever.
                  </div>
                </div>
              </button>
            </div>

            <div className="pt-2 flex justify-end border-t border-slate-100">
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Direct Permanent Delete Confirmation Modal */}
      {productToPermanentDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4 border border-rose-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">
                  Permanent Delete Confirmation
                </h3>
                <p className="text-xs text-rose-600 font-semibold">
                  This action cannot be undone!
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to <strong className="text-rose-600">permanently delete</strong> <strong className="text-slate-900">"{productToPermanentDelete.name}"</strong>?
              This product and all its saved IMEI records will be completely removed from system memory and database.
            </p>

            <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setProductToPermanentDelete(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer min-h-[40px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (productToPermanentDelete) {
                    if (onPermanentDeleteItem) {
                      onPermanentDeleteItem(productToPermanentDelete.id);
                    } else {
                      onDeleteItem(productToPermanentDelete.id);
                    }
                    setProductToPermanentDelete(null);
                  }
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl transition shadow-md shadow-rose-600/20 cursor-pointer min-h-[40px]"
              >
                Yes, Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

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
