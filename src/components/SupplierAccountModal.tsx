import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { SupplierPurchase } from '../types';
import {
  ArrowLeft,
  Phone,
  Plus,
  Search,
  X,
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
  MoreVertical,
} from 'lucide-react';
import { smartMatch } from '../utils/smartSearch';
import { cleanWhatsAppPhone, formatLedgerTimestamp, getInitials } from '../utils/ledgerFormatters';

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
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);

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

  useEffect(() => {
    if (!isOpen || !isSettleAccountOpen) {
      delete document.body.dataset.supplierSettleOpen;
      return;
    }
    document.body.dataset.supplierSettleOpen = '1';
    const handleHardwareBack = (e: Event) => {
      e.preventDefault();
      setIsSettleAccountOpen(false);
    };
    window.addEventListener('pos-hardware-back', handleHardwareBack);
    return () => {
      delete document.body.dataset.supplierSettleOpen;
      window.removeEventListener('pos-hardware-back', handleHardwareBack);
    };
  }, [isOpen, isSettleAccountOpen]);

  if (!isOpen || !account) return null;

  const cleanPhoneForWhatsApp = cleanWhatsAppPhone(account.partyPhone || '');

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

  const modalContent = (
    <div className="fixed inset-0 z-50 h-[100dvh] bg-slate-50 flex flex-col overflow-hidden animate-tab-enter">
      {/* Top Blue Header */}
      <div className="app-fullscreen-modal-header bg-blue-600 text-white px-3 sm:px-5 pt-[calc(env(safe-area-inset-top,0px)+0.85rem)] pb-11 shrink-0 relative">
        <div className="flex items-center justify-between gap-2 max-w-5xl mx-auto">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 -ml-1 rounded-full hover:bg-white/15 flex items-center justify-center transition cursor-pointer shrink-0"
              aria-label="Back to Stock Inward"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="w-9 h-9 rounded-full bg-white text-blue-700 font-black text-xs flex items-center justify-center shrink-0 shadow-2xs">
              {getInitials(account.partyName)}
            </div>

            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold tracking-tight truncate">
                {account.partyName}
              </h2>
              <p className="text-[11px] text-blue-100 font-medium truncate tabular-nums">
                {account.activeBillsCount} Active Bill{account.activeBillsCount === 1 ? '' : 's'} ·{' '}
                {account.totalUnits.toLocaleString()} pcs
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {isAdmin && account.partyPhone && (
              <a
                href={`tel:${account.partyPhone.replace(/[^0-9+]/g, '')}`}
                className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center transition"
                title={`Call ${account.partyPhone}`}
              >
                <Phone className="w-4 h-4" />
              </a>
            )}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowHeaderMenu(prev => !prev)}
                className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center transition cursor-pointer"
                aria-label="Supplier options"
              >
                <MoreVertical className="w-4.5 h-4.5" />
              </button>

              {showHeaderMenu && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setShowHeaderMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white text-slate-800 rounded-xl shadow-xl border border-slate-200 py-1.5 z-30 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => {
                        setShowHeaderMenu(false);
                        onAddInwardForSupplier(account.partyName, account.partyPhone);
                      }}
                      className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                    >
                      <Plus className="w-4 h-4 text-blue-600" /> Add Stock Inward
                    </button>
                    {isAdmin && account.totalDue > 0 && onSettlePurchaseDue && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowHeaderMenu(false);
                          handleOpenAccountSettle();
                        }}
                        className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                      >
                        <CreditCard className="w-4 h-4 text-rose-600" /> Pay Supplier Due
                      </button>
                    )}
                    {isAdmin && cleanPhoneForWhatsApp && (
                      <a
                        href={`https://wa.me/${cleanPhoneForWhatsApp}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setShowHeaderMenu(false)}
                        className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center gap-2"
                      >
                        <MessageCircle className="w-4 h-4 text-emerald-600" /> Chat on WhatsApp
                      </a>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Overlapping White Balance Card */}
      <div className="-mt-8 px-3 sm:px-5 shrink-0 relative z-10">
        <div className="max-w-5xl mx-auto bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
          {isAdmin ? (
            <div className="px-4 py-3 flex items-center justify-between gap-2 border-b border-slate-100">
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-700">
                  {account.totalDue > 0 ? 'Payable Balance' : 'Account Settled'}
                </p>
                <p className="text-[11px] text-slate-400 tabular-nums truncate mt-0.5">
                  Purchased: {currency} {account.totalAmount.toLocaleString()} · Paid:{' '}
                  {currency} {account.totalPaid.toLocaleString()}
                </p>
              </div>

              <div className="text-right shrink-0">
                <p
                  className={`text-lg sm:text-xl font-extrabold tabular-nums leading-tight ${
                    account.totalDue > 0 ? 'text-rose-600' : 'text-emerald-600'
                  }`}
                >
                  {currency} {account.totalDue.toLocaleString()}
                </p>
                <p className="text-[10px] font-semibold text-slate-400">
                  {account.totalDue > 0 ? "You'll Give" : 'Cleared'}
                </p>
              </div>
            </div>
          ) : (
            <div className="px-4 py-3 flex items-center justify-between gap-2 border-b border-slate-100">
              <div>
                <p className="text-xs font-bold text-slate-700">Total Stock Received</p>
                <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                  {account.bills.length} Stock Inward Entries
                </p>
              </div>
              <p className="text-lg font-extrabold text-blue-600 tabular-nums">
                {account.totalUnits.toLocaleString()} pcs
              </p>
            </div>
          )}

          {/* Action Icon Strip */}
          <div className={`grid ${isAdmin ? 'grid-cols-4' : 'grid-cols-2'} divide-x divide-slate-100 py-2`}>
            <button
              type="button"
              onClick={() => onAddInwardForSupplier(account.partyName, account.partyPhone)}
              className="flex flex-col items-center justify-center gap-1 py-1 hover:bg-slate-50 transition cursor-pointer"
            >
              <Plus className="w-4 h-4 text-blue-600" />
              <span className="text-[11px] font-bold text-slate-700">New Inward</span>
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  if (account.totalDue > 0 && onSettlePurchaseDue) {
                    handleOpenAccountSettle();
                  }
                }}
                disabled={account.totalDue <= 0}
                className="flex flex-col items-center justify-center gap-1 py-1 hover:bg-slate-50 transition cursor-pointer disabled:opacity-45"
              >
                <CreditCard className="w-4 h-4 text-rose-600" />
                <span className="text-[11px] font-bold text-slate-700">Pay Due</span>
              </button>
            )}

            {isAdmin && (
              <a
                href={cleanPhoneForWhatsApp ? `https://wa.me/${cleanPhoneForWhatsApp}` : '#'}
                target={cleanPhoneForWhatsApp ? '_blank' : undefined}
                rel={cleanPhoneForWhatsApp ? 'noopener noreferrer' : undefined}
                onClick={e => {
                  if (!cleanPhoneForWhatsApp) e.preventDefault();
                }}
                className={`flex flex-col items-center justify-center gap-1 py-1 hover:bg-slate-50 transition ${
                  !cleanPhoneForWhatsApp ? 'opacity-45 pointer-events-none' : ''
                }`}
              >
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                <span className="text-[11px] font-bold text-slate-700">WhatsApp</span>
              </a>
            )}

            {isAdmin ? (
              <a
                href={account.partyPhone ? `tel:${account.partyPhone.replace(/[^0-9+]/g, '')}` : '#'}
                onClick={e => {
                  if (!account.partyPhone) e.preventDefault();
                }}
                className={`flex flex-col items-center justify-center gap-1 py-1 hover:bg-slate-50 transition ${
                  !account.partyPhone ? 'opacity-45 pointer-events-none' : ''
                }`}
              >
                <Phone className="w-4 h-4 text-slate-700" />
                <span className="text-[11px] font-bold text-slate-700">Call</span>
              </a>
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab(activeTab === 'bills' ? 'items' : 'bills')}
                className="flex flex-col items-center justify-center gap-1 py-1 hover:bg-slate-50 transition cursor-pointer"
              >
                <Smartphone className="w-4 h-4 text-indigo-600" />
                <span className="text-[11px] font-bold text-slate-700">
                  {activeTab === 'bills' ? 'Products & IMEIs' : 'Inward Bills'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sub-Tabs & Search */}
      <div className="px-3 sm:px-5 pt-3 pb-2 shrink-0">
        <div className="max-w-5xl mx-auto space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-5 border-b border-slate-200">
              <button
                type="button"
                onClick={() => setActiveTab('bills')}
                className={`pb-2 text-xs font-extrabold transition relative cursor-pointer ${
                  activeTab === 'bills' ? 'text-blue-700' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Inward Bills ({account.bills.length})
                {activeTab === 'bills' && (
                  <span className="absolute left-0 right-0 bottom-0 h-[2.5px] rounded-full bg-blue-600" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('items')}
                className={`pb-2 text-xs font-extrabold transition relative cursor-pointer ${
                  activeTab === 'items' ? 'text-blue-700' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Products &amp; IMEIs
                {activeTab === 'items' && (
                  <span className="absolute left-0 right-0 bottom-0 h-[2.5px] rounded-full bg-blue-600" />
                )}
              </button>
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
                        ? 'bg-white text-blue-700 shadow-2xs font-extrabold'
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

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search bill #, model, IMEI, RAM/ROM..."
              className="w-full pl-9 pr-8 h-9 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Column Headers for Bills Register */}
      {activeTab === 'bills' && filteredBills.length > 0 && (
        <div className="px-3 sm:px-5 pb-1 shrink-0">
          <div className="max-w-5xl mx-auto grid grid-cols-12 text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3">
            <div className="col-span-6">Bill &amp; Items</div>
            {isAdmin ? (
              <>
                <div className="col-span-3 text-right">Paid</div>
                <div className="col-span-3 text-right">Bill / Due</div>
              </>
            ) : (
              <div className="col-span-6 text-right">Units</div>
            )}
          </div>
        </div>
      )}

      {/* Scrollable Register List */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-5 pb-24">
        <div className="max-w-5xl mx-auto">
          {activeTab === 'bills' ? (
            filteredBills.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-2 mt-2">
                <FileText className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-slate-700">No Matching Bills</p>
                <p className="text-xs text-slate-400">
                  Adjust filters or tap + ADD STOCK INWARD below.
                </p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200/90 rounded-2xl divide-y divide-slate-100 overflow-hidden shadow-2xs">
                {filteredBills.map(p => {
                  const isReversed = p.status === 'REVERSED';
                  const isFullyPaid = (p.balanceDue || 0) <= 0;
                  const totalUnits = (p.items || []).reduce((sum, i) => sum + (i.qty || 0), 0);
                  const salesmanCanEdit = !isAdmin && canSalesmanEditPurchase(p);
                  const salesmanAlreadyEdited =
                    !isAdmin &&
                    !isReversed &&
                    p.createdByRole === 'salesman' &&
                    (p.salesmanEditCount || 0) >= 1;
                  const itemsPreview = (p.items || [])
                    .slice(0, 2)
                    .map(it => `${it.name}${it.ram || it.storage ? ` (${[it.ram, it.storage].filter(Boolean).join('/')})` : ''} × ${it.qty}`)
                    .join(' · ');

                  return (
                    <div
                      key={p.id}
                      onClick={() => onViewBill(p)}
                      className={`px-3 py-3 transition cursor-pointer hover:bg-blue-50/25 ${
                        isReversed ? 'bg-rose-50/20' : ''
                      }`}
                    >
                      <div className="grid grid-cols-12 items-start gap-2">
                        {/* Left Column: Bill # & Items */}
                        <div className="col-span-6 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[13px] font-extrabold text-slate-900 tabular-nums">
                              #{p.billNo}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              · {formatLedgerTimestamp(p.date, true)}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 font-medium truncate mt-0.5">
                            {itemsPreview || `${p.items?.length || 0} item(s)`}
                            {(p.items?.length || 0) > 2 ? ` +${(p.items?.length || 0) - 2} more` : ''}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5 tabular-nums">
                            {totalUnits} pcs
                            {p.notes ? ` · ${p.notes}` : ''}
                          </p>
                        </div>

                        {isAdmin ? (
                          <>
                            {/* Middle Column: Paid */}
                            <div className="col-span-3 text-right tabular-nums">
                              <span className="text-xs font-extrabold text-emerald-600">
                                {isReversed ? '—' : `${currency} ${(p.paidAmount || 0).toLocaleString()}`}
                              </span>
                            </div>

                            {/* Right Column: Total & Due status */}
                            <div className="col-span-3 text-right tabular-nums">
                              <span
                                className={`text-xs font-extrabold block ${
                                  isReversed
                                    ? 'line-through text-slate-400'
                                    : isFullyPaid
                                    ? 'text-slate-900'
                                    : 'text-rose-600'
                                }`}
                              >
                                {currency} {(p.totalAmount || 0).toLocaleString()}
                              </span>
                              <span
                                className={`inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  isReversed
                                    ? 'bg-rose-100 text-rose-700'
                                    : isFullyPaid
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-rose-50 text-rose-600'
                                }`}
                              >
                                {isReversed
                                  ? 'Reversed'
                                  : isFullyPaid
                                  ? 'Paid'
                                  : `Due ${currency} ${(p.balanceDue || 0).toLocaleString()}`}
                              </span>
                            </div>
                          </>
                        ) : (
                          <div className="col-span-6 text-right tabular-nums">
                            <span className="text-xs font-extrabold text-blue-600">
                              {totalUnits} pcs
                            </span>
                            {isReversed && (
                              <span className="block text-[10px] font-bold text-rose-600">Reversed</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Subtle Quick Action Strip */}
                      <div
                        className="flex flex-wrap items-center justify-between gap-1.5 mt-2 pt-2 border-t border-slate-100/80 text-[11px]"
                        onClick={e => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-1.5">
                          {p.invoiceImage && (
                            <button
                              type="button"
                              onClick={() => onZoomImage(p.invoiceImage!)}
                              className="h-7 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-[10px] inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Camera className="w-3 h-3 text-blue-600" />
                              <span>Photo</span>
                            </button>
                          )}
                          {isAdmin && !isReversed && (p.balanceDue || 0) > 0 && (
                            <button
                              type="button"
                              onClick={() => onPayBillDue(p)}
                              className="h-7 px-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-[10px] inline-flex items-center gap-1 cursor-pointer"
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
                            className="h-7 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-[10px] inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            <span>View</span>
                          </button>

                          {!isReversed && (isAdmin || salesmanCanEdit) && (
                            <button
                              type="button"
                              onClick={() => onEditBill(p)}
                              className="h-7 px-2 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-bold rounded-lg text-[10px] inline-flex items-center gap-1 cursor-pointer"
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
                              className="h-7 w-7 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg border border-slate-200 flex items-center justify-center cursor-pointer"
                              title="Download Bill PDF"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => onShareWhatsApp(p)}
                              className="h-7 w-7 text-emerald-600 hover:bg-emerald-50 rounded-lg border border-slate-200 flex items-center justify-center cursor-pointer"
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
                })}
              </div>
            )
          ) : flatItemEntries.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-2 mt-2">
              <Smartphone className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-700">No Matching Products or IMEIs</p>
              <p className="text-xs text-slate-400">
                Try another model name, IMEI number, or bill reference.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200/90 rounded-2xl divide-y divide-slate-100 overflow-hidden shadow-2xs">
              {flatItemEntries.map((entry, idx) => (
                <div
                  key={`${entry.billId}-${idx}`}
                  onClick={() => onViewBill(entry.billRef)}
                  className={`p-3 space-y-1.5 hover:bg-blue-50/20 cursor-pointer transition ${
                    entry.isReversed ? 'bg-rose-50/20' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-xs sm:text-sm text-slate-900">
                        {entry.name}
                        {(entry.ram || entry.storage || entry.color) && (
                          <span className="text-[11px] font-semibold text-blue-700 ml-1.5">
                            {[entry.ram, entry.storage, entry.color].filter(Boolean).join(' / ')}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                        #{entry.billNo} · {new Date(entry.date).toLocaleDateString()} · {entry.category}
                        {entry.isReversed ? ' · REVERSED' : ''}
                      </p>
                    </div>

                    <div className="text-right shrink-0 tabular-nums">
                      <span className="text-xs font-extrabold text-blue-600 block">
                        {entry.qty} pcs
                      </span>
                      {isAdmin && (
                        <span className="text-[11px] font-semibold text-slate-600">
                          Cost: {currency} {entry.costPrice.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {entry.imeis.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {entry.imeis.map((im, imIdx) => (
                        <span
                          key={imIdx}
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-bold tabular-nums"
                        >
                          <Smartphone className="w-2.5 h-2.5 text-blue-600" />
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
                    <p className="text-[10px] text-amber-700 font-medium">
                      Note: {entry.note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pinned Bottom Dual Pill Action Footer */}
      <div className="fixed bottom-0 left-0 right-0 z-20 ios-liquid-dock px-3 sm:px-5 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
        <div className="max-w-5xl mx-auto flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => onAddInwardForSupplier(account.partyName, account.partyPhone)}
            className="flex-1 h-11 rounded-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-black text-xs tracking-wide uppercase shadow-md shadow-blue-600/20 flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>ADD STOCK INWARD</span>
          </button>

          {isAdmin && account.totalDue > 0 && onSettlePurchaseDue && (
            <button
              type="button"
              onClick={handleOpenAccountSettle}
              className="flex-1 h-11 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white font-black text-xs tracking-wide uppercase shadow-md shadow-rose-600/20 flex items-center justify-center gap-1.5 transition cursor-pointer tabular-nums"
            >
              <CreditCard className="w-4 h-4" />
              <span>PAY DUE · {currency} {account.totalDue.toLocaleString()}</span>
            </button>
          )}
        </div>
      </div>

      {/* Account-Level Pay Supplier Due Modal (Distributes FIFO across oldest unpaid bills) */}
      {isSettleAccountOpen && isAdmin && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-2.5 sm:p-4 glass-modal-backdrop">
          <div className="glass-modal-panel animate-modal-pop rounded-2xl max-w-md w-full p-4 sm:p-5 space-y-4 max-h-[82dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">Pay Supplier Account Due</h3>
                  <p className="text-[11px] text-slate-400">
                    {account.partyName} · {unpaidActiveBills.length} unpaid bill(s)
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
                <span className="tabular-nums text-slate-900">
                  {currency} {account.totalAmount.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between text-emerald-700 font-bold">
                <span>Total Paid:</span>
                <span className="tabular-nums">
                  {currency} {account.totalPaid.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between text-rose-600 font-extrabold pt-1 border-t border-slate-200">
                <span>Total Account Due:</span>
                <span className="tabular-nums text-sm">
                  {currency} {account.totalDue.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Cash Payment Amount ({currency}):
                </label>
                <input
                  type="number"
                  min={1}
                  max={account.totalDue}
                  value={accountSettleAmount}
                  onChange={e =>
                    setAccountSettleAmount(
                      e.target.value === '' ? '' : Math.min(account.totalDue, Number(e.target.value))
                    )
                  }
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm tabular-nums font-bold text-slate-900 focus:outline-none focus:border-blue-600"
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
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600"
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
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-extrabold rounded-xl transition cursor-pointer shadow-md shadow-blue-600/20"
              >
                Confirm Cash Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
