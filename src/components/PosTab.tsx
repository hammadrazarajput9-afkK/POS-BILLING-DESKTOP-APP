import React, { useState, useMemo } from 'react';
import { InventoryItem, CartItem, PaymentMethod, SaleRecord, InvoiceType, KhataCustomer } from '../types';
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
  FileText
} from 'lucide-react';
import { useToast } from './Toast';
import { useFormDraft } from '../hooks/useFormDraft';

interface PosTabProps {
  inventory: InventoryItem[];
  currency: string;
  categories: string[];
  khataCustomers?: KhataCustomer[];
  onCompleteSale: (sale: SaleRecord) => void;
  onOpenAddStock: () => void;
  onOpenPdfReport?: () => void;
}

interface PosDraftState {
  cart: CartItem[];
  invoiceType: InvoiceType;
  selectedKhataId: string;
  custName: string;
  custPhone: string;
  discount: number | '';
  paymentMethod: PaymentMethod;
  amountPaid: number | '';
}

const initialPosDraft: PosDraftState = {
  cart: [],
  invoiceType: 'cash',
  selectedKhataId: '',
  custName: '',
  custPhone: '',
  discount: 0,
  paymentMethod: 'Cash',
  amountPaid: '',
};

export const PosTab: React.FC<PosTabProps> = ({
  inventory,
  currency,
  categories,
  khataCustomers = [],
  onCompleteSale,
  onOpenAddStock,
  onOpenPdfReport,
}) => {
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Persistent Form Draft State
  const [draft, setDraft, resetDraft, hasActiveDraft] = useFormDraft<PosDraftState>(
    'pos_terminal_draft',
    initialPosDraft
  );

  const cart = draft.cart || [];
  const invoiceType = draft.invoiceType || 'cash';
  const selectedKhataId = draft.selectedKhataId || '';
  const custName = draft.custName || '';
  const custPhone = draft.custPhone || '';
  const discount = draft.discount !== undefined ? draft.discount : 0;
  const paymentMethod = draft.paymentMethod || 'Cash';
  const amountPaid = draft.amountPaid !== undefined ? draft.amountPaid : '';

  const setCart = (updater: CartItem[] | ((prev: CartItem[]) => CartItem[])) => {
    setDraft(prev => ({
      ...prev,
      cart: typeof updater === 'function' ? updater(prev.cart || []) : updater,
    }));
  };

  const setInvoiceType = (type: InvoiceType) => {
    setDraft(prev => ({ ...prev, invoiceType: type }));
  };

  const setSelectedKhataId = (id: string) => {
    setDraft(prev => ({ ...prev, selectedKhataId: id }));
  };

  const setCustName = (name: string) => {
    setDraft(prev => ({ ...prev, custName: name }));
  };

  const setCustPhone = (phone: string) => {
    setDraft(prev => ({ ...prev, custPhone: phone }));
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

  // Filtered inventory
  const filteredItems = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) {
      return selectedCategory === 'ALL'
        ? inventory
        : inventory.filter(item => item.category === selectedCategory);
    }

    const tokens = q.split(/\s+/).filter(Boolean);

    return inventory.filter(item => {
      const imeiString = [
        item.imei || '',
        ...(item.imeis || []),
      ].join(' ');

      const combinedText = `${item.name} ${item.category} ${item.barcode || ''} ${imeiString}`.toLowerCase();
      const matchSearch = tokens.every(token => combinedText.includes(token));
      const matchCat = selectedCategory === 'ALL' || item.category === selectedCategory;

      return matchSearch && matchCat;
    });
  }, [inventory, search, selectedCategory]);

  const addToCart = (item: InventoryItem) => {
    if (item.qty <= 0) {
      showToast('Item is out of stock', 'error');
      return;
    }

    setCart(prev => {
      const existing = prev.find(c => c.id === item.id);
      if (existing) {
        if (existing.cartQty >= item.qty) {
          showToast(`Only ${item.qty} units available in stock`, 'warning');
          return prev;
        }
        return prev.map(c =>
          c.id === item.id ? { ...c, cartQty: c.cartQty + 1 } : c
        );
      } else {
        return [...prev, { ...item, cartQty: 1 }];
      }
    });
    showToast(`${item.name} added to cart`, 'info');
  };

  const updateCartQty = (id: string, delta: number) => {
    const invItem = inventory.find(i => i.id === id);
    if (!invItem) return;

    setCart(prev => {
      return prev
        .map(c => {
          if (c.id === id) {
            const newQty = c.cartQty + delta;
            if (delta > 0 && newQty > invItem.qty) {
              showToast(`Stock limit (${invItem.qty}) reached`, 'warning');
              return c;
            }
            return { ...c, cartQty: newQty };
          }
          return c;
        })
        .filter(c => c.cartQty > 0);
    });
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(c => c.id !== id));
  };

  const clearCart = () => {
    resetDraft();
    showToast('Billing cart cleared', 'info');
  };

  const subtotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.salePrice * item.cartQty, 0);
  }, [cart]);

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

  const handleCheckout = () => {
    if (cart.length === 0) {
      showToast('Please add items to cart before checkout', 'warning');
      return;
    }

    if (invoiceType === 'credit' && !custName.trim()) {
      showToast('Please enter customer name or select from Khata for Credit Sale', 'warning');
      return;
    }

    const totalCost = cart.reduce((acc, item) => acc + item.costPrice * item.cartQty, 0);
    const netProfit = Math.max(0, grandTotal - totalCost);
    const invNo = 'INV-' + Math.floor(100000 + Math.random() * 900000);

    const saleRecord: SaleRecord = {
      invNo,
      invoiceType,
      custName: custName.trim() || 'Walk-in Customer',
      custPhone: custPhone.trim() || undefined,
      khataCustomerId: invoiceType === 'credit' ? selectedKhataId || undefined : undefined,
      amountPaid: actualPaid,
      amountDue: actualDue,
      items: cart.map(i => ({
        id: i.id,
        name: i.name,
        category: i.category,
        imei: i.imei,
        salePrice: i.salePrice,
        costPrice: i.costPrice,
        qty: i.cartQty,
      })),
      subtotal,
      discount: discountVal,
      grandTotal,
      totalCost,
      netProfit,
      paymentMethod,
      date: new Date().toISOString(),
    };

    onCompleteSale(saleRecord);
    resetDraft();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Column: Catalog & Search (7 Cols) */}
      <div className="lg:col-span-7 space-y-4">
        {/* Search & Category Filter Bar */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 space-y-3 shadow-xs">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search product title, category, barcode, or IMEI..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-blue-600 focus:bg-white transition"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {['ALL', ...categories].map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-blue-600 text-white font-bold shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                }`}
              >
                {cat === 'ALL' ? 'All Items' : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Product Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[620px] overflow-y-auto pr-1">
          {filteredItems.length === 0 ? (
            <div className="col-span-2 text-center py-16 bg-white rounded-2xl border border-slate-200 text-xs text-slate-400 space-y-2">
              <Package className="w-10 h-10 mx-auto text-slate-300" />
              <p className="font-semibold text-slate-600">No matching products found</p>
              <button
                onClick={onOpenAddStock}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-50 text-blue-600 font-bold rounded-xl hover:bg-blue-100 transition cursor-pointer"
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
                  className={`bg-white border rounded-2xl p-4 flex flex-col justify-between transition cursor-pointer hover:shadow-md ${
                    remainingStock <= 0
                      ? 'opacity-60 border-slate-200 hover:border-slate-300'
                      : 'border-slate-200/90 hover:border-blue-500'
                  }`}
                >
                  <div className="flex gap-3">
                    {/* Product Photo Thumbnail */}
                    {item.image ? (
                      <div className="w-14 h-14 rounded-xl border border-slate-200 overflow-hidden bg-slate-50 shrink-0 shadow-2xs">
                        <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-xl border border-slate-200/80 bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                        <Package className="w-6 h-6 text-slate-400" />
                      </div>
                    )}

                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-1.5">
                        <h4 className="font-bold text-slate-900 text-xs leading-snug line-clamp-2">
                          {item.name}
                        </h4>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 font-mono ${
                            remainingStock > 2
                              ? 'bg-emerald-50 text-emerald-700'
                              : remainingStock > 0
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {remainingStock > 0 ? `${remainingStock} In Stock` : 'Out of Stock'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                        <span className="font-medium bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                          {item.category}
                        </span>
                        {item.imeis && item.imeis.length > 0 ? (
                          <span className="font-mono text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded truncate max-w-[170px]" title={item.imeis.join(', ')}>
                            IMEI: {item.imeis[0]} {item.imeis.length > 1 ? `(+${item.imeis.length - 1} more)` : ''}
                          </span>
                        ) : item.imei ? (
                          <span className="font-mono text-[10px] text-blue-600 truncate max-w-[170px]">
                            IMEI: {item.imei}
                          </span>
                        ) : item.barcode ? (
                          <span className="font-mono text-[10px] text-slate-400 truncate">
                            Code: {item.barcode}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-3.5 pt-2.5 border-t border-slate-100">
                    <span className="font-extrabold text-blue-600 text-sm font-mono tabular-nums">
                      {currency} {item.salePrice.toLocaleString()}
                    </span>
                    <button
                      type="button"
                      disabled={remainingStock <= 0}
                      className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold rounded-lg text-[11px] flex items-center gap-1 transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Column: Checkout & Billing Cart (5 Cols) */}
      <div className="lg:col-span-5 space-y-4">
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-4 flex flex-col h-full shadow-xs">
          {/* Cart Header */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-blue-600" /> Active Billing Cart
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
                className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
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
                className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  invoiceType === 'credit'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Credit / Khata</span>
              </button>
            </div>

            {/* If Credit / Khata is selected, allow picking from existing customers */}
            {invoiceType === 'credit' && khataCustomers.length > 0 && (
              <div className="pt-1.5">
                <select
                  value={selectedKhataId}
                  onChange={e => handleKhataSelect(e.target.value)}
                  className="w-full bg-white border border-purple-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-purple-600"
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
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={custName}
              onChange={e => setCustName(e.target.value)}
              placeholder="Customer Name"
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-blue-600 focus:bg-white transition"
            />
            <input
              type="text"
              value={custPhone}
              onChange={e => setCustPhone(e.target.value)}
              placeholder="Phone Number"
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-blue-600 focus:bg-white transition"
            />
          </div>

          {/* Cart Itemized Table */}
          <div className="border border-slate-200/80 rounded-xl overflow-hidden flex-1 min-h-[140px]">
            <div className="max-h-52 overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
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
                    cart.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50/60 transition">
                        <td className="p-2.5">
                          <p className="font-semibold text-slate-900 leading-tight line-clamp-1">
                            {item.name}
                          </p>
                          {item.imei && (
                            <p className="text-[9px] font-mono text-blue-600">
                              {item.imei}
                            </p>
                          )}
                        </td>
                        <td className="p-2.5 text-center">
                          <div className="inline-flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                            <button
                              type="button"
                              onClick={() => updateCartQty(item.id, -1)}
                              className="w-5 h-5 bg-white rounded font-bold text-slate-700 hover:bg-slate-200 flex items-center justify-center transition cursor-pointer"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="font-mono tabular-nums font-bold text-xs px-1.5">
                              {item.cartQty}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateCartQty(item.id, 1)}
                              className="w-5 h-5 bg-white rounded font-bold text-slate-700 hover:bg-slate-200 flex items-center justify-center transition cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                        <td className="p-2.5 text-right font-mono tabular-nums font-bold text-slate-900">
                          {currency} {(item.salePrice * item.cartQty).toLocaleString()}
                        </td>
                        <td className="p-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.id)}
                            className="text-slate-400 hover:text-rose-600 p-1 transition cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pricing Totals & Payment Method */}
          <div className="space-y-3 pt-2 border-t border-slate-100 text-xs">
            <div className="space-y-1.5 text-slate-600">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span className="font-mono tabular-nums font-bold text-slate-800">
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
                  className="w-24 text-right bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 font-mono tabular-nums font-bold text-xs focus:outline-none focus:border-blue-600 focus:bg-white"
                />
              </div>

              <div className="flex justify-between text-base font-extrabold text-slate-900 pt-1.5 border-t border-slate-100">
                <span>Grand Total:</span>
                <span className="text-blue-600 font-mono tabular-nums text-lg">
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
                      className="w-28 text-right bg-white border border-purple-300 rounded-lg px-2.5 py-1 font-mono tabular-nums font-bold text-xs focus:outline-none focus:border-purple-600"
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
                    className={`py-2 px-1 rounded-xl text-xs font-bold text-center transition cursor-pointer ${
                      paymentMethod === pm
                        ? invoiceType === 'credit' ? 'bg-purple-600 text-white shadow-xs' : 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {pm}
                  </button>
                ))}
              </div>
            </div>

            {/* Checkout Action Button */}
            <button
              type="button"
              onClick={handleCheckout}
              disabled={cart.length === 0}
              className={`w-full py-3.5 text-white font-extrabold rounded-xl shadow-lg transition text-sm flex items-center justify-center gap-2 cursor-pointer ${
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
      </div>
    </div>
  );
};
