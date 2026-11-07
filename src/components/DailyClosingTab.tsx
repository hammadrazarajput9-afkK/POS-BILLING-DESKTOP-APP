import React, { useState, useMemo, useEffect, useRef } from 'react';
import { DailyClosingRecord, OnlineAccount, AppData } from '../types';
import {
  Calculator,
  Plus,
  Trash2,
  Share2,
  Printer,
  Calendar,
  Wallet,
  Building2,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sliders,
  ChevronRight,
  TrendingUp,
  FileText,
  Smartphone,
  ExternalLink,
  Search,
  Filter,
  Download,
  Eye,
  ShoppingBag,
  Receipt,
  Truck,
  BookOpen,
  Clock,
  X,
  Lock,
  Unlock,
  ArrowDownRight,
  ArrowUpRight,
  ShieldCheck,
  CreditCard
} from 'lucide-react';
import { useToast } from './Toast';
import { ConfirmModal } from './ConfirmModal';
import { generatePdfReport } from '../utils/pdfGenerator';
import { calculateAccountingSummary, normalizePaymentChannel, AccountingSummary } from '../utils/accounting';

interface DailyClosingTabProps {
  data: AppData;
  isAdmin?: boolean;
  onSaveClosing: (record: Omit<DailyClosingRecord, 'id'>) => void;
  onDeleteClosing: (id: string) => void;
  onAddOnlineAccount: (account: Omit<OnlineAccount, 'id'>) => void;
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
  onAddOnlineAccount,
  onDeleteOnlineAccount,
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
  const [coins, setCoins] = useState<number | ''>(0);
  const [onlineBalances, setOnlineBalances] = useState<Record<string, number | ''>>({});
  const [closedBy, setClosedBy] = useState('Counter Cashier');
  const [closingNotes, setClosingNotes] = useState('');

