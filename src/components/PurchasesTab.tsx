import React, { useState, useMemo, useEffect } from 'react';
import { AppData, SupplierPurchase, PurchaseItem, InventoryItem, ImeiRecord, SaleRecord, OnlineAccount } from '../types';
import {
  Truck,
  Plus,
  Search,
  Printer,
  Calendar,
  DollarSign,
  Phone,
  Package,
  Layers,
  CheckCircle2,
  Clock,
  Trash2,
  Share2,
  X,
  Building2,
  FileText,
  AlertCircle,
  Eye,
  Camera,
  Upload,
  RotateCcw,
  Sparkles,
  Barcode,
  Smartphone,
  CreditCard,
  Cpu,
  HardDrive,
  Palette,
  Edit2,
  Download,
  MessageCircle,
  ScanLine
} from 'lucide-react';
import { useToast } from './Toast';
import { ConfirmModal } from './ConfirmModal';
import { StockModal, isMobileCategory, isAndroidCategory, isKeypadCategory } from './StockModal';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { validateImeis, distributeImeiInput, MAX_SINGLE_IMEI_LENGTH, sanitizeSingleImei, extractScannedImeiTokens } from '../utils/imeiManager';
import { generateSinglePurchasePdf } from '../utils/pdfGenerator';
import { sharePurchaseOnWhatsApp } from '../utils/whatsappInvoice';

interface PurchasesTabProps {
  purchases: SupplierPurchase[];
  currency: string;
  categories: string[];
  inventory: InventoryItem[];
  imeiRecords?: ImeiRecord[];
  sales?: SaleRecord[];
  onlineAccounts?: OnlineAccount[];
  appData?: AppData;
  isAdmin?: boolean;
  onSavePurchase: (
    purchase: Omit<SupplierPurchase, 'id'>,
    autoAddToInventory: boolean
  ) => void;
  onUpdatePurchase?: (
    purchaseId: string,
    purchase: Omit<SupplierPurchase, 'id'>,
    autoAddToInventory: boolean
  ) => void;
  onDeletePurchase?: (id: string) => void;
  onReversePurchase?: (reversalData: {
    purchaseId: string;
    reason: string;
    notes?: string;
    reversedBy?: string;
  }) => void;
  onOpenAddInventoryProduct?: () => void;
  onAddInventoryProduct?: (item: Omit<InventoryItem, 'id' | 'createdAt'>) => InventoryItem | void;
  onAddCategory?: (category: string) => void;
  onRenameCategory?: (oldName: string, newName: string) => boolean;
  onSettlePurchaseDue?: (params: { purchaseId: string; paymentAmount: number; paymentMethod: string; notes?: string }) => void;
  onOpenPdfReport?: () => void;
}

export interface InwardDraftItem {
  name: string;
  category: string;
  qty: number | '';
  ram?: string;
  storage?: string;
  color?: string;
  costPrice: number | '';
  salePrice: number | '';
  wholesalePrice?: number | '';
  imei: string;
  imeis: string[];
  barcode: string;
}

const DRAFT_KEY = 'mobilepos_purchase_draft_v2';

function generateInwardBillNo(dateStr?: string, existingPurchases: SupplierPurchase[] = []): string {
  const clean = (dateStr || new Date().toISOString().substring(0, 10)).split('T')[0];
  const parts = clean.split('-');
  let ddmmyy = '';
  if (parts.length === 3) {
    const [yyyy, mm, dd] = parts;
    ddmmyy = `${dd.padStart(2, '0')}${mm.padStart(2, '0')}${yyyy.slice(-2)}`;
  } else {
    const now = new Date();
    ddmmyy = `${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getFullYear()).slice(-2)}`;
  }
  const base = `FMZ-${ddmmyy}`;
  const used = new Set(existingPurchases.map(p => (p.billNo || '').trim().toUpperCase()));
  if (!used.has(base.toUpperCase())) return base;
  let seq = 2;
  while (used.has(`${base}-${seq}`.toUpperCase())) {
    seq++;
  }
  return `${base}-${seq}`;
}

