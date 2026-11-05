import React, { useState, useMemo, useEffect } from 'react';
import {
  SaleRecord,
  SaleItem,
  SalesReturnRecord,
  SalesReturnItem,
  PaymentMethod,
  InventoryItem,
  ImeiRecord,
  KhataCustomer,
  OnlineAccount
} from '../types';
import {
  RotateCcw,
  X,
  Search,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  User,
  Phone,
  DollarSign,
  Package,
  Calendar,
  Smartphone,
  CreditCard,
  FileText,
  Clock
} from 'lucide-react';
import { useToast } from './Toast';
import { generateNextReturnNumber, extractItemImeis } from '../utils/imeiManager';
import { normalizePaymentChannel } from '../utils/accounting';

interface SalesReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  sales: SaleRecord[];
  inventory: InventoryItem[];
  currency: string;
  salesReturns?: SalesReturnRecord[];
  initialSale?: SaleRecord | null;
  onlineAccounts?: OnlineAccount[];
  onProcessReturn: (returnRecord: SalesReturnRecord) => void;
}

export const RETURN_REASONS = [
  'Defective / Faulty Product',
  'Customer Changed Mind',
  'Wrong Model / Color',
  'Exchange / Replacement',
  'Charging / Battery Issue',
  'Physical Damage',
  'Price Disagreement',
  'Other',
];

