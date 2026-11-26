import React, { useState, useMemo, useEffect } from 'react';
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
  Download,
  X,
  Lock,
  Unlock,
  ShieldCheck,
  ArrowLeft,
  Eye,
  EyeOff,
  Plus,
  Edit2,
  Smartphone,
  Landmark,
  CreditCard,
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
  onBackToHome?: () => void;
}

const PAK_DENOMINATIONS = [5000, 1000, 500, 100, 50, 20, 10];
const ACCOUNT_CHANNEL_TYPES = [
  'JazzCash',
  'Easypaisa',
  'Bank',
  'SadaPay',
  'NayaPay',
  'Card',
  'Digital Wallet',
  'Other',
];

const getChannelIcon = (bankType?: string) => {
  const t = (bankType || '').toLowerCase();
  if (t.includes('bank')) return Landmark;
  if (t.includes('card')) return CreditCard;
  if (
    t.includes('jazz') ||
    t.includes('easy') ||
    t.includes('sada') ||
    t.includes('naya') ||
    t.includes('wallet')
  ) {
    return Smartphone;
  }
  return Wallet;
};

const DailyClosingTabComponent: React.FC<DailyClosingTabProps> = ({
  data,
  isAdmin = true,
  onSaveClosing,
  onDeleteClosing,
  onAddOnlineAccount,
  onUpdateOnlineAccount,
  onDeleteOnlineAccount,
  onOpenSettings,
  onOpenPdfReport,
  onBackToHome,
}) => {
  const { showToast } = useToast();
  const currency = data.settings.currency || 'Rs.';
  const onlineAccounts = useMemo(() => data.onlineAccounts || [], [data.onlineAccounts]);

  const [activeDate, setActiveDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [activeSubTab, setActiveSubTab] = useState<'tally' | 'accounts' | 'history'>('tally');
  const [hideTotals, setHideTotals] = useState(false);
  const [isUnlockedForEdit, setIsUnlockedForEdit] = useState<boolean>(false);

  // Physical cash notes & coins state
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
  const [onlineBalancesInput, setOnlineBalancesInput] = useState<Record<string, number | ''>>({});
  const [closedBy, setClosedBy] = useState('Counter Cashier');
  const [closingNotes, setClosingNotes] = useState('');

  // Digital Account Add / Edit Modal state
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<OnlineAccount | null>(null);
  const [accountName, setAccountName] = useState('');
  const [accountBankType, setAccountBankType] = useState('JazzCash');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountTitle, setAccountTitle] = useState('');
  const [accountShowInPos, setAccountShowInPos] = useState(true);
  const [accountToDelete, setAccountToDelete] = useState<OnlineAccount | null>(null);

  // Closing record Modals state
  const [closingToDelete, setClosingToDelete] = useState<DailyClosingRecord | null>(null);
  const [selectedClosingForPrint, setSelectedClosingForPrint] = useState<DailyClosingRecord | null>(null);
  const [selectedHistoryRecord, setSelectedHistoryRecord] = useState<DailyClosingRecord | null>(null);

  // History filtering state
  const [historyFilter, setHistoryFilter] = useState<'all' | 'daily' | 'weekly' | 'monthly' | 'yearly'>('all');
  const [filterDate, setFilterDate] = useState<string>('');

  useEffect(() => {
    if (!isAccountModalOpen && !selectedHistoryRecord) return;
    const handleHardwareBack = (e: Event) => {
      if (accountToDelete || closingToDelete) return;
      if (isAccountModalOpen) {
        e.preventDefault();
        setIsAccountModalOpen(false);
      } else if (selectedHistoryRecord) {
        e.preventDefault();
        setSelectedHistoryRecord(null);
      }
    };
    window.addEventListener('pos-hardware-back', handleHardwareBack);
    return () => window.removeEventListener('pos-hardware-back', handleHardwareBack);
  }, [isAccountModalOpen, selectedHistoryRecord, accountToDelete, closingToDelete]);

  // 1. Existing committed closing check for active business date
  const existingClosingForActiveDate = useMemo(() => {
    return (data.dailyClosings || []).find(r => r.date === activeDate);
  }, [data.dailyClosings, activeDate]);

  const isDayFinalized = Boolean(existingClosingForActiveDate) && !isUnlockedForEdit;

  // 2. Compute Master Accounting Summary for active date
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

  // 4. Counted Digital Accounts Total
  const totalOnlineCounted = useMemo(() => {
    return onlineAccounts.reduce((sum, acc) => {
      return sum + (Number(onlineBalancesInput[acc.id]) || 0);
    }, 0);
  }, [onlineAccounts, onlineBalancesInput]);

  // 5. Grand Total & Reconciliation Differences
  const grandTotal = totalPhysicalCash + totalOnlineCounted;
  const cashDifference = totalPhysicalCash - accounting.totalExpectedCash;
  const onlineDifference = totalOnlineCounted - accounting.totalExpectedOnline;
  const totalDifference = grandTotal - accounting.totalExpectedGrand;

  // Sync denomination & digital balances when activeDate / saved closing changes
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

      const savedOnlineMap: Record<string, number | ''> = {};
      onlineAccounts.forEach(acc => {
        const found = existingClosingForActiveDate.onlineBalances?.find(b => b.accountId === acc.id);
        savedOnlineMap[acc.id] = found ? found.balance : '';
      });
      setOnlineBalancesInput(savedOnlineMap);

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
      const initialOnlineMap: Record<string, number | ''> = {};
      accounting.onlineAccounts.forEach(acc => {
        initialOnlineMap[acc.accountId] = acc.expectedClosing !== 0 ? acc.expectedClosing : '';
      });
      setOnlineBalancesInput(initialOnlineMap);
      setClosingNotes('');
    }
  }, [activeDate, existingClosingForActiveDate, onlineAccounts.length]);

  // Ensure newly added digital accounts appear cleanly in input map
  useEffect(() => {
    setOnlineBalancesInput(prev => {
      let changed = false;
      const next = { ...prev };
      onlineAccounts.forEach(acc => {
        if (!(acc.id in next)) {
          next[acc.id] = '';
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [onlineAccounts]);

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

  const handleSyncExpectedDigital = () => {
    const synced: Record<string, number | ''> = {};
    accounting.onlineAccounts.forEach(acc => {
      synced[acc.accountId] = acc.expectedClosing !== 0 ? acc.expectedClosing : 0;
    });
    setOnlineBalancesInput(synced);
    showToast('Digital balances matched to expected system totals', 'info');
  };

  const openAddAccountModal = () => {
    setEditingAccount(null);
    setAccountName('');
    setAccountBankType('JazzCash');
    setAccountNumber('');
    setAccountTitle('');
    setAccountShowInPos(true);
    setIsAccountModalOpen(true);
  };

  const openEditAccountModal = (acc: OnlineAccount) => {
    setEditingAccount(acc);
    setAccountName(acc.name);
    setAccountBankType(acc.bankType || 'Digital Wallet');
    setAccountNumber(acc.accountNumber || '');
    setAccountTitle(acc.accountTitle || '');
    setAccountShowInPos(acc.showInPos !== false);
    setIsAccountModalOpen(true);
  };

  const handleSaveAccountForm = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = accountName.trim();
    if (!cleanName) {
      showToast('Please enter an account name', 'warning');
      return;
    }

    if (editingAccount && onUpdateOnlineAccount) {
      onUpdateOnlineAccount({
        ...editingAccount,
        name: cleanName,
        bankType: accountBankType,
        accountNumber: accountNumber.trim() || undefined,
        accountTitle: accountTitle.trim() || undefined,
        showInPos: accountShowInPos,
      });
    } else {
      onAddOnlineAccount({
        name: cleanName,
        bankType: accountBankType,
        accountNumber: accountNumber.trim() || undefined,
        accountTitle: accountTitle.trim() || undefined,
        showInPos: accountShowInPos,
      });
    }
    setIsAccountModalOpen(false);
  };

  const handleFinalizeClosing = () => {
    if (totalPhysicalCash === 0 && totalOnlineCounted === 0) {
      const confirmZero = window.confirm(
        'Both Physical Cash and Digital Accounts total 0. Are you sure you want to save this closing?'
      );
      if (!confirmZero) return;
    }

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const openingOnlineBalances = accounting.onlineAccounts.map(acc => ({
      accountId: acc.accountId,
      accountName: acc.accountName,
      balance: acc.opening,
    }));

    const onlineBalances = onlineAccounts.map(acc => ({
      accountId: acc.id,
      accountName: acc.name,
      balance: Number(onlineBalancesInput[acc.id]) || 0,
    }));

    const expectedOnlineBalances = accounting.onlineAccounts.map(acc => ({
      accountId: acc.accountId,
      accountName: acc.accountName,
      balance: acc.expectedClosing,
    }));

    onSaveClosing({
      date: activeDate,
      time: timeStr,
      createdAt: now.toISOString(),
      openingCash: accounting.openingCash,
      openingOnlineBalances,
      openingTotalOnline: accounting.openingOnlineTotal,
      openingGrandTotal: accounting.openingGrandTotal,
      denominations: { ...denominations },
      coins: Number(coins) || 0,
      totalCash: totalPhysicalCash,
      onlineBalances,
      totalOnline: totalOnlineCounted,
      grandTotal,
      expectedCash: accounting.totalExpectedCash,
      expectedOnlineBalances,
      expectedOnlineTotal: accounting.totalExpectedOnline,
      expectedGrandTotal: accounting.totalExpectedGrand,
      difference: cashDifference,
      onlineDifference,
      totalDifference,
      closedBy: closedBy.trim() || 'Counter Cashier',
      notes: closingNotes.trim() || undefined,
      status: 'closed',
    });

    setIsUnlockedForEdit(false);
    showToast(`Daily Closing for ${activeDate} finalized and locked!`, 'success');
  };

  const generateWhatsAppClosingText = (record: DailyClosingRecord): string => {
    const lines: string[] = [];
    lines.push(`*${(data.settings.shopName || 'MOBILE SHOP').toUpperCase()}* - DAILY CLOSING`);
    lines.push(`Date: ${record.date} | Time: ${record.time}`);
    lines.push(`Closed By: ${record.closedBy || 'Cashier'}`);
    lines.push(`--------------------------------`);
    lines.push(`Opening Cash: ${currency} ${(record.openingCash || 0).toLocaleString()}`);
    if ((record.openingTotalOnline || 0) > 0) {
      lines.push(`Opening Digital: ${currency} ${(record.openingTotalOnline || 0).toLocaleString()}`);
    }
    lines.push(`--------------------------------`);
    lines.push(`*PHYSICAL CASH NOTES:*`);

    PAK_DENOMINATIONS.forEach(denom => {
      const count = record.denominations[denom.toString()] || 0;
      if (count > 0) {
        lines.push(`• Rs. ${denom.toLocaleString()} x ${count} = ${currency} ${(denom * count).toLocaleString()}`);
      }
    });

    if (record.coins > 0) {
      lines.push(`• Coins/Change = ${currency} ${record.coins.toLocaleString()}`);
    }
    lines.push(`*Physical Cash Total:* ${currency} ${record.totalCash.toLocaleString()}`);

    if (record.onlineBalances && record.onlineBalances.length > 0) {
      lines.push(`--------------------------------`);
      lines.push(`*DIGITAL ACCOUNTS:*`);
      record.onlineBalances.forEach(b => {
        lines.push(`• ${b.accountName}: ${currency} ${(b.balance || 0).toLocaleString()}`);
      });
      lines.push(`*Digital Total:* ${currency} ${(record.totalOnline || 0).toLocaleString()}`);
    }

    lines.push(`--------------------------------`);
    lines.push(`*GRAND CLOSING TOTAL:* ${currency} ${(record.grandTotal || record.totalCash).toLocaleString()}`);
    const diff = record.totalDifference ?? record.difference;
    if (diff !== undefined) {
      lines.push(`Difference: ${diff === 0 ? 'Matched' : `${diff > 0 ? '+' : ''}${currency} ${diff.toLocaleString()}`}`);
    }
    if (record.notes) {
      lines.push(`Notes: ${record.notes}`);
    }

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
      if (historyFilter === 'daily') return record.date === now.toISOString().substring(0, 10);
      if (historyFilter === 'weekly') return new Date(record.date).getTime() >= Date.now() - 7 * 86400000;
      if (historyFilter === 'monthly') return new Date(record.date).getTime() >= Date.now() - 30 * 86400000;
      if (historyFilter === 'yearly') return new Date(record.date).getFullYear() === now.getFullYear();
      return true;
    });
  }, [data.dailyClosings, historyFilter, filterDate]);

  const formatAmt = (val: number) =>
    hideTotals ? `${currency} ••••` : `${currency} ${val.toLocaleString()}`;

  return (
    <div className="space-y-3.5 pb-10 max-w-full overflow-hidden animate-in fade-in duration-200">
      {/* Top Indigo Header + Overlapping White Summary Card */}
      <div>
        <div className="bg-indigo-600 text-white rounded-2xl shadow-sm pt-3.5 pb-11 px-3.5 sm:px-5">
          {/* Row 1: Back, Title, Date Picker & Settings */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {onBackToHome && (
                <button
                  type="button"
                  onClick={onBackToHome}
                  className="lg:hidden w-8 h-8 -ml-1 rounded-full hover:bg-white/15 flex items-center justify-center transition cursor-pointer shrink-0"
                  aria-label="Back to home"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-extrabold tracking-tight truncate">
                  Daily Closing
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <div className="flex items-center gap-1 bg-white/15 hover:bg-white/20 rounded-full px-2.5 py-1 text-[11px] font-bold">
                <Calendar className="w-3 h-3 text-cyan-200 shrink-0" />
                <input
                  type="date"
                  value={activeDate}
                  onChange={e => setActiveDate(e.target.value)}
                  className="bg-transparent text-white font-bold outline-none cursor-pointer w-[108px] sm:w-auto [color-scheme:dark]"
                />
              </div>

              {onOpenSettings && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition cursor-pointer shrink-0"
                  title="Closing Settings"
                >
                  <Sliders className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Row 2: Underline Navigation Tabs */}
          <div className="mt-3.5 flex items-center gap-5 sm:gap-7 border-b border-white/15 overflow-x-auto no-scrollbar">
            {([
              { id: 'tally', label: 'Closing Tally' },
              { id: 'accounts', label: `Digital Accounts (${onlineAccounts.length})` },
              { id: 'history', label: `History (${filteredHistory.length})` },
            ] as const).map(tab => {
              const active = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSubTab(tab.id)}
                  className={`pb-2.5 text-[13px] font-bold transition relative cursor-pointer whitespace-nowrap shrink-0 ${
                    active ? 'text-white' : 'text-indigo-100/80 hover:text-white'
                  }`}
                >
                  {tab.label}
                  {active && (
                    <span className="absolute left-0 right-0 bottom-0 h-[3px] rounded-full bg-cyan-300" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Overlapping White Cash + Digital Reconciliation Summary Card */}
        <div className="-mt-8 mx-2 sm:mx-4 bg-white rounded-2xl border border-slate-200/90 shadow-sm px-3.5 py-3">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <button
              type="button"
              onClick={() => setHideTotals(prev => !prev)}
              className="text-[11px] font-medium text-slate-500 hover:text-slate-700 flex items-center gap-1 cursor-pointer"
            >
              {hideTotals ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span>{hideTotals ? 'Show Amounts' : 'Hide Amounts'}</span>
            </button>

            <div className="flex items-center gap-2 text-[11px] font-bold">
              <span className={isDayFinalized ? 'text-emerald-600 flex items-center gap-1' : 'text-amber-600 flex items-center gap-1'}>
                {isDayFinalized ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                <span>{isDayFinalized ? 'Locked' : 'Open Tally'}</span>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 divide-x divide-slate-100 items-center">
            <div className="pr-3">
              <div className="text-lg sm:text-2xl font-black text-indigo-600 tabular-nums leading-tight truncate">
                {formatAmt(totalPhysicalCash)}
              </div>
              <div className="text-[11px] font-semibold text-slate-500 mt-0.5 truncate">
                Physical Cash
              </div>
            </div>

            <div className="pl-3">
              <div className="text-lg sm:text-2xl font-black text-cyan-600 tabular-nums leading-tight truncate">
                {formatAmt(totalOnlineCounted)}
              </div>
              <div className="text-[11px] font-semibold text-slate-500 mt-0.5 truncate">
                Digital ({onlineAccounts.length} {onlineAccounts.length === 1 ? 'Account' : 'Accounts'})
              </div>
            </div>
          </div>

          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold tabular-nums">
            <span className="text-slate-800 truncate">
              Grand Total: {formatAmt(grandTotal)}
            </span>
            {totalDifference === 0 ? (
              <span className="text-emerald-600 flex items-center gap-1 shrink-0 ml-2">
                <CheckCircle2 className="w-3.5 h-3.5" /> Matched
              </span>
            ) : totalDifference > 0 ? (
              <span className="text-blue-600 shrink-0 ml-2">
                +{currency} {totalDifference.toLocaleString()}
              </span>
            ) : (
              <span className="text-rose-600 shrink-0 ml-2">
                -{currency} {Math.abs(totalDifference).toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* TAB 1: CLOSING TALLY                                              */}
      {/* ================================================================= */}
      {activeSubTab === 'tally' && (
        <div className="space-y-3.5">
          {/* Status Warning Banner for Finalized Day */}
          {isDayFinalized && (
            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-extrabold text-indigo-950">
                    Business Date ({activeDate}) is Closed &amp; Locked
                  </h4>
                  <p className="text-[11px] text-indigo-700 mt-0.5">
                    Saved by <strong>{existingClosingForActiveDate?.closedBy || 'Cashier'}</strong> at {existingClosingForActiveDate?.time}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handlePrintRecord(existingClosingForActiveDate!)}
                  className="h-8 px-3 bg-white border border-indigo-200 hover:bg-indigo-100 text-indigo-800 font-bold text-[11px] rounded-xl transition flex items-center gap-1 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" /> Print Slip
                </button>
                <button
                  type="button"
                  onClick={() => handleShareWhatsApp(existingClosingForActiveDate!)}
                  className="h-8 px-3 bg-white border border-indigo-200 hover:bg-indigo-100 text-indigo-800 font-bold text-[11px] rounded-xl transition flex items-center gap-1 cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" /> Share
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Re-open closing for ${activeDate}? This will unlock counts for editing.`)) {
                        setIsUnlockedForEdit(true);
                        showToast(`Closing for ${activeDate} unlocked`, 'info');
                      }
                    }}
                    className="h-8 px-3 bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] rounded-xl transition flex items-center gap-1 cursor-pointer"
                  >
                    <Unlock className="w-3.5 h-3.5" /> Unlock
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Period Ledger Strip */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="bg-slate-50/90 border-b border-slate-200/80 px-3.5 py-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 truncate">
                  Period Cash &amp; Digital Flow
                </h3>
                <p className="text-[10.5px] font-medium text-slate-500 truncate">
                  Since {accounting.previousClosing ? `${accounting.previousClosing.date}${accounting.previousClosing.time ? ` · ${accounting.previousClosing.time}` : ''}` : 'Initial Inception'}
                </p>
              </div>

              <div className="text-right shrink-0">
                <span className="text-[10px] font-semibold text-slate-500 block">Expected Grand</span>
                <span className="text-xs sm:text-sm font-black text-indigo-700 tabular-nums">
                  {currency} {accounting.totalExpectedGrand.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="p-2.5 sm:p-3.5 grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <span className="text-[10px] font-bold text-slate-500 block">Opening Cash</span>
                <span className="text-xs sm:text-sm font-extrabold text-slate-900 tabular-nums">
                  {currency} {accounting.cash.opening.toLocaleString()}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200/70">
                <span className="text-[10px] font-bold text-emerald-700 block">
                  + Cash Sales ({accounting.periodSales.length})
                </span>
                <span className="text-xs sm:text-sm font-extrabold text-emerald-700 tabular-nums">
                  +{currency} {accounting.cash.sales.toLocaleString()}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-200/70">
                <span className="text-[10px] font-bold text-indigo-700 block">+ Khata Recovery</span>
                <span className="text-xs sm:text-sm font-extrabold text-indigo-700 tabular-nums">
                  +{currency} {accounting.cash.khataRecoveries.toLocaleString()}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-rose-50/70 border border-rose-200/70">
                <span className="text-[10px] font-bold text-rose-700 block">- Expenses</span>
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

          {/* Main 2-Column Closing Workspace */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
            {/* Left Column: Cash Notes + Digital Accounts */}
            <div className="col-span-1 lg:col-span-7 space-y-3.5 min-w-0">
              {/* 1. Physical Cash Notes Counter */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-4 space-y-2.5 shadow-xs">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <div>
                    <h3 className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
                      <Wallet className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span>Physical Cash Notes</span>
                    </h3>
                    <p className="hidden sm:block text-[11px] text-slate-400">
                      Count cash drawer notes &amp; coins
                    </p>
                  </div>
                  {!isDayFinalized && (
                    <button
                      type="button"
                      onClick={handleClearDenominations}
                      className="text-[11px] font-semibold text-slate-500 hover:text-rose-600 flex items-center gap-1 transition cursor-pointer shrink-0"
                    >
                      <RotateCcw className="w-3 h-3" /> Reset
                    </button>
                  )}
                </div>

                {/* Desktop Notes Table */}
                <div className="hidden lg:block border border-slate-200/80 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="p-2.5">Note</th>
                        <th className="p-2.5 text-center">Count</th>
                        <th className="p-2.5 text-right">Subtotal ({currency})</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {PAK_DENOMINATIONS.map(denom => {
                        const count = denominations[denom.toString()] || 0;
                        const rowSubtotal = denom * count;

                        return (
                          <tr key={denom} className="hover:bg-indigo-50/30 transition">
                            <td className="p-2.5 font-bold text-indigo-900 tabular-nums">
                              Rs. {denom.toLocaleString()}
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
                                className="w-20 text-center tabular-nums font-bold text-xs bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 focus:outline-none focus:border-indigo-600 focus:bg-white disabled:opacity-75 disabled:cursor-not-allowed"
                              />
                            </td>
                            <td className="p-2.5 text-right font-extrabold text-slate-900 tabular-nums">
                              {rowSubtotal.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}

                      <tr className="bg-slate-50/60">
                        <td className="p-2.5 font-bold text-slate-700">Loose Coins / Change</td>
                        <td className="p-2.5 text-right font-semibold text-slate-500">Amount:</td>
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
                            className="w-24 text-right tabular-nums font-bold text-xs bg-white border border-slate-200 rounded-lg py-1 px-2 focus:outline-none focus:border-indigo-600 disabled:opacity-75 disabled:cursor-not-allowed"
                          />
                        </td>
                      </tr>

                      <tr className="bg-indigo-50/70 border-t border-indigo-200">
                        <td colSpan={2} className="p-3 font-extrabold text-slate-900 text-xs">
                          Total Physical Cash:
                        </td>
                        <td className="p-3 text-right font-black text-indigo-700 text-sm tabular-nums">
                          {currency} {totalPhysicalCash.toLocaleString()}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Compact Mobile Notes Counter */}
                <div className="block lg:hidden space-y-1.5">
                  {PAK_DENOMINATIONS.map(denom => {
                    const count = denominations[denom.toString()] || 0;
                    const rowSubtotal = denom * count;
                    return (
                      <div
                        key={denom}
                        className="bg-slate-50 border border-slate-200/80 rounded-xl px-2.5 py-1.5 flex items-center justify-between gap-2"
                      >
                        <span className="font-extrabold text-xs tabular-nums text-indigo-900 shrink-0 w-16">
                          Rs. {denom}
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
                          className="compact-mobile-input w-16 text-center tabular-nums font-bold text-xs bg-white border border-slate-300 rounded-lg h-7.5 px-1.5 focus:outline-none focus:border-indigo-600"
                        />
                        <span className="font-bold text-xs text-slate-700 tabular-nums text-right min-w-0 flex-1 truncate">
                          {rowSubtotal > 0 ? rowSubtotal.toLocaleString() : '0'}
                        </span>
                      </div>
                    );
                  })}

                  <div className="bg-amber-50/70 border border-amber-200 rounded-xl px-2.5 py-1.5 flex items-center justify-between gap-2">
                    <span className="font-bold text-xs text-amber-900 shrink-0">Loose Coins</span>
                    <input
                      type="number"
                      min="0"
                      disabled={isDayFinalized}
                      value={coins === '' ? '' : coins}
                      onChange={e =>
                        setCoins(e.target.value === '' ? '' : Number(e.target.value))
                      }
                      placeholder="0"
                      className="compact-mobile-input w-28 text-right tabular-nums font-bold text-xs bg-white border border-amber-300 rounded-lg h-7.5 px-2 focus:outline-none focus:border-amber-600"
                    />
                  </div>

                  <div className="bg-indigo-600 text-white rounded-xl px-3 py-2 flex items-center justify-between shadow-2xs">
                    <span className="font-bold text-xs">Physical Cash Total:</span>
                    <span className="font-black text-xs tabular-nums">
                      {currency} {totalPhysicalCash.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. Digital Accounts Closing Balances */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-4 space-y-3 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <div>
                    <h3 className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
                      <Smartphone className="w-4 h-4 text-cyan-600 shrink-0" />
                      <span>Digital Accounts ({onlineAccounts.length})</span>
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      JazzCash, Easypaisa &amp; Bank balances at closing
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {!isDayFinalized && onlineAccounts.length > 0 && (
                      <button
                        type="button"
                        onClick={handleSyncExpectedDigital}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition cursor-pointer"
                        title="Fill expected balances"
                      >
                        Match Expected
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={openAddAccountModal}
                      className="px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Account</span>
                    </button>
                  </div>
                </div>

                {onlineAccounts.length === 0 ? (
                  <div className="text-center py-6 px-4 bg-slate-50/70 rounded-xl border border-dashed border-slate-300 space-y-2">
                    <Smartphone className="w-7 h-7 mx-auto text-indigo-400" />
                    <p className="text-xs font-bold text-slate-700">No Digital Accounts Added</p>
                    <p className="text-[11px] text-slate-500">
                      Add JazzCash, Easypaisa, or Bank accounts to track closing wallet balances.
                    </p>
                    <button
                      type="button"
                      onClick={openAddAccountModal}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Digital Account
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {onlineAccounts.map(acc => {
                      const summaryAcc = accounting.onlineAccounts.find(a => a.accountId === acc.id);
                      const ChannelIcon = getChannelIcon(acc.bankType);
                      const val = onlineBalancesInput[acc.id];
                      return (
                        <div
                          key={acc.id}
                          className="p-2.5 rounded-xl bg-slate-50/80 border border-slate-200/80 flex items-center justify-between gap-2.5"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className="w-9 h-9 rounded-xl bg-cyan-50 text-cyan-700 flex items-center justify-center shrink-0">
                              <ChannelIcon className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-xs text-slate-900 truncate">
                                  {acc.name}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => openEditAccountModal(acc)}
                                  className="text-slate-400 hover:text-indigo-600 p-0.5 cursor-pointer shrink-0"
                                  title="Edit account"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              </div>
                              <div className="text-[10.5px] text-slate-500 truncate tabular-nums">
                                <span>{acc.bankType || 'Digital Wallet'}</span>
                                {acc.accountNumber && (
                                  <>
                                    <span aria-hidden="true"> · </span>
                                    <span>{acc.accountNumber}</span>
                                  </>
                                )}
                                <span aria-hidden="true"> · </span>
                                <span>Exp: {currency} {(summaryAcc?.expectedClosing || 0).toLocaleString()}</span>
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0 w-28 sm:w-32">
                            <input
                              type="number"
                              min="0"
                              disabled={isDayFinalized}
                              value={val === '' || val === undefined ? '' : val}
                              onChange={e =>
                                setOnlineBalancesInput(prev => ({
                                  ...prev,
                                  [acc.id]: e.target.value === '' ? '' : Number(e.target.value),
                                }))
                              }
                              placeholder="0"
                              className="compact-mobile-input w-full text-right tabular-nums font-extrabold text-xs bg-white border border-slate-300 rounded-xl h-8.5 px-2.5 focus:outline-none focus:border-cyan-600 disabled:opacity-75 disabled:cursor-not-allowed"
                            />
                          </div>
                        </div>
                      );
                    })}

                    <div className="bg-cyan-600 text-white rounded-xl px-3 py-2 flex items-center justify-between shadow-2xs">
                      <span className="font-bold text-xs">Total Digital Accounts:</span>
                      <span className="font-black text-xs tabular-nums">
                        {currency} {totalOnlineCounted.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Verification & Finalize Closing */}
            <div className="col-span-1 lg:col-span-5 bg-white border border-slate-200/90 rounded-2xl p-3.5 sm:p-4 space-y-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h4 className="font-bold text-slate-800 text-xs sm:text-sm">
                  Closing Verification
                </h4>
                <span
                  className={`text-[10.5px] font-bold px-2 py-0.5 rounded-lg ${
                    isDayFinalized ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {isDayFinalized ? 'Locked' : 'Pending'}
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1 text-[11px]">
                    Cashier / Staff Name *
                  </label>
                  <input
                    type="text"
                    disabled={isDayFinalized}
                    value={closedBy}
                    onChange={e => setClosedBy(e.target.value)}
                    className="compact-mobile-input w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium text-xs focus:outline-none focus:border-indigo-600 focus:bg-white transition disabled:opacity-75 disabled:cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1 text-[11px]">
                    Closing Notes (Optional)
                  </label>
                  <input
                    type="text"
                    disabled={isDayFinalized}
                    value={closingNotes}
                    onChange={e => setClosingNotes(e.target.value)}
                    placeholder="Shift notes or shortages..."
                    className="compact-mobile-input w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium text-xs focus:outline-none focus:border-indigo-600 focus:bg-white transition disabled:opacity-75 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-1.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Expected Physical Cash:</span>
                    <span className="tabular-nums font-bold text-slate-700">
                      {currency} {accounting.totalExpectedCash.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Counted Physical Cash:</span>
                    <span className="tabular-nums font-bold text-indigo-700">
                      {currency} {totalPhysicalCash.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-200/80">
                    <span className="text-slate-500">Expected Digital:</span>
                    <span className="tabular-nums font-bold text-slate-700">
                      {currency} {accounting.totalExpectedOnline.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Counted Digital:</span>
                    <span className="tabular-nums font-bold text-cyan-700">
                      {currency} {totalOnlineCounted.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t border-slate-200 font-extrabold text-xs">
                    <span className="text-slate-900">Grand Closing Total:</span>
                    <span className="tabular-nums text-slate-900">
                      {currency} {grandTotal.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold text-slate-600">Net Difference:</span>
                    <span
                      className={`tabular-nums font-bold ${
                        totalDifference === 0
                          ? 'text-emerald-600'
                          : totalDifference > 0
                          ? 'text-blue-600'
                          : 'text-rose-600'
                      }`}
                    >
                      {totalDifference === 0
                        ? 'Matched (0)'
                        : `${totalDifference > 0 ? '+' : '-'}${currency} ${Math.abs(totalDifference).toLocaleString()}`}
                    </span>
                  </div>
                </div>

                {!isDayFinalized ? (
                  <button
                    type="button"
                    onClick={handleFinalizeClosing}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-xs font-extrabold rounded-xl shadow-md shadow-indigo-500/25 transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Finalize Closing ({activeDate})</span>
                  </button>
                ) : (
                  <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900 text-center">
                    <p className="text-[11px] font-bold flex items-center justify-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Day Closed &amp; Recorded
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 2: DIGITAL ACCOUNTS MANAGER                                   */}
      {/* ================================================================= */}
      {activeSubTab === 'accounts' && (
        <div className="space-y-3">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-xs">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                Digital &amp; Bank Accounts
              </h3>
              <p className="text-[11px] text-slate-500">
                Manage JazzCash, Easypaisa, SadaPay, NayaPay &amp; Bank accounts included in Daily Closing
              </p>
            </div>
            <button
              type="button"
              onClick={openAddAccountModal}
              className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Add Digital Account</span>
            </button>
          </div>

          {onlineAccounts.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-2.5 shadow-xs">
              <Smartphone className="w-10 h-10 mx-auto text-indigo-400" />
              <h4 className="text-sm font-extrabold text-slate-800">No Digital Accounts Yet</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Add your shop&apos;s JazzCash, Easypaisa, or Bank accounts so you can reconcile their closing balances every day.
              </p>
              <button
                type="button"
                onClick={openAddAccountModal}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Add First Account
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {onlineAccounts.map(acc => {
                const ChannelIcon = getChannelIcon(acc.bankType);
                const summaryAcc = accounting.onlineAccounts.find(a => a.accountId === acc.id);
                const currentVal = onlineBalancesInput[acc.id];
                return (
                  <div
                    key={acc.id}
                    className="bg-white border border-slate-200/90 rounded-2xl p-3.5 space-y-3 shadow-xs hover:border-indigo-300 transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                          <ChannelIcon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-extrabold text-sm text-slate-900 truncate">
                            {acc.name}
                          </h4>
                          <div className="text-[11px] text-slate-500 truncate">
                            <span>{acc.bankType || 'Digital Wallet'}</span>
                            {acc.accountNumber && (
                              <>
                                <span aria-hidden="true"> · </span>
                                <span className="tabular-nums">{acc.accountNumber}</span>
                              </>
                            )}
                            {acc.accountTitle && (
                              <>
                                <span aria-hidden="true"> · </span>
                                <span>{acc.accountTitle}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditAccountModal(acc)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition cursor-pointer"
                          title="Edit Account"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setAccountToDelete(acc)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                            title="Delete Account"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-[11px] items-center">
                      <div>
                        <span className="text-slate-400 block">Opening</span>
                        <span className="font-bold text-slate-800 tabular-nums">
                          {currency} {(summaryAcc?.opening || 0).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Expected</span>
                        <span className="font-bold text-indigo-700 tabular-nums">
                          {currency} {(summaryAcc?.expectedClosing || 0).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <label className="text-slate-500 font-semibold block mb-0.5">
                          Closing ({activeDate})
                        </label>
                        <input
                          type="number"
                          min="0"
                          disabled={isDayFinalized}
                          value={currentVal === '' || currentVal === undefined ? '' : currentVal}
                          onChange={e =>
                            setOnlineBalancesInput(prev => ({
                              ...prev,
                              [acc.id]: e.target.value === '' ? '' : Number(e.target.value),
                            }))
                          }
                          placeholder="0"
                          className="w-full text-right tabular-nums font-extrabold text-xs bg-slate-50 border border-slate-200 rounded-lg h-8 px-2 focus:outline-none focus:border-indigo-600 focus:bg-white disabled:opacity-75"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 3: CLOSING HISTORY                                            */}
      {/* ================================================================= */}
      {activeSubTab === 'history' && (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-4 space-y-3 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-xs sm:text-sm">
                Closing History ({filteredHistory.length})
              </h3>
              <p className="text-[11px] text-slate-400">
                Tap any record to inspect physical cash &amp; digital balances
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-xs max-w-full">
              <div className="no-scrollbar flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl overflow-x-auto max-w-full shrink-0">
                {(['all', 'daily', 'weekly', 'monthly', 'yearly'] as const).map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => {
                      setHistoryFilter(f);
                      setFilterDate('');
                    }}
                    className={`px-2.5 py-1 rounded-lg font-bold capitalize transition cursor-pointer shrink-0 whitespace-nowrap text-[11px] ${
                      historyFilter === f && !filterDate
                        ? 'bg-white text-indigo-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {f === 'all' ? 'All' : f === 'daily' ? 'Today' : f}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1 h-8">
                <input
                  type="date"
                  value={filterDate}
                  onChange={e => {
                    setFilterDate(e.target.value);
                    setHistoryFilter('all');
                  }}
                  className="bg-transparent font-medium text-[11px] outline-none text-slate-800 cursor-pointer"
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
                    } catch {
                      showToast('Failed to generate PDF', 'error');
                    }
                  }
                }}
                className="h-8 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] rounded-xl shadow-xs transition flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>PDF</span>
              </button>
            </div>
          </div>

          {/* Mobile History Cards */}
          <div className="block md:hidden divide-y divide-slate-100">
            {filteredHistory.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                No closing records found for this period.
              </div>
            ) : (
              filteredHistory.map(record => {
                const diff = record.totalDifference ?? record.difference ?? 0;
                const gTotal = record.grandTotal ?? record.totalCash;
                return (
                  <div
                    key={record.id}
                    onClick={() => setSelectedHistoryRecord(record)}
                    className="py-2.5 flex items-center justify-between gap-2 cursor-pointer active:bg-indigo-50/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-extrabold text-xs text-slate-900 tabular-nums">
                        {record.date} · {record.time}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate tabular-nums">
                        <span>{record.closedBy || 'Cashier'}</span>
                        <span aria-hidden="true"> · </span>
                        <span>Cash {currency} {record.totalCash.toLocaleString()}</span>
                        {(record.totalOnline || 0) > 0 && (
                          <>
                            <span aria-hidden="true"> · </span>
                            <span>Digital {currency} {(record.totalOnline || 0).toLocaleString()}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-black text-xs text-indigo-700 tabular-nums">
                        {currency} {gTotal.toLocaleString()}
                      </div>
                      <div
                        className={`text-[10px] font-bold tabular-nums ${
                          diff === 0 ? 'text-emerald-600' : diff > 0 ? 'text-blue-600' : 'text-rose-600'
                        }`}
                      >
                        {diff === 0 ? 'Matched' : `${diff > 0 ? '+' : '-'}${currency} ${Math.abs(diff).toLocaleString()}`}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop History Table */}
          <div className="hidden md:block border border-slate-200/80 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="p-3">Date &amp; Time</th>
                    <th className="p-3">Staff</th>
                    <th className="p-3 text-right">Physical Cash</th>
                    <th className="p-3 text-right">Digital Accounts</th>
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
                        No closing records found for the selected period.
                      </td>
                    </tr>
                  ) : (
                    filteredHistory.map(record => {
                      const diff = record.totalDifference ?? record.difference ?? 0;
                      const gTotal = record.grandTotal ?? record.totalCash;
                      return (
                        <tr
                          key={record.id}
                          onClick={() => setSelectedHistoryRecord(record)}
                          className="hover:bg-indigo-50/40 cursor-pointer transition"
                        >
                          <td className="p-3">
                            <div className="font-bold text-slate-900 tabular-nums">{record.date}</div>
                            <div className="text-[10px] text-slate-400 tabular-nums">{record.time}</div>
                          </td>
                          <td className="p-3 text-slate-700 font-medium">{record.closedBy || 'Cashier'}</td>
                          <td className="p-3 text-right font-bold text-indigo-700 tabular-nums">
                            {currency} {record.totalCash.toLocaleString()}
                          </td>
                          <td className="p-3 text-right font-bold text-cyan-700 tabular-nums">
                            {currency} {(record.totalOnline || 0).toLocaleString()}
                          </td>
                          <td className="p-3 text-right font-extrabold text-slate-900 text-sm tabular-nums">
                            {currency} {gTotal.toLocaleString()}
                          </td>
                          <td className="p-3 text-right tabular-nums font-bold">
                            {diff === 0 ? (
                              <span className="text-emerald-600 text-[11px]">Matched</span>
                            ) : diff > 0 ? (
                              <span className="text-blue-600 text-[11px]">+{currency} {diff.toLocaleString()}</span>
                            ) : (
                              <span className="text-rose-600 text-[11px]">-{currency} {Math.abs(diff).toLocaleString()}</span>
                            )}
                          </td>
                          <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                            <div className="inline-flex items-center gap-1">
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
                                className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                                title="Print Slip"
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
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* ADD / EDIT DIGITAL ACCOUNT MODAL                                  */}
      {/* ================================================================= */}
      {isAccountModalOpen && (
        <div
          onClick={() => setIsAccountModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 glass-modal-backdrop"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="glass-modal-panel animate-modal-pop rounded-2xl max-w-md w-full p-4 sm:p-5 space-y-4 max-h-[82dvh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-indigo-600" />
                <span>{editingAccount ? 'Edit Digital Account' : 'Add Digital Account'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsAccountModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAccountForm} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Account Name *</label>
                <input
                  type="text"
                  required
                  value={accountName}
                  onChange={e => setAccountName(e.target.value)}
                  placeholder="e.g., Shop JazzCash, Meezan Bank..."
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-600 outline-none font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5">Channel Type</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {ACCOUNT_CHANNEL_TYPES.map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setAccountBankType(type)}
                      className={`py-1.5 px-2 rounded-xl text-[11px] font-bold border transition cursor-pointer truncate ${
                        accountBankType === type
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Account / IBAN Number</label>
                  <input
                    type="text"
                    value={accountNumber}
                    onChange={e => setAccountNumber(e.target.value)}
                    placeholder="0300-1234567"
                    className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-600 outline-none font-medium"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Account Title</label>
                  <input
                    type="text"
                    value={accountTitle}
                    onChange={e => setAccountTitle(e.target.value)}
                    placeholder="Account holder name"
                    className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-600 outline-none font-medium"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAccountModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-xs cursor-pointer"
                >
                  {editingAccount ? 'Save Changes' : 'Add Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* HISTORY INSPECTION MODAL                                          */}
      {/* ================================================================= */}
      {selectedHistoryRecord && (
        <div
          onClick={() => setSelectedHistoryRecord(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 glass-modal-backdrop"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="glass-modal-panel animate-modal-pop rounded-2xl max-w-2xl w-full p-4 sm:p-5 space-y-4 max-h-[82dvh] overflow-y-auto my-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="min-w-0">
                <h3 className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-2 truncate">
                  <Calculator className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span className="truncate">
                    Closing Statement: {selectedHistoryRecord.date} ({selectedHistoryRecord.time})
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500 truncate">
                  Closed by {selectedHistoryRecord.closedBy || 'Cashier'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedHistoryRecord(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 shrink-0 ml-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-200/80">
                <span className="text-[10px] uppercase font-bold text-indigo-700">Physical Cash</span>
                <p className="text-sm sm:text-base font-extrabold tabular-nums text-indigo-800 mt-0.5 truncate">
                  {currency} {selectedHistoryRecord.totalCash.toLocaleString()}
                </p>
              </div>
              <div className="p-3 bg-cyan-50 rounded-xl border border-cyan-200/80">
                <span className="text-[10px] uppercase font-bold text-cyan-700">Digital Accounts</span>
                <p className="text-sm sm:text-base font-extrabold tabular-nums text-cyan-800 mt-0.5 truncate">
                  {currency} {(selectedHistoryRecord.totalOnline || 0).toLocaleString()}
                </p>
              </div>
              <div className="col-span-2 sm:col-span-1 p-3 bg-slate-900 text-white rounded-xl">
                <span className="text-[10px] uppercase font-bold text-slate-300">Grand Total</span>
                <p className="text-sm sm:text-base font-extrabold tabular-nums mt-0.5 truncate">
                  {currency} {(selectedHistoryRecord.grandTotal || selectedHistoryRecord.totalCash).toLocaleString()}
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

            {/* Digital Accounts Breakdown */}
            {selectedHistoryRecord.onlineBalances && selectedHistoryRecord.onlineBalances.length > 0 && (
              <div className="p-3 bg-cyan-50/50 rounded-xl border border-cyan-200/70 space-y-2 text-xs">
                <h4 className="font-bold text-cyan-900 text-xs">Digital Accounts Breakdown:</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] tabular-nums">
                  {selectedHistoryRecord.onlineBalances.map(acc => (
                    <div
                      key={acc.accountId}
                      className="p-2 bg-white rounded-lg border border-cyan-200/70 flex items-center justify-between"
                    >
                      <span className="font-semibold text-slate-700 truncate">{acc.accountName}</span>
                      <strong className="text-cyan-800 ml-2 shrink-0">
                        {currency} {(acc.balance || 0).toLocaleString()}
                      </strong>
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
                className="w-full sm:w-auto px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => handleShareWhatsApp(selectedHistoryRecord)}
                className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" /> <span>Share WhatsApp</span>
              </button>
              <button
                type="button"
                onClick={() => handlePrintRecord(selectedHistoryRecord)}
                className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" /> <span>Print Statement</span>
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
              <span>Opening Cash:</span>
              <span>{currency} {(selectedClosingForPrint.openingCash || 0).toLocaleString()}</span>
            </div>
            {(selectedClosingForPrint.openingTotalOnline || 0) > 0 && (
              <div className="flex justify-between text-[11px]">
                <span>Opening Digital:</span>
                <span>{currency} {(selectedClosingForPrint.openingTotalOnline || 0).toLocaleString()}</span>
              </div>
            )}
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
                  <span>{acc.accountName}:</span>
                  <span>{currency} {(acc.balance || 0).toLocaleString()}</span>
                </div>
              ))}
              <div className="flex justify-between font-bold text-xs pt-1 border-t border-dotted border-black mt-1">
                <span>Total Digital:</span>
                <span>{currency} {(selectedClosingForPrint.totalOnline || 0).toLocaleString()}</span>
              </div>
            </div>
          )}

          <div className="py-1.5">
            <div className="flex justify-between font-extrabold text-sm">
              <span>GRAND CLOSING TOTAL:</span>
              <span>{currency} {(selectedClosingForPrint.grandTotal || selectedClosingForPrint.totalCash).toLocaleString()}</span>
            </div>
            {(selectedClosingForPrint.totalDifference ?? selectedClosingForPrint.difference) !== undefined && (
              <div className="flex justify-between text-xs pt-1">
                <span>Difference from Expected:</span>
                <span>
                  {(selectedClosingForPrint.totalDifference ?? selectedClosingForPrint.difference)! >= 0 ? '+' : ''}
                  {currency} {(selectedClosingForPrint.totalDifference ?? selectedClosingForPrint.difference)!.toLocaleString()}
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
            <p>Generated by POS System</p>
          </div>
        </div>
      )}

      {/* Delete Digital Account Confirmation Modal */}
      <ConfirmModal
        isOpen={!!accountToDelete}
        title="Delete Digital Account"
        message={`Remove digital account "${accountToDelete?.name}" from Daily Closing?`}
        confirmText="Delete Account"
        cancelText="Cancel"
        isDestructive={true}
        onConfirm={() => {
          if (accountToDelete) {
            onDeleteOnlineAccount(accountToDelete.id);
            showToast(`Digital account "${accountToDelete.name}" deleted`, 'info');
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
