import React, { useState, useMemo } from 'react';
import { InventoryItem, CartItem, PaymentMethod, SaleRecord, InvoiceType, KhataCustomer, OnlineAccount, ShopSettings, MobileVariant } from '../types';
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Printer,
  Package,
  Hash,
  Barcode,
  RotateCcw,
  UserCheck,
  CreditCard,
  Banknote,
  BookOpen,
  FileText,
  Smartphone,
  Calendar,
  Share2,
  Edit,
  XCircle,
  CheckCircle,
  AlertTriangle,
  Save,
  X,
  Check,
  ArrowRight,
  ChevronUp,
  Camera,
  Sparkles,
  Layers,
  Copy,
  Info,
  Sliders
} from 'lucide-react';
import { useToast } from './Toast';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { useFormDraft } from '../hooks/useFormDraft';
import { generateNextInvoiceNumber, extractItemImeis } from '../utils/imeiManager';
import { normalizePaymentChannel } from '../utils/accounting';
import { InvoiceShareModal } from './InvoiceShareModal';
import { smartFilterAndSort, smartMatch, smartSearchScore } from '../utils/smartSearch';

interface PosTabProps {
  inventory: InventoryItem[];
  sales?: SaleRecord[];
  currency: string;
  categories: string[];
  khataCustomers?: KhataCustomer[];
  onlineAccounts?: OnlineAccount[];
  settings?: ShopSettings;
  posPreferences?: Record<string, any>;
  onOpenPosSettings?: () => void;
  onCompleteSale: (sale: SaleRecord) => void;
  onOpenAddStock: () => void;
  onOpenPdfReport?: () => void;
  onOpenSalesReturn?: (sale?: SaleRecord | null) => void;
  onViewReceipt: (sale: SaleRecord) => void;
  onCancelSale: (invNo: string, reason: string) => void;
  onDeleteSale?: (invNo: string, permanent?: boolean, reason?: string) => void;
  onUpdateSale?: (sale: SaleRecord) => void;
  onUpdateOnlineAccount?: (account: OnlineAccount, silent?: boolean) => void;
  saleToEdit?: SaleRecord | null;
  onClearSaleToEdit?: () => void;
}

interface PosDraftState {
  cart: CartItem[];
  invoiceType: InvoiceType;
  saleMode: 'retail' | 'wholesale';
  selectedKhataId: string;
  custName: string;
  custPhone: string;
  retailerShopName: string;
  retailerCity: string;
  retailerNtn: string;
  discount: number | '';
  paymentMethod: PaymentMethod;
  accountId: string;
  amountPaid: number | '';
  billNote: string;
  editingOriginalDate?: string;
  editingOriginalInvNo?: string;
}

const initialPosDraft: PosDraftState = {
  cart: [],
  invoiceType: 'cash',
  saleMode: 'retail',
  selectedKhataId: '',
  custName: '',
  custPhone: '',
  retailerShopName: '',
  retailerCity: '',
  retailerNtn: '',
  discount: '',
  paymentMethod: 'Cash',
  accountId: '',
  amountPaid: '',
  billNote: '',
  editingOriginalDate: undefined,
  editingOriginalInvNo: undefined,
};

