import React, { useState, useMemo, useEffect, useRef } from 'react';
import { DailyClosingRecord, OnlineAccount, AppData } from '../types';
import {
  Calculator,
  Trash2,
  Share2,
  Printer,
  Calendar,
  Wallet,
  CheckCircle2,
  RotateCcw,
  Sliders,
  TrendingUp,
  FileText,
  Download,
  X,
  Lock,
  Unlock,
  ShieldCheck,
} from 'lucide-react';
import { useToast } from './Toast';
import { ConfirmModal } from './ConfirmModal';
import { generatePdfReport } from '../utils/pdfGenerator';
import { calculateAccountingSummary, AccountingSummary } from '../utils/accounting';

interface DailyClosingTabProps {
  data: AppData;
  isAdmin?: boolean;
  onSaveClosing: (record: Omit<DailyClosingRecord, 'id'>) => void;
  onDeleteClosing: (id: string) => void;
  onAddOnlineAccount: (account: Omit<OnlineAccount, 'id'>) => void;
  onUpdateOnlineAccount?: (account: OnlineAccount) => void;
  onDeleteOnlineAccount: (id: string) => void;
  onOpenSettings?: () => void;
  onOpenPdfReport?: () => void;
}

const PAK_DENOMINATIONS = [5000, 1000, 500, 100, 50, 20, 10];

