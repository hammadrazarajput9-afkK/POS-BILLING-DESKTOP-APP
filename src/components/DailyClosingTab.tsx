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
  X
} from 'lucide-react';
import { useToast } from './Toast';
import { ConfirmModal } from './ConfirmModal';
import { generatePdfReport } from '../utils/pdfGenerator';

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

// 75 Rupee note removed as per user instruction
const PAK_DENOMINATIONS = [5000, 1000, 500, 100, 50, 20, 10];

export const DailyClosingTab: React.FC<DailyClosingTabProps> = ({
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
  const currency = data.settings.currency;

  // Active closing form state
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
  const [activeDate, setActiveDate] = useState(() => new Date().toISOString().substring(0, 10));

  // Live Auto-Save status
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const isSyncingFromRecordRef = useRef<boolean>(false);

  // Modals state
  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountNumber, setNewAccountNumber] = useState('');
  const [newAccountTitle, setNewAccountTitle] = useState('');
  const [newBankType, setNewBankType] = useState('Wallet');

  const [accountToDelete, setAccountToDelete] = useState<OnlineAccount | null>(null);
  const [closingToDelete, setClosingToDelete] = useState<DailyClosingRecord | null>(null);
  const [selectedClosingForPrint, setSelectedClosingForPrint] = useState<DailyClosingRecord | null>(null);

  // Interactive Real-Time History Detail Drill-Down Modal
  const [selectedHistoryRecord, setSelectedHistoryRecord] = useState<DailyClosingRecord | null>(null);

  // History filtering state
  const [historyFilter, setHistoryFilter] = useState<'all' | 'daily' | 'weekly' | 'monthly' | 'yearly'>('all');
  const [filterDate, setFilterDate] = useState<string>('');

  // 1. Calculate Total Physical Cash from Denominations
  const totalPhysicalCash = useMemo(() => {
    let sum = 0;
    PAK_DENOMINATIONS.forEach(denom => {
      const count = Number(denominations[denom.toString()]) || 0;
      sum += denom * count;
    });
    sum += Number(coins) || 0;
    return sum;
  }, [denominations, coins]);

  // 2. Calculate Total Online Accounts Balance
  const totalOnlineBalance = useMemo(() => {
    let sum = 0;
    (data.onlineAccounts || []).forEach(acc => {
      const val = Number(onlineBalances[acc.id]) || 0;
      sum += val;
    });
    return sum;
  }, [data.onlineAccounts, onlineBalances]);

  // 3. Grand Total (Cash + Online)
  const grandTotal = totalPhysicalCash + totalOnlineBalance;

  // 4. Expected Cash Calculation from Day's Transactions
  const expectedCashForDate = useMemo(() => {
    const cashSales = data.sales
      .filter(
        s =>
          ((s.paymentMethod || 'Cash').trim().toLowerCase() === 'cash') &&
          s.date.substring(0, 10) === activeDate
      )
      .reduce((acc, s) => {
        const isCredit = s.invoiceType === 'credit';
        const paid = !isCredit
          ? (s.amountPaid !== undefined && s.amountPaid !== null ? s.amountPaid : s.grandTotal)
          : (s.amountPaid !== undefined ? s.amountPaid : 0);
        return acc + paid;
      }, 0);

    const khataCash = data.khata.reduce((acc, c) => {
      const payments = c.history.filter(
        tx => tx.type === 'payment' && tx.date.substring(0, 10) === activeDate
      );
      return acc + payments.reduce((sum, p) => sum + p.amount, 0);
    }, 0);

    const cashExpenses = data.expenses
      .filter(
        e =>
          ((e.paymentMethod || 'Cash').trim().toLowerCase() === 'cash') &&
          e.date.substring(0, 10) === activeDate
      )
      .reduce((acc, e) => acc + e.amount, 0);

    const supplierPaidCash = (data.supplierPurchases || [])
      .filter(
        p =>
          ((p.paymentMethod || 'Cash').trim().toLowerCase() === 'cash') &&
          p.date.substring(0, 10) === activeDate
      )
      .reduce((acc, p) => acc + (p.paidAmount || 0), 0);

    return Math.max(0, cashSales + khataCash - cashExpenses - supplierPaidCash);
  }, [data.sales, data.khata, data.expenses, data.supplierPurchases, activeDate]);

  const cashDifference = totalPhysicalCash - expectedCashForDate;

  // Sync state whenever activeDate changes: load existing closing if present
  useEffect(() => {
    isSyncingFromRecordRef.current = true;
    const existing = (data.dailyClosings || []).find(r => r.date === activeDate);
    if (existing) {
      setDenominations({
        '5000': 0,
        '1000': 0,
        '500': 0,
        '100': 0,
        '50': 0,
        '20': 0,
        '10': 0,
        ...(existing.denominations || {}),
      });
      setCoins(existing.coins || 0);
      const onlineMap: Record<string, number | ''> = {};
      (existing.onlineBalances || []).forEach(b => {
        onlineMap[b.accountId] = b.balance;
      });
      setOnlineBalances(onlineMap);
      setClosedBy(existing.closedBy || 'Counter Cashier');
      setClosingNotes(existing.notes || '');
      setLastSavedTime(existing.time ? `Saved at ${existing.time}` : 'Saved');
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
      setCoins(0);
      setOnlineBalances({});
      setClosingNotes('');
      setLastSavedTime(null);
    }

    const t = setTimeout(() => {
      isSyncingFromRecordRef.current = false;
    }, 100);
    return () => clearTimeout(t);
  }, [activeDate, data.dailyClosings]);

  // AUTO-SAVE: Whenever user updates denominations, coins, online accounts, cashier, or notes, save seamlessly
  useEffect(() => {
    if (isSyncingFromRecordRef.current) return;

    const hasAnyContent =
      totalPhysicalCash > 0 ||
      totalOnlineBalance > 0 ||
      closingNotes.trim() !== '' ||
      (data.dailyClosings || []).some(r => r.date === activeDate);

    if (!hasAnyContent) return;

    const timer = setTimeout(() => {
      const onlineList = (data.onlineAccounts || []).map(acc => ({
        accountId: acc.id,
        accountName: acc.name,
        balance: Number(onlineBalances[acc.id]) || 0,
      }));

      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      onSaveClosing({
        date: activeDate,
        time: timeStr,
        denominations: { ...denominations },
        coins: Number(coins) || 0,
        totalCash: totalPhysicalCash,
        onlineBalances: onlineList,
        totalOnline: totalOnlineBalance,
        grandTotal,
        expectedCash: expectedCashForDate,
        difference: cashDifference,
        closedBy: closedBy.trim() || 'Counter Cashier',
        notes: closingNotes.trim() || undefined,
      });

      setLastSavedTime(`Saved at ${timeStr}`);
    }, 400);

    return () => clearTimeout(timer);
  }, [
    denominations,
    coins,
    onlineBalances,
    closedBy,
    closingNotes,
    activeDate,
    totalPhysicalCash,
    totalOnlineBalance,
    grandTotal,
    expectedCashForDate,
    cashDifference,
  ]);

  // Real-time drilldown transactions for selected history record
  const selectedHistorySales = useMemo(() => {
    if (!selectedHistoryRecord) return [];
    return (data.sales || []).filter(s => s.date.substring(0, 10) === selectedHistoryRecord.date);
  }, [selectedHistoryRecord, data.sales]);

  const selectedHistoryExpenses = useMemo(() => {
    if (!selectedHistoryRecord) return [];
    return (data.expenses || []).filter(e => e.date.substring(0, 10) === selectedHistoryRecord.date);
  }, [selectedHistoryRecord, data.expenses]);

  const selectedHistoryPurchases = useMemo(() => {
    if (!selectedHistoryRecord) return [];
    return (data.supplierPurchases || []).filter(p => p.date === selectedHistoryRecord.date);
  }, [selectedHistoryRecord, data.supplierPurchases]);

  const selectedHistoryKhataRecoveries = useMemo(() => {
    if (!selectedHistoryRecord) return [];
    const list: Array<{ customerName: string; amount: number; note?: string }> = [];
    (data.khata || []).forEach(c => {
      (c.history || []).forEach(tx => {
        if (tx.type === 'payment' && tx.date.substring(0, 10) === selectedHistoryRecord.date) {
          list.push({ customerName: c.name, amount: tx.amount, note: tx.note });
        }
      });
    });
    return list;
  }, [selectedHistoryRecord, data.khata]);

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

  // Save Closing Record
  const handleSaveCurrentClosing = () => {
    if (grandTotal <= 0) {
      showToast('Please enter cash counts or online balances first', 'warning');
      return;
    }

    const onlineList = (data.onlineAccounts || []).map(acc => ({
      accountId: acc.id,
      accountName: acc.name,
      balance: Number(onlineBalances[acc.id]) || 0,
    }));

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    onSaveClosing({
      date: activeDate,
      time: timeStr,
      denominations: { ...denominations },
      coins: Number(coins) || 0,
      totalCash: totalPhysicalCash,
      onlineBalances: onlineList,
      totalOnline: totalOnlineBalance,
      grandTotal,
      expectedCash: expectedCashForDate,
      difference: cashDifference,
      closedBy: closedBy.trim() || 'Counter Cashier',
      notes: closingNotes.trim() || undefined,
    });

    showToast('Daily closing record saved successfully!', 'success');
    setClosingNotes('');
  };

  // Generate WhatsApp formatted text
  const generateWhatsAppClosingText = (record: DailyClosingRecord): string => {
    const lines: string[] = [];
    lines.push(`📊 *${data.settings.shopName.toUpperCase()}* - DAILY CLOSING REPORT`);
    lines.push(`📅 *Date:* ${record.date}  |  🕒 *Time:* ${record.time}`);
    lines.push(`👤 *Closed By:* ${record.closedBy || 'Cashier'}`);
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
    lines.push(`💰 *Total Physical Cash:* ${currency} ${record.totalCash.toLocaleString()}`);
    lines.push(`----------------------------------------`);

    if (record.onlineBalances && record.onlineBalances.length > 0) {
      lines.push(`💳 *ONLINE & BANK ACCOUNTS:*`);
      record.onlineBalances.forEach(acc => {
        if (acc.balance > 0) {
          lines.push(`• ${acc.accountName}: ${currency} ${acc.balance.toLocaleString()}`);
        }
      });
      lines.push(`🏦 *Total Online Balance:* ${currency} ${record.totalOnline.toLocaleString()}`);
      lines.push(`----------------------------------------`);
    }

    lines.push(`💎 *GRAND CLOSING TOTAL:* ${currency} ${record.grandTotal.toLocaleString()}`);

    if (record.difference !== undefined && record.difference !== 0) {
      const diffLabel = record.difference > 0 ? `Surplus (+${currency} ${record.difference.toLocaleString()})` : `Shortage (-${currency} ${Math.abs(record.difference).toLocaleString()})`;
      lines.push(`⚖️ *Difference:* ${diffLabel}`);
    }

    if (record.notes) {
      lines.push(`📝 *Note:* ${record.notes}`);
    }

    lines.push(`\nCreated by HAMMAD RAZA DEVELOPMENT`);
    return lines.join('\n');
  };

  const handleShareWhatsApp = (record: DailyClosingRecord) => {
    const text = generateWhatsAppClosingText(record);
    const encoded = encodeURIComponent(text);
    const targetPhone = data.tabPreferences?.dailyClosing?.whatsappPhone || '';
    const url = targetPhone
      ? `https://api.whatsapp.com/send?phone=${targetPhone}&text=${encoded}`
      : `https://api.whatsapp.com/send?text=${encoded}`;
    window.open(url, '_blank');
  };

  const handlePrintRecord = (record: DailyClosingRecord) => {
    setSelectedClosingForPrint(record);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  // Filtered History
  const filteredHistory = useMemo(() => {
    const history = data.dailyClosings || [];
    const now = new Date();

    return history.filter(record => {
      if (filterDate) {
        return record.date === filterDate;
      }

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
      {/* Top Banner & Quick Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <Calculator className="w-5 h-5 text-emerald-600" /> Daily Closing
            </h2>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              End-of-Day Reconciliation
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Count cash notes, enter digital account balances, reconcile difference and export records
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
            <span className="font-semibold text-slate-600">Date:</span>
            <input
              type="date"
              value={activeDate}
              onChange={e => setActiveDate(e.target.value)}
              className="font-bold text-slate-900 outline-none bg-transparent cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Grand Summary Strip: 3 Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Physical Cash Card */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4.5 shadow-xs transition hover:border-emerald-400">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-emerald-600" /> Physical Cash Notes
            </span>
            <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
              Counted
            </span>
          </div>
          <h3 className="text-2xl font-extrabold font-mono text-emerald-600 tabular-nums">
            {currency} {totalPhysicalCash.toLocaleString()}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Total from denomination notes & coins
          </p>
        </div>

        {/* Online Accounts Card */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4.5 shadow-xs transition hover:border-blue-400">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-blue-600" /> Digital Accounts
            </span>
            <span className="text-[10px] font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
              {(data.onlineAccounts || []).length} Accounts
            </span>
          </div>
          <h3 className="text-2xl font-extrabold font-mono text-blue-600 tabular-nums">
            {currency} {totalOnlineBalance.toLocaleString()}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Wallets and Bank account balances
          </p>
        </div>

        {/* Grand Total Card */}
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl p-4.5 shadow-lg border border-indigo-900/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> Grand Closing Total
            </span>
            <span className="text-[10px] font-bold text-slate-300 bg-white/10 px-2 py-0.5 rounded-full">
              Cash + Digital
            </span>
          </div>
          <h3 className="text-2xl sm:text-3xl font-extrabold font-mono text-white tabular-nums">
            {currency} {grandTotal.toLocaleString()}
          </h3>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-300">
            {cashDifference === 0 ? (
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Exact match with daily transactions
              </span>
            ) : cashDifference > 0 ? (
              <span className="text-blue-300 font-bold">
                +{currency} {cashDifference.toLocaleString()} surplus
              </span>
            ) : (
              <span className="text-rose-300 font-bold">
                -{currency} {Math.abs(cashDifference).toLocaleString()} shortage
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Closing Entry Section: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Cash Notes Denomination Table (Quick add removed, 75 removed) */}
        <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-2xl p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Wallet className="w-4 h-4 text-emerald-600" /> Daily Cash Notes Counter
              </h3>
              <p className="text-[11px] text-slate-400">
                Enter quantity of each currency note
              </p>
            </div>
            <button
              type="button"
              onClick={handleClearDenominations}
              className="text-xs font-semibold text-slate-500 hover:text-rose-600 flex items-center gap-1 transition cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          </div>

          {/* Notes Rows Table */}
          <div className="border border-slate-200/80 rounded-xl overflow-hidden">
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
                          value={count === 0 ? '' : count}
                          onChange={e =>
                            handleDenomChange(
                              denom,
                              e.target.value === '' ? 0 : Number(e.target.value)
                            )
                          }
                          className="w-24 text-center font-mono font-bold text-xs bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 focus:outline-none focus:border-emerald-600 focus:bg-white"
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
                      value={coins === '' ? '' : coins}
                      onChange={e =>
                        setCoins(e.target.value === '' ? '' : Number(e.target.value))
                      }
                      className="w-24 text-right font-mono font-bold text-xs bg-white border border-slate-200 rounded-lg py-1 px-2 focus:outline-none focus:border-emerald-600"
                    />
                  </td>
                </tr>

                {/* Total Cash Notes Row */}
                <tr className="bg-emerald-50/60 border-t-2 border-emerald-200">
                  <td colSpan={2} className="p-3 font-extrabold text-slate-900 text-xs">
                    Total Physical Cash:
                  </td>
                  <td className="p-3 text-right font-mono font-extrabold text-emerald-700 text-sm tabular-nums">
                    {currency} {totalPhysicalCash.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Online Balances & Closing Submission (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Online Accounts Card */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-600" /> Digital Accounts Balance
                </h3>
                <p className="text-[11px] text-slate-400">
                  Enter closing balances for online accounts
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsAddAccountModalOpen(true)}
                className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add Account
              </button>
            </div>

            {/* Online Accounts Inputs */}
            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {(data.onlineAccounts || []).length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs">
                  No accounts added. Click "Add Account" to configure.
                </div>
              ) : (
                (data.onlineAccounts || []).map(acc => {
                  const val = onlineBalances[acc.id] ?? '';

                  return (
                    <div
                      key={acc.id}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-slate-50 transition gap-2"
                    >
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
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            value={val}
                            onChange={e =>
                              setOnlineBalances(prev => ({
                                ...prev,
                                [acc.id]: e.target.value === '' ? '' : Number(e.target.value),
                              }))
                            }
                            className="w-28 text-right font-mono font-bold text-xs bg-white border border-slate-200 rounded-lg py-1 px-2 focus:outline-none focus:border-blue-600"
                          />
                        </div>

                        {isAdmin && (
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
                  );
                })
              )}
            </div>

            {/* Total Online Balances */}
            <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-600">Total Digital Balance:</span>
              <span className="font-mono font-bold text-blue-600 text-sm tabular-nums">
                {currency} {totalOnlineBalance.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Verification & Live Auto-Save Box (Manual save button removed) */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-3.5 shadow-xs">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider text-slate-500">
                Closing Verification
              </h4>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Auto-Save Enabled
              </span>
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Cashier / Staff Name
                </label>
                <input
                  type="text"
                  value={closedBy}
                  onChange={e => setClosedBy(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-emerald-600 focus:bg-white transition"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Closing Notes (Optional - Auto Saves)
                </label>
                <textarea
                  rows={2}
                  value={closingNotes}
                  onChange={e => setClosingNotes(e.target.value)}
                  placeholder="Any shift notes, balance explanations, or remarks..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-emerald-600 focus:bg-white transition resize-none"
                />
              </div>

              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/70 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">System Expected Cash:</span>
                  <span className="font-mono font-bold text-slate-700">
                    {currency} {expectedCashForDate.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Counted Physical Cash:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {currency} {totalPhysicalCash.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200">
                  <span className="font-bold text-slate-700">Difference:</span>
                  <span
                    className={`font-mono font-bold ${
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

              {/* Live Auto-Save Confirmation Badge (Save Button Removed) */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 border border-emerald-200/90 text-emerald-900">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-xs font-bold">
                    {lastSavedTime ? `Auto-${lastSavedTime}` : 'Auto-Saved in Real Time'}
                  </span>
                </div>
                <span className="text-[10px] font-extrabold text-emerald-700 bg-white border border-emerald-200 px-2 py-0.5 rounded-md">
                  No Save Click Needed
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* History & Past Closings Section */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600" /> Daily Closing Records History
            </h3>
            <p className="text-[11px] text-slate-400">
              Click any date below to inspect all realtime transactions, or download PDF reports
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Multi-Period Filter Buttons */}
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

            {/* Specific Date Picker */}
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

            {/* Export PDF Report Button */}
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
                        type: filterDate ? 'custom' : historyFilter === 'daily' ? 'today' : historyFilter,
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
                  <th className="p-3 text-right">Physical Cash</th>
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
                      title="Click to view full real-time details & entries"
                    >
                      <td className="p-3">
                        <div className="font-bold text-slate-900 font-mono group-hover:text-emerald-700 flex items-center gap-1.5">
                          <span>{record.date}</span>
                          <span className="opacity-0 group-hover:opacity-100 text-[10px] text-emerald-600 bg-emerald-100/70 px-1.5 py-0.2 rounded font-sans transition">
                            View Details →
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {record.time}
                        </div>
                      </td>

                      <td className="p-3 text-slate-700 font-medium">
                        {record.closedBy || 'Cashier'}
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
            Staff: {selectedClosingForPrint.closedBy || 'Cashier'}
          </div>

          <div className="border-t border-dashed border-black pt-1 pb-1">
            <p className="font-bold text-[11px] mb-1">CASH NOTES COUNT:</p>
            {PAK_DENOMINATIONS.map(d => {
              const c = selectedClosingForPrint.denominations[d.toString()] || 0;
              if (c > 0) {
                return (
                  <div key={d} className="flex justify-between text-[10px]">
                    <span>Rs. {d} x {c}</span>
                    <span>Rs. {(d * c).toLocaleString()}</span>
                  </div>
                );
              }
              return null;
            })}
            {selectedClosingForPrint.coins > 0 && (
              <div className="flex justify-between text-[10px]">
                <span>Coins/Change</span>
                <span>Rs. {selectedClosingForPrint.coins.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-[11px] pt-1 border-t border-dotted border-black">
              <span>Total Cash:</span>
              <span>Rs. {selectedClosingForPrint.totalCash.toLocaleString()}</span>
            </div>
          </div>

          {selectedClosingForPrint.onlineBalances && selectedClosingForPrint.onlineBalances.length > 0 && (
            <div className="border-t border-dashed border-black pt-1 pb-1">
              <p className="font-bold text-[11px] mb-1">DIGITAL ACCOUNTS:</p>
              {selectedClosingForPrint.onlineBalances.map(acc => (
                <div key={acc.accountId} className="flex justify-between text-[10px]">
                  <span>{acc.accountName}</span>
                  <span>Rs. {acc.balance.toLocaleString()}</span>
                </div>
              ))}
              <div className="flex justify-between font-bold text-[11px] pt-1 border-t border-dotted border-black">
                <span>Total Digital:</span>
                <span>Rs. {selectedClosingForPrint.totalOnline.toLocaleString()}</span>
              </div>
            </div>
          )}

          <div className="border-t-2 border-black pt-1 pb-1 my-1">
            <div className="flex justify-between font-black text-xs">
              <span>GRAND TOTAL:</span>
              <span>Rs. {selectedClosingForPrint.grandTotal.toLocaleString()}</span>
            </div>
          </div>

          <div className="text-center pt-3 border-t border-dashed border-black text-[9px] mt-2">
            <p className="font-bold">Created by HAMMAD RAZA DEVELOPMENT</p>
          </div>
        </div>
      )}

      {/* Add Online Account Modal */}
      {isAddAccountModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4 border border-slate-100 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-600" /> Add Digital Account
              </h3>
              <button
                type="button"
                onClick={() => setIsAddAccountModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateOnlineAccount} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Account / Bank Name *
                </label>
                <input
                  type="text"
                  required
                  value={newAccountName}
                  onChange={e => setNewAccountName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-blue-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Account Type
                </label>
                <select
                  value={newBankType}
                  onChange={e => setNewBankType(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-semibold focus:outline-none focus:border-blue-600"
                >
                  <option value="Wallet">Mobile Wallet (Easypaisa / JazzCash / Nayapay / Sadapay)</option>
                  <option value="Bank">Bank Account (Meezan / HBL / UBL / etc.)</option>
                  <option value="Cash Drawer">Secondary Cash Drawer</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Account / Mobile Number
                </label>
                <input
                  type="text"
                  value={newAccountNumber}
                  onChange={e => setNewAccountNumber(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono focus:outline-none focus:border-blue-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Account Title
                </label>
                <input
                  type="text"
                  value={newAccountTitle}
                  onChange={e => setNewAccountTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-blue-600 focus:bg-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddAccountModalOpen(false)}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md"
                >
                  Add Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Real-Time History Record Detail Modal */}
      {selectedHistoryRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl space-y-4 border border-slate-100 my-auto animate-in fade-in zoom-in-95 max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                  <Calculator className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                    <span>Daily Closing Record & Realtime Audit</span>
                    <span className="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg">
                      {selectedHistoryRecord.date} • {selectedHistoryRecord.time || 'Shift End'}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Recorded by: <span className="font-semibold text-slate-600">{selectedHistoryRecord.closedBy || 'Cashier'}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintRecord(selectedHistoryRecord)}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition cursor-pointer"
                  title="Print Slip"
                >
                  <Printer className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleShareWhatsApp(selectedHistoryRecord)}
                  className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition cursor-pointer"
                  title="Share WhatsApp"
                >
                  <Share2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedHistoryRecord(null)}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="overflow-y-auto space-y-4 pr-1 text-xs">
              {/* Grand Summary Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl p-3">
                  <span className="text-[10px] font-bold text-emerald-800 uppercase block">Counted Cash</span>
                  <p className="text-base font-extrabold font-mono text-emerald-700 mt-0.5">
                    {currency} {selectedHistoryRecord.totalCash.toLocaleString()}
                  </p>
                </div>
                <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-3">
                  <span className="text-[10px] font-bold text-blue-800 uppercase block">Digital Balances</span>
                  <p className="text-base font-extrabold font-mono text-blue-700 mt-0.5">
                    {currency} {selectedHistoryRecord.totalOnline.toLocaleString()}
                  </p>
                </div>
                <div className="bg-slate-900 text-white rounded-xl p-3">
                  <span className="text-[10px] font-bold text-slate-300 uppercase block">Grand Total</span>
                  <p className="text-base font-extrabold font-mono text-white mt-0.5">
                    {currency} {selectedHistoryRecord.grandTotal.toLocaleString()}
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Reconciliation</span>
                  <p className="text-base font-extrabold font-mono mt-0.5">
                    {selectedHistoryRecord.difference === undefined || selectedHistoryRecord.difference === 0 ? (
                      <span className="text-emerald-600">Exact Match</span>
                    ) : selectedHistoryRecord.difference > 0 ? (
                      <span className="text-blue-600">+{currency} {selectedHistoryRecord.difference.toLocaleString()} Surplus</span>
                    ) : (
                      <span className="text-rose-600">-{currency} {Math.abs(selectedHistoryRecord.difference).toLocaleString()} Shortage</span>
                    )}
                  </p>
                </div>
              </div>

              {selectedHistoryRecord.notes && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
                  <span className="font-bold block text-[11px] mb-0.5">Closing Note:</span>
                  <p className="text-xs">{selectedHistoryRecord.notes}</p>
                </div>
              )}

              {/* 2 Columns: Denominations breakdown + Digital accounts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Denominations Table */}
                <div className="border border-slate-200/80 rounded-xl overflow-hidden bg-white">
                  <div className="bg-slate-50 p-2.5 font-bold text-slate-800 border-b border-slate-200 text-xs flex justify-between">
                    <span>Currency Notes Breakdown</span>
                    <span className="font-mono text-emerald-700">{currency} {selectedHistoryRecord.totalCash.toLocaleString()}</span>
                  </div>
                  <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                    {PAK_DENOMINATIONS.map(d => {
                      const c = selectedHistoryRecord.denominations[d.toString()] || 0;
                      if (c === 0) return null;
                      return (
                        <div key={d} className="flex justify-between items-center p-2 text-xs">
                          <span className="font-semibold text-slate-700">Rs. {d.toLocaleString()}</span>
                          <span className="font-mono text-slate-500">× {c} notes</span>
                          <span className="font-mono font-bold text-slate-900">{currency} {(d * c).toLocaleString()}</span>
                        </div>
                      );
                    })}
                    {selectedHistoryRecord.coins > 0 && (
                      <div className="flex justify-between items-center p-2 text-xs bg-slate-50/50">
                        <span className="font-semibold text-slate-700">Loose Coins / Change</span>
                        <span className="font-mono text-slate-400">-</span>
                        <span className="font-mono font-bold text-slate-900">{currency} {selectedHistoryRecord.coins.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Digital Accounts Table */}
                <div className="border border-slate-200/80 rounded-xl overflow-hidden bg-white">
                  <div className="bg-slate-50 p-2.5 font-bold text-slate-800 border-b border-slate-200 text-xs flex justify-between">
                    <span>Digital & Online Accounts</span>
                    <span className="font-mono text-blue-700">{currency} {selectedHistoryRecord.totalOnline.toLocaleString()}</span>
                  </div>
                  <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                    {(selectedHistoryRecord.onlineBalances || []).length === 0 ? (
                      <div className="p-4 text-center text-slate-400 text-xs">No digital accounts recorded for this date</div>
                    ) : (
                      selectedHistoryRecord.onlineBalances.map(acc => (
                        <div key={acc.accountId} className="flex justify-between items-center p-2 text-xs">
                          <span className="font-semibold text-slate-700">{acc.accountName}</span>
                          <span className="font-mono font-bold text-slate-900">{currency} {acc.balance.toLocaleString()}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Realtime Transactions Logged on this Date */}
              <div className="border border-slate-200/80 rounded-2xl p-4 bg-slate-50/60 space-y-3">
                <h4 className="font-extrabold text-slate-900 text-xs uppercase tracking-wider flex items-center justify-between">
                  <span>Day's Realtime Transactions Audit ({selectedHistoryRecord.date})</span>
                  <span className="text-[10px] font-normal text-slate-500">Live matched entries</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
                  {/* Sales */}
                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                      <ShoppingBag className="w-3.5 h-3.5 text-emerald-600" /> Sales ({selectedHistorySales.length})
                    </span>
                    <p className="font-mono font-black text-emerald-600 text-sm mt-1">
                      {currency} {selectedHistorySales.reduce((a, s) => a + (s.amountPaid !== undefined ? s.amountPaid : s.grandTotal), 0).toLocaleString()}
                    </p>
                    <div className="mt-2 space-y-1 max-h-28 overflow-y-auto pr-1">
                      {selectedHistorySales.slice(0, 5).map(s => (
                        <div key={s.invNo} className="text-[10px] flex justify-between text-slate-600">
                          <span className="truncate max-w-[100px]">{s.custName || 'Walk-in'}</span>
                          <span className="font-mono font-bold">{currency} {s.grandTotal.toLocaleString()}</span>
                        </div>
                      ))}
                      {selectedHistorySales.length > 5 && (
                        <p className="text-[9px] text-slate-400">+{selectedHistorySales.length - 5} more sales</p>
                      )}
                    </div>
                  </div>

                  {/* Supplier Purchases */}
                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                      <Truck className="w-3.5 h-3.5 text-amber-600" /> Purchases ({selectedHistoryPurchases.length})
                    </span>
                    <p className="font-mono font-black text-amber-600 text-sm mt-1">
                      {currency} {selectedHistoryPurchases.reduce((a, p) => a + (p.paidAmount || 0), 0).toLocaleString()}
                    </p>
                    <div className="mt-2 space-y-1 max-h-28 overflow-y-auto pr-1">
                      {selectedHistoryPurchases.slice(0, 5).map(p => (
                        <div key={p.id} className="text-[10px] flex justify-between text-slate-600">
                          <span className="truncate max-w-[100px]">{p.partyName}</span>
                          <span className="font-mono font-bold">{currency} {(p.paidAmount || 0).toLocaleString()}</span>
                        </div>
                      ))}
                      {selectedHistoryPurchases.length > 5 && (
                        <p className="text-[9px] text-slate-400">+{selectedHistoryPurchases.length - 5} more bills</p>
                      )}
                    </div>
                  </div>

                  {/* Expenses */}
                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                      <Receipt className="w-3.5 h-3.5 text-rose-600" /> Expenses ({selectedHistoryExpenses.length})
                    </span>
                    <p className="font-mono font-black text-rose-600 text-sm mt-1">
                      {currency} {selectedHistoryExpenses.reduce((a, e) => a + (e.amount || 0), 0).toLocaleString()}
                    </p>
                    <div className="mt-2 space-y-1 max-h-28 overflow-y-auto pr-1">
                      {selectedHistoryExpenses.slice(0, 5).map(e => (
                        <div key={e.id} className="text-[10px] flex justify-between text-slate-600">
                          <span className="truncate max-w-[100px]">{e.description}</span>
                          <span className="font-mono font-bold">{currency} {e.amount.toLocaleString()}</span>
                        </div>
                      ))}
                      {selectedHistoryExpenses.length > 5 && (
                        <p className="text-[9px] text-slate-400">+{selectedHistoryExpenses.length - 5} more expenses</p>
                      )}
                    </div>
                  </div>

                  {/* Khata Recoveries */}
                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                      <BookOpen className="w-3.5 h-3.5 text-purple-600" /> Khata Collected ({selectedHistoryKhataRecoveries.length})
                    </span>
                    <p className="font-mono font-black text-purple-600 text-sm mt-1">
                      {currency} {selectedHistoryKhataRecoveries.reduce((a, k) => a + k.amount, 0).toLocaleString()}
                    </p>
                    <div className="mt-2 space-y-1 max-h-28 overflow-y-auto pr-1">
                      {selectedHistoryKhataRecoveries.slice(0, 5).map((k, idx) => (
                        <div key={idx} className="text-[10px] flex justify-between text-slate-600">
                          <span className="truncate max-w-[100px]">{k.customerName}</span>
                          <span className="font-mono font-bold">{currency} {k.amount.toLocaleString()}</span>
                        </div>
                      ))}
                      {selectedHistoryKhataRecoveries.length > 5 && (
                        <p className="text-[9px] text-slate-400">+{selectedHistoryKhataRecoveries.length - 5} more recoveries</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                End-of-day roznamcha audit
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintRecord(selectedHistoryRecord)}
                  className="px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" /> Print Thermal Slip
                </button>
                <button
                  type="button"
                  onClick={() => handleShareWhatsApp(selectedHistoryRecord)}
                  className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                >
                  <Share2 className="w-3.5 h-3.5" /> WhatsApp Summary
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedHistoryRecord(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Confirmation */}
      <ConfirmModal
        isOpen={!!accountToDelete}
        title="Delete Digital Account"
        message={`Are you sure you want to remove "${accountToDelete?.name}" from your daily closing accounts?`}
        confirmText="Delete Account"
        onConfirm={() => {
          if (accountToDelete) {
            onDeleteOnlineAccount(accountToDelete.id);
            setAccountToDelete(null);
            showToast('Account removed', 'info');
          }
        }}
        onClose={() => setAccountToDelete(null)}
      />

      {/* Delete Closing Record Confirmation */}
      <ConfirmModal
        isOpen={!!closingToDelete}
        title="Delete Closing Record"
        message={`Are you sure you want to delete the daily closing record of date ${closingToDelete?.date}?`}
        confirmText="Delete Record"
        onConfirm={() => {
          if (closingToDelete) {
            onDeleteClosing(closingToDelete.id);
            setClosingToDelete(null);
            showToast('Closing record deleted', 'info');
          }
        }}
        onClose={() => setClosingToDelete(null)}
      />
    </div>
  );
};