const PosTabComponent: React.FC<PosTabProps> = ({
  inventory,
  sales = [],
  currency,
  categories,
  khataCustomers = [],
  onlineAccounts = [],
  settings,
  posPreferences,
  onOpenPosSettings,
  onCompleteSale,
  onOpenAddStock,
  onOpenPdfReport,
  onOpenSalesReturn,
  onViewReceipt,
  onCancelSale,
  onDeleteSale,
  onUpdateSale,
  onUpdateOnlineAccount,
  saleToEdit,
  onClearSaleToEdit,
}) => {
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);
  const productGridRef = React.useRef<HTMLDivElement | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  const [cameraScannerTarget, setCameraScannerTarget] = useState<'productSearch' | 'historySearch'>('productSearch');
  const [selectedProductDetails, setSelectedProductDetails] = useState<InventoryItem | null>(null);
  const [variantPickerItem, setVariantPickerItem] = useState<InventoryItem | null>(null);
  const [copiedImei, setCopiedImei] = useState<string | null>(null);
  const [duplicateScanAlert, setDuplicateScanAlert] = useState<{ title: string; detail: string } | null>(null);
  const duplicateAlertTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showChannelCustomizer, setShowChannelCustomizer] = useState(false);
  const [lastScannedItem, setLastScannedItem] = useState<{
    itemId: string;
    imei?: string;
    variantLabel?: string;
  } | null>(null);
  const showPaymentAccountsSection = posPreferences?.showPaymentAccounts !== false;

  const triggerDuplicateAlert = (title: string, detail: string) => {
    setDuplicateScanAlert({ title, detail });
    if (duplicateAlertTimerRef.current) {
      clearTimeout(duplicateAlertTimerRef.current);
    }
    duplicateAlertTimerRef.current = setTimeout(() => {
      setDuplicateScanAlert(null);
    }, 5500);

    showToast(`⚠️ ${title} — ${detail}`, 'error');

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(520, ctx.currentTime);
        osc.frequency.setValueAtTime(360, ctx.currentTime + 0.09);
        gain.gain.setValueAtTime(0.14, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.22);
        setTimeout(() => {
          ctx.close().catch(() => {});
        }, 300);
      }
    } catch {
      // Ignore audio errors if blocked by browser autoplay policy
    }
  };

  const handleCopyImei = (imei: string) => {
    navigator.clipboard.writeText(imei);
    setCopiedImei(imei);
    showToast(`IMEI copied to clipboard: ${imei}`, 'info');
    setTimeout(() => setCopiedImei(null), 2000);
  };

  const handleWhatsAppShareProduct = (item: InventoryItem) => {
    const shopName = settings?.shopName || 'Friends Mobile Zone';
    const unitPrice = getItemUnitPrice(item);
    let text = `📱 *${item.name}*\n🏪 *${shopName}*\n\n`;
    text += `📂 *Category:* ${item.category}\n`;
    text += `💰 *Price:* ${currency} ${unitPrice.toLocaleString()}${saleMode === 'wholesale' ? ' (Wholesale)' : ''}\n`;
    text += `📦 *Available Stock:* ${item.qty} units\n`;
    if (item.barcode) text += `🔖 *Barcode:* ${item.barcode}\n`;

    if (item.variants && item.variants.length > 0) {
      text += `\n🎨 *Available Variants:*\n`;
      item.variants.forEach((v, idx) => {
        text += `• Variant ${idx + 1}: ${v.color || ''} ${v.ram ? `(${v.ram}/${v.storage})` : ''} - Stock: ${v.qty || 1}\n`;
      });
    }

    if (settings?.phone) text += `\n📞 *Contact / WhatsApp:* ${settings.phone}`;
    if (settings?.address) text += `\n📍 *Address:* ${settings.address}`;

    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // Lock background body scroll when mobile cart drawer is open
  React.useEffect(() => {
    if (isMobileCartOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileCartOpen]);

  // Sub-tab Navigation and Invoice History range filters
  const [posSubTab, setPosSubTab] = useState<'billing' | 'history'>('billing');
  const [historySearch, setHistorySearch] = useState('');
  const [historyRange, setHistoryRange] = useState<'today' | 'weekly' | 'monthly' | 'yearly' | 'custom'>('today');
  const [historyStartDate, setHistoryStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [historyEndDate, setHistoryEndDate] = useState(new Date().toISOString().split('T')[0]);

  // Compute filtered historical sales list
  const filteredSales = useMemo(() => {
    return (sales || []).filter(sale => {
      // 1. Date Range Filter
      const saleDate = new Date(sale.date);
      const now = new Date();
      
      let inRange = false;
      if (historyRange === 'today') {
        inRange = saleDate.toDateString() === now.toDateString();
      } else if (historyRange === 'weekly') {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        inRange = saleDate >= oneWeekAgo;
      } else if (historyRange === 'monthly') {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        inRange = saleDate >= oneMonthAgo;
      } else if (historyRange === 'yearly') {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        inRange = saleDate >= oneYearAgo;
      } else if (historyRange === 'custom') {
        const start = new Date(historyStartDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(historyEndDate);
        end.setHours(23, 59, 59, 999);
        inRange = saleDate >= start && saleDate <= end;
      }

      if (!inRange) return false;

      // 2. Intelligent Search Filter (customer, phone, invoice, items, barcodes, IMEIs)
      const q = historySearch.trim();
      if (!q) return true;

      const itemNamesAndSpecs = sale.items
        .map(si => {
          const itemImeis = si.imeis || (si.imei ? [si.imei] : []);
          const matchedInventoryItem = inventory.find(
            i => i.name.toLowerCase() === si.name.toLowerCase() || i.id === si.id
          );
          return `${si.name} ${si.variantLabel || ''} ${itemImeis.join(' ')} ${matchedInventoryItem?.barcode || ''}`;
        })
        .join(' ');

      return smartMatch(
        q,
        [sale.invNo, sale.custName, sale.custPhone, sale.retailerShopName],
        [itemNamesAndSpecs, sale.notes, sale.paymentMethod]
      );
    });
  }, [sales, historyRange, historyStartDate, historyEndDate, historySearch, inventory]);

  const [shareModalSale, setShareModalSale] = useState<SaleRecord | null>(null);

  const handleShareWhatsapp = (sale: SaleRecord) => {
    if (!settings) {
      showToast('Shop settings not found', 'error');
      return;
    }
    setShareModalSale(sale);
  };

  // Delete / Void Modal state
  const [deleteModalSale, setDeleteModalSale] = useState<SaleRecord | null>(null);
  const [deleteMode, setDeleteMode] = useState<'cancel' | 'permanent'>('cancel');
  const [cancelReason, setCancelReason] = useState('Customer request / cancelled');

  // Edit Modal state
  const [editModalSale, setEditModalSale] = useState<SaleRecord | null>(null);
  const [editMode, setEditMode] = useState<'cart' | 'quick'>('cart');
  const [quickCustName, setQuickCustName] = useState('');
  const [quickCustPhone, setQuickCustPhone] = useState('');
  const [quickPaymentMethod, setQuickPaymentMethod] = useState<PaymentMethod>('Cash');
  const [quickNotes, setQuickNotes] = useState('');

  // Handle external saleToEdit (e.g. from Reports tab or Receipt modal)
  React.useEffect(() => {
    if (saleToEdit) {
      setEditModalSale(saleToEdit);
      setQuickCustName(saleToEdit.custName || '');
      setQuickCustPhone(saleToEdit.custPhone || '');
      setQuickPaymentMethod(saleToEdit.paymentMethod || 'Cash');
      setQuickNotes(saleToEdit.notes || '');
      setEditMode('cart');
      if (onClearSaleToEdit) {
        onClearSaleToEdit();
      }
    }
  }, [saleToEdit, onClearSaleToEdit]);

  const handleOpenDeleteModal = (sale: SaleRecord) => {
    setDeleteModalSale(sale);
    setDeleteMode(sale.status === 'CANCELLED' ? 'permanent' : 'cancel');
    setCancelReason('Customer request / cancelled');
  };

  const handleConfirmDelete = () => {
    if (!deleteModalSale) return;
    if (onDeleteSale) {
      onDeleteSale(deleteModalSale.invNo, deleteMode === 'permanent', cancelReason);
    } else {
      onCancelSale(deleteModalSale.invNo, cancelReason);
    }
    setDeleteModalSale(null);
  };

  const handleOpenEditModal = (sale: SaleRecord) => {
    if (sale.status === 'CANCELLED') {
      showToast('Cannot re-edit an already cancelled invoice', 'error');
      return;
    }
    setEditModalSale(sale);
    setQuickCustName(sale.custName || '');
    setQuickCustPhone(sale.custPhone || '');
    setQuickPaymentMethod(sale.paymentMethod || 'Cash');
    setQuickNotes(sale.notes || '');
    setEditMode('cart');
  };

  const handleExecuteCartEdit = (sale: SaleRecord) => {
    if (sale.status === 'CANCELLED') {
      showToast('Cannot re-edit an already cancelled invoice', 'error');
      return;
    }

    onCancelSale(sale.invNo, 'Re-edited / Loaded back for correction');

    const parsedCart: CartItem[] = sale.items.map(si => {
      const originalProduct = inventory.find(i => i.id === si.id || i.name.toLowerCase() === si.name.toLowerCase());
      return {
        id: si.id,
        name: si.name,
        category: si.category || 'Android Mobile',
        costPrice: si.costPrice,
        salePrice: si.salePrice,
        qty: originalProduct ? originalProduct.qty + si.qty : si.qty,
        status: originalProduct?.status || 'ACTIVE',
        selectedVariantId: si.variantId,
        selectedVariantLabel: si.variantLabel,
        cartQty: si.qty,
        selectedImeis: si.imeis || (si.imei ? [si.imei] : []),
        imei: si.imei,
        createdAt: originalProduct?.createdAt || new Date().toISOString(),
      };
    });

    setDraft({
      cart: parsedCart,
      invoiceType: sale.invoiceType || 'cash',
      saleMode: sale.saleMode || 'retail',
      selectedKhataId: sale.khataCustomerId || '',
      custName: sale.custName,
      custPhone: sale.custPhone || '',
      retailerShopName: sale.retailerShopName || '',
      retailerCity: sale.retailerCity || '',
      retailerNtn: sale.retailerNtn || '',
      discount: sale.discount,
      paymentMethod: sale.paymentMethod || 'Cash',
      accountId: sale.accountId || '',
      amountPaid: sale.amountPaid || '',
      billNote: sale.notes || '',
      editingOriginalDate: sale.date,
      editingOriginalInvNo: sale.invNo,
    });

    setEditModalSale(null);
    setPosSubTab('billing');
    showToast(`Invoice #${sale.invNo} loaded into cart! Original date (${new Date(sale.date).toLocaleDateString()}) preserved.`, 'success');
  };

  const handleSaveQuickEdit = () => {
    if (!editModalSale) return;
    const updated: SaleRecord = {
      ...editModalSale,
      custName: quickCustName.trim() || 'Walk-in Customer',
      custPhone: quickCustPhone.trim() || undefined,
      paymentMethod: quickPaymentMethod,
      notes: quickNotes.trim() || undefined,
    };
    if (onUpdateSale) {
      onUpdateSale(updated);
    }
    setEditModalSale(null);
  };

  const handlePrintHistoryReport = () => {
    const totalSalesSum = filteredSales.reduce((acc, s) => acc + (s.status === 'CANCELLED' ? 0 : s.grandTotal), 0);
    const totalTransactions = filteredSales.filter(s => s.status !== 'CANCELLED').length;
    const reportLogo = settings?.invoiceLogo || settings?.shopLogo || settings?.logo;
    const shopName = settings?.shopName || 'Mobile POS Pro';
    const shopAddress = settings?.address || '';
    const shopPhone = settings?.phone || '';

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Sales Report - ${historyRange.toUpperCase()}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #1e293b; font-variant-numeric: tabular-nums; }
            .header-banner { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #e5e7eb; padding-bottom: 12px; }
            .header-banner img { width: 55px; height: 55px; border-radius: 50%; object-fit: cover; margin-bottom: 6px; }
            h1 { font-size: 20px; color: #1e3a8a; margin: 4px 0; }
            p { font-size: 11px; color: #666; margin: 2px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
            th { background-color: #f3f4f6; padding: 10px; border: 1px solid #ddd; text-align: left; }
            td { padding: 8px; border: 1px solid #ddd; }
            .total-row { font-weight: bold; background-color: #f9fafb; }
            .cancelled { color: #dc2626; text-decoration: line-through; }
          </style>
        </head>
        <body>
          <div class="header-banner">
            ${reportLogo ? `<img src="${reportLogo}" alt="Logo" />` : ''}
            <h1>${shopName} - Sales Report</h1>
            <p>${shopAddress} ${shopPhone ? `| Tel: ${shopPhone}` : ''}</p>
          </div>
          <p>Filter Range: <strong>${historyRange.toUpperCase()}</strong> (${historyStartDate} to ${historyEndDate})</p>
          <p>Total Completed Invoices: <strong>${totalTransactions}</strong></p>
          <p>Net Revenue: <strong>${currency} ${totalSalesSum.toLocaleString()}</strong></p>

          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${filteredSales.map(s => `
                <tr class="${s.status === 'CANCELLED' ? 'cancelled' : ''}">
                  <td>${s.invNo}</td>
                  <td>${new Date(s.date).toLocaleString()}</td>
                  <td>${s.custName}</td>
                  <td>${s.paymentMethod}</td>
                  <td>${s.status || 'COMPLETED'}</td>
                  <td>${currency} ${s.grandTotal.toLocaleString()}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="5" style="text-align: right;">Total Net Sales:</td>
                <td>${currency} ${totalSalesSum.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </body>
      </html>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc && iframe.contentWindow) {
      doc.open();
      doc.write(htmlContent);
      doc.close();
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } finally {
          setTimeout(() => {
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
          }, 1000);
        }
      }, 250);
    } else if (iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
  };

  const handleShareHistoryReport = () => {
    const totalSalesSum = filteredSales.reduce((acc, s) => acc + (s.status === 'CANCELLED' ? 0 : s.grandTotal), 0);
    const totalTransactions = filteredSales.filter(s => s.status !== 'CANCELLED').length;
    
    let text = `*Sales History Report*\nRange: ${historyRange.toUpperCase()} (${historyStartDate} to ${historyEndDate})\nTotal Transactions: ${totalTransactions}\nNet Revenue: ${currency} ${totalSalesSum.toLocaleString()}\n\n*Completed Invoices:*\n`;
    
    filteredSales.filter(s => s.status !== 'CANCELLED').slice(0, 15).forEach(s => {
      text += `- ${s.invNo} | ${s.custName} | ${currency} ${s.grandTotal}\n`;
    });
    
    if (filteredSales.length > 15) {
      text += `_...and ${filteredSales.length - 15} more invoices_`;
    }

    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
  };

  // Persistent Form Draft State
  const [draft, setDraft, resetDraft, hasActiveDraft] = useFormDraft<PosDraftState>(
    'pos_terminal_draft',
    initialPosDraft
  );

  const cart = draft.cart || [];
  const invoiceType = draft.invoiceType || 'cash';
  const saleMode = draft.saleMode || 'retail';
  const selectedKhataId = draft.selectedKhataId || '';
  const custName = draft.custName || '';
  const custPhone = draft.custPhone || '';
  const retailerShopName = draft.retailerShopName || '';
  const retailerCity = draft.retailerCity || '';
  const retailerNtn = draft.retailerNtn || '';
  const discount = draft.discount !== undefined ? draft.discount : '';
  const paymentMethod = draft.paymentMethod || 'Cash';
  const accountId = draft.accountId || '';
  const amountPaid = draft.amountPaid !== undefined ? draft.amountPaid : '';
  const billNote = draft.billNote || '';

  // Helper to get active price per unit based on Mode (Retail vs Custom Wholesale Price)
  const getItemUnitPrice = (item: { salePrice: number; wholesalePrice?: number }, mode = saleMode) => {
    if (mode === 'wholesale') {
      return item.wholesalePrice && item.wholesalePrice > 0
        ? item.wholesalePrice
        : item.salePrice;
    }
    return item.salePrice;
  };

  // Visible online accounts configured in Daily Closing for POS Billing Cart
  const visiblePosAccounts = useMemo(() => {
    return onlineAccounts.filter(a => a.showInPos !== false);
  }, [onlineAccounts]);

  const selectCashChannel = () => {
    setDraft(prev => ({ ...prev, paymentMethod: 'Cash', accountId: '' }));
  };

  const selectOnlineAccount = (acc: OnlineAccount) => {
    setDraft(prev => ({ ...prev, paymentMethod: acc.name, accountId: acc.id }));
  };

  const setCart = (updater: CartItem[] | ((prev: CartItem[]) => CartItem[])) => {
    setDraft(prev => ({
      ...prev,
      cart: typeof updater === 'function' ? updater(prev.cart || []) : updater,
    }));
  };

  const setInvoiceType = (type: InvoiceType) => {
    setDraft(prev => ({ ...prev, invoiceType: type }));
  };

  const setSaleMode = (mode: 'retail' | 'wholesale') => {
    setDraft(prev => ({ ...prev, saleMode: mode }));
    showToast(`Switched to ${mode.toUpperCase()} Mode!`, mode === 'wholesale' ? 'info' : 'success');
  };

  const setSelectedKhataId = (id: string) => {
    const cust = khataCustomers.find(k => k.id === id);
    setDraft(prev => ({
      ...prev,
      selectedKhataId: id,
      custName: cust ? cust.name : prev.custName,
      custPhone: cust ? cust.phone : prev.custPhone,
      retailerShopName: cust?.shopName || prev.retailerShopName,
      retailerCity: cust?.city || prev.retailerCity,
      retailerNtn: cust?.ntnNumber || prev.retailerNtn,
    }));
  };

  const setCustName = (name: string) => {
    setDraft(prev => ({ ...prev, custName: name }));
  };

  const setCustPhone = (phone: string) => {
    setDraft(prev => ({ ...prev, custPhone: phone }));
  };

  const setRetailerShopName = (shop: string) => {
    setDraft(prev => ({ ...prev, retailerShopName: shop }));
  };

  const setRetailerCity = (city: string) => {
    setDraft(prev => ({ ...prev, retailerCity: city }));
  };

  const setRetailerNtn = (ntn: string) => {
    setDraft(prev => ({ ...prev, retailerNtn: ntn }));
  };

  const setDiscount = (disc: number | '') => {
    setDraft(prev => ({ ...prev, discount: disc }));
  };

  const setPaymentMethod = (pm: PaymentMethod) => {
    setDraft(prev => ({ ...prev, paymentMethod: pm }));
  };

  const setAmountPaid = (amt: number | '') => {
    setDraft(prev => ({ ...prev, amountPaid: amt }));
  };

  const setBillNote = (note: string) => {
    setDraft(prev => ({ ...prev, billNote: note }));
  };

  // Filtered inventory: EXCLUDE archived products from active sales POS
  const activeInventory = useMemo(() => {
    return inventory.filter(item => item.status !== 'ARCHIVED');
  }, [inventory]);

  // Exact IMEI / Barcode matcher for instant auto-selection
  const findExactImeiOrBarcodeMatch = (
    rawCode: string
  ): {
    item: InventoryItem;
    variant?: MobileVariant;
    matchedImei?: string;
    matchType: 'imei' | 'barcode';
  } | null => {
    const clean = rawCode.trim().toLowerCase();
    if (!clean) return null;

    // 1. Check variant-level exact IMEIs first (guarantees exact product + exact variant)
    for (const item of activeInventory) {
      if (item.variants && item.variants.length > 0) {
        for (const v of item.variants) {
          const exactVarImei = (v.imeis || []).find(im => im.trim().toLowerCase() === clean);
          if (exactVarImei) {
            return { item, variant: v, matchedImei: exactVarImei.trim(), matchType: 'imei' };
          }
        }
      }
    }

    // 2. Check product-level exact IMEIs
    for (const item of activeInventory) {
      const exactProdImei = extractItemImeis(item).find(im => im.trim().toLowerCase() === clean);
      if (exactProdImei) {
        const matchedV =
          item.variants && item.variants.length === 1 ? item.variants[0] : undefined;
        return { item, variant: matchedV, matchedImei: exactProdImei.trim(), matchType: 'imei' };
      }
    }

    // 3. Check exact barcode
    for (const item of activeInventory) {
      if (item.barcode && item.barcode.trim().toLowerCase() === clean) {
        return { item, matchType: 'barcode' };
      }
    }

    return null;
  };

  // Filtered inventory by search & category (pins recently scanned item at #1 and prioritizes exact matches)
  const filteredItems = useMemo(() => {
    const q = search.toLowerCase().trim();
    const categoryItems =
      selectedCategory === 'ALL'
        ? activeInventory
        : activeInventory.filter(item => item.category === selectedCategory);

    if (!q) {
      if (lastScannedItem) {
        const scannedInActive = activeInventory.find(i => i.id === lastScannedItem.itemId);
        if (scannedInActive) {
          return [scannedInActive, ...categoryItems.filter(i => i.id !== scannedInActive.id)];
        }
      }
      return categoryItems;
    }

    const scored = categoryItems
      .map((item, idx) => {
        const imeis = extractItemImeis(item);
        const imeiLower = imeis.map(im => im.trim().toLowerCase());
        const barcode = (item.barcode || '').trim().toLowerCase();
        const variantText = (item.variants || [])
          .map(v => `${v.ram || ''} ${v.storage || ''} ${v.color || ''} ${v.note || ''}`)
          .join(' ');

        let score = 0;
        if (imeiLower.includes(q) || barcode === q) {
          score = 10000;
        } else if (imeiLower.some(im => im.startsWith(q)) || barcode.startsWith(q)) {
          score = 5000;
        } else {
          score = smartSearchScore(
            q,
            [item.name, item.category],
            [item.ram, item.storage, item.color, item.note, variantText, item.barcode, imeis.join(' ')]
          );
        }

        return { item, score, idx };
      })
      .filter(entry => entry.score > 0);

    scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.idx - b.idx));
    return scored.map(entry => entry.item);
  }, [activeInventory, search, selectedCategory, lastScannedItem]);

  const getVariantLabel = (v: MobileVariant): string => {
    const parts = [v.ram, v.storage, v.color].map(x => (x || '').trim()).filter(Boolean);
    return parts.join(' • ') || 'Standard Variant';
  };

  const getVariantStock = (v: MobileVariant): number => {
    if (v.qty !== '' && v.qty !== undefined) {
      return Math.max(0, Number(v.qty) || 0);
    }
    return Array.isArray(v.imeis) ? v.imeis.filter(Boolean).length : 0;
  };

  const getVariantPricing = (item: InventoryItem, v?: MobileVariant) => {
    const costPrice =
      v && v.costPrice !== '' && Number(v.costPrice) > 0 ? Number(v.costPrice) : item.costPrice;
    const salePrice =
      v && v.salePrice !== '' && Number(v.salePrice) > 0 ? Number(v.salePrice) : item.salePrice;
    const wholesalePrice =
      v && v.wholesalePrice !== undefined && v.wholesalePrice !== '' && Number(v.wholesalePrice) > 0
        ? Number(v.wholesalePrice)
        : item.wholesalePrice;
    return { costPrice, salePrice, wholesalePrice };
  };

  const isImeiAlreadyInCart = (imei: string): boolean => {
    const target = imei.trim().toLowerCase();
    if (!target) return false;
    return cart.some(c => {
      const list = [
        ...(c.selectedImeis || []),
        ...(c.imei ? c.imei.split(',').map(s => s.trim()) : []),
      ].filter(Boolean);
      return list.some(im => im.toLowerCase() === target);
    });
  };

  const addToCart = (item: InventoryItem, specificImei?: string, chosenVariant?: MobileVariant): boolean => {
    if (specificImei && isImeiAlreadyInCart(specificImei)) {
      triggerDuplicateAlert(
        'Duplicate IMEI Scan Blocked',
        `"${item.name}" (IMEI: ${specificImei}) pehle se cart mein mojood hai! Dobara add nahi ki gayi.`
      );
      return false;
    }

    const totalProductInCart = cart
      .filter(c => c.id === item.id)
      .reduce((sum, c) => sum + c.cartQty, 0);

    if (item.qty <= 0 || totalProductInCart >= item.qty) {
      showToast(item.qty <= 0 ? 'Item is out of stock' : `Only ${item.qty} units available in stock`, 'error');
      return false;
    }

    let effectiveVariant = chosenVariant;
    if (!effectiveVariant && item.variants && item.variants.length > 0) {
      if (specificImei) {
        const matchedV = item.variants.find(v =>
          (v.imeis || []).some(im => im.trim().toLowerCase() === specificImei.trim().toLowerCase())
        );
        if (matchedV) effectiveVariant = matchedV;
      }
      if (!effectiveVariant) {
        if (item.variants.length === 1) {
          effectiveVariant = item.variants[0];
        } else {
          setVariantPickerItem(item);
          return false;
        }
      }
    }

    const variantId = effectiveVariant?.id || (effectiveVariant ? getVariantLabel(effectiveVariant) : undefined);
    const variantLabel = effectiveVariant ? getVariantLabel(effectiveVariant) : undefined;
    const variantDedicatedImeis =
      effectiveVariant && Array.isArray(effectiveVariant.imeis)
        ? effectiveVariant.imeis.filter(Boolean)
        : [];
    const itemImeis =
      variantDedicatedImeis.length > 0 ? variantDedicatedImeis : extractItemImeis(item);

    if (effectiveVariant) {
      const vStock =
        item.variants && item.variants.length === 1
          ? Math.max(getVariantStock(effectiveVariant), item.qty)
          : getVariantStock(effectiveVariant);
      const inCartVariantQty = cart
        .filter(c => c.id === item.id && (c.selectedVariantId || '') === (variantId || ''))
        .reduce((sum, c) => sum + c.cartQty, 0);
      if (inCartVariantQty >= vStock) {
        showToast(
          vStock <= 0
            ? `${variantLabel} is out of stock`
            : `Only ${vStock} units available for ${variantLabel}`,
          'warning'
        );
        return false;
      }
    }

    const { costPrice, salePrice, wholesalePrice } = getVariantPricing(item, effectiveVariant);

    setCart(prev => {
      const existing = prev.find(
        c => c.id === item.id && (c.selectedVariantId || '') === (variantId || '')
      );
      if (existing) {
        const totalInPrev = prev
          .filter(c => c.id === item.id)
          .reduce((sum, c) => sum + c.cartQty, 0);
        if (totalInPrev >= item.qty) {
          showToast(`Only ${item.qty} units available in stock`, 'warning');
          return prev;
        }

        const newQty = existing.cartQty + 1;
        const curSelected = existing.selectedImeis || [];
        const nextSelected = [...curSelected];

        if (specificImei && !nextSelected.includes(specificImei)) {
          nextSelected.push(specificImei);
        } else {
          const unused = itemImeis.find(im => !nextSelected.includes(im));
          if (unused) nextSelected.push(unused);
        }

        return prev.map(c =>
          c.id === item.id && (c.selectedVariantId || '') === (variantId || '')
            ? {
                ...c,
                cartQty: newQty,
                selectedImeis: nextSelected.slice(0, newQty),
                imei: nextSelected.length > 0 ? nextSelected.join(', ') : c.imei,
              }
            : c
        );
      } else {
        const initialSelected: string[] = [];
        if (specificImei) {
          initialSelected.push(specificImei);
        } else if (itemImeis.length > 0) {
          initialSelected.push(itemImeis[0]);
        }

        return [
          ...prev,
          {
            ...item,
            costPrice,
            salePrice,
            wholesalePrice,
            selectedVariantId: variantId,
            selectedVariantLabel: variantLabel,
            cartQty: 1,
            selectedImeis: initialSelected,
            imei: initialSelected[0] || (effectiveVariant ? undefined : item.imei),
            imeis: effectiveVariant ? itemImeis : item.imeis,
          },
        ];
      }
    });
    showToast(
      specificImei
        ? `${item.name}${variantLabel ? ` (${variantLabel})` : ''} • IMEI ${specificImei} added`
        : variantLabel
        ? `${item.name} (${variantLabel}) added to cart`
        : `${item.name} added to cart`,
      'success'
    );
    return true;
  };

  const highlightScannedProductInCatalog = (
    item: InventoryItem,
    imei?: string,
    variant?: MobileVariant
  ) => {
    setLastScannedItem({
      itemId: item.id,
      imei,
      variantLabel: variant ? getVariantLabel(variant) : undefined,
    });
    if (selectedCategory !== 'ALL' && item.category !== selectedCategory) {
      setSelectedCategory('ALL');
    }
    setTimeout(() => {
      productGridRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }, 40);
  };

  const handleScanOrQuickMatch = (rawCode: string, source: 'scanner' | 'enter' | 'typing'): boolean => {
    const clean = rawCode.trim();
    if (!clean) return false;

    const clearAndFocusSearch = () => {
      setSearch('');
      setTimeout(() => searchInputRef.current?.focus(), 0);
    };

    const exact = findExactImeiOrBarcodeMatch(clean);
    if (exact) {
      highlightScannedProductInCatalog(exact.item, exact.matchedImei, exact.variant);

      // Prevent duplicate scan of an IMEI already in the cart
      if (exact.matchType === 'imei' && exact.matchedImei && isImeiAlreadyInCart(exact.matchedImei)) {
        triggerDuplicateAlert(
          'Duplicate Scan Blocked',
          `"${exact.item.name}" (IMEI: ${exact.matchedImei}) pehle se cart mein mojood hai!`
        );
        clearAndFocusSearch();
        return true;
      }

      // Prevent accidental re-scan of a barcode/product already in the cart
      if (exact.matchType === 'barcode' && cart.some(c => c.id === exact.item.id)) {
        triggerDuplicateAlert(
          'Product Pehle Se Cart Mein Hai',
          `"${exact.item.name}" pehle se cart mein add hai! Galti se dobara scan hone par add nahi kiya gaya. Qty barhani ho to cart se (+) dabayein.`
        );
        clearAndFocusSearch();
        return true;
      }

      if (source === 'typing' && exact.matchType !== 'imei') {
        return false;
      }
      if (exact.matchType === 'barcode' && exact.item.variants && exact.item.variants.length > 1) {
        setVariantPickerItem(exact.item);
        clearAndFocusSearch();
        return true;
      }
      const added = addToCart(exact.item, exact.matchedImei, exact.variant);
      if (added) {
        clearAndFocusSearch();
      } else if (exact.item.variants && exact.item.variants.length > 1 && !exact.variant) {
        setSearch('');
      } else if (exact.matchedImei) {
        clearAndFocusSearch();
      }
      return true;
    }

    if (source === 'enter') {
      const matchingBySearch = smartFilterAndSort(activeInventory, clean, item => {
        const imeiString = extractItemImeis(item).join(' ');
        const variantText = (item.variants || [])
          .map(v => `${v.ram || ''} ${v.storage || ''} ${v.color || ''} ${v.note || ''}`)
          .join(' ');
        return {
          primary: [item.name, item.category],
          secondary: [item.ram, item.storage, item.color, item.note, variantText, item.barcode, imeiString],
        };
      });
      if (matchingBySearch.length === 1) {
        const singleMatch = matchingBySearch[0];
        highlightScannedProductInCatalog(singleMatch);
        if (cart.some(c => c.id === singleMatch.id)) {
          triggerDuplicateAlert(
            'Product Pehle Se Cart Mein Hai',
            `"${singleMatch.name}" pehle se cart mein add hai! Dobara scan karne par add nahi kiya gaya.`
          );
          clearAndFocusSearch();
          return true;
        }
        const added = addToCart(singleMatch);
        if (added) {
          clearAndFocusSearch();
        }
        return true;
      }
    }

    return false;
  };

  const updateCartQty = (id: string, delta: number, variantId?: string) => {
    const invItem = activeInventory.find(i => i.id === id);
    if (!invItem) return;
    const targetVariant =
      variantId && invItem.variants
        ? invItem.variants.find(v => (v.id || getVariantLabel(v)) === variantId)
        : undefined;
    const variantDedicatedImeis =
      targetVariant && Array.isArray(targetVariant.imeis)
        ? targetVariant.imeis.filter(Boolean)
        : [];
    const itemImeis =
      variantDedicatedImeis.length > 0 ? variantDedicatedImeis : extractItemImeis(invItem);

    setCart(prev => {
      const totalProductQty = prev
        .filter(c => c.id === id)
        .reduce((sum, c) => sum + c.cartQty, 0);

      return prev
        .map(c => {
          if (c.id === id && (c.selectedVariantId || '') === (variantId || '')) {
            const newQty = c.cartQty + delta;
            if (delta > 0 && totalProductQty + delta > invItem.qty) {
              showToast(`Stock limit (${invItem.qty}) reached`, 'warning');
              return c;
            }
            if (delta > 0 && targetVariant) {
              const vMax =
                invItem.variants && invItem.variants.length === 1
                  ? Math.max(getVariantStock(targetVariant), invItem.qty)
                  : getVariantStock(targetVariant);
              if (newQty > vMax) {
                showToast(`Variant stock limit (${vMax}) reached`, 'warning');
                return c;
              }
            }

            let nextSelected = [...(c.selectedImeis || [])];
            if (delta > 0) {
              const unused = itemImeis.find(im => !nextSelected.includes(im));
              if (unused) nextSelected.push(unused);
            } else if (delta < 0) {
              nextSelected = nextSelected.slice(0, newQty);
            }

            return {
              ...c,
              cartQty: newQty,
              selectedImeis: nextSelected.slice(0, newQty),
              imei: nextSelected.length > 0 ? nextSelected.join(', ') : c.imei,
            };
          }
          return c;
        })
        .filter(c => c.cartQty > 0);
    });
  };

  const handleSelectImeiForCartItem = (
    itemId: string,
    unitIndex: number,
    chosenImei: string,
    variantId?: string
  ) => {
    setCart(prev =>
      prev.map(c => {
        if (c.id === itemId && (c.selectedVariantId || '') === (variantId || '')) {
          const updated = [...(c.selectedImeis || [])];
          updated[unitIndex] = chosenImei;
          return {
            ...c,
            selectedImeis: updated,
            imei: updated.filter(Boolean).join(', '),
          };
        }
        return c;
      })
    );
  };

  const removeFromCart = (id: string, variantId?: string) => {
    setCart(prev =>
      prev.filter(c => !(c.id === id && (c.selectedVariantId || '') === (variantId || '')))
    );
  };

  const clearCart = () => {
    resetDraft();
    setLastScannedItem(null);
    showToast('Billing cart cleared', 'info');
  };

  const totalCartItems = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.cartQty, 0);
  }, [cart]);

  // Subtotal based on active pricing mode (Retail vs Wholesale)
  const subtotal = useMemo(() => {
    return cart.reduce((acc, item) => {
      const unitPrice = getItemUnitPrice(item);
      return acc + unitPrice * item.cartQty;
    }, 0);
  }, [cart, saleMode]);

  const discountVal = Number(discount) || 0;
  const grandTotal = Math.max(0, subtotal - discountVal);

  // If credit invoice, calculate paid vs due
  const actualPaid = invoiceType === 'cash'
    ? grandTotal
    : amountPaid === '' ? 0 : Math.max(0, Math.min(grandTotal, Number(amountPaid)));

  const actualDue = Math.max(0, grandTotal - actualPaid);

  const handleKhataSelect = (khataId: string) => {
    setSelectedKhataId(khataId);
    if (khataId) {
      const match = khataCustomers.find(k => k.id === khataId);
      if (match) {
        setCustName(match.name);
        setCustPhone(match.phone);
      }
    }
  };

  const renderCartContent = (isMobile = false) => (
    <div
      className={`bg-white rounded-2xl p-2.5 sm:p-3 flex flex-col ${
        isMobile ? 'space-y-2.5' : 'gap-2 border border-slate-200/90 shadow-xs'
      }`}
    >
      {/* Cart Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
            <ShoppingCart className="w-4 h-4 text-blue-600" /> Active Billing Cart ({totalCartItems})
          </h3>
          {hasActiveDraft && cart.length > 0 && (
            <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">
              Draft Saved
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {onOpenPdfReport && (
            <button
              type="button"
              onClick={onOpenPdfReport}
              className="text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 px-2 py-1 rounded-lg transition flex items-center gap-1 cursor-pointer shadow-2xs"
              title="Export Sales & Invoices PDF Report"
            >
              <FileText className="w-3 h-3 text-rose-600" /> Sales PDF
            </button>
          )}
          {cart.length > 0 && (
            <button
              type="button"
              onClick={clearCart}
              className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2 py-1 rounded-lg transition cursor-pointer"
            >
              Clear
            </button>
          )}
          {isMobile && (
            <button
              type="button"
              onClick={() => setIsMobileCartOpen(false)}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Non-Scrollable Compact Cart Body */}
      <div className="space-y-2">
        {draft.editingOriginalDate && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px] text-amber-900">
            <div className="flex items-center gap-1.5 min-w-0 font-bold">
              <Calendar className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="truncate">
                Editing #{draft.editingOriginalInvNo || 'Invoice'} • Original Date:{' '}
                {new Date(draft.editingOriginalDate).toLocaleDateString()}
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                setDraft(prev => ({
                  ...prev,
                  editingOriginalDate: undefined,
                  editingOriginalInvNo: undefined,
                }))
              }
              className="text-[10px] font-extrabold text-amber-800 hover:text-amber-950 bg-amber-100 hover:bg-amber-200 px-2 py-0.5 rounded-lg transition cursor-pointer shrink-0"
              title="Use Today's Date Instead"
            >
              Use Today
            </button>
          </div>
        )}
        {/* Invoice Type + Customer Info Compact Block */}
        <div className="bg-slate-50 p-2 rounded-xl border border-slate-200/80 space-y-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setInvoiceType('cash')}
              className={`py-1.5 px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer min-h-[34px] ${
                invoiceType === 'cash'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Banknote className="w-3.5 h-3.5" />
              <span>Cash Customer</span>
            </button>

            <button
              type="button"
              onClick={() => setInvoiceType('credit')}
              className={`py-1.5 px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer min-h-[34px] ${
                invoiceType === 'credit'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Credit / Khata</span>
            </button>
          </div>

          {invoiceType === 'credit' && khataCustomers.length > 0 && (
            <select
              value={selectedKhataId}
              onChange={e => handleKhataSelect(e.target.value)}
              className="w-full bg-white border border-purple-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-purple-600 min-h-[34px]"
            >
              <option value="">Select Existing Khata Customer...</option>
              {khataCustomers.map(k => (
                <option key={k.id} value={k.id}>
                  {k.name} ({k.phone}) - Due: {currency} {k.balance.toLocaleString()}
                </option>
              ))}
            </select>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            <input
              type="text"
              value={custName}
              onChange={e => setCustName(e.target.value)}
              placeholder={saleMode === 'wholesale' ? "Retailer / Contact Person *" : "Customer Name"}
              className={`border rounded-lg px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:bg-white transition min-h-[34px] ${
                saleMode === 'wholesale' ? 'bg-purple-50/70 border-purple-200 focus:border-purple-600' : 'bg-white border-slate-200 focus:border-blue-600'
              }`}
            />
            <input
              type="text"
              value={custPhone}
              onChange={e => setCustPhone(e.target.value)}
              placeholder="Phone Number"
              className={`border rounded-lg px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:bg-white transition min-h-[34px] ${
                saleMode === 'wholesale' ? 'bg-purple-50/70 border-purple-200 focus:border-purple-600' : 'bg-white border-slate-200 focus:border-blue-600'
              }`}
            />
          </div>

          {/* Wholesale Retailer Shop Details */}
          {saleMode === 'wholesale' && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-2 space-y-1.5 animate-in fade-in">
              <span className="text-[10px] font-black uppercase text-purple-900 tracking-wider flex items-center gap-1">
                <Package className="w-3 h-3 text-purple-700" /> Retailer / Shop Details
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                <input
                  type="text"
                  value={retailerShopName}
                  onChange={e => setRetailerShopName(e.target.value)}
                  placeholder="Shop / Business Name"
                  className="bg-white border border-purple-200 rounded-lg px-2 py-1 text-xs font-semibold text-purple-950 focus:outline-none focus:border-purple-600 min-h-[32px]"
                />
                <input
                  type="text"
                  value={retailerCity}
                  onChange={e => setRetailerCity(e.target.value)}
                  placeholder="City"
                  className="bg-white border border-purple-200 rounded-lg px-2 py-1 text-xs font-semibold text-purple-950 focus:outline-none focus:border-purple-600 min-h-[32px]"
                />
                <input
                  type="text"
                  value={retailerNtn}
                  onChange={e => setRetailerNtn(e.target.value)}
                  placeholder="NTN / GST (Opt)"
                  className="bg-white border border-purple-200 rounded-lg px-2 py-1 text-xs tabular-nums font-semibold text-purple-950 focus:outline-none focus:border-purple-600 min-h-[32px]"
                />
              </div>
            </div>
          )}
        </div>

        {/* Cart Itemized Table (No nested scrollbar — expands naturally) */}
        <div className="border border-slate-200/80 rounded-xl overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <tr>
                <th className="p-2">Item</th>
                <th className="p-2 text-center">Qty</th>
                <th className="p-2 text-right">Price</th>
                <th className="p-2 text-center w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {cart.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-4 text-slate-400">
                    <div className="inline-flex items-center gap-1.5 text-xs font-medium">
                      <ShoppingCart className="w-4 h-4 text-slate-300" />
                      <span>Cart is empty — Scan IMEI or click Add</span>
                    </div>
                  </td>
                </tr>
              ) : (
                cart.map(item => {
                  const availableItemImeis = extractItemImeis(item);
                  const hasMultipleImeis = availableItemImeis.length > 0;

                  return (
                    <tr key={`${item.id}::${item.selectedVariantId || 'default'}`} className="hover:bg-slate-50/60 transition">
                      <td className="p-2">
                        <p className="font-semibold text-slate-900 leading-tight line-clamp-1">
                          {item.name}
                        </p>
                        {item.selectedVariantLabel && (
                          <span className="inline-block mt-0.5 text-[9px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.2 rounded">
                            {item.selectedVariantLabel}
                          </span>
                        )}
                        {hasMultipleImeis ? (
                          <div className="mt-1 space-y-0.5">
                            {Array.from({ length: item.cartQty }).map((_, unitIdx) => {
                              const curVal = item.selectedImeis?.[unitIdx] || availableItemImeis[unitIdx] || '';
                              return (
                                <div key={unitIdx} className="flex items-center gap-1">
                                  <span className="text-[9px] tabular-nums text-slate-400 font-bold">
                                    #{unitIdx + 1}:
                                  </span>
                                  {availableItemImeis.length > 1 ? (
                                    <select
                                      value={curVal}
                                      onChange={e =>
                                        handleSelectImeiForCartItem(
                                          item.id,
                                          unitIdx,
                                          e.target.value,
                                          item.selectedVariantId
                                        )
                                      }
                                      className="text-[10px] tabular-nums text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 max-w-[165px] outline-none"
                                    >
                                      {availableItemImeis.map(im => (
                                        <option key={im} value={im}>
                                          IMEI: {im}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span className="text-[9px] tabular-nums text-blue-700 bg-blue-50 px-1 py-0.5 rounded border border-blue-100">
                                      IMEI: {curVal}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : item.barcode ? (
                          <p className="text-[9px] tabular-nums text-slate-400">
                            Code: {item.barcode}
                          </p>
                        ) : null}
                      </td>
                      <td className="p-2 text-center">
                        <div className="inline-flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                          <button
                            type="button"
                            onClick={() => updateCartQty(item.id, -1, item.selectedVariantId)}
                            className="w-6 h-6 sm:w-5 sm:h-5 bg-white rounded font-bold text-slate-700 hover:bg-slate-200 flex items-center justify-center transition cursor-pointer shadow-2xs"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="tabular-nums font-bold text-xs px-1 min-w-[18px] text-center">
                            {item.cartQty}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateCartQty(item.id, 1, item.selectedVariantId)}
                            className="w-6 h-6 sm:w-5 sm:h-5 bg-white rounded font-bold text-slate-700 hover:bg-slate-200 flex items-center justify-center transition cursor-pointer shadow-2xs"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                      <td className="p-2 text-right tabular-nums font-bold text-slate-900">
                        {currency} {(getItemUnitPrice(item) * item.cartQty).toLocaleString()}
                        {saleMode === 'wholesale' && (
                          <div className="text-[9px] text-purple-700 font-sans">
                            {currency} {getItemUnitPrice(item).toLocaleString()}/u
                          </div>
                        )}
                      </td>
                      <td className="p-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.id, item.selectedVariantId)}
                          className="text-slate-400 hover:text-rose-600 p-1 transition cursor-pointer flex items-center justify-center mx-auto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pricing Totals & Payment Method */}
        <div className="space-y-1.5 pt-1.5 border-t border-slate-100 text-xs">
          <div className="space-y-1 text-slate-600">
            <div className="flex justify-between items-center text-[11px] font-bold text-slate-700 pb-0.5">
              <span>Total Quantity ({cart.length} {cart.length === 1 ? 'item' : 'items'}):</span>
              <span className="tabular-nums font-extrabold text-slate-900">
                {cart.reduce((sum, it) => sum + (Number(it.qty) || 0), 0)} pcs
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span>Subtotal ({saleMode === 'wholesale' ? 'B2B Wholesale' : 'Retail'}):</span>
              <span className="tabular-nums font-bold text-slate-800">
                {currency} {subtotal.toLocaleString()}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span>Discount ({currency}):</span>
              <input
                type="number"
                min="0"
                value={discount}
                onChange={e => setDiscount(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0"
                className="w-24 text-right bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 tabular-nums font-bold text-xs focus:outline-none focus:border-blue-600 focus:bg-white"
              />
            </div>

            <div className="flex justify-between items-center text-sm sm:text-base font-extrabold text-slate-900 pt-1 border-t border-slate-100">
              <span>Grand Total:</span>
              <span className={`tabular-nums text-base sm:text-lg ${saleMode === 'wholesale' ? 'text-purple-700' : 'text-blue-600'}`}>
                {currency} {grandTotal.toLocaleString()}
              </span>
            </div>

            {/* If Credit Sale, show Paid Now vs Due Balance */}
            {invoiceType === 'credit' && (
              <div className="bg-purple-50 p-2 rounded-xl border border-purple-200 space-y-1">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-purple-900 text-[11px]">Advance / Paid Now ({currency}):</span>
                  <input
                    type="number"
                    min="0"
                    max={grandTotal}
                    value={amountPaid}
                    onChange={e => setAmountPaid(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="Paid amount"
                    className="w-28 text-right bg-white border border-purple-300 rounded-lg px-2 py-1 tabular-nums font-bold text-xs focus:outline-none focus:border-purple-600"
                  />
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-purple-200 text-purple-900 text-[11px]">
                  <span className="font-extrabold">Remaining Due (Khata Balance):</span>
                  <span className="tabular-nums font-extrabold text-sm text-rose-600">
                    {currency} {actualDue.toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Payment Modes (Toggleable from POS & Billing Settings) */}
          {showPaymentAccountsSection && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="text-[10px] font-bold uppercase text-slate-500">
                  Payment Channel
                </label>
                {onlineAccounts.length > 0 && onUpdateOnlineAccount && (
                  <button
                    type="button"
                    onClick={() => setShowChannelCustomizer(prev => !prev)}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 border transition cursor-pointer ${
                      showChannelCustomizer
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    <Sliders className="w-2.5 h-2.5" />
                    <span>Customize ({visiblePosAccounts.length}/{onlineAccounts.length})</span>
                  </button>
                )}
              </div>

              {showChannelCustomizer && onlineAccounts.length > 0 && onUpdateOnlineAccount && (
                <div className="mb-1.5 p-2 bg-slate-50 border border-blue-200 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 uppercase">
                    <span>Select accounts to show in Cart</span>
                    <button
                      type="button"
                      onClick={() => setShowChannelCustomizer(false)}
                      className="text-blue-600 hover:underline cursor-pointer normal-case"
                    >
                      Done
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {onlineAccounts.map(acc => {
                      const isShown = acc.showInPos !== false;
                      return (
                        <label
                          key={acc.id}
                          className={`flex items-center justify-between gap-2 p-1.5 rounded-lg border text-[11px] cursor-pointer transition ${
                            isShown
                              ? 'bg-white border-blue-200 text-slate-900'
                              : 'bg-slate-100/80 border-slate-200 text-slate-400'
                          }`}
                        >
                          <div className="min-w-0">
                            <span className="font-bold block truncate">{acc.name}</span>
                            <span className="text-[9px] text-slate-500 block truncate">
                              {acc.bankType || 'Digital Wallet'}
                              {acc.accountNumber ? ` • ${acc.accountNumber}` : ''}
                            </span>
                          </div>
                          <input
                            type="checkbox"
                            checked={isShown}
                            onChange={() =>
                              onUpdateOnlineAccount(
                                { ...acc, showInPos: !isShown },
                                true
                              )
                            }
                            className="w-3.5 h-3.5 accent-blue-600 shrink-0 cursor-pointer"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {/* Cash Button */}
                <button
                  type="button"
                  onClick={selectCashChannel}
                  className={`p-1.5 rounded-xl text-left transition cursor-pointer border min-h-[38px] flex flex-col justify-center ${
                    paymentMethod === 'Cash' && !accountId
                      ? invoiceType === 'credit'
                        ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                        : 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-extrabold truncate">Cash</span>
                    <span
                      className={`text-[9px] px-1 py-0.2 rounded font-bold shrink-0 ${
                        paymentMethod === 'Cash' && !accountId
                          ? 'bg-white/20 text-white'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      Drawer
                    </span>
                  </div>
                  <span
                    className={`text-[9px] truncate ${
                      paymentMethod === 'Cash' && !accountId ? 'text-white/80' : 'text-slate-400'
                    }`}
                  >
                    Physical Cash
                  </span>
                </button>

                {/* Configured Daily Closing Digital / Bank / Load Accounts */}
                {visiblePosAccounts.map(acc => {
                  const isSelected =
                    accountId === acc.id ||
                    (!accountId &&
                      paymentMethod !== 'Cash' &&
                      String(paymentMethod).trim().toLowerCase() === acc.name.trim().toLowerCase());
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => selectOnlineAccount(acc)}
                      className={`p-1.5 rounded-xl text-left transition cursor-pointer border min-h-[38px] flex flex-col justify-center ${
                        isSelected
                          ? invoiceType === 'credit'
                            ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                            : 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] font-extrabold truncate">{acc.name}</span>
                        <span
                          className={`text-[9px] px-1 py-0.2 rounded font-bold shrink-0 max-w-[72px] truncate ${
                            isSelected
                              ? 'bg-white/20 text-white'
                              : 'bg-blue-100/80 text-blue-800'
                          }`}
                        >
                          {acc.bankType || 'Digital'}
                        </span>
                      </div>
                      <span
                        className={`text-[9px] tabular-nums truncate ${
                          isSelected ? 'text-white/85' : 'text-slate-500'
                        }`}
                      >
                        {acc.accountNumber || acc.accountTitle || acc.bankType || 'Account'}
                      </span>
                    </button>
                  );
                })}

                {/* Fallback quick methods only when no digital accounts exist */}
                {onlineAccounts.length === 0 &&
                  (['JazzCash', 'Easypaisa', 'Bank', 'Card'] as PaymentMethod[]).map(pm => (
                    <button
                      key={pm}
                      type="button"
                      onClick={() => setDraft(prev => ({ ...prev, paymentMethod: pm, accountId: '' }))}
                      className={`p-1.5 rounded-xl text-xs font-bold text-center transition cursor-pointer border min-h-[38px] ${
                        paymentMethod === pm
                          ? invoiceType === 'credit'
                            ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                            : 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {pm}
                    </button>
                  ))}
              </div>

              {onlineAccounts.length > 0 && visiblePosAccounts.length === 0 && (
                <p className="text-[11px] text-amber-700 font-semibold mt-1">
                  Sab digital accounts hidden hain — Customize par click karke show karein.
                </p>
              )}
            </div>
          )}

          {/* Compact Single-Line Per-Bill Note Field */}
          <div className="pt-1.5 border-t border-slate-100">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase text-slate-500 mb-1">
              <span className="flex items-center gap-1">
                <FileText className="w-3 h-3 text-blue-500" />
                Bill Note
              </span>
              <span className="text-[9px] font-semibold text-slate-400 normal-case">
                Urdu / English / Roman Urdu
              </span>
            </div>
            <input
              type="text"
              dir="auto"
              value={billNote}
              onChange={e => setBillNote(e.target.value)}
              placeholder="Bill ke neeche koi bhi note likhein (optional)..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white transition min-h-[34px]"
            />
          </div>
        </div>
      </div>

      {/* Checkout Action Button */}
      <div className="pt-1.5 border-t border-slate-100 bg-white shrink-0">
        <button
          type="button"
          onClick={() => {
            handleCheckout();
            if (isMobile) setIsMobileCartOpen(false);
          }}
          disabled={cart.length === 0}
          className={`w-full py-2.5 text-white font-extrabold rounded-xl shadow-lg transition text-sm flex items-center justify-center gap-2 cursor-pointer min-h-[42px] ${
            cart.length > 0
              ? invoiceType === 'credit'
                ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-500/20'
                : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'
              : 'bg-slate-300 cursor-not-allowed shadow-none'
          }`}
        >
          <Printer className="w-4 h-4" />
          <span>
            {invoiceType === 'credit'
              ? 'Complete Credit Sale & Print Bill'
              : 'Complete Sale & Print Bill'}
          </span>
        </button>
      </div>
    </div>
  );

  const handleCheckout = () => {
    if (cart.length === 0) {
      showToast('Please add items to cart before checkout', 'warning');
      return;
    }

    if (invoiceType === 'credit' && !custName.trim()) {
      showToast('Please enter customer name or select from Khata for Credit Sale', 'warning');
      return;
    }

    const selectedOnlineAccount = showPaymentAccountsSection
      ? onlineAccounts.find(a => a.id === accountId) ||
        (paymentMethod !== 'Cash'
          ? onlineAccounts.find(
              a => a.name.trim().toLowerCase() === String(paymentMethod).trim().toLowerCase()
            )
          : undefined)
      : undefined;

    const effectivePaymentMethod: PaymentMethod = showPaymentAccountsSection
      ? paymentMethod
      : 'Cash';

    // Preserve original invoice date & date-prefix sequence when re-editing a past-date invoice
    const parsedOriginalDate = draft.editingOriginalDate ? new Date(draft.editingOriginalDate) : null;
    const hasValidOriginalDate = Boolean(parsedOriginalDate && !isNaN(parsedOriginalDate.getTime()));
    const effectiveSaleDate = hasValidOriginalDate ? draft.editingOriginalDate! : new Date().toISOString();
    const effectiveDateForInvNo = hasValidOriginalDate ? parsedOriginalDate! : new Date();

    // Generate persistent sequential invoice number: INV-YYYYMMDD-0001, INV-YYYYMMDD-0002...
    const invNo = generateNextInvoiceNumber(sales, effectiveDateForInvNo);

    const totalCost = cart.reduce((acc, item) => acc + item.costPrice * item.cartQty, 0);
    const netProfit = Math.max(0, grandTotal - totalCost);

    const saleRecord: SaleRecord = {
      invNo,
      invoiceType,
      saleMode,
      custName: custName.trim() || (saleMode === 'wholesale' ? 'Wholesale Retailer' : 'Walk-in Customer'),
      custPhone: custPhone.trim() || undefined,
      retailerShopName: saleMode === 'wholesale' ? retailerShopName.trim() || undefined : undefined,
      retailerCity: saleMode === 'wholesale' ? retailerCity.trim() || undefined : undefined,
      retailerNtn: saleMode === 'wholesale' ? retailerNtn.trim() || undefined : undefined,
      khataCustomerId: invoiceType === 'credit' ? selectedKhataId || undefined : undefined,
      amountPaid: actualPaid,
      amountDue: actualDue,
      items: cart.map(i => {
        const itemImeis = i.selectedImeis && i.selectedImeis.length > 0
          ? i.selectedImeis.filter(Boolean)
          : (i.imei ? i.imei.split(',').map(s => s.trim()).filter(Boolean) : []);

        const activeUnitPrice = getItemUnitPrice(i);

        return {
          id: i.id,
          name: i.name,
          category: i.category,
          variantId: i.selectedVariantId,
          variantLabel: i.selectedVariantLabel,
          imei: itemImeis.length > 0 ? itemImeis.join(', ') : undefined,
          imeis: itemImeis.length > 0 ? itemImeis : undefined,
          salePrice: activeUnitPrice,
          wholesalePrice: i.wholesalePrice,
          isWholesale: saleMode === 'wholesale',
          boxCount: i.boxSize ? Math.floor(i.cartQty / i.boxSize) : undefined,
          costPrice: i.costPrice,
          qty: i.cartQty,
          barcode: i.barcode,
        };
      }),
      subtotal,
      discount: discountVal,
      grandTotal,
      totalCost,
      netProfit,
      paymentMethod: effectivePaymentMethod,
      accountId: selectedOnlineAccount?.id || undefined,
      notes: billNote.trim() || undefined,
      date: effectiveSaleDate,
    };

    onCompleteSale(saleRecord);
    resetDraft();
    setLastScannedItem(null);
  };

  // Compute stats for historical sales
  const stats = useMemo(() => {
    let totalInvoices = 0;
    let netRevenue = 0;
    let totalCredit = 0;
    let cancelledCount = 0;
    let cancelledSum = 0;

    filteredSales.forEach(s => {
      if (s.status === 'CANCELLED') {
        cancelledCount++;
        cancelledSum += s.grandTotal;
      } else {
        totalInvoices++;
        netRevenue += s.grandTotal;
        if (s.invoiceType === 'credit') {
          totalCredit += (s.amountDue || 0);
        }
      }
    });

    return { totalInvoices, netRevenue, totalCredit, cancelledCount, cancelledSum };
  }, [filteredSales]);

  return (
    <div className="space-y-2 sm:space-y-3 flex flex-col lg:flex-1 lg:min-h-0">
      {/* Sub-tab Navigation Panel */}
      <div className="flex items-center justify-between gap-2 bg-white border border-slate-200/80 rounded-xl sm:rounded-2xl p-1 sm:p-2 shadow-xs w-full max-w-full overflow-hidden shrink-0">
        <div className="flex bg-slate-100 p-0.5 sm:p-1 rounded-xl w-full sm:w-fit gap-1">
          <button
            type="button"
            onClick={() => setPosSubTab('billing')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-2.5 sm:px-4 py-1 rounded-lg text-[11px] sm:text-xs font-extrabold transition cursor-pointer h-8 sm:h-9.5 ${
              posSubTab === 'billing'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="truncate">New Sale</span>
          </button>
          <button
            type="button"
            onClick={() => setPosSubTab('history')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-2.5 sm:px-4 py-1 rounded-lg text-[11px] sm:text-xs font-extrabold transition cursor-pointer h-8 sm:h-9.5 ${
              posSubTab === 'history'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="truncate">History</span>
            {(sales || []).length > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                posSubTab === 'history' ? 'bg-blue-500/30 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {(sales || []).length}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {onOpenPosSettings && (
            <button
              type="button"
              onClick={onOpenPosSettings}
              className="inline-flex items-center gap-1 px-2.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200/80 text-[11px] sm:text-xs font-bold transition cursor-pointer h-8 sm:h-9 shrink-0 whitespace-nowrap"
              title="POS & Billing Settings (Enable / Disable Payment Accounts)"
            >
              <Sliders className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden sm:inline">POS Settings</span>
            </button>
          )}

          {/* Developer Tag - Hidden on tiny screens to avoid wrapping */}
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200/80 rounded-xl shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[9px] font-extrabold text-slate-500 tracking-wider tabular-nums">
              HAMMAD DEVELOPER
            </span>
          </div>
        </div>
      </div>

      {posSubTab === 'billing' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 sm:gap-4 items-start lg:flex-1 lg:min-h-0">
          {/* Left Column: Catalog & Search (7 Cols) - Sticky scrollable catalog on desktop, natural document scroll on mobile */}
          <div className="lg:col-span-7 flex flex-col lg:min-h-0 lg:sticky lg:top-0 lg:max-h-[calc(100dvh-7.5rem)] space-y-2 sm:space-y-3">
            {/* Mode Switcher Banner: Retail vs Wholesale Mode (Compact on mobile) */}
            <div className={`border rounded-2xl p-2 sm:p-3 shadow-xs flex items-center justify-between gap-2 shrink-0 transition ${
              saleMode === 'wholesale'
                ? 'bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-800 text-white border-purple-700/80 shadow-purple-900/20'
                : 'bg-white border-slate-200/90 text-slate-900'
            }`}>
              <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                <div className={`p-1.5 sm:p-2 rounded-xl shrink-0 ${
                  saleMode === 'wholesale' ? 'bg-white/15 text-amber-300 backdrop-blur-md' : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {saleMode === 'wholesale' ? <Package className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" /> : <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5" />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h4 className="font-extrabold text-xs sm:text-sm leading-tight truncate">
                      {saleMode === 'wholesale' ? 'B2B Wholesale' : 'Retail Mode'}
                    </h4>
                    <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black uppercase tracking-wider ${
                      saleMode === 'wholesale' ? 'bg-amber-400 text-slate-900' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {saleMode === 'wholesale' ? 'W/S' : 'Retail'}
                    </span>
                  </div>
                  <p className={`text-[10px] sm:text-[11px] mt-0.5 hidden md:block ${saleMode === 'wholesale' ? 'text-purple-100' : 'text-slate-500'}`}>
                    {saleMode === 'wholesale'
                      ? 'Wholesale prices & bulk terms active'
                      : 'Standard retail consumer prices'}
                  </p>
                </div>
              </div>

              {/* Mode Toggle Switcher Buttons */}
              <div className={`flex items-center p-0.5 sm:p-1 rounded-xl border shrink-0 ${
                saleMode === 'wholesale' ? 'bg-purple-950/60 border-purple-600/50' : 'bg-slate-100 border-slate-200'
              }`}>
                <button
                  type="button"
                  onClick={() => setSaleMode('retail')}
                  className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1 h-7 sm:h-8 ${
                    saleMode === 'retail'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <ShoppingCart className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span>Retail</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSaleMode('wholesale')}
                  className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1 h-7 sm:h-8 ${
                    saleMode === 'wholesale'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Package className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span>W/S</span>
                </button>
              </div>
            </div>

            {/* Search & Category Filter Bar */}
            <div className="bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-2 sm:p-3 space-y-1.5 sm:space-y-2 shadow-xs shrink-0">
              {duplicateScanAlert && (
                <div className="bg-rose-50 border border-rose-300 text-rose-900 rounded-xl px-3 py-2 flex items-start justify-between gap-2 shadow-xs animate-in fade-in">
                  <div className="flex items-start gap-2 min-w-0">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div className="text-xs min-w-0">
                      <p className="font-black text-rose-800 leading-tight">{duplicateScanAlert.title}</p>
                      <p className="text-[11px] font-semibold text-rose-700 mt-0.5 leading-snug">
                        {duplicateScanAlert.detail}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDuplicateScanAlert(null)}
                    className="p-1 text-rose-500 hover:text-rose-800 rounded-lg cursor-pointer shrink-0"
                    title="Dismiss Alert"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={e => {
                    const nextVal = e.target.value;
                    setSearch(nextVal);
                    if (nextVal.trim().length >= 8) {
                      handleScanOrQuickMatch(nextVal, 'typing');
                    }
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && search.trim()) {
                      e.preventDefault();
                      handleScanOrQuickMatch(search, 'enter');
                    }
                  }}
                  placeholder="Scan IMEI / barcode or search product..."
                  className="compact-mobile-input w-full pl-8.5 pr-20 sm:pr-24 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-blue-600 focus:bg-white transition h-8.5 sm:h-10"
                />
                <div className="absolute right-1 flex items-center gap-1">
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
                    onClick={() => {
                      setCameraScannerTarget('productSearch');
                      setIsCameraScannerOpen(true);
                    }}
                    className="px-2 sm:px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs flex items-center gap-1 text-[10.5px] sm:text-[11px] font-extrabold cursor-pointer transition h-6.5 sm:h-8"
                    title="Live Camera Barcode & IMEI Scanner"
                  >
                    <Camera className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    <span>Scan</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-1.5 text-xs w-full max-w-full">
                <div className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 touch-pan-x max-w-full">
                  {['ALL', ...categories].map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg sm:rounded-xl font-bold text-[10px] sm:text-xs whitespace-nowrap transition shrink-0 cursor-pointer h-6.5 sm:h-7.5 inline-flex items-center ${
                        selectedCategory === cat
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200'
                      }`}
                    >
                      {cat === 'ALL' ? 'All' : cat}
                    </button>
                  ))}
                  {categories.length > 5 && (
                    <select
                      value={selectedCategory}
                      onChange={e => setSelectedCategory(e.target.value)}
                      className="compact-mobile-input px-2 py-0.5 sm:py-1 rounded-lg sm:rounded-xl bg-slate-100 text-slate-700 text-[10px] sm:text-xs font-bold border border-slate-200 shrink-0 cursor-pointer outline-none h-6.5 sm:h-7.5"
                    >
                      <option value="ALL">All ({categories.length})</option>
                      {categories.map(c => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {onOpenSalesReturn && (
                  <button
                    type="button"
                    onClick={() => onOpenSalesReturn(null)}
                    className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold transition cursor-pointer shrink-0 shadow-xs whitespace-nowrap h-6.5 sm:h-7.5"
                    title="Process Customer Sales Return & Refund"
                  >
                    <RotateCcw className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-700" />
                    <span className="hidden sm:inline">Sales Return</span>
                    <span className="sm:hidden">Return</span>
                  </button>
                )}
              </div>
            </div>

            {/* Product Cards Grid - Compact 4-Column Horizontal Grid on Mobile */}
            <div ref={productGridRef} className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto pr-0.5 sm:pr-1.5 space-y-2">
              {/* Recently Scanned IMEI / Barcode Banner */}
              {lastScannedItem && (() => {
                const scannedObj = activeInventory.find(i => i.id === lastScannedItem.itemId);
                if (!scannedObj) return null;
                return (
                  <div className="bg-emerald-50 border border-emerald-300 rounded-xl px-3 py-2 flex items-center justify-between gap-2 shadow-2xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div className="min-w-0 text-xs">
                        <span className="font-extrabold text-emerald-900 truncate block">
                          Scanned: {scannedObj.name}
                          {lastScannedItem.variantLabel ? ` (${lastScannedItem.variantLabel})` : ''}
                        </span>
                        {lastScannedItem.imei && (
                          <span className="text-[10px] font-bold text-emerald-700 tabular-nums block truncate">
                            IMEI: {lastScannedItem.imei} • Pinned at #1 below & added to cart
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setSelectedProductDetails(scannedObj)}
                        className="px-2 py-1 rounded-lg bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold cursor-pointer transition"
                      >
                        Details
                      </button>
                      <button
                        type="button"
                        onClick={() => setLastScannedItem(null)}
                        className="p-1 text-emerald-600 hover:text-emerald-900 rounded-lg cursor-pointer"
                        title="Dismiss"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })()}

              {filteredItems.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 text-xs text-slate-400 space-y-2">
                  <Package className="w-8 h-8 mx-auto text-slate-300" />
                  <p className="font-semibold text-slate-600">No matching products found</p>
                  <button
                    type="button"
                    onClick={onOpenAddStock}
                    className="mt-1.5 inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-50 text-blue-600 font-bold rounded-xl hover:bg-blue-100 transition cursor-pointer h-9"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Product
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-1.5 sm:gap-2.5 pb-16 lg:pb-3">
                  {filteredItems.map(item => {
                    const inCartQtyForItem = cart
                      .filter(c => c.id === item.id)
                      .reduce((sum, c) => sum + c.cartQty, 0);
                    const remainingStock = item.qty - inCartQtyForItem;
                    const isLastScanned = lastScannedItem?.itemId === item.id;
                    const itemSpecs = Array.from(
                      new Set(
                        [
                          ...(item.variants || []).map(v => [v.ram, v.storage].filter(Boolean).join('/')),
                          [item.ram, item.storage].filter(Boolean).join('/'),
                        ].filter(Boolean)
                      )
                    );

                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedProductDetails(item)}
                        className={`bg-white border rounded-xl sm:rounded-2xl p-1.5 sm:p-2.5 shadow-2xs hover:shadow-lg transition-all duration-150 cursor-pointer flex flex-col justify-between group relative min-w-0 ${
                          isLastScanned
                            ? 'border-emerald-500 ring-2 ring-emerald-400/70 bg-emerald-50/15'
                            : remainingStock <= 0
                            ? 'opacity-60 border-slate-200 hover:border-slate-300'
                            : 'border-slate-200/90 hover:border-blue-500'
                        }`}
                      >
                        <div className="min-w-0">
                          {/* Compact Product Image Frame */}
                          <div className="relative w-full h-14 sm:h-32 rounded-lg sm:rounded-xl overflow-hidden bg-slate-50 border border-slate-100 flex items-center justify-center p-1 sm:p-1.5 group-hover:scale-[1.02] transition-transform duration-200">
                            {item.image ? (
                              <img
                                src={item.image}
                                alt={item.name}
                                className="w-full h-full object-contain"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-black text-xs sm:text-lg shadow-inner">
                                {item.name.charAt(0).toUpperCase()}
                              </div>
                            )}

                            {isLastScanned && (
                              <span className="absolute top-1 left-1 text-[7.5px] sm:text-[9px] font-black px-1 py-0.2 rounded-full bg-emerald-600 text-white shadow-xs">
                                ✓
                              </span>
                            )}

                            {/* Remaining Stock Badge */}
                            <span
                              className={`absolute top-1 right-1 text-[7.5px] sm:text-[9px] font-extrabold px-1 sm:px-1.5 py-0.2 rounded-full tabular-nums shadow-xs backdrop-blur-xs ${
                                remainingStock > 2
                                  ? 'bg-emerald-500/90 text-white'
                                  : remainingStock > 0
                                  ? 'bg-amber-500/90 text-white'
                                  : 'bg-rose-500/90 text-white'
                              }`}
                            >
                              {remainingStock > 0 ? remainingStock : '0'}
                            </span>

                            {/* Click for Details Hint on desktop hover */}
                            <div className="hidden sm:block absolute inset-x-0 bottom-0 py-0.5 bg-slate-900/60 backdrop-blur-xs text-white text-[8px] font-bold text-center opacity-0 group-hover:opacity-100 transition-opacity">
                              Click for Details
                            </div>
                          </div>

                          {/* Product Title */}
                          <h4 className="font-extrabold text-slate-900 text-[9.5px] sm:text-xs line-clamp-2 mt-1 sm:mt-1.5 leading-tight group-hover:text-blue-600 transition">
                            {item.name}
                          </h4>

                          {/* Quiet Inline Specs & Category Metadata */}
                          <p className="text-[8px] sm:text-[9.5px] text-slate-500 font-semibold truncate mt-0.5 leading-tight">
                            {itemSpecs.length > 0 ? itemSpecs[0] : item.category}
                            {item.variants && item.variants.length > 1 ? ` · ${item.variants.length}v` : ''}
                          </p>
                        </div>

                        {/* Price & Add to Cart Action */}
                        <div className="mt-1 sm:mt-2 pt-1 sm:pt-1.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-1 min-w-0">
                          <div className="min-w-0">
                            <span
                              className={`tabular-nums font-extrabold text-[9px] sm:text-xs truncate block ${
                                saleMode === 'wholesale' ? 'text-purple-700' : 'text-blue-600'
                              }`}
                            >
                              {(() => {
                                const variants = item.variants || [];
                                if (variants.length > 1) {
                                  const varPrices = variants
                                    .map(v => getItemUnitPrice(getVariantPricing(item, v)))
                                    .filter(p => !isNaN(p) && p > 0);
                                  if (varPrices.length > 0) {
                                    const minP = Math.min(...varPrices);
                                    const maxP = Math.max(...varPrices);
                                    if (minP !== maxP) {
                                      return `${currency} ${minP.toLocaleString()}+`;
                                    }
                                    return `${currency} ${minP.toLocaleString()}`;
                                  }
                                }
                                return `${currency} ${getItemUnitPrice(item).toLocaleString()}`;
                              })()}
                            </span>
                          </div>

                          <div className="flex items-center" onClick={e => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => addToCart(item)}
                              disabled={remainingStock <= 0}
                              className={`w-full sm:w-auto px-1.5 sm:px-2 py-0.5 sm:py-1 font-bold rounded-md sm:rounded-lg text-[9px] sm:text-xs inline-flex items-center justify-center gap-0.5 transition cursor-pointer h-6 sm:h-7.5 shrink-0 shadow-2xs ${
                                remainingStock <= 0
                                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                  : saleMode === 'wholesale'
                                  ? 'bg-purple-600 hover:bg-purple-700 text-white active:scale-95'
                                  : 'bg-blue-600 hover:bg-blue-700 text-white active:scale-95'
                              }`}
                              title="Add directly to bill"
                            >
                              <Plus className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" />
                              <span>Add</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Checkout & Billing Cart (Desktop Only >= lg:) — Non-scrollable */}
          <div className="hidden lg:flex lg:flex-col lg:col-span-5">
            {renderCartContent(false)}
          </div>

          {/* Mobile Floating Cart Trigger Bar (Sits cleanly right above bottom navigation bar) */}
          {cart.length > 0 && (
            <div className="lg:hidden fixed bottom-[calc(4.2rem+env(safe-area-inset-bottom,0px))] left-3 right-3 sm:left-4 sm:right-4 z-30 animate-in slide-in-from-bottom duration-200">
              <div
                onClick={() => setIsMobileCartOpen(true)}
                className="bg-slate-900/95 backdrop-blur-md text-white rounded-2xl p-2.5 sm:p-3 shadow-2xl flex items-center justify-between cursor-pointer border border-slate-700/60 active:scale-[0.99] transition"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="relative p-1.5 sm:p-2 bg-blue-600 rounded-xl text-white shrink-0">
                    <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[8px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center shadow-xs animate-pulse">
                      {cart.reduce((a, b) => a + b.cartQty, 0)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] sm:text-[11px] font-bold text-slate-300">
                      {cart.reduce((a, b) => a + b.cartQty, 0)} items in Cart
                    </p>
                    <p className="text-xs sm:text-sm font-extrabold tabular-nums text-emerald-400 tabular-nums">
                      {currency} {grandTotal.toLocaleString()}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl flex items-center gap-1 shadow-md shadow-blue-500/25 transition cursor-pointer h-9 sm:h-10"
                >
                  <span>Checkout</span>
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Mobile Floating Cart Bottom Sheet Drawer (lg:hidden) */}
          {isMobileCartOpen && (
            <div className="ios-bottom-sheet-backdrop lg:hidden fixed inset-0 z-50 flex flex-col justify-end animate-in fade-in duration-200">
              {/* Backdrop */}
              <div
                onClick={() => setIsMobileCartOpen(false)}
                className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
              />

              {/* Drawer Panel */}
              <div className="ios-bottom-sheet-panel relative z-10 bg-white rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl border-t border-slate-200 animate-in slide-in-from-bottom duration-300 overflow-hidden">
                {/* Drawer Handle */}
                <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mt-2.5 mb-1 shrink-0" />

                {/* Cart Content Container */}
                <div className="p-2.5 sm:p-4 overflow-y-auto flex-1">
                  {renderCartContent(true)}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ================= HISTORY SUB-TAB VIEW ================= */
        <div className="space-y-3 sm:space-y-5 lg:flex-1 lg:min-h-0 lg:overflow-y-auto pr-0.5 pb-12 lg:pb-6">
          {/* Filters & Actions Control Bar */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-2.5 sm:p-4 shadow-xs space-y-2.5 sm:space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 sm:gap-4">
              {/* Intelligent Search Input */}
              <div className="md:col-span-6 relative flex items-center">
                <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={historySearch}
                  onChange={e => setHistorySearch(e.target.value)}
                  placeholder="Scan invoice, IMEI, customer name..."
                  className="compact-mobile-input w-full pl-8.5 pr-20 sm:pr-24 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-blue-600 focus:bg-white transition h-8.5 sm:h-10"
                />
                <div className="absolute right-1 flex items-center gap-1">
                  {historySearch && (
                    <button
                      type="button"
                      onClick={() => setHistorySearch('')}
                      className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                      title="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setCameraScannerTarget('historySearch');
                      setIsCameraScannerOpen(true);
                    }}
                    className="px-2 sm:px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs flex items-center gap-1 text-[10.5px] sm:text-[11px] font-extrabold cursor-pointer transition h-6.5 sm:h-8"
                    title="Live Camera Barcode Scanner"
                  >
                    <Camera className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    <span>Scan</span>
                  </button>
                </div>
              </div>

              {/* Range Selector Buttons */}
              <div className="md:col-span-6 flex items-center gap-1 overflow-x-auto no-scrollbar justify-start md:justify-end">
                {(['today', 'weekly', 'monthly', 'yearly', 'custom'] as const).map(range => (
                  <button
                    key={range}
                    type="button"
                    onClick={() => setHistoryRange(range)}
                    className={`px-2 sm:px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-extrabold uppercase tracking-wider transition cursor-pointer shrink-0 h-7 sm:h-8 inline-flex items-center ${
                      historyRange === range
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                    }`}
                  >
                    {range}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Specific Date Range Selectors */}
            {historyRange === 'custom' && (
              <div className="flex flex-wrap items-center gap-2 sm:gap-4 bg-slate-50 p-2.5 sm:p-3.5 rounded-xl border border-slate-200/60 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">From:</span>
                  <input
                    type="date"
                    value={historyStartDate}
                    onChange={e => setHistoryStartDate(e.target.value)}
                    className="compact-mobile-input bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">To:</span>
                  <input
                    type="date"
                    value={historyEndDate}
                    onChange={e => setHistoryEndDate(e.target.value)}
                    className="compact-mobile-input bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>
            )}

            {/* Print and WhatsApp Share Actions for Filters */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <p className="text-[11px] sm:text-xs text-slate-500 font-medium">
                Showing <strong className="text-slate-800">{filteredSales.length}</strong> invoices
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handlePrintHistoryReport}
                  className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold transition cursor-pointer h-7.5 sm:h-8.5"
                >
                  <Printer className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span>Print Report</span>
                </button>
                <button
                  type="button"
                  onClick={handleShareHistoryReport}
                  className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold transition cursor-pointer h-7.5 sm:h-8.5"
                >
                  <Share2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-600" />
                  <span>WhatsApp</span>
                </button>
              </div>
            </div>
          </div>

          {/* Quick Net Metrics Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3.5">
            <div className="bg-white border border-slate-200/80 rounded-xl sm:rounded-2xl p-2 sm:p-3.5 shadow-2xs flex flex-col justify-between">
              <p className="text-[9.5px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider line-clamp-1">Net Sales Volume</p>
              <p className="text-xs sm:text-lg font-extrabold tabular-nums text-blue-600 mt-0.5 truncate">
                {currency} {stats.netRevenue.toLocaleString()}
              </p>
              <p className="text-[9.5px] sm:text-[10px] text-slate-500 mt-0.5 font-semibold truncate">{stats.totalInvoices} active bills</p>
            </div>

            <div className="bg-white border border-slate-200/80 rounded-xl sm:rounded-2xl p-2 sm:p-3.5 shadow-2xs flex flex-col justify-between">
              <p className="text-[9.5px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider line-clamp-1">Credit Receivables</p>
              <p className="text-xs sm:text-lg font-extrabold tabular-nums text-purple-600 mt-0.5 truncate">
                {currency} {stats.totalCredit.toLocaleString()}
              </p>
              <p className="text-[9.5px] sm:text-[10px] text-slate-500 mt-0.5 font-semibold truncate">balance due</p>
            </div>

            <div className="bg-white border border-slate-200/80 rounded-xl sm:rounded-2xl p-2 sm:p-3.5 shadow-2xs flex flex-col justify-between">
              <p className="text-[9.5px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider line-clamp-1">Cancelled Bills</p>
              <p className="text-xs sm:text-lg font-extrabold tabular-nums text-rose-600 mt-0.5 truncate">
                {stats.cancelledCount} Bills
              </p>
              <p className="text-[9.5px] sm:text-[10px] text-slate-500 mt-0.5 font-semibold truncate">Void: {currency} {stats.cancelledSum.toLocaleString()}</p>
            </div>

            <div className="bg-white border border-slate-200/80 rounded-xl sm:rounded-2xl p-2 sm:p-3.5 shadow-2xs flex flex-col justify-between">
              <p className="text-[9.5px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider line-clamp-1">Total Invoices</p>
              <p className="text-xs sm:text-lg font-extrabold tabular-nums text-slate-900 mt-0.5 truncate">
                {filteredSales.length} Bills
              </p>
              <p className="text-[9.5px] sm:text-[10px] text-slate-500 mt-0.5 font-semibold truncate">all records</p>
            </div>
          </div>

          {/* Historical Invoices List */}
          <div className="space-y-2 sm:space-y-3">
            {filteredSales.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 text-xs text-slate-400 space-y-2">
                <FileText className="w-10 h-10 mx-auto text-slate-300" />
                <p className="font-bold text-slate-600">No matching sales records found</p>
                <p className="text-slate-400 max-w-xs mx-auto">Try typing another query or selecting a different date range filter above.</p>
              </div>
            ) : (
              filteredSales.map(sale => {
                const isCancelled = sale.status === 'CANCELLED';
                return (
                  <div
                    key={sale.invNo}
                    className={`bg-white border rounded-xl sm:rounded-2xl p-2.5 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-4 transition hover:shadow-xs ${
                      isCancelled 
                        ? 'border-red-100 bg-red-50/20' 
                        : sale.invoiceType === 'credit'
                          ? 'border-purple-100 hover:border-purple-300'
                          : 'border-slate-200/80 hover:border-blue-400'
                    }`}
                  >
                    {/* Left Info Column */}
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-black text-slate-900 text-xs sm:text-sm tabular-nums tracking-wider">
                          #{sale.invNo}
                        </span>
                        
                        {/* Status Badges */}
                        {isCancelled ? (
                          <span className="text-[9px] sm:text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-100 text-rose-700 border border-rose-200">
                            VOID
                          </span>
                        ) : sale.invoiceType === 'credit' ? (
                          <span className="text-[9px] sm:text-[10px] font-bold px-1.5 py-0.2 rounded bg-purple-100 text-purple-700 border border-purple-200">
                            CREDIT
                          </span>
                        ) : (
                          <span className="text-[9px] sm:text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">
                            CASH
                          </span>
                        )}

                        {sale.returnStatus === 'FULL' && (
                          <span className="text-[9px] sm:text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200">
                            RETURNED
                          </span>
                        )}
                        {sale.returnStatus === 'PARTIAL' && (
                          <span className="text-[9px] sm:text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200">
                            PARTIAL RETURN
                          </span>
                        )}

                        <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400 tabular-nums">
                          {new Date(sale.date).toLocaleDateString()} {new Date(sale.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      {/* Customer Info */}
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] sm:text-xs">
                        <p className="font-bold text-slate-800">
                          <span className="font-extrabold text-blue-600">{sale.custName}</span>
                        </p>
                        {sale.custPhone && (
                          <p className="text-slate-500 tabular-nums">{sale.custPhone}</p>
                        )}
                        <span className="text-slate-300">•</span>
                        <p className="text-slate-500 font-semibold">{sale.paymentMethod}</p>
                      </div>

                      {/* Sold items view with Barcodes and IMEIs */}
                      <div className="bg-slate-50/80 border border-slate-100 p-2 sm:p-2.5 rounded-lg sm:rounded-xl space-y-1 max-w-2xl">
                        <div className="divide-y divide-slate-100">
                          {sale.items.map((it, idx) => (
                            <div key={idx} className="py-0.5 text-[11px] sm:text-xs flex flex-wrap items-center justify-between gap-1.5">
                              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                <span className="font-bold text-slate-800 truncate">{it.name}</span>
                                <span className="font-semibold text-slate-400 text-[10px]">x{it.qty}</span>
                                {(it.returnedQty || 0) > 0 && (
                                  <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200">
                                    Returned{it.returnReason ? `: ${it.returnReason}` : ''}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-1">
                                {it.barcode && (
                                  <span className="text-[9px] tabular-nums font-bold bg-slate-200/70 text-slate-600 px-1 py-0.2 rounded">
                                    #{it.barcode}
                                  </span>
                                )}
                                {it.imeis && it.imeis.length > 0 ? (
                                  it.imeis.map((im, uIdx) => (
                                    <span key={uIdx} className="text-[9px] tabular-nums font-bold bg-blue-50 text-blue-700 px-1 py-0.2 rounded border border-blue-200">
                                      {im}
                                    </span>
                                  ))
                                ) : it.imei ? (
                                  <span className="text-[9px] tabular-nums font-bold bg-blue-50 text-blue-700 px-1 py-0.2 rounded border border-blue-200">
                                    {it.imei}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Notes / Reason for cancellation */}
                      {sale.notes && (
                        <p
                          dir="auto"
                          className={`text-[11px] px-2.5 py-1 rounded-lg font-medium border ${
                            isCancelled
                              ? 'text-rose-700 bg-rose-50 border-rose-100'
                              : 'text-slate-800 bg-amber-50 border-amber-200/80'
                          }`}
                        >
                          <strong>{isCancelled ? 'Note:' : 'Note:'}</strong> {sale.notes}
                        </p>
                      )}
                    </div>

                    {/* Right Price & Actions Column */}
                    <div className="flex flex-row md:flex-col items-center md:items-end justify-between gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                      <div className="text-left md:text-right">
                        <p className="text-[15px] sm:text-lg font-black tabular-nums text-slate-900 leading-none">
                          {currency} {sale.grandTotal.toLocaleString()}
                        </p>
                        {sale.invoiceType === 'credit' && (
                          <div className="mt-0.5 flex items-center md:justify-end gap-2 text-[10px] tabular-nums font-bold">
                            <span className="text-emerald-600">
                              Pd: {currency} {(sale.amountPaid || 0).toLocaleString()}
                            </span>
                            {sale.amountDue && sale.amountDue > 0 ? (
                              <span className="text-rose-600">
                                Due: {currency} {sale.amountDue.toLocaleString()}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </div>

                      {/* Compact Actions */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onViewReceipt(sale)}
                          className="h-7.5 w-7.5 sm:h-8 sm:w-8 inline-flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition cursor-pointer"
                          title="Print Invoice Bill"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleShareWhatsapp(sale)}
                          className="h-7.5 w-7.5 sm:h-8 sm:w-8 inline-flex items-center justify-center bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg transition cursor-pointer"
                          title="Share Invoice on WhatsApp"
                        >
                          <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                        </button>

                        {!isCancelled && (
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(sale)}
                            className="h-7.5 w-7.5 sm:h-8 sm:w-8 inline-flex items-center justify-center bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition cursor-pointer"
                            title="Edit Invoice (Modify items or details)"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleOpenDeleteModal(sale)}
                          className={`h-7.5 w-7.5 sm:h-8 sm:w-8 inline-flex items-center justify-center rounded-lg transition cursor-pointer ${
                            isCancelled
                              ? 'bg-rose-100 hover:bg-rose-200 text-rose-800'
                              : 'bg-rose-50 hover:bg-rose-100 text-rose-700'
                          }`}
                          title={isCancelled ? "Delete Cancelled Invoice Permanently" : "Delete / Void Invoice"}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* INVOICE DELETE / CANCEL MODAL */}
      {deleteModalSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4 border border-slate-100 animate-in zoom-in-95">
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base leading-tight">
                    {deleteModalSale.status === 'CANCELLED' ? 'Delete Cancelled Invoice' : 'Delete / Void Invoice'}
                  </h3>
                  <p className="text-xs text-slate-500 tabular-nums">
                    Invoice #{deleteModalSale.invNo} • {new Date(deleteModalSale.date).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeleteModalSale(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Summary Details */}
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between text-slate-600">
                <span>Customer:</span>
                <span className="font-bold text-slate-800">{deleteModalSale.custName || 'Walk-in Customer'}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Items:</span>
                <span className="font-medium text-slate-800">
                  {deleteModalSale.items.length} items ({deleteModalSale.items.reduce((a, b) => a + b.qty, 0)} units)
                </span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-slate-200">
                <span className="font-bold text-slate-700">Total Amount:</span>
                <span className="tabular-nums font-black text-sm text-slate-900">
                  {currency} {deleteModalSale.grandTotal.toLocaleString()}
                </span>
              </div>
              {deleteModalSale.status === 'CANCELLED' && (
                <div className="pt-1 text-center font-bold text-rose-600">
                  ⚠️ This invoice is already cancelled.
                </div>
              )}
            </div>

            {/* Choose Action (Cancel vs Permanent) */}
            {deleteModalSale.status !== 'CANCELLED' ? (
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block">Choose Action:</label>
                <div className="grid grid-cols-1 gap-2">
                  <div
                    onClick={() => setDeleteMode('cancel')}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                      deleteMode === 'cancel'
                        ? 'border-rose-400 bg-rose-50/50 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <RotateCcw className="w-4 h-4 text-rose-600" />
                        <span className="font-bold text-xs text-slate-900">Void & Cancel (Recommended)</span>
                      </div>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">Safe</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Restores inventory stock, marks IMEIs as available, reverses credit balance, and marks status as CANCELLED.
                    </p>
                  </div>

                  <div
                    onClick={() => setDeleteMode('permanent')}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                      deleteMode === 'permanent'
                        ? 'border-rose-400 bg-rose-50/50 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Trash2 className="w-4 h-4 text-rose-600" />
                      <span className="font-bold text-xs text-rose-700">Permanently Delete Invoice</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Completely removes this invoice from records. (Also restores stock & Khata balance).
                    </p>
                  </div>
                </div>

                {deleteMode === 'cancel' && (
                  <div className="pt-2">
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">
                      Reason for cancellation:
                    </label>
                    <input
                      type="text"
                      value={cancelReason}
                      onChange={e => setCancelReason(e.target.value)}
                      placeholder="e.g. Customer returned items, entered by mistake..."
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-600">
                Are you sure you want to permanently delete this cancelled invoice? This will remove it completely from your history.
              </p>
            )}

            {/* Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteModalSale(null)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer text-center"
              >
                Keep Invoice
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-md shadow-rose-600/20 transition cursor-pointer text-center"
              >
                {deleteMode === 'permanent' || deleteModalSale.status === 'CANCELLED'
                  ? 'Permanently Delete'
                  : 'Confirm Void & Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INVOICE EDIT MODAL */}
      {editModalSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 border border-slate-100 animate-in zoom-in-95 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <Edit className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base leading-tight">
                    Edit Invoice #{editModalSale.invNo}
                  </h3>
                  <p className="text-xs text-slate-500 tabular-nums">
                    Total: {currency} {editModalSale.grandTotal.toLocaleString()} • {editModalSale.items.length} items
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditModalSale(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
              <button
                type="button"
                onClick={() => setEditMode('cart')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  editMode === 'cart'
                    ? 'bg-white text-blue-600 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>Full Cart Re-edit (Change Items)</span>
              </button>
              <button
                type="button"
                onClick={() => setEditMode('quick')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  editMode === 'quick'
                    ? 'bg-white text-blue-600 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Quick Edit Info</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto pr-1 flex-1 space-y-4">
              {editMode === 'cart' ? (
                <div className="space-y-3">
                  <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs space-y-2">
                    <p className="font-bold flex items-center gap-1.5">
                      <ShoppingCart className="w-4 h-4 text-blue-600" />
                      Load Invoice back into POS Cart:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-slate-700 text-[11px] pl-1">
                      <li>Previous invoice will be temporarily cancelled to restore active stock.</li>
                      <li>All items, IMEIs, customer name, discount, and payment type will load directly into the POS checkout.</li>
                      <li>You can add/remove products, adjust quantities, change prices, and reprint an updated bill.</li>
                    </ul>
                  </div>

                  {/* Items Preview */}
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs">
                    <p className="font-bold text-slate-700 mb-2">Items to load:</p>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {editModalSale.items.map((it, idx) => (
                        <div key={idx} className="flex justify-between items-center text-[11px] border-b border-slate-200 pb-1">
                          <span className="font-medium text-slate-800">{it.name} (x{it.qty})</span>
                          <span className="tabular-nums font-bold text-slate-900">
                            {currency} {(it.salePrice * it.qty).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Customer Name:</label>
                    <input
                      type="text"
                      value={quickCustName}
                      onChange={e => setQuickCustName(e.target.value)}
                      placeholder="Walk-in Customer"
                      className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Customer Phone:</label>
                    <input
                      type="text"
                      value={quickCustPhone}
                      onChange={e => setQuickCustPhone(e.target.value)}
                      placeholder="0300-1234567"
                      className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Payment Method:</label>
                    <select
                      value={quickPaymentMethod}
                      onChange={e => setQuickPaymentMethod(e.target.value as PaymentMethod)}
                      className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="Cash">Cash</option>
                      <option value="Easypaisa">Easypaisa</option>
                      <option value="JazzCash">JazzCash</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Credit Card">Credit Card</option>
                      <option value="Khata">Customer Ledger (Credit)</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Notes / Remarks:</label>
                    <input
                      type="text"
                      value={quickNotes}
                      onChange={e => setQuickNotes(e.target.value)}
                      placeholder="Add any special note..."
                      className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-3 border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={() => setEditModalSale(null)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer text-center"
              >
                Cancel
              </button>
              {editMode === 'cart' ? (
                <button
                  type="button"
                  onClick={() => handleExecuteCartEdit(editModalSale)}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-md shadow-blue-600/20 transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>Load Cart & Edit Items</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSaveQuickEdit}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md shadow-emerald-600/20 transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Info Changes</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Product Details Modal (Daraz Style Details & IMEIs) */}
      {selectedProductDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full p-4 sm:p-6 shadow-2xl space-y-4 border border-slate-100 my-auto animate-in zoom-in-95 duration-200 overflow-y-auto max-h-[90dvh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm sm:text-base">Product Details & Specs</h3>
                  <p className="text-[11px] text-slate-500">Stock specifications, IMEI inventory & instant billing</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProductDetails(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Product Card / Image & Info */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3 sm:gap-4 bg-slate-50 p-3 sm:p-4 rounded-2xl border border-slate-200/80">
              {selectedProductDetails.image ? (
                <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-xl border border-slate-200 overflow-hidden bg-white shadow-xs shrink-0 flex items-center justify-center p-1">
                  <img
                    src={selectedProductDetails.image}
                    alt={selectedProductDetails.name}
                    className="w-full h-full object-contain rounded-lg"
                  />
                </div>
              ) : (
                <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-2xl sm:text-3xl shadow-md shrink-0">
                  {selectedProductDetails.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="space-y-1.5 text-left w-full min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-blue-100 text-blue-800 rounded-md">
                    {selectedProductDetails.category}
                  </span>
                  {selectedProductDetails.variants && selectedProductDetails.variants.length > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-purple-100 text-purple-800 rounded-md">
                      {selectedProductDetails.variants.length} Color Variants
                    </span>
                  )}
                </div>
                <h4 className="font-extrabold text-slate-900 text-base sm:text-lg leading-snug">
                  {selectedProductDetails.name}
                </h4>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pt-1">
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">Retail Price</span>
                    <span className="tabular-nums font-black text-blue-600 text-sm sm:text-base">
                      {(() => {
                        const prices = (selectedProductDetails.variants || [])
                          .map(v => Number(v.salePrice))
                          .filter(p => !isNaN(p) && p > 0);
                        if (prices.length === 0) prices.push(selectedProductDetails.salePrice);
                        const minP = Math.min(...prices);
                        const maxP = Math.max(...prices);
                        return minP === maxP
                          ? `${currency} ${minP.toLocaleString()}`
                          : `${currency} ${minP.toLocaleString()} - ${maxP.toLocaleString()}`;
                      })()}
                    </span>
                  </div>
                  {selectedProductDetails.wholesalePrice ? (
                    <div>
                      <span className="text-purple-600 block text-[10px] font-bold uppercase">Wholesale Price</span>
                      <span className="tabular-nums font-black text-purple-700 text-sm sm:text-base">
                        {currency} {selectedProductDetails.wholesalePrice.toLocaleString()}
                      </span>
                    </div>
                  ) : null}
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">In Stock</span>
                    <span className={`tabular-nums font-bold text-sm sm:text-base ${
                      selectedProductDetails.qty > 0 ? 'text-emerald-700' : 'text-rose-600'
                    }`}>
                      {selectedProductDetails.qty} units
                    </span>
                  </div>
                </div>

                {selectedProductDetails.barcode && (
                  <div className="text-xs pt-0.5">
                    <span className="text-slate-400 text-[10px] font-bold uppercase">Barcode / SKU: </span>
                    <span className="tabular-nums font-bold text-slate-700">{selectedProductDetails.barcode}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Colors & IMEIs Breakdown */}
            <div className="space-y-2.5">
              <h5 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                Color Variants & Dedicated IMEIs
              </h5>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
                {selectedProductDetails.variants && selectedProductDetails.variants.length > 0 ? (
                  selectedProductDetails.variants.map((v: MobileVariant, vIdx: number) => {
                    const vKey = v.id || getVariantLabel(v);
                    const vTotal = getVariantStock(v);
                    const vInCart = cart
                      .filter(c => c.id === selectedProductDetails.id && (c.selectedVariantId || '') === vKey)
                      .reduce((sum, c) => sum + c.cartQty, 0);
                    const vRem = Math.max(0, vTotal - vInCart);
                    const vPrices = getVariantPricing(selectedProductDetails, v);
                    const vUnitPrice = getItemUnitPrice(vPrices);
                    return (
                      <div key={v.id || vIdx} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 shadow-2xs">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                              <span className="w-5 h-5 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center tabular-nums text-[10px] shrink-0">
                                #{vIdx + 1}
                              </span>
                              <span className="truncate">{getVariantLabel(v)}</span>
                            </span>
                            <span className="text-[10px] font-bold text-blue-600 tabular-nums ml-6.5 block">
                              {currency} {vUnitPrice.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={`tabular-nums text-[11px] font-bold px-2 py-0.5 rounded-full ${
                              vRem > 0 ? 'text-emerald-700 bg-emerald-50' : 'text-rose-600 bg-rose-50'
                            }`}>
                              {vRem > 0 ? `${vRem} left` : 'Out'}
                            </span>
                            <button
                              type="button"
                              onClick={() => addToCart(selectedProductDetails, undefined, v)}
                              disabled={vRem <= 0}
                              className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-0.5 transition cursor-pointer ${
                                vRem <= 0
                                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                  : 'bg-blue-600 hover:bg-blue-700 text-white'
                              }`}
                            >
                              <Plus className="w-3 h-3" />
                              <span>Add</span>
                            </button>
                          </div>
                        </div>
                        {v.note && (
                          <div className="text-[10px] bg-amber-50/80 border border-amber-200/70 text-amber-900 px-2 py-1 rounded-lg font-medium">
                            <span className="font-bold text-amber-700">Note:</span> {v.note}
                          </div>
                        )}
                        {v.imeis && v.imeis.filter(Boolean).length > 0 && (
                          <div className="pt-1 border-t border-slate-200/70 flex flex-wrap gap-1">
                            {v.imeis.filter(Boolean).map((im: string, imIdx: number) => (
                              <button
                                key={imIdx}
                                type="button"
                                onClick={() => handleCopyImei(im)}
                                className="tabular-nums text-[10px] bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer transition shadow-2xs"
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
                    );
                  })
                ) : selectedProductDetails.imeis && selectedProductDetails.imeis.filter(Boolean).length > 0 ? (
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                    <span className="text-xs font-bold text-slate-700 block">Registered IMEIs:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedProductDetails.imeis.filter(Boolean).map((im, imIdx) => (
                        <button
                          key={imIdx}
                          type="button"
                          onClick={() => handleCopyImei(im)}
                          className="tabular-nums text-[10px] bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer transition shadow-2xs"
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
                ) : selectedProductDetails.imei ? (
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">IMEI: </span>
                    <button
                      type="button"
                      onClick={() => handleCopyImei(selectedProductDetails.imei!)}
                      className="tabular-nums text-xs text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 px-2 py-1 rounded flex items-center gap-1 cursor-pointer shadow-2xs"
                    >
                      <span>{selectedProductDetails.imei}</span>
                      {copiedImei === selectedProductDetails.imei ? (
                        <Check className="w-3 h-3 text-emerald-600" />
                      ) : (
                        <Copy className="w-3 h-3 text-blue-400" />
                      )}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic py-2 text-center bg-slate-50 rounded-xl">
                    No dedicated IMEI tracked for this product item.
                  </p>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  addToCart(selectedProductDetails);
                }}
                disabled={
                  selectedProductDetails.qty <=
                  cart.filter(c => c.id === selectedProductDetails.id).reduce((sum, c) => sum + c.cartQty, 0)
                }
                className={`w-full sm:flex-1 py-2.5 px-4 font-bold text-xs rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-2 min-h-[42px] ${
                  selectedProductDetails.qty <=
                  cart.filter(c => c.id === selectedProductDetails.id).reduce((sum, c) => sum + c.cartQty, 0)
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20 active:scale-[0.98]'
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>
                  {selectedProductDetails.variants && selectedProductDetails.variants.length > 1
                    ? 'Select Variant & Add'
                    : 'Add to Bill / Cart'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleWhatsAppShareProduct(selectedProductDetails)}
                className="w-full sm:w-auto py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-2 min-h-[42px]"
                title="Share details with customer on WhatsApp"
              >
                <Share2 className="w-4 h-4" />
                <span>Share WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedProductDetails(null)}
                className="w-full sm:w-auto py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer min-h-[42px]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Variant Picker Modal for Multi-Variant Products */}
      {variantPickerItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-4 sm:p-5 shadow-2xl space-y-4 border border-slate-100 my-auto animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                  <Layers className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-black text-slate-900 text-sm sm:text-base truncate">
                    Select Variant
                  </h3>
                  <p className="text-[11px] text-slate-500 truncate">
                    {variantPickerItem.name} • Choose variant to add to cart
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setVariantPickerItem(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 max-h-[60dvh] overflow-y-auto pr-1 scrollbar-thin">
              {(variantPickerItem.variants || []).map((v, vIdx) => {
                const vKey = v.id || getVariantLabel(v);
                const vTotal = getVariantStock(v);
                const vInCart = cart
                  .filter(c => c.id === variantPickerItem.id && (c.selectedVariantId || '') === vKey)
                  .reduce((sum, c) => sum + c.cartQty, 0);
                const vRemaining = Math.max(0, vTotal - vInCart);
                const vPricing = getVariantPricing(variantPickerItem, v);
                const vPrice = getItemUnitPrice(vPricing);
                const imeiCount = Array.isArray(v.imeis) ? v.imeis.filter(Boolean).length : 0;

                return (
                  <button
                    key={v.id || vIdx}
                    type="button"
                    disabled={vRemaining <= 0}
                    onClick={() => {
                      addToCart(variantPickerItem, undefined, v);
                      setVariantPickerItem(null);
                      setSelectedProductDetails(null);
                    }}
                    className={`w-full text-left p-3 rounded-2xl border transition flex items-center justify-between gap-3 ${
                      vRemaining <= 0
                        ? 'bg-slate-50 border-slate-200 opacity-55 cursor-not-allowed'
                        : 'bg-white border-slate-200 hover:border-blue-500 hover:bg-blue-50/40 cursor-pointer shadow-2xs active:scale-[0.99]'
                    }`}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-md bg-purple-100 text-purple-700 flex items-center justify-center tabular-nums text-[10px] font-bold shrink-0">
                          #{vIdx + 1}
                        </span>
                        <span className="font-extrabold text-xs sm:text-sm text-slate-900 truncate">
                          {getVariantLabel(v)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] pl-6.5 flex-wrap">
                        <span
                          className={`tabular-nums font-bold px-2 py-0.5 rounded-full ${
                            vRemaining > 2
                              ? 'bg-emerald-50 text-emerald-700'
                              : vRemaining > 0
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-rose-50 text-rose-600'
                          }`}
                        >
                          {vRemaining > 0 ? `${vRemaining} in stock` : 'Out of stock'}
                        </span>
                        {imeiCount > 0 && (
                          <span className="text-[10px] text-slate-500 font-semibold tabular-nums">
                            {imeiCount} IMEI{imeiCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      {v.note && (
                        <div className="text-[10px] text-amber-800 bg-amber-50/80 border border-amber-200/70 rounded-md px-1.5 py-0.5 ml-6.5 font-medium truncate">
                          Note: {v.note}
                        </div>
                      )}
                    </div>

                    <div className="text-right shrink-0 space-y-1">
                      <div
                        className={`tabular-nums font-black text-xs sm:text-sm ${
                          saleMode === 'wholesale' ? 'text-purple-700' : 'text-blue-600'
                        }`}
                      >
                        {currency} {vPrice.toLocaleString()}
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                          vRemaining <= 0
                            ? 'bg-slate-200 text-slate-500'
                            : saleMode === 'wholesale'
                            ? 'bg-purple-600 text-white'
                            : 'bg-blue-600 text-white'
                        }`}
                      >
                        <Plus className="w-3 h-3" />
                        Add
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setVariantPickerItem(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Camera Barcode & IMEI Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isCameraScannerOpen}
        onClose={() => setIsCameraScannerOpen(false)}
        onScan={(code) => {
          if (cameraScannerTarget === 'productSearch') {
            const matched = handleScanOrQuickMatch(code, 'scanner');
            if (!matched) {
              setSearch(code);
              showToast(`Product Scanned: ${code}`, 'info');
            }
          } else {
            setHistorySearch(code);
            showToast(`Invoice Code Scanned: ${code}`, 'success');
          }
        }}
        title={
          cameraScannerTarget === 'productSearch'
            ? 'Scan Product Barcode / IMEI to Search'
            : 'Scan Invoice Barcode / IMEI'
        }
      />

      {settings && (
        <InvoiceShareModal
          sale={shareModalSale}
          settings={settings}
          isOpen={!!shareModalSale}
          onClose={() => setShareModalSale(null)}
        />
      )}
    </div>
  );
};

export const PosTab = React.memo(PosTabComponent);
