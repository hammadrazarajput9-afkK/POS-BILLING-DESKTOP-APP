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
  ScanLine,
  Lock,
  Copy,
  ArrowLeft,
  EyeOff,
  SlidersHorizontal,
  ChevronRight,
} from 'lucide-react';
import { useToast } from './Toast';
import { ConfirmModal } from './ConfirmModal';
import { StockModal, isMobileCategory, isAndroidCategory, isKeypadCategory } from './StockModal';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { validateImeis, distributeImeiInput, MAX_SINGLE_IMEI_LENGTH, sanitizeSingleImei, extractScannedImeiTokens } from '../utils/imeiManager';
import { generateSinglePurchasePdf } from '../utils/pdfGenerator';
import { sharePurchaseOnWhatsApp } from '../utils/whatsappInvoice';
import { compressImage } from '../utils/imageCompressor';
import { smartFilterAndSort, smartMatch } from '../utils/smartSearch';
import { SupplierAccountModal, SupplierAccountSummary } from './SupplierAccountModal';
import { formatLedgerTimestamp, getInitials } from '../utils/ledgerFormatters';

const normalizeSupplierKey = (name?: string): string =>
  (name || 'Unknown Supplier').trim().replace(/\s+/g, ' ').toLowerCase();

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
  currentUserId?: string;
  currentUserName?: string;
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
  onRecoverMissingPurchases?: () => Promise<number> | void;
  onBackToHome?: () => void;
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
  note?: string;
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
  isAdmin = true,
  currentUserId,
  currentUserName,
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
  onRecoverMissingPurchases,
  onBackToHome,
}) => {
  const { showToast } = useToast();
  const [isRecovering, setIsRecovering] = useState(false);

  const canSalesmanEditPurchase = (p: SupplierPurchase): boolean => {
    if (isAdmin) return true;
    if (p.status === 'REVERSED') return false;
    if (p.createdByRole !== 'salesman') return false;
    if (p.createdByUserId && currentUserId && p.createdByUserId !== currentUserId) return false;
    return (p.salesmanEditCount || 0) < 1;
  };

  const handleTriggerRecover = async () => {
    if (!onRecoverMissingPurchases || isRecovering) return;
    setIsRecovering(true);
    try {
      await onRecoverMissingPurchases();
    } finally {
      setIsRecovering(false);
    }
  };
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'REVERSED' | 'PAID' | 'DUE'>('ALL');
  const [dateFilter, setDateFilter] = useState('');
  const [inwardTab, setInwardTab] = useState<'suppliers' | 'bills' | 'due'>('suppliers');
  const [hideAmounts, setHideAmounts] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [sortBy, setSortBy] = useState<'due' | 'latest' | 'name'>(isAdmin ? 'due' : 'latest');
  const [isSearchScannerOpen, setIsSearchScannerOpen] = useState(false);
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [scannerTarget, setScannerTarget] = useState<{ itemIdx: number; imeiIdx: number } | null>(null);

  // Modals & Unified Supplier Account State
  const [activeSupplierKey, setActiveSupplierKey] = useState<string | null>(null);
  const [isPartyDropdownOpen, setIsPartyDropdownOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [selectedPurchaseForView, setSelectedPurchaseForView] = useState<SupplierPurchase | null>(null);
  const [selectedPurchaseForSettlement, setSelectedPurchaseForSettlement] = useState<SupplierPurchase | null>(null);
  const [settlementAmount, setSettlementAmount] = useState<number | ''>('');
  const [settlementNotes, setSettlementNotes] = useState<string>('');
  const [purchaseToDelete, setPurchaseToDelete] = useState<SupplierPurchase | null>(null);
  const [purchaseToReverse, setPurchaseToReverse] = useState<SupplierPurchase | null>(null);
  const [reversalReason, setReversalReason] = useState<string>('Goods Returned to Supplier');
  const [reversalNotes, setReversalNotes] = useState<string>('');
  const [reversedBy, setReversedBy] = useState<string>('Admin');
  const [zoomImage, setZoomImage] = useState<string | null>(null);

  // Intercept hardware/navigation Back button for topmost PurchasesTab modals
  useEffect(() => {
    const handleHardwareBack = (e: Event) => {
      if (isSearchScannerOpen || isScannerModalOpen || isStockModalOpen || purchaseToDelete) return;
      if (document.body.dataset.supplierSettleOpen === '1') return;
      if (zoomImage) {
        e.preventDefault();
        setZoomImage(null);
        return;
      }
      if (purchaseToReverse) {
        e.preventDefault();
        setPurchaseToReverse(null);
        return;
      }
      if (selectedPurchaseForSettlement) {
        e.preventDefault();
        setSelectedPurchaseForSettlement(null);
        return;
      }
      if (selectedPurchaseForView) {
        e.preventDefault();
        setSelectedPurchaseForView(null);
        return;
      }
      if (isAddModalOpen) {
        e.preventDefault();
        setIsAddModalOpen(false);
        setEditingPurchaseId(null);
        return;
      }
      if (activeSupplierKey) {
        e.preventDefault();
        setActiveSupplierKey(null);
      }
    };
    window.addEventListener('pos-hardware-back', handleHardwareBack);
    return () => window.removeEventListener('pos-hardware-back', handleHardwareBack);
  }, [
    isSearchScannerOpen,
    isScannerModalOpen,
    isStockModalOpen,
    purchaseToDelete,
    zoomImage,
    purchaseToReverse,
    selectedPurchaseForSettlement,
    selectedPurchaseForView,
    isAddModalOpen,
    activeSupplierKey,
  ]);

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
    if (!productSearch.trim()) return inventory.slice(0, 8);
    return smartFilterAndSort(inventory, productSearch, inv => {
      const imeiStr = [
        inv.imei || '',
        ...(inv.imeis || []),
        ...(inv.variants?.flatMap(v => v.imeis || []) || []),
      ].join(' ');
      const specs = (inv.variants || [])
        .map(v => `${v.ram || ''} ${v.storage || ''} ${v.color || ''}`)
        .join(' ');
      return {
        primary: [inv.name, inv.category],
        secondary: [inv.ram, inv.storage, inv.color, specs, inv.barcode, imeiStr],
      };
    }).slice(0, 20);
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
      if (clean.toLowerCase().includes('used')) {
        const usedCat = categories.find(c => c.toLowerCase().includes('used'));
        if (usedCat) return usedCat;
      }
      const androidCat = categories.find(c => isAndroidCategory(c) && !c.toLowerCase().includes('used')) ||
        categories.find(c => isAndroidCategory(c));
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
        note: '',
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
        paymentMethod: 'Cash',
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
    setIsPartyDropdownOpen(false);
    setIsAddModalOpen(true);
  };

  const openAddModalForSupplier = (supplierName: string, supplierPhone?: string) => {
    resetForm();
    setPartyName(supplierName);
    if (supplierPhone) setPartyPhone(supplierPhone);
    setIsPartyDropdownOpen(false);
    setIsAddModalOpen(true);
  };

  const openEditModal = (purchase: SupplierPurchase) => {
    if (!isAdmin && !canSalesmanEditPurchase(purchase)) {
      showToast('You can only edit your own stock-inward entry once.', 'warning');
      return;
    }
    setEditingPurchaseId(purchase.id);
    setPartyName(purchase.partyName || '');
    setPartyPhone(purchase.partyPhone || '');
    setBillNo(purchase.billNo || '');
    setPurchaseDate((purchase.date || new Date().toISOString()).substring(0, 10));
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
        note: it.note || '',
      };
    });

    setItems(mappedItems);
    setIsAddModalOpen(true);
  };

  // Image Upload handler (Automatically compressed ~50KB JPEG to protect Firestore storage)
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      showToast('Image size exceeds 10MB limit', 'error');
      return;
    }

    try {
      const compressed = await compressImage(file, 800, 0.72);
      setInvoiceImage(compressed);
      showToast('Supplier bill photo compressed & attached!', 'success');
    } catch {
      showToast('Failed to process image file', 'error');
    }
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
        note: '',
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

  const handleDuplicateItemRow = (index: number) => {
    const source = items[index];
    if (!source) return;
    const nextRow: InwardDraftItem = {
      name: source.name,
      category: source.category,
      qty: '',
      ram: source.ram || '',
      storage: source.storage || '',
      color: '',
      costPrice: '',
      wholesalePrice: '',
      salePrice: '',
      imei: '',
      imeis: [],
      barcode: source.barcode || '',
      note: source.note || '',
    };
    setItems(prev => {
      const copy = [...prev];
      copy.splice(index + 1, 0, nextRow);
      return copy;
    });
    showToast('Row duplicated — matching Name + RAM/Storage prices auto-highlighted!', 'info');
  };

  const isSameInwardSpecForAutoPrice = (a: InwardDraftItem, b: InwardDraftItem): boolean => {
    const aName = (a.name || '').trim().toLowerCase();
    const bName = (b.name || '').trim().toLowerCase();
    if (!aName || !bName || aName !== bName) return false;
    if ((a.category || '').trim().toLowerCase() !== (b.category || '').trim().toLowerCase()) return false;

    if (isKeypadCategory(a.category) && isKeypadCategory(b.category)) {
      return true;
    }

    if (isAndroidCategory(a.category) || isAndroidCategory(b.category)) {
      const aRam = (a.ram || '').trim().toLowerCase();
      const bRam = (b.ram || '').trim().toLowerCase();
      const aSto = (a.storage || '').trim().toLowerCase();
      const bSto = (b.storage || '').trim().toLowerCase();
      if (!aRam && !aSto) return false;
      return aRam === bRam && aSto === bSto;
    }

    return true;
  };

  const getInwardPriceSuggestion = (
    itemsList: InwardDraftItem[],
    idx: number,
    field: 'costPrice' | 'wholesalePrice' | 'salePrice'
  ): number | '' => {
    const target = itemsList[idx];
    if (!target) return '';
    if (target[field] !== '' && target[field] !== undefined) return '';

    const sibling = itemsList.find(
      (s, j) =>
        j !== idx &&
        isSameInwardSpecForAutoPrice(target, s) &&
        s[field] !== '' &&
        s[field] !== undefined
    );
    if (sibling && sibling[field] !== '' && sibling[field] !== undefined) {
      return Number(sibling[field]);
    }
    return '';
  };

  const getResolvedInwardPrice = (
    itemsList: InwardDraftItem[],
    idx: number,
    field: 'costPrice' | 'wholesalePrice' | 'salePrice'
  ): number | undefined => {
    const item = itemsList[idx];
    if (!item) return undefined;
    if (item[field] !== '' && item[field] !== undefined) {
      return Number(item[field]);
    }
    const sugg = getInwardPriceSuggestion(itemsList, idx, field);
    return sugg !== '' ? Number(sugg) : undefined;
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

  // Calculations (incorporating auto-highlighted matching Name+RAM+Storage prices)
  const totalBillAmount = useMemo(() => {
    return items.reduce((acc, item, idx) => {
      const effCost = getResolvedInwardPrice(items, idx, 'costPrice') ?? 0;
      return acc + (Number(item.qty) || 0) * effCost;
    }, 0);
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

    const indexedValidItems = items
      .map((item, idx) => {
        const effCost = getResolvedInwardPrice(items, idx, 'costPrice') ?? 0;
        const effWholesale = getResolvedInwardPrice(items, idx, 'wholesalePrice');
        const effSale = getResolvedInwardPrice(items, idx, 'salePrice');
        return { item, idx, effCost, effWholesale, effSale };
      })
      .filter(
        entry =>
          entry.item.name.trim() !== '' &&
          (Number(entry.item.qty) || 0) > 0 &&
          entry.effCost >= 0
      );

    if (indexedValidItems.length === 0) {
      showToast('Please add at least one valid item with name, quantity, and cost price', 'warning');
      return;
    }

    // Collect all entered IMEIs across all inward items to validate uniqueness
    const allInwardImeis: string[] = [];
    for (const { item } of indexedValidItems) {
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

    const purchaseItems: PurchaseItem[] = indexedValidItems.map(
      ({ item, effCost, effWholesale, effSale }, idx) => {
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
          costPrice: effCost,
          salePrice: effSale !== undefined ? effSale : effCost * 1.15,
          wholesalePrice: effWholesale,
          total: (Number(item.qty) || 1) * effCost,
          ram: isAndroidCategory(item.category) ? item.ram?.trim() || undefined : undefined,
        storage: isAndroidCategory(item.category) ? item.storage?.trim() || undefined : undefined,
        color: isMobileCategory(item.category) ? item.color?.trim() || undefined : undefined,
        barcode: !isMobileCategory(item.category) ? item.barcode?.trim() || undefined : undefined,
        imei: cleanImeis.length > 0 ? cleanImeis.join(', ') : undefined,
        imeis: cleanImeis.length > 0 ? cleanImeis : undefined,
        note: item.note?.trim() || undefined,
      };
    });

    const effectivePaymentMethod = isAdmin
      ? 'Cash'
      : editingPurchaseId && originalPurchase
      ? originalPurchase.paymentMethod || 'Credit'
      : 'Credit';
    const effectivePaidAmount = isAdmin
      ? calculatedPaidAmount
      : editingPurchaseId && originalPurchase
      ? originalPurchase.paidAmount || 0
      : 0;
    const effectiveBalanceDue = isAdmin
      ? balanceDue
      : Math.max(0, totalBillAmount - effectivePaidAmount);

    const newPurchaseData: Omit<SupplierPurchase, 'id'> = {
      billNo: billNo.trim() || generateInwardBillNo(purchaseDate, purchases),
      partyName: partyName.trim(),
      partyPhone: partyPhone.trim() || undefined,
      date: purchaseDate,
      items: purchaseItems,
      totalAmount: totalBillAmount,
      paidAmount: effectivePaidAmount,
      balanceDue: effectiveBalanceDue,
      paymentMethod: effectivePaymentMethod,
      notes: notes.trim() || undefined,
      invoiceImage: invoiceImage || undefined,
      createdByRole: originalPurchase?.createdByRole || (isAdmin ? 'admin' : 'salesman'),
      createdByUserId: originalPurchase?.createdByUserId || currentUserId,
      createdByName: originalPurchase?.createdByName || currentUserName || (isAdmin ? 'Admin' : 'Salesman'),
      salesmanEditCount: editingPurchaseId && !isAdmin
        ? (originalPurchase?.salesmanEditCount || 0) + 1
        : originalPurchase?.salesmanEditCount || 0,
    };

    if (editingPurchaseId && onUpdatePurchase) {
      onUpdatePurchase(editingPurchaseId, newPurchaseData, autoAddToInventory);
      setIsAddModalOpen(false);
      resetForm();
      return;
    }

    onSavePurchase(newPurchaseData, autoAddToInventory);
    showToast(
      isAdmin
        ? `Stock inward recorded in ${newPurchaseData.partyName} account (${currency} ${totalBillAmount.toLocaleString()})`
        : `Stock inward saved in ${newPurchaseData.partyName} account!`,
      'success'
    );
    clearDraft();
    setActiveSupplierKey(normalizeSupplierKey(newPurchaseData.partyName));
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

  // Unified Supplier Accounts (one account per supplier grouping all bills & stock inward history)
  const supplierAccounts = useMemo<SupplierAccountSummary[]>(() => {
    const groups = new Map<string, SupplierPurchase[]>();
    purchases.forEach(p => {
      const key = normalizeSupplierKey(p.partyName);
      const list = groups.get(key) || [];
      list.push(p);
      groups.set(key, list);
    });

    const accounts: SupplierAccountSummary[] = [];
    groups.forEach((rawBills, key) => {
      const bills = [...rawBills].sort(
        (a, b) =>
          new Date(b.date).getTime() - new Date(a.date).getTime() ||
          new Date(b.updatedAt || b.date).getTime() - new Date(a.updatedAt || a.date).getTime()
      );

      let canonicalName = bills[0]?.partyName?.trim() || 'Unknown Supplier';
      let latestPhone: string | undefined;
      let activeBillsCount = 0;
      let reversedBillsCount = 0;
      let totalUnits = 0;
      let totalAmount = 0;
      let totalPaid = 0;
      let totalDue = 0;

      for (const b of bills) {
        if (!latestPhone && b.partyPhone && b.partyPhone.trim()) {
          latestPhone = b.partyPhone.trim();
        }
        if (b.status === 'REVERSED') {
          reversedBillsCount += 1;
          continue;
        }
        activeBillsCount += 1;
        totalAmount += b.totalAmount || 0;
        totalPaid += b.paidAmount || 0;
        totalDue += b.balanceDue || 0;
        (b.items || []).forEach(it => {
          totalUnits += it.qty || 0;
        });
      }

      if (!canonicalName) canonicalName = 'Unknown Supplier';

      accounts.push({
        key,
        partyName: canonicalName,
        partyPhone: latestPhone,
        bills,
        activeBillsCount,
        reversedBillsCount,
        totalUnits,
        totalAmount,
        totalPaid,
        totalDue,
        latestDate: bills[0]?.date || new Date().toISOString(),
      });
    });

    return accounts.sort((a, b) => {
      if (isAdmin && b.totalDue !== a.totalDue) {
        return b.totalDue - a.totalDue;
      }
      return new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime();
    });
  }, [purchases, isAdmin]);

  const activeSupplierAccount = useMemo(
    () => (activeSupplierKey ? supplierAccounts.find(s => s.key === activeSupplierKey) || null : null),
    [activeSupplierKey, supplierAccounts]
  );

  // Filtered Supplier Accounts for list view
  const filteredSupplierAccounts = useMemo(() => {
    const q = search.trim();
    const qLower = q.toLowerCase();

    return supplierAccounts.filter(acc => {
      const accountMatchByHeader =
        !q ||
        smartMatch(qLower, [acc.partyName], [isAdmin ? acc.partyPhone : '']);

      const matchingBills = acc.bills.filter(p => {
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
        if (!matchesStatus || !matchesDate) return false;

        if (!q) return true;
        if (accountMatchByHeader) return true;

        const itemsText = (p.items || [])
          .map(i => {
            const imeisStr = [i.imei || '', ...(i.imeis || [])].join(' ');
            return `${i.name} ${i.category || ''} ${i.ram || ''} ${i.storage || ''} ${i.color || ''} ${i.barcode || ''} ${imeisStr}`;
          })
          .join(' ');

        return (
          billNosFromImeiRecords.has((p.billNo || '').trim().toLowerCase()) ||
          smartMatch(
            qLower,
            [p.partyName, p.billNo, itemsText],
            [isAdmin ? p.partyPhone : '', p.notes]
          )
        );
      });

      return matchingBills.length > 0;
    });
  }, [supplierAccounts, search, statusFilter, dateFilter, billNosFromImeiRecords, isAdmin]);

  // Supplier autocomplete suggestions inside Add/Edit Purchase modal
  const matchingFormSuppliers = useMemo(() => {
    const q = partyName.trim().toLowerCase();
    if (!q) return supplierAccounts.slice(0, 12);
    return supplierAccounts
      .filter(
        s =>
          s.partyName.toLowerCase().includes(q) ||
          (isAdmin && s.partyPhone && s.partyPhone.toLowerCase().includes(q))
      )
      .slice(0, 12);
  }, [supplierAccounts, partyName, isAdmin]);

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

  // Filtered & sorted supplier accounts respecting inwardTab & sortBy
  const displayedSupplierAccounts = useMemo(() => {
    const base =
      inwardTab === 'due'
        ? filteredSupplierAccounts.filter(acc => acc.totalDue > 0)
        : filteredSupplierAccounts;

    return [...base].sort((a, b) => {
      if (sortBy === 'name') return a.partyName.localeCompare(b.partyName);
      if (sortBy === 'due' && isAdmin) {
        if (b.totalDue !== a.totalDue) return b.totalDue - a.totalDue;
      }
      return new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime();
    });
  }, [filteredSupplierAccounts, inwardTab, sortBy, isAdmin]);

  // Flat chronological bills for the "All Bills" ledger view
  const filteredAllBills = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...purchases]
      .filter(p => {
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
        if (!matchesStatus) return false;
        if (dateFilter && !p.date.startsWith(dateFilter)) return false;
        if (!q) return true;

        const itemsText = (p.items || [])
          .map(i => `${i.name} ${i.category || ''} ${i.ram || ''} ${i.storage || ''} ${i.color || ''} ${i.barcode || ''} ${i.imei || ''} ${(i.imeis || []).join(' ')}`)
          .join(' ');
        return (
          billNosFromImeiRecords.has((p.billNo || '').trim().toLowerCase()) ||
          smartMatch(q, [p.partyName, p.billNo, itemsText], [isAdmin ? p.partyPhone : '', p.notes])
        );
      })
      .sort(
        (a, b) =>
          new Date(b.date).getTime() - new Date(a.date).getTime() ||
          new Date(b.updatedAt || b.date).getTime() - new Date(a.updatedAt || a.date).getTime()
      );
  }, [purchases, search, statusFilter, dateFilter, billNosFromImeiRecords, isAdmin]);

  const dueSupplierCount = useMemo(
    () => supplierAccounts.filter(a => a.totalDue > 0).length,
    [supplierAccounts]
  );

  return (
    <div className="space-y-3 pb-24 animate-in fade-in duration-200">
      {/* Top Blue Header + Overlapping Summary Card (White & Blue Theme) */}
      <div>
        <div className="bg-blue-600 text-white rounded-2xl shadow-sm pt-3.5 pb-11 px-3.5 sm:px-5">
          {/* Row 1: Title & Quick Pill CTA */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              {onBackToHome && (
                <button
                  type="button"
                  onClick={onBackToHome}
                  className="lg:hidden w-8 h-8 -ml-1 rounded-full hover:bg-white/15 flex items-center justify-center transition cursor-pointer shrink-0"
                  aria-label="Back to home"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-extrabold tracking-tight truncate">
                  Stock Inward
                </h2>
              </div>
            </div>

            {isAdmin ? (
              <button
                type="button"
                onClick={() => setInwardTab(prev => (prev === 'due' ? 'suppliers' : 'due'))}
                className={`px-3.5 py-1.5 rounded-full text-[11px] font-black tracking-wide uppercase shadow-xs transition cursor-pointer shrink-0 ${
                  inwardTab === 'due'
                    ? 'bg-white text-blue-700'
                    : 'bg-slate-900/90 hover:bg-slate-900 text-white'
                }`}
              >
                {inwardTab === 'due' ? 'ALL SUPPLIERS' : `DUE BILLS (${dueSupplierCount})`}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setInwardTab(prev => (prev === 'bills' ? 'suppliers' : 'bills'))}
                className="px-3.5 py-1.5 rounded-full bg-slate-900/90 hover:bg-slate-900 text-white text-[11px] font-black tracking-wide uppercase shadow-xs transition cursor-pointer shrink-0"
              >
                {inwardTab === 'bills' ? 'SUPPLIERS' : 'ALL ENTRIES'}
              </button>
            )}
          </div>

          {/* Row 2: Clean Underline Sub-Tabs */}
          <div className="mt-3.5 flex items-center gap-6 border-b border-white/15">
            {(isAdmin
              ? ([
                  { id: 'suppliers', label: 'Suppliers' },
                  { id: 'bills', label: 'All Bills' },
                  { id: 'due', label: 'Due Only' },
                ] as const)
              : ([
                  { id: 'suppliers', label: 'Suppliers' },
                  { id: 'bills', label: 'All Entries' },
                ] as const)
            ).map(tab => {
              const active = inwardTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setInwardTab(tab.id)}
                  className={`pb-2.5 text-[13px] font-bold transition relative cursor-pointer ${
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

        {/* Overlapping White Summary Card */}
        <div className="-mt-8 mx-2 sm:mx-4 bg-white rounded-2xl border border-slate-200/90 shadow-sm px-3.5 py-3">
          <div className="flex items-center justify-between mb-1.5">
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setHideAmounts(prev => !prev)}
                className="text-[11px] font-medium text-slate-500 hover:text-slate-700 flex items-center gap-1 cursor-pointer"
              >
                {hideAmounts ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                <span>{hideAmounts ? 'Show Amounts' : 'Hide Amounts'}</span>
              </button>
            ) : (
              <span className="text-[11px] font-medium text-slate-500">
                Stock Inward Overview
              </span>
            )}

            <button
              type="button"
              onClick={() => setInwardTab('bills')}
              className="text-[11px] font-bold text-blue-600 hover:text-blue-700 cursor-pointer flex items-center gap-0.5 tabular-nums"
            >
              <span>All Bills ({purchases.length})</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {isAdmin ? (
            <>
              <button
                type="button"
                onClick={() => setInwardTab(prev => (prev === 'bills' ? 'suppliers' : 'bills'))}
                className="w-full flex items-center justify-between gap-2 text-left cursor-pointer group"
              >
                <div className="flex-1 text-center py-0.5">
                  <p className="text-base sm:text-xl font-extrabold text-emerald-600 tabular-nums leading-tight">
                    {hideAmounts ? `${currency} •••••` : `${currency} ${stats.totalPaid.toLocaleString()}`}
                  </p>
                  <p className="text-[11px] font-medium text-slate-500 mt-0.5">Total Paid</p>
                </div>

                <div className="w-px h-9 bg-slate-100 shrink-0" />

                <div className="flex-1 text-center py-0.5">
                  <p className="text-base sm:text-xl font-extrabold text-rose-600 tabular-nums leading-tight">
                    {hideAmounts ? `${currency} •••••` : `${currency} ${stats.totalDue.toLocaleString()}`}
                  </p>
                  <p className="text-[11px] font-medium text-slate-500 mt-0.5">Payable Due</p>
                </div>

                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition shrink-0" />
              </button>

              <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
                <span>
                  Purchased:{' '}
                  <strong className="text-slate-800">
                    {hideAmounts ? `${currency} •••••` : `${currency} ${stats.totalPurchased.toLocaleString()}`}
                  </strong>
                </span>
                <span>
                  Inward: <strong className="text-slate-800">{stats.totalInwardUnits.toLocaleString()} pcs</strong>
                </span>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between gap-2 text-center py-0.5">
              <div className="flex-1">
                <p className="text-base sm:text-xl font-extrabold text-blue-600 tabular-nums">
                  {purchases.filter(p => p.status !== 'REVERSED').length} Bills
                </p>
                <p className="text-[11px] font-medium text-slate-500">Active Entries</p>
              </div>
              <div className="w-px h-9 bg-slate-100 shrink-0" />
              <div className="flex-1">
                <p className="text-base sm:text-xl font-extrabold text-slate-900 tabular-nums">
                  {stats.totalInwardUnits.toLocaleString()} pcs
                </p>
                <p className="text-[11px] font-medium text-slate-500">Units Received</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Search + Scan IMEI + Filter + PDF Toolbar */}
      <div className="flex items-center gap-2 px-0.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={`Search ${supplierAccounts.length} Suppliers, IMEI, bill #...`}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 h-10 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 shadow-2xs transition"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setIsSearchScannerOpen(true)}
          className="h-10 px-2.5 sm:px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0"
          title="Scan IMEI / Barcode to find Supplier Party"
        >
          <ScanLine className="w-4 h-4" />
          <span className="hidden sm:inline">Scan IMEI</span>
        </button>

        <button
          type="button"
          onClick={() => setShowFilterPanel(prev => !prev)}
          className={`h-10 w-10 rounded-xl border flex items-center justify-center transition cursor-pointer shrink-0 ${
            showFilterPanel || statusFilter !== 'ALL' || !!dateFilter
              ? 'bg-blue-50 border-blue-300 text-blue-700'
              : 'bg-white border-slate-200 text-blue-600 hover:bg-slate-50'
          }`}
          title="Filter, Sort & Recovery Tools"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>

        {isAdmin && onOpenPdfReport && (
          <button
            type="button"
            onClick={onOpenPdfReport}
            className="h-10 px-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-blue-600 flex flex-col items-center justify-center transition cursor-pointer shrink-0"
            title="Download Purchase PDF Report"
          >
            <FileText className="w-3.5 h-3.5 leading-none" />
            <span className="text-[9px] font-black leading-none mt-0.5">PDF</span>
          </button>
        )}
      </div>

      {/* Expandable Filter, Sort & Recovery Strip */}
      {showFilterPanel && (
        <div className="bg-white border border-slate-200 rounded-2xl p-3 space-y-2.5 shadow-2xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">
              Status:
            </span>
            {(isAdmin
              ? (['ALL', 'ACTIVE', 'DUE', 'PAID', 'REVERSED'] as const)
              : (['ALL', 'ACTIVE', 'REVERSED'] as const)
            ).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition cursor-pointer ${
                  statusFilter === tab
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab === 'ALL'
                  ? 'All'
                  : tab === 'ACTIVE'
                  ? 'Active'
                  : tab === 'DUE'
                  ? 'Due'
                  : tab === 'PAID'
                  ? 'Paid'
                  : 'Reversed'}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">
                Sort:
              </span>
              {([
                ...(isAdmin ? [{ id: 'due', label: 'Highest Due' } as const] : []),
                { id: 'latest', label: 'Latest Inward' } as const,
                { id: 'name', label: 'Name A–Z' } as const,
              ]).map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSortBy(opt.id)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition cursor-pointer ${
                    sortBy === opt.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={dateFilter}
                onChange={e => setDateFilter(e.target.value)}
                className="h-8 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] tabular-nums font-semibold text-slate-700 focus:outline-none focus:border-blue-600"
              />
              {dateFilter && (
                <button
                  type="button"
                  onClick={() => setDateFilter('')}
                  className="text-[11px] text-rose-600 font-bold px-1.5 cursor-pointer"
                >
                  Clear
                </button>
              )}
              {isAdmin && onRecoverMissingPurchases && (
                <button
                  type="button"
                  onClick={handleTriggerRecover}
                  disabled={isRecovering}
                  className="h-8 px-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
                >
                  <RotateCcw className={`w-3 h-3 ${isRecovering ? 'animate-spin' : ''}`} />
                  <span>{isRecovering ? 'Scanning...' : 'Recover Old Bills'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Prominent IMEI -> Supplier / Party Match Card */}
      {imeiPartyMatches.length > 0 && (
        <div className="bg-blue-50/80 border border-blue-200 rounded-2xl p-3.5 space-y-2 shadow-2xs animate-in fade-in">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-extrabold text-blue-900">
              <Smartphone className="w-4 h-4 text-blue-600" />
              <span>
                IMEI Party Lookup ({imeiPartyMatches.length} match{imeiPartyMatches.length > 1 ? 'es' : ''})
              </span>
            </div>
            <span className="text-[11px] font-semibold text-blue-700">Stock Inward History</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {imeiPartyMatches.map((m, idx) => (
              <div
                key={idx}
                className="bg-white border border-blue-200/80 rounded-xl p-2.5 flex items-center justify-between gap-3"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-extrabold text-xs sm:text-sm text-slate-900 truncate">
                      {m.partyName}
                    </span>
                    {isAdmin && m.partyPhone && (
                      <span className="text-[11px] font-medium text-slate-500 tabular-nums">
                        ({m.partyPhone})
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-bold text-slate-700 truncate">{m.productName}</p>
                  <p className="text-[11px] text-slate-500 tabular-nums">
                    IMEI: <strong className="text-blue-700">{m.imei}</strong> · #{m.billNo}
                    {m.date ? ` · ${new Date(m.date).toLocaleDateString()}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveSupplierKey(normalizeSupplierKey(m.partyName))}
                    className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-[11px] font-bold cursor-pointer transition"
                  >
                    Account
                  </button>
                  {m.purchase && (
                    <button
                      type="button"
                      onClick={() => setSelectedPurchaseForView(m.purchase!)}
                      className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold cursor-pointer transition"
                    >
                      Bill
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Clean Ledger List: Suppliers OR All Bills */}
      {inwardTab === 'bills' ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl divide-y divide-slate-100 overflow-hidden shadow-2xs">
          {filteredAllBills.length === 0 ? (
            <div className="py-12 px-4 text-center space-y-2">
              <FileText className="w-9 h-9 mx-auto text-slate-300" />
              <p className="text-sm font-bold text-slate-700">No Matching Stock Inward Bills</p>
              <p className="text-xs text-slate-400">
                Try adjusting search or tap STOCK INWARD below.
              </p>
            </div>
          ) : (
            filteredAllBills.map(p => {
              const isReversed = p.status === 'REVERSED';
              const isPaid = (p.balanceDue || 0) <= 0;
              const units = (p.items || []).reduce((sum, i) => sum + (i.qty || 0), 0);
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedPurchaseForView(p)}
                  className={`px-3.5 py-3 flex items-center justify-between gap-3 hover:bg-blue-50/30 active:bg-slate-50 transition cursor-pointer ${
                    isReversed ? 'bg-rose-50/20' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-200/80 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0">
                      {getInitials(p.partyName)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] sm:text-sm font-semibold text-slate-900 truncate">
                        {p.partyName}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate tabular-nums">
                        #{p.billNo} · {units} pcs · {formatLedgerTimestamp(p.date, true)}
                      </p>
                    </div>
                  </div>

                  {isAdmin ? (
                    <div className="text-right shrink-0 tabular-nums">
                      <p
                        className={`text-[13px] sm:text-sm font-extrabold ${
                          isReversed
                            ? 'line-through text-slate-400'
                            : isPaid
                            ? 'text-emerald-600'
                            : 'text-rose-600'
                        }`}
                      >
                        {hideAmounts
                          ? `${currency} ••••`
                          : `${currency} ${(p.totalAmount || 0).toLocaleString()}`}
                      </p>
                      <p className="text-[10px] font-medium text-slate-400">
                        {isReversed
                          ? 'Reversed'
                          : isPaid
                          ? 'Paid'
                          : `Due ${currency} ${(p.balanceDue || 0).toLocaleString()}`}
                      </p>
                    </div>
                  ) : (
                    <div className="text-right shrink-0 tabular-nums">
                      <p className="text-[13px] font-extrabold text-blue-600">{units} pcs</p>
                      <p className="text-[10px] text-slate-400">
                        {isReversed ? 'Reversed' : `${p.items?.length || 0} items`}
                      </p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : displayedSupplierAccounts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-2.5">
          <Truck className="w-9 h-9 text-slate-300 mx-auto" />
          <h3 className="text-sm font-bold text-slate-800">
            {inwardTab === 'due' ? 'No Pending Supplier Dues' : 'No Supplier Accounts Found'}
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {search || dateFilter || statusFilter !== 'ALL'
              ? 'Try clearing search or filters to view all suppliers.'
              : 'Tap STOCK INWARD below to record your first supplier bill.'}
          </p>
          {isAdmin && onRecoverMissingPurchases && (
            <button
              type="button"
              onClick={handleTriggerRecover}
              disabled={isRecovering}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-60"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isRecovering ? 'animate-spin' : ''}`} />
              <span>{isRecovering ? 'Scanning...' : 'Recover Old Bills'}</span>
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200/90 rounded-2xl divide-y divide-slate-100 overflow-hidden shadow-2xs">
          {displayedSupplierAccounts.map(acc => {
            const hasDue = isAdmin && acc.totalDue > 0;
            const timeStr = formatLedgerTimestamp(acc.latestDate, true);
            return (
              <div
                key={acc.key}
                onClick={() => setActiveSupplierKey(acc.key)}
                className="px-3.5 py-3 flex items-center justify-between gap-3 hover:bg-blue-50/30 active:bg-slate-50 transition cursor-pointer group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-200/80 text-blue-700 font-bold text-xs flex items-center justify-center">
                      {getInitials(acc.partyName)}
                    </div>
                    {hasDue && (
                      <span
                        className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-white"
                        title="Payable Due"
                      />
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="text-[13px] sm:text-sm font-semibold text-slate-900 truncate group-hover:text-blue-700 transition">
                      {acc.partyName}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate tabular-nums">
                      {acc.activeBillsCount} Bill{acc.activeBillsCount === 1 ? '' : 's'} ·{' '}
                      {acc.totalUnits.toLocaleString()} pcs · {timeStr}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Subtle desktop quick Inward action on hover */}
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      openAddModalForSupplier(acc.partyName, acc.partyPhone);
                    }}
                    className="hidden lg:inline-flex opacity-0 group-hover:opacity-100 transition items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Inward
                  </button>

                  {isAdmin ? (
                    <div className="text-right tabular-nums">
                      <p
                        className={`text-[13px] sm:text-sm font-extrabold ${
                          hasDue ? 'text-rose-600' : 'text-emerald-600'
                        }`}
                      >
                        {hideAmounts
                          ? `${currency} ••••`
                          : hasDue
                          ? `${currency} ${acc.totalDue.toLocaleString()}`
                          : `${currency} ${acc.totalAmount.toLocaleString()}`}
                      </p>
                      <p className="text-[10px] font-medium text-slate-400">
                        {hasDue ? "You'll Give" : 'Settled'}
                      </p>
                    </div>
                  ) : (
                    <div className="text-right tabular-nums">
                      <p className="text-[13px] font-extrabold text-blue-600">
                        {acc.totalUnits.toLocaleString()} pcs
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {acc.activeBillsCount} bill{acc.activeBillsCount === 1 ? '' : 's'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Bottom Blue Pill CTA */}
      <button
        type="button"
        onClick={openAddModal}
        className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] right-4 z-30 h-11 px-4 rounded-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-black text-xs tracking-wide uppercase shadow-lg shadow-blue-600/30 flex items-center gap-2 transition cursor-pointer"
      >
        <Plus className="w-4 h-4" />
        <span>STOCK INWARD</span>
      </button>

      {/* ========================================================= */}
      {/* ADD PURCHASE / STOCK INWARD MODAL */}
      {/* ========================================================= */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 glass-modal-backdrop">
          <div className="glass-modal-panel animate-modal-pop rounded-2xl max-w-2xl lg:max-w-3xl w-full max-h-[82dvh] sm:max-h-[85dvh] flex flex-col overflow-hidden">
            {/* Compact Pinned Header */}
            <div className="flex items-center justify-between border-b border-slate-200/70 px-3.5 py-2.5 sm:px-5 sm:py-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 bg-blue-600 text-white rounded-xl shadow-md shrink-0">
                  <Truck className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-extrabold text-slate-900 text-xs sm:text-sm truncate">
                    {editingPurchaseId
                      ? isAdmin
                        ? `Edit Purchase / Inward Bill #${billNo}`
                        : `Edit Stock Inward #${billNo} (1-Time Edit Only)`
                      : isAdmin
                      ? 'Record Supplier Purchase / Stock Inward'
                      : 'Record Stock Inward'}
                  </h3>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">
                    {editingPurchaseId
                      ? isAdmin
                        ? 'Update party details, items, IMEIs, prices or payment status and sync inventory'
                        : 'You can edit this stock-inward entry once — changes will sync to inventory'
                      : isAdmin
                      ? 'Add inventory items directly, upload paper bill, and update ledger'
                      : 'Select party name, enter stock items & prices, and sync directly to inventory'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
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
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            </div>

            {/* Scrollable Form Body */}
            <form
              id="stock-inward-form"
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
              className="overflow-y-auto px-3.5 py-3 sm:px-5 sm:py-3.5 flex-1 min-h-0 space-y-3.5"
            >
              {/* Row 1: Supplier & Bill Meta */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200">
                <div className="relative">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Supplier Account / Party Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Select existing supplier or enter new name..."
                    value={partyName}
                    onFocus={() => setIsPartyDropdownOpen(true)}
                    onChange={e => {
                      setPartyName(e.target.value);
                      setIsPartyDropdownOpen(true);
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500"
                    autoComplete="off"
                  />
                  {isPartyDropdownOpen && matchingFormSuppliers.length > 0 && (
                    <>
                      <div
                        className="fixed inset-0 z-20"
                        onClick={() => setIsPartyDropdownOpen(false)}
                      />
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-52 overflow-y-auto divide-y divide-slate-100">
                        {matchingFormSuppliers.map(acc => (
                          <button
                            key={acc.key}
                            type="button"
                            onClick={() => {
                              setPartyName(acc.partyName);
                              if (acc.partyPhone) setPartyPhone(acc.partyPhone);
                              setIsPartyDropdownOpen(false);
                            }}
                            className="w-full px-3 py-2 text-left hover:bg-blue-50 transition flex items-center justify-between gap-2 text-xs cursor-pointer"
                          >
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 truncate">{acc.partyName}</p>
                              <p className="text-[10px] text-slate-500 tabular-nums">
                                {acc.activeBillsCount} bill{acc.activeBillsCount === 1 ? '' : 's'}
                                {isAdmin && acc.partyPhone ? ` • ${acc.partyPhone}` : ''}
                              </p>
                            </div>
                            {isAdmin && acc.totalDue > 0 && (
                              <span className="text-[10px] font-extrabold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded shrink-0 tabular-nums">
                                Due: {currency} {acc.totalDue.toLocaleString()}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
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
                      const suggCost = getInwardPriceSuggestion(items, idx, 'costPrice');
                      const suggWholesale = getInwardPriceSuggestion(items, idx, 'wholesalePrice');
                      const suggSale = getInwardPriceSuggestion(items, idx, 'salePrice');

                      const isAutoCostHint =
                        (item.costPrice === '' || item.costPrice === undefined) && suggCost !== '';
                      const isAutoWholesaleHint =
                        (item.wholesalePrice === '' || item.wholesalePrice === undefined) &&
                        suggWholesale !== '';
                      const isAutoSaleHint =
                        (item.salePrice === '' || item.salePrice === undefined) && suggSale !== '';

                      const effCost =
                        item.costPrice !== '' && item.costPrice !== undefined
                          ? Number(item.costPrice)
                          : Number(suggCost) || 0;
                      const rowTotal = (Number(item.qty) || 0) * effCost;
                      const isAndroid = isAndroidCategory(item.category);
                      const isKeypad = isKeypadCategory(item.category);
                      const isMobile = isMobileCategory(item.category);
                      const itemImeis = item.imeis || (item.imei ? item.imei.split(',').map(s => s.trim()) : ['']);

                      return (
                        <div
                          key={idx}
                          className="p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200/90 space-y-3 shadow-2xs hover:border-blue-300 transition"
                        >
                          {/* Row Header: Editable Product Name, Editable Category Switcher, Copy, Delete */}
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
                                className="allow-spinner w-full px-2.5 py-2 bg-white border border-blue-400 rounded-xl text-xs tabular-nums font-extrabold text-blue-700 text-center focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500 shadow-2xs"
                              />
                            </div>

                            <div className="sm:col-span-1 flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => handleDuplicateItemRow(idx)}
                                className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition cursor-pointer"
                                title="Copy row to add another color/variant with same specs"
                              >
                                <Copy className="w-4 h-4" />
                              </button>
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

                          {/* Pricing Row (Cost, Wholesale, Retail) with Auto-Highlight on Matching Name + RAM + Storage */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <div>
                              <label className="flex items-center justify-between gap-1 text-[10px] font-bold text-slate-600 mb-0.5">
                                <span>Cost Price ({currency}) *</span>
                                {isAutoCostHint && (
                                  <button
                                    type="button"
                                    onClick={() => handleItemChange(idx, 'costPrice', Number(suggCost))}
                                    className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300 text-[9px] font-extrabold cursor-pointer"
                                    title="Auto-matched from same Name + RAM/Storage"
                                  >
                                    Auto
                                  </button>
                                )}
                              </label>
                              <input
                                type="number"
                                min="0"
                                placeholder={isAutoCostHint ? String(suggCost) : 'Enter cost price'}
                                value={item.costPrice}
                                onChange={e => handleItemChange(idx, 'costPrice', e.target.value === '' ? '' : Number(e.target.value))}
                                className={`w-full px-2.5 py-1.5 border rounded-xl text-xs font-bold tabular-nums focus:outline-none shadow-2xs transition ${
                                  isAutoCostHint
                                    ? 'bg-amber-50/70 border-amber-400 ring-1 ring-amber-300/70 placeholder:text-amber-700/70 placeholder:font-extrabold text-slate-900 focus:border-amber-500'
                                    : 'bg-white border-slate-200 text-blue-700 focus:border-blue-500'
                                }`}
                              />
                            </div>

                            <div>
                              <label className="flex items-center justify-between gap-1 text-[10px] font-bold text-purple-900 mb-0.5">
                                <span>Wholesale Price ({currency})</span>
                                {isAutoWholesaleHint && (
                                  <button
                                    type="button"
                                    onClick={() => handleItemChange(idx, 'wholesalePrice', Number(suggWholesale))}
                                    className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300 text-[9px] font-extrabold cursor-pointer"
                                    title="Auto-matched from same Name + RAM/Storage"
                                  >
                                    Auto
                                  </button>
                                )}
                              </label>
                              <input
                                type="number"
                                min="0"
                                placeholder={isAutoWholesaleHint ? String(suggWholesale) : 'Optional'}
                                value={item.wholesalePrice ?? ''}
                                onChange={e => handleItemChange(idx, 'wholesalePrice', e.target.value === '' ? '' : Number(e.target.value))}
                                className={`w-full px-2.5 py-1.5 border rounded-xl text-xs font-bold tabular-nums focus:outline-none shadow-2xs transition ${
                                  isAutoWholesaleHint
                                    ? 'bg-amber-50/70 border-amber-400 ring-1 ring-amber-300/70 placeholder:text-amber-700/70 placeholder:font-extrabold text-purple-950 focus:border-amber-500'
                                    : 'bg-purple-50/40 border-purple-200 text-purple-800 focus:border-purple-500'
                                }`}
                              />
                            </div>

                            <div>
                              <label className="flex items-center justify-between gap-1 text-[10px] font-bold text-slate-600 mb-0.5">
                                <span>Retail Sale Price ({currency})</span>
                                {isAutoSaleHint && (
                                  <button
                                    type="button"
                                    onClick={() => handleItemChange(idx, 'salePrice', Number(suggSale))}
                                    className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300 text-[9px] font-extrabold cursor-pointer"
                                    title="Auto-matched from same Name + RAM/Storage"
                                  >
                                    Auto
                                  </button>
                                )}
                              </label>
                              <input
                                type="number"
                                min="0"
                                placeholder={isAutoSaleHint ? String(suggSale) : 'Enter retail price'}
                                value={item.salePrice}
                                onChange={e => handleItemChange(idx, 'salePrice', e.target.value === '' ? '' : Number(e.target.value))}
                                className={`w-full px-2.5 py-1.5 border rounded-xl text-xs font-semibold tabular-nums focus:outline-none shadow-2xs transition ${
                                  isAutoSaleHint
                                    ? 'bg-amber-50/70 border-amber-400 ring-1 ring-amber-300/70 placeholder:text-amber-700/70 placeholder:font-extrabold text-slate-900 focus:border-amber-500'
                                    : 'bg-white border-slate-200 text-emerald-700 focus:border-blue-500'
                                }`}
                              />
                            </div>
                          </div>

                          {/* Item / Variant Note Box (just like Add Product) */}
                          <div>
                            <label className="text-[10px] font-bold text-slate-600 mb-0.5 flex items-center gap-1">
                              <FileText className="w-3 h-3 text-amber-600" />
                              Note (Optional)
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. Box pack, PTA approved, minor scratch, battery 92%..."
                              value={item.note || ''}
                              onChange={e => handleItemChange(idx, 'note', e.target.value)}
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500 shadow-2xs"
                            />
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

                              {isAdmin && (
                                <div className="flex items-center justify-end pt-1 border-t border-blue-100">
                                  <span className="text-xs font-black text-slate-900 tabular-nums">
                                    Subtotal: {currency} {rowTotal.toLocaleString()}
                                  </span>
                                </div>
                              )}
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

                              {isAdmin && (
                                <div className="text-right">
                                  <span className="text-xs font-black text-slate-900 tabular-nums">
                                    Subtotal: {currency} {rowTotal.toLocaleString()}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Row 3: Payment Breakdown (Admin Only) & Inventory Sync */}
              <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-200/80 space-y-3">
                {isAdmin && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Cash Paid Now ({currency})
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="Enter cash paid amount"
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
                )}

                {/* Auto Inventory Sync Toggle */}
                <div className={`${isAdmin ? 'pt-2 border-t border-blue-100' : ''} flex items-center justify-between gap-3`}>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoAddToInventory}
                      onChange={e => setAutoAddToInventory(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                    />
                    <span>Automatically inject & update stock quantities in Inventory</span>
                  </label>

                  {isAdmin && (
                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 block uppercase font-bold">Grand Total</span>
                      <span className="text-base font-black text-slate-900">
                        {currency} {totalBillAmount.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

            </form>

            {/* Pinned Bottom Action Bar */}
            <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 sm:px-5 sm:py-3 border-t border-slate-200/80 bg-white/85 dark:bg-black/80 backdrop-blur-xs shrink-0">
              <button
                type="button"
                onClick={clearDraft}
                className="px-3 py-2 text-slate-500 hover:text-rose-600 text-xs font-bold transition cursor-pointer"
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
                  className="px-4 py-2 border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  form="stock-inward-form"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-xl shadow-md shadow-blue-600/20 transition cursor-pointer"
                >
                  {editingPurchaseId ? 'Update Inward Bill' : 'Save Inward Bill'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* VIEW PURCHASE DETAIL MODAL */}
      {/* ========================================================= */}
      {selectedPurchaseForView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 glass-modal-backdrop">
          <div className="glass-modal-panel animate-modal-pop rounded-2xl max-w-2xl w-full max-h-[82dvh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200/70 px-4 py-3 sm:px-5 shrink-0">
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
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 sm:px-5 space-y-3.5">
            <div className={`grid gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs ${isAdmin ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'}`}>
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
              {isAdmin && (
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
              )}
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
                      {isAdmin && <th className="py-2 px-3 text-right">Cost Price</th>}
                      {isAdmin && <th className="py-2 px-3 text-right">Subtotal</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedPurchaseForView.items.map((i, idx) => (
                      <tr key={idx}>
                        <td className="py-2 px-3">
                          <div className="font-bold text-slate-900">
                            {i.name}
                            {(i.ram || i.storage || i.color) && (
                              <span className="text-[10px] font-semibold text-indigo-600 ml-1.5">
                                {[i.ram, i.storage, i.color].filter(Boolean).join(' / ')}
                              </span>
                            )}
                          </div>
                          {i.imei && <div className="text-[10px] text-slate-400 tabular-nums">IMEI: {i.imei}</div>}
                          {i.barcode && <div className="text-[10px] text-slate-400 tabular-nums">Code: {i.barcode}</div>}
                          {i.note && (
                            <div className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200/70 rounded px-1.5 py-0.5 mt-0.5 inline-block font-medium">
                              Note: {i.note}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center font-bold">{i.qty}</td>
                        {isAdmin && (
                          <td className="py-2 px-3 text-right font-medium">
                            {currency} {i.costPrice.toLocaleString()}
                          </td>
                        )}
                        {isAdmin && (
                          <td className="py-2 px-3 text-right font-black">
                            {currency} {(i.costPrice * i.qty).toLocaleString()}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  {isAdmin && (
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
                  )}
                </table>
              </div>
            </div>

            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-2.5 sm:px-5 border-t border-slate-200/80 bg-white/85 dark:bg-black/80 shrink-0">
              {selectedPurchaseForView.status !== 'REVERSED' &&
                onUpdatePurchase &&
                (isAdmin || canSalesmanEditPurchase(selectedPurchaseForView)) && (
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
                    <span>{isAdmin ? 'Edit Bill' : 'Edit Entry (1 Edit Left)'}</span>
                  </button>
                )}
              {!isAdmin &&
                selectedPurchaseForView.status !== 'REVERSED' &&
                selectedPurchaseForView.createdByRole === 'salesman' &&
                (selectedPurchaseForView.salesmanEditCount || 0) >= 1 && (
                  <span className="px-3 py-2 bg-slate-100 text-slate-500 text-xs font-bold rounded-xl inline-flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    Edited Once (Locked)
                  </span>
                )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => handleDownloadSinglePdf(selectedPurchaseForView)}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </button>
              )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => handleShareWhatsApp(selectedPurchaseForView)}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Send on WhatsApp</span>
                </button>
              )}
              {isAdmin && selectedPurchaseForView.balanceDue > 0 && selectedPurchaseForView.status !== 'REVERSED' && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPurchaseForSettlement(selectedPurchaseForView);
                    setSettlementAmount(selectedPurchaseForView.balanceDue);
                    setSettlementNotes('');
                    setSelectedPurchaseForView(null);
                  }}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Pay Due ({currency} {selectedPurchaseForView.balanceDue.toLocaleString()})</span>
                </button>
              )}
              {isAdmin && selectedPurchaseForView.status !== 'REVERSED' && onReversePurchase && (
                <button
                  type="button"
                  onClick={() => {
                    const target = selectedPurchaseForView;
                    setSelectedPurchaseForView(null);
                    setPurchaseToReverse(target);
                    setReversalReason('Goods Returned to Supplier');
                    setReversalNotes('');
                  }}
                  className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reverse</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 glass-modal-backdrop">
          <div className="relative max-w-3xl max-h-[84dvh] glass-modal-panel animate-modal-pop rounded-2xl p-2 overflow-hidden flex flex-col">
            <button
              type="button"
              onClick={() => setZoomImage(null)}
              className="absolute top-3.5 right-3.5 z-10 p-2 bg-slate-900/70 hover:bg-slate-900 text-white rounded-full transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="overflow-auto flex-1 flex items-center justify-center p-2">
              <img
                src={zoomImage}
                alt="Scanned Bill"
                className="max-h-[74dvh] w-auto object-contain rounded-xl"
              />
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* REVERSE / CANCEL PURCHASE MODAL */}
      {/* ========================================================= */}
      {purchaseToReverse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 glass-modal-backdrop">
          <div className="glass-modal-panel animate-modal-pop rounded-2xl max-w-xl w-full max-h-[82dvh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200/70 px-4 py-3 sm:px-5 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-rose-600 text-white rounded-xl shadow-md shadow-rose-600/20">
                  <RotateCcw className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm sm:text-base">
                    Cancel & Reverse Purchase Bill
                  </h3>
                  <p className="text-[11px] text-slate-500">
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

            <div className="space-y-3.5 overflow-y-auto flex-1 min-h-0 px-4 py-3 sm:px-5">
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
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 px-4 py-2.5 sm:px-5 border-t border-slate-200/80 bg-white/85 dark:bg-black/80 shrink-0">
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
            const expandedRows: InwardDraftItem[] = [];

            for (const it of itemsArray) {
              if (it.variants && it.variants.length > 0) {
                for (const v of it.variants) {
                  const q = Math.max(1, Number(v.qty) || 1);
                  const cleanImeis = [...(v.imeis || [])].map(s => s.trim()).filter(Boolean);
                  while (cleanImeis.length < q) cleanImeis.push('');
                  const finalImeis = cleanImeis.slice(0, q);
                  expandedRows.push({
                    name: it.name,
                    category: resolveItemCategory(it.category),
                    qty: q,
                    ram: v.ram || '',
                    storage: v.storage || '',
                    color: v.color || '',
                    costPrice: v.costPrice !== '' && v.costPrice !== undefined ? Number(v.costPrice) : (it.costPrice || 0),
                    salePrice: v.salePrice !== '' && v.salePrice !== undefined ? Number(v.salePrice) : (it.salePrice || 0),
                    wholesalePrice:
                      v.wholesalePrice !== undefined && v.wholesalePrice !== ''
                        ? Number(v.wholesalePrice)
                        : it.wholesalePrice !== undefined
                        ? Number(it.wholesalePrice)
                        : '',
                    imeis: finalImeis,
                    imei: finalImeis.filter(Boolean).join(', '),
                    barcode: it.barcode || '',
                    note: v.note || it.note || '',
                  });
                }
              } else {
                const q = Math.max(1, Number(it.qty) || 1);
                const cleanImeis =
                  it.imeis && it.imeis.length > 0
                    ? [...it.imeis]
                    : it.imei
                    ? it.imei.split(',').map(s => s.trim()).filter(Boolean)
                    : [];
                while (cleanImeis.length < q) cleanImeis.push('');
                const finalImeis = cleanImeis.slice(0, q);
                expandedRows.push({
                  name: it.name,
                  category: resolveItemCategory(it.category),
                  qty: q,
                  ram: it.ram || '',
                  storage: it.storage || '',
                  color: it.color || '',
                  costPrice: it.costPrice || 0,
                  salePrice: it.salePrice || 0,
                  wholesalePrice: it.wholesalePrice !== undefined ? Number(it.wholesalePrice) : '',
                  imeis: finalImeis,
                  imei: finalImeis.filter(Boolean).join(', '),
                  barcode: it.barcode || '',
                  note: it.note || '',
                });
              }
            }

            setItems(prev => {
              let next = [...prev];
              for (const row of expandedRows) {
                const existingIdx = next.findIndex(
                  i =>
                    i.name.toLowerCase().trim() === row.name.toLowerCase().trim() &&
                    (i.category || '').toLowerCase() === (row.category || '').toLowerCase() &&
                    (i.ram || '').toLowerCase() === (row.ram || '').toLowerCase() &&
                    (i.storage || '').toLowerCase() === (row.storage || '').toLowerCase() &&
                    (i.color || '').toLowerCase() === (row.color || '').toLowerCase() &&
                    Number(i.costPrice || 0) === Number(row.costPrice || 0) &&
                    Number(i.salePrice || 0) === Number(row.salePrice || 0) &&
                    Number(i.wholesalePrice || 0) === Number(row.wholesalePrice || 0) &&
                    (i.note || '').trim().toLowerCase() === (row.note || '').trim().toLowerCase()
                );
                if (existingIdx >= 0) {
                  const copy = [...next];
                  const existingImeisList =
                    copy[existingIdx].imeis ||
                    (copy[existingIdx].imei ? copy[existingIdx].imei.split(',').map(s => s.trim()).filter(Boolean) : []);
                  const mergedImeis = [...existingImeisList, ...row.imeis];
                  const newQty = (Number(copy[existingIdx].qty) || 0) + (Number(row.qty) || 1);
                  while (mergedImeis.length < newQty) mergedImeis.push('');
                  copy[existingIdx] = {
                    ...copy[existingIdx],
                    qty: newQty,
                    imeis: mergedImeis.slice(0, newQty),
                    imei: mergedImeis.slice(0, newQty).filter(Boolean).join(', '),
                    barcode: row.barcode || copy[existingIdx].barcode,
                  };
                  next = copy;
                } else {
                  next = [...next, row];
                }
              }
              return next;
            });

            setIsStockModalOpen(false);
            showToast(
              expandedRows.length === 1
                ? `Product "${expandedRows[0].name}" added to inward bill!`
                : `${expandedRows.length} variants added to inward bill!`,
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
          isAdmin={isAdmin}
          allowCostEntry={true}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 glass-modal-backdrop">
          <div className="glass-modal-panel animate-modal-pop rounded-2xl max-w-md w-full max-h-[82dvh] overflow-y-auto p-4 sm:p-5 space-y-3.5 my-auto">
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
                <label className="block text-xs font-bold text-slate-700 mb-1">Cash Payment Amount ({currency}):</label>
                <input
                  type="number"
                  min={1}
                  max={selectedPurchaseForSettlement.balanceDue}
                  placeholder="Enter cash amount"
                  value={settlementAmount}
                  onChange={e => setSettlementAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm tabular-nums font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Notes / Remarks (Optional):</label>
                <input
                  type="text"
                  value={settlementNotes}
                  onChange={e => setSettlementNotes(e.target.value)}
                  placeholder="e.g. Paid cash receipt #1234"
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
                      paymentMethod: 'Cash',
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

      {/* ========================================================= */}
      {/* FULL-SCREEN UNIFIED SUPPLIER ACCOUNT MODAL */}
      {/* ========================================================= */}
      <SupplierAccountModal
        account={activeSupplierAccount}
        isOpen={!!activeSupplierAccount}
        onClose={() => setActiveSupplierKey(null)}
        currency={currency}
        isAdmin={isAdmin}
        canSalesmanEditPurchase={canSalesmanEditPurchase}
        onAddInwardForSupplier={openAddModalForSupplier}
        onViewBill={p => setSelectedPurchaseForView(p)}
        onEditBill={p => openEditModal(p)}
        onDownloadPdf={handleDownloadSinglePdf}
        onShareWhatsApp={handleShareWhatsApp}
        onPayBillDue={p => {
          setSelectedPurchaseForSettlement(p);
          setSettlementAmount(p.balanceDue);
          setSettlementNotes('');
        }}
        onReverseBill={p => {
          setPurchaseToReverse(p);
          setReversalReason('Goods Returned to Supplier');
          setReversalNotes('');
        }}
        onZoomImage={img => setZoomImage(img)}
        onSettlePurchaseDue={onSettlePurchaseDue}
      />
    </div>
  );
};

export const PurchasesTab = React.memo(PurchasesTabComponent);