const PurchasesTabComponent: React.FC<PurchasesTabProps> = ({
  purchases = [],
  currency,
  categories,
  inventory,
  imeiRecords = [],
  sales = [],
  appData,
  onSavePurchase,
  onUpdatePurchase,
  onDeletePurchase,
  onReversePurchase,
  onOpenAddInventoryProduct,
  onAddInventoryProduct,
  onAddCategory,
  onRenameCategory,
  onSettlePurchaseDue,
  onOpenPdfReport,
}) => {
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'REVERSED' | 'PAID' | 'DUE'>('ALL');
  const [dateFilter, setDateFilter] = useState('');
  const [isSearchScannerOpen, setIsSearchScannerOpen] = useState(false);
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [scannerTarget, setScannerTarget] = useState<{ itemIdx: number; imeiIdx: number } | null>(null);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [selectedPurchaseForView, setSelectedPurchaseForView] = useState<SupplierPurchase | null>(null);
  const [selectedPurchaseForSettlement, setSelectedPurchaseForSettlement] = useState<SupplierPurchase | null>(null);
  const [settlementAmount, setSettlementAmount] = useState<number | ''>('');
  const [settlementMethod, setSettlementMethod] = useState<string>('Cash');
  const [settlementNotes, setSettlementNotes] = useState<string>('');
  const [purchaseToDelete, setPurchaseToDelete] = useState<SupplierPurchase | null>(null);
  const [purchaseToReverse, setPurchaseToReverse] = useState<SupplierPurchase | null>(null);
  const [reversalReason, setReversalReason] = useState<string>('Goods Returned to Supplier');
  const [reversalNotes, setReversalNotes] = useState<string>('');
  const [reversedBy, setReversedBy] = useState<string>('Admin');
  const [zoomImage, setZoomImage] = useState<string | null>(null);

  const fallbackPdfData: AppData = useMemo(
    () =>
      appData || {
        inventory,
        sales,
        khata: [],
        expenses: [],
        activities: [],
        categories,
        purchasesLedger: [],
        supplierPurchases: purchases,
        imeiRecords,
        settings: {
          shopName: 'FMZ Friends Mobile Zone',
          tagline: 'Mobile POS & Stock Management',
          address: '',
          phone: '',
          currency,
          taxRate: 0,
          lowStockThreshold: 2,
          receiptFooter: 'Thank you for your business!',
          theme: 'blue-white',
        },
      },
    [appData, inventory, sales, categories, purchases, imeiRecords, currency]
  );

  const handleDownloadSinglePdf = async (p: SupplierPurchase) => {
    try {
      await generateSinglePurchasePdf(p, fallbackPdfData);
      showToast(`PDF downloaded for Bill #${p.billNo}`, 'success');
    } catch {
      showToast('Failed to generate purchase bill PDF', 'error');
    }
  };

  const handleShareWhatsApp = (p: SupplierPurchase) => {
    sharePurchaseOnWhatsApp(p, fallbackPdfData.settings);
    showToast(`Opening WhatsApp for Bill #${p.billNo}...`, 'info');
  };

  // Inward Product Search Bar state
  const [productSearch, setProductSearch] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Form State
  const [partyName, setPartyName] = useState('');
  const [partyPhone, setPartyPhone] = useState('');
  const [billNo, setBillNo] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paidAmount, setPaidAmount] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [invoiceImage, setInvoiceImage] = useState<string>('');
  const [autoAddToInventory, setAutoAddToInventory] = useState(true);
  const [hasDraft, setHasDraft] = useState(false);
  const [draftSavedTime, setDraftSavedTime] = useState<string | null>(null);

  // Dynamic Items list in new purchase (starts empty, user selects from inventory search or + Add Product)
  const [items, setItems] = useState<InwardDraftItem[]>([]);

  // Search existing inventory products for inward addition
  const filteredSearchInventory = useMemo(() => {
    const q = productSearch.toLowerCase().trim();
    if (!q) return inventory.slice(0, 8);
    return inventory.filter(inv => {
      const imeiStr = [inv.imei || '', ...(inv.imeis || [])].join(' ');
      return (
        inv.name.toLowerCase().includes(q) ||
        inv.category.toLowerCase().includes(q) ||
        (inv.barcode && inv.barcode.toLowerCase().includes(q)) ||
        imeiStr.toLowerCase().includes(q)
      );
    }).slice(0, 15);
  }, [inventory, productSearch]);

  const resolveItemCategory = (rawCat?: string): string => {
    const clean = (rawCat || '').trim();
    if (!clean) return categories[0] || 'Android Mobile';

    const exactMatch = categories.find(c => c === clean);
    if (exactMatch) return exactMatch;

    const ciMatch = categories.find(c => c.trim().toLowerCase() === clean.toLowerCase());
    if (ciMatch) return ciMatch;

    if (isKeypadCategory(clean)) {
      const keypadCat = categories.find(c => isKeypadCategory(c));
      if (keypadCat) return keypadCat;
    }

    if (isAndroidCategory(clean)) {
      const androidCat = categories.find(c => isAndroidCategory(c));
      if (androidCat) return androidCat;
    }

    return clean;
  };

  const handleSelectProductFromInventory = (inv: InventoryItem) => {
    const resolvedCategory = resolveItemCategory(inv.category);
    setItems(prev => [
      ...prev,
      {
        name: inv.name,
        category: resolvedCategory,
        qty: '',
        ram: '',
        storage: '',
        color: '',
        costPrice: '',
        salePrice: '',
        wholesalePrice: '',
        imei: '',
        imeis: [],
        barcode: '',
      },
    ]);
    showToast(`Selected "${inv.name}" (${resolvedCategory}) — enter new stock details`, 'success');
    setProductSearch('');
    setIsSearchOpen(false);
  };

  // Existing suppliers list for quick selection
  const existingParties = useMemo(() => {
    const map = new Map<string, string>();
    purchases.forEach(p => {
      if (p.partyName) {
        map.set(p.partyName.trim(), p.partyPhone || '');
      }
    });
    return Array.from(map.entries()).map(([name, phone]) => ({ name, phone }));
  }, [purchases]);

  // Load Draft from LocalStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && (parsed.partyName || (parsed.items && parsed.items.length > 0 && parsed.items[0].name))) {
          setHasDraft(true);
        }
      }
    } catch {
      // ignore parsing error
    }
  }, []);

  // Auto-Save Draft (only for new purchase mode, not when editing existing bill)
  useEffect(() => {
    if (!isAddModalOpen || editingPurchaseId) return;
    const hasContent =
      partyName.trim() ||
      items.some(i => i.name.trim() || Number(i.costPrice) > 0) ||
      paidAmount !== '' ||
      invoiceImage;

    if (hasContent) {
      const draftObj = {
        partyName,
        partyPhone,
        billNo,
        purchaseDate,
        paymentMethod,
        paidAmount,
        notes,
        invoiceImage,
        autoAddToInventory,
        items,
        updatedAt: new Date().toLocaleTimeString(),
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draftObj));
      setHasDraft(true);
      setDraftSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }
  }, [
    isAddModalOpen,
    editingPurchaseId,
    partyName,
    partyPhone,
    billNo,
    purchaseDate,
    paymentMethod,
    paidAmount,
    notes,
    invoiceImage,
    autoAddToInventory,
    items,
  ]);

  const restoreDraft = () => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const targetDate = parsed.purchaseDate || new Date().toISOString().substring(0, 10);
        setPartyName(parsed.partyName || '');
        setPartyPhone(parsed.partyPhone || '');
        setBillNo(parsed.billNo || generateInwardBillNo(targetDate, purchases));
        setPurchaseDate(targetDate);
        setPaymentMethod(parsed.paymentMethod || 'Cash');
        setPaidAmount(parsed.paidAmount ?? '');
        setNotes(parsed.notes || '');
        setInvoiceImage(parsed.invoiceImage || '');
        setAutoAddToInventory(parsed.autoAddToInventory ?? true);
        if (Array.isArray(parsed.items) && parsed.items.length > 0) {
          setItems(
            parsed.items.map((it: any) => {
              const q = it.qty !== undefined && it.qty !== '' ? Number(it.qty) : '';
              const targetCount = q === '' || q <= 0 ? 0 : Math.min(100, q);
              const itemImeis =
                it.imeis && it.imeis.length > 0
                  ? [...it.imeis]
                  : it.imei
                  ? it.imei.split(',').map((s: string) => s.trim()).filter(Boolean)
                  : [];
              while (itemImeis.length < targetCount) itemImeis.push('');
              return {
                ...it,
                category: resolveItemCategory(it.category),
                qty: q,
                imeis: targetCount > 0 ? itemImeis.slice(0, targetCount) : [],
                imei: targetCount > 0 ? itemImeis.slice(0, targetCount).filter(Boolean).join(', ') : '',
              };
            })
          );
        }
        showToast('Restored saved purchase draft', 'info');
      }
    } catch {
      showToast('Could not restore draft', 'error');
    }
  };

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setHasDraft(false);
    setDraftSavedTime(null);
    showToast('Purchase draft cleared', 'info');
  };

  // Reset form
  const resetForm = () => {
    const today = new Date().toISOString().substring(0, 10);
    setEditingPurchaseId(null);
    setPartyName('');
    setPartyPhone('');
    setBillNo(generateInwardBillNo(today, purchases));
    setPurchaseDate(today);
    setPaymentMethod('Cash');
    setPaidAmount('');
    setNotes('');
    setInvoiceImage('');
    setAutoAddToInventory(true);
    setItems([]);
    setProductSearch('');
    setIsSearchOpen(false);
  };

  const openAddModal = () => {
    resetForm();
    setIsAddModalOpen(true);
  };

  const openEditModal = (purchase: SupplierPurchase) => {
    setEditingPurchaseId(purchase.id);
    setPartyName(purchase.partyName || '');
    setPartyPhone(purchase.partyPhone || '');
    setBillNo(purchase.billNo || '');
    setPurchaseDate((purchase.date || new Date().toISOString()).substring(0, 10));
    setPaymentMethod(purchase.paymentMethod || 'Cash');
    setPaidAmount(purchase.paidAmount ?? '');
    setNotes(purchase.notes || '');
    setInvoiceImage(purchase.invoiceImage || '');
    setAutoAddToInventory(true);
    setProductSearch('');
    setIsSearchOpen(false);

    const mappedItems: InwardDraftItem[] = (purchase.items || []).map(it => {
      const q = Number(it.qty) || 1;
      const resolvedCat = resolveItemCategory(it.category);
      const isMob = isMobileCategory(resolvedCat);
      const rawImeis = it.imeis && it.imeis.length > 0
        ? [...it.imeis]
        : it.imei
        ? it.imei.split(',').map(s => s.trim()).filter(Boolean)
        : [];
      const nextImeis = isMob ? [...rawImeis] : [];
      if (isMob) {
        while (nextImeis.length < Math.min(100, q)) nextImeis.push('');
      }
      return {
        name: it.name,
        category: resolvedCat,
        qty: q,
        ram: it.ram || '',
        storage: it.storage || '',
        color: it.color || '',
        costPrice: it.costPrice ?? '',
        salePrice: it.salePrice ?? '',
        wholesalePrice: it.wholesalePrice ?? '',
        imei: nextImeis.filter(Boolean).join(', '),
        imeis: isMob ? nextImeis.slice(0, Math.min(100, q)) : [],
        barcode: it.barcode || '',
      };
    });

    setItems(mappedItems);
    setIsAddModalOpen(true);
  };

  // Image Upload handler (Base64)
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast('Image size exceeds 5MB limit', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = ev => {
      const result = ev.target?.result as string;
      setInvoiceImage(result);
      showToast('Supplier invoice bill uploaded', 'success');
    };
    reader.onerror = () => {
      showToast('Failed to read image file', 'error');
    };
    reader.readAsDataURL(file);
  };

  // Items manipulation
  const handleAddItemRow = () => {
    setItems(prev => [
      ...prev,
      {
        name: '',
        category: categories[0] || 'Android Mobile',
        qty: '',
        ram: '',
        storage: '',
        color: '',
        costPrice: '',
        salePrice: '',
        wholesalePrice: '',
        imei: '',
        imeis: [],
        barcode: '',
      },
    ]);
  };

  const handleRemoveItemRow = (index: number) => {
    if (items.length <= 1) {
      showToast('At least one item is required', 'warning');
      return;
    }
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleItemQtyChange = (index: number, rawVal: string) => {
    const val = rawVal === '' ? '' : Math.max(0, parseInt(rawVal, 10) || 0);
    setItems(prev => {
      const copy = [...prev];
      const item = { ...copy[index] };
      item.qty = val;
      const targetCount = val === '' || val === 0 ? 0 : Math.max(1, Math.min(100, val));
      const curImeis = item.imeis || (item.imei ? item.imei.split(',').map(s => s.trim()) : []);
      const nextImeis = [...curImeis];
      while (nextImeis.length < targetCount) nextImeis.push('');
      item.imeis = nextImeis.slice(0, targetCount);
      item.imei = item.imeis.filter(Boolean).join(', ');
      copy[index] = item;
      return copy;
    });
  };

  const focusPurchaseImeiSafely = (id: string) => {
    setTimeout(() => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (el) el.focus();
    }, 0);
  };

  const handleScanFromCamera = (scannedText: string) => {
    if (!scannerTarget) return;
    const { itemIdx, imeiIdx } = scannerTarget;
    const tokens = extractScannedImeiTokens(scannedText);
    if (tokens.length > 0) {
      const token = sanitizeSingleImei(tokens[0]);
      if (token) {
        let isDuplicateInForm = false;
        items.forEach((it, iIdx) => {
          const imList = it.imeis || (it.imei ? it.imei.split(',').map(s => s.trim()) : []);
          imList.forEach((im, imI) => {
            if (iIdx === itemIdx && imI === imeiIdx) return;
            if (im.toLowerCase() === token.toLowerCase()) {
              isDuplicateInForm = true;
            }
          });
        });

        if (isDuplicateInForm) {
          showToast(`Duplicate IMEI detected: "${token}" is already added in this bill!`, 'error');
          setIsScannerModalOpen(false);
          setScannerTarget(null);
          return;
        }

        const valCheck = validateImeis({
          imeisToCheck: [token],
          inventory,
          imeiRecords,
          sales,
        });

        if (!valCheck.valid) {
          showToast(valCheck.error || `Duplicate IMEI: "${token}" already exists in stock or sold records!`, 'error');
          setIsScannerModalOpen(false);
          setScannerTarget(null);
          return;
        }

        handleItemImeiChange(itemIdx, imeiIdx, token);
        showToast(`Scanned IMEI #${imeiIdx + 1} added successfully`, 'success');
      }
    }
    setIsScannerModalOpen(false);
    setScannerTarget(null);
  };

  const handleItemImeiChange = (itemIdx: number, imeiIdx: number, rawVal: string) => {
    const curItemImeis = [...(items[itemIdx]?.imeis || [''])];
    const res = distributeImeiInput({
      rawValue: rawVal,
      currentImeis: curItemImeis,
      targetIndex: imeiIdx,
    });

    const newlySetImei = res.nextImeis[imeiIdx]?.trim() || '';
    if (newlySetImei) {
      let isDuplicateInForm = false;
      items.forEach((it, iIdx) => {
        const imList = it.imeis || (it.imei ? it.imei.split(',').map(s => s.trim()) : []);
        imList.forEach((im, imI) => {
          if (iIdx === itemIdx && imI === imeiIdx) return;
          if (im.toLowerCase() === newlySetImei.toLowerCase()) {
            isDuplicateInForm = true;
          }
        });
      });

      if (isDuplicateInForm) {
        showToast(`Duplicate IMEI detected: "${newlySetImei}" is already added in this bill!`, 'error');
        res.nextImeis[imeiIdx] = '';
      } else {
        const valCheck = validateImeis({
          imeisToCheck: [newlySetImei],
          inventory,
          imeiRecords,
          sales,
        });

        if (!valCheck.valid) {
          showToast(valCheck.error || `Duplicate IMEI: "${newlySetImei}" already exists in stock or sold records!`, 'error');
          res.nextImeis[imeiIdx] = '';
        }
      }
    }

    setItems(prev => {
      const copy = [...prev];
      const item = { ...copy[itemIdx] };
      item.imeis = res.nextImeis;
      item.imei = res.nextImeis.filter(Boolean).join(', ');
      copy[itemIdx] = item;
      return copy;
    });

    if (res.overflowCount > 0) {
      showToast('1 box = 1 IMEI only! Increase Inward Qty to add more IMEI boxes.', 'warning');
    } else if (res.multipleDetected) {
      showToast('1 IMEI per box enforced — extra IMEIs moved to next boxes.', 'info');
    }

    if (res.focusIndex !== null) {
      focusPurchaseImeiSafely(`purchase-item-imei-${itemIdx}-${res.focusIndex}`);
    }
  };

  const handleItemImeiKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    itemIdx: number,
    imeiIdx: number
  ) => {
    const currentVal = items[itemIdx]?.imeis?.[imeiIdx]?.trim() || '';

    if (e.key === ' ' || e.key === ',' || e.key === ';') {
      e.preventDefault();
      if (currentVal) {
        const nextSameItem = document.getElementById(`purchase-item-imei-${itemIdx}-${imeiIdx + 1}`);
        if (nextSameItem) {
          nextSameItem.focus();
          return;
        }
        const nextItemFirst = document.getElementById(`purchase-item-imei-${itemIdx + 1}-0`);
        if (nextItemFirst) {
          nextItemFirst.focus();
          return;
        }
        showToast('1 box = 1 IMEI only! Increase Inward Qty for more IMEIs.', 'warning');
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();

      if (currentVal) {
        showToast(`IMEI #${imeiIdx + 1} captured`, 'info');
      }

      const nextSameItem = document.getElementById(`purchase-item-imei-${itemIdx}-${imeiIdx + 1}`);
      if (nextSameItem) {
        nextSameItem.focus();
        return;
      }

      const nextItemFirst = document.getElementById(`purchase-item-imei-${itemIdx + 1}-0`);
      if (nextItemFirst) {
        nextItemFirst.focus();
        return;
      }
    }
  };

  const handleItemImeiPaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    itemIdx: number,
    imeiIdx: number
  ) => {
    const pasted = e.clipboardData.getData('text');
    if (!pasted) return;

    const inputEl = e.currentTarget;
    const isAllSelected =
      inputEl.selectionStart === 0 && inputEl.selectionEnd === inputEl.value.length;
    const curItemImeis = [...(items[itemIdx]?.imeis || [''])];
    const currentBoxVal = (curItemImeis[imeiIdx] || '').trim();

    if (currentBoxVal.length >= 15 && !isAllSelected) {
      e.preventDefault();
      const nextEmptyIdx = curItemImeis.findIndex((im, idx) => idx > imeiIdx && !im.trim());
      if (nextEmptyIdx === -1) {
        showToast('This box already holds 1 IMEI! Increase Inward Qty for more boxes.', 'warning');
        return;
      }
      const res = distributeImeiInput({
        rawValue: pasted,
        currentImeis: curItemImeis,
        targetIndex: nextEmptyIdx,
      });
      setItems(prev => {
        const copy = [...prev];
        const item = { ...copy[itemIdx] };
        item.imeis = res.nextImeis;
        item.imei = res.nextImeis.filter(Boolean).join(', ');
        copy[itemIdx] = item;
        return copy;
      });
      if (res.overflowCount > 0) {
        showToast('1 box = 1 IMEI only! Extra IMEIs skipped — increase Inward Qty.', 'warning');
      }
      if (res.focusIndex !== null) {
        focusPurchaseImeiSafely(`purchase-item-imei-${itemIdx}-${res.focusIndex}`);
      }
      return;
    }

    e.preventDefault();
    const res = distributeImeiInput({
      rawValue: pasted,
      currentImeis: curItemImeis,
      targetIndex: imeiIdx,
    });
    setItems(prev => {
      const copy = [...prev];
      const item = { ...copy[itemIdx] };
      item.imeis = res.nextImeis;
      item.imei = res.nextImeis.filter(Boolean).join(', ');
      copy[itemIdx] = item;
      return copy;
    });

    if (res.overflowCount > 0) {
      showToast('1 box = 1 IMEI only! Extra IMEIs skipped — increase Inward Qty.', 'warning');
    } else if (res.multipleDetected) {
      showToast('IMEIs placed 1 per box cleanly!', 'success');
    }

    if (res.focusIndex !== null) {
      focusPurchaseImeiSafely(`purchase-item-imei-${itemIdx}-${res.focusIndex}`);
    }
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      const current = { ...updated[index], [field]: value };

      if (field === 'category') {
        const newCat = String(value || '');
        if (!isAndroidCategory(newCat)) {
          current.ram = '';
          current.storage = '';
        }
        if (!isMobileCategory(newCat)) {
          current.color = '';
          current.imei = '';
          current.imeis = [];
        } else {
          const qNum = current.qty === '' ? 0 : Number(current.qty) || 0;
          const targetCount = qNum <= 0 ? 0 : Math.min(100, qNum);
          const curImeis = [...(current.imeis || [])];
          while (curImeis.length < targetCount) curImeis.push('');
          current.imeis = curImeis.slice(0, targetCount);
          current.imei = current.imeis.filter(Boolean).join(', ');
        }
      }

      updated[index] = current;
      return updated;
    });
  };

  // Calculations
  const totalBillAmount = useMemo(() => {
    return items.reduce((acc, item) => acc + (Number(item.qty) || 0) * (Number(item.costPrice) || 0), 0);
  }, [items]);

  const calculatedPaidAmount = paidAmount === '' ? totalBillAmount : Number(paidAmount);
  const balanceDue = Math.max(0, totalBillAmount - calculatedPaidAmount);

  // Submit New or Edited Purchase
  const handleSubmitPurchase = (e: React.FormEvent) => {
    e.preventDefault();

    if (!partyName.trim()) {
      showToast('Please specify a vendor/supplier name', 'warning');
      return;
    }

    const validItems = items.filter(
      item => item.name.trim() !== '' && (Number(item.qty) || 0) > 0 && (Number(item.costPrice) || 0) >= 0
    );

    if (validItems.length === 0) {
      showToast('Please add at least one valid item with name, quantity, and cost price', 'warning');
      return;
    }

    // Collect all entered IMEIs across all inward items to validate uniqueness
    const allInwardImeis: string[] = [];
    for (const item of validItems) {
      if (item.imeis && item.imeis.length > 0) {
        allInwardImeis.push(...item.imeis.map(s => s.trim()).filter(Boolean));
      } else if (item.imei) {
        allInwardImeis.push(...item.imei.split(',').map(s => s.trim()).filter(Boolean));
      }
    }

    const originalPurchase = editingPurchaseId
      ? purchases.find(p => p.id === editingPurchaseId)
      : undefined;
    const ownedImeis = originalPurchase
      ? (originalPurchase.items || []).flatMap(it =>
          it.imeis && it.imeis.length > 0
            ? it.imeis.map(s => s.trim()).filter(Boolean)
            : it.imei
            ? it.imei.split(',').map(s => s.trim()).filter(Boolean)
            : []
        )
      : [];

    if (allInwardImeis.length > 0) {
      const validation = validateImeis({
        imeisToCheck: allInwardImeis,
        allowedExistingImeis: ownedImeis,
        inventory,
        imeiRecords,
        sales,
      });

      if (!validation.valid) {
        showToast(validation.error || 'Invalid IMEI in purchase items', 'error');
        return;
      }
    }

    const purchaseItems: PurchaseItem[] = validItems.map((item, idx) => {
      const cleanImeis = isMobileCategory(item.category)
        ? (item.imeis && item.imeis.length > 0
            ? item.imeis.map(s => s.trim()).filter(Boolean)
            : (item.imei ? item.imei.split(',').map(s => s.trim()).filter(Boolean) : []))
        : [];

      return {
        id: 'PITM-' + Date.now() + '-' + idx,
        name: item.name.trim(),
        category: item.category,
        qty: Number(item.qty) || 1,
        costPrice: Number(item.costPrice) || 0,
        salePrice: Number(item.salePrice) || Number(item.costPrice) * 1.15,
        wholesalePrice: item.wholesalePrice !== '' && item.wholesalePrice !== undefined ? Number(item.wholesalePrice) : undefined,
        total: (Number(item.qty) || 1) * (Number(item.costPrice) || 0),
        ram: isAndroidCategory(item.category) ? item.ram?.trim() || undefined : undefined,
        storage: isAndroidCategory(item.category) ? item.storage?.trim() || undefined : undefined,
        color: isMobileCategory(item.category) ? item.color?.trim() || undefined : undefined,
        barcode: !isMobileCategory(item.category) ? item.barcode?.trim() || undefined : undefined,
        imei: cleanImeis.length > 0 ? cleanImeis.join(', ') : undefined,
        imeis: cleanImeis.length > 0 ? cleanImeis : undefined,
      };
    });

    const newPurchaseData: Omit<SupplierPurchase, 'id'> = {
      billNo: billNo.trim() || generateInwardBillNo(purchaseDate, purchases),
      partyName: partyName.trim(),
      partyPhone: partyPhone.trim() || undefined,
      date: purchaseDate,
      items: purchaseItems,
      totalAmount: totalBillAmount,
      paidAmount: calculatedPaidAmount,
      balanceDue,
      paymentMethod,
      notes: notes.trim() || undefined,
      invoiceImage: invoiceImage || undefined,
    };

    if (editingPurchaseId && onUpdatePurchase) {
      onUpdatePurchase(editingPurchaseId, newPurchaseData, autoAddToInventory);
      setIsAddModalOpen(false);
      resetForm();
      return;
    }

    onSavePurchase(newPurchaseData, autoAddToInventory);
    showToast(`Purchase bill recorded successfully (${currency} ${totalBillAmount.toLocaleString()})`, 'success');
    clearDraft();
    setIsAddModalOpen(false);
    resetForm();
  };

  // Build map of billNos matching IMEIs in permanent imeiRecords when searching
  const billNosFromImeiRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return new Set<string>();
    const set = new Set<string>();
    imeiRecords.forEach(rec => {
      if (rec.imei && rec.imei.toLowerCase().includes(q) && rec.purchaseBillNo) {
        set.add(rec.purchaseBillNo.trim().toLowerCase());
      }
    });
    return set;
  }, [search, imeiRecords]);

  // Direct IMEI-to-Party lookup results displayed prominently above table
  const imeiPartyMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 4) return [];

    const matches: Array<{
      imei: string;
      partyName: string;
      partyPhone?: string;
      billNo: string;
      date: string;
      productName: string;
      costPrice?: number;
      purchase?: SupplierPurchase;
    }> = [];
    const seen = new Set<string>();

    purchases.forEach(p => {
      (p.items || []).forEach(it => {
        const list = [
          ...(it.imeis || []),
          ...(it.imei ? it.imei.split(',').map(s => s.trim()) : []),
        ].filter(Boolean);
        list.forEach(im => {
          if (im.toLowerCase().includes(q)) {
            const key = `${p.id}|${im.toLowerCase()}`;
            if (!seen.has(key)) {
              seen.add(key);
              matches.push({
                imei: im,
                partyName: p.partyName,
                partyPhone: p.partyPhone,
                billNo: p.billNo,
                date: p.date,
                productName: it.name,
                costPrice: it.costPrice,
                purchase: p,
              });
            }
          }
        });
      });
    });

    imeiRecords.forEach(rec => {
      if (rec.imei && rec.imei.toLowerCase().includes(q) && rec.purchaseParty) {
        const linkedPurchase = purchases.find(
          p => rec.purchaseBillNo && p.billNo.toLowerCase() === rec.purchaseBillNo.toLowerCase()
        );
        const key = `${linkedPurchase?.id || rec.purchaseBillNo || rec.id}|${rec.imei.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          matches.push({
            imei: rec.imei,
            partyName: rec.purchaseParty,
            partyPhone: linkedPurchase?.partyPhone,
            billNo: rec.purchaseBillNo || '-',
            date: linkedPurchase?.date || rec.createdAt || '',
            productName: rec.productName,
            purchase: linkedPurchase,
          });
        }
      }
    });

    return matches.slice(0, 6);
  }, [search, purchases, imeiRecords]);

  // Filtered Purchases list (including deep IMEI & barcode matching)
  const filteredPurchases = useMemo(() => {
    const q = search.trim().toLowerCase();
    return purchases
      .filter(p => {
        const matchesSearch =
          !q ||
          p.partyName.toLowerCase().includes(q) ||
          p.billNo.toLowerCase().includes(q) ||
          (p.partyPhone && p.partyPhone.toLowerCase().includes(q)) ||
          billNosFromImeiRecords.has((p.billNo || '').trim().toLowerCase()) ||
          p.items.some(i => {
            const imeisStr = [i.imei || '', ...(i.imeis || [])].join(' ').toLowerCase();
            return (
              i.name.toLowerCase().includes(q) ||
              imeisStr.includes(q) ||
              (i.barcode && i.barcode.toLowerCase().includes(q))
            );
          });

        const isReversed = p.status === 'REVERSED';
        const matchesStatus =
          statusFilter === 'ALL'
            ? true
            : statusFilter === 'ACTIVE'
            ? !isReversed
            : statusFilter === 'REVERSED'
            ? isReversed
            : statusFilter === 'PAID'
            ? !isReversed && (p.balanceDue || 0) <= 0
            : !isReversed && (p.balanceDue || 0) > 0;

        const matchesDate = !dateFilter || p.date.startsWith(dateFilter);

        return matchesSearch && matchesStatus && matchesDate;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [purchases, search, statusFilter, dateFilter, billNosFromImeiRecords]);

  // Aggregate stats (active non-reversed purchases)
  const stats = useMemo(() => {
    let totalPurchased = 0;
    let totalPaid = 0;
    let totalDue = 0;
    let totalInwardUnits = 0;

    purchases.forEach(p => {
      if (p.status === 'REVERSED') return;
      totalPurchased += p.totalAmount || 0;
      totalPaid += p.paidAmount || 0;
      totalDue += p.balanceDue || 0;
      (p.items || []).forEach(i => {
        totalInwardUnits += i.qty || 0;
      });
    });

    return { totalPurchased, totalPaid, totalDue, totalInwardUnits };
  }, [purchases]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Header & Action Buttons */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <span className="p-2 bg-blue-600 text-white rounded-xl shadow-md shadow-blue-500/20">
              <Truck className="w-5 h-5" />
            </span>
            Supplier Purchases & Stock Inward
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Record supplier bills, scan IMEI to find party, download PDFs &amp; share via WhatsApp
          </p>
        </div>

        <div className="w-full sm:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {onOpenPdfReport && (
            <button
              type="button"
              onClick={onOpenPdfReport}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 text-xs font-extrabold rounded-xl shadow-xs transition cursor-pointer active:scale-95"
            >
              <Download className="w-4 h-4 text-blue-600" />
              Download PDF Report
            </button>
          )}
          <button
            type="button"
            onClick={openAddModal}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/25 transition cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Add Purchase / Inward Bill
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="bg-white p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1 sm:mb-2">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 line-clamp-1">Total Purchases</span>
            <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 shrink-0" />
          </div>
          <p className="text-sm sm:text-xl font-black text-slate-900 truncate">
            {currency} {stats.totalPurchased.toLocaleString()}
          </p>
          <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 truncate">{purchases.length} total bills</p>
        </div>

        <div className="bg-white p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1 sm:mb-2">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-emerald-600 line-clamp-1">Total Paid</span>
            <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 shrink-0" />
          </div>
          <p className="text-sm sm:text-xl font-black text-emerald-700 truncate">
            {currency} {stats.totalPaid.toLocaleString()}
          </p>
          <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 truncate">Cleared via Cash/Bank</p>
        </div>

        <div className="bg-white p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1 sm:mb-2">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-rose-600 line-clamp-1">Payables / Due</span>
            <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-600 shrink-0" />
          </div>
          <p className="text-sm sm:text-xl font-black text-rose-600 truncate">
            {currency} {stats.totalDue.toLocaleString()}
          </p>
          <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 truncate">Supplier balance</p>
        </div>

        <div className="bg-white p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1 sm:mb-2">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-indigo-600 line-clamp-1">Inward Units</span>
            <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-600 shrink-0" />
          </div>
          <p className="text-sm sm:text-xl font-black text-indigo-900 truncate">
            {stats.totalInwardUnits.toLocaleString()} pcs
          </p>
          <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 truncate">Stock inward total</p>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search or scan IMEI to find supplier party, bill #, or product..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setIsSearchScannerOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition cursor-pointer shrink-0"
            title="Scan IMEI / Barcode to find Supplier Party"
          >
            <ScanLine className="w-4 h-4" />
            <span className="hidden sm:inline">Scan IMEI</span>
          </button>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold">
            {(['ALL', 'ACTIVE', 'REVERSED', 'PAID', 'DUE'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap ${
                  statusFilter === tab
                    ? 'bg-white text-blue-600 shadow-2xs font-extrabold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab === 'ALL'
                  ? 'All'
                  : tab === 'ACTIVE'
                  ? 'Active'
                  : tab === 'REVERSED'
                  ? 'Reversed'
                  : tab === 'PAID'
                  ? 'Fully Paid'
                  : 'Pending Due'}
              </button>
            ))}
          </div>

          <input
            type="date"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs tabular-nums font-semibold text-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer"
          />

          {dateFilter && (
            <button
              type="button"
              onClick={() => setDateFilter('')}
              className="text-xs text-rose-600 hover:text-rose-800 font-bold px-2 py-1"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Prominent IMEI -> Supplier / Party Match Card */}
      {imeiPartyMatches.length > 0 && (
        <div className="bg-blue-50/90 border border-blue-200 rounded-2xl p-4 space-y-2.5 shadow-xs animate-in fade-in">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-extrabold text-blue-900">
              <Smartphone className="w-4 h-4 text-blue-600" />
              <span>IMEI Supplier / Party Lookup ({imeiPartyMatches.length} match{imeiPartyMatches.length > 1 ? 'es' : ''})</span>
            </div>
            <span className="text-[11px] font-bold text-blue-700">Matched from Stock Inward History</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {imeiPartyMatches.map((m, idx) => (
              <div
                key={idx}
                className="bg-white border border-blue-200/80 rounded-xl p-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span className="font-black text-sm text-slate-900 truncate">{m.partyName}</span>
                    {m.partyPhone && (
                      <span className="text-[11px] font-semibold text-slate-500 tabular-nums">({m.partyPhone})</span>
                    )}
                  </div>
                  <p className="text-xs font-bold text-slate-700 truncate">{m.productName}</p>
                  <p className="text-[11px] text-slate-500 tabular-nums">
                    IMEI: <strong className="text-blue-700">{m.imei}</strong> • Bill #{m.billNo}
                    {m.date ? ` • ${new Date(m.date).toLocaleDateString()}` : ''}
                    {m.costPrice !== undefined ? ` • Cost: ${currency} ${m.costPrice.toLocaleString()}` : ''}
                  </p>
                </div>
                {m.purchase && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedPurchaseForView(m.purchase!)}
                      className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold cursor-pointer transition"
                    >
                      View Bill
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Purchases List */}
      {filteredPurchases.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
          <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto text-slate-400">
            <Truck className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800">No Supplier Purchases Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {search || dateFilter || statusFilter !== 'ALL'
              ? 'Try adjusting your search criteria or filters to locate supplier invoices.'
              : 'Start logging stock inward and vendor bills to manage your inventory costs and supplier payables.'}
          </p>
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add First Purchase Bill
          </button>
        </div>
      ) : (
        <>
          {/* Desktop Data Table (>= lg: breakpoint) */}
          <div className="hidden lg:block bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Bill & Date</th>
                    <th className="py-3 px-4">Supplier / Party</th>
                    <th className="py-3 px-4">Items Summary</th>
                    <th className="py-3 px-4 text-right">Total Bill</th>
                    <th className="py-3 px-4 text-right">Paid</th>
                    <th className="py-3 px-4 text-right">Balance Due</th>
                    <th className="py-3 px-4 text-center">Physical Bill</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {filteredPurchases.map(p => {
                    const isReversed = p.status === 'REVERSED';
                    const isFullyPaid = (p.balanceDue || 0) <= 0;
                    const totalUnits = (p.items || []).reduce((acc, i) => acc + (i.qty || 0), 0);

                    return (
                      <tr key={p.id} className={`transition ${isReversed ? 'bg-rose-50/40 text-slate-500' : 'hover:bg-slate-50/60'}`}>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 tabular-nums font-bold text-slate-900">
                            <span>#{p.billNo}</span>
                            {isReversed && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-600 text-white">
                                REVERSED
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(p.date).toLocaleDateString()}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            <Building2 className={`w-3.5 h-3.5 ${isReversed ? 'text-slate-400' : 'text-blue-600'}`} />
                            <span className={isReversed ? 'line-through text-slate-500' : ''}>{p.partyName}</span>
                          </div>
                          {p.partyPhone && (
                            <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                              <Phone className="w-3 h-3" />
                              {p.partyPhone}
                            </div>
                          )}
                          {isReversed && p.reversalReason && (
                            <div className="text-[10px] text-rose-600 font-semibold mt-0.5">
                              Reversed: {p.reversalReason}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <span className="font-bold text-slate-800">{p.items?.length || 0} product(s)</span>
                          <span className="text-[10px] text-slate-500 block">
                            {totalUnits} inward units {isReversed && '(Restored out)'}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right font-black text-slate-900">
                          <span className={isReversed ? 'line-through text-slate-400' : ''}>
                            {currency} {p.totalAmount.toLocaleString()}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right font-bold text-emerald-600">
                          <span className={isReversed ? 'line-through text-slate-400' : ''}>
                            {currency} {p.paidAmount.toLocaleString()}
                          </span>
                          <div className="text-[9px] text-slate-400 uppercase font-semibold">
                            via {p.paymentMethod || 'Cash'}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-right">
                          {isReversed ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-200 text-slate-700">
                              CLEARED (REVERSED)
                            </span>
                          ) : isFullyPaid ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
                              <CheckCircle2 className="w-3 h-3" /> PAID
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 tabular-nums">
                              {currency} {p.balanceDue.toLocaleString()} DUE
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-center">
                          {p.invoiceImage ? (
                            <button
                              type="button"
                              onClick={() => setZoomImage(p.invoiceImage!)}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-[10px] font-bold transition cursor-pointer border border-blue-200"
                              title="View Scanned Physical Bill"
                            >
                              <Camera className="w-3 h-3" />
                              <span>Photo</span>
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">No bill photo</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setSelectedPurchaseForView(p)}
                              className="p-1.5 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                              title="View Purchase Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {!isReversed && onUpdatePurchase && (
                              <button
                                type="button"
                                onClick={() => openEditModal(p)}
                                className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition cursor-pointer"
                                title="Edit Purchase Bill"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleDownloadSinglePdf(p)}
                              className="p-1.5 rounded-lg text-slate-600 hover:text-blue-700 hover:bg-blue-50 transition cursor-pointer"
                              title="Download Purchase Bill PDF"
                            >
                              <Download className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleShareWhatsApp(p)}
                              className="p-1.5 rounded-lg text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 transition cursor-pointer"
                              title="Send Bill on WhatsApp"
                            >
                              <MessageCircle className="w-4 h-4" />
                            </button>

                            {!isReversed && p.balanceDue > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedPurchaseForSettlement(p);
                                  setSettlementAmount(p.balanceDue);
                                  setSettlementMethod('Cash');
                                  setSettlementNotes('');
                                }}
                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-extrabold flex items-center gap-1 shadow-xs transition cursor-pointer"
                                title="Settle Outstanding Supplier Due Balance"
                              >
                                <CreditCard className="w-3 h-3" />
                                <span>Pay Due</span>
                              </button>
                            )}

                            {!isReversed && (
                              <button
                                type="button"
                                onClick={() => {
                                  setPurchaseToReverse(p);
                                  setReversalReason('Goods Returned to Supplier');
                                  setReversalNotes('');
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                title="Cancel & Reverse Purchase Bill"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Purchase Cards View (< lg: breakpoint) */}
          <div className="block lg:hidden space-y-3">
            {filteredPurchases.map(p => {
              const isReversed = p.status === 'REVERSED';
              const isFullyPaid = (p.balanceDue || 0) <= 0;
              const totalUnits = (p.items || []).reduce((acc, i) => acc + (i.qty || 0), 0);

              return (
                <div
                  key={p.id}
                  className={`bg-white border rounded-2xl p-4 space-y-3 shadow-xs transition ${
                    isReversed ? 'border-rose-200 bg-rose-50/20' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="tabular-nums font-extrabold text-xs text-slate-900">
                          #{p.billNo}
                        </span>
                        {isReversed ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-rose-600 text-white">
                            REVERSED
                          </span>
                        ) : isFullyPaid ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-100 text-emerald-800">
                            PAID
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-rose-100 text-rose-800">
                            DUE
                          </span>
                        )}
                      </div>

                      <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5 truncate">
                        <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
                        <span className="truncate">{p.partyName}</span>
                      </h4>

                      <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium">
                        <span>{new Date(p.date).toLocaleDateString()}</span>
                        <span>•</span>
                        <span>{p.items?.length || 0} products ({totalUnits} units)</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] text-slate-400 block font-semibold">Total Bill</span>
                      <span className="tabular-nums font-black text-sm text-slate-900 tabular-nums">
                        {currency} {p.totalAmount.toLocaleString()}
                      </span>
                      {p.balanceDue > 0 && !isReversed && (
                        <span className="text-[10px] tabular-nums font-bold text-rose-600 block">
                          Due: {currency} {p.balanceDue.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Mobile Touch Action Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-slate-100 text-xs">
                    <div className="flex items-center gap-1.5">
                      {p.invoiceImage && (
                        <button
                          type="button"
                          onClick={() => setZoomImage(p.invoiceImage!)}
                          className="px-2.5 py-1.5 bg-blue-50 text-blue-700 font-bold rounded-xl text-xs flex items-center gap-1 border border-blue-200 min-h-[40px] cursor-pointer"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>Photo</span>
                        </button>
                      )}
                      {!isReversed && p.balanceDue > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPurchaseForSettlement(p);
                            setSettlementAmount(p.balanceDue);
                            setSettlementMethod('Cash');
                            setSettlementNotes('');
                          }}
                          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1 min-h-[40px] cursor-pointer"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>Pay Due</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedPurchaseForView(p)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center gap-1 min-h-[40px] cursor-pointer"
                        title="View Details"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View</span>
                      </button>

                      {!isReversed && onUpdatePurchase && (
                        <button
                          type="button"
                          onClick={() => openEditModal(p)}
                          className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl border border-indigo-200 min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer"
                          title="Edit Purchase Bill"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDownloadSinglePdf(p)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl border border-blue-200 min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer"
                        title="Download PDF"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleShareWhatsApp(p)}
                        className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl border border-emerald-200 min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer"
                        title="Send on WhatsApp"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                      </button>

                      {!isReversed && (
                        <button
                          type="button"
                          onClick={() => {
                            setPurchaseToReverse(p);
                            setReversalReason('Goods Returned to Supplier');
                            setReversalNotes('');
                          }}
                          className="p-2 text-slate-400 hover:text-rose-600 rounded-xl hover:bg-rose-50 transition border border-slate-200 min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer"
                          title="Reverse Bill"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ========================================================= */}
      {/* ADD PURCHASE / STOCK INWARD MODAL */}
      {/* ========================================================= */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl space-y-5 border border-slate-100 my-auto animate-in fade-in zoom-in-95 max-h-[92dvh] lg:max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-600 text-white rounded-xl shadow-md">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">
                    {editingPurchaseId ? `Edit Purchase / Inward Bill #${billNo}` : 'Record Supplier Purchase / Stock Inward'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {editingPurchaseId
                      ? 'Update party details, items, IMEIs, prices or payment status and sync inventory'
                      : 'Add inventory items directly, upload paper bill, and update ledger'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!editingPurchaseId && hasDraft && (
                  <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-[10px] font-bold">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    <span>{draftSavedTime ? `Draft Saved (${draftSavedTime})` : 'Saved Draft'}</span>
                    {items.length === 0 && (
                      <button
                        type="button"
                        onClick={restoreDraft}
                        className="ml-1 underline text-amber-800 hover:text-amber-950 cursor-pointer"
                      >
                        Restore
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={clearDraft}
                      className="ml-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                      title="Clear saved draft"
                    >
                      ×
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingPurchaseId(null);
                  }}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Scrollable Form Body */}
            <form
              onSubmit={handleSubmitPurchase}
              onKeyDown={e => {
                if (
                  e.key === 'Enter' &&
                  (e.target as HTMLElement).tagName !== 'BUTTON' &&
                  (e.target as HTMLElement).tagName !== 'TEXTAREA'
                ) {
                  e.preventDefault();
                }
              }}
              className="overflow-y-auto pr-1 flex-1 space-y-5"
            >
              {/* Row 1: Supplier & Bill Meta */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Vendor / Party Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Al-Madina Mobile Wholesale"
                    value={partyName}
                    onChange={e => setPartyName(e.target.value)}
                    list="supplier-names-list"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500"
                  />
                  <datalist id="supplier-names-list">
                    {existingParties.map((p, idx) => (
                      <option key={idx} value={p.name}>
                        {p.phone ? `Phone: ${p.phone}` : ''}
                      </option>
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Supplier Phone (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="0300-1234567"
                    value={partyPhone}
                    onChange={e => setPartyPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Supplier Bill / Invoice #
                  </label>
                  <input
                    type="text"
                    placeholder="FMZ-121126"
                    value={billNo}
                    onChange={e => setBillNo(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs tabular-nums font-bold focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Purchase Date
                  </label>
                  <input
                    type="date"
                    required
                    value={purchaseDate}
                    onChange={e => {
                      const nextDate = e.target.value;
                      setPurchaseDate(nextDate);
                      if (!billNo.trim() || /^FMZ-\d{6}(-\d+)?$/i.test(billNo.trim())) {
                        setBillNo(generateInwardBillNo(nextDate, purchases));
                      }
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs tabular-nums font-semibold focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Physical Bill Image Upload */}
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                    <span>Attach Paper Bill Photo / Scan</span>
                    {invoiceImage && (
                      <button
                        type="button"
                        onClick={() => setInvoiceImage('')}
                        className="text-rose-600 hover:text-rose-800 text-[10px] font-bold"
                      >
                        Remove Photo
                      </button>
                    )}
                  </label>

                  <div className="flex items-center gap-3">
                    <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white border border-dashed border-blue-400 rounded-xl text-xs font-bold text-blue-600 hover:bg-blue-50/50 transition cursor-pointer">
                      <Camera className="w-4 h-4" />
                      <span>{invoiceImage ? 'Change Bill Photo' : 'Upload Physical Bill (Camera / File)'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                    </label>

                    {invoiceImage && (
                      <div
                        onClick={() => setZoomImage(invoiceImage)}
                        className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 cursor-pointer shadow-2xs hover:opacity-80 transition shrink-0"
                        title="Click to view image"
                      >
                        <img
                          src={invoiceImage}
                          alt="Physical Bill"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Row 2: Itemized Stock Entries with Existing Products Search Bar & + Add Product Button */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                      <Package className="w-4 h-4 text-blue-600" />
                      Inward Stock Products
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Pick an existing product (loads Name &amp; Category only), switch Category for Android/Keypad/Other layout, or add a new item
                    </p>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                    <button
                      type="button"
                      onClick={handleAddItemRow}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold shadow-sm transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>New Row</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsStockModalOpen(true)}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-sm transition cursor-pointer"
                      title="Register a new product directly into Inventory"
                    >
                      <Plus className="w-4 h-4" />
                      <span>+ Add Product</span>
                    </button>
                  </div>
                </div>

                {/* Existing Products Search Bar with Dropdown */}
                <div className="relative">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={productSearch}
                        onChange={e => {
                          setProductSearch(e.target.value);
                          setIsSearchOpen(true);
                        }}
                        onFocus={() => setIsSearchOpen(true)}
                        placeholder="Search existing products (click to load Product Name & Category only)..."
                        className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-600 focus:bg-white transition"
                      />
                      {productSearch && (
                        <button
                          type="button"
                          onClick={() => {
                            setProductSearch('');
                            setIsSearchOpen(false);
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Search Results Dropdown */}
                  {isSearchOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-20"
                        onClick={() => setIsSearchOpen(false)}
                      />
                      <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-30 max-h-60 overflow-y-auto divide-y divide-slate-100">
                        {filteredSearchInventory.length === 0 ? (
                          <div className="p-4 text-center text-slate-400 text-xs">
                            <p className="font-semibold text-slate-600">No matching products found in Inventory</p>
                            <p className="text-[11px] mt-1 text-slate-500">
                              Click{' '}
                              <button
                                type="button"
                                onClick={() => {
                                  setIsSearchOpen(false);
                                  handleAddItemRow();
                                }}
                                className="font-bold text-blue-600 hover:underline cursor-pointer"
                              >
                                New Row
                              </button>{' '}
                              or{' '}
                              <button
                                type="button"
                                onClick={() => {
                                  setIsSearchOpen(false);
                                  setIsStockModalOpen(true);
                                }}
                                className="font-bold text-emerald-600 hover:underline cursor-pointer"
                              >
                                + Add Product
                              </button>{' '}
                              to add it now.
                            </p>
                          </div>
                        ) : (
                          filteredSearchInventory.map(prod => (
                            <div
                              key={prod.id}
                              onClick={() => handleSelectProductFromInventory(prod)}
                              className="p-3 hover:bg-blue-50/70 transition cursor-pointer flex items-center justify-between gap-3 text-xs"
                            >
                              <div className="min-w-0">
                                <p className="font-bold text-slate-900 truncate">{prod.name}</p>
                                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                                  <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-700 font-semibold">
                                    {prod.category}
                                  </span>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="tabular-nums text-[11px] font-bold text-blue-600 block">
                                  Select Name &amp; Category →
                                </span>
                                <span className="tabular-nums text-[10px] text-slate-400">
                                  Stock: {prod.qty || 0} units
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Selected Inward Products Table / List */}
                <div className="space-y-3">
                  {items.length === 0 ? (
                    <div className="p-6 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                      <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs font-bold text-slate-700">No inward products added yet</p>
                      <p className="text-[11px] text-slate-400 max-w-sm mx-auto mt-0.5">
                        Search an existing product above to load its <strong>Name &amp; Category</strong>, or click <strong>New Row</strong> to enter a product and choose Android / Keypad / Other category.
                      </p>
                    </div>
                  ) : (
                    items.map((item, idx) => {
                      const rowTotal = (Number(item.qty) || 0) * (Number(item.costPrice) || 0);
                      const isAndroid = isAndroidCategory(item.category);
                      const isKeypad = isKeypadCategory(item.category);
                      const isMobile = isMobileCategory(item.category);
                      const itemImeis = item.imeis || (item.imei ? item.imei.split(',').map(s => s.trim()) : ['']);

                      return (
                        <div
                          key={idx}
                          className="p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200/90 space-y-3 shadow-2xs hover:border-blue-300 transition"
                        >
                          {/* Row Header: Editable Product Name, Editable Category Switcher, Delete */}
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                            <div className="sm:col-span-5">
                              <label className="block text-[10px] font-bold text-slate-600 mb-1">
                                Product Title / Model Name *
                              </label>
                              <input
                                type="text"
                                required
                                placeholder="e.g. Samsung Galaxy A15, Nokia 105, 20W Charger"
                                value={item.name}
                                onChange={e => handleItemChange(idx, 'name', e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-600"
                              />
                            </div>

                            <div className="sm:col-span-4">
                              <label className="block text-[10px] font-bold text-slate-600 mb-1">
                                Category (Switches Entry System) *
                              </label>
                              {(() => {
                                const rowCategories =
                                  item.category && !categories.includes(item.category)
                                    ? [item.category, ...categories]
                                    : categories;
                                return (
                                  <select
                                    value={item.category}
                                    onChange={e => handleItemChange(idx, 'category', e.target.value)}
                                    className="w-full px-2.5 py-2 bg-white border border-blue-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-600"
                                  >
                                    {rowCategories.map(cat => (
                                      <option key={cat} value={cat}>
                                        {cat}
                                      </option>
                                    ))}
                                  </select>
                                );
                              })()}
                            </div>

                            <div className="sm:col-span-2">
                              <label className="block text-[10px] font-bold text-slate-600 mb-1">
                                Inward Qty *
                              </label>
                              <input
                                type="number"
                                min="1"
                                max="500"
                                placeholder="Qty"
                                value={item.qty}
                                onChange={e => handleItemQtyChange(idx, e.target.value)}
                                className="w-full px-2.5 py-2 bg-white border border-blue-400 rounded-xl text-xs tabular-nums font-extrabold text-blue-700 text-center focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500 shadow-2xs"
                              />
                            </div>

                            <div className="sm:col-span-1 flex items-center justify-end">
                              <button
                                type="button"
                                onClick={() => handleRemoveItemRow(idx)}
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                                title="Remove from inward bill"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Category-Specific Entry System: Android vs Keypad vs Other */}
                          {isAndroid && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-white p-3 rounded-xl border border-blue-100">
                              <div>
                                <label className="text-[10px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                                  <Cpu className="w-3 h-3 text-blue-600" /> RAM Memory
                                </label>
                                <div className="flex flex-wrap gap-1 mb-1">
                                  {['4GB', '6GB', '8GB', '12GB'].map(ramOpt => (
                                    <button
                                      key={ramOpt}
                                      type="button"
                                      onClick={() => handleItemChange(idx, 'ram', ramOpt)}
                                      className={`px-2 py-0.5 rounded text-[10px] tabular-nums font-bold transition cursor-pointer ${
                                        item.ram === ramOpt
                                          ? 'bg-blue-600 text-white'
                                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                      }`}
                                    >
                                      {ramOpt}
                                    </button>
                                  ))}
                                </div>
                                <input
                                  type="text"
                                  placeholder="e.g. 8GB"
                                  value={item.ram || ''}
                                  onChange={e => handleItemChange(idx, 'ram', e.target.value)}
                                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs tabular-nums font-semibold focus:outline-none focus:border-blue-500"
                                />
                              </div>

                              <div>
                                <label className="text-[10px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                                  <HardDrive className="w-3 h-3 text-indigo-600" /> Storage (ROM)
                                </label>
                                <div className="flex flex-wrap gap-1 mb-1">
                                  {['64GB', '128GB', '256GB', '512GB'].map(romOpt => (
                                    <button
                                      key={romOpt}
                                      type="button"
                                      onClick={() => handleItemChange(idx, 'storage', romOpt)}
                                      className={`px-2 py-0.5 rounded text-[10px] tabular-nums font-bold transition cursor-pointer ${
                                        item.storage === romOpt
                                          ? 'bg-indigo-600 text-white'
                                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                      }`}
                                    >
                                      {romOpt}
                                    </button>
                                  ))}
                                </div>
                                <input
                                  type="text"
                                  placeholder="e.g. 128GB"
                                  value={item.storage || ''}
                                  onChange={e => handleItemChange(idx, 'storage', e.target.value)}
                                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs tabular-nums font-semibold focus:outline-none focus:border-indigo-500"
                                />
                              </div>

                              <div>
                                <label className="text-[10px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                                  <Palette className="w-3 h-3 text-purple-600" /> Color
                                </label>
                                <input
                                  type="text"
                                  placeholder="e.g. Black, Blue, Gold"
                                  value={item.color || ''}
                                  onChange={e => handleItemChange(idx, 'color', e.target.value)}
                                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-purple-500 mt-5"
                                />
                              </div>
                            </div>
                          )}

                          {isKeypad && (
                            <div className="bg-purple-50/70 p-2.5 rounded-xl border border-purple-200/80">
                              <label className="text-[10px] font-bold text-purple-900 mb-1 flex items-center gap-1">
                                <Palette className="w-3.5 h-3.5 text-purple-600" /> Keypad Phone Color
                              </label>
                              <input
                                type="text"
                                placeholder="e.g. Black, Blue, Red, Gold"
                                value={item.color || ''}
                                onChange={e => handleItemChange(idx, 'color', e.target.value)}
                                className="w-full px-3 py-1.5 bg-white border border-purple-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-purple-600"
                              />
                            </div>
                          )}

                          {/* Pricing Row (Cost, Wholesale, Retail) */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                Cost Price ({currency}) *
                              </label>
                              <input
                                type="number"
                                min="0"
                                placeholder="Enter cost price"
                                value={item.costPrice}
                                onChange={e => handleItemChange(idx, 'costPrice', e.target.value === '' ? '' : Number(e.target.value))}
                                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold tabular-nums text-blue-700 focus:outline-none focus:border-blue-500 shadow-2xs"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-purple-900 mb-0.5">
                                Wholesale Price ({currency})
                              </label>
                              <input
                                type="number"
                                min="0"
                                placeholder="Optional"
                                value={item.wholesalePrice ?? ''}
                                onChange={e => handleItemChange(idx, 'wholesalePrice', e.target.value === '' ? '' : Number(e.target.value))}
                                className="w-full px-2.5 py-1.5 bg-purple-50/40 border border-purple-200 rounded-xl text-xs font-bold tabular-nums text-purple-800 focus:outline-none focus:border-purple-500 shadow-2xs"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                Retail Sale Price ({currency})
                              </label>
                              <input
                                type="number"
                                min="0"
                                placeholder="Enter retail price"
                                value={item.salePrice}
                                onChange={e => handleItemChange(idx, 'salePrice', e.target.value === '' ? '' : Number(e.target.value))}
                                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold tabular-nums text-emerald-700 focus:outline-none focus:border-blue-500 shadow-2xs"
                              />
                            </div>
                          </div>

                          {/* Dynamic IMEI Boxes for Android/Keypad OR Barcode for Other Categories */}
                          {isMobile ? (
                            <div className="p-2.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2">
                              <div className="flex items-center justify-between text-[11px] font-bold">
                                <span className="flex items-center gap-1.5 text-blue-800">
                                  <Smartphone className="w-3.5 h-3.5 text-blue-600" />
                                  {isAndroid ? 'Android' : 'Keypad'} IMEI Numbers ({itemImeis.length} {itemImeis.length === 1 ? 'Box' : 'Boxes'} for {Number(item.qty) || 0} units)
                                </span>
                                <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                                  1 Box = 1 IMEI Only
                                </span>
                              </div>

                              {itemImeis.length === 0 ? (
                                <p className="text-[11px] text-blue-700/80 py-1">
                                  Enter Inward Qty above to add IMEI number boxes.
                                </p>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5 max-h-40 overflow-y-auto pr-1">
                                  {itemImeis.map((imVal, imIdx) => (
                                    <div
                                      key={imIdx}
                                      className="flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-2xs focus-within:border-blue-500 transition"
                                    >
                                      <span className="tabular-nums text-[10px] font-bold text-slate-500 w-7 shrink-0">
                                        #{imIdx + 1}
                                      </span>
                                      <input
                                        id={`purchase-item-imei-${idx}-${imIdx}`}
                                        type="text"
                                        maxLength={MAX_SINGLE_IMEI_LENGTH}
                                        value={imVal}
                                        onChange={e => handleItemImeiChange(idx, imIdx, e.target.value)}
                                        onKeyDown={e => handleItemImeiKeyDown(e, idx, imIdx)}
                                        onPaste={e => handleItemImeiPaste(e, idx, imIdx)}
                                        placeholder="1 IMEI (15 digits)"
                                        className="w-full text-[11px] tabular-nums font-medium px-1 py-0.5 bg-transparent focus:outline-none"
                                        autoComplete="off"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setScannerTarget({ itemIdx: idx, imeiIdx: imIdx });
                                          setIsScannerModalOpen(true);
                                        }}
                                        className="p-1 text-blue-600 hover:bg-blue-50 rounded transition cursor-pointer shrink-0"
                                        title="Scan IMEI with Camera"
                                      >
                                        <Camera className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className="flex items-center justify-end pt-1 border-t border-blue-100">
                                <span className="text-xs font-black text-slate-900 tabular-nums">
                                  Subtotal: {currency} {rowTotal.toLocaleString()}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 text-[11px] items-center">
                              <div className="flex items-center gap-1.5">
                                <Barcode className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <input
                                  type="text"
                                  placeholder="Barcode / Item Code (Scan or enter)"
                                  value={item.barcode}
                                  onChange={e => {
                                    const sanitized = e.target.value.replace(/[\r\n\t]/g, '');
                                    handleItemChange(idx, 'barcode', sanitized);
                                  }}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      showToast(`Barcode for item #${idx + 1} captured`, 'info');
                                    }
                                  }}
                                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs tabular-nums focus:outline-none focus:border-blue-500"
                                  autoComplete="off"
                                />
                              </div>

                              <div className="text-right">
                                <span className="text-xs font-black text-slate-900 tabular-nums">
                                  Subtotal: {currency} {rowTotal.toLocaleString()}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Row 3: Payment Breakdown & Inventory Sync */}
              <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-200/80 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Payment Method
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={e => setPaymentMethod(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500"
                    >
                      <option value="Cash">Cash Drawer</option>
                      <option value="Bank">Bank Account</option>
                      <option value="JazzCash">JazzCash</option>
                      <option value="Easypaisa">Easypaisa</option>
                      <option value="Cheque">Bank Cheque</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Amount Paid Now ({currency})
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="Enter paid amount"
                      value={paidAmount}
                      onChange={e => setPaidAmount(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-emerald-700 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Balance Due / Payable ({currency})
                    </label>
                    <div className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-black tabular-nums text-rose-600">
                      {currency} {balanceDue.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Auto Inventory Sync Toggle */}
                <div className="pt-2 border-t border-blue-100 flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoAddToInventory}
                      onChange={e => setAutoAddToInventory(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                    />
                    <span>Automatically inject & update stock quantities in Inventory</span>
                  </label>

                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 block uppercase font-bold">Grand Total</span>
                    <span className="text-base font-black text-slate-900">
                      {currency} {totalBillAmount.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={clearDraft}
                  className="px-3 py-2 text-slate-400 hover:text-rose-600 text-xs font-bold transition cursor-pointer"
                >
                  Clear Form
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddModalOpen(false);
                      setEditingPurchaseId(null);
                    }}
                    className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold rounded-xl transition cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-xl shadow-lg shadow-blue-600/25 transition cursor-pointer"
                  >
                    {editingPurchaseId ? 'Update Inward Bill' : 'Save Inward Bill'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* VIEW PURCHASE DETAIL MODAL */}
      {/* ========================================================= */}
      {selectedPurchaseForView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl space-y-4 border border-slate-100 my-auto animate-in fade-in zoom-in-95 max-h-[90dvh] lg:max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-600">
                  Supplier Invoice Record
                </span>
                <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                  Bill #{selectedPurchaseForView.billNo}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPurchaseForView(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block font-bold">Party / Vendor</span>
                <span className="font-extrabold text-slate-900">{selectedPurchaseForView.partyName}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-bold">Date</span>
                <span className="font-bold text-slate-700">
                  {new Date(selectedPurchaseForView.date).toLocaleDateString()}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-bold">Payment Method</span>
                <span className="font-bold text-slate-700">{selectedPurchaseForView.paymentMethod}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-bold">Status</span>
                <span
                  className={`font-black text-[10px] px-2 py-0.5 rounded-full inline-block ${
                    selectedPurchaseForView.balanceDue <= 0
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {selectedPurchaseForView.balanceDue <= 0 ? 'FULLY PAID' : 'PENDING DUE'}
                </span>
              </div>
            </div>

            {/* Attached Image preview if any */}
            {selectedPurchaseForView.invoiceImage && (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-bold text-slate-800">Scanned Physical Invoice Attached</span>
                </div>
                <button
                  type="button"
                  onClick={() => setZoomImage(selectedPurchaseForView.invoiceImage!)}
                  className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition cursor-pointer"
                >
                  View Large Image
                </button>
              </div>
            )}

            {/* Items Table */}
            <div>
              <h4 className="text-xs font-bold text-slate-700 mb-2">Itemized Breakdown:</h4>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase">
                    <tr>
                      <th className="py-2 px-3">Item</th>
                      <th className="py-2 px-3 text-center">Qty</th>
                      <th className="py-2 px-3 text-right">Cost Price</th>
                      <th className="py-2 px-3 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedPurchaseForView.items.map((i, idx) => (
                      <tr key={idx}>
                        <td className="py-2 px-3">
                          <div className="font-bold text-slate-900">{i.name}</div>
                          {i.imei && <div className="text-[10px] text-slate-400 tabular-nums">IMEI: {i.imei}</div>}
                          {i.barcode && <div className="text-[10px] text-slate-400 tabular-nums">Code: {i.barcode}</div>}
                        </td>
                        <td className="py-2 px-3 text-center font-bold">{i.qty}</td>
                        <td className="py-2 px-3 text-right font-medium">
                          {currency} {i.costPrice.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right font-black">
                          {currency} {(i.costPrice * i.qty).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t border-slate-200 font-bold text-xs">
                    <tr>
                      <td colSpan={3} className="py-2 px-3 text-right">Grand Total:</td>
                      <td className="py-2 px-3 text-right font-black text-slate-900">
                        {currency} {selectedPurchaseForView.totalAmount.toLocaleString()}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={3} className="py-2 px-3 text-right text-emerald-700">Amount Paid:</td>
                      <td className="py-2 px-3 text-right font-black text-emerald-700">
                        {currency} {selectedPurchaseForView.paidAmount.toLocaleString()}
                      </td>
                    </tr>
                    {selectedPurchaseForView.balanceDue > 0 && (
                      <tr>
                        <td colSpan={3} className="py-2 px-3 text-right text-rose-600">Balance Due:</td>
                        <td className="py-2 px-3 text-right font-black text-rose-600">
                          {currency} {selectedPurchaseForView.balanceDue.toLocaleString()}
                        </td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              {selectedPurchaseForView.status !== 'REVERSED' && onUpdatePurchase && (
                <button
                  type="button"
                  onClick={() => {
                    const target = selectedPurchaseForView;
                    setSelectedPurchaseForView(null);
                    openEditModal(target);
                  }}
                  className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edit Bill</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => handleDownloadSinglePdf(selectedPurchaseForView)}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download PDF</span>
              </button>
              <button
                type="button"
                onClick={() => handleShareWhatsApp(selectedPurchaseForView)}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Send on WhatsApp</span>
              </button>
              {selectedPurchaseForView.balanceDue > 0 && selectedPurchaseForView.status !== 'REVERSED' && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPurchaseForSettlement(selectedPurchaseForView);
                    setSettlementAmount(selectedPurchaseForView.balanceDue);
                    setSettlementMethod('Cash');
                    setSettlementNotes('');
                    setSelectedPurchaseForView(null);
                  }}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Pay Due ({currency} {selectedPurchaseForView.balanceDue.toLocaleString()})</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedPurchaseForView(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* IMAGE ZOOM MODAL */}
      {/* ========================================================= */}
      {zoomImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative max-w-4xl max-h-[90vh] bg-white rounded-2xl p-2 overflow-hidden shadow-2xl flex flex-col">
            <button
              type="button"
              onClick={() => setZoomImage(null)}
              className="absolute top-4 right-4 z-10 p-2 bg-slate-900/70 hover:bg-slate-900 text-white rounded-full transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="overflow-auto flex-1 flex items-center justify-center p-2">
              <img
                src={zoomImage}
                alt="Scanned Bill"
                className="max-h-[82vh] w-auto object-contain rounded-xl"
              />
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* REVERSE / CANCEL PURCHASE MODAL */}
      {/* ========================================================= */}
      {purchaseToReverse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-2xl space-y-4 border border-slate-100 my-auto animate-in fade-in zoom-in-95 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-rose-600 text-white rounded-xl shadow-md shadow-rose-600/20">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-base">
                    Cancel & Reverse Purchase Bill
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Safe non-destructive reversal with inventory & financial restoration
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPurchaseToReverse(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto pr-1">
              {/* Bill Info Card */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-2">
                <div className="flex justify-between items-center font-bold">
                  <span className="text-slate-600">Supplier: <strong className="text-slate-900">{purchaseToReverse.partyName}</strong></span>
                  <span className="tabular-nums text-blue-600">Bill #{purchaseToReverse.billNo}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-200 text-[11px]">
                  <div>
                    <span className="text-slate-400 block font-semibold">Total Bill</span>
                    <span className="font-bold tabular-nums text-slate-900">{currency} {purchaseToReverse.totalAmount.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-semibold">Financial Outflow Paid</span>
                    <span className="font-bold tabular-nums text-emerald-700">{currency} {purchaseToReverse.paidAmount.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-semibold">Payable Balance</span>
                    <span className="font-bold tabular-nums text-rose-600">{currency} {purchaseToReverse.balanceDue.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Reversal Operations Summary */}
              <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3 text-xs space-y-2 text-amber-900">
                <div className="font-bold flex items-center gap-1.5 text-amber-800">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <span>Reversal Operations That Will Be Executed:</span>
                </div>
                <ul className="list-disc list-inside text-[11px] space-y-1 pl-1 text-amber-800 font-medium">
                  <li>
                    <strong>Stock Restoration:</strong> Inventory quantities will be deducted for {purchaseToReverse.items.length} item(s).
                  </li>
                  {purchaseToReverse.items.some(i => i.imei || (i.imeis && i.imeis.length > 0)) && (
                    <li>
                      <strong>IMEI Unregistration:</strong> Inward IMEIs will be unregistered from available stock.
                    </li>
                  )}
                  {purchaseToReverse.balanceDue > 0 && (
                    <li>
                      <strong>Supplier Payable:</strong> Supplier pending balance of {currency} {purchaseToReverse.balanceDue.toLocaleString()} will be cleared.
                    </li>
                  )}
                  {purchaseToReverse.paidAmount > 0 && (
                    <li>
                      <strong>Financial Movement:</strong> {currency} {purchaseToReverse.paidAmount.toLocaleString()} cash/bank outflow will be reversed.
                    </li>
                  )}
                  <li>
                    <strong>Audit Record:</strong> Bill will be preserved and flagged as REVERSED with full audit trail.
                  </li>
                </ul>
              </div>

              {/* Reversal Form Fields */}
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Reversal Reason <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={reversalReason}
                    onChange={e => setReversalReason(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-rose-500"
                  >
                    <option value="Goods Returned to Supplier">Goods Returned to Supplier</option>
                    <option value="Order Cancelled by Supplier">Order Cancelled by Supplier</option>
                    <option value="Entered by Mistake / Duplicate Entry">Entered by Mistake / Duplicate Entry</option>
                    <option value="Damaged / Defective Stock Consignment Rejected">Damaged / Defective Stock Consignment Rejected</option>
                    <option value="Price / Billing Dispute">Price / Billing Dispute</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Reversal Notes / Explanation (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={reversalNotes}
                    onChange={e => setReversalNotes(e.target.value)}
                    placeholder="Provide any additional details or cargo/RMA reference..."
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Authorized By
                  </label>
                  <input
                    type="text"
                    value={reversedBy}
                    onChange={e => setReversedBy(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-3 border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={() => setPurchaseToReverse(null)}
                className="w-full sm:w-auto px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold rounded-xl transition cursor-pointer text-center"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  if (onReversePurchase && purchaseToReverse) {
                    onReversePurchase({
                      purchaseId: purchaseToReverse.id,
                      reason: reversalReason,
                      notes: reversalNotes.trim() || undefined,
                      reversedBy: reversedBy.trim() || 'Admin',
                    });
                    setPurchaseToReverse(null);
                  }
                }}
                className="w-full sm:w-auto px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold rounded-xl shadow-lg shadow-rose-600/25 transition cursor-pointer active:scale-95 text-center"
              >
                Confirm Safe Reversal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* CONFIRM DELETE MODAL */}
      {/* ========================================================= */}
      <ConfirmModal
        isOpen={!!purchaseToDelete}
        title="Delete Supplier Purchase Record"
        message={`Are you sure you want to delete purchase #${purchaseToDelete?.billNo} from ${purchaseToDelete?.partyName}? This will not alter existing inventory stock.`}
        confirmText="Yes, Delete Bill"
        cancelText="Cancel"
        isDestructive={true}
        onConfirm={() => {
          if (purchaseToDelete && onDeletePurchase) {
            onDeletePurchase(purchaseToDelete.id);
            showToast('Purchase bill removed', 'info');
            setPurchaseToDelete(null);
          }
        }}
        onClose={() => setPurchaseToDelete(null)}
      />

      {/* ========================================================= */}
      {/* IN-PLACE STOCK ADD MODAL (DIRECTLY IN STOCK INWARD)      */}
      {/* ========================================================= */}
      {isStockModalOpen && (
        <StockModal
          isOpen={isStockModalOpen}
          onClose={() => setIsStockModalOpen(false)}
          onSave={(itemData) => {
            const itemsArray = Array.isArray(itemData) ? itemData : [itemData];

            for (const it of itemsArray) {
              const q = Math.max(1, Number(it.qty) || 1);
              const cleanImeis = it.imeis && it.imeis.length > 0
                ? [...it.imeis]
                : it.imei
                ? it.imei.split(',').map(s => s.trim()).filter(Boolean)
                : [];
              while (cleanImeis.length < q) cleanImeis.push('');
              const parsedImei = cleanImeis.filter(Boolean).join(', ');

              setItems(prev => {
                const existingIdx = prev.findIndex(
                  i => i.name.toLowerCase().trim() === it.name.toLowerCase().trim()
                );
                if (existingIdx >= 0) {
                  const copy = [...prev];
                  const existingImeisList = copy[existingIdx].imeis || (copy[existingIdx].imei ? copy[existingIdx].imei.split(',').map(s => s.trim()).filter(Boolean) : []);
                  const mergedImeis = [...existingImeisList, ...cleanImeis];
                  const newQty = (Number(copy[existingIdx].qty) || 0) + q;
                  while (mergedImeis.length < newQty) mergedImeis.push('');

                  copy[existingIdx] = {
                    ...copy[existingIdx],
                    qty: newQty,
                    costPrice: it.costPrice !== undefined ? it.costPrice : copy[existingIdx].costPrice,
                    salePrice: it.salePrice !== undefined ? it.salePrice : copy[existingIdx].salePrice,
                    imeis: mergedImeis.slice(0, newQty),
                    imei: mergedImeis.slice(0, newQty).filter(Boolean).join(', '),
                    barcode: it.barcode || copy[existingIdx].barcode,
                  };
                  return copy;
                }
                return [
                  ...prev,
                  {
                    name: it.name,
                    category: it.category,
                    qty: q,
                    costPrice: it.costPrice || 0,
                    salePrice: it.salePrice || 0,
                    imeis: cleanImeis.slice(0, q),
                    imei: parsedImei,
                    barcode: it.barcode || '',
                  },
                ];
              });
            }

            setIsStockModalOpen(false);
            showToast(
              itemsArray.length === 1
                ? `Product "${itemsArray[0].name}" added to inward bill!`
                : `${itemsArray.length} variants added to inward bill!`,
              'success'
            );
          }}
          currency={currency}
          categories={categories}
          inventory={inventory}
          imeiRecords={imeiRecords}
          sales={sales}
          onAddCategory={onAddCategory || (() => {})}
          onRenameCategory={onRenameCategory}
        />
      )}

      {/* IMEI / Barcode Scanner for Stock Inward Search & Supplier Lookup */}
      <BarcodeScannerModal
        isOpen={isSearchScannerOpen}
        onClose={() => setIsSearchScannerOpen(false)}
        onScan={scannedCode => {
          setSearch(scannedCode);
          showToast(`Scanned IMEI/Code: ${scannedCode}`, 'success');
        }}
        title="Scan IMEI to Find Supplier Party"
        placeholder="Scan phone IMEI or barcode label..."
      />

      {/* IMEI Box Camera Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isScannerModalOpen}
        onClose={() => {
          setIsScannerModalOpen(false);
          setScannerTarget(null);
        }}
        onScan={handleScanFromCamera}
        title={scannerTarget ? `Scan IMEI Box #${scannerTarget.imeiIdx + 1}` : 'Scan IMEI'}
        placeholder="Point camera at phone IMEI barcode..."
      />
      {/* ========================================================= */}
      {/* SETTLE DUE PAYMENT MODAL */}
      {/* ========================================================= */}
      {selectedPurchaseForSettlement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-4 sm:p-6 shadow-2xl space-y-4 border border-slate-100 animate-in zoom-in-95 my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 font-extrabold shrink-0">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">Settle Supplier Due Balance</h3>
                  <p className="text-[11px] text-slate-400">
                    Bill #{selectedPurchaseForSettlement.billNo} • {selectedPurchaseForSettlement.partyName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPurchaseForSettlement(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-1 text-xs">
              <div className="flex items-center justify-between text-slate-600 font-bold">
                <span>Total Bill Amount:</span>
                <span className="tabular-nums text-slate-900">{currency} {selectedPurchaseForSettlement.totalAmount.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-emerald-700 font-bold">
                <span>Previously Paid:</span>
                <span className="tabular-nums">{currency} {selectedPurchaseForSettlement.paidAmount.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-rose-600 font-extrabold pt-1 border-t border-slate-200/60">
                <span>Current Outstanding Due:</span>
                <span className="tabular-nums text-sm">{currency} {selectedPurchaseForSettlement.balanceDue.toLocaleString()}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Payment Amount ({currency}):</label>
                <input
                  type="number"
                  min={1}
                  max={selectedPurchaseForSettlement.balanceDue}
                  placeholder="Enter amount"
                  value={settlementAmount}
                  onChange={e => setSettlementAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm tabular-nums font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Payment Account / Method:</label>
                <select
                  value={settlementMethod}
                  onChange={e => setSettlementMethod(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-600"
                >
                  <option value="Cash">💵 Cash in Hand</option>
                  <option value="Bank">🏦 Bank Transfer</option>
                  <option value="JazzCash">📱 JazzCash</option>
                  <option value="Easypaisa">📱 Easypaisa</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Notes / Remarks (Optional):</label>
                <input
                  type="text"
                  value={settlementNotes}
                  onChange={e => setSettlementNotes(e.target.value)}
                  placeholder="e.g. Paid via online bank transfer receipt #1234"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:border-emerald-600"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedPurchaseForSettlement(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onSettlePurchaseDue && selectedPurchaseForSettlement && Number(settlementAmount) > 0) {
                    onSettlePurchaseDue({
                      purchaseId: selectedPurchaseForSettlement.id,
                      paymentAmount: Number(settlementAmount),
                      paymentMethod: settlementMethod,
                      notes: settlementNotes,
                    });
                    setSelectedPurchaseForSettlement(null);
                  }
                }}
                disabled={!settlementAmount || Number(settlementAmount) <= 0}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-extrabold rounded-xl transition cursor-pointer shadow-md shadow-emerald-600/20"
              >
                Confirm Payment & Update Status
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const PurchasesTab = React.memo(PurchasesTabComponent);
