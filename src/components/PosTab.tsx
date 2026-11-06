import React, { useState, useMemo } from 'react';
import { InventoryItem, CartItem, PaymentMethod, SaleRecord, InvoiceType, KhataCustomer, OnlineAccount, ShopSettings } from '../types';
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
  Sparkles
} from 'lucide-react';
import { useToast } from './Toast';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { useFormDraft } from '../hooks/useFormDraft';
import { generateNextInvoiceNumber, extractItemImeis } from '../utils/imeiManager';
import { normalizePaymentChannel } from '../utils/accounting';
import { shareInvoiceOnWhatsApp } from '../utils/whatsappInvoice';

interface PosTabProps {
  inventory: InventoryItem[];
  sales?: SaleRecord[];
  currency: string;
  categories: string[];
  khataCustomers?: KhataCustomer[];
  onlineAccounts?: OnlineAccount[];
  settings?: ShopSettings;
  onCompleteSale: (sale: SaleRecord) => void;
  onOpenAddStock: () => void;
  onOpenPdfReport?: () => void;
  onOpenSalesReturn?: (sale?: SaleRecord | null) => void;
  onViewReceipt: (sale: SaleRecord) => void;
  onCancelSale: (invNo: string, reason: string) => void;
  onDeleteSale?: (invNo: string, permanent?: boolean, reason?: string) => void;
  onUpdateSale?: (sale: SaleRecord) => void;
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
  discount: 0,
  paymentMethod: 'Cash',
  accountId: '',
  amountPaid: '',
};

