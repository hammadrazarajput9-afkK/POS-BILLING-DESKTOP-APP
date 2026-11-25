import React, { useMemo, useState } from 'react';
import { SupplierPurchase } from '../types';
import {
  ArrowLeft,
  Building2,
  Phone,
  Plus,
  Search,
  X,
  Calendar,
  Package,
  CreditCard,
  Eye,
  Edit2,
  Download,
  MessageCircle,
  RotateCcw,
  Camera,
  Lock,
  Smartphone,
  Barcode,
  FileText,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { smartMatch } from '../utils/smartSearch';

export interface SupplierAccountSummary {
  key: string;
  partyName: string;
  partyPhone?: string;
  bills: SupplierPurchase[];
  activeBillsCount: number;
  reversedBillsCount: number;
  totalUnits: number;
  totalAmount: number;
  totalPaid: number;
  totalDue: number;
  latestDate: string;
}

interface SupplierAccountModalProps {
  account: SupplierAccountSummary | null;
  isOpen: boolean;
  onClose: () => void;
  currency: string;
  isAdmin: boolean;
  canSalesmanEditPurchase: (p: SupplierPurchase) => boolean;
  onAddInwardForSupplier: (partyName: string, partyPhone?: string) => void;
  onViewBill: (p: SupplierPurchase) => void;
  onEditBill: (p: SupplierPurchase) => void;
  onDownloadPdf: (p: SupplierPurchase) => void;
  onShareWhatsApp: (p: SupplierPurchase) => void;
  onPayBillDue: (p: SupplierPurchase) => void;
  onReverseBill: (p: SupplierPurchase) => void;
  onZoomImage: (img: string) => void;
  onSettlePurchaseDue?: (params: {
    purchaseId: string;
    paymentAmount: number;
    paymentMethod: string;
    notes?: string;
  }) => void;
}

type AccountSubTab = 'bills' | 'items';
type BillFilterStatus = 'ALL' | 'ACTIVE' | 'DUE' | 'PAID' | 'REVERSED';

export const SupplierAccountModal: React.FC<SupplierAccountModalProps> = ({
  account,
  isOpen,
  onClose,
  currency,
  isAdmin,
  canSalesmanEditPurchase,
  onAddInwardForSupplier,
  onViewBill,
  onEditBill,
  onDownloadPdf,
  onShareWhatsApp,
  onPayBillDue,
  onReverseBill,
  onZoomImage,
  onSettlePurchaseDue,
}) => {
  const [activeTab, setActiveTab] = useState<AccountSubTab>('bills');
  const [searchQuery, setSearchQuery] = useState('');
  const [billStatusFilter, setBillStatusFilter] = useState<BillFilterStatus>('ALL');

  // Account-level FIFO Settlement Modal State
  const [isSettleAccountOpen, setIsSettleAccountOpen] = useState(false);
  const [accountSettleAmount, setAccountSettleAmount] = useState<number | ''>('');
  const [accountSettleNotes, setAccountSettleNotes] = useState('');

  const bills = account?.bills || [];

  const filteredBills = useMemo(() => {
    const q = searchQuery.trim();
    return bills.filter(p => {
      const isReversed = p.status === 'REVERSED';
      const matchesFilter =
        billStatusFilter === 'ALL'
          ? true
          : billStatusFilter === 'ACTIVE'
          ? !isReversed
          : billStatusFilter === 'REVERSED'
          ? isReversed
          : billStatusFilter === 'PAID'
          ? !isReversed && (p.balanceDue || 0) <= 0
          : !isReversed && (p.balanceDue || 0) > 0;

      if (!matchesFilter) return false;
      if (!q) return true;

      const itemsText = (p.items || [])
        .map(it => {
          const imeisStr = [it.imei || '', ...(it.imeis || [])].join(' ');
          return `${it.name} ${it.category || ''} ${it.ram || ''} ${it.storage || ''} ${it.color || ''} ${it.barcode || ''} ${it.note || ''} ${imeisStr}`;
        })
        .join(' ');

      return smartMatch(q, [p.billNo, p.date, itemsText], [p.notes]);
    });
  }, [bills, searchQuery, billStatusFilter]);

  const flatItemEntries = useMemo(() => {
    const q = searchQuery.trim();
    const list: Array<{
      billId: string;
      billNo: string;
      date: string;
      isReversed: boolean;
      name: string;
      category: string;
      qty: number;
      ram?: string;
      storage?: string;
      color?: string;
      costPrice: number;
      salePrice: number;
      imeis: string[];
      barcode?: string;
      note?: string;
      billRef: SupplierPurchase;
    }> = [];

    bills.forEach(p => {
      const isReversed = p.status === 'REVERSED';
      (p.items || []).forEach(it => {
        const cleanImeis =
          it.imeis && it.imeis.length > 0
            ? it.imeis.filter(Boolean)
            : it.imei
            ? it.imei.split(',').map(s => s.trim()).filter(Boolean)
            : [];

        const entry = {
          billId: p.id,
          billNo: p.billNo,
          date: p.date,
          isReversed,
          name: it.name,
          category: it.category,
          qty: it.qty || 0,
          ram: it.ram,
          storage: it.storage,
          color: it.color,
          costPrice: it.costPrice || 0,
          salePrice: it.salePrice || 0,
          imeis: cleanImeis,
          barcode: it.barcode,
          note: it.note,
          billRef: p,
        };

        if (
          !q ||
          smartMatch(
            q,
            [
              entry.name,
              entry.category,
              entry.billNo,
              entry.imeis.join(' '),
              entry.barcode,
            ],
            [entry.ram, entry.storage, entry.color, entry.note]
          )
        ) {
          list.push(entry);
        }
      });
    });

    return list;
  }, [bills, searchQuery]);

  const unpaidActiveBills = useMemo(() => {
    return bills
      .filter(b => b.status !== 'REVERSED' && (b.balanceDue || 0) > 0)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [bills]);

  if (!isOpen || !account) return null;

  const cleanPhoneForWhatsApp = (() => {
    const raw = (account.partyPhone || '').replace(/[^0-9]/g, '');
    if (!raw) return '';
    return raw.startsWith('0') ? '92' + raw.substring(1) : raw;
  })();

  const handleOpenAccountSettle = () => {
    setAccountSettleAmount(account.totalDue);
    setAccountSettleNotes('');
    setIsSettleAccountOpen(true);
  };

  const handleConfirmAccountSettle = () => {
    if (!onSettlePurchaseDue) return;
    let remaining = Number(accountSettleAmount) || 0;
    if (remaining <= 0) return;

    for (const bill of unpaidActiveBills) {
      if (remaining <= 0) break;
      const due = bill.balanceDue || 0;
      if (due <= 0) continue;
      const payNow = Math.min(remaining, due);
      onSettlePurchaseDue({
        purchaseId: bill.id,
        paymentAmount: payNow,
        paymentMethod: 'Cash',
        notes: accountSettleNotes.trim() || undefined,
      });
      remaining -= payNow;
    }
    setIsSettleAccountOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[45] bg-slate-50 flex flex-col overflow-hidden animate-in fade-in pb-[env(safe-area-inset-bottom,0px)]">
      <div className="bg-white w-full h-full flex flex-col overflow-hidden">
        {/* Top Full-Screen Supplier Header */}
        <div className="app-fullscreen-modal-header bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 px-3 sm:px-5 pt-[calc(env(safe-area-inset-top,0px)+0.85rem)] sm:pt-2.5 pb-3 text-white shrink-0">
          {/* Top Navigation Bar */}
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/15 mb-2.5">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-white/15 hover:bg-white/25 text-white font-bold text-xs transition cursor-pointer shrink-0"
              aria-label="Back to Suppliers List"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>

            <span className="text-[11px] font-bold text-slate-300 truncate hidden sm:inline">
              Supplier Account • {account.partyName}
            </span>

            <div className="flex items-center gap-1.5 shrink-0">
              {isAdmin && account.totalDue > 0 && onSettlePurchaseDue && (
                <button
                  type="button"
                  onClick={handleOpenAccountSettle}
                  className="h-8 px-2.5 sm:px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[11px] sm:text-xs shadow-sm transition flex items-center gap-1 cursor-pointer"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Pay Due</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onAddInwardForSupplier(account.partyName, account.partyPhone)}
                className="h-8 px-2.5 sm:px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-[11px] sm:text-xs shadow-sm transition flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Stock Inward</span>
              </button>
            </div>
          </div>

          {/* Supplier Identity Row */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl border border-white/20 bg-white/10 flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-blue-300" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h2 className="text-sm sm:text-lg font-extrabold tracking-tight leading-snug truncate">
                    {account.partyName}
                  </h2>
                  <span className="text-[10px] font-bold text-blue-200 bg-white/10 px-1.5 py-0.5 rounded border border-white/15 tabular-nums">
                    {account.activeBillsCount} Active Bill{account.activeBillsCount === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] sm:text-xs text-slate-200 mt-0.5">
                  {isAdmin && account.partyPhone ? (
                    <a
                      href={`tel:${account.partyPhone.replace(/[^0-9+]/g, '')}`}
                      className="flex items-center gap-1 hover:text-white transition font-semibold tabular-nums"
                    >
                      <Phone className="w-3 h-3 text-emerald-400" />
                      {account.partyPhone}
                    </a>
                  ) : (
                    <span className="text-slate-300 text-[11px]">
                      Unified Supplier Account &amp; Stock Inward History
                    </span>
                  )}

                  {isAdmin && cleanPhoneForWhatsApp && (
                    <a
                      href={`https://wa.me/${cleanPhoneForWhatsApp}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-emerald-300 hover:text-emerald-200 font-bold text-[11px]"
                    >
                      <MessageCircle className="w-3 h-3" />
                      WhatsApp
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Account KPI Cards */}
          {isAdmin ? (
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2.5 mt-2.5 pt-2.5 border-t border-white/10">
              <div className="bg-white/10 rounded-lg sm:rounded-xl p-1.5 sm:p-2.5 min-w-0">
                <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-300 block truncate">
                  Payable Due
                </span>
                <p
                  className={`text-[11px] sm:text-base font-extrabold tabular-nums mt-0.5 truncate ${
                    account.totalDue > 0 ? 'text-amber-300' : 'text-emerald-300'
                  }`}
                >
                  {currency} {account.totalDue.toLocaleString()}
                </p>
              </div>

              <div className="bg-white/10 rounded-lg sm:rounded-xl p-1.5 sm:p-2.5 min-w-0">
                <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-300 block truncate">
                  Total Stock
                </span>
                <p className="text-[11px] sm:text-base font-extrabold tabular-nums text-white mt-0.5 truncate">
                  {currency} {account.totalAmount.toLocaleString()}
                </p>
              </div>

              <div className="bg-white/10 rounded-lg sm:rounded-xl p-1.5 sm:p-2.5 min-w-0">
                <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-300 block truncate">
                  Total Paid
                </span>
                <p className="text-[11px] sm:text-base font-extrabold tabular-nums text-emerald-300 mt-0.5 truncate">
                  {currency} {account.totalPaid.toLocaleString()}
                </p>
              </div>

              <div className="bg-white/10 rounded-lg sm:rounded-xl p-1.5 sm:p-2.5 min-w-0">
                <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-300 block truncate">
                  Units
                </span>
                <p className="text-[11px] sm:text-base font-extrabold tabular-nums text-blue-200 mt-0.5 truncate">
                  {account.totalUnits.toLocaleString()} pcs
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 mt-2.5 pt-2.5 border-t border-white/10">
              <div className="bg-white/10 rounded-lg p-2 min-w-0">
                <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-300 block truncate">
                  Stock Inward Entries
                </span>
                <p className="text-sm sm:text-base font-extrabold tabular-nums text-white mt-0.5">
                  {account.bills.length}
                </p>
              </div>
              <div className="bg-white/10 rounded-lg p-2 min-w-0">
                <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-300 block truncate">
                  Total Units Received
                </span>
                <p className="text-sm sm:text-base font-extrabold tabular-nums text-blue-200 mt-0.5">
                  {account.totalUnits.toLocaleString()} pcs
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Account Sub-Tabs */}
        <div className="bg-white border-b border-slate-200 px-3 sm:px-5 py-2 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('bills')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                activeTab === 'bills'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Inward Bills ({account.bills.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('items')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                activeTab === 'items'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Products &amp; IMEIs
            </button>
          </div>

          <button
            type="button"
            onClick={() => onAddInwardForSupplier(account.partyName, account.partyPhone)}
            className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-extrabold transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add New Stock Inward</span>
          </button>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="bg-white border-b border-slate-100 px-3 sm:px-5 py-2.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shrink-0">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search bill #, model, IMEI, RAM/ROM, note inside this account..."
              className="w-full pl-8 pr-8 h-8 sm:h-9 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-blue-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {activeTab === 'bills' && (
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px] font-bold overflow-x-auto no-scrollbar shrink-0">
              {(isAdmin
                ? (['ALL', 'ACTIVE', 'DUE', 'PAID', 'REVERSED'] as const)
                : (['ALL', 'ACTIVE', 'REVERSED'] as const)
              ).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setBillStatusFilter(f)}
                  className={`px-2.5 py-1 rounded-md transition cursor-pointer whitespace-nowrap ${
                    billStatusFilter === f
                      ? 'bg-white text-blue-600 shadow-2xs font-extrabold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {f === 'ALL'
                    ? 'All'
                    : f === 'ACTIVE'
                    ? 'Active'
                    : f === 'DUE'
                    ? 'Due'
                    : f === 'PAID'
                    ? 'Paid'
                    : 'Reversed'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Scrollable Content Workspace */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-2.5 bg-slate-50">
          {activeTab === 'bills' ? (
            filteredBills.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-2">
                <Package className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-slate-700">No Matching Bills in {account.partyName}</p>
                <p className="text-xs text-slate-400">
                  Adjust filters or add a new stock inward entry directly into this supplier&apos;s account.
                </p>
              </div>
            ) : (
              filteredBills.map(p => {
                const isReversed = p.status === 'REVERSED';
                const isFullyPaid = (p.balanceDue || 0) <= 0;
                const totalUnits = (p.items || []).reduce((sum, i) => sum + (i.qty || 0), 0);
                const salesmanCanEdit = !isAdmin && canSalesmanEditPurchase(p);
                const salesmanAlreadyEdited =
                  !isAdmin &&
                  !isReversed &&
                  p.createdByRole === 'salesman' &&
                  (p.salesmanEditCount || 0) >= 1;

                return (
                  <div
                    key={p.id}
                    className={`bg-white border rounded-xl p-3 space-y-2.5 shadow-2xs transition ${
                      isReversed ? 'border-rose-200 bg-rose-50/20' : 'border-slate-200'
                    }`}
                  >
                    {/* Card Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-black text-xs sm:text-sm text-slate-900 tabular-nums">
                            #{p.billNo}
                          </span>
                          {isReversed ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-rose-600 text-white">
                              REVERSED
                            </span>
                          ) : isAdmin && isFullyPaid ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-100 text-emerald-800 inline-flex items-center gap-0.5">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              PAID
                            </span>
                          ) : isAdmin ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-rose-100 text-rose-800 inline-flex items-center gap-0.5">
                              <AlertCircle className="w-2.5 h-2.5" />
                              DUE
                            </span>
                          ) : null}
                          <span className="text-[11px] text-slate-500 font-semibold tabular-nums inline-flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            {new Date(p.date).toLocaleDateString()}
                          </span>
                        </div>

                        <p className="text-[11px] text-slate-500 font-medium">
                          {p.items?.length || 0} product line(s) • <strong className="text-slate-700">{totalUnits} units</strong>
                        </p>
                      </div>

                      {isAdmin ? (
                        <div className="text-right shrink-0">
                          <p className={`text-xs sm:text-sm font-black tabular-nums ${isReversed ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                            {currency} {(p.totalAmount || 0).toLocaleString()}
                          </p>
                          {!isReversed && (
                            <div className="text-[10px] tabular-nums space-y-0.5">
                              <span className="text-emerald-700 font-bold block">
                                Paid: {currency} {(p.paidAmount || 0).toLocaleString()}
                              </span>
                              {(p.balanceDue || 0) > 0 && (
                                <span className="text-rose-600 font-extrabold block">
                                  Due: {currency} {(p.balanceDue || 0).toLocaleString()}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-extrabold text-[11px] tabular-nums shrink-0">
                          {totalUnits} pcs
                        </span>
                      )}
                    </div>

                    {/* Itemized Preview Inside Supplier Bill Card */}
                    <div className="bg-slate-50/90 border border-slate-200/70 rounded-lg p-2 space-y-1.5">
                      {(p.items || []).map((it, idx) => {
                        const specs = [it.ram, it.storage, it.color].filter(Boolean).join(' / ');
                        const imeis =
                          it.imeis && it.imeis.length > 0
                            ? it.imeis.filter(Boolean)
                            : it.imei
                            ? it.imei.split(',').map(s => s.trim()).filter(Boolean)
                            : [];
                        return (
                          <div
                            key={idx}
                            className="text-[11px] pb-1 last:pb-0 border-b last:border-b-0 border-slate-200/70"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0 font-bold text-slate-800 truncate">
                                {it.name}
                                {specs && (
                                  <span className="text-[10px] font-semibold text-indigo-600 ml-1">
                                    ({specs})
                                  </span>
                                )}
                              </div>
                              <div className="shrink-0 tabular-nums font-bold text-slate-700">
                                {it.qty} pcs
                                {isAdmin && (
                                  <span className="text-slate-500 font-semibold ml-1.5">
                                    @ {currency} {(it.costPrice || 0).toLocaleString()}
                                  </span>
                                )}
                              </div>
                            </div>
                            {imeis.length > 0 && (
                              <div className="text-[10px] text-slate-500 tabular-nums mt-0.5 break-all">
                                IMEI: {imeis.join(', ')}
                              </div>
                            )}
                            {it.barcode && (
                              <div className="text-[10px] text-slate-500 tabular-nums mt-0.5">
                                Code: {it.barcode}
                              </div>
                            )}
                            {it.note && (
                              <div className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200/70 rounded px-1.5 py-0.5 mt-0.5 inline-block font-medium">
                                Note: {it.note}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {p.notes && (
                      <div className="text-[11px] text-slate-600 bg-blue-50/50 border border-blue-100 rounded-lg px-2.5 py-1.5 whitespace-pre-line">
                        {p.notes}
                      </div>
                    )}

                    {/* Action Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-slate-100 text-[11px]">
                      <div className="flex items-center gap-1">
                        {p.invoiceImage && (
                          <button
                            type="button"
                            onClick={() => onZoomImage(p.invoiceImage!)}
                            className="h-7 px-2 bg-blue-50 text-blue-700 font-bold rounded-lg text-[10px] flex items-center gap-1 border border-blue-200 cursor-pointer"
                          >
                            <Camera className="w-3 h-3" />
                            <span>Photo</span>
                          </button>
                        )}
                        {isAdmin && !isReversed && (p.balanceDue || 0) > 0 && (
                          <button
                            type="button"
                            onClick={() => onPayBillDue(p)}
                            className="h-7 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[10px] flex items-center gap-1 cursor-pointer"
                          >
                            <CreditCard className="w-3 h-3" />
                            <span>Pay Due</span>
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onViewBill(p)}
                          className="h-7 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg text-[11px] flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3 h-3" />
                          <span>View</span>
                        </button>

                        {!isReversed && (isAdmin || salesmanCanEdit) && (
                          <button
                            type="button"
                            onClick={() => onEditBill(p)}
                            className="h-7 px-2 text-indigo-600 hover:bg-indigo-50 rounded-lg border border-indigo-200 flex items-center justify-center gap-1 cursor-pointer font-bold text-[11px]"
                            title={isAdmin ? 'Edit Bill' : 'Edit Stock Inward (1 edit allowed)'}
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>{isAdmin ? 'Edit' : 'Edit (1x)'}</span>
                          </button>
                        )}

                        {salesmanAlreadyEdited && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 font-semibold bg-slate-100 px-2 h-7 rounded-lg">
                            <Lock className="w-3 h-3" />
                            Edited
                          </span>
                        )}

                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => onDownloadPdf(p)}
                            className="h-7 w-7 text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 flex items-center justify-center cursor-pointer"
                            title="Download Bill PDF"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => onShareWhatsApp(p)}
                            className="h-7 w-7 text-emerald-600 hover:bg-emerald-50 rounded-lg border border-emerald-200 flex items-center justify-center cursor-pointer"
                            title="Share on WhatsApp"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {isAdmin && !isReversed && (
                          <button
                            type="button"
                            onClick={() => onReverseBill(p)}
                            className="h-7 w-7 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition border border-slate-200 flex items-center justify-center cursor-pointer"
                            title="Reverse Bill"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )
          ) : flatItemEntries.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-2">
              <Smartphone className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-700">No Matching Products or IMEIs</p>
              <p className="text-xs text-slate-400">
                Try another model name, IMEI number, or bill reference.
              </p>
            </div>
          ) : (
            flatItemEntries.map((entry, idx) => (
              <div
                key={`${entry.billId}-${idx}`}
                className={`bg-white border rounded-xl p-3 space-y-1.5 shadow-2xs ${
                  entry.isReversed ? 'border-rose-200 bg-rose-50/20' : 'border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-extrabold text-xs sm:text-sm text-slate-900">
                        {entry.name}
                      </span>
                      {(entry.ram || entry.storage || entry.color) && (
                        <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                          {[entry.ram, entry.storage, entry.color].filter(Boolean).join(' / ')}
                        </span>
                      )}
                      {entry.isReversed && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-rose-600 text-white">
                          REVERSED
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                      Bill #{entry.billNo} • {new Date(entry.date).toLocaleDateString()} • {entry.category}
                    </p>
                  </div>

                  <div className="text-right shrink-0 tabular-nums">
                    <span className="text-xs font-black text-blue-700 block">
                      {entry.qty} pcs
                    </span>
                    {isAdmin && (
                      <span className="text-[11px] font-bold text-slate-700">
                        Cost: {currency} {entry.costPrice.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>

                {entry.imeis.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {entry.imeis.map((im, imIdx) => (
                      <span
                        key={imIdx}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-800 border border-blue-200/70 rounded text-[10px] font-bold tabular-nums"
                      >
                        <Smartphone className="w-2.5 h-2.5" />
                        {im}
                      </span>
                    ))}
                  </div>
                )}

                {entry.barcode && (
                  <div className="inline-flex items-center gap-1 text-[10px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded font-semibold tabular-nums">
                    <Barcode className="w-3 h-3" />
                    {entry.barcode}
                  </div>
                )}

                {entry.note && (
                  <div className="flex items-center gap-1 text-[10px] text-amber-800 bg-amber-50 border border-amber-200/70 rounded px-2 py-0.5 font-medium">
                    <FileText className="w-3 h-3 shrink-0" />
                    <span>{entry.note}</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Account-Level Pay Supplier Due Modal (Distributes FIFO across oldest unpaid bills) */}
      {isSettleAccountOpen && isAdmin && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-4 sm:p-5 shadow-2xl space-y-4 border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">Pay Supplier Account Due</h3>
                  <p className="text-[11px] text-slate-400">
                    {account.partyName} • {unpaidActiveBills.length} unpaid bill(s)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSettleAccountOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-1 text-xs">
              <div className="flex items-center justify-between text-slate-600 font-bold">
                <span>Total Purchased:</span>
                <span className="tabular-nums text-slate-900">{currency} {account.totalAmount.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-emerald-700 font-bold">
                <span>Total Paid:</span>
                <span className="tabular-nums">{currency} {account.totalPaid.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-rose-600 font-extrabold pt-1 border-t border-slate-200">
                <span>Total Account Due:</span>
                <span className="tabular-nums text-sm">{currency} {account.totalDue.toLocaleString()}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Payment Amount ({currency}):
                </label>
                <input
                  type="number"
                  min={1}
                  max={account.totalDue}
                  value={accountSettleAmount}
                  onChange={e =>
                    setAccountSettleAmount(e.target.value === '' ? '' : Math.min(account.totalDue, Number(e.target.value)))
                  }
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm tabular-nums font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Notes / Remarks (Optional):
                </label>
                <input
                  type="text"
                  value={accountSettleNotes}
                  onChange={e => setAccountSettleNotes(e.target.value)}
                  placeholder="e.g. Account payment receipt #..."
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:border-emerald-600"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsSettleAccountOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAccountSettle}
                disabled={!accountSettleAmount || Number(accountSettleAmount) <= 0}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-extrabold rounded-xl transition cursor-pointer shadow-md shadow-emerald-600/20"
              >
                Confirm Account Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
