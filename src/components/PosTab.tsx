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
  RotateCcw,
  Banknote,
  BookOpen,
  FileText,
  Calendar,
  Share2,
  Edit,
  CheckCircle,
  AlertTriangle,
  Save,
  X,
  Check,
  ArrowLeft,
  ChevronUp,
  Camera,
  Layers,
  Copy,
  Sliders
} from 'lucide-react';
import { useToast } from './Toast';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { useFormDraft } from '../hooks/useFormDraft';
import { generateNextInvoiceNumber, extractItemImeis } from '../utils/imeiManager';
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
  onCompleteEditedSale?: (originalInvNo: string, updatedSale: SaleRecord) => void;
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
  onBackToHome?: () => void;
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
  settings,
  onOpenPosSettings,
  onCompleteSale,
  onCompleteEditedSale,
  onOpenAddStock,
  onOpenPdfReport,
  onOpenSalesReturn,
  onViewReceipt,
  onCancelSale,
  onDeleteSale,
  onUpdateSale,
  saleToEdit,
  onClearSaleToEdit,
  onBackToHome,
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
  const [lastScannedItem, setLastScannedItem] = useState<{
    itemId: string;
    imei?: string;
    variantLabel?: string;
  } | null>(null);

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

  // Intercept hardware Back to close topmost POS modal/drawer before tab navigation
  React.useEffect(() => {
    const handleHardwareBack = (e: Event) => {
      if (shareModalSale || isCameraScannerOpen) return;
      if (variantPickerItem) {
        e.preventDefault();
        setVariantPickerItem(null);
      } else if (selectedProductDetails) {
        e.preventDefault();
        setSelectedProductDetails(null);
      } else if (editModalSale) {
        e.preventDefault();
        setEditModalSale(null);
      } else if (deleteModalSale) {
        e.preventDefault();
        setDeleteModalSale(null);
      } else if (isMobileCartOpen) {
        e.preventDefault();
        setIsMobileCartOpen(false);
      } else if (posSubTab === 'history') {
        e.preventDefault();
        setPosSubTab('billing');
      }
    };
    window.addEventListener('pos-hardware-back', handleHardwareBack);
    return () => window.removeEventListener('pos-hardware-back', handleHardwareBack);
  });

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
        [itemNamesAndSpecs, sale.notes]
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
  const [quickNotes, setQuickNotes] = useState('');

  // Handle external saleToEdit (e.g. from Reports tab or Receipt modal)
  React.useEffect(() => {
    if (saleToEdit) {
      setEditModalSale(saleToEdit);
      setQuickCustName(saleToEdit.custName || '');
      setQuickCustPhone(saleToEdit.custPhone || '');
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
    setQuickNotes(sale.notes || '');
    setEditMode('cart');
  };

  const handleExecuteCartEdit = (sale: SaleRecord) => {
    if (sale.status === 'CANCELLED') {
      showToast('Cannot re-edit an already cancelled invoice', 'error');
      return;
    }

    // Non-destructive load: do NOT cancel/void the original invoice upfront.
    // Original invoice stays untouched if user backs out or cancels editing.
    const isWholesaleSale = (sale.saleMode || 'retail') === 'wholesale';

    const parsedCart: CartItem[] = sale.items.map(si => {
      const originalProduct = inventory.find(i => i.id === si.id || i.name.toLowerCase() === si.name.toLowerCase());
      const soldImeis = si.imeis || (si.imei ? si.imei.split(',').map(s => s.trim()).filter(Boolean) : []);
      const existingAvailImeis = originalProduct ? extractItemImeis(originalProduct) : [];
      const mergedImeis = Array.from(new Set([...soldImeis, ...existingAvailImeis]));
      const baseWholesale = originalProduct?.wholesalePrice ?? si.wholesalePrice;
      const customWsPrice =
        isWholesaleSale && si.salePrice !== undefined ? si.salePrice : undefined;

      return {
        id: si.id,
        name: si.name,
        category: si.category || originalProduct?.category || 'Android Mobile',
        costPrice: si.costPrice,
        salePrice: originalProduct?.salePrice || si.salePrice,
        wholesalePrice: baseWholesale,
        customWholesalePrice: customWsPrice,
        boxSize: originalProduct?.boxSize,
        qty: originalProduct ? originalProduct.qty + si.qty : si.qty,
        status: originalProduct?.status || 'ACTIVE',
        selectedVariantId: si.variantId,
        selectedVariantLabel: si.variantLabel,
        cartQty: si.qty,
        selectedImeis: soldImeis,
        imei: soldImeis.length > 0 ? soldImeis.join(', ') : originalProduct?.imei,
        imeis: mergedImeis.length > 0 ? mergedImeis : undefined,
        barcode: si.barcode || originalProduct?.barcode,
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
      amountPaid: sale.amountPaid !== undefined ? sale.amountPaid : '',
      billNote: sale.notes || '',
      editingOriginalDate: sale.date,
      editingOriginalInvNo: sale.invNo,
    });

    setEditModalSale(null);
    setPosSubTab('billing');
    showToast(`Editing #${sale.invNo} — original invoice stays active until you update.`, 'info');
  };

  const handleSaveQuickEdit = () => {
    if (!editModalSale) return;
    const updated: SaleRecord = {
      ...editModalSale,
      custName: quickCustName.trim() || 'Walk-in Customer',
      custPhone: quickCustPhone.trim() || undefined,
      paymentMethod: 'Cash',
      accountId: undefined,
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
                  <td>${s.invoiceType === 'credit' ? 'Credit' : 'Cash'}</td>
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
  const amountPaid = draft.amountPaid !== undefined ? draft.amountPaid : '';
  const billNote = draft.billNote || '';

  const editingOriginalSale = useMemo(() => {
    if (!draft.editingOriginalInvNo) return null;
    return (
      (sales || []).find(s => s.invNo === draft.editingOriginalInvNo && s.status !== 'CANCELLED') ||
      null
    );
  }, [draft.editingOriginalInvNo, sales]);

  const editingHeldQtyByProduct = useMemo(() => {
    const map = new Map<string, number>();
    if (!editingOriginalSale) return map;
    editingOriginalSale.items.forEach(si => {
      map.set(si.id, (map.get(si.id) || 0) + (si.qty || 0));
    });
    return map;
  }, [editingOriginalSale]);

  const getEffectiveProductQty = (item: InventoryItem): number =>
    item.qty + (editingHeldQtyByProduct.get(item.id) || 0);

  const getEffectiveVariantQty = (item: InventoryItem, v: MobileVariant): number => {
    const base = getVariantStock(v);
    if (!editingOriginalSale) return base;
    const vId = v.id || getVariantLabel(v);
    const held = editingOriginalSale.items
      .filter(si => si.id === item.id && (si.variantId || '') === vId)
      .reduce((sum, si) => sum + (si.qty || 0), 0);
    return base + held;
  };

  const getEffectiveProductImeis = (item: InventoryItem, v?: MobileVariant): string[] => {
    const baseImeis =
      v && Array.isArray(v.imeis) && v.imeis.filter(Boolean).length > 0
        ? v.imeis.filter(Boolean)
        : extractItemImeis(item);
    if (!editingOriginalSale) return baseImeis;
    const vId = v ? v.id || getVariantLabel(v) : undefined;
    const heldImeis = editingOriginalSale.items
      .filter(si => si.id === item.id && (!vId || (si.variantId || '') === vId))
      .flatMap(si => si.imeis || (si.imei ? si.imei.split(',').map(x => x.trim()).filter(Boolean) : []));
    return Array.from(new Set([...baseImeis, ...heldImeis]));
  };

  // Helper to get active price per unit based on Mode (Retail vs Custom Wholesale Price)
  const getItemUnitPrice = (
    item: { salePrice: number; wholesalePrice?: number; customWholesalePrice?: number },
    mode = saleMode
  ) => {
    if (mode === 'wholesale') {
      if (item.customWholesalePrice !== undefined && !isNaN(item.customWholesalePrice)) {
        return Math.max(0, item.customWholesalePrice);
      }
      return item.wholesalePrice && item.wholesalePrice > 0
        ? item.wholesalePrice
        : item.salePrice;
    }
    return item.salePrice;
  };

  const updateCartItemWholesalePrice = (
    id: string,
    variantId: string | undefined,
    rawVal: string
  ) => {
    const parsed = rawVal === '' ? 0 : Math.max(0, Number(rawVal) || 0);
    setCart(prev =>
      prev.map(c =>
        c.id === id && (c.selectedVariantId || '') === (variantId || '')
          ? { ...c, customWholesalePrice: parsed }
          : c
      )
    );
  };

  const resetCartItemWholesalePrice = (id: string, variantId?: string) => {
    setCart(prev =>
      prev.map(c =>
        c.id === id && (c.selectedVariantId || '') === (variantId || '')
          ? { ...c, customWholesalePrice: undefined }
          : c
      )
    );
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
    setDraft(prev => {
      const selected = prev.selectedKhataId
        ? khataCustomers.find(k => k.id === prev.selectedKhataId)
        : undefined;
      const keepsSelection =
        selected && selected.name.trim().toLowerCase() === name.trim().toLowerCase();
      return {
        ...prev,
        custName: name,
        selectedKhataId: keepsSelection ? prev.selectedKhataId : '',
      };
    });
  };

  const setCustPhone = (phone: string) => {
    setDraft(prev => {
      const selected = prev.selectedKhataId
        ? khataCustomers.find(k => k.id === prev.selectedKhataId)
        : undefined;
      const normInput = phone.replace(/[^0-9]/g, '');
      const normSelected = (selected?.phone || '').replace(/[^0-9]/g, '');
      const keepsSelection =
        selected && normInput && normSelected && normInput === normSelected;
      return {
        ...prev,
        custPhone: phone,
        selectedKhataId: keepsSelection ? prev.selectedKhataId : '',
      };
    });
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
    const maxProductStock = getEffectiveProductQty(item);

    if (maxProductStock <= 0 || totalProductInCart >= maxProductStock) {
      showToast(maxProductStock <= 0 ? 'Item is out of stock' : `Only ${maxProductStock} units available in stock`, 'error');
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
    const itemImeis = getEffectiveProductImeis(item, effectiveVariant);

    if (effectiveVariant) {
      const vStock =
        item.variants && item.variants.length === 1
          ? Math.max(getEffectiveVariantQty(item, effectiveVariant), maxProductStock)
          : getEffectiveVariantQty(item, effectiveVariant);
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
        if (totalInPrev >= maxProductStock) {
          showToast(`Only ${maxProductStock} units available in stock`, 'warning');
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
    const itemImeis = getEffectiveProductImeis(invItem, targetVariant);
    const maxProductStock = getEffectiveProductQty(invItem);

    setCart(prev => {
      const totalProductQty = prev
        .filter(c => c.id === id)
        .reduce((sum, c) => sum + c.cartQty, 0);

      return prev
        .map(c => {
          if (c.id === id && (c.selectedVariantId || '') === (variantId || '')) {
            const newQty = c.cartQty + delta;
            if (delta > 0 && totalProductQty + delta > maxProductStock) {
              showToast(`Stock limit (${maxProductStock}) reached`, 'warning');
              return c;
            }
            if (delta > 0 && targetVariant) {
              const vMax =
                invItem.variants && invItem.variants.length === 1
                  ? Math.max(getEffectiveVariantQty(invItem, targetVariant), maxProductStock)
                  : getEffectiveVariantQty(invItem, targetVariant);
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

  const matchedKhataCustomer = useMemo(() => {
    if (selectedKhataId) {
      return khataCustomers.find(k => k.id === selectedKhataId) || null;
    }
    const rawPhoneDigits = custPhone.replace(/[^0-9]/g, '');
    if (rawPhoneDigits.length >= 7) {
      const byPhone = khataCustomers.find(k => {
        const kDigits = (k.phone || '').replace(/[^0-9]/g, '');
        return kDigits.length >= 7 && kDigits === rawPhoneDigits;
      });
      if (byPhone) return byPhone;
    }
    if (custPhone.trim()) {
      const cleanP = custPhone.trim().toLowerCase();
      const byExactPhone = khataCustomers.find(k => (k.phone || '').trim().toLowerCase() === cleanP);
      if (byExactPhone) return byExactPhone;
    }
    if (custName.trim()) {
      const cleanN = custName.trim().toLowerCase();
      return khataCustomers.find(k => (k.name || '').trim().toLowerCase() === cleanN) || null;
    }
    return null;
  }, [selectedKhataId, custPhone, custName, khataCustomers]);

  const rawKhataBalance = matchedKhataCustomer ? Math.max(0, matchedKhataCustomer.balance || 0) : 0;
  const editingOwnCreditOffset =
    editingOriginalSale &&
    editingOriginalSale.invoiceType === 'credit' &&
    editingOriginalSale.amountDue &&
    matchedKhataCustomer &&
    (editingOriginalSale.khataCustomerId === matchedKhataCustomer.id ||
      editingOriginalSale.custName?.trim().toLowerCase() === matchedKhataCustomer.name.trim().toLowerCase())
      ? editingOriginalSale.amountDue
      : 0;
  const previousKhataBalance = Math.max(0, rawKhataBalance - editingOwnCreditOffset);
  const totalOutstanding = grandTotal + previousKhataBalance;
  const netBalanceAfterPaid = Math.max(0, totalOutstanding - actualPaid);

  const handleKhataSelect = (khataId: string) => {
    setSelectedKhataId(khataId);
    if (!khataId) {
      setDraft(prev => ({
        ...prev,
        selectedKhataId: '',
        custName: '',
        custPhone: '',
      }));
    }
  };

  const renderCartContent = (isMobile = false) => (
    <div
      className={`rounded-2xl flex flex-col ${
        isMobile
          ? 'bg-transparent p-2.5 space-y-2'
          : 'bg-white/88 backdrop-blur-xl border border-white/90 shadow-xl shadow-sky-900/5 p-3 sm:p-3.5 gap-2.5'
      }`}
    >
      {/* Cart Header */}
      <div className={`flex items-center justify-between border-b border-slate-200/70 shrink-0 ${isMobile ? 'pb-1.5' : 'pb-2'}`}>
        <div className="flex items-center gap-2 min-w-0">
          <div className={`${isMobile ? 'w-7 h-7' : 'w-8 h-8'} rounded-xl flex items-center justify-center shrink-0 ${
            saleMode === 'wholesale' ? 'bg-purple-500/15 text-purple-700' : 'bg-blue-500/15 text-blue-700'
          }`}>
            <ShoppingCart className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="font-extrabold text-slate-900 text-xs sm:text-sm leading-tight truncate">
              {draft.editingOriginalInvNo
                ? `Editing #${draft.editingOriginalInvNo} (${totalCartItems})`
                : `Billing Cart (${totalCartItems})`}
            </h3>
            {hasActiveDraft && cart.length > 0 && !draft.editingOriginalInvNo && (
              <p className="text-[10px] text-amber-700 font-semibold leading-tight">
                Draft auto-saved
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {!isMobile && onOpenPdfReport && (
            <button
              type="button"
              onClick={onOpenPdfReport}
              className="text-[11px] font-bold text-rose-700 bg-rose-50/90 hover:bg-rose-100 border border-rose-200/80 px-2.5 py-1 rounded-xl transition flex items-center gap-1 cursor-pointer min-h-[30px]"
              title="Export Sales & Invoices PDF Report"
            >
              <FileText className="w-3 h-3 text-rose-600" />
              <span>PDF</span>
            </button>
          )}
          {draft.editingOriginalInvNo ? (
            <button
              type="button"
              onClick={() => {
                resetDraft();
                setLastScannedItem(null);
                if (isMobile) setIsMobileCartOpen(false);
                showToast('Edit cancelled — original invoice untouched!', 'info');
              }}
              className="text-[11px] font-extrabold text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-2.5 py-1 rounded-xl transition cursor-pointer min-h-[30px]"
            >
              Cancel Edit
            </button>
          ) : cart.length > 0 ? (
            <button
              type="button"
              onClick={clearCart}
              className="text-[11px] font-bold text-rose-600 hover:text-rose-700 bg-white/85 hover:bg-rose-50 border border-slate-200/80 px-2.5 py-1 rounded-xl transition cursor-pointer min-h-[30px]"
            >
              Clear
            </button>
          ) : null}
          {isMobile && (
            <button
              type="button"
              onClick={() => setIsMobileCartOpen(false)}
              className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-800 rounded-xl bg-slate-100 hover:bg-slate-200 transition cursor-pointer"
              aria-label="Close cart"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Cart Body */}
      <div className={isMobile ? 'space-y-1.5' : 'space-y-2.5'}>
        {draft.editingOriginalDate && (
          <div className="bg-amber-50/95 border border-amber-200/90 rounded-xl px-2.5 py-1 flex items-center justify-between gap-2 text-[10.5px] text-amber-900">
            <div className="flex items-center gap-1.5 min-w-0 font-bold">
              <Calendar className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="truncate">
                #{draft.editingOriginalInvNo} active until Update · {new Date(draft.editingOriginalDate).toLocaleDateString()}
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                setDraft(prev => ({
                  ...prev,
                  editingOriginalDate: undefined,
                }))
              }
              className="text-[10px] font-extrabold text-amber-800 hover:text-amber-950 bg-amber-100 hover:bg-amber-200 px-2 py-0.5 rounded-lg transition cursor-pointer shrink-0"
              title="Use Today's Date Instead"
            >
              Use Today
            </button>
          </div>
        )}

        {/* Customer & Payment Mode Card */}
        <div className={`bg-white/75 rounded-xl border border-slate-200/75 shadow-2xs ${isMobile ? 'p-2 space-y-1.5' : 'p-2.5 space-y-2'}`}>
          <div className="grid grid-cols-2 gap-1 bg-slate-100/90 p-0.5 rounded-xl">
            <button
              type="button"
              onClick={() => setInvoiceType('cash')}
              className={`py-1 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${isMobile ? 'min-h-[30px]' : 'min-h-[34px]'} ${
                invoiceType === 'cash'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Banknote className="w-3.5 h-3.5" />
              <span>Cash Bill</span>
            </button>

            <button
              type="button"
              onClick={() => setInvoiceType('credit')}
              className={`py-1 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${isMobile ? 'min-h-[30px]' : 'min-h-[34px]'} ${
                invoiceType === 'credit'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Credit / Khata</span>
            </button>
          </div>

          {khataCustomers.length > 0 && (
            <div className="flex items-center gap-1.5">
              <select
                value={selectedKhataId || matchedKhataCustomer?.id || ''}
                onChange={e => handleKhataSelect(e.target.value)}
                className={`compact-mobile-input flex-1 min-w-0 bg-white/90 border border-slate-200/80 rounded-xl px-2.5 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-600 ${isMobile ? 'min-h-[32px]' : 'min-h-[36px]'}`}
              >
                <option value="">
                  {invoiceType === 'credit'
                    ? 'Select Existing Khata Customer...'
                    : 'Select Regular / Khata Customer (Optional)...'}
                </option>
                {khataCustomers.map(k => (
                  <option key={k.id} value={k.id}>
                    {k.name} ({k.phone}){k.balance > 0 ? ` — Prev: ${currency} ${k.balance.toLocaleString()}` : ''}
                  </option>
                ))}
              </select>
              {(selectedKhataId || matchedKhataCustomer) && (
                <button
                  type="button"
                  onClick={() => handleKhataSelect('')}
                  className={`${isMobile ? 'w-8 h-8' : 'w-9 h-9'} rounded-xl bg-white/85 hover:bg-rose-50 border border-slate-200/80 text-slate-400 hover:text-rose-600 flex items-center justify-center shrink-0 transition cursor-pointer`}
                  title="Clear selected customer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          <div className={`grid gap-1.5 ${isMobile ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
            <input
              type="text"
              value={custName}
              onChange={e => setCustName(e.target.value)}
              placeholder={saleMode === 'wholesale' ? 'Retailer Name *' : 'Customer Name'}
              className={`compact-mobile-input border rounded-xl px-2.5 py-1 text-xs font-medium focus:outline-none focus:bg-white transition ${isMobile ? 'min-h-[32px]' : 'min-h-[36px]'} ${
                saleMode === 'wholesale'
                  ? 'bg-purple-50/75 border-purple-200/80 focus:border-purple-600'
                  : 'bg-white/90 border-slate-200/80 focus:border-blue-600'
              }`}
            />
            <input
              type="text"
              value={custPhone}
              onChange={e => setCustPhone(e.target.value)}
              placeholder="Phone Number"
              className={`compact-mobile-input border rounded-xl px-2.5 py-1 text-xs font-medium focus:outline-none focus:bg-white transition ${isMobile ? 'min-h-[32px]' : 'min-h-[36px]'} ${
                saleMode === 'wholesale'
                  ? 'bg-purple-50/75 border-purple-200/80 focus:border-purple-600'
                  : 'bg-white/90 border-slate-200/80 focus:border-blue-600'
              }`}
            />
          </div>

          {/* Previous Khata Balance Notification */}
          {previousKhataBalance > 0 && matchedKhataCustomer && (
            <div className="bg-amber-50/90 border border-amber-200/90 rounded-xl px-2.5 py-1.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10.5px] font-bold text-amber-800 leading-tight truncate">
                  Previous Balance · {matchedKhataCustomer.name}
                </p>
              </div>
              <span className="tabular-nums font-black text-xs text-rose-700 shrink-0">
                {currency} {previousKhataBalance.toLocaleString()}
              </span>
            </div>
          )}

          {/* Wholesale Retailer Shop Details */}
          {saleMode === 'wholesale' && (
            <div className="bg-purple-50/80 border border-purple-200/80 rounded-xl p-1.5 space-y-1">
              <span className="text-[9.5px] font-black uppercase text-purple-900 tracking-wider flex items-center gap-1">
                <Package className="w-3 h-3 text-purple-700" /> Retailer / Shop Details
              </span>
              <div className={`grid gap-1 ${isMobile ? 'grid-cols-3' : 'grid-cols-1 sm:grid-cols-3'}`}>
                <input
                  type="text"
                  value={retailerShopName}
                  onChange={e => setRetailerShopName(e.target.value)}
                  placeholder="Shop Name"
                  className="compact-mobile-input bg-white/90 border border-purple-200 rounded-lg px-2 py-1 text-xs font-semibold text-purple-950 focus:outline-none focus:border-purple-600 min-h-[30px]"
                />
                <input
                  type="text"
                  value={retailerCity}
                  onChange={e => setRetailerCity(e.target.value)}
                  placeholder="City"
                  className="compact-mobile-input bg-white/90 border border-purple-200 rounded-lg px-2 py-1 text-xs font-semibold text-purple-950 focus:outline-none focus:border-purple-600 min-h-[30px]"
                />
                <input
                  type="text"
                  value={retailerNtn}
                  onChange={e => setRetailerNtn(e.target.value)}
                  placeholder="NTN (Opt)"
                  className="compact-mobile-input bg-white/90 border border-purple-200 rounded-lg px-2 py-1 text-xs tabular-nums font-semibold text-purple-950 focus:outline-none focus:border-purple-600 min-h-[30px]"
                />
              </div>
            </div>
          )}
        </div>

        {/* Itemized Cart Cards */}
        <div className="space-y-1.5">
          {cart.length === 0 ? (
            <div className="bg-white/75 border border-slate-200/75 rounded-xl py-4 px-3 text-center text-slate-400">
              <ShoppingCart className="w-5 h-5 mx-auto text-slate-300 mb-1" />
              <p className="text-xs font-semibold text-slate-500">
                Cart is empty — Scan IMEI or tap Add
              </p>
            </div>
          ) : (
            cart.map(item => {
              const availableItemImeis = extractItemImeis(item);
              const hasMultipleImeis = availableItemImeis.length > 0;
              const unitPrice = getItemUnitPrice(item);

              return (
                <div
                  key={`${item.id}::${item.selectedVariantId || 'default'}`}
                  className={`bg-white/92 border border-slate-200/80 shadow-2xs rounded-xl transition hover:bg-white ${
                    isMobile ? 'p-2 space-y-1.5' : 'p-2.5 space-y-2'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-900 text-xs sm:text-[13px] leading-snug line-clamp-1">
                        {item.name}
                      </p>
                      <p className="text-[10.5px] text-slate-500 font-medium mt-0.5 truncate">
                        {item.selectedVariantLabel ? `${item.selectedVariantLabel} · ` : ''}
                        {currency} {unitPrice.toLocaleString()} each
                        {saleMode === 'wholesale' ? ' (W/S)' : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.id, item.selectedVariantId)}
                      className="w-6 h-6 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition cursor-pointer shrink-0"
                      aria-label={`Remove ${item.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {saleMode === 'wholesale' && (
                    <div className="flex items-center justify-between gap-2 bg-purple-50/85 border border-purple-200/80 rounded-lg px-2 py-1">
                      <span className="text-[10px] font-extrabold text-purple-800 uppercase tracking-wide shrink-0">
                        W/S Rate ({currency})
                      </span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          value={item.customWholesalePrice !== undefined ? item.customWholesalePrice : unitPrice}
                          onChange={e =>
                            updateCartItemWholesalePrice(
                              item.id,
                              item.selectedVariantId,
                              e.target.value
                            )
                          }
                          className="compact-mobile-input w-24 text-right bg-white border border-purple-300 rounded-md px-2 py-0.5 tabular-nums font-extrabold text-xs text-purple-900 focus:outline-none focus:border-purple-600"
                        />
                        {item.customWholesalePrice !== undefined && (
                          <button
                            type="button"
                            onClick={() => resetCartItemWholesalePrice(item.id, item.selectedVariantId)}
                            className="p-1 rounded-md text-purple-600 hover:bg-purple-100 cursor-pointer"
                            title="Reset to default wholesale rate"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* IMEI Selector / Barcode */}
                  {hasMultipleImeis ? (
                    <div className="space-y-1">
                      {Array.from({ length: item.cartQty }).map((_, unitIdx) => {
                        const curVal =
                          item.selectedImeis?.[unitIdx] || availableItemImeis[unitIdx] || '';
                        return (
                          <div key={unitIdx} className="flex items-center gap-1.5">
                            <span className="text-[10px] tabular-nums text-slate-400 font-bold shrink-0">
                              #{unitIdx + 1}
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
                                className="flex-1 min-w-0 text-[10.5px] tabular-nums text-blue-700 bg-blue-50/80 border border-blue-200/80 rounded-lg px-2 py-1 outline-none"
                              >
                                {availableItemImeis.map(im => (
                                  <option key={im} value={im}>
                                    IMEI: {im}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-[10.5px] tabular-nums text-blue-700 font-semibold truncate">
                                IMEI: {curVal}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : item.barcode ? (
                    <p className="text-[10px] tabular-nums text-slate-400">
                      Code: {item.barcode}
                    </p>
                  ) : null}

                  {/* Stepper & Line Total */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100/90">
                    <div className="inline-flex items-center gap-1 bg-slate-100 rounded-xl p-0.5">
                      <button
                        type="button"
                        onClick={() => updateCartQty(item.id, -1, item.selectedVariantId)}
                        className="w-6.5 h-6.5 bg-white rounded-lg font-bold text-slate-700 hover:bg-slate-50 flex items-center justify-center transition cursor-pointer shadow-2xs"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="tabular-nums font-extrabold text-xs px-2 min-w-[22px] text-center text-slate-900">
                        {item.cartQty}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateCartQty(item.id, 1, item.selectedVariantId)}
                        className="w-6.5 h-6.5 bg-white rounded-lg font-bold text-slate-700 hover:bg-slate-50 flex items-center justify-center transition cursor-pointer shadow-2xs"
                        aria-label="Increase quantity"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <span className="tabular-nums font-black text-sm text-slate-900">
                      {currency} {(unitPrice * item.cartQty).toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pricing Totals & Previous Balance Breakdown */}
        <div className={`bg-white/80 border border-slate-200/75 rounded-xl space-y-1 text-xs ${isMobile ? 'p-2' : 'p-2.5 sm:p-3 space-y-1.5'}`}>
          <div className="space-y-1 text-slate-600">
            <div className="flex justify-between items-center text-[11px] font-bold text-slate-700">
              <span>
                Total Quantity ({cart.length} {cart.length === 1 ? 'item' : 'items'}):
              </span>
              <span className="tabular-nums font-extrabold text-slate-900">
                {totalCartItems} {totalCartItems === 1 ? 'pc' : 'pcs'}
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
                className="compact-mobile-input w-24 text-right bg-white border border-slate-200/80 rounded-lg px-2 py-0.5 tabular-nums font-bold text-xs focus:outline-none focus:border-blue-600"
              />
            </div>

            {previousKhataBalance > 0 ? (
              <div className="space-y-1 pt-1 border-t border-slate-200/70">
                <div className="flex justify-between items-center font-bold text-slate-800">
                  <span>Current Bill:</span>
                  <span className="tabular-nums font-extrabold text-slate-900">
                    {currency} {grandTotal.toLocaleString()}
                  </span>
                </div>

                <div className="flex justify-between items-center bg-amber-50/90 border border-amber-200/80 rounded-xl px-2 py-1 text-amber-900 font-bold">
                  <span className="text-[11px]">+ Previous Balance:</span>
                  <span className="tabular-nums font-black text-rose-700">
                    {currency} {previousKhataBalance.toLocaleString()}
                  </span>
                </div>

                <div className="flex justify-between items-center bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white rounded-xl px-2.5 py-1.5 shadow-sm">
                  <span className="text-[11px] font-extrabold">Total Payable (Bill + Prev):</span>
                  <span className="tabular-nums text-sm font-black text-cyan-300">
                    {currency} {totalOutstanding.toLocaleString()}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex justify-between items-center text-sm font-extrabold text-slate-900 pt-1 border-t border-slate-200/70">
                <span>Grand Total:</span>
                <span
                  className={`tabular-nums text-base ${
                    saleMode === 'wholesale' ? 'text-purple-700' : 'text-blue-600'
                  }`}
                >
                  {currency} {grandTotal.toLocaleString()}
                </span>
              </div>
            )}

            {/* Credit Paid / Balance OR Cash + Prev Balance Summary */}
            {invoiceType === 'credit' ? (
              <div className="bg-purple-50/85 p-2 rounded-xl border border-purple-200/80 space-y-1">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-purple-900 text-[11px]">
                    Advance / Paid Now ({currency}):
                  </span>
                  <input
                    type="number"
                    min="0"
                    max={grandTotal}
                    value={amountPaid}
                    onChange={e =>
                      setAmountPaid(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    placeholder="0"
                    className="compact-mobile-input w-24 text-right bg-white border border-purple-300/80 rounded-lg px-2 py-0.5 tabular-nums font-bold text-xs focus:outline-none focus:border-purple-600"
                  />
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-purple-200/80 text-purple-900 text-[11px]">
                  <span className="font-extrabold">
                    {previousKhataBalance > 0
                      ? 'Net Balance Due (Incl. Prev):'
                      : 'Remaining Due (Khata):'}
                  </span>
                  <span className="tabular-nums font-black text-sm text-rose-600">
                    {currency} {netBalanceAfterPaid.toLocaleString()}
                  </span>
                </div>
              </div>
            ) : (
              previousKhataBalance > 0 && (
                <div className="bg-slate-100/85 px-2.5 py-1 rounded-xl border border-slate-200/70 flex justify-between items-center text-[11px]">
                  <span className="font-bold text-slate-700">
                    Paid Now (Cash) · Prev Khata Left:
                  </span>
                  <span className="tabular-nums font-black text-rose-600">
                    {currency} {netBalanceAfterPaid.toLocaleString()}
                  </span>
                </div>
              )
            )}
          </div>

          {/* Per-Bill Note Field */}
          <div className="pt-1 border-t border-slate-200/70">
            <input
              type="text"
              dir="auto"
              value={billNote}
              onChange={e => setBillNote(e.target.value)}
              placeholder="Bill note (Urdu / English, optional)..."
              className={`compact-mobile-input w-full bg-white/90 border border-slate-200/80 rounded-xl px-2.5 py-1 text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white transition ${isMobile ? 'min-h-[32px]' : 'min-h-[36px]'}`}
            />
          </div>
        </div>
      </div>

      {/* Checkout Action Button */}
      <div className={`${isMobile ? 'pt-1.5' : 'pt-2'} border-t border-slate-200/70 shrink-0`}>
        <button
          type="button"
          onClick={() => {
            handleCheckout();
            if (isMobile) setIsMobileCartOpen(false);
          }}
          disabled={cart.length === 0}
          className={`w-full ${isMobile ? 'py-2.5 min-h-[40px] text-xs' : 'py-3 min-h-[46px] text-sm'} text-white font-extrabold rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer ${
            cart.length > 0
              ? draft.editingOriginalInvNo
                ? 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-amber-500/25'
                : invoiceType === 'credit'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 shadow-purple-500/25'
                : 'bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 shadow-blue-500/25'
              : 'bg-slate-300/80 text-slate-500 cursor-not-allowed shadow-none'
          }`}
        >
          <Printer className="w-4 h-4" />
          <span>
            {draft.editingOriginalInvNo
              ? `Update Invoice #${draft.editingOriginalInvNo} & Print`
              : invoiceType === 'credit'
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

    const effectivePaymentMethod: PaymentMethod = 'Cash';

    // Preserve original invoice date & invoice number when editing an active invoice
    const parsedOriginalDate = draft.editingOriginalDate ? new Date(draft.editingOriginalDate) : null;
    const hasValidOriginalDate = Boolean(parsedOriginalDate && !isNaN(parsedOriginalDate.getTime()));
    const effectiveSaleDate = hasValidOriginalDate ? draft.editingOriginalDate! : new Date().toISOString();
    const effectiveDateForInvNo = hasValidOriginalDate ? parsedOriginalDate! : new Date();

    const isReplacingExistingSale = Boolean(draft.editingOriginalInvNo && editingOriginalSale);
    const invNo = isReplacingExistingSale
      ? draft.editingOriginalInvNo!
      : generateNextInvoiceNumber(sales, effectiveDateForInvNo);

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
      khataCustomerId: selectedKhataId || matchedKhataCustomer?.id || undefined,
      previousBalance: previousKhataBalance > 0 ? previousKhataBalance : undefined,
      totalOutstanding: previousKhataBalance > 0 ? totalOutstanding : undefined,
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
      accountId: undefined,
      notes: billNote.trim() || undefined,
      date: effectiveSaleDate,
    };

    if (isReplacingExistingSale && onCompleteEditedSale) {
      onCompleteEditedSale(draft.editingOriginalInvNo!, saleRecord);
    } else {
      onCompleteSale(saleRecord);
    }
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
    <>
      <div className="relative rounded-2xl sm:rounded-3xl p-1 sm:p-2 bg-gradient-to-br from-sky-100/75 via-slate-50/90 to-indigo-100/75 border border-white/80 flex flex-col lg:flex-1 lg:min-h-0 overflow-hidden">
        <div className="relative space-y-2.5 sm:space-y-3 flex flex-col lg:flex-1 lg:min-h-0">
        {/* Smart Frosted App Header */}
        <div
          className={`backdrop-blur-xl text-white rounded-2xl px-3 sm:px-4 pt-2.5 pb-1 shadow-lg border border-white/25 shrink-0 transition-colors ${
            saleMode === 'wholesale'
              ? 'bg-gradient-to-r from-purple-700/90 via-indigo-700/90 to-violet-700/90 shadow-purple-900/15'
              : 'bg-gradient-to-r from-sky-600/90 via-blue-600/90 to-indigo-600/90 shadow-blue-900/15'
          }`}
        >
          {/* Row 1: Back, Title, Retail/Wholesale Pill & Quick Utilities */}
          <div className="flex items-center justify-between gap-2 pb-2">
            <div className="flex items-center gap-2 min-w-0">
              {onBackToHome && (
                <button
                  type="button"
                  onClick={onBackToHome}
                  className="lg:hidden w-8 h-8 -ml-1 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition cursor-pointer shrink-0"
                  aria-label="Back to home"
                >
                  <ArrowLeft className="w-4.5 h-4.5" />
                </button>
              )}
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-extrabold tracking-tight truncate leading-tight">
                  POS &amp; Billing
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Compact Retail / Wholesale Mode Switcher */}
              <div className="flex items-center p-0.5 rounded-xl bg-white/15 backdrop-blur-md border border-white/20 shrink-0">
                <button
                  type="button"
                  onClick={() => setSaleMode('retail')}
                  className={`px-2 sm:px-2.5 py-1 rounded-lg text-[10.5px] sm:text-xs font-extrabold transition cursor-pointer whitespace-nowrap ${
                    saleMode === 'retail'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-white/80 hover:text-white'
                  }`}
                >
                  Retail
                </button>
                <button
                  type="button"
                  onClick={() => setSaleMode('wholesale')}
                  className={`px-2 sm:px-2.5 py-1 rounded-lg text-[10.5px] sm:text-xs font-extrabold transition cursor-pointer whitespace-nowrap ${
                    saleMode === 'wholesale'
                      ? 'bg-amber-300 text-slate-900 shadow-xs'
                      : 'text-white/80 hover:text-white'
                  }`}
                >
                  W/S
                </button>
              </div>

              {onOpenSalesReturn && (
                <button
                  type="button"
                  onClick={() => onOpenSalesReturn(null)}
                  className="px-2 sm:px-2.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/20 text-white text-[10.5px] sm:text-xs font-bold transition cursor-pointer inline-flex items-center gap-1 whitespace-nowrap"
                  title="Process Customer Sales Return & Refund"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Return</span>
                </button>
              )}

              {onOpenPosSettings && (
                <button
                  type="button"
                  onClick={onOpenPosSettings}
                  className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/20 text-white flex items-center justify-center transition cursor-pointer shrink-0"
                  title="POS & Billing Settings"
                  aria-label="POS Settings"
                >
                  <Sliders className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Row 2: Clean Sub-Tab Navigation + Sales PDF */}
          <div className="flex items-center justify-between gap-2 border-t border-white/15 pt-1">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setPosSubTab('billing')}
                className={`relative pb-2 pt-1 text-xs sm:text-[13px] font-extrabold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  posSubTab === 'billing' ? 'text-white' : 'text-white/70 hover:text-white'
                }`}
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>New Sale</span>
                {posSubTab === 'billing' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-cyan-300" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setPosSubTab('history')}
                className={`relative pb-2 pt-1 text-xs sm:text-[13px] font-extrabold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  posSubTab === 'history' ? 'text-white' : 'text-white/70 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>History ({(sales || []).length})</span>
                {posSubTab === 'history' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-cyan-300" />
                )}
              </button>
            </div>

            {onOpenPdfReport && (
              <button
                type="button"
                onClick={onOpenPdfReport}
                className="mb-1 px-2.5 py-1 rounded-lg bg-slate-950/35 hover:bg-slate-950/50 border border-white/15 text-white text-[10.5px] font-bold transition cursor-pointer inline-flex items-center gap-1 whitespace-nowrap"
                title="Export Sales & Invoices PDF Report"
              >
                <FileText className="w-3 h-3 text-cyan-300" />
                <span>Sales PDF</span>
              </button>
            )}
          </div>
        </div>

        {posSubTab === 'billing' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 items-start lg:flex-1 lg:min-h-0">
            {/* Left Column: Frosted Catalog & Search (7 Cols) */}
            <div className="lg:col-span-7 flex flex-col lg:min-h-0 lg:sticky lg:top-0 lg:max-h-[calc(100dvh-9rem)] space-y-2.5 sm:space-y-3">
              {/* Frosted Search & Category Filter Dock */}
              <div className="bg-white/75 backdrop-blur-xl border border-white/90 rounded-2xl p-2.5 sm:p-3 space-y-2 shadow-sm shrink-0">
                {duplicateScanAlert && (
                  <div className="bg-rose-50/90 backdrop-blur-md border border-rose-300 text-rose-900 rounded-xl px-3 py-2 flex items-start justify-between gap-2 shadow-xs animate-in fade-in">
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
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
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
                    className="compact-mobile-input w-full pl-9 pr-20 sm:pr-24 py-1.5 bg-white/80 backdrop-blur-sm border border-slate-200/80 rounded-xl text-xs font-medium focus:outline-none focus:border-blue-600 focus:bg-white transition h-9.5 sm:h-10"
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
                      onClick={() => {
                        setCameraScannerTarget('productSearch');
                        setIsCameraScannerOpen(true);
                      }}
                      className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs flex items-center gap-1 text-[11px] font-extrabold cursor-pointer transition h-7 sm:h-8"
                      title="Live Camera Barcode & IMEI Scanner"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>Scan</span>
                    </button>
                  </div>
                </div>

                {/* Category Chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 touch-pan-x max-w-full">
                  {['ALL', ...categories].map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-2.5 py-1 rounded-xl font-bold text-[11px] sm:text-xs whitespace-nowrap transition shrink-0 cursor-pointer h-7.5 inline-flex items-center ${
                        selectedCategory === cat
                          ? saleMode === 'wholesale'
                            ? 'bg-purple-600 text-white shadow-sm'
                            : 'bg-blue-600 text-white shadow-sm'
                          : 'bg-white/70 border border-slate-200/70 text-slate-700 hover:bg-white'
                      }`}
                    >
                      {cat === 'ALL' ? 'All' : cat}
                    </button>
                  ))}
                  {categories.length > 5 && (
                    <select
                      value={selectedCategory}
                      onChange={e => setSelectedCategory(e.target.value)}
                      className="compact-mobile-input px-2 py-1 rounded-xl bg-white/80 text-slate-700 text-[11px] sm:text-xs font-bold border border-slate-200/80 shrink-0 cursor-pointer outline-none h-7.5"
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
              </div>

              {/* Frosted Glass Product Cards Grid (Clean 2-Col Mobile -> 3/4-Col Desktop) */}
              <div ref={productGridRef} className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto pr-0.5 sm:pr-1 space-y-2.5">
                {lastScannedItem && (() => {
                  const scannedObj = activeInventory.find(i => i.id === lastScannedItem.itemId);
                  if (!scannedObj) return null;
                  return (
                    <div className="bg-emerald-50/85 backdrop-blur-md border border-emerald-300/80 rounded-2xl px-3 py-2 flex items-center justify-between gap-2 shadow-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                        <div className="min-w-0 text-xs">
                          <span className="font-extrabold text-emerald-900 truncate block">
                            Scanned: {scannedObj.name}
                            {lastScannedItem.variantLabel ? ` (${lastScannedItem.variantLabel})` : ''}
                          </span>
                          {lastScannedItem.imei && (
                            <span className="text-[10px] font-bold text-emerald-700 tabular-nums block truncate">
                              IMEI: {lastScannedItem.imei} · Pinned at #1 &amp; added to cart
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setSelectedProductDetails(scannedObj)}
                          className="px-2 py-1 rounded-lg bg-white/90 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold cursor-pointer transition"
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
                  <div className="text-center py-12 bg-white/75 backdrop-blur-xl rounded-2xl border border-white/90 text-xs text-slate-400 space-y-2 shadow-sm">
                    <Package className="w-8 h-8 mx-auto text-slate-300" />
                    <p className="font-semibold text-slate-600">No matching products found</p>
                    <button
                      type="button"
                      onClick={onOpenAddStock}
                      className="mt-1.5 inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition cursor-pointer shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Product
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3 pb-28 lg:pb-4">
                    {filteredItems.map(item => {
                      const inCartQtyForItem = cart
                        .filter(c => c.id === item.id)
                        .reduce((sum, c) => sum + c.cartQty, 0);
                      const remainingStock = getEffectiveProductQty(item) - inCartQtyForItem;
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
                          className={`bg-white/92 hover:bg-white border rounded-2xl p-2 sm:p-2.5 shadow-sm hover:shadow-md transition-colors duration-150 cursor-pointer flex flex-col justify-between group relative min-w-0 ${
                            isLastScanned
                              ? 'border-emerald-500 ring-2 ring-emerald-400/60'
                              : remainingStock <= 0
                              ? 'opacity-60 border-white/80'
                              : 'border-white/95 hover:border-blue-400'
                          }`}
                        >
                          <div className="min-w-0">
                            {/* Clean Image Stage (GPU-friendly without per-card blur) */}
                            <div className="relative w-full h-24 sm:h-28 rounded-xl overflow-hidden bg-slate-100/80 border border-white/90 flex items-center justify-center p-1.5">
                              {item.image ? (
                                <img
                                  src={item.image}
                                  alt={item.name}
                                  className="w-full h-full object-contain"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-blue-500/15 text-blue-600 flex items-center justify-center font-black text-base sm:text-lg">
                                  {item.name.charAt(0).toUpperCase()}
                                </div>
                              )}

                              {inCartQtyForItem > 0 && (
                                <span className="absolute top-1.5 left-1.5 text-[9px] font-black px-1.5 py-0.5 rounded-md bg-blue-600 text-white shadow-xs tabular-nums">
                                  {inCartQtyForItem} in cart
                                </span>
                              )}

                              <span
                                className={`absolute top-1.5 right-1.5 text-[9.5px] font-extrabold px-1.5 py-0.5 rounded-md tabular-nums ${
                                  remainingStock > 2
                                    ? 'bg-emerald-600 text-white'
                                    : remainingStock > 0
                                    ? 'bg-amber-500 text-white'
                                    : 'bg-rose-600 text-white'
                                }`}
                              >
                                {remainingStock > 0 ? `${remainingStock} left` : 'Out'}
                              </span>
                            </div>

                            {/* Title & Quiet Unboxed Metadata */}
                            <h4 className="font-extrabold text-slate-900 text-xs sm:text-[13px] line-clamp-2 mt-2 leading-snug group-hover:text-blue-600 transition">
                              {item.name}
                            </h4>
                            <p className="text-[10.5px] text-slate-500 font-medium truncate mt-0.5">
                              {itemSpecs.length > 0 ? itemSpecs[0] : item.category}
                              {item.variants && item.variants.length > 1 ? ` · ${item.variants.length}v` : ''}
                            </p>
                          </div>

                          {/* Price & Add CTA */}
                          <div className="mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-between gap-1.5 min-w-0">
                            <span
                              className={`tabular-nums font-black text-xs sm:text-[13px] truncate ${
                                saleMode === 'wholesale' ? 'text-purple-700' : 'text-blue-700'
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

                            <div onClick={e => e.stopPropagation()} className="shrink-0">
                              <button
                                type="button"
                                onClick={() => addToCart(item)}
                                disabled={remainingStock <= 0}
                                className={`px-2.5 py-1.5 font-extrabold rounded-xl text-[11px] inline-flex items-center justify-center gap-1 transition cursor-pointer min-h-[34px] shrink-0 shadow-xs ${
                                  remainingStock <= 0
                                    ? 'bg-slate-200/80 text-slate-400 cursor-not-allowed'
                                    : saleMode === 'wholesale'
                                    ? 'bg-purple-600 hover:bg-purple-700 text-white active:scale-95'
                                    : 'bg-blue-600 hover:bg-blue-700 text-white active:scale-95'
                                }`}
                                title="Add directly to bill"
                              >
                                <Plus className="w-3.5 h-3.5" />
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

            {/* Right Column: Frosted Desktop Checkout Cart (5 Cols) */}
            <div className="hidden lg:flex lg:flex-col lg:col-span-5">
              {renderCartContent(false)}
            </div>
          </div>
        ) : (
          /* ================= FROSTED HISTORY SUB-TAB VIEW ================= */
          <div className="space-y-3 sm:space-y-4 lg:flex-1 lg:min-h-0 lg:overflow-y-auto pr-0.5 pb-20 lg:pb-6">
            {/* Filters & Actions Control Bar */}
            <div className="bg-white/75 backdrop-blur-xl border border-white/90 rounded-2xl p-2.5 sm:p-4 shadow-sm space-y-2.5 sm:space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 sm:gap-4">
                <div className="md:col-span-6 relative flex items-center">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={historySearch}
                    onChange={e => setHistorySearch(e.target.value)}
                    placeholder="Scan invoice, IMEI, customer name..."
                    className="compact-mobile-input w-full pl-9 pr-20 sm:pr-24 py-1.5 bg-white/80 border border-slate-200/80 rounded-xl text-xs font-medium focus:outline-none focus:border-blue-600 focus:bg-white transition h-9.5 sm:h-10"
                  />
                  <div className="absolute right-1.5 flex items-center gap-1">
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
                      className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs flex items-center gap-1 text-[11px] font-extrabold cursor-pointer transition h-7 sm:h-8"
                      title="Live Camera Barcode Scanner"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>Scan</span>
                    </button>
                  </div>
                </div>

                <div className="md:col-span-6 flex items-center gap-1 overflow-x-auto no-scrollbar justify-start md:justify-end">
                  {(['today', 'weekly', 'monthly', 'yearly', 'custom'] as const).map(range => (
                    <button
                      key={range}
                      type="button"
                      onClick={() => setHistoryRange(range)}
                      className={`px-2.5 py-1 rounded-xl text-[10.5px] sm:text-xs font-extrabold uppercase tracking-wider transition cursor-pointer shrink-0 h-7.5 sm:h-8 inline-flex items-center ${
                        historyRange === range
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-white/75 border border-slate-200/70 text-slate-600 hover:text-slate-900 hover:bg-white'
                      }`}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>

              {historyRange === 'custom' && (
                <div className="flex flex-wrap items-center gap-2 sm:gap-4 bg-white/60 p-2.5 sm:p-3 rounded-xl border border-slate-200/70 text-xs">
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

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/70">
                <p className="text-[11px] sm:text-xs text-slate-500 font-medium">
                  Showing <strong className="text-slate-800">{filteredSales.length}</strong> invoices
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handlePrintHistoryReport}
                    className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1 bg-white/80 hover:bg-white text-slate-700 border border-slate-200/80 rounded-xl text-[11px] sm:text-xs font-bold transition cursor-pointer h-8"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Report</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleShareHistoryReport}
                    className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1 bg-emerald-50/90 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-[11px] sm:text-xs font-bold transition cursor-pointer h-8"
                  >
                    <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>WhatsApp</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Frosted Metrics Summary */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
              <div className="bg-white/75 backdrop-blur-xl border border-white/90 rounded-2xl p-2.5 sm:p-3.5 shadow-sm flex flex-col justify-between">
                <p className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider line-clamp-1">Net Sales Volume</p>
                <p className="text-sm sm:text-lg font-black tabular-nums text-blue-600 mt-0.5 truncate">
                  {currency} {stats.netRevenue.toLocaleString()}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5 font-semibold truncate">{stats.totalInvoices} active bills</p>
              </div>

              <div className="bg-white/75 backdrop-blur-xl border border-white/90 rounded-2xl p-2.5 sm:p-3.5 shadow-sm flex flex-col justify-between">
                <p className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider line-clamp-1">Credit Receivables</p>
                <p className="text-sm sm:text-lg font-black tabular-nums text-purple-600 mt-0.5 truncate">
                  {currency} {stats.totalCredit.toLocaleString()}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5 font-semibold truncate">balance due</p>
              </div>

              <div className="bg-white/75 backdrop-blur-xl border border-white/90 rounded-2xl p-2.5 sm:p-3.5 shadow-sm flex flex-col justify-between">
                <p className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider line-clamp-1">Cancelled Bills</p>
                <p className="text-sm sm:text-lg font-black tabular-nums text-rose-600 mt-0.5 truncate">
                  {stats.cancelledCount} Bills
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5 font-semibold truncate">Void: {currency} {stats.cancelledSum.toLocaleString()}</p>
              </div>

              <div className="bg-white/75 backdrop-blur-xl border border-white/90 rounded-2xl p-2.5 sm:p-3.5 shadow-sm flex flex-col justify-between">
                <p className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider line-clamp-1">Total Invoices</p>
                <p className="text-sm sm:text-lg font-black tabular-nums text-slate-900 mt-0.5 truncate">
                  {filteredSales.length} Bills
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5 font-semibold truncate">all records</p>
              </div>
            </div>

            {/* Historical Invoices List */}
            <div className="space-y-2.5">
              {filteredSales.length === 0 ? (
                <div className="text-center py-12 bg-white/75 backdrop-blur-xl rounded-2xl border border-white/90 text-xs text-slate-400 space-y-2 shadow-sm">
                  <FileText className="w-10 h-10 mx-auto text-slate-300" />
                  <p className="font-bold text-slate-600">No matching sales records found</p>
                  <p className="text-slate-400 max-w-xs mx-auto">Try typing another query or selecting a different date range filter above.</p>
                </div>
              ) : (
                filteredSales.map(sale => {
                  const isCancelled = sale.status === 'CANCELLED';
                  const salePrevBal = Math.max(0, sale.previousBalance || 0);
                  const saleCombined = sale.grandTotal + salePrevBal;
                  return (
                    <div
                      key={sale.invNo}
                      className={`bg-white/92 hover:bg-white border rounded-2xl p-3 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-4 transition-colors shadow-sm ${
                        isCancelled
                          ? 'border-red-200/80 bg-red-50/40'
                          : sale.invoiceType === 'credit'
                            ? 'border-purple-200/70 hover:border-purple-400'
                            : 'border-white/95 hover:border-blue-400'
                      }`}
                    >
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="font-black text-slate-900 text-xs sm:text-sm tabular-nums tracking-wider">
                            #{sale.invNo}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className={`font-bold text-[11px] ${
                            isCancelled
                              ? 'text-rose-600'
                              : sale.invoiceType === 'credit'
                              ? 'text-purple-700'
                              : 'text-emerald-700'
                          }`}>
                            {isCancelled ? 'Void' : sale.invoiceType === 'credit' ? 'Credit / Khata' : 'Cash'}
                          </span>
                          {sale.returnStatus === 'FULL' && (
                            <span className="text-[11px] font-bold text-amber-700">· Returned</span>
                          )}
                          {sale.returnStatus === 'PARTIAL' && (
                            <span className="text-[11px] font-bold text-amber-700">· Partial Return</span>
                          )}
                          <span className="text-slate-300">·</span>
                          <span className="text-[10.5px] sm:text-[11px] font-medium text-slate-500 tabular-nums">
                            {new Date(sale.date).toLocaleDateString()} {new Date(sale.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] sm:text-xs">
                          <p className="font-extrabold text-blue-700">{sale.custName}</p>
                          {sale.custPhone && (
                            <p className="text-slate-500 tabular-nums">{sale.custPhone}</p>
                          )}
                        </div>

                        <div className="bg-slate-50/70 border border-slate-200/60 p-2 sm:p-2.5 rounded-xl space-y-1 max-w-2xl">
                          <div className="divide-y divide-slate-200/60">
                            {sale.items.map((it, idx) => (
                              <div key={idx} className="py-0.5 text-[11px] sm:text-xs flex flex-wrap items-center justify-between gap-1.5">
                                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                  <span className="font-bold text-slate-800 truncate">{it.name}</span>
                                  <span className="font-semibold text-slate-400 text-[10px]">x{it.qty}</span>
                                  {(it.returnedQty || 0) > 0 && (
                                    <span className="text-[10px] font-bold text-amber-700">
                                      (Returned{it.returnReason ? `: ${it.returnReason}` : ''})
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-1 text-[10px] tabular-nums text-slate-500">
                                  {it.barcode && <span>#{it.barcode}</span>}
                                  {it.imeis && it.imeis.length > 0 ? (
                                    <span className="text-blue-700 font-semibold">{it.imeis.join(', ')}</span>
                                  ) : it.imei ? (
                                    <span className="text-blue-700 font-semibold">{it.imei}</span>
                                  ) : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {sale.notes && (
                          <p
                            dir="auto"
                            className={`text-[11px] px-2.5 py-1 rounded-lg font-medium border ${
                              isCancelled
                                ? 'text-rose-700 bg-rose-50/80 border-rose-200/70'
                                : 'text-slate-800 bg-amber-50/80 border-amber-200/70'
                            }`}
                          >
                            <strong>Note:</strong> {sale.notes}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-row md:flex-col items-center md:items-end justify-between gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-200/70">
                        <div className="text-left md:text-right">
                          <p className="text-[15px] sm:text-lg font-black tabular-nums text-slate-900 leading-none">
                            {currency} {(salePrevBal > 0 ? saleCombined : sale.grandTotal).toLocaleString()}
                          </p>
                          {salePrevBal > 0 && (
                            <p className="mt-0.5 text-[10px] tabular-nums font-bold text-amber-700">
                              Bill {currency} {sale.grandTotal.toLocaleString()} + Prev {currency} {salePrevBal.toLocaleString()}
                            </p>
                          )}
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

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onViewReceipt(sale)}
                            className="h-8 w-8 inline-flex items-center justify-center bg-white/90 hover:bg-slate-100 text-slate-700 border border-slate-200/70 rounded-lg transition cursor-pointer"
                            title="Print Invoice Bill"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleShareWhatsapp(sale)}
                            className="h-8 w-8 inline-flex items-center justify-center bg-emerald-50/90 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/70 rounded-lg transition cursor-pointer"
                            title="Share Invoice on WhatsApp"
                          >
                            <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                          </button>

                          {!isCancelled && (
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(sale)}
                              className="h-8 w-8 inline-flex items-center justify-center bg-blue-50/90 hover:bg-blue-100 text-blue-700 border border-blue-200/70 rounded-lg transition cursor-pointer"
                              title="Edit Invoice (Modify items or details)"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleOpenDeleteModal(sale)}
                            className={`h-8 w-8 inline-flex items-center justify-center rounded-lg border transition cursor-pointer ${
                              isCancelled
                                ? 'bg-rose-100 hover:bg-rose-200 text-rose-800 border-rose-200'
                                : 'bg-rose-50/90 hover:bg-rose-100 text-rose-700 border-rose-200/70'
                            }`}
                            title={isCancelled ? 'Delete Cancelled Invoice Permanently' : 'Delete / Void Invoice'}
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
        </div>
      </div>

      {/* Mobile Floating Frosted Glass Cart Dock (lg:hidden) */}
      {posSubTab === 'billing' && cart.length > 0 && (
        <div className="lg:hidden fixed bottom-[calc(4.3rem+env(safe-area-inset-bottom,0px))] left-3 right-3 sm:left-4 sm:right-4 z-30 animate-in slide-in-from-bottom duration-200">
          <div
            onClick={() => setIsMobileCartOpen(true)}
            className="bg-slate-900/80 backdrop-blur-2xl text-white rounded-2xl p-2.5 sm:p-3 shadow-2xl shadow-slate-950/35 flex items-center justify-between gap-2.5 cursor-pointer border border-white/20 active:scale-[0.99] transition"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`relative w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 border border-white/20 ${
                  saleMode === 'wholesale' ? 'bg-purple-600/90' : 'bg-blue-600/90'
                }`}
              >
                <ShoppingCart className="w-4.5 h-4.5" />
                <span className="absolute -top-1.5 -right-1.5 bg-cyan-400 text-slate-950 text-[9px] font-black min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center shadow-sm tabular-nums">
                  {totalCartItems}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-[10.5px] font-semibold text-slate-300 truncate">
                  {totalCartItems} {totalCartItems === 1 ? 'item' : 'items'}
                  {previousKhataBalance > 0
                    ? ` · Prev: ${currency} ${previousKhataBalance.toLocaleString()}`
                    : matchedKhataCustomer
                    ? ` · ${matchedKhataCustomer.name}`
                    : ''}
                </p>
                <p className="text-sm font-black tabular-nums text-cyan-300 truncate">
                  {currency}{' '}
                  {(previousKhataBalance > 0 ? totalOutstanding : grandTotal).toLocaleString()}
                </p>
              </div>
            </div>

            <button
              type="button"
              className="px-3.5 py-2 bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/25 text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer shrink-0 min-h-[40px]"
            >
              <span>View Cart</span>
              <ChevronUp className="w-4 h-4 text-cyan-300" />
            </button>
          </div>
        </div>
      )}

      {/* Mobile Floating Frosted Cart Bottom Sheet Drawer (lg:hidden, Compact Height) */}
      {isMobileCartOpen && (
        <div className="ios-bottom-sheet-backdrop lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div
            onClick={() => setIsMobileCartOpen(false)}
            className="fixed inset-0 glass-modal-backdrop"
          />

          <div className="ios-bottom-sheet-panel glass-modal-panel relative z-10 rounded-t-3xl max-h-[72dvh] flex flex-col animate-modal-pop overflow-hidden">
            <div className="w-10 h-1 bg-slate-400/50 rounded-full mx-auto mt-2 mb-0.5 shrink-0" />

            <div className="overflow-y-auto flex-1 min-h-0">
              {renderCartContent(true)}
            </div>
          </div>
        </div>
      )}

      {/* INVOICE DELETE / CANCEL MODAL */}
      {deleteModalSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 glass-modal-backdrop">
          <div className="glass-modal-panel animate-modal-pop rounded-2xl max-w-md w-full max-h-[82dvh] overflow-y-auto p-4 sm:p-5 space-y-3.5">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 glass-modal-backdrop">
          <div className="glass-modal-panel animate-modal-pop rounded-2xl max-w-lg w-full p-4 sm:p-5 space-y-3.5 max-h-[82dvh] flex flex-col overflow-hidden">
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
                      <li>Original invoice stays active &amp; editable until you tap Update Invoice.</li>
                      <li>If you cancel editing, your original invoice remains completely safe and untouched.</li>
                      <li>Add/remove products, change wholesale rates, or adjust quantities &amp; reprint cleanly.</li>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 glass-modal-backdrop overflow-y-auto">
          <div className="glass-modal-panel animate-modal-pop rounded-3xl max-w-xl w-full p-4 sm:p-5 space-y-3.5 my-auto overflow-y-auto max-h-[82dvh]">
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
                    const vTotal = getEffectiveVariantQty(selectedProductDetails, v);
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
                  getEffectiveProductQty(selectedProductDetails) <=
                  cart.filter(c => c.id === selectedProductDetails.id).reduce((sum, c) => sum + c.cartQty, 0)
                }
                className={`w-full sm:flex-1 py-2.5 px-4 font-bold text-xs rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-2 min-h-[42px] ${
                  getEffectiveProductQty(selectedProductDetails) <=
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 glass-modal-backdrop overflow-y-auto">
          <div className="glass-modal-panel animate-modal-pop rounded-3xl max-w-md w-full p-4 sm:p-5 space-y-3.5 my-auto max-h-[82dvh] flex flex-col overflow-hidden">
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
                const vTotal = getEffectiveVariantQty(variantPickerItem, v);
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
    </>
  );
};

export const PosTab = React.memo(PosTabComponent);
