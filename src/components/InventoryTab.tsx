import React, { useState, useMemo } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { InventoryItem, ItemCategory, StockAdjustment, SaleRecord, MobileVariant, SupplierPurchase, ImeiRecord, ActivityLog } from '../types';
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
  Share2,
  Truck,
  Building2,
  Cpu,
  HardDrive
} from 'lucide-react';
import { useToast } from './Toast';
import { ConfirmModal } from './ConfirmModal';
import { CategoryModal } from './CategoryModal';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { smartFilterAndSort } from '../utils/smartSearch';

interface InventoryTabProps {
  inventory: InventoryItem[];
  currency: string;
  categories: string[];
  stockAdjustments?: StockAdjustment[];
  activities?: ActivityLog[];
  sales?: SaleRecord[];
  supplierPurchases?: SupplierPurchase[];
  imeiRecords?: ImeiRecord[];
  isAdmin?: boolean;
  onOpenAddModal: () => void;
  onOpenEditModal: (item: InventoryItem) => void;
  onDeleteItem: (id: string) => void;
  onPermanentDeleteItem?: (id: string) => void;
  onRestoreItem?: (id: string) => void;
  onAddCategory: (category: string) => void;
  onDeleteCategory: (category: string) => boolean;
  onRenameCategory?: (oldName: string, newName: string) => boolean;
  onOpenPdfReport?: (category?: string) => void;
}

