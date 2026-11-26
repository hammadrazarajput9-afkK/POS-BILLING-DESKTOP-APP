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
  Clock,
  Camera
} from 'lucide-react';
import { useToast } from './Toast';
import { generateNextReturnNumber, extractItemImeis } from '../utils/imeiManager';
import { smartFilterAndSort } from '../utils/smartSearch';
import { BarcodeScannerModal } from './BarcodeScannerModal';

interface SalesReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  sales: SaleRecord[];
  inventory: InventoryItem[];
  currency: string;
  salesReturns?: SalesReturnRecord[];
  initialSale?: SaleRecord | null;
  onlineAccounts?: OnlineAccount[];
  khata?: KhataCustomer[];
  imeiRecords?: ImeiRecord[];
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
  khata = [],
  imeiRecords = [],
  onProcessReturn,
}) => {
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(initialSale);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Return Form State
  const [selectedItemIds, setSelectedItemIds] = useState<Record<string, boolean>>({});
  const [returnQtys, setReturnQtys] = useState<Record<string, number | ''>>({});
  const [selectedImeis, setSelectedImeis] = useState<Record<string, string[]>>({});
  const [itemReasons, setItemReasons] = useState<Record<string, string>>({});
  const [itemRefundAmounts, setItemRefundAmounts] = useState<Record<string, number | ''>>({});

  const [overallReason, setOverallReason] = useState<string>('Defective / Faulty Product');
  const [refundPaymentMethod, setRefundPaymentMethod] = useState<PaymentMethod>('Cash');
  const [deductFromKhata, setDeductFromKhata] = useState<boolean>(false);
  const [returnDate, setReturnDate] = useState<string>(() => new Date().toISOString().substring(0, 10));
  const [returnedBy, setReturnedBy] = useState<string>('Admin');
  const [notes, setNotes] = useState<string>('');

  const linkedKhataCustomer = useMemo(() => {
    if (!selectedSale) return undefined;
    if (selectedSale.khataCustomerId) {
      const byId = khata.find(c => c.id === selectedSale.khataCustomerId);
      if (byId) return byId;
    }
    const normPhone = (selectedSale.custPhone || '').replace(/[^0-9]/g, '');
    if (normPhone.length >= 7) {
      const byPhone = khata.find(c => (c.phone || '').replace(/[^0-9]/g, '') === normPhone);
      if (byPhone) return byPhone;
    }
    const normName = (selectedSale.custName || '').trim().toLowerCase();
    if (normName && normName !== 'walk-in customer') {
      return khata.find(c => c.name.trim().toLowerCase() === normName);
    }
    return undefined;
  }, [selectedSale, khata]);

  useEffect(() => {
    if (!isOpen) return;
    const handleHardwareBack = (e: Event) => {
      if (isScannerOpen) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('pos-hardware-back', handleHardwareBack);
    return () => window.removeEventListener('pos-hardware-back', handleHardwareBack);
  }, [isOpen, isScannerOpen, onClose]);

  const initializeFormForSale = (sale: SaleRecord, scannedCode?: string) => {
    const cleanCode = (scannedCode || '').trim().toLowerCase();
    const initSelected: Record<string, boolean> = {};
    const initQtys: Record<string, number> = {};
    const initImeis: Record<string, string[]> = {};
    const initReasons: Record<string, string> = {};
    const initRefunds: Record<string, number> = {};

    // Check if scanned code matches a specific IMEI or barcode inside this sale
    let matchedSpecificItem = false;
    if (cleanCode) {
      matchedSpecificItem = sale.items.some(item => {
        const alreadyRet = item.returnedQty || 0;
        if (Math.max(0, item.qty - alreadyRet) <= 0) return false;
        const imeis = extractItemImeis(item);
        return (
          imeis.some(im => im.toLowerCase() === cleanCode) ||
          (item.barcode || '').trim().toLowerCase() === cleanCode
        );
      });
    }

    sale.items.forEach((item, idx) => {
      const key = `${item.id}_${idx}`;
      const alreadyReturned = item.returnedQty || 0;
      const remainingQty = Math.max(0, item.qty - alreadyReturned);
      if (remainingQty <= 0) return;

      const rawItemImeis = extractItemImeis(item);
      const alreadyRetImeis = (item.returnedImeis || []).map(x => x.toLowerCase());
      const returnableImeis = rawItemImeis.filter(im => !alreadyRetImeis.includes(im.toLowerCase()));
      const imeiPool = returnableImeis.length > 0 ? returnableImeis : rawItemImeis;

      const exactImeiMatch = cleanCode
        ? imeiPool.find(im => im.toLowerCase() === cleanCode)
        : undefined;
      const exactBarcodeMatch = cleanCode
        ? (item.barcode || '').trim().toLowerCase() === cleanCode
        : false;

      const shouldSelect = matchedSpecificItem
        ? Boolean(exactImeiMatch || exactBarcodeMatch)
        : true;

      initReasons[key] = 'Defective / Faulty Product';

      const discountRatio =
        sale.discount > 0 && sale.subtotal > 0
          ? Math.max(0, Math.min(1, sale.grandTotal / sale.subtotal))
          : 1;
      const effectiveUnitRefund = Math.round(item.salePrice * discountRatio);

      if (shouldSelect) {
        initSelected[key] = true;
        if (exactImeiMatch) {
          initQtys[key] = 1;
          initImeis[key] = [exactImeiMatch];
          initRefunds[key] = effectiveUnitRefund;
        } else if (exactBarcodeMatch) {
          initQtys[key] = 1;
          initImeis[key] = imeiPool.slice(0, 1);
          initRefunds[key] = effectiveUnitRefund;
        } else {
          initQtys[key] = remainingQty;
          initImeis[key] = imeiPool.slice(0, remainingQty);
          initRefunds[key] = remainingQty * effectiveUnitRefund;
        }
      } else {
        initSelected[key] = false;
        initQtys[key] = 1;
        initImeis[key] = [];
        initRefunds[key] = item.salePrice;
      }
    });

    setSelectedItemIds(initSelected);
    setReturnQtys(initQtys);
    setSelectedImeis(initImeis);
    setItemReasons(initReasons);
    setItemRefundAmounts(initRefunds);

    const isCreditSale = sale.invoiceType === 'credit';
    if (isCreditSale) {
      setRefundPaymentMethod('Credit Adjustment');
      setDeductFromKhata(true);
    } else {
      setRefundPaymentMethod('Cash');
      setDeductFromKhata(false);
    }
  };

  // Sync initial sale if provided
  useEffect(() => {
    if (isOpen && initialSale) {
      setSelectedSale(initialSale);
      initializeFormForSale(initialSale);
    } else if (isOpen && !initialSale) {
      setSelectedSale(null);
      setSearchQuery('');
    }
  }, [isOpen, initialSale]);

  const handleSelectSale = (sale: SaleRecord, scannedCode?: string) => {
    setSelectedSale(sale);
    initializeFormForSale(sale, scannedCode);
  };

  const handleScanCodeInReturn = (rawCode: string) => {
    const code = (rawCode || '').trim();
    if (!code) return;
    const lower = code.toLowerCase();

    // Case A: Already inside a selected invoice -> select matching IMEI/item
    if (selectedSale) {
      let hit = false;
      selectedSale.items.forEach((item, idx) => {
        const key = `${item.id}_${idx}`;
        const alreadyRet = item.returnedQty || 0;
        const remainingQty = Math.max(0, item.qty - alreadyRet);
        if (remainingQty <= 0) return;

        const imeis = extractItemImeis(item);
        const matchedImei = imeis.find(im => im.toLowerCase() === lower);
        const matchedBarcode = (item.barcode || '').trim().toLowerCase() === lower;

        if (matchedImei || matchedBarcode) {
          hit = true;
          setSelectedItemIds(prev => ({ ...prev, [key]: true }));
          if (matchedImei) {
            setSelectedImeis(prev => {
              const cur = prev[key] || [];
              const next = cur.includes(matchedImei) ? cur : [...cur, matchedImei];
              const targetQty = Math.min(remainingQty, Math.max(1, next.length));
              setReturnQtys(qPrev => ({ ...qPrev, [key]: targetQty }));
              setItemRefundAmounts(rPrev => ({ ...rPrev, [key]: targetQty * item.salePrice }));
              return { ...prev, [key]: next.slice(0, remainingQty) };
            });
          } else {
            setReturnQtys(qPrev => ({ ...qPrev, [key]: 1 }));
            setItemRefundAmounts(rPrev => ({ ...rPrev, [key]: item.salePrice }));
          }
          showToast(`Selected "${item.name}" (${code}) for return!`, 'success');
        }
      });
      if (!hit) {
        showToast(`Code "${code}" does not match any item in Invoice #${selectedSale.invNo}`, 'warning');
      }
      return;
    }

    // Case B: Step 1 -> find invoice by Inv #, IMEI, imeiRecords, or Barcode
    setSearchQuery(code);
    const activeSales = sales.filter(s => s.status !== 'CANCELLED');

    const byInv = activeSales.find(
      s => s.invNo.trim().toLowerCase() === lower || `#${s.invNo.trim().toLowerCase()}` === lower
    );
    if (byInv) {
      if (byInv.returnStatus === 'FULL') {
        showToast(`Invoice #${byInv.invNo} is already fully returned.`, 'warning');
        return;
      }
      handleSelectSale(byInv);
      showToast(`Invoice #${byInv.invNo} selected!`, 'success');
      return;
    }

    const byImeiSales = activeSales.filter(s =>
      s.items.some(it => extractItemImeis(it).some(im => im.toLowerCase() === lower))
    );
    if (byImeiSales.length > 0) {
      const openSale = byImeiSales.find(s => s.returnStatus !== 'FULL');
      if (!openSale) {
        showToast(`IMEI ${code} invoice is already fully returned.`, 'warning');
        return;
      }
      handleSelectSale(openSale, code);
      showToast(`Invoice #${openSale.invNo} matched for IMEI ${code}!`, 'success');
      return;
    }

    const imeiRecord = imeiRecords.find(r => r.imei.toLowerCase() === lower && r.invoiceNo);
    if (imeiRecord?.invoiceNo) {
      const recSale = activeSales.find(
        s => s.invNo.toLowerCase() === imeiRecord.invoiceNo!.toLowerCase()
      );
      if (recSale) {
        if (recSale.returnStatus === 'FULL') {
          showToast(`Invoice #${recSale.invNo} is already fully returned.`, 'warning');
          return;
        }
        handleSelectSale(recSale, code);
        showToast(`Invoice #${recSale.invNo} matched via IMEI ledger!`, 'success');
        return;
      }
    }

    const byBarcodeSales = activeSales.filter(
      s =>
        s.returnStatus !== 'FULL' &&
        s.items.some(it => (it.barcode || '').trim().toLowerCase() === lower)
    );
    if (byBarcodeSales.length === 1) {
      handleSelectSale(byBarcodeSales[0], code);
      showToast(`Invoice #${byBarcodeSales[0].invNo} matched for barcode ${code}!`, 'success');
      return;
    }

    if (byBarcodeSales.length > 1) {
      showToast(`Found ${byBarcodeSales.length} invoices with barcode ${code}. Select one below.`, 'info');
      return;
    }

    showToast(`No active sale invoice found for "${code}"`, 'warning');
  };

  // Filtered sales for search
  const filteredSales = useMemo(() => {
    const activeSales = sales.filter(s => s.status !== 'CANCELLED');
    if (!searchQuery.trim()) return activeSales.slice(0, 15);

    return smartFilterAndSort(activeSales, searchQuery, s => {
      const imeiStr = s.items.flatMap(i => extractItemImeis(i)).join(' ');
      const barcodesStr = s.items.map(i => i.barcode || '').join(' ');
      const itemNames = s.items.map(i => `${i.name} ${i.variantLabel || ''}`).join(' ');
      return {
        primary: [s.invNo, s.custName, s.custPhone],
        secondary: [itemNames, imeiStr, barcodesStr],
      };
    }).slice(0, 20);
  }, [sales, searchQuery]);

  const toggleItemSelection = (key: string) => {
    setSelectedItemIds(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleQtyChange = (key: string, qty: number | '', maxQty: number, unitSalePrice: number) => {
    if (qty === '') {
      setReturnQtys(prev => ({ ...prev, [key]: '' }));
      setItemRefundAmounts(prev => ({ ...prev, [key]: '' }));
      return;
    }
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

    let validationError: string | null = null;
    selectedSale.items.forEach((item, idx) => {
      if (validationError) return;
      const key = `${item.id}_${idx}`;
      if (selectedItemIds[key]) {
        const rawQty = returnQtys[key];
        const returnQty = rawQty === '' || rawQty === undefined ? 0 : Number(rawQty);
        if (returnQty < 1) {
          validationError = `Please enter a valid return quantity for "${item.name}"`;
          return;
        }
        const refundAmt = itemRefundAmounts[key] !== undefined && itemRefundAmounts[key] !== ''
          ? Number(itemRefundAmounts[key])
          : returnQty * item.salePrice;
        const reason = itemReasons[key] || overallReason;
        const chosenImeis = selectedImeis[key] || [];

        const availableImeis = item.imeis || (item.imei ? item.imei.split(',').map(s => s.trim()).filter(Boolean) : []);
        if (availableImeis.length > 0 && chosenImeis.length !== returnQty) {
          validationError = `Please select exactly ${returnQty} IMEI(s) for "${item.name}"`;
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
          variantId: item.variantId,
          variantLabel: item.variantLabel,
          returnReason: reason,
        });

        totalCostReversed += item.costPrice * returnQty;
      }
    });

    if (validationError) {
      showToast(validationError, 'warning');
      return;
    }

    if (returnItems.length === 0) {
      showToast('Please select at least one item to return', 'warning');
      return;
    }

    const netProfitDeducted = Math.max(0, totalRefund - totalCostReversed);
    const returnNo = generateNextReturnNumber(salesReturns);
    const willDeductFromKhata =
      refundPaymentMethod === 'Credit Adjustment' ||
      (deductFromKhata && Boolean(linkedKhataCustomer || selectedSale.invoiceType === 'credit'));
    const khataDeductedAmount = willDeductFromKhata ? totalRefund : 0;

    const returnRecord: SalesReturnRecord = {
      id: 'RET-' + Date.now(),
      returnNo,
      originalInvNo: selectedSale.invNo,
      customerName: selectedSale.custName,
      customerPhone: selectedSale.custPhone,
      khataCustomerId: linkedKhataCustomer?.id || selectedSale.khataCustomerId,
      khataDeductedAmount: khataDeductedAmount > 0 ? khataDeductedAmount : undefined,
      items: returnItems,
      totalRefundAmount: totalRefund,
      refundPaymentMethod,
      accountId: undefined,
      totalCostReversed,
      netProfitDeducted,
      reason: overallReason,
      returnDate,
      returnedBy,
      notes: notes.trim() || undefined,
    };

    onProcessReturn(returnRecord);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 glass-modal-backdrop">
      <div className="glass-modal-panel animate-modal-pop rounded-2xl max-w-2xl lg:max-w-3xl w-full p-4 sm:p-5 space-y-4 my-auto max-h-[82dvh] flex flex-col overflow-hidden">
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

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && searchQuery.trim()) {
                        e.preventDefault();
                        handleScanCodeInReturn(searchQuery);
                      }
                    }}
                    placeholder="Search or scan Invoice #, IMEI, Barcode, or Customer..."
                    className="compact-mobile-input w-full pl-9 pr-20 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-amber-500 focus:bg-white"
                  />
                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                        title="Clear"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsScannerOpen(true)}
                      className="h-7 px-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[11px] font-extrabold flex items-center gap-1 shadow-xs transition cursor-pointer"
                      title="Scan Product Barcode or 15-Digit IMEI"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>Scan</span>
                    </button>
                  </div>
                </div>
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
                              {sale.invoiceType === 'credit' ? 'Credit' : 'Cash'}
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
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-xs font-bold text-slate-800">
                    Select Product(s) to Return & Adjust Quantity
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsScannerOpen(true)}
                    className="h-7 px-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer shadow-2xs shrink-0"
                    title="Scan IMEI or Barcode from this invoice"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Scan IMEI</span>
                  </button>
                </div>

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
                                    placeholder="Qty"
                                    onChange={e => handleQtyChange(key, e.target.value === '' ? '' : parseInt(e.target.value, 10) || 1, remainingQty, item.salePrice)}
                                    className="allow-spinner w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500"
                                  />
                                </div>

                                {/* Refund Amount */}
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                    Refund Amount ({currency})
                                  </label>
                                  <input
                                    type="number"
                                    value={itemRefundAmounts[key] !== undefined ? itemRefundAmounts[key] : (Number(curQty) || 0) * item.salePrice}
                                    placeholder="Refund amount"
                                    onChange={e => setItemRefundAmounts(prev => ({
                                      ...prev,
                                      [key]: e.target.value === '' ? '' : Number(e.target.value),
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
                                            className={`px-2.5 py-1 rounded-md text-[11px] tabular-nums font-bold transition cursor-pointer border ${
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
                    Refund Settlement
                  </label>
                  {(selectedSale.invoiceType === 'credit' || linkedKhataCustomer) ? (
                    <select
                      value={refundPaymentMethod === 'Credit Adjustment' ? 'Credit Adjustment' : 'Cash'}
                      onChange={e => {
                        const nextMethod = e.target.value as PaymentMethod;
                        setRefundPaymentMethod(nextMethod);
                        setDeductFromKhata(nextMethod === 'Credit Adjustment');
                      }}
                      className="compact-mobile-input w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-amber-500"
                    >
                      <option value="Credit Adjustment">
                        Credit / Khata Account Adjustment (Deduct Udhar)
                      </option>
                      <option value="Cash">Cash Return (Cash In Hand)</option>
                    </select>
                  ) : (
                    <div className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-emerald-700">
                      Cash Return (Cash In Hand)
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

              {/* Linked Customer Credit / Khata Deduction Preview */}
              {(linkedKhataCustomer || selectedSale.invoiceType === 'credit') && (
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={refundPaymentMethod === 'Credit Adjustment' ? true : deductFromKhata}
                      disabled={refundPaymentMethod === 'Credit Adjustment'}
                      onChange={e => setDeductFromKhata(e.target.checked)}
                      className="mt-0.5 rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                    />
                    <div>
                      <span className="font-extrabold text-purple-950 block">
                        Deduct from Customer Credit / Khata Account
                      </span>
                      <span className="text-[11px] text-purple-700">
                        {linkedKhataCustomer
                          ? `${linkedKhataCustomer.name} • Current Udhar: ${currency} ${linkedKhataCustomer.balance.toLocaleString()}`
                          : `Credit Invoice Customer: ${selectedSale.custName}`}
                        {refundPaymentMethod === 'Credit Adjustment'
                          ? ' (No cash leaves drawer)'
                          : ''}
                      </span>
                    </div>
                  </label>
                  {linkedKhataCustomer && (refundPaymentMethod === 'Credit Adjustment' || deductFromKhata) && (
                    <div className="text-left sm:text-right shrink-0 bg-white px-2.5 py-1.5 rounded-lg border border-purple-200 tabular-nums">
                      <span className="block text-[9.5px] font-bold uppercase text-purple-600">
                        New Khata Balance
                      </span>
                      <span className="font-black text-purple-900">
                        {currency} {Math.max(0, linkedKhataCustomer.balance - totalRefund).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Total Refund Banner */}
              <div className="p-3.5 bg-amber-500 text-white rounded-xl flex items-center justify-between shadow-md shadow-amber-500/20">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-bold opacity-90">
                      {refundPaymentMethod === 'Credit Adjustment'
                        ? 'Total Credit Deducted from Khata'
                        : 'Total Refund to Customer'}
                    </p>
                    <p className="text-lg font-black leading-tight">
                      {currency} {totalRefund.toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="text-right text-[11px] opacity-90">
                  <p>Stock &amp; IMEIs restored instantly</p>
                  <p>
                    {refundPaymentMethod === 'Credit Adjustment' || (deductFromKhata && linkedKhataCustomer)
                      ? 'Khata balance & return reason updated'
                      : 'Sale return recorded'}
                  </p>
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

      {/* Live Barcode / IMEI Camera Scanner for Sales Return */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleScanCodeInReturn}
        title="Scan Returned Phone IMEI or Barcode"
        placeholder="Scan IMEI or product barcode to find sale..."
      />
    </>
  );
};

export default SalesReturnModal;
