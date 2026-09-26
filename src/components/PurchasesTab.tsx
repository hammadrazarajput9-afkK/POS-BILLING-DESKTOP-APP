import React, { useState, useMemo, useEffect } from 'react';
import { SupplierPurchase, PurchaseItem, InventoryItem } from '../types';
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

interface PurchasesTabProps {
  purchases: SupplierPurchase[];
  currency: string;
  categories: string[];
  inventory: InventoryItem[];
  isAdmin?: boolean;
  onSavePurchase: (
    purchase: Omit<SupplierPurchase, 'id'>,
    autoAddToInventory: boolean
  ) => void;
  onDeletePurchase: (id: string) => void;
}

const DRAFT_KEY = 'mobilepos_purchase_draft_v2';

export const PurchasesTab: React.FC<PurchasesTabProps> = ({
  purchases = [],
  currency,
  categories,
  inventory,
  onSavePurchase,
  onDeletePurchase,
}) => {
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PAID' | 'DUE'>('ALL');
  const [dateFilter, setDateFilter] = useState('');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedPurchaseForView, setSelectedPurchaseForView] = useState<SupplierPurchase | null>(null);
  const [purchaseToDelete, setPurchaseToDelete] = useState<SupplierPurchase | null>(null);
  const [zoomImage, setZoomImage] = useState<string | null>(null);

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

  // Dynamic Items list in new purchase
  const [items, setItems] = useState<Array<{
    name: string;
    category: string;
    qty: number;
    costPrice: number;
    salePrice: number;
    imei: string;
    barcode: string;
  }>>([
    {
      name: '',
      category: categories[0] || 'Android Mobile',
      qty: 1,
      costPrice: 0,
      salePrice: 0,
      imei: '',
      barcode: '',
    },
  ]);

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
      items.some(i => i.name.trim() || i.costPrice > 0) ||
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
          setItems(parsed.items);
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
    setItems([
      {
        name: '',
        category: categories[0] || 'Android Mobile',
        qty: 1,
        costPrice: 0,
        salePrice: 0,
        imei: '',
        barcode: '',
      },
    ]);
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
        costPrice: 0,
        salePrice: 0,
        imei: '',
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
            updated[index].costPrice = matched.costPrice || 0;
          }
          if (!updated[index].salePrice || updated[index].salePrice === 0) {
            updated[index].salePrice = matched.salePrice || 0;
          }
          if (matched.barcode && !updated[index].barcode) {
            updated[index].barcode = matched.barcode;
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
      item => item.name.trim() !== '' && Number(item.qty) > 0 && Number(item.costPrice) >= 0
    );

    if (validItems.length === 0) {
      showToast('Please add at least one valid item with name, quantity, and cost price', 'warning');
      return;
    }

    const purchaseItems: PurchaseItem[] = validItems.map((item, idx) => ({
      id: 'PITM-' + Date.now() + '-' + idx,
      name: item.name.trim(),
      category: item.category,
      qty: Number(item.qty),
      costPrice: Number(item.costPrice),
      salePrice: Number(item.salePrice) || Number(item.costPrice) * 1.15,
      total: Number(item.qty) * Number(item.costPrice),
      barcode: item.barcode.trim() || undefined,
      imei: item.imei.trim() || undefined,
      imeis: item.imei.trim() ? item.imei.split(',').map(s => s.trim()).filter(Boolean) : undefined,
    }));

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

        const matchesStatus =
          statusFilter === 'ALL'
            ? true
            : statusFilter === 'PAID'
            ? (p.balanceDue || 0) <= 0
            : (p.balanceDue || 0) > 0;

        const matchesDate = !dateFilter || p.date.startsWith(dateFilter);

        return matchesSearch && matchesStatus && matchesDate;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [purchases, search, statusFilter, dateFilter]);

  // Aggregate stats
  const stats = useMemo(() => {
    let totalPurchased = 0;
    let totalPaid = 0;
    let totalDue = 0;
    let totalInwardUnits = 0;

    purchases.forEach(p => {
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Purchases</span>
            <DollarSign className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-lg sm:text-xl font-black text-slate-900">
            {currency} {stats.totalPurchased.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">{purchases.length} total bills logged</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Total Paid</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-lg sm:text-xl font-black text-emerald-700">
            {currency} {stats.totalPaid.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">Cleared via Cash/Bank</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600">Payables / Due</span>
            <AlertCircle className="w-4 h-4 text-rose-600" />
          </div>
          <p className="text-lg sm:text-xl font-black text-rose-600">
            {currency} {stats.totalDue.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">Supplier balance pending</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Inward Units</span>
            <Package className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-lg sm:text-xl font-black text-indigo-900">
            {stats.totalInwardUnits.toLocaleString()} pcs
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">Stock received in total</p>
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
            {(['ALL', 'PAID', 'DUE'] as const).map(tab => (
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
                {tab === 'ALL' ? 'All Bills' : tab === 'PAID' ? 'Fully Paid' : 'Pending Due'}
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
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
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
                  const isFullyPaid = (p.balanceDue || 0) <= 0;
                  const totalUnits = (p.items || []).reduce((acc, i) => acc + (i.qty || 0), 0);

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-slate-900">#{p.billNo}</div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(p.date).toLocaleDateString()}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-blue-600" />
                          {p.partyName}
                        </div>
                        {p.partyPhone && (
                          <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3" />
                            {p.partyPhone}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-800">{p.items?.length || 0} product(s)</span>
                        <span className="text-[10px] text-slate-500 block">
                          {totalUnits} inward units
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right font-black text-slate-900">
                        {currency} {p.totalAmount.toLocaleString()}
                      </td>

                      <td className="py-3 px-4 text-right font-bold text-emerald-600">
                        {currency} {p.paidAmount.toLocaleString()}
                        <div className="text-[9px] text-slate-400 uppercase font-semibold">
                          via {p.paymentMethod || 'Cash'}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right">
                        {isFullyPaid ? (
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

                          <button
                            type="button"
                            onClick={() => setPurchaseToDelete(p)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                            title="Delete Purchase Record"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* ADD PURCHASE / STOCK INWARD MODAL */}
      {/* ========================================================= */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl space-y-5 border border-slate-100 my-auto animate-in fade-in zoom-in-95 max-h-[92vh] flex flex-col">
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
            <form onSubmit={handleSubmitPurchase} className="overflow-y-auto pr-1 flex-1 space-y-5">
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

              {/* Row 2: Itemized Stock Entries */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-blue-600" />
                    Itemized Stock Additions
                  </h4>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg text-xs font-bold transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Another Product
                  </button>
                </div>

                <div className="space-y-2.5">
                  {items.map((item, idx) => {
                    const rowTotal = (Number(item.qty) || 0) * (Number(item.costPrice) || 0);

                    return (
                      <div
                        key={idx}
                        className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/90 space-y-2.5"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                          <div className="sm:col-span-4">
                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                              Product Title *
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. Redmi Note 13 (8GB/256GB)"
                              value={item.name}
                              onChange={e => handleItemChange(idx, 'name', e.target.value)}
                              list={`inv-prod-list-${idx}`}
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-blue-500"
                            />
                            <datalist id={`inv-prod-list-${idx}`}>
                              {inventory.map(inv => (
                                <option key={inv.id} value={inv.name}>
                                  Category: {inv.category} • Cost: {inv.costPrice}
                                </option>
                              ))}
                            </datalist>
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                              Category
                            </label>
                            <select
                              value={item.category}
                              onChange={e => handleItemChange(idx, 'category', e.target.value)}
                              className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-blue-500"
                            >
                              {categories.map(c => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                              Qty (Units) *
                            </label>
                            <input
                              type="number"
                              min="1"
                              required
                              value={item.qty}
                              onChange={e => handleItemChange(idx, 'qty', Math.max(1, parseInt(e.target.value) || 1))}
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-center focus:outline-none focus:border-blue-500"
                            />
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                              Cost Price ({currency}) *
                            </label>
                            <input
                              type="number"
                              min="0"
                              required
                              value={item.costPrice}
                              onChange={e => handleItemChange(idx, 'costPrice', parseFloat(e.target.value) || 0)}
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-blue-700 focus:outline-none focus:border-blue-500"
                            />
                          </div>

                          <div className="sm:col-span-2 flex items-center justify-between gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                Retail Price
                              </label>
                              <input
                                type="number"
                                min="0"
                                value={item.salePrice}
                                onChange={e => handleItemChange(idx, 'salePrice', parseFloat(e.target.value) || 0)}
                                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-emerald-700 focus:outline-none focus:border-blue-500"
                                placeholder="Retail"
                              />
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveItemRow(idx)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer mb-0.5"
                              title="Delete Item Row"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Optional IMEI & Barcode line */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-200/60 text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <Smartphone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <input
                              type="text"
                              placeholder="IMEI Number(s) (comma separated for multi)"
                              value={item.imei}
                              onChange={e => handleItemChange(idx, 'imei', e.target.value)}
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-mono focus:outline-none focus:border-blue-500"
                            />
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 flex-1">
                              <Barcode className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <input
                                type="text"
                                placeholder="Barcode Code (scan or enter)"
                                value={item.barcode}
                                onChange={e => handleItemChange(idx, 'barcode', e.target.value)}
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-mono focus:outline-none focus:border-blue-500"
                              />
                            </div>
                            <span className="text-[11px] font-black text-slate-800 shrink-0">
                              Subtotal: {currency} {rowTotal.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
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
          <div className="bg-white rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl space-y-4 border border-slate-100 my-auto animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
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
          if (purchaseToDelete) {
            onDeletePurchase(purchaseToDelete.id);
            showToast('Purchase bill removed', 'info');
            setPurchaseToDelete(null);
          }
        }}
        onClose={() => setPurchaseToDelete(null)}
      />
    </div>
  );
};