const InventoryTabComponent: React.FC<InventoryTabProps> = ({
  inventory,
  currency,
  categories,
  stockAdjustments = [],
  activities = [],
  sales = [],
  supplierPurchases = [],
  imeiRecords = [],
  isAdmin = true,
  onOpenAddModal,
  onOpenEditModal,
  onDeleteItem,
  onPermanentDeleteItem,
  onRestoreItem,
  onAddCategory,
  onDeleteCategory,
  onRenameCategory,
  onOpenPdfReport,
}) => {
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'ARCHIVED' | 'ALL'>('ALL');
  const [copiedImei, setCopiedImei] = useState<string | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isAdjustmentsModalOpen, setIsAdjustmentsModalOpen] = useState(false);
  const [logModalTab, setLogModalTab] = useState<'activity' | 'adjustments'>('activity');
  const [productToDelete, setProductToDelete] = useState<InventoryItem | null>(null);
  const [productToPermanentDelete, setProductToPermanentDelete] = useState<InventoryItem | null>(null);
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);

  const inventoryActivities = useMemo(() => {
    return (activities || []).filter(a => a.category === 'Inventory');
  }, [activities]);

  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [selectedProductPopup, setSelectedProductPopup] = useState<InventoryItem | null>(null);

  const selectedProductSupplierInfo = useMemo(() => {
    if (!selectedProductPopup) {
      return {
        entries: [] as Array<{
          key: string;
          billNo: string;
          partyName: string;
          partyPhone?: string;
          date: string;
          qty: number;
          costPrice: number;
          specsLabel: string;
          imeis: string[];
        }>,
        bySupplier: [] as Array<{
          partyName: string;
          partyPhone?: string;
          totalQty: number;
          billCount: number;
          lastDate: string;
        }>,
        imeiSourceMap: new Map<string, { partyName: string; billNo?: string }>(),
      };
    }

    const baseProductName = selectedProductPopup.name.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
    const selectedCategory = (selectedProductPopup.category || '').trim().toLowerCase();
    const productBarcode = (selectedProductPopup.barcode || '').trim().toLowerCase();

    const productCategoryById = new Map<string, string>();
    const selectedProductIds = new Set<string>([selectedProductPopup.id]);
    for (const inv of inventory) {
      const invCat = (inv.category || '').trim().toLowerCase();
      productCategoryById.set(inv.id, invCat);
      const invBase = inv.name.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
      if (invBase === baseProductName && invCat === selectedCategory) {
        selectedProductIds.add(inv.id);
      }
    }

    const productImeiSet = new Set<string>();
    const collectImeis = (raw?: string | string[]) => {
      if (!raw) return;
      if (Array.isArray(raw)) {
        raw.forEach(s => {
          const clean = (s || '').trim().toLowerCase();
          if (clean) productImeiSet.add(clean);
        });
      } else {
        raw.split(',').forEach(s => {
          const clean = s.trim().toLowerCase();
          if (clean) productImeiSet.add(clean);
        });
      }
    };
    collectImeis(selectedProductPopup.imei);
    collectImeis(selectedProductPopup.imeis);
    (selectedProductPopup.variants || []).forEach(v => collectImeis(v.imeis));

    const imeiSourceMap = new Map<string, { partyName: string; billNo?: string }>();
    const entries: Array<{
      key: string;
      billNo: string;
      partyName: string;
      partyPhone?: string;
      date: string;
      qty: number;
      costPrice: number;
      specsLabel: string;
      imeis: string[];
    }> = [];
    const seenBillKeys = new Set<string>();

    for (const pur of supplierPurchases) {
      if (!pur || pur.status === 'REVERSED') continue;
      for (let idx = 0; idx < (pur.items || []).length; idx++) {
        const pi = pur.items[idx];
        const piBase = (pi.name || '').replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
        const piCat = (pi.category || '').trim().toLowerCase();
        const piBarcode = (pi.barcode || '').trim().toLowerCase();
        const piImeis = Array.from(
          new Set([
            ...(pi.imeis || []),
            ...(pi.imei ? pi.imei.split(',') : []),
          ].map(s => s.trim()).filter(Boolean))
        );

        const hasCategoryMismatch = Boolean(selectedCategory && piCat && piCat !== selectedCategory);
        const matchesBarcode =
          !hasCategoryMismatch &&
          Boolean(productBarcode && piBarcode && piBarcode === productBarcode);
        const matchesName =
          Boolean(baseProductName && piBase && piBase === baseProductName) &&
          (selectedCategory ? piCat === selectedCategory : true);
        const matchesImei =
          !hasCategoryMismatch &&
          piImeis.some(im => productImeiSet.has(im.toLowerCase()));

        if (matchesBarcode || matchesName || matchesImei) {
          piImeis.forEach(im => {
            imeiSourceMap.set(im.toLowerCase(), {
              partyName: pur.partyName,
              billNo: pur.billNo,
            });
          });

          const specsParts = [pi.color, pi.ram, pi.storage].filter(Boolean);
          const entryKey = `${pur.id || pur.billNo}::${idx}`;
          seenBillKeys.add(`${pur.partyName.toLowerCase()}::${pur.billNo.toLowerCase()}`);
          entries.push({
            key: entryKey,
            billNo: pur.billNo,
            partyName: pur.partyName,
            partyPhone: pur.partyPhone,
            date: pur.date,
            qty: Number(pi.qty) || 0,
            costPrice: Number(pi.costPrice) || 0,
            specsLabel: specsParts.join(' · '),
            imeis: piImeis,
          });
        }
      }
    }

    // Supplement with ImeiRecord supplier attribution (strictly scoped to the selected product & category)
    const fallbackGroups = new Map<string, { partyName: string; billNo: string; date: string; imeis: string[] }>();
    for (const rec of imeiRecords) {
      if (!rec) continue;
      const recBase = (rec.productName || '').replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
      const recCat = (rec.category || productCategoryById.get(rec.productId) || '').trim().toLowerCase();
      const recImeiClean = (rec.imei || '').trim().toLowerCase();
      const hasRecCategoryMismatch = Boolean(selectedCategory && recCat && recCat !== selectedCategory);
      const belongs =
        !hasRecCategoryMismatch &&
        (selectedProductIds.has(rec.productId) ||
          (recImeiClean !== '' && productImeiSet.has(recImeiClean)) ||
          (Boolean(baseProductName && recBase === baseProductName) &&
            (selectedCategory ? recCat === selectedCategory : true)));

      if (belongs && rec.purchaseParty) {
        if (recImeiClean && !imeiSourceMap.has(recImeiClean)) {
          imeiSourceMap.set(recImeiClean, {
            partyName: rec.purchaseParty,
            billNo: rec.purchaseBillNo,
          });
        }
        const billKey = `${rec.purchaseParty.toLowerCase()}::${(rec.purchaseBillNo || 'N/A').toLowerCase()}`;
        if (!seenBillKeys.has(billKey)) {
          const existing = fallbackGroups.get(billKey) || {
            partyName: rec.purchaseParty,
            billNo: rec.purchaseBillNo || 'Direct IMEI Log',
            date: rec.createdAt,
            imeis: [],
          };
          if (rec.imei) existing.imeis.push(rec.imei);
          fallbackGroups.set(billKey, existing);
        }
      }
    }

    fallbackGroups.forEach((grp, key) => {
      entries.push({
        key: `imei-grp-${key}`,
        billNo: grp.billNo,
        partyName: grp.partyName,
        date: grp.date,
        qty: grp.imeis.length || 1,
        costPrice: 0,
        specsLabel: '',
        imeis: grp.imeis,
      });
    });

    entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const supplierAgg = new Map<
      string,
      { partyName: string; partyPhone?: string; totalQty: number; billNos: Set<string>; lastDate: string }
    >();
    for (const ent of entries) {
      const k = ent.partyName.trim().toLowerCase();
      const cur = supplierAgg.get(k) || {
        partyName: ent.partyName,
        partyPhone: ent.partyPhone,
        totalQty: 0,
        billNos: new Set<string>(),
        lastDate: ent.date,
      };
      cur.totalQty += ent.qty;
      cur.billNos.add(ent.billNo);
      if (!cur.partyPhone && ent.partyPhone) cur.partyPhone = ent.partyPhone;
      if (new Date(ent.date).getTime() > new Date(cur.lastDate).getTime()) cur.lastDate = ent.date;
      supplierAgg.set(k, cur);
    }

    const bySupplier = Array.from(supplierAgg.values())
      .map(s => ({
        partyName: s.partyName,
        partyPhone: s.partyPhone,
        totalQty: s.totalQty,
        billCount: s.billNos.size,
        lastDate: s.lastDate,
      }))
      .sort((a, b) => b.totalQty - a.totalQty);

    return { entries, bySupplier, imeiSourceMap };
  }, [selectedProductPopup, supplierPurchases, imeiRecords, inventory]);

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
        const spec = [v.ram, v.storage].filter(Boolean).join('/');
        const col = [spec, v.color].filter(Boolean).join(' • ') || `Variant ${idx + 1}`;
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
        const spec = [v.ram, v.storage].filter(Boolean).join('/');
        const label = [spec, v.color].filter(Boolean).join(' • ') || 'Standard';
        rows.push([
          `Variant #${idx + 1}`,
          label,
          `${v.qty || 1} Units`,
          imeisStr
        ]);
      });
    } else {
      const rawImeis = [...(item.imeis || []), item.imei || ''].filter(Boolean);
      const uniqueImeis = Array.from(new Set(rawImeis.map(i => i.trim()).filter(Boolean)));
      rows.push(['Standard', 'Default', `${item.qty} Units`, uniqueImeis.join(', ') || 'N/A']);
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
      const groupKey = `${(item.category || '').trim().toLowerCase()}:::${(baseName || item.name).toLowerCase()}`;

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
              note: item.note,
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
            note: item.note,
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
    const preFiltered = unifiedInventory.filter(item => {
      if (statusFilter === 'ACTIVE' && item.status === 'ARCHIVED') return false;
      if (statusFilter === 'ARCHIVED' && item.status !== 'ARCHIVED') return false;
      if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;
      return true;
    });

    if (!search.trim()) return preFiltered;

    return smartFilterAndSort(preFiltered, search, item => {
      const imeiString = [
        item.imei || '',
        ...(item.imeis || []),
        ...(item.variants?.flatMap(v => v.imeis || []) || []),
      ].join(' ');

      const variantSpecsAndColors = (item.variants || [])
        .map(v => `${v.ram || ''} ${v.storage || ''} ${v.color || ''} ${v.note || ''}`)
        .join(' ');

      return {
        primary: [item.name, item.category],
        secondary: [item.ram, item.storage, item.color, item.note, variantSpecsAndColors, item.barcode, imeiString],
      };
    });
  }, [unifiedInventory, search, categoryFilter, statusFilter]);

  const activeItems = useMemo(() => {
    return inventory.filter(i => i.status !== 'ARCHIVED');
  }, [inventory]);

  const totalCostValuation = useMemo(() => {
    return activeItems.reduce((acc, i) => {
      if (i.variants && i.variants.length > 0) {
        const varQtySum = i.variants.reduce((s, v) => s + (Number(v.qty) || 0), 0);
        if (varQtySum > 0) {
          return (
            acc +
            i.variants.reduce((s, v) => {
              const vCost = v.costPrice !== '' && v.costPrice !== undefined && Number(v.costPrice) > 0 ? Number(v.costPrice) : i.costPrice;
              return s + vCost * (Number(v.qty) || 0);
            }, 0)
          );
        }
      }
      return acc + i.costPrice * i.qty;
    }, 0);
  }, [activeItems]);

  const totalRetailValuation = useMemo(() => {
    return activeItems.reduce((acc, i) => {
      if (i.variants && i.variants.length > 0) {
        const varQtySum = i.variants.reduce((s, v) => s + (Number(v.qty) || 0), 0);
        if (varQtySum > 0) {
          return (
            acc +
            i.variants.reduce((s, v) => {
              const vSale = v.salePrice !== '' && v.salePrice !== undefined && Number(v.salePrice) > 0 ? Number(v.salePrice) : i.salePrice;
              return s + vSale * (Number(v.qty) || 0);
            }, 0)
          );
        }
      }
      return acc + i.salePrice * i.qty;
    }, 0);
  }, [activeItems]);

  const totalUnits = useMemo(() => {
    return activeItems.reduce((acc, i) => acc + i.qty, 0);
  }, [activeItems]);

  // Low stock alert: only when an active product has 1 single unit remaining (or 0)
  const lowStockCount = useMemo(() => {
    return activeItems.filter(i => i.qty <= 1).length;
  }, [activeItems]);

  // Per-category Products & Total Pieces count (e.g., Android: 12 Products • 48 Pcs)
  const categoryStats = useMemo(() => {
    const statsMap = new Map<string, { products: number; pieces: number }>();
    categories.forEach(c => statsMap.set(c, { products: 0, pieces: 0 }));

    const sourceItems = unifiedInventory.filter(item => {
      if (statusFilter === 'ARCHIVED') return item.status === 'ARCHIVED';
      return item.status !== 'ARCHIVED';
    });

    let totalProducts = 0;
    let totalPieces = 0;

    for (const item of sourceItems) {
      totalProducts += 1;
      const qty = Math.max(0, Number(item.qty) || 0);
      totalPieces += qty;

      const matchedCat =
        categories.find(c => c.toLowerCase() === (item.category || '').toLowerCase()) ||
        item.category ||
        'Uncategorized';
      const cur = statsMap.get(matchedCat) || { products: 0, pieces: 0 };
      cur.products += 1;
      cur.pieces += qty;
      statsMap.set(matchedCat, cur);
    }

    return { totalProducts, totalPieces, statsMap };
  }, [unifiedInventory, categories, statusFilter]);

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

    const headers = isAdmin
      ? ['ID', 'Product Name', 'Category', 'Status', 'IMEI', 'Cost Price', 'Sale Price', 'Stock Qty']
      : ['ID', 'Product Name', 'Category', 'Status', 'IMEI', 'Sale Price', 'Stock Qty'];
    const rows = inventory.map(i =>
      isAdmin
        ? [
            i.id,
            `"${i.name}"`,
            `"${i.category}"`,
            i.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
            i.imei || '',
            i.costPrice,
            i.salePrice,
            i.qty,
          ]
        : [
            i.id,
            `"${i.name}"`,
            `"${i.category}"`,
            i.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
            i.imei || '',
            i.salePrice,
            i.qty,
          ]
    );

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
    <div className="space-y-3 sm:space-y-5">
      {/* Metric Highlights */}
      <div className={`grid grid-cols-2 gap-2 sm:gap-3.5 ${isAdmin ? 'lg:grid-cols-4' : ''}`}>
        {isAdmin && (
          <div className="bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 shadow-xs flex flex-col justify-between">
            <span className="text-[9.5px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">
              Total Capital Invested
            </span>
            <h3 className="text-xs sm:text-lg font-extrabold text-slate-900 tabular-nums mt-0.5 truncate">
              {currency} {totalCostValuation.toLocaleString()}
            </h3>
            <p className="text-[9.5px] sm:text-xs text-slate-400 hidden sm:block mt-0.5 truncate">
              Stock cost valuation
            </p>
          </div>
        )}

        {isAdmin && (
          <div className="bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 shadow-xs flex flex-col justify-between">
            <span className="text-[9.5px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">
              Expected Retail Value
            </span>
            <h3 className="text-xs sm:text-lg font-extrabold text-emerald-600 tabular-nums mt-0.5 truncate">
              {currency} {totalRetailValuation.toLocaleString()}
            </h3>
            <p className="text-[9.5px] sm:text-xs text-slate-400 hidden sm:block mt-0.5 truncate">
              Margin: +{currency} {(totalRetailValuation - totalCostValuation).toLocaleString()}
            </p>
          </div>
        )}

        <div className="bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 shadow-xs flex flex-col justify-between">
          <span className="text-[9.5px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">
            Total In-Stock Units
          </span>
          <h3 className="text-xs sm:text-lg font-extrabold text-slate-900 tabular-nums mt-0.5 truncate">
            {totalUnits.toLocaleString()} Units · <span className="text-slate-500 font-semibold">{inventory.length} items</span>
          </h3>
          <p className="text-[9.5px] sm:text-xs text-slate-400 hidden sm:block mt-0.5 truncate">Active catalog</p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 shadow-xs flex flex-col justify-between">
          <span className="text-[9.5px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">
            Low Stock Alert
          </span>
          <h3 className="text-xs sm:text-lg font-extrabold text-rose-600 tabular-nums mt-0.5 truncate">
            {lowStockCount} Items <span className="text-[10px] font-medium text-slate-400">(≤ 1 unit)</span>
          </h3>
          <p className="text-[9.5px] sm:text-xs text-slate-400 hidden sm:block mt-0.5 truncate">Needs restock soon</p>
        </div>
      </div>

      {/* Main Stock Container */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-2.5 sm:p-5 space-y-2.5 sm:space-y-4 shadow-xs">
        {/* Header + Naturally Sized Action Buttons */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 border-b border-slate-100 pb-2.5 sm:pb-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-extrabold text-slate-900 text-sm sm:text-base truncate">
                Inventory &amp; IMEI Master Stock
              </h3>
              <p className="text-[11px] text-slate-500 hidden sm:block truncate">
                Manage mobile phones, serial numbers, chargers, displays, and screen protectors
              </p>
            </div>
            {/* Mobile Primary CTA aligned right of title */}
            <button
              type="button"
              onClick={onOpenAddModal}
              className="lg:hidden h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[11px] rounded-lg shadow-sm shadow-blue-500/20 transition inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>Add Product</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => {
                setLogModalTab('activity');
                setIsAdjustmentsModalOpen(true);
              }}
              className="h-8 sm:h-9 px-2.5 sm:px-3 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-[11px] sm:text-xs rounded-lg sm:rounded-xl border border-amber-200/80 transition inline-flex items-center gap-1.5 cursor-pointer shadow-2xs whitespace-nowrap shrink-0"
              title="View Inventory Logs, Missing Field Alerts & Stock Adjustments"
            >
              <History className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Log</span>
              {(inventoryActivities.length > 0 || stockAdjustments.length > 0) && (
                <span className="bg-amber-200 text-amber-900 text-[10px] px-1.5 rounded-full font-bold tabular-nums">
                  {inventoryActivities.length + stockAdjustments.length}
                </span>
              )}
            </button>
            {onOpenPdfReport && (
              <button
                type="button"
                onClick={() => onOpenPdfReport(categoryFilter !== 'ALL' ? categoryFilter : 'all')}
                className="h-8 sm:h-9 px-2.5 sm:px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px] sm:text-xs rounded-lg sm:rounded-xl border border-rose-200/80 transition inline-flex items-center gap-1.5 cursor-pointer shadow-2xs whitespace-nowrap shrink-0"
                title="Export Stock PDF Report"
              >
                <FileText className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                <span>PDF</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleExportCSV}
              className="h-8 sm:h-9 px-2.5 sm:px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] sm:text-xs rounded-lg sm:rounded-xl border border-slate-200/80 transition inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>CSV</span>
            </button>
            <button
              type="button"
              onClick={() => setIsCategoryModalOpen(true)}
              className="h-8 sm:h-9 px-2.5 sm:px-3 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-[11px] sm:text-xs rounded-lg sm:rounded-xl border border-purple-200/60 transition inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Tag className="w-3.5 h-3.5 shrink-0" />
              <span>Categories</span>
            </button>
            <button
              type="button"
              onClick={onOpenAddModal}
              className="hidden lg:inline-flex h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-md shadow-blue-500/20 transition items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Add Product</span>
            </button>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <div className="relative flex-1 flex items-center">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search Model, Brand, IMEI, Barcode..."
              className="compact-mobile-input w-full pl-9 pr-24 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-blue-600 focus:bg-white transition h-9 sm:h-10"
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
                className="h-7 px-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs flex items-center gap-1 text-[11px] font-extrabold cursor-pointer transition whitespace-nowrap"
                title="Fast Camera Barcode & IMEI Scanner"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Scan</span>
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:w-auto">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="compact-mobile-input w-full bg-slate-50 border border-slate-200 text-slate-700 text-[11px] sm:text-xs font-semibold rounded-xl px-2.5 py-1.5 outline-none focus:border-blue-600 cursor-pointer h-8.5 sm:h-10"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active Only</option>
              <option value="ARCHIVED">Archived</option>
            </select>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="compact-mobile-input w-full bg-slate-50 border border-slate-200 text-slate-700 text-[11px] sm:text-xs font-semibold rounded-xl px-2.5 py-1.5 outline-none focus:border-blue-600 cursor-pointer h-8.5 sm:h-10 truncate"
            >
              <option value="ALL">
                All Categories ({categoryStats.totalProducts} • {categoryStats.totalPieces})
              </option>
              {categories.map(cat => {
                const st = categoryStats.statsMap.get(cat) || { products: 0, pieces: 0 };
                return (
                  <option key={cat} value={cat}>
                    {cat} ({st.products} • {st.pieces})
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* Category Wise Products & Piece Count Breakdown Strip */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin touch-pan-x">
          <button
            type="button"
            onClick={() => setCategoryFilter('ALL')}
            className={`shrink-0 px-2.5 py-1 rounded-lg border text-left transition cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap ${
              categoryFilter === 'ALL'
                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <span className="text-[11px] font-extrabold">All</span>
            <span
              className={`text-[10px] font-bold tabular-nums ${
                categoryFilter === 'ALL' ? 'text-blue-100' : 'text-slate-500'
              }`}
            >
              {categoryStats.totalProducts}·{categoryStats.totalPieces}
            </span>
          </button>
          {categories.map(cat => {
            const st = categoryStats.statsMap.get(cat) || { products: 0, pieces: 0 };
            const isActive = categoryFilter === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(isActive ? 'ALL' : cat)}
                className={`shrink-0 px-2.5 py-1 rounded-lg border text-left transition cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                <span className="text-[11px] font-extrabold">{cat}</span>
                <span
                  className={`text-[10px] font-bold tabular-nums ${
                    isActive ? 'text-blue-100' : 'text-slate-500'
                  }`}
                >
                  {st.products}·{st.pieces}
                </span>
              </button>
            );
          })}
        </div>

        {/* View Mode Toggle & Product Grid / Table */}
        <div className="space-y-2.5 sm:space-y-3.5 pt-0.5">
          <div className="flex items-center justify-between gap-2 bg-slate-50 px-2.5 py-1.5 sm:p-2.5 rounded-xl border border-slate-200/80">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-[11px] font-bold text-slate-600 hidden sm:inline">View:</span>
              <div className="bg-white p-0.5 rounded-lg border border-slate-200 inline-flex items-center gap-0.5 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                    viewMode === 'grid' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LayoutGrid className="w-3 h-3" />
                  <span className="sm:hidden">Cards</span>
                  <span className="hidden sm:inline">Product Cards</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                    viewMode === 'table' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <List className="w-3 h-3" />
                  <span>Table</span>
                </button>
              </div>
            </div>
            <span className="text-[10.5px] sm:text-xs font-bold text-slate-600 tabular-nums truncate">
              {filtered.length} models ·{' '}
              {filtered.reduce((sum, item) => sum + Math.max(0, Number(item.qty) || 0), 0).toLocaleString()} pcs
            </span>
          </div>

          {viewMode === 'grid' ? (
            /* Compact 4-Column Horizontal Grid on Mobile -> 5/6 Columns on Tablet/Desktop */
            <div className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1.5 sm:gap-3">
              {filtered.length === 0 ? (
                <div className="col-span-full text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                  <Package className="w-9 h-9 mx-auto mb-2 text-slate-300" />
                  <p className="font-semibold text-slate-700 text-xs">No matching products found</p>
                  <p className="text-[11px] text-slate-400">Try adjusting your search query or category filter</p>
                </div>
              ) : (
                filtered.map(item => {
                  const isArchived = item.status === 'ARCHIVED';
                  const specs = Array.from(
                    new Set(
                      [
                        ...(item.variants || []).map(v => [v.ram, v.storage].filter(Boolean).join('/')),
                        [item.ram, item.storage].filter(Boolean).join('/'),
                      ].filter(Boolean)
                    )
                  );
                  const prices = (item.variants || []).map(v => Number(v.salePrice)).filter(p => !isNaN(p) && p > 0);
                  if (prices.length === 0) prices.push(item.salePrice);
                  const minPrice = Math.min(...prices);
                  const maxPrice = Math.max(...prices);
                  const priceLabel =
                    minPrice === maxPrice
                      ? `${currency} ${minPrice.toLocaleString()}`
                      : `${currency} ${minPrice.toLocaleString()}+`;

                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedProductPopup(item)}
                      className={`bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-1.5 sm:p-2.5 shadow-2xs hover:shadow-lg hover:border-blue-400 transition-all duration-150 cursor-pointer flex flex-col justify-between group min-w-0 ${
                        isArchived ? 'opacity-70 bg-slate-50' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        {/* Compact Product Image Frame */}
                        <div className="relative w-full h-14 sm:h-28 md:h-32 rounded-lg sm:rounded-xl overflow-hidden bg-slate-50 border border-slate-100 flex items-center justify-center p-1 sm:p-1.5">
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={item.name}
                              className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
                            />
                          ) : (
                            <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-black text-sm sm:text-lg shadow-inner">
                              {item.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          {isArchived && (
                            <span className="absolute top-1 right-1 bg-slate-800 text-white text-[8px] font-bold px-1 py-0.2 rounded">
                              Arch
                            </span>
                          )}
                        </div>

                        {/* Product Name */}
                        <h4 className="font-extrabold text-slate-900 text-[10px] sm:text-xs line-clamp-2 mt-1 sm:mt-2 leading-tight group-hover:text-blue-600 transition">
                          {item.name}
                        </h4>

                        {/* Quiet Inline Specs & Category Metadata (Zero pill bloat on small cards) */}
                        <p className="text-[8.5px] sm:text-[10px] text-slate-500 font-semibold truncate mt-0.5 leading-tight">
                          {specs.length > 0 ? specs[0] : item.category}
                          {item.variants && item.variants.length > 1 ? ` · ${item.variants.length}v` : ''}
                        </p>
                      </div>

                      {/* Compact Price & Stock Footer */}
                      <div className="mt-1 sm:mt-2 pt-1 sm:pt-1.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 min-w-0">
                        <span className="tabular-nums font-extrabold text-blue-600 text-[9.5px] sm:text-xs truncate">
                          {priceLabel}
                        </span>
                        <span
                          className={`tabular-nums font-bold text-[8.5px] sm:text-[10px] truncate ${
                            item.qty > 1
                              ? 'text-emerald-700'
                              : item.qty === 1
                              ? 'text-amber-700'
                              : 'text-rose-600'
                          }`}
                        >
                          {item.qty} {item.qty === 1 ? 'left' : 'pcs'}
                        </span>
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
                      {isAdmin && <th className="p-3 text-right">Cost Price</th>}
                      <th className="p-3 text-right">Sale Price</th>
                      <th className="p-3 text-center">In Stock</th>
                      <th className="p-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={isAdmin ? 8 : 7} className="text-center py-12 text-slate-400">
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
                            <td
                              onClick={() => setSelectedProductPopup(item)}
                              className="p-3 font-semibold text-slate-900 cursor-pointer group"
                              title="Click to view Product Details & Supplier Source"
                            >
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
                                  <p className="font-bold text-slate-900 group-hover:text-blue-600 transition leading-snug">{item.name}</p>
                                  {(() => {
                                    const specs = Array.from(
                                      new Set(
                                        [
                                          ...(item.variants || []).map(v => [v.ram, v.storage].filter(Boolean).join('/')),
                                          [item.ram, item.storage].filter(Boolean).join('/'),
                                        ].filter(Boolean)
                                      )
                                    );
                                    if (specs.length === 0) return null;
                                    return (
                                      <div className="flex flex-wrap gap-1 mt-0.5">
                                        {specs.map((sp, sIdx) => (
                                          <span
                                            key={sIdx}
                                            className="inline-flex items-center gap-0.5 text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/70 px-1.5 py-0.2 rounded"
                                          >
                                            {sp}
                                          </span>
                                        ))}
                                      </div>
                                    );
                                  })()}
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
                                      className="flex items-center gap-1.5 tabular-nums text-[11px] text-blue-700"
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
                                <div className="flex items-center gap-1.5 tabular-nums text-[11px] text-blue-700">
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
                                <span className="tabular-nums text-[11px] text-slate-500">{item.barcode}</span>
                              ) : (
                                <span className="text-slate-400 text-[11px]">--</span>
                              )}
                            </td>
                            {isAdmin && (
                              <td className="p-3 text-right tabular-nums text-slate-600 font-medium">
                                {(() => {
                                  const costs = (item.variants || [])
                                    .map(v => Number(v.costPrice))
                                    .filter(p => !isNaN(p) && p > 0);
                                  if (costs.length === 0) costs.push(item.costPrice);
                                  const minCost = Math.min(...costs);
                                  const maxCost = Math.max(...costs);
                                  return minCost === maxCost
                                    ? `${currency} ${minCost.toLocaleString()}`
                                    : `${currency} ${minCost.toLocaleString()} - ${maxCost.toLocaleString()}`;
                                })()}
                              </td>
                            )}
                            <td className="p-3 text-right tabular-nums font-bold text-slate-900">
                              {(() => {
                                const prices = (item.variants || []).map(v => Number(v.salePrice)).filter(p => !isNaN(p) && p > 0);
                                if (prices.length === 0) prices.push(item.salePrice);
                                const minPrice = Math.min(...prices);
                                const maxPrice = Math.max(...prices);
                                return minPrice === maxPrice
                                  ? `${currency} ${minPrice.toLocaleString()}`
                                  : `${currency} ${minPrice.toLocaleString()} - ${maxPrice.toLocaleString()}`;
                              })()}
                            </td>
                            <td className="p-3 text-center">
                              <span
                                className={`tabular-nums font-bold text-xs px-2.5 py-0.5 rounded-full ${
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
                              ) : isArchived ? (
                                <span
                                  className="inline-flex items-center gap-1 text-[10px] text-slate-400 font-semibold bg-slate-100 px-2 py-0.5 rounded-md cursor-not-allowed"
                                  title="Archived items locked in Salesman mode"
                                >
                                  <Lock className="w-3 h-3 text-slate-400" />
                                  Locked
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => onOpenEditModal(item)}
                                  className="px-2 py-1 text-[11px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition inline-flex items-center gap-1 cursor-pointer"
                                  title="Edit Product"
                                >
                                  <Edit2 className="w-3 h-3" /> Edit
                                </button>
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
                  {(() => {
                    const popupSpecs = Array.from(
                      new Set(
                        [
                          ...(selectedProductPopup.variants || []).map(v =>
                            [v.ram, v.storage].filter(Boolean).join(' / ')
                          ),
                          [selectedProductPopup.ram, selectedProductPopup.storage].filter(Boolean).join(' / '),
                        ].filter(Boolean)
                      )
                    );
                    if (popupSpecs.length === 0) return null;
                    return (
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        {popupSpecs.map((spec, sIdx) => (
                          <span
                            key={sIdx}
                            className="inline-flex items-center gap-1 text-[11px] font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-lg"
                          >
                            <Cpu className="w-3 h-3 text-indigo-600" />
                            <span>{spec}</span>
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">Sale Price</span>
                    <span className="tabular-nums font-black text-blue-600 text-sm sm:text-base">
                      {(() => {
                        const prices = (selectedProductPopup.variants || [])
                          .map(v => Number(v.salePrice))
                          .filter(p => !isNaN(p) && p > 0);
                        if (prices.length === 0) prices.push(selectedProductPopup.salePrice);
                        const minP = Math.min(...prices);
                        const maxP = Math.max(...prices);
                        return minP === maxP
                          ? `${currency} ${minP.toLocaleString()}`
                          : `${currency} ${minP.toLocaleString()} - ${maxP.toLocaleString()}`;
                      })()}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">In Stock</span>
                    <span className="tabular-nums font-bold text-slate-800 text-sm sm:text-base">
                      {selectedProductPopup.qty} units
                    </span>
                  </div>
                </div>
                {selectedProductPopup.barcode && (
                  <div className="text-xs">
                    <span className="text-slate-400 text-[10px] font-bold uppercase">Barcode / SKU: </span>
                    <span className="tabular-nums font-bold text-slate-700">{selectedProductPopup.barcode}</span>
                  </div>
                )}
                {selectedProductPopup.note && (
                  <div className="text-xs bg-amber-50/80 border border-amber-200/80 text-amber-900 rounded-lg px-2 py-1">
                    <span className="text-[10px] font-bold uppercase text-amber-700">Note: </span>
                    <span className="font-medium">{selectedProductPopup.note}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Colors, RAM/Storage & IMEIs Breakdown */}
            <div className="space-y-3">
              <h5 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                RAM / Storage, Color Variants & Dedicated IMEIs
              </h5>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {selectedProductPopup.variants && selectedProductPopup.variants.length > 0 ? (
                  selectedProductPopup.variants.map((v: MobileVariant, vIdx: number) => {
                    const specText = [v.ram, v.storage].filter(Boolean).join(' / ');
                    return (
                    <div key={v.id || vIdx} className="p-3 bg-white border border-slate-200 rounded-xl space-y-1.5 shadow-2xs">
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <div className="font-bold text-xs text-slate-800 flex items-center gap-1.5 flex-wrap">
                          <span className="w-5 h-5 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center tabular-nums text-[10px]">
                            #{vIdx + 1}
                          </span>
                          {specText && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200/80 text-[10px] font-extrabold">
                              <HardDrive className="w-2.5 h-2.5 text-indigo-600" />
                              {specText}
                            </span>
                          )}
                          <span>{v.color || (!specText ? 'Standard Variant' : 'Default Color')}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="tabular-nums font-black text-blue-600 text-xs">
                            {currency} {Number(v.salePrice || selectedProductPopup.salePrice).toLocaleString()}
                            {isAdmin && v.wholesalePrice !== undefined && v.wholesalePrice !== ''
                              ? ` • WS: ${currency} ${Number(v.wholesalePrice).toLocaleString()}`
                              : ''}
                            {isAdmin && v.costPrice ? ` (Cost: ${currency} ${Number(v.costPrice).toLocaleString()})` : ''}
                          </span>
                          <span className="tabular-nums text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                            {v.qty || 1} units
                          </span>
                        </div>
                      </div>
                      {v.note && (
                        <div className="text-[11px] bg-amber-50/70 border border-amber-200/70 text-amber-900 px-2 py-1 rounded-lg font-medium">
                          <span className="font-bold text-amber-700">Note:</span> {v.note}
                        </div>
                      )}
                      {v.imeis && v.imeis.filter(Boolean).length > 0 && (
                        <div className="pt-1 border-t border-slate-100 flex flex-wrap gap-1">
                          {v.imeis.filter(Boolean).map((im: string, imIdx: number) => {
                            const imeiOrigin = selectedProductSupplierInfo.imeiSourceMap.get(im.trim().toLowerCase());
                            return (
                              <button
                                key={imIdx}
                                type="button"
                                onClick={() => handleCopyImei(im)}
                                className="tabular-nums text-[10px] bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer transition"
                                title={imeiOrigin ? `Click to copy IMEI · From ${imeiOrigin.partyName}${imeiOrigin.billNo ? ` (Bill #${imeiOrigin.billNo})` : ''}` : 'Click to copy IMEI'}
                              >
                                <span>IMEI: {im}</span>
                                {imeiOrigin && (
                                  <span className="text-slate-500 font-semibold">
                                    · {imeiOrigin.partyName}
                                  </span>
                                )}
                                {copiedImei === im ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3 text-blue-400" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    );
                  })
                ) : selectedProductPopup.imeis && selectedProductPopup.imeis.filter(Boolean).length > 0 ? (
                  <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
                    <span className="text-xs font-bold text-slate-700 block">Registered IMEIs / Serials:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedProductPopup.imeis.filter(Boolean).map((im, imIdx) => {
                        const imeiOrigin = selectedProductSupplierInfo.imeiSourceMap.get(im.trim().toLowerCase());
                        return (
                          <button
                            key={imIdx}
                            type="button"
                            onClick={() => handleCopyImei(im)}
                            className="tabular-nums text-[10px] bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer transition"
                            title={imeiOrigin ? `Click to copy IMEI · From ${imeiOrigin.partyName}${imeiOrigin.billNo ? ` (Bill #${imeiOrigin.billNo})` : ''}` : 'Click to copy IMEI'}
                          >
                            <span>{im}</span>
                            {imeiOrigin && (
                              <span className="text-slate-500 font-semibold">
                                · {imeiOrigin.partyName}
                              </span>
                            )}
                            {copiedImei === im ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3 text-blue-400" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : selectedProductPopup.imei ? (
                  <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">IMEI: </span>
                    <button
                      type="button"
                      onClick={() => handleCopyImei(selectedProductPopup.imei!)}
                      className="tabular-nums text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-1 rounded flex items-center gap-1 cursor-pointer"
                    >
                      <span>{selectedProductPopup.imei}</span>
                      {selectedProductSupplierInfo.imeiSourceMap.get(selectedProductPopup.imei.trim().toLowerCase()) && (
                        <span className="text-slate-500 font-semibold">
                          · {selectedProductSupplierInfo.imeiSourceMap.get(selectedProductPopup.imei.trim().toLowerCase())?.partyName}
                        </span>
                      )}
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

            {/* Supplier / Stock Inward Source History */}
            <div className="space-y-2.5 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <h5 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                  <Truck className="w-4 h-4 text-emerald-600" />
                  Supplier / Stock Inward Source
                </h5>
                {selectedProductSupplierInfo.entries.length > 0 && (
                  <span className="text-[11px] font-semibold text-slate-500 tabular-nums">
                    {selectedProductSupplierInfo.bySupplier.length} supplier(s) · {selectedProductSupplierInfo.entries.length} inward entry
                  </span>
                )}
              </div>

              {selectedProductSupplierInfo.entries.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-2.5 px-3 text-center bg-slate-50 border border-slate-200/70 rounded-xl">
                  Added directly in Inventory — no Stock Inward supplier bill linked yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {/* Supplier Totals Summary */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selectedProductSupplierInfo.bySupplier.map((sup, sIdx) => (
                      <div
                        key={sIdx}
                        className="px-3 py-2 bg-emerald-50/60 border border-emerald-200/80 rounded-xl flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-900 truncate">
                            <Building2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span className="truncate">{sup.partyName}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {sup.billCount} bill(s){isAdmin && sup.partyPhone ? ` · ${sup.partyPhone}` : ''}
                          </div>
                        </div>
                        <span className="tabular-nums text-xs font-black text-emerald-700 shrink-0">
                          +{sup.totalQty} units
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Detailed Bill-by-Bill Inward Breakdown */}
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {selectedProductSupplierInfo.entries.map(ent => (
                      <div
                        key={ent.key}
                        className="px-3 py-2 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 truncate">
                            {ent.partyName}
                            {ent.specsLabel && (
                              <span className="font-medium text-slate-500"> · {ent.specsLabel}</span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 tabular-nums truncate">
                            Bill #{ent.billNo} · {new Date(ent.date).toLocaleDateString()}
                            {isAdmin && ent.costPrice > 0 ? ` · Cost: ${currency} ${ent.costPrice.toLocaleString()}` : ''}
                          </div>
                        </div>
                        <span className="tabular-nums font-extrabold text-slate-800 shrink-0">
                          +{ent.qty} units
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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

              {(isAdmin || selectedProductPopup.status !== 'ARCHIVED') && (
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
                  {isAdmin && (
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
                  )}
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
        onRenameCategory={onRenameCategory}
      />

      {/* Inventory Logs, Missing Alerts & Stock Adjustments Modal */}
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
                    Inventory Logs & Missing Alerts
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Added/updated items, missing field alerts (IMEI, Price, Picture), and qty adjustments
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

            <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 pb-2.5">
              <button
                type="button"
                onClick={() => setLogModalTab('activity')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  logModalTab === 'activity'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Inventory Logs & Alerts ({inventoryActivities.length})
              </button>
              <button
                type="button"
                onClick={() => setLogModalTab('adjustments')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  logModalTab === 'adjustments'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Stock Qty Adjustments ({stockAdjustments.length})
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {logModalTab === 'activity' ? (
                inventoryActivities.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 space-y-2">
                    <Clock className="w-8 h-8 mx-auto text-slate-300" />
                    <p className="font-semibold text-slate-600 text-xs">No inventory activity logs recorded yet</p>
                    <p className="text-[11px] text-slate-400">
                      Product additions, updates, and missing field alerts (IMEI / Cost / Sale / Picture) will show here.
                    </p>
                  </div>
                ) : (
                  inventoryActivities.map((act, idx) => {
                    const detailsStr = act.details || '';
                    const [baseDetails, missingPart] = detailsStr.split(' | Missing Alerts: ');
                    const hasMissing = Boolean(missingPart);

                    return (
                      <div
                        key={act.id || idx}
                        className={`p-3 rounded-xl border space-y-1.5 text-xs ${
                          hasMissing
                            ? 'bg-amber-50/60 border-amber-200'
                            : 'bg-slate-50 border-slate-200/80'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-900">{act.title}</span>
                          <span className="text-[10px] text-slate-500 tabular-nums shrink-0">
                            {new Date(act.timestamp).toLocaleString()}
                          </span>
                        </div>
                        {baseDetails && (
                          <p className="text-[11px] text-slate-600">{baseDetails}</p>
                        )}
                        {hasMissing && (
                          <div className="flex items-start gap-1.5 p-2 rounded-lg bg-amber-100/80 border border-amber-300/70 text-[11px] text-amber-950 font-semibold">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                            <span>Missing: {missingPart}</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )
              ) : stockAdjustments.length === 0 ? (
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
                        className={`tabular-nums font-bold px-2 py-0.5 rounded text-[11px] ${
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