  // Modals state
  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountNumber, setNewAccountNumber] = useState('');
  const [newAccountTitle, setNewAccountTitle] = useState('');
  const [newBankType, setNewBankType] = useState('Bank');

  const [accountToDelete, setAccountToDelete] = useState<OnlineAccount | null>(null);
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

  // 4. Counted Digital Balances Total
  const totalOnlineBalance = useMemo(() => {
    let sum = 0;
    (data.onlineAccounts || []).forEach(acc => {
      const val = Number(onlineBalances[acc.id]) || 0;
      sum += val;
    });
    return sum;
  }, [data.onlineAccounts, onlineBalances]);

  // 5. Grand Actual Counted Total
  const grandTotal = totalPhysicalCash + totalOnlineBalance;

  // 6. Reconciliation Differences
  const cashDifference = totalPhysicalCash - accounting.totalExpectedCash;
  const onlineDifference = totalOnlineBalance - accounting.totalExpectedOnline;
  const totalDifference = grandTotal - accounting.totalExpectedGrand;

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
      setCoins(existingClosingForActiveDate.coins || 0);
      const map: Record<string, number | ''> = {};
      (existingClosingForActiveDate.onlineBalances || []).forEach(b => {
        map[b.accountId] = b.balance;
      });
      setOnlineBalances(map);
      setClosedBy(existingClosingForActiveDate.closedBy || 'Counter Cashier');
      setClosingNotes(existingClosingForActiveDate.notes || '');
    } else {
      // New / Unclosed day: reset physical counts and prepopulate digital accounts with expected balances
      setDenominations({
        '5000': 0,
        '1000': 0,
        '500': 0,
        '100': 0,
        '50': 0,
        '20': 0,
        '10': 0,
      });
      setCoins(0);

      const prepopulatedOnline: Record<string, number | ''> = {};
      accounting.onlineAccounts.forEach(acc => {
        prepopulatedOnline[acc.accountId] = acc.expectedClosing;
      });
      setOnlineBalances(prepopulatedOnline);
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
    setCoins(0);
    showToast('Cash count reset', 'info');
  };

  // Add Online Account
  const handleCreateOnlineAccount = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newAccountName.trim();
    if (!name) {
      showToast('Account name is required', 'warning');
      return;
    }

    onAddOnlineAccount({
      name,
      accountNumber: newAccountNumber.trim() || undefined,
      accountTitle: newAccountTitle.trim() || undefined,
      bankType: newBankType,
    });

    setNewAccountName('');
    setNewAccountNumber('');
    setNewAccountTitle('');
    setIsAddAccountModalOpen(false);
    showToast(`Online account "${name}" added`, 'success');
  };

  // Commit & Finalize Closing
  const handleFinalizeClosing = () => {
    if (totalPhysicalCash === 0 && totalOnlineBalance === 0) {
      const confirmZero = window.confirm(
        'Both physical cash notes and digital balances are 0. Are you sure you want to save this closing?'
      );
      if (!confirmZero) return;
    }

    const onlineList = (data.onlineAccounts || []).map(acc => ({
      accountId: acc.id,
      accountName: acc.name,
      balance: Number(onlineBalances[acc.id]) || 0,
    }));

    const expectedOnlineList = accounting.onlineAccounts.map(a => ({
      accountId: a.accountId,
      accountName: a.accountName,
      balance: a.expectedClosing,
    }));

    const openingOnlineList = (data.onlineAccounts || []).map(acc => {
      const found = accounting.previousClosing?.onlineBalances?.find(b => b.accountId === acc.id);
      return {
        accountId: acc.id,
        accountName: acc.name,
        balance: found ? Number(found.balance) || 0 : 0,
      };
    });

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    onSaveClosing({
      date: activeDate,
      time: timeStr,
      createdAt: now.toISOString(),
      openingCash: accounting.openingCash,
      openingOnlineBalances: openingOnlineList,
      openingTotalOnline: accounting.openingOnlineTotal,
      openingGrandTotal: accounting.openingGrandTotal,
      denominations: { ...denominations },
      coins: Number(coins) || 0,
      totalCash: totalPhysicalCash,
      onlineBalances: onlineList,
      totalOnline: totalOnlineBalance,
      grandTotal,
      expectedCash: accounting.totalExpectedCash,
      expectedOnlineBalances: expectedOnlineList,
      expectedOnlineTotal: accounting.totalExpectedOnline,
      expectedGrandTotal: accounting.totalExpectedGrand,
      difference: cashDifference,
      onlineDifference: onlineDifference,
      totalDifference: totalDifference,
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
    lines.push(`🏁 *OPENING BALANCE:*`);
    lines.push(`• Opening Cash: ${currency} ${(record.openingCash || 0).toLocaleString()}`);
    lines.push(`• Opening Digital: ${currency} ${(record.openingTotalOnline || 0).toLocaleString()}`);
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

    if (record.onlineBalances && record.onlineBalances.length > 0) {
      lines.push(`💳 *DIGITAL & BANK ACCOUNTS:*`);
      record.onlineBalances.forEach(acc => {
        lines.push(`• ${acc.accountName}: ${currency} ${acc.balance.toLocaleString()}`);
      });
      lines.push(`📱 *Total Digital:* ${currency} ${record.totalOnline.toLocaleString()}`);
      lines.push(`----------------------------------------`);
    }

    lines.push(`🏆 *GRAND TOTAL RECONCILED:* ${currency} ${record.grandTotal.toLocaleString()}`);
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
    <div className="space-y-6">
      {/* Top Banner & Date Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <Calculator className="w-5 h-5 text-emerald-600" /> Daily Closing & Cash Drawer
            </h2>
            {isDayFinalized ? (
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                <Lock className="w-3 h-3 text-emerald-700" /> Finalized & Closed
              </span>
            ) : (
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                <Unlock className="w-3 h-3 text-amber-600" /> Reconciling in Progress
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Strict opening → period transactions → closing reconciliation. No historical double-counting.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="p-2 text-slate-500 hover:text-slate-800 rounded-xl hover:bg-slate-100 border border-slate-200 transition cursor-pointer"
              title="Closing Settings"
            >
              <Sliders className="w-4 h-4" />
            </button>
          )}

          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs shadow-2xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="font-semibold text-slate-600">Business Date:</span>
            <input
              type="date"
              value={activeDate}
              onChange={e => setActiveDate(e.target.value)}
              className="font-bold text-slate-900 outline-none bg-transparent cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Status Warning Banner for Finalized Day */}
      {isDayFinalized && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-emerald-900">
                Business Date ({activeDate}) is officially Closed & Locked
              </h4>
              <p className="text-[11px] text-emerald-700 mt-0.5">
                Saved by <strong>{existingClosingForActiveDate?.closedBy || 'Cashier'}</strong> at {existingClosingForActiveDate?.time}. Opening for next day will carry forward from this closing.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handlePrintRecord(existingClosingForActiveDate!)}
              className="px-3 py-1.5 bg-white border border-emerald-200 hover:bg-emerald-100 text-emerald-800 font-bold text-xs rounded-xl shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" /> Print Closing Slip
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
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Unlock className="w-3.5 h-3.5" /> Unlock / Edit Closing
              </button>
            )}
          </div>
        </div>
      )}

      {/* ACCOUNTING LEDGER BREAKDOWN STRIP (OPENING -> INFLOWS -> OUTFLOWS -> EXPECTED) */}
      <div className="bg-slate-900 text-white rounded-2xl p-4.5 space-y-3.5 border border-slate-800 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-200">
              Period Accounting Ledger (After Prev Closing: {accounting.previousClosing ? `${accounting.previousClosing.date} (${accounting.previousClosing.time || ''})` : 'Initial Inception'})
            </h3>
          </div>
          <span className="text-[10px] font-bold text-slate-400">
            Isolated Accounts (Cash ≠ Bank ≠ JazzCash ≠ Easypaisa)
          </span>
        </div>

        {/* Ledger Grid: Cash vs Digital Channels */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* Cash Drawer Channel */}
          <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/80 space-y-1.5">
            <div className="flex justify-between items-center pb-1 border-b border-slate-700">
              <span className="font-bold text-emerald-400 flex items-center gap-1">
                <Wallet className="w-3.5 h-3.5" /> Cash Drawer
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                Op: {currency} {accounting.cash.opening.toLocaleString()}
              </span>
            </div>
            <div className="space-y-0.5 text-[11px] text-slate-300 font-mono">
              <div className="flex justify-between text-emerald-300">
                <span>+ Cash Sales ({accounting.periodSales.filter(s => normalizePaymentChannel(s.paymentMethod) === 'Cash').length}):</span>
                <span>+{accounting.cash.sales.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-emerald-300">
                <span>+ Khata Recoveries:</span>
                <span>+{accounting.cash.khataRecoveries.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-rose-300">
                <span>- Cash Expenses:</span>
                <span>-{accounting.cash.expenses.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-rose-300">
                <span>- Supplier Payments:</span>
                <span>-{accounting.cash.supplierPayments.toLocaleString()}</span>
              </div>
            </div>
            <div className="pt-1.5 border-t border-slate-700 flex justify-between items-center font-bold">
              <span className="text-slate-400 text-[10px]">Expected Cash:</span>
              <span className="font-mono text-emerald-400 text-sm">
                {currency} {accounting.cash.expectedClosing.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Bank Accounts Channel */}
          <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/80 space-y-1.5">
            <div className="flex justify-between items-center pb-1 border-b border-slate-700">
              <span className="font-bold text-blue-400 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" /> Bank Account
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                Op: {currency} {accounting.bank.opening.toLocaleString()}
              </span>
            </div>
            <div className="space-y-0.5 text-[11px] text-slate-300 font-mono">
              <div className="flex justify-between text-blue-300">
                <span>+ Bank Sales:</span>
                <span>+{accounting.bank.sales.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-blue-300">
                <span>+ Khata Bank Recoveries:</span>
                <span>+{accounting.bank.khataRecoveries.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-rose-300">
                <span>- Bank Expenses / Pur:</span>
                <span>-{(accounting.bank.expenses + accounting.bank.supplierPayments).toLocaleString()}</span>
              </div>
            </div>
            <div className="pt-1.5 border-t border-slate-700 flex justify-between items-center font-bold">
              <span className="text-slate-400 text-[10px]">Expected Bank:</span>
              <span className="font-mono text-blue-400 text-sm">
                {currency} {accounting.bank.expectedClosing.toLocaleString()}
              </span>
            </div>
          </div>

          {/* JazzCash Channel */}
          <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/80 space-y-1.5">
            <div className="flex justify-between items-center pb-1 border-b border-slate-700">
              <span className="font-bold text-amber-400 flex items-center gap-1">
                <Smartphone className="w-3.5 h-3.5" /> JazzCash
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                Op: {currency} {accounting.jazzCash.opening.toLocaleString()}
              </span>
            </div>
            <div className="space-y-0.5 text-[11px] text-slate-300 font-mono">
              <div className="flex justify-between text-amber-300">
                <span>+ JazzCash Sales:</span>
                <span>+{accounting.jazzCash.sales.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-amber-300">
                <span>+ Khata Recoveries:</span>
                <span>+{accounting.jazzCash.khataRecoveries.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-rose-300">
                <span>- Expenses / Outflows:</span>
                <span>-{(accounting.jazzCash.expenses + accounting.jazzCash.supplierPayments).toLocaleString()}</span>
              </div>
            </div>
            <div className="pt-1.5 border-t border-slate-700 flex justify-between items-center font-bold">
              <span className="text-slate-400 text-[10px]">Expected JazzCash:</span>
              <span className="font-mono text-amber-400 text-sm">
                {currency} {accounting.jazzCash.expectedClosing.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Easypaisa Channel */}
          <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/80 space-y-1.5">
            <div className="flex justify-between items-center pb-1 border-b border-slate-700">
              <span className="font-bold text-emerald-400 flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5" /> Easypaisa
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                Op: {currency} {accounting.easypaisa.opening.toLocaleString()}
              </span>
            </div>
            <div className="space-y-0.5 text-[11px] text-slate-300 font-mono">
              <div className="flex justify-between text-emerald-300">
                <span>+ Easypaisa Sales:</span>
                <span>+{accounting.easypaisa.sales.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-emerald-300">
                <span>+ Khata Recoveries:</span>
                <span>+{accounting.easypaisa.khataRecoveries.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-rose-300">
                <span>- Expenses / Outflows:</span>
                <span>-{(accounting.easypaisa.expenses + accounting.easypaisa.supplierPayments).toLocaleString()}</span>
              </div>
            </div>
            <div className="pt-1.5 border-t border-slate-700 flex justify-between items-center font-bold">
              <span className="text-slate-400 text-[10px]">Expected Easypaisa:</span>
              <span className="font-mono text-emerald-400 text-sm">
                {currency} {accounting.easypaisa.expectedClosing.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Grand Summary Strip: 3 Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-4">
        {/* Physical Cash Card */}
        <div className="bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-2.5 sm:p-4.5 shadow-xs transition hover:border-emerald-400 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1 sm:mb-2">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1 sm:gap-1.5 line-clamp-1">
              <Wallet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="truncate">Physical Cash</span>
            </span>
            <span className="text-[9px] sm:text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 sm:px-2 sm:py-0.5 rounded-full shrink-0">
              Counted
            </span>
          </div>
          <h3 className="text-sm sm:text-2xl font-extrabold font-mono text-emerald-600 tabular-nums truncate">
            {currency} {totalPhysicalCash.toLocaleString()}
          </h3>
          <div className="flex justify-between text-[10px] sm:text-xs text-slate-500 mt-1 truncate">
            <span className="truncate">Exp: {currency} {accounting.totalExpectedCash.toLocaleString()}</span>
            <span className={`font-bold font-mono shrink-0 ml-1 ${cashDifference === 0 ? 'text-emerald-600' : cashDifference > 0 ? 'text-blue-600' : 'text-rose-600'}`}>
              {cashDifference === 0 ? '0' : `${cashDifference > 0 ? '+' : ''}${currency} ${cashDifference.toLocaleString()}`}
            </span>
          </div>
        </div>

        {/* Online Accounts Card */}
        <div className="bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-2.5 sm:p-4.5 shadow-xs transition hover:border-blue-400 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1 sm:mb-2">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1 sm:gap-1.5 line-clamp-1">
              <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="truncate">Digital Balances</span>
            </span>
            <span className="text-[9px] sm:text-[10px] font-extrabold text-blue-700 bg-blue-50 px-1.5 py-0.2 sm:px-2 sm:py-0.5 rounded-full shrink-0">
              {(data.onlineAccounts || []).length} A/C
            </span>
          </div>
          <h3 className="text-sm sm:text-2xl font-extrabold font-mono text-blue-600 tabular-nums truncate">
            {currency} {totalOnlineBalance.toLocaleString()}
          </h3>
          <div className="flex justify-between text-[10px] sm:text-xs text-slate-500 mt-1 truncate">
            <span className="truncate">Exp: {currency} {accounting.totalExpectedOnline.toLocaleString()}</span>
            <span className={`font-bold font-mono shrink-0 ml-1 ${onlineDifference === 0 ? 'text-emerald-600' : onlineDifference > 0 ? 'text-blue-600' : 'text-rose-600'}`}>
              {onlineDifference === 0 ? '0' : `${onlineDifference > 0 ? '+' : ''}${currency} ${onlineDifference.toLocaleString()}`}
            </span>
          </div>
        </div>

        {/* Grand Total Card */}
        <div className="col-span-2 sm:col-span-1 bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-xl sm:rounded-2xl p-2.5 sm:p-4.5 shadow-lg border border-indigo-900/50 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1 sm:mb-2">
            <span className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-emerald-400 flex items-center gap-1 sm:gap-1.5 line-clamp-1">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">Grand Total Reconciled</span>
            </span>
            <span className="text-[9px] sm:text-[10px] font-bold text-slate-300 bg-white/10 px-1.5 py-0.2 sm:px-2 sm:py-0.5 rounded-full shrink-0">
              Cash + Digital
            </span>
          </div>
          <h3 className="text-sm sm:text-2xl font-extrabold font-mono text-white tabular-nums truncate">
            {currency} {grandTotal.toLocaleString()}
          </h3>
          <div className="mt-1 flex items-center justify-between text-[10px] sm:text-[11px] text-slate-300 truncate">
            <span className="truncate">Exp: {currency} {accounting.totalExpectedGrand.toLocaleString()}</span>
            {totalDifference === 0 ? (
              <span className="text-emerald-400 font-bold flex items-center gap-1 shrink-0 ml-1">
                <CheckCircle2 className="w-3 h-3" /> Matched
              </span>
            ) : totalDifference > 0 ? (
              <span className="text-blue-300 font-bold font-mono shrink-0 ml-1">
                +{currency} {totalDifference.toLocaleString()}
              </span>
            ) : (
              <span className="text-rose-400 font-bold font-mono shrink-0 ml-1">
                {currency} {totalDifference.toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Closing Entry Section: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Cash Notes Denomination Table */}
        <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-2xl p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Wallet className="w-4 h-4 text-emerald-600" /> Physical Cash Notes Counter
              </h3>
              <p className="text-[11px] text-slate-400">
                Count notes in cash drawer at closing
              </p>
            </div>
            {!isDayFinalized && (
              <button
                type="button"
                onClick={handleClearDenominations}
                className="text-xs font-semibold text-slate-500 hover:text-rose-600 flex items-center gap-1 transition cursor-pointer"
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
                      <td className="p-2.5 font-bold text-slate-900 font-mono">
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
                          placeholder="0"
                          className="w-24 text-center font-mono font-bold text-xs bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 focus:outline-none focus:border-emerald-600 focus:bg-white disabled:opacity-75 disabled:cursor-not-allowed"
                        />
                      </td>

                      <td className="p-2.5 text-right font-mono font-extrabold text-slate-900 tabular-nums">
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
                      placeholder="0"
                      className="w-24 text-right font-mono font-bold text-xs bg-white border border-slate-200 rounded-lg py-1 px-2 focus:outline-none focus:border-emerald-600 disabled:opacity-75 disabled:cursor-not-allowed"
                    />
                  </td>
                </tr>

                {/* Total Cash Notes Row */}
                <tr className="bg-emerald-50/60 border-t-2 border-emerald-200">
                  <td colSpan={2} className="p-3 font-extrabold text-slate-900 text-xs">
                    Total Physical Counted Cash:
                  </td>
                  <td className="p-3 text-right font-mono font-extrabold text-emerald-700 text-sm tabular-nums">
                    {currency} {totalPhysicalCash.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Mobile 2-Column Denomination Grid (< lg: breakpoint) */}
          <div className="block lg:hidden space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              {PAK_DENOMINATIONS.map(denom => {
                const count = denominations[denom.toString()] || 0;
                const rowSubtotal = denom * count;

                return (
                  <div
                    key={denom}
                    className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 flex flex-col justify-between space-y-2 shadow-2xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs font-mono bg-emerald-100/80 text-emerald-800 px-2 py-0.5 rounded-lg border border-emerald-200">
                        Rs. {denom.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-slate-400 font-bold">Note</span>
                    </div>

                    <div className="flex items-center gap-1.5">
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
                        placeholder="Qty (0)"
                        className="w-full text-center font-mono font-bold text-sm bg-white border border-slate-300 rounded-xl py-2 px-2 focus:outline-none focus:border-emerald-600 min-h-[44px] shadow-2xs"
                      />
                    </div>

                    <div className="flex justify-between items-center text-[11px] pt-1.5 border-t border-slate-200/60 font-mono">
                      <span className="text-slate-400 text-[10px]">Total:</span>
                      <span className="font-extrabold text-slate-800 tabular-nums">
                        {currency} {rowSubtotal.toLocaleString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Loose Coins Card */}
            <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-3.5 flex items-center justify-between gap-2">
              <div>
                <span className="font-bold text-xs text-amber-900 block">Loose Coins / Change</span>
                <span className="text-[10px] text-amber-700">Enter loose coin amount</span>
              </div>
              <input
                type="number"
                min="0"
                disabled={isDayFinalized}
                value={coins === '' ? '' : coins}
                onChange={e =>
                  setCoins(e.target.value === '' ? '' : Number(e.target.value))
                }
                placeholder="0"
                className="w-28 text-right font-mono font-bold text-xs bg-white border border-amber-300 rounded-xl p-2.5 focus:outline-none focus:border-amber-600 min-h-[44px]"
              />
            </div>

            {/* Mobile Total Physical Cash Banner */}
            <div className="bg-emerald-600 text-white rounded-2xl p-3.5 flex items-center justify-between shadow-md shadow-emerald-600/20">
              <span className="font-black text-xs">Total Physical Counted Cash:</span>
              <span className="font-mono font-black text-base tabular-nums">
                {currency} {totalPhysicalCash.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Digital Accounts & Finalize Action */}
        <div className="lg:col-span-5 space-y-4">
          {/* Digital Accounts Input Card */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-600" /> Digital Accounts Count
                </h3>
                <p className="text-[11px] text-slate-400">
                  Enter counted closing balance for each account
                </p>
              </div>

              {!isDayFinalized && (
                <button
                  type="button"
                  onClick={() => setIsAddAccountModalOpen(true)}
                  className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Account
                </button>
              )}
            </div>

            {/* Online Accounts Inputs */}
            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {(data.onlineAccounts || []).length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs">
                  No digital accounts configured. Click "+ Add Account" to configure.
                </div>
              ) : (
                (data.onlineAccounts || []).map(acc => {
                  const val = onlineBalances[acc.id] ?? '';
                  const expectedAcc = accounting.onlineAccounts.find(a => a.accountId === acc.id)?.expectedClosing ?? 0;

                  return (
                    <div
                      key={acc.id}
                      className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-slate-50 transition space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900 text-xs truncate">
                              {acc.name}
                            </span>
                            <span className="text-[10px] bg-slate-200 px-1.5 py-0.2 rounded font-semibold text-slate-600 shrink-0">
                              {acc.bankType || 'Wallet'}
                            </span>
                          </div>
                          {acc.accountNumber && (
                            <p className="text-[10px] text-slate-400 font-mono truncate">
                              {acc.accountNumber}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <input
                            type="number"
                            min="0"
                            disabled={isDayFinalized}
                            value={val}
                            onChange={e =>
                              setOnlineBalances(prev => ({
                                ...prev,
                                [acc.id]: e.target.value === '' ? '' : Number(e.target.value),
                              }))
                            }
                            placeholder="0"
                            className="w-28 text-right font-mono font-bold text-xs bg-white border border-slate-200 rounded-lg py-1 px-2 focus:outline-none focus:border-blue-600 disabled:opacity-75 disabled:cursor-not-allowed"
                          />

                          {isAdmin && !isDayFinalized && (
                            <button
                              type="button"
                              onClick={() => setAccountToDelete(acc)}
                              className="text-slate-300 hover:text-rose-600 p-1 rounded transition cursor-pointer"
                              title="Delete Account"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono pt-0.5 border-t border-slate-200/50">
                        <span>Expected: {currency} {expectedAcc.toLocaleString()}</span>
                        {val !== '' && (
                          <span className={Number(val) - expectedAcc === 0 ? 'text-emerald-600' : 'text-amber-600'}>
                            Diff: {Number(val) - expectedAcc >= 0 ? '+' : ''}{currency} {(Number(val) - expectedAcc).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Total Online Balances */}
            <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-600">Total Counted Digital:</span>
              <span className="font-mono font-bold text-blue-600 text-sm tabular-nums">
                {currency} {totalOnlineBalance.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Closing Finalization Box */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-3.5 shadow-xs">
            <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider text-slate-500 flex items-center justify-between">
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
                <label className="block font-semibold text-slate-700 mb-1">
                  Cashier / Staff Name *
                </label>
                <input
                  type="text"
                  disabled={isDayFinalized}
                  value={closedBy}
                  onChange={e => setClosedBy(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-emerald-600 focus:bg-white transition disabled:opacity-75 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Closing Notes & Explanations (Optional)
                </label>
                <textarea
                  rows={2}
                  disabled={isDayFinalized}
                  value={closingNotes}
                  onChange={e => setClosingNotes(e.target.value)}
                  placeholder="Any shift notes, cash shortages, or hand-over instructions..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-emerald-600 focus:bg-white transition resize-none disabled:opacity-75 disabled:cursor-not-allowed"
                />
              </div>

              {/* Summary of Expected vs Counted */}
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/70 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">System Expected Total:</span>
                  <span className="font-mono font-bold text-slate-700">
                    {currency} {accounting.totalExpectedGrand.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Counted Grand Total:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {currency} {grandTotal.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200">
                  <span className="font-bold text-slate-700">Net Difference:</span>
                  <span
                    className={`font-mono font-bold ${
                      totalDifference === 0
                        ? 'text-emerald-600'
                        : totalDifference > 0
                        ? 'text-blue-600'
                        : 'text-rose-600'
                    }`}
                  >
                    {totalDifference > 0 ? '+' : ''}
                    {currency} {totalDifference.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              {!isDayFinalized ? (
                <button
                  type="button"
                  onClick={handleFinalizeClosing}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white text-xs font-extrabold rounded-xl shadow-md shadow-emerald-500/25 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <Lock className="w-4 h-4" />
                  <span>Commit & Finalize Daily Closing ({activeDate})</span>
                </button>
              ) : (
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900 text-center space-y-1">
                  <p className="text-xs font-bold flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Day Closed & Recorded
                  </p>
                  <p className="text-[10px] text-emerald-700">
                    Immutable record saved to system ledger. Opening balances for next day are set.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* History & Past Closings Section */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600" /> Daily Closing Records History ({filteredHistory.length})
            </h3>
            <p className="text-[11px] text-slate-400">
              Audit opening balances, cash note breakdowns, digital accounts, and reconciliation differences
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              {(['all', 'daily', 'weekly', 'monthly', 'yearly'] as const).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    setHistoryFilter(f);
                    setFilterDate('');
                  }}
                  className={`px-2.5 py-1 rounded-lg font-bold capitalize transition cursor-pointer ${
                    historyFilter === f && !filterDate
                      ? 'bg-white text-emerald-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'daily' ? 'Today' : f}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1">
              <span className="text-[11px] text-slate-500 font-semibold">Date:</span>
              <input
                type="date"
                value={filterDate}
                onChange={e => {
                  setFilterDate(e.target.value);
                  setHistoryFilter('all');
                }}
                className="bg-transparent font-medium text-xs outline-none text-slate-800 cursor-pointer"
              />
              {filterDate && (
                <button
                  type="button"
                  onClick={() => setFilterDate('')}
                  className="text-slate-400 hover:text-slate-600 text-xs ml-1"
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
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              title="Download detailed PDF report for selected period"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PDF Report</span>
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
                  <th className="p-3 text-right">Digital Balances</th>
                  <th className="p-3 text-right">Grand Total</th>
                  <th className="p-3 text-right">Difference</th>
                  <th className="p-3 text-center">Share / Print</th>
                  <th className="p-3 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-10 text-slate-400">
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
                        <div className="font-bold text-slate-900 font-mono group-hover:text-emerald-700 flex items-center gap-1.5">
                          <span>{record.date}</span>
                          <span className="opacity-0 max-lg:opacity-100 group-hover:opacity-100 text-[10px] text-emerald-600 bg-emerald-100/70 px-1.5 py-0.2 rounded font-sans transition">
                            Inspect →
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {record.time}
                        </div>
                      </td>

                      <td className="p-3 text-slate-700 font-medium">
                        {record.closedBy || 'Cashier'}
                      </td>

                      <td className="p-3 text-right font-mono text-slate-500">
                        {currency} {(record.openingCash || 0).toLocaleString()}
                      </td>

                      <td className="p-3 text-right font-mono font-bold text-emerald-600 tabular-nums">
                        {currency} {record.totalCash.toLocaleString()}
                      </td>

                      <td className="p-3 text-right font-mono font-bold text-blue-600 tabular-nums">
                        {currency} {record.totalOnline.toLocaleString()}
                      </td>

                      <td className="p-3 text-right font-mono font-extrabold text-slate-900 text-sm tabular-nums">
                        {currency} {record.grandTotal.toLocaleString()}
                      </td>

                      <td className="p-3 text-right font-mono font-bold">
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

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 text-xs">
              <div className="p-2.5 sm:p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400">Opening Cash</span>
                <p className="text-sm sm:text-base font-extrabold font-mono text-slate-800 mt-0.5 truncate">
                  {currency} {(selectedHistoryRecord.openingCash || 0).toLocaleString()}
                </p>
              </div>
              <div className="p-2.5 sm:p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                <span className="text-[10px] uppercase font-bold text-emerald-700">Counted Cash</span>
                <p className="text-sm sm:text-base font-extrabold font-mono text-emerald-700 mt-0.5 truncate">
                  {currency} {selectedHistoryRecord.totalCash.toLocaleString()}
                </p>
              </div>
              <div className="col-span-2 sm:col-span-1 p-2.5 sm:p-3 bg-blue-50 rounded-xl border border-blue-200">
                <span className="text-[10px] uppercase font-bold text-blue-700">Counted Digital</span>
                <p className="text-sm sm:text-base font-extrabold font-mono text-blue-700 mt-0.5 truncate">
                  {currency} {selectedHistoryRecord.totalOnline.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Notes Breakdown */}
            <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-200 space-y-2 text-xs">
              <h4 className="font-bold text-slate-700 text-xs">Physical Notes Breakdown:</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
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

            {/* Digital Accounts Breakdown */}
            {selectedHistoryRecord.onlineBalances && selectedHistoryRecord.onlineBalances.length > 0 && (
              <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-200 space-y-2 text-xs">
                <h4 className="font-bold text-slate-700 text-xs">Digital Accounts Balances:</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                  {selectedHistoryRecord.onlineBalances.map(acc => (
                    <div key={acc.accountId} className="p-2 bg-white rounded-lg border border-slate-200">
                      <span className="text-slate-500 font-semibold block">{acc.accountName}</span>
                      <strong className="font-mono text-blue-600 text-xs">{currency} {acc.balance.toLocaleString()}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
        <div id="printable-receipt-area" className="hidden font-mono text-xs">
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
            <p className="font-bold text-[10px] uppercase mb-1">Opening Balances:</p>
            <div className="flex justify-between text-[11px]">
              <span>Opening Cash:</span>
              <span>{currency} {(selectedClosingForPrint.openingCash || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span>Opening Digital:</span>
              <span>{currency} {(selectedClosingForPrint.openingTotalOnline || 0).toLocaleString()}</span>
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

          {selectedClosingForPrint.onlineBalances && selectedClosingForPrint.onlineBalances.length > 0 && (
            <div className="border-b border-dashed border-black py-1.5 mb-1.5">
              <p className="font-bold text-[10px] uppercase mb-1">Digital Accounts:</p>
              {selectedClosingForPrint.onlineBalances.map(acc => (
                <div key={acc.accountId} className="flex justify-between text-[11px]">
                  <span>{acc.accountName}</span>
                  <span>{currency} {acc.balance.toLocaleString()}</span>
                </div>
              ))}
              <div className="flex justify-between font-bold text-xs pt-1 border-t border-dotted border-black mt-1">
                <span>Total Digital:</span>
                <span>{currency} {selectedClosingForPrint.totalOnline.toLocaleString()}</span>
              </div>
            </div>
          )}

          <div className="py-1.5">
            <div className="flex justify-between font-extrabold text-sm">
              <span>GRAND CLOSING TOTAL:</span>
              <span>{currency} {selectedClosingForPrint.grandTotal.toLocaleString()}</span>
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

      {/* Add Online Account Modal */}
      {isAddAccountModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm">Add New Digital Account</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddAccountModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateOnlineAccount} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Account / Bank Name *</label>
                <input
                  type="text"
                  required
                  value={newAccountName}
                  onChange={e => setNewAccountName(e.target.value)}
                  placeholder="e.g. Meezan Bank Current, Shop JazzCash"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Channel / Type</label>
                <select
                  value={newBankType}
                  onChange={e => setNewBankType(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-blue-600"
                >
                  <option value="Bank">Bank Account</option>
                  <option value="JazzCash">JazzCash</option>
                  <option value="Easypaisa">Easypaisa</option>
                  <option value="Card">Card Machine</option>
                  <option value="Wallet">Digital Wallet</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Account / IBAN Number (Optional)</label>
                <input
                  type="text"
                  value={newAccountNumber}
                  onChange={e => setNewAccountNumber(e.target.value)}
                  placeholder="0300-1234567 or IBAN"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Account Title (Optional)</label>
                <input
                  type="text"
                  value={newAccountTitle}
                  onChange={e => setNewAccountTitle(e.target.value)}
                  placeholder="Account Holder Name"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddAccountModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/20"
                >
                  Save Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Account Modal */}
      <ConfirmModal
        isOpen={!!accountToDelete}
        title="Delete Digital Account"
        message={`Are you sure you want to remove account "${accountToDelete?.name}"? Existing saved closing records will remain safe.`}
        confirmText="Yes, Delete"
        cancelText="Cancel"
        isDestructive={true}
        onConfirm={() => {
          if (accountToDelete) {
            onDeleteOnlineAccount(accountToDelete.id);
            showToast(`Account "${accountToDelete.name}" removed`, 'info');
            setAccountToDelete(null);
          }
        }}
        onClose={() => setAccountToDelete(null)}
      />

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
