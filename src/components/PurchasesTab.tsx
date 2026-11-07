import React, { useState, useMemo, useEffect } from 'react';
import { SupplierPurchase, PurchaseItem, InventoryItem, ImeiRecord, SaleRecord, OnlineAccount } from '../types';
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
  Smartphone
} from 'lucide-react';
import { useToast } from './Toast';
import { ConfirmModal } from './ConfirmModal';
import { StockModal, isMobileCategory } from './StockModal';
import { validateImeis } from '../utils/imeiManager';

interface PurchasesTabProps {
  purchases: SupplierPurchase[];
  currency: string;
  categories: string[];
  inventory: InventoryItem[];
  imeiRecords?: ImeiRecord[];
  sales?: SaleRecord[];
  onlineAccounts?: OnlineAccount[];
  isAdmin?: boolean;
  onSavePurchase: (
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
}

export interface InwardDraftItem {
  name: string;
  category: string;
  qty: number | '';
  costPrice: number | '';
  salePrice: number | '';
  imei: string;
  imeis: string[];
  barcode: string;
}

const DRAFT_KEY = 'mobilepos_purchase_draft_v2';

const PurchasesTabComponent: React.FC<PurchasesTabProps> = ({
  purchases = [],
  currency,
  categories,
  inventory,
  imeiRecords = [],
  sales = [],
  onSavePurchase,
  onDeletePurchase,
  onReversePurchase,
  onOpenAddInventoryProduct,
  onAddInventoryProduct,
  onAddCategory,
}) => {
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'REVERSED' | 'PAID' | 'DUE'>('ALL');
  const [dateFilter, setDateFilter] = useState('');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [selectedPurchaseForView, setSelectedPurchaseForView] = useState<SupplierPurchase | null>(null);
  const [purchaseToDelete, setPurchaseToDelete] = useState<SupplierPurchase | null>(null);
  const [purchaseToReverse, setPurchaseToReverse] = useState<SupplierPurchase | null>(null);
  const [reversalReason, setReversalReason] = useState<string>('Goods Returned to Supplier');
  const [reversalNotes, setReversalNotes] = useState<string>('');
  const [reversedBy, setReversedBy] = useState<string>('Admin');
  const [zoomImage, setZoomImage] = useState<string | null>(null);

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

  const handleSelectProductFromInventory = (inv: InventoryItem) => {
    setItems(prev => {
      const existingIdx = prev.findIndex(
        i => i.name.toLowerCase().trim() === inv.name.toLowerCase().trim()
      );
      if (existingIdx >= 0) {
        const copy = [...prev];
        const newQty = (Number(copy[existingIdx].qty) || 0) + 1;
        const targetCount = newQty;
        const curImeis = copy[existingIdx].imeis || (copy[existingIdx].imei ? copy[existingIdx].imei.split(',').map(s => s.trim()) : []);
        const nextImeis = [...curImeis];
        while (nextImeis.length < targetCount) nextImeis.push('');

        copy[existingIdx] = {
          ...copy[existingIdx],
          qty: newQty,
          imeis: nextImeis.slice(0, targetCount),
          imei: nextImeis.slice(0, targetCount).filter(Boolean).join(', '),
        };
        showToast(`Increased inward quantity for "${inv.name}" (+1)`, 'info');
        return copy;
      }

      const initImeis = inv.imeis && inv.imeis.length > 0
        ? [...inv.imeis]
        : (inv.imei ? inv.imei.split(',').map(s => s.trim()).filter(Boolean) : ['']);
      if (initImeis.length === 0) initImeis.push('');

      showToast(`Added "${inv.name}" to inward stock list`, 'success');
      return [
        ...prev,
        {
          name: inv.name,
          category: inv.category,
          qty: 1,
          costPrice: inv.costPrice || 0,
          salePrice: inv.salePrice || 0,
          imei: initImeis.filter(Boolean).join(', '),
          imeis: initImeis,
          barcode: inv.barcode || '',
        },
      ];
    });
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

  // Auto-Save Draft
  useEffect(() => {
    if (!isAddModalOpen) return;
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
        setPartyName(parsed.partyName || '');
        setPartyPhone(parsed.partyPhone || '');
        setBillNo(parsed.billNo || 'PUR-' + Math.floor(1000 + Math.random() * 9000));
        setPurchaseDate(parsed.purchaseDate || new Date().toISOString().substring(0, 10));
        setPaymentMethod(parsed.paymentMethod || 'Cash');
        setPaidAmount(parsed.paidAmount ?? '');
        setNotes(parsed.notes || '');
        setInvoiceImage(parsed.invoiceImage || '');
        setAutoAddToInventory(parsed.autoAddToInventory ?? true);
        if (Array.isArray(parsed.items) && parsed.items.length > 0) {
          setItems(
            parsed.items.map((it: any) => {
              const q = it.qty !== undefined && it.qty !== '' ? Number(it.qty) : 1;
              const itemImeis =
                it.imeis && it.imeis.length > 0
                  ? [...it.imeis]
                  : it.imei
                  ? it.imei.split(',').map((s: string) => s.trim()).filter(Boolean)
                  : [''];
              while (itemImeis.length < Math.max(1, q || 1)) itemImeis.push('');
              return {
                ...it,
                qty: it.qty !== undefined ? it.qty : 1,
                imeis: itemImeis.slice(0, Math.max(1, q || 1)),
                imei: itemImeis.filter(Boolean).join(', '),
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
    setPartyName('');
    setPartyPhone('');
    setBillNo('PUR-' + Math.floor(1000 + Math.random() * 9000));
    setPurchaseDate(new Date().toISOString().substring(0, 10));
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
    // Check if draft exists
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.partyName || (parsed.items && parsed.items.length > 0 && parsed.items[0].name)) {
          restoreDraft();
        }
      }
    } catch {
      // ignore
    }
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
        qty: 1,
        costPrice: '',
        salePrice: '',
        imei: '',
        imeis: [''],
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
      const targetCount = val === '' || val === 0 ? 1 : Math.max(1, Math.min(100, val));
      const curImeis = item.imeis || (item.imei ? item.imei.split(',').map(s => s.trim()) : []);
      const nextImeis = [...curImeis];
      while (nextImeis.length < targetCount) nextImeis.push('');
      item.imeis = nextImeis.slice(0, targetCount);
      item.imei = item.imeis.filter(Boolean).join(', ');
      copy[index] = item;
      return copy;
    });
  };

  const handleItemImeiChange = (itemIdx: number, imeiIdx: number, rawVal: string) => {
    const val = rawVal.replace(/[\r\n\t]/g, '').trimStart();
    setItems(prev => {
      const copy = [...prev];
      const item = { ...copy[itemIdx] };
      const curImeis = [...(item.imeis || [''])];
      while (curImeis.length <= imeiIdx) curImeis.push('');
      curImeis[imeiIdx] = val;
      item.imeis = curImeis;
      item.imei = curImeis.filter(Boolean).join(', ');
      copy[itemIdx] = item;
      return copy;
    });
  };

  const handleItemImeiKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    itemIdx: number,
    imeiIdx: number
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();

      const currentVal = items[itemIdx]?.imeis?.[imeiIdx]?.trim();
      if (currentVal) {
        showToast(`IMEI #${imeiIdx + 1} captured`, 'info');
      }

      // Try focusing next IMEI box in same item
      const nextSameItem = document.getElementById(`purchase-item-imei-${itemIdx}-${imeiIdx + 1}`);
      if (nextSameItem) {
        nextSameItem.focus();
        return;
      }

      // Try focusing first IMEI box in next item
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

    const tokens = pasted
      .split(/[\r\n,]+/)
      .map(t => t.trim())
      .filter(Boolean);

    if (tokens.length > 1) {
      e.preventDefault();
      setItems(prev => {
        const copy = [...prev];
        const item = { ...copy[itemIdx] };
        const curImeis = [...(item.imeis || [''])];

        for (let i = 0; i < tokens.length; i++) {
          const targetIndex = imeiIdx + i;
          if (targetIndex < curImeis.length) {
            curImeis[targetIndex] = tokens[i].replace(/[^0-9a-zA-Z]/g, '');
          }
        }

        item.imeis = curImeis;
        item.imei = curImeis.filter(Boolean).join(', ');
        copy[itemIdx] = item;
        return copy;
      });
      showToast(`${tokens.length} IMEIs populated from scan/paste!`, 'success');
    }
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };

      // Autocomplete if user selects existing inventory product
      if (field === 'name') {
        const matched = inventory.find(
          inv => inv.name.toLowerCase() === String(value).toLowerCase()
        );
        if (matched) {
          updated[index].category = matched.category || updated[index].category;
          if (!updated[index].costPrice || updated[index].costPrice === 0) {
            updated[index].costPrice = matched.costPrice || '';
          }
          if (!updated[index].salePrice || updated[index].salePrice === 0) {
            updated[index].salePrice = matched.salePrice || '';
          }
          if (matched.barcode && !updated[index].barcode) {
            updated[index].barcode = matched.barcode;
          }
          if (matched.imeis && matched.imeis.length > 0) {
            updated[index].imeis = [...matched.imeis];
            updated[index].imei = matched.imeis.join(', ');
          } else if (matched.imei) {
            updated[index].imei = matched.imei;
            updated[index].imeis = matched.imei.split(',').map(s => s.trim());
          }
        }
      }

      return updated;
    });
  };

  // Calculations
  const totalBillAmount = useMemo(() => {
    return items.reduce((acc, item) => acc + (Number(item.qty) || 0) * (Number(item.costPrice) || 0), 0);
  }, [items]);

  const calculatedPaidAmount = paidAmount === '' ? totalBillAmount : Number(paidAmount);
  const balanceDue = Math.max(0, totalBillAmount - calculatedPaidAmount);

  // Submit New Purchase
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

    if (allInwardImeis.length > 0) {
      const validation = validateImeis({
        imeisToCheck: allInwardImeis,
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
      const cleanImeis = (item.imeis && item.imeis.length > 0)
        ? item.imeis.map(s => s.trim()).filter(Boolean)
        : (item.imei ? item.imei.split(',').map(s => s.trim()).filter(Boolean) : []);

      return {
        id: 'PITM-' + Date.now() + '-' + idx,
        name: item.name.trim(),
        category: item.category,
        qty: Number(item.qty) || 1,
        costPrice: Number(item.costPrice) || 0,
        salePrice: Number(item.salePrice) || Number(item.costPrice) * 1.15,
        total: (Number(item.qty) || 1) * (Number(item.costPrice) || 0),
        barcode: item.barcode?.trim() || undefined,
        imei: cleanImeis.length > 0 ? cleanImeis.join(', ') : undefined,
        imeis: cleanImeis.length > 0 ? cleanImeis : undefined,
      };
    });

    const newPurchaseData: Omit<SupplierPurchase, 'id'> = {
      billNo: billNo.trim() || 'PUR-' + Math.floor(1000 + Math.random() * 9000),
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

    onSavePurchase(newPurchaseData, autoAddToInventory);
    showToast(`Purchase bill recorded successfully (${currency} ${totalBillAmount.toLocaleString()})`, 'success');
    clearDraft();
    setIsAddModalOpen(false);
    resetForm();
  };

  // Filtered Purchases list
  const filteredPurchases = useMemo(() => {
    return purchases
      .filter(p => {
        const matchesSearch =
          p.partyName.toLowerCase().includes(search.toLowerCase()) ||
          p.billNo.toLowerCase().includes(search.toLowerCase()) ||
          (p.partyPhone && p.partyPhone.includes(search)) ||
          p.items.some(i => i.name.toLowerCase().includes(search.toLowerCase()));

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
  }, [purchases, search, statusFilter, dateFilter]);

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
      {/* Top Header & Stat Cards */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <span className="p-2 bg-blue-600 text-white rounded-xl shadow-md shadow-blue-500/20">
              <Truck className="w-5 h-5" />
            </span>
            Supplier Purchases & Stock Inward
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Record supplier bills, upload physical invoices, and automatically inject items into inventory
          </p>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/25 transition cursor-pointer active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Add Purchase / Inward Bill
        </button>
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
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by supplier, bill number, phone, or item..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold">
            {(['ALL', 'ACTIVE', 'REVERSED', 'PAID', 'DUE'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
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
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer"
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
                          <div className="flex items-center gap-1.5 font-mono font-bold text-slate-900">
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
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 font-mono">
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
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedPurchaseForView(p)}
                              className="p-1.5 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                              title="View Purchase Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

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
                        <span className="font-mono font-extrabold text-xs text-slate-900">
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
                      <span className="font-mono font-black text-sm text-slate-900 tabular-nums">
                        {currency} {p.totalAmount.toLocaleString()}
                      </span>
                      {p.balanceDue > 0 && !isReversed && (
                        <span className="text-[10px] font-mono font-bold text-rose-600 block">
                          Due: {currency} {p.balanceDue.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Mobile Touch Action Bar */}
                  <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 text-xs">
                    <div className="flex items-center gap-1.5">
                      {p.invoiceImage && (
                        <button
                          type="button"
                          onClick={() => setZoomImage(p.invoiceImage!)}
                          className="px-2.5 py-1.5 bg-blue-50 text-blue-700 font-bold rounded-xl text-xs flex items-center gap-1 border border-blue-200 min-h-[40px] cursor-pointer"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>Bill Photo</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedPurchaseForView(p)}
                        className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center gap-1 min-h-[40px] cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Details</span>
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
                    Record Supplier Purchase / Stock Inward
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Add inventory items directly, upload paper bill, and update ledger
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {hasDraft && draftSavedTime && (
                  <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-[10px] font-bold">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    <span>Draft Saved ({draftSavedTime})</span>
                    <button
                      type="button"
                      onClick={clearDraft}
                      className="ml-1 text-slate-400 hover:text-rose-600"
                      title="Clear saved draft"
                    >
                      ×
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
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
                    placeholder="INV-9901"
                    value={billNo}
                    onChange={e => setBillNo(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold focus:outline-none focus:border-blue-500"
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
                    onChange={e => setPurchaseDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500"
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
                      Inward Products from Inventory
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Search existing products to inward stock, or click + Add Product to register in Inventory
                    </p>
                  </div>

                  {/* Quick Add Product Button (Opens full StockModal directly inside Stock Inward without redirect!) */}
                  <button
                    type="button"
                    onClick={() => setIsStockModalOpen(true)}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-sm transition cursor-pointer self-start sm:self-auto"
                    title="Add new product with categories, barcode, IMEI, pricing"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ Add Product</span>
                  </button>
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
                        placeholder="Search existing products to add (Title, Category, Barcode, IMEI)..."
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
                                  setIsStockModalOpen(true);
                                }}
                                className="font-bold text-emerald-600 hover:underline cursor-pointer"
                              >
                                + Add Product
                              </button>{' '}
                              to create it right here in Stock Inward.
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
                                  <span className="px-1.5 py-0.2 bg-slate-100 rounded text-slate-600 font-medium">
                                    {prod.category}
                                  </span>
                                  {prod.barcode && <span>Barcode: {prod.barcode}</span>}
                                  {prod.imei && <span className="font-mono text-blue-600">IMEI: {prod.imei}</span>}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="font-mono font-bold text-blue-700 block">
                                  Cost: {currency} {(prod.costPrice || 0).toLocaleString()}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  Current Stock: {prod.qty || 0} units
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
                <div className="space-y-2.5">
                  {items.length === 0 ? (
                    <div className="p-6 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                      <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs font-bold text-slate-700">No inward products added yet</p>
                      <p className="text-[11px] text-slate-400 max-w-sm mx-auto mt-0.5">
                        Use the search bar above to select products from your existing inventory, or click <strong>+ Add Product</strong> to register a new product in Inventory.
                      </p>
                    </div>
                  ) : (
                    items.map((item, idx) => {
                      const rowTotal = (Number(item.qty) || 0) * (Number(item.costPrice) || 0);
                      const isMobile = isMobileCategory(item.category);
                      const itemImeis = item.imeis || (item.imei ? item.imei.split(',').map(s => s.trim()) : ['']);

                      return (
                        <div
                          key={idx}
                          className="p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200/90 space-y-3 shadow-2xs hover:border-blue-300 transition"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                            <div className="sm:col-span-4">
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                Product Title *
                              </label>
                              <div className="px-2.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 truncate">
                                {item.name || 'Unnamed Product'}
                              </div>
                            </div>

                            <div className="sm:col-span-2">
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                Category
                              </label>
                              <div className="px-2 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 truncate">
                                {item.category}
                              </div>
                            </div>

                            <div className="sm:col-span-2">
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                Inward Qty *
                              </label>
                              <input
                                type="number"
                                min="1"
                                max="500"
                                placeholder="Qty"
                                value={item.qty}
                                onChange={e => handleItemQtyChange(idx, e.target.value)}
                                className="w-full px-2.5 py-1.5 bg-white border border-blue-400 rounded-xl text-xs font-extrabold text-blue-700 text-center focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500 shadow-2xs"
                              />
                            </div>

                            <div className="sm:col-span-2">
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                Cost Price ({currency}) *
                              </label>
                              <input
                                type="number"
                                min="0"
                                placeholder="0"
                                value={item.costPrice}
                                onChange={e => handleItemChange(idx, 'costPrice', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono text-blue-700 focus:outline-none focus:border-blue-500 shadow-2xs"
                              />
                            </div>

                            <div className="sm:col-span-2 flex items-center justify-between gap-2">
                              <div className="flex-1">
                                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                  Retail Price
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="Retail"
                                  value={item.salePrice}
                                  onChange={e => handleItemChange(idx, 'salePrice', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                                  className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold font-mono text-emerald-700 focus:outline-none focus:border-blue-500 shadow-2xs"
                                />
                              </div>

                              <button
                                type="button"
                                onClick={() => handleRemoveItemRow(idx)}
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer mb-0.5"
                                title="Remove from inward bill"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Dynamic IMEI Boxes for Mobile Category or Items with IMEIs */}
                          {isMobile ? (
                            <div className="p-2.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2">
                              <div className="flex items-center justify-between text-[11px] font-bold">
                                <span className="flex items-center gap-1.5 text-blue-800">
                                  <Smartphone className="w-3.5 h-3.5 text-blue-600" />
                                  IMEI Numbers for {item.name || 'Mobile'} ({itemImeis.length} {itemImeis.length === 1 ? 'Box' : 'Boxes'} for {item.qty || 1} units)
                                </span>
                                <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                                  1 IMEI per unit (Scan / Enter advances next)
                                </span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-44 overflow-y-auto pr-1">
                                {itemImeis.map((imVal, imIdx) => (
                                  <div
                                    key={imIdx}
                                    className="flex items-center gap-1.5 bg-white p-1.5 rounded-lg border border-slate-200 shadow-2xs focus-within:border-blue-500 transition"
                                  >
                                    <span className="font-mono text-[10px] font-bold text-slate-500 w-12 shrink-0">
                                      #{imIdx + 1}:
                                    </span>
                                    <input
                                      id={`purchase-item-imei-${idx}-${imIdx}`}
                                      type="text"
                                      value={imVal}
                                      onChange={e => handleItemImeiChange(idx, imIdx, e.target.value)}
                                      onKeyDown={e => handleItemImeiKeyDown(e, idx, imIdx)}
                                      onPaste={e => handleItemImeiPaste(e, idx, imIdx)}
                                      placeholder={`IMEI #${imIdx + 1} (Scan/Enter)`}
                                      className="w-full text-[11px] font-mono px-1 py-0.5 bg-transparent focus:outline-none"
                                      autoComplete="off"
                                    />
                                  </div>
                                ))}
                              </div>

                              <div className="flex items-center justify-end pt-1 border-t border-blue-100">
                                <span className="text-xs font-black text-slate-900 font-mono">
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
                                  placeholder="Barcode Code (Scan or enter)"
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
                                  className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:border-blue-500"
                                  autoComplete="off"
                                />
                              </div>

                              <div className="text-right">
                                <span className="text-xs font-black text-slate-900 font-mono">
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
                      placeholder={`Full (${totalBillAmount})`}
                      value={paidAmount}
                      onChange={e => setPaidAmount(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-emerald-700 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Balance Due / Payable ({currency})
                    </label>
                    <div className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-black font-mono text-rose-600">
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
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold rounded-xl transition cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-xl shadow-lg shadow-blue-600/25 transition cursor-pointer"
                  >
                    Save Inward Bill
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
                          {i.imei && <div className="text-[10px] text-slate-400 font-mono">IMEI: {i.imei}</div>}
                          {i.barcode && <div className="text-[10px] text-slate-400 font-mono">Code: {i.barcode}</div>}
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

            <div className="flex justify-end gap-2 pt-2">
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
                  <span className="font-mono text-blue-600">Bill #{purchaseToReverse.billNo}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-200 text-[11px]">
                  <div>
                    <span className="text-slate-400 block font-semibold">Total Bill</span>
                    <span className="font-bold font-mono text-slate-900">{currency} {purchaseToReverse.totalAmount.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-semibold">Financial Outflow Paid</span>
                    <span className="font-bold font-mono text-emerald-700">{currency} {purchaseToReverse.paidAmount.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-semibold">Payable Balance</span>
                    <span className="font-bold font-mono text-rose-600">{currency} {purchaseToReverse.balanceDue.toLocaleString()}</span>
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
        />
      )}
    </div>
  );
};

export const PurchasesTab = React.memo(PurchasesTabComponent);