export const SalesReturnModal: React.FC<SalesReturnModalProps> = ({
  isOpen,
  onClose,
  sales = [],
  inventory = [],
  currency,
  salesReturns = [],
  initialSale = null,
  onlineAccounts = [],
  onProcessReturn,
}) => {
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(initialSale);

  // Return Form State
  const [selectedItemIds, setSelectedItemIds] = useState<Record<string, boolean>>({});
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
  const [selectedImeis, setSelectedImeis] = useState<Record<string, string[]>>({});
  const [itemReasons, setItemReasons] = useState<Record<string, string>>({});
  const [itemRefundAmounts, setItemRefundAmounts] = useState<Record<string, number>>({});

  const [overallReason, setOverallReason] = useState<string>('Defective / Faulty Product');
  const [refundPaymentMethod, setRefundPaymentMethod] = useState<PaymentMethod>('Cash');
  const [accountId, setAccountId] = useState<string>('');
  const [returnDate, setReturnDate] = useState<string>(() => new Date().toISOString().substring(0, 10));
  const [returnedBy, setReturnedBy] = useState<string>('Admin');
  const [notes, setNotes] = useState<string>('');

  // Matching online accounts for refund payment method
  const matchingAccounts = useMemo(() => {
    return onlineAccounts.filter(a => normalizePaymentChannel(a.bankType || a.name) === refundPaymentMethod);
  }, [onlineAccounts, refundPaymentMethod]);

  useEffect(() => {
    if (matchingAccounts.length === 1) {
      if (accountId !== matchingAccounts[0].id) {
        setAccountId(matchingAccounts[0].id);
      }
    } else {
      if (accountId !== '') {
        setAccountId('');
      }
    }
  }, [refundPaymentMethod, matchingAccounts, accountId]);

  // Sync initial sale if provided
  useEffect(() => {
    if (initialSale) {
      setSelectedSale(initialSale);
      initializeFormForSale(initialSale);
    }
  }, [initialSale]);

  const initializeFormForSale = (sale: SaleRecord) => {
    const initSelected: Record<string, boolean> = {};
    const initQtys: Record<string, number> = {};
    const initImeis: Record<string, string[]> = {};
    const initReasons: Record<string, string> = {};
    const initRefunds: Record<string, number> = {};

    sale.items.forEach((item, idx) => {
      const key = `${item.id}_${idx}`;
      const alreadyReturned = item.returnedQty || 0;
      const remainingQty = Math.max(0, item.qty - alreadyReturned);

      if (remainingQty > 0) {
        initSelected[key] = true;
        initQtys[key] = remainingQty;
        initReasons[key] = 'Defective / Faulty Product';
        initRefunds[key] = remainingQty * item.salePrice;

        const itemImeis = item.imeis || (item.imei ? item.imei.split(',').map(s => s.trim()).filter(Boolean) : []);
        initImeis[key] = itemImeis.slice(0, remainingQty);
      }
    });

    setSelectedItemIds(initSelected);
    setReturnQtys(initQtys);
    setSelectedImeis(initImeis);
    setItemReasons(initReasons);
    setItemRefundAmounts(initRefunds);
    setRefundPaymentMethod(sale.paymentMethod || 'Cash');
  };

  const handleSelectSale = (sale: SaleRecord) => {
    setSelectedSale(sale);
    initializeFormForSale(sale);
  };

  // Filtered sales for search
  const filteredSales = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return sales.slice(0, 10);

    return sales.filter(s => {
      const imeiStr = s.items.flatMap(i => i.imeis || (i.imei ? [i.imei] : [])).join(' ');
      return (
        s.invNo.toLowerCase().includes(q) ||
        s.custName.toLowerCase().includes(q) ||
        (s.custPhone && s.custPhone.includes(q)) ||
        s.items.some(i => i.name.toLowerCase().includes(q)) ||
        imeiStr.toLowerCase().includes(q)
      );
    }).slice(0, 15);
  }, [sales, searchQuery]);

  const toggleItemSelection = (key: string) => {
    setSelectedItemIds(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleQtyChange = (key: string, qty: number, maxQty: number, unitSalePrice: number) => {
    const validQty = Math.max(1, Math.min(maxQty, qty));
    setReturnQtys(prev => ({
      ...prev,
      [key]: validQty,
    }));
    setItemRefundAmounts(prev => ({
      ...prev,
      [key]: validQty * unitSalePrice,
    }));
  };

  const handleImeiToggle = (key: string, imei: string, targetQty: number) => {
    setSelectedImeis(prev => {
      const current = prev[key] || [];
      if (current.includes(imei)) {
        return {
          ...prev,
          [key]: current.filter(im => im !== imei),
        };
      } else {
        if (current.length >= targetQty) {
          showToast(`Selected IMEIs count cannot exceed return quantity (${targetQty})`, 'warning');
          return prev;
        }
        return {
          ...prev,
          [key]: [...current, imei],
        };
      }
    });
  };

  // Total refund calculation
  const totalRefund = useMemo(() => {
    if (!selectedSale) return 0;
    let sum = 0;
    selectedSale.items.forEach((item, idx) => {
      const key = `${item.id}_${idx}`;
      if (selectedItemIds[key]) {
        sum += Number(itemRefundAmounts[key]) || 0;
      }
    });
    return sum;
  }, [selectedSale, selectedItemIds, itemRefundAmounts]);

  const handleSubmitReturn = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedSale) {
      showToast('Please select a sale invoice to process return', 'warning');
      return;
    }

    const returnItems: SalesReturnItem[] = [];
    let totalCostReversed = 0;

    selectedSale.items.forEach((item, idx) => {
      const key = `${item.id}_${idx}`;
      if (selectedItemIds[key]) {
        const returnQty = returnQtys[key] || 1;
        const refundAmt = itemRefundAmounts[key] !== undefined ? itemRefundAmounts[key] : returnQty * item.salePrice;
        const reason = itemReasons[key] || overallReason;
        const chosenImeis = selectedImeis[key] || [];

        const availableImeis = item.imeis || (item.imei ? item.imei.split(',').map(s => s.trim()).filter(Boolean) : []);
        if (availableImeis.length > 0 && chosenImeis.length !== returnQty) {
          showToast(`Please select exactly ${returnQty} IMEI(s) for "${item.name}"`, 'warning');
          return;
        }

        returnItems.push({
          itemId: item.id,
          productId: item.id,
          name: item.name,
          category: item.category,
          qty: returnQty,
          costPrice: item.costPrice,
          salePrice: item.salePrice,
          refundAmount: refundAmt,
          imeis: chosenImeis.length > 0 ? chosenImeis : undefined,
          imei: chosenImeis.length > 0 ? chosenImeis.join(', ') : undefined,
          returnReason: reason,
        });

        totalCostReversed += item.costPrice * returnQty;
      }
    });

    if (matchingAccounts.length > 1 && !accountId) {
      showToast(`Please select the specific ${refundPaymentMethod} account for refund.`, 'warning');
      return;
    }

    if (returnItems.length === 0) {
      showToast('Please select at least one item to return', 'warning');
      return;
    }

    const netProfitDeducted = Math.max(0, totalRefund - totalCostReversed);
    const returnNo = generateNextReturnNumber(salesReturns);

    const returnRecord: SalesReturnRecord = {
      id: 'RET-' + Date.now(),
      returnNo,
      originalInvNo: selectedSale.invNo,
      customerName: selectedSale.custName,
      customerPhone: selectedSale.custPhone,
      khataCustomerId: selectedSale.khataCustomerId,
      items: returnItems,
      totalRefundAmount: totalRefund,
      refundPaymentMethod,
      accountId: matchingAccounts.length > 0 ? accountId || undefined : undefined,
      totalCostReversed,
      netProfitDeducted,
      reason: overallReason,
      returnDate,
      returnedBy,
      notes: notes.trim() || undefined,
    };

    onProcessReturn(returnRecord);
    showToast(`Return #${returnNo} processed successfully! Stock restored.`, 'success');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-5 sm:p-6 shadow-2xl space-y-5 border border-slate-100 my-auto animate-in fade-in zoom-in-95 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500 text-white rounded-xl shadow-md shadow-amber-500/20">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                Sales Return & Refund
                {selectedSale && (
                  <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 font-bold rounded-lg border border-blue-200">
                    Inv #{selectedSale.invNo}
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-400">
                Safe return workflow: Restores inventory & IMEIs, reverses profit & financial balance
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="overflow-y-auto pr-1 flex-1 space-y-4">
          {/* Step 1: Select Original Sale Invoice if not selected */}
          {!selectedSale ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-800">
                  Select Original Sale Invoice to Return
                </label>
                <span className="text-[11px] text-slate-400 font-medium">
                  {sales.length} historical invoices available
                </span>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search by Invoice # (e.g. 948201), Customer, or IMEI..."
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-amber-500 focus:bg-white"
                />
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {filteredSales.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                    No matching sales invoices found
                  </div>
                ) : (
                  filteredSales.map(sale => {
                    const isFullyReturned = sale.returnStatus === 'FULL';
                    return (
                      <div
                        key={sale.invNo}
                        onClick={() => !isFullyReturned && handleSelectSale(sale)}
                        className={`p-3.5 rounded-xl border transition flex items-center justify-between ${
                          isFullyReturned
                            ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                            : 'bg-white border-slate-200 hover:border-amber-400 hover:bg-amber-50/30 cursor-pointer shadow-2xs'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-xs text-slate-900">
                              #{sale.invNo}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-700">
                              {sale.paymentMethod}
                            </span>
                            {sale.returnStatus === 'PARTIAL' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold bg-amber-100 text-amber-800">
                                Partially Returned
                              </span>
                            )}
                            {sale.returnStatus === 'FULL' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold bg-rose-100 text-rose-800">
                                Fully Returned
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-600 font-medium flex items-center gap-2">
                            <User className="w-3 h-3 text-slate-400" />
                            {sale.custName} {sale.custPhone ? `(${sale.custPhone})` : ''}
                            <span className="text-slate-300">|</span>
                            <Clock className="w-3 h-3 text-slate-400" />
                            {new Date(sale.date).toLocaleDateString()}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {sale.items.map(i => `${i.name} (x${i.qty})`).join(', ')}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="font-black text-xs text-slate-900">
                            {currency} {sale.grandTotal.toLocaleString()}
                          </p>
                          <span className="text-[10px] text-amber-600 font-bold hover:underline">
                            {isFullyReturned ? 'Closed' : 'Select Invoice ->'}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmitReturn} className="space-y-4">
              {/* Original Invoice Summary Card */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-slate-900">
                      Invoice #{selectedSale.invNo}
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium">
                      ({new Date(selectedSale.date).toLocaleDateString()})
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Customer: <span className="font-bold text-slate-800">{selectedSale.custName}</span>
                    {selectedSale.custPhone ? ` • ${selectedSale.custPhone}` : ''}
                    {' • '}Original Total: <span className="font-bold text-slate-800">{currency} {selectedSale.grandTotal.toLocaleString()}</span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedSale(null)}
                  className="px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                >
                  Change Invoice
                </button>
              </div>

              {/* Items Return Table */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-800">
                  Select Product(s) to Return & Adjust Quantity
                </label>

                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                  {selectedSale.items.map((item, idx) => {
                    const key = `${item.id}_${idx}`;
                    const isSelected = !!selectedItemIds[key];
                    const alreadyReturned = item.returnedQty || 0;
                    const remainingQty = Math.max(0, item.qty - alreadyReturned);
                    const isFullyReturned = remainingQty <= 0;

                    const curQty = returnQtys[key] || 1;
                    const itemImeis = item.imeis || (item.imei ? item.imei.split(',').map(s => s.trim()).filter(Boolean) : []);
                    const chosenImeis = selectedImeis[key] || [];

                    return (
                      <div
                        key={key}
                        className={`p-3 transition ${
                          isSelected ? 'bg-amber-50/30' : 'bg-white'
                        } ${isFullyReturned ? 'opacity-50' : ''}`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isFullyReturned}
                            onChange={() => toggleItemSelection(key)}
                            className="mt-1 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                          />

                          <div className="flex-1 space-y-2">
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="font-extrabold text-xs text-slate-900">
                                  {item.name}
                                </h4>
                                <p className="text-[11px] text-slate-400">
                                  Category: {item.category} • Sold: {item.qty} units @ {currency} {item.salePrice.toLocaleString()}
                                  {alreadyReturned > 0 && (
                                    <span className="ml-2 text-rose-600 font-bold">
                                      (Already returned: {alreadyReturned})
                                    </span>
                                  )}
                                </p>
                              </div>

                              <div className="text-right">
                                <span className="font-black text-xs text-slate-900">
                                  {currency} {((returnQtys[key] || 0) * item.salePrice).toLocaleString()}
                                </span>
                              </div>
                            </div>

                            {isSelected && !isFullyReturned && (
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-100">
                                {/* Quantity */}
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                    Return Quantity (Max {remainingQty})
                                  </label>
                                  <input
                                    type="number"
                                    min="1"
                                    max={remainingQty}
                                    value={curQty}
                                    onChange={e => handleQtyChange(key, parseInt(e.target.value) || 1, remainingQty, item.salePrice)}
                                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500"
                                  />
                                </div>

                                {/* Refund Amount */}
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                    Refund Amount ({currency})
                                  </label>
                                  <input
                                    type="number"
                                    value={itemRefundAmounts[key] !== undefined ? itemRefundAmounts[key] : curQty * item.salePrice}
                                    onChange={e => setItemRefundAmounts(prev => ({
                                      ...prev,
                                      [key]: Number(e.target.value) || 0,
                                    }))}
                                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-emerald-700 focus:outline-none focus:border-amber-500"
                                  />
                                </div>

                                {/* Return Reason */}
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                    Reason for Return
                                  </label>
                                  <select
                                    value={itemReasons[key] || overallReason}
                                    onChange={e => setItemReasons(prev => ({
                                      ...prev,
                                      [key]: e.target.value,
                                    }))}
                                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:border-amber-500"
                                  >
                                    {RETURN_REASONS.map(r => (
                                      <option key={r} value={r}>{r}</option>
                                    ))}
                                  </select>
                                </div>

                                {/* IMEI Selection if phone item */}
                                {itemImeis.length > 0 && (
                                  <div className="col-span-full pt-1">
                                    <label className="block text-[10px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                                      <Smartphone className="w-3 h-3 text-blue-600" />
                                      Select Returned IMEI(s) to restore to inventory stock ({chosenImeis.length}/{curQty} selected):
                                    </label>
                                    <div className="flex flex-wrap gap-1.5">
                                      {itemImeis.map(im => {
                                        const isImChosen = chosenImeis.includes(im);
                                        return (
                                          <button
                                            key={im}
                                            type="button"
                                            onClick={() => handleImeiToggle(key, im, curQty)}
                                            className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-bold transition cursor-pointer border ${
                                              isImChosen
                                                ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                                                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                                            }`}
                                          >
                                            {im} {isImChosen ? '✓' : '+'}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Financial & Audit Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Refund Payment Method
                  </label>
                  <select
                    value={refundPaymentMethod}
                    onChange={e => setRefundPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-amber-500"
                  >
                    <option value="Cash">Cash Return (Physical Counter Cash)</option>
                    <option value="Bank">Bank Account Transfer</option>
                    <option value="JazzCash">JazzCash Wallet</option>
                    <option value="Easypaisa">Easypaisa Wallet</option>
                    <option value="Card">Card Reversal</option>
                  </select>
                  {matchingAccounts.length > 1 && (
                    <div className="mt-2">
                      <label className="block text-[11px] font-bold text-amber-900 mb-1">
                        Select Specific {refundPaymentMethod} Account *
                      </label>
                      <select
                        value={accountId}
                        onChange={e => setAccountId(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-amber-600"
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

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Return Date
                  </label>
                  <input
                    type="date"
                    value={returnDate}
                    onChange={e => setReturnDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Processed By User
                  </label>
                  <input
                    type="text"
                    value={returnedBy}
                    onChange={e => setReturnedBy(e.target.value)}
                    placeholder="Staff / Cashier Name"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Additional Return Notes / Memo
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Optional notes for audit..."
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Total Refund Banner */}
              <div className="p-3.5 bg-amber-500 text-white rounded-xl flex items-center justify-between shadow-md shadow-amber-500/20">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-bold opacity-90">
                      Total Refund to Customer
                    </p>
                    <p className="text-lg font-black leading-tight">
                      {currency} {totalRefund.toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="text-right text-[11px] opacity-90">
                  <p>Stock will be restored instantly</p>
                  <p>IMEIs will be set back to Available</p>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-black rounded-xl text-xs shadow-lg shadow-amber-600/25 transition cursor-pointer flex items-center gap-1.5"
                >
                  <RotateCcw className="w-4 h-4" />
                  Confirm & Process Return
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default SalesReturnModal;