const PosTabComponent: React.FC<PosTabProps> = ({
  inventory,
  sales = [],
  currency,
  categories,
  khataCustomers = [],
  onlineAccounts = [],
  settings,
  onCompleteSale,
  onOpenAddStock,
  onOpenPdfReport,
  onOpenSalesReturn,
  onViewReceipt,
  onCancelSale,
  onDeleteSale,
  onUpdateSale,
  saleToEdit,
  onClearSaleToEdit,
}) => {
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  const [cameraScannerTarget, setCameraScannerTarget] = useState<'productSearch' | 'historySearch'>('productSearch');

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
      const q = historySearch.toLowerCase().trim();
      if (!q) return true;

      const custMatch = (sale.custName || '').toLowerCase().includes(q) || (sale.custPhone || '').includes(q);
      const invMatch = sale.invNo.toLowerCase().includes(q);
      
      const itemMatch = sale.items.some(si => {
        const nameMatch = si.name.toLowerCase().includes(q);
        const itemImeis = si.imeis || (si.imei ? [si.imei] : []);
        const imeiMatch = itemImeis.some(im => im.toLowerCase().includes(q));
        
        const matchedInventoryItem = inventory.find(i => i.name.toLowerCase() === si.name.toLowerCase() || i.id === si.id);
        const barcodeMatch = matchedInventoryItem?.barcode && matchedInventoryItem.barcode.toLowerCase().includes(q);

        return nameMatch || imeiMatch || barcodeMatch;
      });

      return custMatch || invMatch || itemMatch;
    });
  }, [sales, historyRange, historyStartDate, historyEndDate, historySearch, inventory]);

  const handleShareWhatsapp = (sale: SaleRecord) => {
    if (!settings) {
      showToast('Shop settings not found', 'error');
      return;
    }
    try {
      shareInvoiceOnWhatsApp(sale, settings);
      showToast(`Opening WhatsApp for Invoice #${sale.invNo}...`, 'success');
    } catch (err: any) {
      showToast(`Could not open WhatsApp: ${err?.message || 'Error'}`, 'error');
    }
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
    });

    setEditModalSale(null);
    setPosSubTab('billing');
    showToast(`Invoice #${sale.invNo} loaded into cart! You can now edit items, quantities & details.`, 'success');
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
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const totalSalesSum = filteredSales.reduce((acc, s) => acc + (s.status === 'CANCELLED' ? 0 : s.grandTotal), 0);
    const totalTransactions = filteredSales.filter(s => s.status !== 'CANCELLED').length;
    const reportLogo = settings?.invoiceLogo || settings?.shopLogo || settings?.logo;
    const shopName = settings?.shopName || 'Mobile POS Pro';
    const shopAddress = settings?.address || '';
    const shopPhone = settings?.phone || '';

    printWindow.document.write(`
      <html>
        <head>
          <title>Sales Report - ${historyRange.toUpperCase()}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 30px; color: #333; }
            .header-banner { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #e5e7eb; padding-bottom: 12px; }
            .header-banner img { width: 55px; height: 55px; border-radius: 50%; object-fit: contain; margin-bottom: 6px; }
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
          <script>window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
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
  const discount = draft.discount !== undefined ? draft.discount : 0;
  const paymentMethod = draft.paymentMethod || 'Cash';
  const accountId = draft.accountId || '';
  const amountPaid = draft.amountPaid !== undefined ? draft.amountPaid : '';

  // Helper to get active price per unit based on Mode (Retail vs Custom Wholesale Price)
  const getItemUnitPrice = (item: { salePrice: number; wholesalePrice?: number }, mode = saleMode) => {
    if (mode === 'wholesale') {
      return item.wholesalePrice && item.wholesalePrice > 0
        ? item.wholesalePrice
        : item.salePrice;
    }
    return item.salePrice;
  };

  // Matching online accounts for payment method
  const matchingAccounts = useMemo(() => {
    return onlineAccounts.filter(a => normalizePaymentChannel(a.bankType || a.name) === paymentMethod);
  }, [onlineAccounts, paymentMethod]);

  // Auto select if 1 account exists
  React.useEffect(() => {
    if (matchingAccounts.length === 1) {
      if (accountId !== matchingAccounts[0].id) {
        setDraft(prev => ({ ...prev, accountId: matchingAccounts[0].id }));
      }
    } else if (matchingAccounts.length === 0) {
      if (accountId !== '') {
        setDraft(prev => ({ ...prev, accountId: '' }));
      }
    }
  }, [paymentMethod, matchingAccounts, accountId]);

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

  // Filtered inventory: EXCLUDE archived products from active sales POS
  const activeInventory = useMemo(() => {
    return inventory.filter(item => item.status !== 'ARCHIVED');
  }, [inventory]);

  // Filtered inventory by search & category
  const filteredItems = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) {
      return selectedCategory === 'ALL'
        ? activeInventory
        : activeInventory.filter(item => item.category === selectedCategory);
    }

    const tokens = q.split(/\s+/).filter(Boolean);

    return activeInventory.filter(item => {
      const imeiString = extractItemImeis(item).join(' ');

      const combinedText = `${item.name} ${item.category} ${item.barcode || ''} ${imeiString}`.toLowerCase();
      const matchSearch = tokens.every(token => combinedText.includes(token));
      const matchCat = selectedCategory === 'ALL' || item.category === selectedCategory;

      return matchSearch && matchCat;
    });
  }, [activeInventory, search, selectedCategory]);

  const addToCart = (item: InventoryItem, specificImei?: string) => {
    if (item.qty <= 0) {
      showToast('Item is out of stock', 'error');
      return;
    }

    const itemImeis = extractItemImeis(item);

    setCart(prev => {
      const existing = prev.find(c => c.id === item.id);
      if (existing) {
        if (existing.cartQty >= item.qty) {
          showToast(`Only ${item.qty} units available in stock`, 'warning');
          return prev;
        }

        const newQty = existing.cartQty + 1;
        const curSelected = existing.selectedImeis || [];
        const nextSelected = [...curSelected];

        if (specificImei && !nextSelected.includes(specificImei)) {
          nextSelected.push(specificImei);
        } else {
          // Find first available unused IMEI
          const unused = itemImeis.find(im => !nextSelected.includes(im));
          if (unused) nextSelected.push(unused);
        }

        return prev.map(c =>
          c.id === item.id
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
            cartQty: 1,
            selectedImeis: initialSelected,
            imei: initialSelected[0] || item.imei,
          },
        ];
      }
    });
    showToast(`${item.name} added to cart`, 'info');
  };

  const updateCartQty = (id: string, delta: number) => {
    const invItem = activeInventory.find(i => i.id === id);
    if (!invItem) return;
    const itemImeis = extractItemImeis(invItem);

    setCart(prev => {
      return prev
        .map(c => {
          if (c.id === id) {
            const newQty = c.cartQty + delta;
            if (delta > 0 && newQty > invItem.qty) {
              showToast(`Stock limit (${invItem.qty}) reached`, 'warning');
              return c;
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

  const handleSelectImeiForCartItem = (itemId: string, unitIndex: number, chosenImei: string) => {
    setCart(prev =>
      prev.map(c => {
        if (c.id === itemId) {
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

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(c => c.id !== id));
  };

  const clearCart = () => {
    resetDraft();
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

  // Retail Price reference subtotal (what it would cost in Retail)
  const retailSubtotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.salePrice * item.cartQty, 0);
  }, [cart]);

  // Total Wholesale Savings compared to Retail price
  const wholesaleSavings = useMemo(() => {
    if (saleMode !== 'wholesale') return 0;
    return Math.max(0, retailSubtotal - subtotal);
  }, [retailSubtotal, subtotal, saleMode]);

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
    <div className={`bg-white rounded-2xl p-4 sm:p-5 space-y-4 flex flex-col h-full ${isMobile ? '' : 'border border-slate-200/90 shadow-xs'}`}>
      {/* Cart Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-blue-600" /> Active Billing Cart ({totalCartItems})
          </h3>
          {hasActiveDraft && cart.length > 0 && (
            <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">
              Draft Saved
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onOpenPdfReport && (
            <button
              type="button"
              onClick={onOpenPdfReport}
              className="text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 px-2.5 py-1 rounded-lg transition flex items-center gap-1 cursor-pointer shadow-2xs"
              title="Export Sales & Invoices PDF Report"
            >
              <FileText className="w-3.5 h-3.5 text-rose-600" /> Sales PDF
            </button>
          )}
          {cart.length > 0 && (
            <button
              type="button"
              onClick={clearCart}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2 py-1 rounded-lg transition cursor-pointer"
            >
              Clear Cart
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

      {/* TWO INVOICE TYPES: Cash Customer vs Credit/Khata Customer */}
      <div className="space-y-2 bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Invoice Type
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setInvoiceType('cash')}
            className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer min-h-[44px] ${
              invoiceType === 'cash'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Banknote className="w-4 h-4" />
            <span>Cash Customer</span>
          </button>

          <button
            type="button"
            onClick={() => setInvoiceType('credit')}
            className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer min-h-[44px] ${
              invoiceType === 'credit'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Credit / Khata</span>
          </button>
        </div>

        {/* If Credit / Khata is selected, allow picking from existing customers */}
        {invoiceType === 'credit' && khataCustomers.length > 0 && (
          <div className="pt-1.5">
            <select
              value={selectedKhataId}
              onChange={e => handleKhataSelect(e.target.value)}
              className="w-full bg-white border border-purple-200 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-purple-600 min-h-[44px]"
            >
              <option value="">Select Existing Khata Customer...</option>
              {khataCustomers.map(k => (
                <option key={k.id} value={k.id}>
                  {k.name} ({k.phone}) - Current Due: {currency} {k.balance.toLocaleString()}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Customer Info */}
      <div className="space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            type="text"
            value={custName}
            onChange={e => setCustName(e.target.value)}
            placeholder={saleMode === 'wholesale' ? "Retailer / Contact Person Name *" : "Customer Name"}
            className={`border rounded-xl px-3 py-2.5 text-xs font-medium focus:outline-none focus:bg-white transition min-h-[44px] ${
              saleMode === 'wholesale' ? 'bg-purple-50/50 border-purple-200 focus:border-purple-600' : 'bg-slate-50 border-slate-200 focus:border-blue-600'
            }`}
          />
          <input
            type="text"
            value={custPhone}
            onChange={e => setCustPhone(e.target.value)}
            placeholder="Phone Number"
            className={`border rounded-xl px-3 py-2.5 text-xs font-medium focus:outline-none focus:bg-white transition min-h-[44px] ${
              saleMode === 'wholesale' ? 'bg-purple-50/50 border-purple-200 focus:border-purple-600' : 'bg-slate-50 border-slate-200 focus:border-blue-600'
            }`}
          />
        </div>

        {/* Wholesale Retailer Shop Details */}
        {saleMode === 'wholesale' && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-2.5 space-y-2 animate-in fade-in">
            <span className="text-[10px] font-black uppercase text-purple-900 tracking-wider flex items-center gap-1">
              <Package className="w-3.5 h-3.5 text-purple-700" /> Retailer / Shop Details
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                value={retailerShopName}
                onChange={e => setRetailerShopName(e.target.value)}
                placeholder="Shop / Business Name"
                className="bg-white border border-purple-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-purple-950 focus:outline-none focus:border-purple-600 min-h-[38px]"
              />
              <input
                type="text"
                value={retailerCity}
                onChange={e => setRetailerCity(e.target.value)}
                placeholder="City (e.g. Lahore, Karachi)"
                className="bg-white border border-purple-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-purple-950 focus:outline-none focus:border-purple-600 min-h-[38px]"
              />
              <input
                type="text"
                value={retailerNtn}
                onChange={e => setRetailerNtn(e.target.value)}
                placeholder="NTN / GST No (Optional)"
                className="bg-white border border-purple-200 rounded-lg px-2.5 py-1.5 text-xs font-mono font-semibold text-purple-950 focus:outline-none focus:border-purple-600 min-h-[38px]"
              />
            </div>
          </div>
        )}
      </div>

      {/* Cart Itemized Table */}
      <div className="border border-slate-200/80 rounded-xl overflow-hidden flex-1 min-h-[140px]">
        <div className={`overflow-y-auto ${isMobile ? 'max-h-56' : 'max-h-52'}`}>
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 sticky top-0">
              <tr>
                <th className="p-2.5">Item</th>
                <th className="p-2.5 text-center">Qty</th>
                <th className="p-2.5 text-right">Price</th>
                <th className="p-2.5 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {cart.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-slate-400">
                    <ShoppingCart className="w-5 h-5 mx-auto mb-1 text-slate-300" />
                    <p className="text-xs font-medium">Cart is empty</p>
                  </td>
                </tr>
              ) : (
                cart.map(item => {
                  const availableItemImeis = extractItemImeis(item);
                  const hasMultipleImeis = availableItemImeis.length > 0;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/60 transition">
                      <td className="p-2.5">
                        <p className="font-semibold text-slate-900 leading-tight line-clamp-1">
                          {item.name}
                        </p>
                        {hasMultipleImeis ? (
                          <div className="mt-1 space-y-1">
                            {Array.from({ length: item.cartQty }).map((_, unitIdx) => {
                              const curVal = item.selectedImeis?.[unitIdx] || availableItemImeis[unitIdx] || '';
                              return (
                                <div key={unitIdx} className="flex items-center gap-1">
                                  <span className="text-[9px] font-mono text-slate-400 font-bold">
                                    #{unitIdx + 1}:
                                  </span>
                                  {availableItemImeis.length > 1 ? (
                                    <select
                                      value={curVal}
                                      onChange={e =>
                                        handleSelectImeiForCartItem(item.id, unitIdx, e.target.value)
                                      }
                                      className="text-[10px] font-mono text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 max-w-[170px] outline-none"
                                    >
                                      {availableItemImeis.map(im => (
                                        <option key={im} value={im}>
                                          IMEI: {im}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span className="text-[9px] font-mono text-blue-700 bg-blue-50 px-1 py-0.5 rounded border border-blue-100">
                                      IMEI: {curVal}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : item.barcode ? (
                          <p className="text-[9px] font-mono text-slate-400">
                            Code: {item.barcode}
                          </p>
                        ) : null}
                      </td>
                      <td className="p-2.5 text-center">
                        <div className="inline-flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                          <button
                            type="button"
                            onClick={() => updateCartQty(item.id, -1)}
                            className="w-7 h-7 sm:w-5 sm:h-5 bg-white rounded font-bold text-slate-700 hover:bg-slate-200 flex items-center justify-center transition cursor-pointer shadow-2xs"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="font-mono tabular-nums font-bold text-xs px-1.5 min-w-[20px] text-center">
                            {item.cartQty}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateCartQty(item.id, 1)}
                            className="w-7 h-7 sm:w-5 sm:h-5 bg-white rounded font-bold text-slate-700 hover:bg-slate-200 flex items-center justify-center transition cursor-pointer shadow-2xs"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="p-2.5 text-right font-mono tabular-nums font-bold text-slate-900">
                        {currency} {(getItemUnitPrice(item) * item.cartQty).toLocaleString()}
                        {saleMode === 'wholesale' && (
                          <div className="text-[9px] text-purple-700 font-sans">
                            {currency} {getItemUnitPrice(item).toLocaleString()} / unit
                          </div>
                        )}
                      </td>
                      <td className="p-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.id)}
                          className="text-slate-400 hover:text-rose-600 p-1.5 transition cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pricing Totals & Payment Method */}
      <div className="space-y-3 pt-2 border-t border-slate-100 text-xs">
        <div className="space-y-1.5 text-slate-600">
          <div className="flex justify-between">
            <span>Subtotal ({saleMode === 'wholesale' ? 'B2B Wholesale' : 'Retail'}):</span>
            <span className="font-mono tabular-nums font-bold text-slate-800">
              {currency} {subtotal.toLocaleString()}
            </span>
          </div>

          {/* Wholesale B2B Savings Banner */}
          {saleMode === 'wholesale' && wholesaleSavings > 0 && (
            <div className="flex justify-between items-center bg-purple-50 border border-purple-200 text-purple-900 px-2.5 py-1.5 rounded-xl font-extrabold text-[11px]">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-purple-600" /> B2B Wholesale Savings:
              </span>
              <span className="font-mono tabular-nums">
                {currency} {wholesaleSavings.toLocaleString()}
              </span>
            </div>
          )}

          <div className="flex justify-between items-center">
            <span>Discount ({currency}):</span>
            <input
              type="number"
              min="0"
              value={discount}
              onChange={e => setDiscount(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="0"
              className="w-24 text-right bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono tabular-nums font-bold text-xs focus:outline-none focus:border-blue-600 focus:bg-white"
            />
          </div>

          <div className="flex justify-between text-base font-extrabold text-slate-900 pt-1.5 border-t border-slate-100">
            <span>Grand Total:</span>
            <span className={`font-mono tabular-nums text-lg ${saleMode === 'wholesale' ? 'text-purple-700' : 'text-blue-600'}`}>
              {currency} {grandTotal.toLocaleString()}
            </span>
          </div>

          {/* If Credit Sale, show Paid Now vs Due Balance */}
          {invoiceType === 'credit' && (
            <div className="bg-purple-50 p-2.5 rounded-xl border border-purple-200 space-y-1.5 mt-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-purple-900">Advance / Paid Now ({currency}):</span>
                <input
                  type="number"
                  min="0"
                  max={grandTotal}
                  value={amountPaid}
                  onChange={e => setAmountPaid(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0"
                  className="w-28 text-right bg-white border border-purple-300 rounded-lg px-2.5 py-1.5 font-mono tabular-nums font-bold text-xs focus:outline-none focus:border-purple-600"
                />
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-purple-200 text-purple-900">
                <span className="font-extrabold">Remaining Due (Khata Balance):</span>
                <span className="font-mono font-extrabold text-sm tabular-nums text-rose-600">
                  {currency} {actualDue.toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Payment Modes */}
        <div>
          <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1.5">
            Payment Channel
          </label>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
            {(['Cash', 'JazzCash', 'Easypaisa', 'Bank', 'Card'] as PaymentMethod[]).map(pm => (
              <button
                key={pm}
                type="button"
                onClick={() => setPaymentMethod(pm)}
                className={`py-2.5 px-1 rounded-xl text-xs font-bold text-center transition cursor-pointer min-h-[42px] ${
                  paymentMethod === pm
                    ? invoiceType === 'credit' ? 'bg-purple-600 text-white shadow-xs' : 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {pm}
              </button>
            ))}
          </div>
          {matchingAccounts.length > 1 && (
            <div className="mt-2.5">
              <label className="block text-[11px] font-bold text-blue-900 mb-1">
                Select Specific {paymentMethod} Account *
              </label>
              <select
                value={accountId}
                onChange={e => setDraft(prev => ({ ...prev, accountId: e.target.value }))}
                className="w-full px-3 py-2 bg-white border border-blue-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-600 min-h-[44px]"
              >
                <option value="">-- Choose Account --</option>
                {matchingAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} {acc.accountNumber ? `(${acc.accountNumber})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Checkout Action Button */}
        <button
          type="button"
          onClick={() => {
            handleCheckout();
            if (isMobile) setIsMobileCartOpen(false);
          }}
          disabled={cart.length === 0}
          className={`w-full py-3.5 text-white font-extrabold rounded-xl shadow-lg transition text-sm flex items-center justify-center gap-2 cursor-pointer min-h-[48px] ${
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

    if (matchingAccounts.length > 1 && !accountId) {
      showToast(`Please select the specific ${paymentMethod} account.`, 'warning');
      return;
    }

    // Generate persistent sequential invoice number: INV-YYYYMMDD-0001, INV-YYYYMMDD-0002...
    const invNo = generateNextInvoiceNumber(sales);

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
      wholesaleSavings: wholesaleSavings > 0 ? wholesaleSavings : undefined,
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
      paymentMethod,
      accountId: matchingAccounts.length > 0 ? accountId || undefined : undefined,
      date: new Date().toISOString(),
    };

    onCompleteSale(saleRecord);
    resetDraft();
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
    <div className="space-y-6">
      {/* Sub-tab Navigation Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white border border-slate-200/80 rounded-2xl p-2.5 sm:p-3 shadow-xs w-full max-w-full overflow-hidden">
        <div className="grid grid-cols-2 sm:flex bg-slate-100 p-1 rounded-xl w-full sm:w-fit gap-1">
          <button
            type="button"
            onClick={() => setPosSubTab('billing')}
            className={`flex items-center justify-center gap-1.5 px-3 sm:px-5 py-2.5 rounded-lg text-xs font-extrabold transition cursor-pointer min-h-[42px] ${
              posSubTab === 'billing'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShoppingCart className="w-4 h-4 shrink-0" />
            <span className="truncate">New Sale</span>
          </button>
          <button
            type="button"
            onClick={() => setPosSubTab('history')}
            className={`flex items-center justify-center gap-1.5 px-3 sm:px-5 py-2.5 rounded-lg text-xs font-extrabold transition cursor-pointer min-h-[42px] ${
              posSubTab === 'history'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-4 h-4 shrink-0" />
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

        {/* Developer Tag */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200/80 rounded-xl w-fit self-end sm:self-auto">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-[9px] font-extrabold text-slate-500 tracking-wider font-mono">
            HAMMAD DEVELOPER
          </span>
        </div>
      </div>

      {posSubTab === 'billing' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Catalog & Search (7 Cols) */}
          <div className="lg:col-span-7 space-y-4">
            {/* Mode Switcher Banner: Retail vs Wholesale Mode */}
            <div className={`border rounded-2xl p-2.5 sm:p-3.5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${
              saleMode === 'wholesale'
                ? 'bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-800 text-white border-purple-700/80 shadow-purple-900/20'
                : 'bg-white border-slate-200/90 text-slate-900'
            }`}>
              <div className="flex items-center gap-2.5">
                <div className={`p-2.5 rounded-xl shrink-0 ${
                  saleMode === 'wholesale' ? 'bg-white/15 text-amber-300 backdrop-blur-md' : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {saleMode === 'wholesale' ? <Package className="w-5 h-5 animate-pulse" /> : <ShoppingCart className="w-5 h-5" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-extrabold text-xs sm:text-sm leading-tight">
                      {saleMode === 'wholesale' ? 'B2B Wholesale Sales Mode' : 'Retail Sales Mode'}
                    </h4>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      saleMode === 'wholesale' ? 'bg-amber-400 text-slate-900' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {saleMode === 'wholesale' ? 'Wholesale Active' : 'Retail'}
                    </span>
                  </div>
                  <p className={`text-[11px] mt-0.5 ${saleMode === 'wholesale' ? 'text-purple-100' : 'text-slate-500'}`}>
                    {saleMode === 'wholesale'
                      ? 'Wholesale prices, bulk cartons & retailer invoice terms active'
                      : 'Standard consumer prices & walk-in customer billing'}
                  </p>
                </div>
              </div>

              {/* Mode Toggle Switcher Buttons */}
              <div className={`flex items-center p-1 rounded-xl border shrink-0 ${
                saleMode === 'wholesale' ? 'bg-purple-950/60 border-purple-600/50' : 'bg-slate-100 border-slate-200'
              }`}>
                <button
                  type="button"
                  onClick={() => setSaleMode('retail')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 min-h-[38px] ${
                    saleMode === 'retail'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <span>Retail</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSaleMode('wholesale')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 min-h-[38px] ${
                    saleMode === 'wholesale'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>Wholesale</span>
                </button>
              </div>
            </div>

            {/* Search & Category Filter Bar */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-4 space-y-3 shadow-xs">
              <div className="relative flex items-center">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search title, category, barcode, or IMEI..."
                  className="w-full pl-9 pr-24 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-blue-600 focus:bg-white transition min-h-[44px]"
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
                    onClick={() => {
                      setCameraScannerTarget('productSearch');
                      setIsCameraScannerOpen(true);
                    }}
                    className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs flex items-center gap-1 text-[11px] font-extrabold cursor-pointer transition min-h-[36px]"
                    title="Live Camera Barcode & IMEI Scanner"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Scan</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 text-xs w-full max-w-full overflow-hidden">
                <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 flex-nowrap touch-pan-x">
                  {['ALL', ...categories].map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1.5 rounded-xl font-bold text-xs whitespace-nowrap transition shrink-0 cursor-pointer ${
                        selectedCategory === cat
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                      }`}
                    >
                      {cat === 'ALL' ? 'All Items' : cat}
                    </button>
                  ))}
                </div>

                {onOpenSalesReturn && (
                  <button
                    type="button"
                    onClick={() => onOpenSalesReturn(null)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ml-auto shadow-xs whitespace-nowrap min-h-[36px]"
                    title="Process Customer Sales Return & Refund"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
                    <span className="hidden sm:inline">Sales Return / Refund</span>
                    <span className="sm:hidden">Return</span>
                  </button>
                )}
              </div>
            </div>

            {/* Product Cards Grid - 2 Column Compact Grid on Mobile */}
            <div className="grid grid-cols-2 sm:grid-cols-2 gap-2 sm:gap-3 max-h-[620px] overflow-y-auto pr-1 touch-pan-y">
              {filteredItems.length === 0 ? (
                <div className="col-span-2 text-center py-16 bg-white rounded-2xl border border-slate-200 text-xs text-slate-400 space-y-2">
                  <Package className="w-10 h-10 mx-auto text-slate-300" />
                  <p className="font-semibold text-slate-600">No matching products found</p>
                  <button
                    onClick={onOpenAddStock}
                    className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-50 text-blue-600 font-bold rounded-xl hover:bg-blue-100 transition cursor-pointer min-h-[40px]"
                  >
                    <Plus className="w-4 h-4" /> Add Product
                  </button>
                </div>
              ) : (
                filteredItems.map(item => {
                  const inCartItem = cart.find(c => c.id === item.id);
                  const remainingStock = item.qty - (inCartItem?.cartQty || 0);

                  return (
                    <div
                      key={item.id}
                      onClick={() => addToCart(item)}
                      className={`bg-white border rounded-2xl p-2.5 sm:p-4 flex flex-col justify-between transition cursor-pointer hover:shadow-md active:scale-[0.98] ${
                        remainingStock <= 0
                          ? 'opacity-60 border-slate-200 hover:border-slate-300'
                          : 'border-slate-200/90 hover:border-blue-500'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                        {/* Product Photo Thumbnail */}
                        {item.image ? (
                          <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl border border-slate-200 overflow-hidden bg-slate-50 shrink-0 shadow-2xs">
                            <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl border border-slate-200/80 bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                            <Package className="w-5 h-5 sm:w-6 sm:h-6 text-slate-400" />
                          </div>
                        )}

                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1">
                            <h4 className="font-bold text-slate-900 text-[11px] sm:text-xs leading-tight sm:leading-snug line-clamp-2">
                              {item.name}
                            </h4>
                            <span
                              className={`text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full shrink-0 font-mono w-fit ${
                                remainingStock > 2
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : remainingStock > 0
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-rose-50 text-rose-700'
                              }`}
                            >
                              {remainingStock > 0 ? `${remainingStock} Stock` : 'Out'}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-1 text-[10px] sm:text-[11px] text-slate-500">
                            <span className="font-medium bg-slate-100 px-1.5 py-0.5 rounded text-[9px] sm:text-[10px]">
                              {item.category}
                            </span>
                            {item.imeis && item.imeis.length > 0 ? (
                              <span className="font-mono text-[9px] sm:text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded truncate max-w-[110px] sm:max-w-[170px]" title={item.imeis.join(', ')}>
                                IMEI: {item.imeis[0]}
                              </span>
                            ) : item.imei ? (
                              <span className="font-mono text-[9px] sm:text-[10px] text-blue-600 truncate max-w-[110px] sm:max-w-[170px]">
                                IMEI: {item.imei}
                              </span>
                            ) : item.barcode ? (
                              <span className="font-mono text-[9px] sm:text-[10px] text-slate-400 truncate">
                                Code: {item.barcode}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between mt-2.5 sm:mt-3.5 pt-2 sm:pt-2.5 border-t border-slate-100">
                        <div>
                          {saleMode === 'wholesale' ? (
                            <div>
                              <div className="font-extrabold text-purple-700 text-xs sm:text-sm font-mono tabular-nums flex items-center gap-1">
                                <span>{currency} {getItemUnitPrice(item).toLocaleString()}</span>
                                <span className="text-[9px] bg-purple-100 text-purple-800 px-1 py-0.2 rounded font-black uppercase">W/S</span>
                              </div>
                              <span className="text-[10px] text-slate-400 line-through font-mono">
                                {currency} {item.salePrice.toLocaleString()}
                              </span>
                            </div>
                          ) : (
                            <span className="font-extrabold text-blue-600 text-xs sm:text-sm font-mono tabular-nums">
                              {currency} {item.salePrice.toLocaleString()}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => addToCart(item)}
                            disabled={remainingStock <= 0}
                            className={`px-2 sm:px-2.5 py-1 font-bold rounded-lg text-[10px] sm:text-[11px] flex items-center gap-0.5 sm:gap-1 transition cursor-pointer min-h-[32px] ${
                              saleMode === 'wholesale'
                                ? 'bg-purple-600 text-white hover:bg-purple-700'
                                : 'bg-blue-50 hover:bg-blue-100 text-blue-600'
                            }`}
                          >
                            <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> Add
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Checkout & Billing Cart (Desktop Only >= lg:) */}
          <div className="hidden lg:block lg:col-span-5 space-y-4">
            {renderCartContent(false)}
          </div>

          {/* Mobile Floating Cart Trigger Bar (lg:hidden) */}
          {cart.length > 0 && (
            <div className="lg:hidden fixed bottom-[68px] left-3 right-3 z-30 animate-in slide-in-from-bottom duration-200">
              <div
                onClick={() => setIsMobileCartOpen(true)}
                className="bg-slate-900/95 backdrop-blur-md text-white rounded-2xl p-3 shadow-2xl flex items-center justify-between cursor-pointer border border-slate-700/60 active:scale-[0.99] transition"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative p-2 bg-blue-600 rounded-xl text-white shrink-0">
                    <ShoppingCart className="w-5 h-5" />
                    <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-xs animate-pulse">
                      {cart.reduce((a, b) => a + b.cartQty, 0)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-slate-300">
                      {cart.reduce((a, b) => a + b.cartQty, 0)} items in Cart
                    </p>
                    <p className="text-sm font-extrabold font-mono text-emerald-400 tabular-nums">
                      {currency} {grandTotal.toLocaleString()}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl flex items-center gap-1 shadow-md shadow-blue-500/25 transition cursor-pointer min-h-[44px]"
                >
                  <span>Checkout</span>
                  <ChevronUp className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Mobile Floating Cart Bottom Sheet Drawer (lg:hidden) */}
          {isMobileCartOpen && (
            <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end animate-in fade-in duration-200">
              {/* Backdrop */}
              <div
                onClick={() => setIsMobileCartOpen(false)}
                className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
              />

              {/* Drawer Panel */}
              <div className="relative z-10 bg-white rounded-t-3xl max-h-[88vh] flex flex-col shadow-2xl border-t border-slate-200 animate-in slide-in-from-bottom duration-300 overflow-hidden">
                {/* Drawer Handle */}
                <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mt-2.5 mb-1 shrink-0" />

                {/* Cart Content Container */}
                <div className="p-4 sm:p-5 overflow-y-auto flex-1">
                  {renderCartContent(true)}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ================= HISTORY SUB-TAB VIEW ================= */
        <div className="space-y-6">
          {/* Filters & Actions Control Bar */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Intelligent Search Input */}
              <div className="md:col-span-6 relative flex items-center">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={historySearch}
                  onChange={e => setHistorySearch(e.target.value)}
                  placeholder="Scan invoice barcode, IMEI, customer name..."
                  className="w-full pl-9 pr-24 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-blue-600 focus:bg-white transition min-h-[44px]"
                />
                <div className="absolute right-1.5 flex items-center gap-1">
                  {historySearch && (
                    <button
                      type="button"
                      onClick={() => setHistorySearch('')}
                      className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
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
                    className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs flex items-center gap-1 text-[11px] font-extrabold cursor-pointer transition min-h-[36px]"
                    title="Live Camera Barcode Scanner"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Scan</span>
                  </button>
                </div>
              </div>

              {/* Range Selector Buttons */}
              <div className="md:col-span-6 flex flex-wrap gap-1.5 items-center justify-start md:justify-end">
                {(['today', 'weekly', 'monthly', 'yearly', 'custom'] as const).map(range => (
                  <button
                    key={range}
                    type="button"
                    onClick={() => setHistoryRange(range)}
                    className={`px-3 py-2 rounded-lg text-xs font-extrabold uppercase tracking-wider transition cursor-pointer ${
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
              <div className="flex flex-wrap items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200/60 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">From:</span>
                  <input
                    type="date"
                    value={historyStartDate}
                    onChange={e => setHistoryStartDate(e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-semibold text-slate-700 focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">To:</span>
                  <input
                    type="date"
                    value={historyEndDate}
                    onChange={e => setHistoryEndDate(e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-semibold text-slate-700 focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>
            )}

            {/* Print and WhatsApp Share Actions for Filters */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
              <p className="text-xs text-slate-500 font-medium">
                Showing <strong className="text-slate-800">{filteredSales.length}</strong> invoices matching filter criteria.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintHistoryReport}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Report</span>
                </button>
                <button
                  type="button"
                  onClick={handleShareHistoryReport}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs"
                >
                  <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Share Report on WhatsApp</span>
                </button>
              </div>
            </div>
          </div>

          {/* Quick Net Metrics Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
            <div className="bg-white border border-slate-200/80 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 shadow-2xs flex flex-col justify-between">
              <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider line-clamp-1">Net Sales Volume</p>
              <p className="text-sm sm:text-xl font-extrabold font-mono text-blue-600 mt-0.5 sm:mt-1 truncate">
                {currency} {stats.netRevenue.toLocaleString()}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5 sm:mt-1 font-semibold truncate">{stats.totalInvoices} active bills</p>
            </div>

            <div className="bg-white border border-slate-200/80 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 shadow-2xs flex flex-col justify-between">
              <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider line-clamp-1">Credit Receivables</p>
              <p className="text-sm sm:text-xl font-extrabold font-mono text-purple-600 mt-0.5 sm:mt-1 truncate">
                {currency} {stats.totalCredit.toLocaleString()}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5 sm:mt-1 font-semibold truncate">balance due</p>
            </div>

            <div className="bg-white border border-slate-200/80 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 shadow-2xs flex flex-col justify-between">
              <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider line-clamp-1">Cancelled Bills</p>
              <p className="text-sm sm:text-xl font-extrabold font-mono text-rose-600 mt-0.5 sm:mt-1 truncate">
                {stats.cancelledCount} Bills
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5 sm:mt-1 font-semibold truncate">Void: {currency} {stats.cancelledSum.toLocaleString()}</p>
            </div>

            <div className="bg-white border border-slate-200/80 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 shadow-2xs flex flex-col justify-between">
              <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider line-clamp-1">Total Invoices</p>
              <p className="text-sm sm:text-xl font-extrabold font-mono text-slate-900 mt-0.5 sm:mt-1 truncate">
                {filteredSales.length} Bills
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5 sm:mt-1 font-semibold truncate">all records</p>
            </div>
          </div>

          {/* Historical Invoices List */}
          <div className="space-y-3">
            {filteredSales.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-3xl border border-slate-200 text-xs text-slate-400 space-y-2">
                <FileText className="w-12 h-12 mx-auto text-slate-300" />
                <p className="font-bold text-slate-600">No matching sales records found</p>
                <p className="text-slate-400 max-w-xs mx-auto">Try typing another query or selecting a different date range filter above.</p>
              </div>
            ) : (
              filteredSales.map(sale => {
                const isCancelled = sale.status === 'CANCELLED';
                return (
                  <div
                    key={sale.invNo}
                    className={`bg-white border rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition hover:shadow-xs ${
                      isCancelled 
                        ? 'border-red-100 bg-red-50/20' 
                        : sale.invoiceType === 'credit'
                          ? 'border-purple-100 hover:border-purple-300'
                          : 'border-slate-200/80 hover:border-blue-400'
                    }`}
                  >
                    {/* Left Info Column */}
                    <div className="space-y-2.5 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-black text-slate-900 text-sm font-mono tracking-wider">
                          #{sale.invNo}
                        </span>
                        
                        {/* Status Badges */}
                        {isCancelled ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200">
                            CANCELLED / VOID
                          </span>
                        ) : sale.invoiceType === 'credit' ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200">
                            CREDIT / KHATA
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">
                            CASH COMPLETED
                          </span>
                        )}

                        <span className="text-[11px] font-semibold text-slate-400 font-mono">
                          {new Date(sale.date).toLocaleString()}
                        </span>
                      </div>

                      {/* Customer Info */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <p className="font-bold text-slate-800">
                          Customer: <span className="font-extrabold text-blue-600">{sale.custName}</span>
                        </p>
                        {sale.custPhone && (
                          <p className="text-slate-500 font-mono">
                            Phone: <span className="font-bold text-slate-700">{sale.custPhone}</span>
                          </p>
                        )}
                        <span className="text-slate-300">|</span>
                        <p className="text-slate-500">
                          Channel: <span className="font-bold text-slate-700">{sale.paymentMethod}</span>
                        </p>
                      </div>

                      {/* Sold items view with Barcodes and IMEIs */}
                      <div className="bg-slate-50/80 border border-slate-100 p-3 rounded-xl space-y-1.5 max-w-2xl">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Items Sold:</p>
                        <div className="divide-y divide-slate-100">
                          {sale.items.map((it, idx) => (
                            <div key={idx} className="py-1 text-xs flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="font-extrabold text-slate-800 truncate">{it.name}</span>
                                <span className="font-semibold text-slate-400 text-[11px]">x{it.qty}</span>
                              </div>
                              <div className="flex flex-wrap items-center gap-1">
                                {it.barcode && (
                                  <span className="text-[9px] font-mono font-bold bg-slate-200/70 text-slate-600 px-1.5 py-0.5 rounded border border-slate-300/30">
                                    Barcode: {it.barcode}
                                  </span>
                                )}
                                {it.imeis && it.imeis.length > 0 ? (
                                  it.imeis.map((im, uIdx) => (
                                    <span key={uIdx} className="text-[9px] font-mono font-bold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200">
                                      IMEI: {im}
                                    </span>
                                  ))
                                ) : it.imei ? (
                                  <span className="text-[9px] font-mono font-bold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200">
                                    IMEI: {it.imei}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Notes / Reason for cancellation */}
                      {sale.notes && (
                        <p className="text-xs text-rose-700 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl font-medium">
                          <strong>Log Notes:</strong> {sale.notes}
                        </p>
                      )}
                    </div>

                    {/* Right Price & Actions Column */}
                    <div className="flex flex-col items-end gap-3 shrink-0 self-start md:self-center">
                      <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Grand Total</p>
                        <p className="text-xl font-black font-mono text-slate-900 leading-none mt-1">
                          {currency} {sale.grandTotal.toLocaleString()}
                        </p>
                        {sale.invoiceType === 'credit' && (
                          <div className="mt-1 flex flex-col text-right">
                            <span className="text-[10px] text-emerald-600 font-bold font-mono">
                              Paid: {currency} {(sale.amountPaid || 0).toLocaleString()}
                            </span>
                            {sale.amountDue && sale.amountDue > 0 ? (
                              <span className="text-[10px] text-rose-600 font-bold font-mono">
                                Due: {currency} {sale.amountDue.toLocaleString()}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onViewReceipt(sale)}
                          className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition cursor-pointer"
                          title="Print Invoice Bill"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleShareWhatsapp(sale)}
                          className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg transition cursor-pointer"
                          title="Share Invoice on WhatsApp"
                        >
                          <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                        </button>

                        {!isCancelled && (
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(sale)}
                            className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition cursor-pointer"
                            title="Edit Invoice (Modify items or details)"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleOpenDeleteModal(sale)}
                          className={`p-2 rounded-lg transition cursor-pointer ${
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
                  <p className="text-xs text-slate-500 font-mono">
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
                <span className="font-mono font-black text-sm text-slate-900">
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
                  <p className="text-xs text-slate-500 font-mono">
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
                          <span className="font-mono font-bold text-slate-900">
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

      {/* Live Camera Barcode & IMEI Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isCameraScannerOpen}
        onClose={() => setIsCameraScannerOpen(false)}
        onScan={(code) => {
          if (cameraScannerTarget === 'productSearch') {
            setSearch(code);
            showToast(`Product Scanned: ${code}`, 'success');
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
    </div>
  );
};

export const PosTab = React.memo(PosTabComponent);