const DailyClosingTabComponent: React.FC<DailyClosingTabProps> = ({
  data,
  isAdmin = true,
  onSaveClosing,
  onDeleteClosing,
  onOpenSettings,
  onOpenPdfReport,
}) => {
  const { showToast } = useToast();
  const currency = data.settings.currency || 'Rs.';

  const [activeDate, setActiveDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [isUnlockedForEdit, setIsUnlockedForEdit] = useState<boolean>(false);

  // Active counted physical cash form state
  const [denominations, setDenominations] = useState<Record<string, number>>({
    '5000': 0,
    '1000': 0,
    '500': 0,
    '100': 0,
    '50': 0,
    '20': 0,
    '10': 0,
  });
  const [coins, setCoins] = useState<number | ''>('');
  const [closedBy, setClosedBy] = useState('Counter Cashier');
  const [closingNotes, setClosingNotes] = useState('');

  // Modals state
  const [closingToDelete, setClosingToDelete] = useState<DailyClosingRecord | null>(null);
  const [selectedClosingForPrint, setSelectedClosingForPrint] = useState<DailyClosingRecord | null>(null);
  const [selectedHistoryRecord, setSelectedHistoryRecord] = useState<DailyClosingRecord | null>(null);

  // History filtering state
  const [historyFilter, setHistoryFilter] = useState<'all' | 'daily' | 'weekly' | 'monthly' | 'yearly'>('all');
  const [filterDate, setFilterDate] = useState<string>('');

  // 1. Existing committed closing check for active business date
  const existingClosingForActiveDate = useMemo(() => {
    return (data.dailyClosings || []).find(r => r.date === activeDate);
  }, [data.dailyClosings, activeDate]);

  const isDayFinalized = Boolean(existingClosingForActiveDate) && !isUnlockedForEdit;

  // 2. Compute Master Accounting Summary for active date (using previous closing cutoff)
  const accounting: AccountingSummary = useMemo(() => {
    return calculateAccountingSummary(
      data,
      activeDate,
      undefined,
      existingClosingForActiveDate?.id
    );
  }, [data, activeDate, existingClosingForActiveDate?.id]);

  // 3. Counted Physical Cash Total
  const totalPhysicalCash = useMemo(() => {
    let sum = 0;
    PAK_DENOMINATIONS.forEach(denom => {
      const count = Number(denominations[denom.toString()]) || 0;
      sum += denom * count;
    });
    sum += Number(coins) || 0;
    return sum;
  }, [denominations, coins]);

  // 4. Grand Actual Counted Cash Total
  const grandTotal = totalPhysicalCash;

  // 5. Reconciliation Difference
  const cashDifference = totalPhysicalCash - accounting.totalExpectedCash;

  // Sync state whenever activeDate changes or closing is loaded
  useEffect(() => {
    setIsUnlockedForEdit(false);
    if (existingClosingForActiveDate) {
      setDenominations({
        '5000': 0,
        '1000': 0,
        '500': 0,
        '100': 0,
        '50': 0,
        '20': 0,
        '10': 0,
        ...(existingClosingForActiveDate.denominations || {}),
      });
      setCoins(existingClosingForActiveDate.coins ? existingClosingForActiveDate.coins : '');
      setClosedBy(existingClosingForActiveDate.closedBy || 'Counter Cashier');
      setClosingNotes(existingClosingForActiveDate.notes || '');
    } else {
      setDenominations({
        '5000': 0,
        '1000': 0,
        '500': 0,
        '100': 0,
        '50': 0,
        '20': 0,
        '10': 0,
      });
      setCoins('');
      setClosingNotes('');
    }
  }, [activeDate, existingClosingForActiveDate]);

  // Update Denomination Count
  const handleDenomChange = (denom: number, count: number) => {
    setDenominations(prev => ({
      ...prev,
      [denom.toString()]: Math.max(0, count),
    }));
  };

  const handleClearDenominations = () => {
    const cleared: Record<string, number> = {};
    PAK_DENOMINATIONS.forEach(d => {
      cleared[d.toString()] = 0;
    });
    setDenominations(cleared);
    setCoins('');
    showToast('Cash count reset', 'info');
  };

  // Commit & Finalize Closing
  const handleFinalizeClosing = () => {
    if (totalPhysicalCash === 0) {
      const confirmZero = window.confirm(
        'Physical cash notes count is 0. Are you sure you want to save this closing?'
      );
      if (!confirmZero) return;
    }

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    onSaveClosing({
      date: activeDate,
      time: timeStr,
      createdAt: now.toISOString(),
      openingCash: accounting.openingCash,
      openingOnlineBalances: [],
      openingTotalOnline: 0,
      openingGrandTotal: accounting.openingCash,
      denominations: { ...denominations },
      coins: Number(coins) || 0,
      totalCash: totalPhysicalCash,
      onlineBalances: [],
      totalOnline: 0,
      grandTotal: totalPhysicalCash,
      expectedCash: accounting.totalExpectedCash,
      expectedOnlineBalances: [],
      expectedOnlineTotal: 0,
      expectedGrandTotal: accounting.totalExpectedCash,
      difference: cashDifference,
      onlineDifference: 0,
      totalDifference: cashDifference,
      closedBy: closedBy.trim() || 'Counter Cashier',
      notes: closingNotes.trim() || undefined,
      status: 'closed',
    });

    setIsUnlockedForEdit(false);
    showToast(`Daily Closing for ${activeDate} successfully finalized and locked!`, 'success');
  };

  // Generate WhatsApp formatted text
  const generateWhatsAppClosingText = (record: DailyClosingRecord): string => {
    const lines: string[] = [];
    lines.push(`📊 *${(data.settings.shopName || 'MOBILE SHOP').toUpperCase()}* - DAILY CLOSING REPORT`);
    lines.push(`📅 *Date:* ${record.date}  |  🕒 *Time:* ${record.time}`);
    lines.push(`👤 *Closed By:* ${record.closedBy || 'Cashier'}`);
    lines.push(`----------------------------------------`);
    lines.push(`🏁 *OPENING CASH IN HAND:* ${currency} ${(record.openingCash || 0).toLocaleString()}`);
    lines.push(`----------------------------------------`);
    lines.push(`💵 *PHYSICAL CASH NOTES COUNT:*`);

    PAK_DENOMINATIONS.forEach(denom => {
      const count = record.denominations[denom.toString()] || 0;
      if (count > 0) {
        lines.push(`• Rs. ${denom.toLocaleString()} x ${count} = ${currency} ${(denom * count).toLocaleString()}`);
      }
    });

    if (record.coins > 0) {
      lines.push(`• Coins/Change = ${currency} ${record.coins.toLocaleString()}`);
    }
    lines.push(`💰 *Total Counted Cash:* ${currency} ${record.totalCash.toLocaleString()}`);
    if (record.expectedCash !== undefined) {
      lines.push(`🎯 *Expected Cash:* ${currency} ${record.expectedCash.toLocaleString()}`);
      const diff = record.totalCash - record.expectedCash;
      lines.push(`⚖️ *Cash Difference:* ${diff >= 0 ? '+' : ''}${currency} ${diff.toLocaleString()}`);
    }
    lines.push(`----------------------------------------`);
    lines.push(`🏆 *CLOSING CASH IN HAND:* ${currency} ${record.totalCash.toLocaleString()}`);
    if (record.notes) {
      lines.push(`📝 *Notes:* ${record.notes}`);
    }
    lines.push(`----------------------------------------`);
    lines.push(`_Automated closing generated via POS Suite_`);

    return lines.join('\n');
  };

  const handleShareWhatsApp = (record: DailyClosingRecord) => {
    const text = generateWhatsAppClosingText(record);
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handlePrintRecord = (record: DailyClosingRecord) => {
    setSelectedClosingForPrint(record);
    setTimeout(() => {
      window.print();
    }, 200);
  };

  // Filtered History
  const filteredHistory = useMemo(() => {
    const closings = [...(data.dailyClosings || [])].sort((a, b) => {
      const dateTimeA = `${a.date}T${a.time || '00:00'}`;
      const dateTimeB = `${b.date}T${b.time || '00:00'}`;
      return dateTimeB.localeCompare(dateTimeA);
    });

    if (filterDate) {
      return closings.filter(c => c.date === filterDate);
    }

    const now = new Date();
    return closings.filter(record => {
      if (historyFilter === 'all') return true;

      if (historyFilter === 'daily') {
        const today = now.toISOString().substring(0, 10);
        return record.date === today;
      }

      if (historyFilter === 'weekly') {
        const recordTime = new Date(record.date).getTime();
        const weekAgo = Date.now() - 7 * 86400000;
        return recordTime >= weekAgo;
      }

      if (historyFilter === 'monthly') {
        const recordTime = new Date(record.date).getTime();
        const monthAgo = Date.now() - 30 * 86400000;
        return recordTime >= monthAgo;
      }

      if (historyFilter === 'yearly') {
        const recYear = new Date(record.date).getFullYear();
        return recYear === now.getFullYear();
      }

      return true;
    });
  }, [data.dailyClosings, historyFilter, filterDate]);

  return (
    <div className="space-y-3.5 sm:space-y-5">
      {/* Top Banner & Date Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-200 pb-2.5 sm:pb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base sm:text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-1.5 sm:gap-2">
              <Calculator className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" /> Daily Closing & Cash Drawer
            </h2>
            {isDayFinalized ? (
              <span className="text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                <Lock className="w-3 h-3 text-emerald-700" /> Finalized & Closed
              </span>
            ) : (
              <span className="text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                <Unlock className="w-3 h-3 text-amber-600" /> Reconciling
              </span>
            )}
          </div>
          <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
            Strict opening → period transactions → closing reconciliation.
          </p>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="h-8 w-8 flex items-center justify-center text-slate-500 hover:text-slate-800 rounded-lg sm:rounded-xl hover:bg-slate-100 border border-slate-200 transition cursor-pointer shrink-0"
              title="Closing Settings"
            >
              <Sliders className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          )}

          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg sm:rounded-xl px-2.5 py-1 text-[11px] sm:text-xs shadow-2xs h-8">
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="font-semibold text-slate-600">Date:</span>
            <input
              type="date"
              value={activeDate}
              onChange={e => setActiveDate(e.target.value)}
              className="compact-mobile-input font-bold text-slate-900 outline-none bg-transparent cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Status Warning Banner for Finalized Day */}
      {isDayFinalized && (
        <div className="p-2.5 sm:p-4 bg-emerald-50 border border-emerald-200 rounded-xl sm:rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
          <div className="flex items-start gap-2 sm:gap-3">
            <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-[11px] sm:text-xs font-bold text-emerald-900">
                Business Date ({activeDate}) is Closed & Locked
              </h4>
              <p className="text-[10px] sm:text-[11px] text-emerald-700 mt-0.5">
                Saved by <strong>{existingClosingForActiveDate?.closedBy || 'Cashier'}</strong> at {existingClosingForActiveDate?.time}.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => handlePrintRecord(existingClosingForActiveDate!)}
              className="h-7.5 sm:h-8 px-2.5 bg-white border border-emerald-200 hover:bg-emerald-100 text-emerald-800 font-bold text-[11px] rounded-lg shadow-2xs transition flex items-center gap-1 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" /> Print Slip
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Re-open closing for ${activeDate}? This will unlock counts for modification.`)) {
                    setIsUnlockedForEdit(true);
                    showToast(`Closing for ${activeDate} unlocked for adjustments`, 'info');
                  }
                }}
                className="h-7.5 sm:h-8 px-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] rounded-lg shadow-2xs transition flex items-center gap-1 cursor-pointer"
              >
                <Unlock className="w-3.5 h-3.5" /> Unlock / Edit
              </button>
            )}
          </div>
        </div>
      )}

      {/* ACCOUNTING LEDGER BREAKDOWN STRIP (CASH IN HAND ONLY) */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="bg-slate-50/90 border-b border-slate-200/80 px-3 sm:px-5 py-2 sm:py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-emerald-50 border border-emerald-200/70 text-emerald-600 flex items-center justify-center shrink-0">
              <Wallet className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 tracking-tight truncate">
                Cash In Hand Period Ledger
              </h3>
              <p className="text-[10px] sm:text-[11px] font-medium text-slate-500 truncate">
                Since {accounting.previousClosing ? `${accounting.previousClosing.date}${accounting.previousClosing.time ? ` · ${accounting.previousClosing.time}` : ''}` : 'Initial Inception'}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-200/60 shrink-0">
            <span className="text-[10.5px] sm:text-[11px] font-semibold text-slate-500">Expected Cash</span>
            <span className="text-xs sm:text-base font-extrabold text-emerald-700 tabular-nums">
              {currency} {accounting.totalExpectedCash.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="p-2.5 sm:p-4 grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 text-[10.5px] sm:text-xs">
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="text-[10px] font-bold text-slate-500 block">Opening Cash</span>
            <span className="text-xs sm:text-sm font-extrabold text-slate-900 tabular-nums">
              {currency} {accounting.cash.opening.toLocaleString()}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200/70">
            <span className="text-[10px] font-bold text-emerald-700 block">
              + Sales ({accounting.periodSales.length})
            </span>
            <span className="text-xs sm:text-sm font-extrabold text-emerald-700 tabular-nums">
              +{currency} {accounting.cash.sales.toLocaleString()}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-200/70">
            <span className="text-[10px] font-bold text-blue-700 block">+ Khata Recoveries</span>
            <span className="text-xs sm:text-sm font-extrabold text-blue-700 tabular-nums">
              +{currency} {accounting.cash.khataRecoveries.toLocaleString()}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-rose-50/70 border border-rose-200/70">
            <span className="text-[10px] font-bold text-rose-700 block">- Cash Expenses</span>
            <span className="text-xs sm:text-sm font-extrabold text-rose-700 tabular-nums">
              -{currency} {accounting.cash.expenses.toLocaleString()}
            </span>
          </div>
          <div className="col-span-2 sm:col-span-1 p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/70">
            <span className="text-[10px] font-bold text-amber-800 block">- Supplier Paid</span>
            <span className="text-xs sm:text-sm font-extrabold text-amber-800 tabular-nums">
              -{currency} {accounting.cash.supplierPayments.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Summary Strip: 2 Clean Cash In Hand Cards */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
        <div className="bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 shadow-xs transition hover:border-emerald-400 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1 sm:mb-2">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1 sm:gap-1.5 line-clamp-1">
              <Wallet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="truncate">Physical Cash Counted</span>
            </span>
            <span className="text-[9px] sm:text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 sm:px-2 sm:py-0.5 rounded-full shrink-0">
              In Hand
            </span>
          </div>
          <h3 className="text-sm sm:text-2xl font-black text-emerald-600 tabular-nums truncate">
            {currency} {totalPhysicalCash.toLocaleString()}
          </h3>
          <p className="text-[10px] sm:text-xs text-slate-500 mt-1 truncate tabular-nums">
            Notes + Loose Coins
          </p>
        </div>

        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-xl sm:rounded-2xl p-2.5 sm:p-4 shadow-lg border border-indigo-900/50 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1 sm:mb-2">
            <span className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-emerald-400 flex items-center gap-1 sm:gap-1.5 line-clamp-1">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">Expected Cash & Diff</span>
            </span>
            <span className="text-[9px] sm:text-[10px] font-bold text-slate-300 bg-white/10 px-1.5 py-0.2 sm:px-2 sm:py-0.5 rounded-full shrink-0">
              Cash Drawer
            </span>
          </div>
          <h3 className="text-sm sm:text-2xl font-black text-white tabular-nums truncate">
            {currency} {accounting.totalExpectedCash.toLocaleString()}
          </h3>
          <div className="mt-1 flex items-center justify-between text-[10px] sm:text-[11px] text-slate-300 truncate">
            <span className="truncate">Difference:</span>
            {cashDifference === 0 ? (
              <span className="text-emerald-400 font-bold flex items-center gap-1 shrink-0 ml-1">
                <CheckCircle2 className="w-3 h-3" /> Matched
              </span>
            ) : cashDifference > 0 ? (
              <span className="text-blue-300 font-bold tabular-nums shrink-0 ml-1">
                +{currency} {cashDifference.toLocaleString()}
              </span>
            ) : (
              <span className="text-rose-400 font-bold tabular-nums shrink-0 ml-1">
                {currency} {cashDifference.toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Closing Entry Section: Physical Cash Counter & Verification */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-5 items-start">
        {/* Physical Cash Notes Counter */}
        <div className="col-span-1 lg:col-span-7 bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-2.5 sm:p-5 space-y-2.5 sm:space-y-4 shadow-xs min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-1 border-b border-slate-100 pb-2 sm:pb-3">
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-1 sm:gap-2 truncate">
                <Wallet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 shrink-0" />
                <span className="truncate">Cash Notes</span>
              </h3>
              <p className="hidden sm:block text-[11px] text-slate-400">
                Count notes in cash drawer at closing
              </p>
            </div>
            {!isDayFinalized && (
              <button
                type="button"
                onClick={handleClearDenominations}
                className="text-[10px] sm:text-xs font-semibold text-slate-500 hover:text-rose-600 flex items-center gap-0.5 sm:gap-1 transition cursor-pointer shrink-0"
              >
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            )}
          </div>

          {/* Desktop Notes Rows Table (>= lg: breakpoint) */}
          <div className="hidden lg:block border border-slate-200/80 rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="p-2.5">Currency Note</th>
                  <th className="p-2.5 text-center">Notes Count</th>
                  <th className="p-2.5 text-right">Subtotal ({currency})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {PAK_DENOMINATIONS.map(denom => {
                  const count = denominations[denom.toString()] || 0;
                  const rowSubtotal = denom * count;

                  return (
                    <tr key={denom} className="hover:bg-slate-50/70 transition">
                      <td className="p-2.5 font-bold text-slate-900 tabular-nums">
                        <span className="inline-block px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200/60 text-xs">
                          Rs. {denom.toLocaleString()}
                        </span>
                      </td>

                      <td className="p-2.5 text-center">
                        <input
                          type="number"
                          min="0"
                          disabled={isDayFinalized}
                          value={count === 0 ? '' : count}
                          onChange={e =>
                            handleDenomChange(
                              denom,
                              e.target.value === '' ? 0 : Number(e.target.value)
                            )
                          }
                          placeholder="Qty"
                          className="w-20 text-center tabular-nums font-bold text-xs bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 focus:outline-none focus:border-emerald-600 focus:bg-white disabled:opacity-75 disabled:cursor-not-allowed"
                        />
                      </td>

                      <td className="p-2.5 text-right font-extrabold text-slate-900 tabular-nums">
                        {rowSubtotal.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}

                {/* Loose Coins Row */}
                <tr className="bg-slate-50/50">
                  <td className="p-2.5 font-bold text-slate-700">
                    <span className="inline-block px-2 py-0.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200/60 text-xs">
                      Loose Coins / Change
                    </span>
                  </td>
                  <td className="p-2.5 text-right font-semibold text-slate-500">
                    Amount:
                  </td>
                  <td className="p-2.5 text-right">
                    <input
                      type="number"
                      min="0"
                      disabled={isDayFinalized}
                      value={coins === '' ? '' : coins}
                      onChange={e =>
                        setCoins(e.target.value === '' ? '' : Number(e.target.value))
                      }
                      placeholder="Amount"
                      className="w-20 text-right tabular-nums font-bold text-xs bg-white border border-slate-200 rounded-lg py-1 px-2 focus:outline-none focus:border-emerald-600 disabled:opacity-75 disabled:cursor-not-allowed"
                    />
                  </td>
                </tr>

                {/* Total Cash Notes Row */}
                <tr className="bg-emerald-50/60 border-t-2 border-emerald-200">
                  <td colSpan={2} className="p-3 font-extrabold text-slate-900 text-xs">
                    Total Physical Counted Cash:
                  </td>
                  <td className="p-3 text-right font-extrabold text-emerald-700 text-sm tabular-nums">
                    {currency} {totalPhysicalCash.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Ultra-Compact Mobile Side-by-Side Single-Col Notes Rows (< lg) */}
          <div className="block lg:hidden space-y-1">
            {PAK_DENOMINATIONS.map(denom => {
              const count = denominations[denom.toString()] || 0;
              const rowSubtotal = denom * count;

              return (
                <div
                  key={denom}
                  className="bg-slate-50 border border-slate-200/80 rounded-lg px-1.5 py-1 flex items-center justify-between gap-1"
                >
                  <span className="font-extrabold text-[10px] tabular-nums text-emerald-800 shrink-0 w-10">
                    {denom}
                  </span>

                  <input
                    type="number"
                    min="0"
                    disabled={isDayFinalized}
                    value={count === 0 ? '' : count}
                    onChange={e =>
                      handleDenomChange(
                        denom,
                        e.target.value === '' ? 0 : Number(e.target.value)
                      )
                    }
                    placeholder="0"
                    className="compact-mobile-input w-12 text-center tabular-nums font-bold text-[11px] bg-white border border-slate-300 rounded-md h-6.5 px-1 focus:outline-none focus:border-emerald-600"
                  />

                  <span className="font-bold text-[9.5px] text-slate-600 tabular-nums truncate text-right min-w-0 flex-1">
                    {rowSubtotal > 0 ? rowSubtotal.toLocaleString() : '0'}
                  </span>
                </div>
              );
            })}

            {/* Loose Coins Compact Row */}
            <div className="bg-amber-50/70 border border-amber-200 rounded-lg px-1.5 py-1 flex items-center justify-between gap-1">
              <span className="font-bold text-[10px] text-amber-900 shrink-0">Coins</span>
              <input
                type="number"
                min="0"
                disabled={isDayFinalized}
                value={coins === '' ? '' : coins}
                onChange={e =>
                  setCoins(e.target.value === '' ? '' : Number(e.target.value))
                }
                placeholder="0"
                className="compact-mobile-input w-20 text-right tabular-nums font-bold text-[11px] bg-white border border-amber-300 rounded-md h-6.5 px-1.5 focus:outline-none focus:border-amber-600"
              />
            </div>

            {/* Mobile Total Physical Cash Banner */}
            <div className="bg-emerald-600 text-white rounded-lg p-2 flex items-center justify-between shadow-2xs gap-1">
              <span className="font-bold text-[10px] truncate">Cash Total:</span>
              <span className="font-black text-[11px] tabular-nums shrink-0">
                {currency} {totalPhysicalCash.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Verification & Authorization Box */}
        <div className="col-span-1 lg:col-span-5 bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-3 sm:p-5 space-y-2.5 sm:space-y-3.5 shadow-xs">
          <h4 className="font-bold text-slate-900 text-[11px] sm:text-xs uppercase tracking-wider text-slate-500 flex items-center justify-between">
            <span>Closing Verification & Authorization</span>
            {isDayFinalized ? (
              <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-bold text-[10px]">
                Locked
              </span>
            ) : (
              <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-bold text-[10px]">
                Pending Submission
              </span>
            )}
          </h4>

          <div className="space-y-2.5 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1 text-[11px] sm:text-xs">
                Cashier / Staff Name *
              </label>
              <input
                type="text"
                disabled={isDayFinalized}
                value={closedBy}
                onChange={e => setClosedBy(e.target.value)}
                className="compact-mobile-input w-full bg-slate-50 border border-slate-200 rounded-lg sm:rounded-xl px-2.5 py-1.5 font-medium text-xs focus:outline-none focus:border-emerald-600 focus:bg-white transition disabled:opacity-75 disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1 text-[11px] sm:text-xs">
                Closing Notes (Optional)
              </label>
              <input
                type="text"
                disabled={isDayFinalized}
                value={closingNotes}
                onChange={e => setClosingNotes(e.target.value)}
                placeholder="Shift notes or shortages..."
                className="compact-mobile-input w-full bg-slate-50 border border-slate-200 rounded-lg sm:rounded-xl px-2.5 py-1.5 font-medium text-xs focus:outline-none focus:border-emerald-600 focus:bg-white transition disabled:opacity-75 disabled:cursor-not-allowed"
              />
            </div>

            <div className="space-y-2 pt-1">
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/70 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">System Expected Cash:</span>
                  <span className="tabular-nums font-bold text-slate-700">
                    {currency} {accounting.totalExpectedCash.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Counted Cash In Hand:</span>
                  <span className="tabular-nums font-bold text-slate-900">
                    {currency} {totalPhysicalCash.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200">
                  <span className="font-bold text-slate-700">Difference:</span>
                  <span
                    className={`tabular-nums font-bold ${
                      cashDifference === 0
                        ? 'text-emerald-600'
                        : cashDifference > 0
                        ? 'text-blue-600'
                        : 'text-rose-600'
                    }`}
                  >
                    {cashDifference > 0 ? '+' : ''}
                    {currency} {cashDifference.toLocaleString()}
                  </span>
                </div>
              </div>

              {!isDayFinalized ? (
                <button
                  type="button"
                  onClick={handleFinalizeClosing}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white text-xs font-extrabold rounded-lg sm:rounded-xl shadow-md shadow-emerald-500/25 transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Finalize Closing ({activeDate})</span>
                </button>
              ) : (
                <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-200 text-emerald-900 text-center">
                  <p className="text-[11px] font-bold flex items-center justify-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Day Closed & Recorded
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* History & Past Closings Section */}
      <div className="bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-3 sm:p-5 space-y-3 sm:space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 pb-2.5 sm:pb-3">
          <div>
            <h3 className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2">
              <FileText className="w-4 h-4 text-emerald-600" /> Daily Closing History ({filteredHistory.length})
            </h3>
            <p className="text-[10px] sm:text-[11px] text-slate-400">
              Audit opening balances, note breakdowns & cash drawer closings
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs max-w-full">
            <div className="no-scrollbar flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg sm:rounded-xl overflow-x-auto max-w-full shrink-0">
              {(['all', 'daily', 'weekly', 'monthly', 'yearly'] as const).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    setHistoryFilter(f);
                    setFilterDate('');
                  }}
                  className={`px-2 py-1 rounded-md sm:rounded-lg font-bold capitalize transition cursor-pointer shrink-0 whitespace-nowrap text-[10.5px] sm:text-xs ${
                    historyFilter === f && !filterDate
                      ? 'bg-white text-emerald-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'daily' ? 'Today' : f}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg sm:rounded-xl px-2 py-1 h-8">
              <span className="text-[10.5px] text-slate-500 font-semibold">Date:</span>
              <input
                type="date"
                value={filterDate}
                onChange={e => {
                  setFilterDate(e.target.value);
                  setHistoryFilter('all');
                }}
                className="compact-mobile-input bg-transparent font-medium text-[11px] outline-none text-slate-800 cursor-pointer"
              />
              {filterDate && (
                <button
                  type="button"
                  onClick={() => setFilterDate('')}
                  className="text-slate-400 hover:text-slate-600 text-xs ml-0.5"
                >
                  ×
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={async () => {
                if (onOpenPdfReport) {
                  onOpenPdfReport();
                } else {
                  try {
                    showToast('Generating closing PDF report...', 'info');
                    await generatePdfReport({
                      tab: 'dailyClosing',
                      dateFilter: {
                        type: filterDate
                          ? 'custom'
                          : historyFilter === 'daily'
                          ? 'today'
                          : historyFilter === 'all'
                          ? 'yearly'
                          : historyFilter,
                        startDate: filterDate || undefined,
                        endDate: filterDate || undefined,
                      },
                      data,
                    });
                    showToast('Closing PDF report downloaded!', 'success');
                  } catch (e) {
                    showToast('Failed to generate PDF', 'error');
                  }
                }
              }}
              className="h-8 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-lg sm:rounded-xl shadow-xs transition flex items-center gap-1 cursor-pointer"
              title="Download detailed PDF report for selected period"
            >
              <Download className="w-3.5 h-3.5" />
              <span>PDF Report</span>
            </button>
          </div>
        </div>

        {/* Records Table */}
        <div className="border border-slate-200/80 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="p-3">Date & Time</th>
                  <th className="p-3">Staff</th>
                  <th className="p-3 text-right">Opening Cash</th>
                  <th className="p-3 text-right">Counted Cash</th>
                  <th className="p-3 text-right">Closing Total</th>
                  <th className="p-3 text-right">Difference</th>
                  <th className="p-3 text-center">Share / Print</th>
                  <th className="p-3 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-slate-400">
                      No closing records found for the selected time period.
                    </td>
                  </tr>
                ) : (
                  filteredHistory.map(record => (
                    <tr
                      key={record.id}
                      onClick={() => setSelectedHistoryRecord(record)}
                      className="hover:bg-emerald-50/60 cursor-pointer transition group"
                      title="Click to view full opening and reconciliation details"
                    >
                      <td className="p-3">
                        <div className="font-bold text-slate-900 tabular-nums group-hover:text-emerald-700 flex items-center gap-1.5">
                          <span>{record.date}</span>
                          <span className="opacity-0 max-lg:opacity-100 group-hover:opacity-100 text-[10px] text-emerald-600 bg-emerald-100/70 px-1.5 py-0.2 rounded transition">
                            Inspect →
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 tabular-nums">
                          {record.time}
                        </div>
                      </td>

                      <td className="p-3 text-slate-700 font-medium">
                        {record.closedBy || 'Cashier'}
                      </td>

                      <td className="p-3 text-right tabular-nums text-slate-500">
                        {currency} {(record.openingCash || 0).toLocaleString()}
                      </td>

                      <td className="p-3 text-right font-bold text-emerald-600 tabular-nums">
                        {currency} {record.totalCash.toLocaleString()}
                      </td>

                      <td className="p-3 text-right font-extrabold text-slate-900 text-sm tabular-nums">
                        {currency} {record.totalCash.toLocaleString()}
                      </td>

                      <td className="p-3 text-right tabular-nums font-bold">
                        {record.difference === undefined || record.difference === 0 ? (
                          <span className="text-emerald-600 text-[11px]">Matched</span>
                        ) : record.difference > 0 ? (
                          <span className="text-blue-600 text-[11px]">
                            +{currency} {record.difference.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-rose-600 text-[11px]">
                            -{currency} {Math.abs(record.difference).toLocaleString()}
                          </span>
                        )}
                      </td>

                      <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleShareWhatsApp(record)}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition cursor-pointer"
                            title="Send to WhatsApp"
                          >
                            <Share2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePrintRecord(record)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                            title="Print Slip / PDF"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                        </div>
                      </td>

                      <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                        {isAdmin ? (
                          <button
                            type="button"
                            onClick={() => setClosingToDelete(record)}
                            className="p-1 text-slate-300 hover:text-rose-600 transition cursor-pointer"
                            title="Delete Record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <span className="text-slate-200">--</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* History Inspection Modal */}
      {selectedHistoryRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-w-full overflow-x-hidden shadow-2xl border border-slate-100 p-3.5 sm:p-5 space-y-4 max-h-[90vh] overflow-y-auto my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="min-w-0">
                <h3 className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-2 truncate">
                  <Calculator className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="truncate">Closing Statement: {selectedHistoryRecord.date} ({selectedHistoryRecord.time})</span>
                </h3>
                <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">
                  Closed by {selectedHistoryRecord.closedBy || 'Cashier'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedHistoryRecord(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 shrink-0 ml-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:gap-3 text-xs">
              <div className="p-2.5 sm:p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400">Opening Cash</span>
                <p className="text-sm sm:text-base font-extrabold tabular-nums text-slate-800 mt-0.5 truncate">
                  {currency} {(selectedHistoryRecord.openingCash || 0).toLocaleString()}
                </p>
              </div>
              <div className="p-2.5 sm:p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                <span className="text-[10px] uppercase font-bold text-emerald-700">Counted Cash In Hand</span>
                <p className="text-sm sm:text-base font-extrabold tabular-nums text-emerald-700 mt-0.5 truncate">
                  {currency} {selectedHistoryRecord.totalCash.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Notes Breakdown */}
            <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-200 space-y-2 text-xs">
              <h4 className="font-bold text-slate-700 text-xs">Physical Notes Breakdown:</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] tabular-nums">
                {PAK_DENOMINATIONS.map(denom => {
                  const count = selectedHistoryRecord.denominations[denom.toString()] || 0;
                  if (count === 0) return null;
                  return (
                    <div key={denom} className="p-1.5 bg-white rounded-lg border border-slate-200">
                      Rs. {denom} × {count} = <strong>{currency} {(denom * count).toLocaleString()}</strong>
                    </div>
                  );
                })}
                {selectedHistoryRecord.coins > 0 && (
                  <div className="p-1.5 bg-white rounded-lg border border-slate-200">
                    Coins: <strong>{currency} {selectedHistoryRecord.coins.toLocaleString()}</strong>
                  </div>
                )}
              </div>
            </div>

            {selectedHistoryRecord.notes && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900">
                <span className="font-bold block mb-0.5">Closing Notes:</span>
                <p>{selectedHistoryRecord.notes}</p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedHistoryRecord(null)}
                className="w-full sm:w-auto order-2 sm:order-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer text-center"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => handlePrintRecord(selectedHistoryRecord)}
                className="w-full sm:w-auto order-1 sm:order-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-normal"
              >
                <Printer className="w-3.5 h-3.5 shrink-0" /> <span>Print Statement</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden Printable Thermal/PDF Receipt Slip */}
      {selectedClosingForPrint && (
        <div id="printable-receipt-area" className="hidden print:block tabular-nums text-xs">
          <div className="text-center border-b border-dashed border-black pb-2 mb-2">
            <h2 className="font-extrabold text-sm uppercase">{data.settings.shopName}</h2>
            <p className="text-[10px]">{data.settings.address}</p>
            <p className="text-[10px]">Ph: {data.settings.phone}</p>
            <p className="font-bold text-xs mt-1">DAILY CLOSING SLIP</p>
          </div>

          <div className="flex justify-between text-[11px] mb-1">
            <span>Date: {selectedClosingForPrint.date}</span>
            <span>Time: {selectedClosingForPrint.time}</span>
          </div>
          <div className="text-[11px] mb-2">
            <span>Staff: {selectedClosingForPrint.closedBy || 'Cashier'}</span>
          </div>

          <div className="border-t border-b border-dashed border-black py-1.5 my-1.5">
            <p className="font-bold text-[10px] uppercase mb-1">Opening Balance:</p>
            <div className="flex justify-between text-[11px]">
              <span>Opening Cash In Hand:</span>
              <span>{currency} {(selectedClosingForPrint.openingCash || 0).toLocaleString()}</span>
            </div>
          </div>

          <div className="border-b border-dashed border-black py-1.5 mb-1.5">
            <p className="font-bold text-[10px] uppercase mb-1">Physical Cash Notes:</p>
            {PAK_DENOMINATIONS.map(denom => {
              const count = selectedClosingForPrint.denominations[denom.toString()] || 0;
              if (count === 0) return null;
              return (
                <div key={denom} className="flex justify-between text-[11px]">
                  <span>Rs. {denom} x {count}</span>
                  <span>{currency} {(denom * count).toLocaleString()}</span>
                </div>
              );
            })}
            {selectedClosingForPrint.coins > 0 && (
              <div className="flex justify-between text-[11px]">
                <span>Loose Coins / Change</span>
                <span>{currency} {selectedClosingForPrint.coins.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-xs pt-1 border-t border-dotted border-black mt-1">
              <span>Total Physical Cash:</span>
              <span>{currency} {selectedClosingForPrint.totalCash.toLocaleString()}</span>
            </div>
          </div>

          <div className="py-1.5">
            <div className="flex justify-between font-extrabold text-sm">
              <span>CLOSING CASH IN HAND:</span>
              <span>{currency} {selectedClosingForPrint.totalCash.toLocaleString()}</span>
            </div>
            {selectedClosingForPrint.difference !== undefined && (
              <div className="flex justify-between text-xs pt-1">
                <span>Difference from Expected:</span>
                <span>
                  {selectedClosingForPrint.difference >= 0 ? '+' : ''}
                  {currency} {selectedClosingForPrint.difference.toLocaleString()}
                </span>
              </div>
            )}
          </div>

          {selectedClosingForPrint.notes && (
            <div className="border-t border-dashed border-black pt-1.5 mt-1 text-[10px]">
              <span>Notes: {selectedClosingForPrint.notes}</span>
            </div>
          )}

          <div className="text-center border-t border-dashed border-black pt-2 mt-2 text-[9px]">
            <p>Generated by POS Pro System</p>
          </div>
        </div>
      )}

      {/* Delete Closing Record Modal */}
      <ConfirmModal
        isOpen={!!closingToDelete}
        title="Delete Closing Record"
        message={`Are you sure you want to delete the daily closing record for ${closingToDelete?.date}?`}
        confirmText="Yes, Delete Record"
        cancelText="Cancel"
        isDestructive={true}
        onConfirm={() => {
          if (closingToDelete) {
            onDeleteClosing(closingToDelete.id);
            showToast(`Closing record for ${closingToDelete.date} deleted`, 'info');
            setClosingToDelete(null);
          }
        }}
        onClose={() => setClosingToDelete(null)}
      />
    </div>
  );
};

export const DailyClosingTab = React.memo(DailyClosingTabComponent);
