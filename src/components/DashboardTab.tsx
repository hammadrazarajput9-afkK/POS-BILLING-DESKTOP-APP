import React, { useState, useMemo } from 'react';
import { AppData } from '../types';
import { FinancialChart } from './FinancialChart';
import {
  useCashDrawer,
  CashLedgerItem,
  DashboardPeriodFilter,
  DashboardPeriodMode,
  isDateInDashboardPeriod,
} from '../utils/useCashDrawer';
import { getEffectiveSaleFigures } from '../utils/profitCalculator';
import {
  TrendingUp,
  Receipt,
  ShoppingBag,
  Layers,
  ArrowRight,
  Plus,
  ShoppingCart,
  UserPlus,
  CheckCircle2,
  Package,
  Sparkles,
  AlertCircle,
  Wallet,
  Sliders,
  ArrowDownRight,
  ArrowUpRight,
  Calculator,
  CalendarCheck,
  Building2,
  X,
  CreditCard,
  Banknote,
  Search,
  Truck,
  Eye,
  Store,
  EyeOff,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { TotpSetupModal } from './TotpSetupModal';
import { saveUserToFirestore } from '../utils/storage';
import { useToast } from './Toast';

interface DashboardTabProps {
  data: AppData;
  onSwitchTab: (tab: string) => void;
  onOpenModal: (modal: 'stock' | 'khata' | 'expense') => void;
  onOpenSettings?: () => void;
}

const DashboardTabComponent: React.FC<DashboardTabProps> = ({
  data,
  onSwitchTab,
  onOpenModal,
  onOpenSettings,
}) => {
  const localTodayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const [periodMode, setPeriodMode] = useState<DashboardPeriodMode>('live');
  const [specificDate, setSpecificDate] = useState<string>(localTodayStr);
  const [endDate, setEndDate] = useState<string>('');

  const periodFilter: DashboardPeriodFilter = useMemo(
    () => ({ mode: periodMode, specificDate, endDate: endDate || undefined }),
    [periodMode, specificDate, endDate]
  );

  // Dynamic Cash Drawer Engine filtered by selected period
  const cashDrawer = useCashDrawer(data, periodFilter);

  const latestClosing = useMemo(() => {
    const closings = data.dailyClosings || [];
    if (closings.length === 0) return null;
    return [...closings].sort((a, b) => `${b.date}T${b.time || '00:00:00'}`.localeCompare(`${a.date}T${a.time || '00:00:00'}`))[0] || null;
  }, [data.dailyClosings]);

  const periodLabel = useMemo(() => {
    switch (periodMode) {
      case 'live':
        return 'Live Drawer';
      case 'today':
        return 'Today';
      case 'weekly':
        return 'Last 7 Days';
      case 'monthly':
        return 'This Month';
      case 'yearly':
        return 'This Year';
      case 'date':
        return endDate && endDate > specificDate ? `${specificDate} → ${endDate}` : specificDate;
      case 'all':
        return 'All Time';
    }
  }, [periodMode, specificDate, endDate]);

  const { showToast } = useToast();
  // 2FA Setup Modal State for Dashboard Banner
  const [is2faModalOpen, setIs2faModalOpen] = useState(false);

  const currentUser = useMemo(() => {
    return data.currentUser || data.users?.find(u => u.role === 'admin');
  }, [data]);

  const is2faMissing = useMemo(() => {
    return currentUser && currentUser.role === 'admin' && !currentUser.is2faEnabled;
  }, [currentUser]);

  // Cash Ledger Drill-down Modal state
  const [isDrilldownOpen, setIsDrilldownOpen] = useState(false);
  const [ledgerFilter, setLedgerFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<'ALL' | 'SALE' | 'KHATA_RECOVERY' | 'EXPENSE' | 'SUPPLIER_PAYMENT' | 'BANK'>('ALL');
  const [ledgerSearch, setLedgerSearch] = useState('');

  // Clickable Metric Box "All Details" Modal
  const [activeMetricDetail, setActiveMetricDetail] = useState<'profit' | 'expenses' | 'outflow' | 'stock' | 'credit' | null>(null);
  const [metricDetailSearch, setMetricDetailSearch] = useState('');

  // Small Eye toggle to show / hide monetary balance values (persisted in localStorage)
  const [showBalance, setShowBalance] = useState<boolean>(() => {
    try {
      return localStorage.getItem('mobilepos_dashboard_show_balance') !== 'false';
    } catch {
      return true;
    }
  });

  const toggleShowBalance = () => {
    setShowBalance(prev => {
      const next = !prev;
      try {
        localStorage.setItem('mobilepos_dashboard_show_balance', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Separate Eye toggle to show / hide the 4 bottom metric boxes (persisted in localStorage)
  const [showBottomMetrics, setShowBottomMetrics] = useState<boolean>(() => {
    try {
      return localStorage.getItem('mobilepos_dashboard_show_bottom_metrics') !== 'false';
    } catch {
      return true;
    }
  });

  const toggleShowBottomMetrics = () => {
    setShowBottomMetrics(prev => {
      const next = !prev;
      try {
        localStorage.setItem('mobilepos_dashboard_show_bottom_metrics', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Low Stock items according to custom threshold or default 2
  const threshold = data.settings.lowStockThreshold ?? 2;
  const lowStockItems = useMemo(
    () => (data.inventory || []).filter(i => (i.qty || 0) <= threshold),
    [data.inventory, threshold]
  );

  const totalInStockUnits = useMemo(
    () => (data.inventory || []).reduce((acc, i) => acc + (i.qty || 0), 0),
    [data.inventory]
  );

  // Selected period credit (Udhar) calculated in real time
  const periodCreditIssued = useMemo(() => {
    let total = 0;
    (data.khata || []).forEach(cust => {
      (cust.history || []).forEach(tx => {
        if (
          tx.type === 'credit' &&
          isDateInDashboardPeriod(tx.date, periodFilter, latestClosing, localTodayStr)
        ) {
          total += tx.amount;
        }
      });
    });
    return total;
  }, [data.khata, periodFilter, latestClosing, localTodayStr]);

  const periodExpensesList = useMemo(() => {
    return (data.expenses || []).filter(exp =>
      isDateInDashboardPeriod(exp.date, periodFilter, latestClosing, localTodayStr)
    );
  }, [data.expenses, periodFilter, latestClosing, localTodayStr]);

  // Direct, instant, high-performance real-time values (no animated lag or frame drops when switching tabs)
  const cashVal = cashDrawer.cashInHand;
  const bankVal = cashDrawer.bankBalance;
  const profitVal = cashDrawer.realTimeNetProfit;
  const expensesVal = cashDrawer.totalExpenses;
  const purchasesVal = cashDrawer.totalSupplierPaid;
  const stockCostVal = cashDrawer.totalStockCostValue;

  // Filtered drill-down ledger
  const filteredLedger = useMemo(() => {
    return cashDrawer.ledger.filter(item => {
      const matchesSearch =
        item.title.toLowerCase().includes(ledgerSearch.toLowerCase()) ||
        (item.details && item.details.toLowerCase().includes(ledgerSearch.toLowerCase())) ||
        item.paymentMethod.toLowerCase().includes(ledgerSearch.toLowerCase());

      const isIn = item.cashIn > 0 || item.bankIn > 0;
      const isOut = item.cashOut > 0 || item.bankOut > 0;

      const matchesType =
        ledgerFilter === 'ALL' ? true : ledgerFilter === 'IN' ? isIn : isOut;

      const matchesCategory =
        ledgerTypeFilter === 'ALL'
          ? true
          : ledgerTypeFilter === 'BANK'
          ? item.bankIn > 0 || item.bankOut > 0
          : item.type === ledgerTypeFilter;

      return matchesSearch && matchesType && matchesCategory;
    });
  }, [cashDrawer.ledger, ledgerSearch, ledgerFilter, ledgerTypeFilter]);

  const openCashDrilldown = (
    typeFilter: 'ALL' | 'SALE' | 'KHATA_RECOVERY' | 'EXPENSE' | 'SUPPLIER_PAYMENT' | 'BANK' = 'ALL',
    inOutFilter: 'ALL' | 'IN' | 'OUT' = 'ALL'
  ) => {
    setLedgerTypeFilter(typeFilter);
    setLedgerFilter(inOutFilter);
    setLedgerSearch('');
    setIsDrilldownOpen(true);
  };

  const openMetricDetail = (metric: 'profit' | 'expenses' | 'outflow' | 'stock' | 'credit') => {
    if (metric !== 'credit' && data.currentRole === 'salesman') {
      showToast('Permission Denied: Financial profit/expense/stock asset details are restricted to Administrators', 'warning');
      return;
    }
    setMetricDetailSearch('');
    setActiveMetricDetail(metric);
  };

  const logoSrc = data.settings.shopLogo || data.settings.logo;

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* ======================================================== */}
      {/* PROMINENT 2FA SECURITY SETUP BANNER FOR UNVERIFIED ADMINS*/}
      {/* ======================================================== */}
      {is2faMissing && (
        <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-purple-900 rounded-3xl p-5 text-white shadow-xl border border-indigo-700/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-card-in">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-indigo-500/20 backdrop-blur-md rounded-2xl border border-indigo-400/30 text-indigo-200 shrink-0">
              <ShieldCheck className="w-7 h-7 text-emerald-400" />
            </div>
            <div className="space-y-0.5">
              <h4 className="font-extrabold text-sm sm:text-base text-white flex flex-wrap items-center gap-2">
                <span>Setup your Authenticator app for enhanced security</span>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-black uppercase tracking-wider">
                  Recommended
                </span>
              </h4>
              <p className="text-xs text-indigo-200/90 font-medium leading-relaxed">
                Protect your store ledger and multi-device account using Google Authenticator, Authy, or Microsoft Authenticator.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIs2faModalOpen(true)}
            className="w-full sm:w-auto px-5 py-3 bg-emerald-400 hover:bg-emerald-300 active:scale-95 text-slate-950 font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-emerald-500/20 transition flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Setup Now</span>
          </button>
        </div>
      )}
      {/* ======================================================== */}
      {/* DASHBOARD PERIOD FILTER BAR (APPLIES TO ALL BOXES)       */}
      {/* ======================================================== */}
      <div className="bg-white dark:bg-black border border-slate-200/90 dark:border-neutral-900 rounded-2xl p-2.5 sm:p-3.5 shadow-sm dark:shadow-none flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 animate-card-in">
        <div className="flex items-center gap-2 shrink-0 px-1">
          <div className="p-1.5 rounded-lg bg-blue-50 border border-blue-200/70 text-blue-600 shrink-0">
            <CalendarCheck className="w-4 h-4" />
          </div>
          <span className="text-xs font-extrabold text-slate-800 dark:text-white">
            Dashboard Period:
          </span>
          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200/70">
            {periodLabel}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'live', label: 'Live Drawer' },
              { id: 'today', label: 'Today' },
              { id: 'weekly', label: 'Weekly' },
              { id: 'monthly', label: 'Monthly' },
              { id: 'yearly', label: 'Yearly' },
              { id: 'date', label: 'Specific Date' },
              { id: 'all', label: 'All Time' },
            ] as const
          ).map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setPeriodMode(opt.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                periodMode === opt.id
                  ? 'theme-active-pill scale-[1.02]'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:text-neutral-300'
              }`}
            >
              {opt.label}
            </button>
          ))}

          {periodMode === 'date' && (
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs animate-fade-in">
              <input
                type="date"
                value={specificDate}
                onChange={e => setSpecificDate(e.target.value)}
                className="bg-transparent font-bold text-slate-800 outline-none cursor-pointer"
                title="From Date"
              />
              <span className="text-slate-400 font-bold">→</span>
              <input
                type="date"
                value={endDate}
                min={specificDate}
                onChange={e => setEndDate(e.target.value)}
                className="bg-transparent font-semibold text-slate-600 outline-none cursor-pointer"
                title="Optional End Date"
              />
              {endDate && (
                <button
                  type="button"
                  onClick={() => setEndDate('')}
                  className="text-slate-400 hover:text-rose-600 font-bold px-1 cursor-pointer"
                  title="Single date only"
                >
                  ×
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* REAL-TIME DYNAMIC CASH DRAWER & ASSET BALANCING BANNER   */}
      {/* ======================================================== */}
      <div className="dashboard-hero-card rounded-3xl p-5 sm:p-6 text-white border relative overflow-hidden animate-card-in animate-stagger-1">
        {/* Theme-matched Ambient Glow Lights */}
        <div
          className="animate-ambient-glow absolute -right-10 -bottom-10 w-72 h-72 rounded-full blur-3xl pointer-events-none"
          style={{ backgroundColor: 'var(--theme-hero-glow-1, rgba(16, 185, 129, 0.16))' }}
        />
        <div
          className="animate-ambient-glow absolute -left-10 -top-10 w-72 h-72 rounded-full blur-3xl pointer-events-none"
          style={{ backgroundColor: 'var(--theme-hero-glow-2, rgba(59, 130, 246, 0.2))', animationDelay: '2.2s' }}
        />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
          <div className="flex items-center gap-4 sm:gap-5">
            {logoSrc ? (
              <div className="relative shrink-0">
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden flex items-center justify-center">
                  <img
                    src={logoSrc}
                    alt={data.settings.shopName || 'Shop Logo'}
                    className="w-full h-full object-cover rounded-full"
                  />
                </div>
              </div>
            ) : (
              <div className="relative shrink-0">
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-white/10 backdrop-blur-md flex flex-col items-center justify-center text-white">
                  <Store className="w-10 h-10 sm:w-12 sm:h-12 text-indigo-200" />
                </div>
              </div>
            )}
            <div className="space-y-3 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/35 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 backdrop-blur-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  {periodMode === 'live' ? 'Cash In Hand (Live Drawer)' : `Cash Flow (${periodLabel})`}
                </span>

                {data.settings.shopName && (
                  <span className="text-xs text-slate-300/90 font-bold flex items-center gap-1">
                    • {data.settings.shopName}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                <div
                  onClick={() => setIsDrilldownOpen(true)}
                  className="group cursor-pointer flex items-baseline gap-2.5"
                  title="Click to view Cash Ledger Drilldown"
                >
                  <h2 className={`kpi-num text-2xl sm:text-4xl lg:text-5xl font-black tabular-nums tracking-tight transition-colors duration-200 truncate max-w-full ${
                    cashVal < 0 ? 'text-rose-400' : 'text-white group-hover:text-emerald-300'
                  }`}>
                    {data.settings.currency} {showBalance ? cashVal.toLocaleString() : '••••••'}
                  </h2>
                </div>

                {/* Eye icon to toggle hide/unhide top balance */}
                <button
                  type="button"
                  onClick={toggleShowBalance}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition cursor-pointer border border-white/15 backdrop-blur-xs"
                  title={showBalance ? 'Hide top drawer balance figures' : 'Unhide top drawer balance figures'}
                >
                  {showBalance ? <Eye className="w-4 h-4 text-emerald-400" /> : <EyeOff className="w-4 h-4 text-amber-300" />}
                </button>

                {cashDrawer.bankBalance !== 0 && (
                  <button
                    type="button"
                    onClick={() => openCashDrilldown('BANK', 'ALL')}
                    className="flex items-baseline gap-1.5 text-slate-300 text-sm font-semibold hover:bg-white/12 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl transition cursor-pointer backdrop-blur-xs"
                    title="Click to view Digital / Bank transactions"
                  >
                    <span className="text-slate-300/80 text-xs">Digital / Bank:</span>
                    <span className="tabular-nums font-bold text-sky-300">
                      {data.settings.currency} {showBalance ? bankVal.toLocaleString() : '••••••'}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Quick Ledger Action */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => openCashDrilldown('ALL', 'ALL')}
              className="group px-4 py-2.5 bg-white/12 hover:bg-white/20 text-white font-bold text-xs rounded-xl transition-all duration-200 flex items-center gap-2 cursor-pointer shadow-sm border border-white/15 backdrop-blur-sm"
            >
              <Wallet className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
              <span>Cash Ledger Drill-Down</span>
              <ArrowRight className="w-3.5 h-3.5 text-white/70 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>

        {/* Real-time Math Formula Breakdown Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mt-5 pt-4 border-t border-white/10 text-xs relative z-10">
          <div
            onClick={() => openCashDrilldown('SALE', 'IN')}
            className="bg-white/[0.06] hover:bg-white/[0.14] rounded-xl p-2.5 sm:p-3 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 border border-white/[0.06] hover:border-emerald-400/35 backdrop-blur-xs"
            title="Click to view all Cash Sales"
          >
            <span className="text-[10px] text-slate-300/80 block font-semibold">(+) Cash Sales</span>
            <p className="tabular-nums font-bold text-emerald-400 mt-0.5 text-xs sm:text-sm">
              +{data.settings.currency} {showBalance ? cashDrawer.cashSales.toLocaleString() : '••••••'}
            </p>
          </div>

          <div
            onClick={() => openCashDrilldown('KHATA_RECOVERY', 'IN')}
            className="bg-white/[0.06] hover:bg-white/[0.14] rounded-xl p-2.5 sm:p-3 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 border border-white/[0.06] hover:border-sky-400/35 backdrop-blur-xs"
            title="Click to view all Khata Recoveries"
          >
            <span className="text-[10px] text-slate-300/80 block font-semibold">(+) Khata Recoveries</span>
            <p className="tabular-nums font-bold text-sky-400 mt-0.5 text-xs sm:text-sm">
              +{data.settings.currency} {showBalance ? cashDrawer.khataRecoveriesCash.toLocaleString() : '••••••'}
            </p>
          </div>

          <div
            onClick={() => openCashDrilldown('EXPENSE', 'OUT')}
            className="bg-white/[0.06] hover:bg-white/[0.14] rounded-xl p-2.5 sm:p-3 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 border border-white/[0.06] hover:border-rose-400/35 backdrop-blur-xs"
            title="Click to view all Cash Expenses"
          >
            <span className="text-[10px] text-slate-300/80 block font-semibold">(-) Cash Expenses</span>
            <p className="tabular-nums font-bold text-rose-400 mt-0.5 text-xs sm:text-sm">
              -{data.settings.currency} {showBalance ? cashDrawer.cashExpenses.toLocaleString() : '••••••'}
            </p>
          </div>

          <div
            onClick={() => openCashDrilldown('SUPPLIER_PAYMENT', 'OUT')}
            className="bg-white/[0.06] hover:bg-white/[0.14] rounded-xl p-2.5 sm:p-3 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 border border-white/[0.06] hover:border-amber-400/35 backdrop-blur-xs"
            title="Click to view all Supplier Cash Payments"
          >
            <span className="text-[10px] text-slate-300/80 block font-semibold">(-) Supplier Paid</span>
            <p className="tabular-nums font-bold text-amber-400 mt-0.5 text-xs sm:text-sm">
              -{data.settings.currency} {showBalance ? cashDrawer.supplierPaidCash.toLocaleString() : '••••••'}
            </p>
          </div>

          <div
            onClick={() => openCashDrilldown('ALL', 'ALL')}
            className="group bg-emerald-500/18 border border-emerald-400/35 rounded-xl p-2.5 sm:p-3 col-span-2 sm:col-span-1 cursor-pointer hover:bg-emerald-500/28 transition-all duration-200 hover:-translate-y-0.5 backdrop-blur-xs"
          >
            <span className="text-[10px] text-emerald-300 block font-extrabold flex items-center justify-between">
              <span>(=) Drawer Cash</span>
              <ArrowRight className="w-3.5 h-3.5 text-emerald-300 group-hover:translate-x-1 transition-transform" />
            </span>
            <p className={`tabular-nums font-black mt-0.5 text-xs sm:text-sm ${cashVal < 0 ? 'text-rose-400' : 'text-white'}`}>
              {data.settings.currency} {showBalance ? cashVal.toLocaleString() : '••••••'}
            </p>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 4 PRIMARY METRICS: Profit, Expense, Purchases, Stock Val */}
      {/* (With its OWN INDEPENDENT Eye Hide / Unhide Toggle)      */}
      {/* ======================================================== */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-neutral-200">
              Store Performance & Financial Metrics
            </h3>
          </div>

          {/* Independent Eye toggle specifically for the bottom 4 boxes */}
          <button
            type="button"
            onClick={toggleShowBottomMetrics}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer shadow-2xs"
            title={showBottomMetrics ? 'Hide performance figures' : 'Unhide performance figures'}
          >
            {showBottomMetrics ? (
              <>
                <Eye className="w-3.5 h-3.5 text-emerald-600" />
                <span>Hide Metrics</span>
              </>
            ) : (
              <>
                <EyeOff className="w-3.5 h-3.5 text-amber-600" />
                <span>Show Metrics</span>
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-2 lg:grid-cols-5 sm:gap-4">
          {/* 1. REAL-TIME NET PROFIT */}
          <div
            onClick={() => openMetricDetail('profit')}
            className="dashboard-metric-card metric-profit animate-card-in animate-stagger-2 bg-white dark:bg-black border border-slate-200/90 dark:border-neutral-900 rounded-xl sm:rounded-2xl p-3 sm:p-5 shadow-sm dark:shadow-none hover:border-emerald-400 hover:shadow-lg flex flex-col justify-between cursor-pointer group"
            title="Click to view complete Profit & Sales Margin breakdown"
          >
            <div className="flex items-center justify-between mb-1.5 sm:mb-3">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-neutral-400 flex items-center gap-1 sm:gap-1.5 line-clamp-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                <span className="truncate">Net Profit ({periodLabel})</span>
              </span>
              <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold shrink-0 group-hover:scale-110 transition-transform duration-300">
                <TrendingUp className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
              </div>
            </div>
            <div>
              {data.currentRole === 'salesman' ? (
                <span className="text-xs sm:text-sm font-bold text-slate-400 dark:text-neutral-500 flex items-center gap-1 sm:gap-1.5 py-1">
                  <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" /> Restricted
                </span>
              ) : (
                <>
                  <h3
                    className={`kpi-num text-sm sm:text-2xl font-black tabular-nums tracking-tight truncate ${
                      profitVal >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {data.settings.currency} {showBottomMetrics ? profitVal.toLocaleString() : '••••••'}
                  </h3>
                  <p className="text-[10px] text-emerald-600/80 font-bold mt-1 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    <span>All Details</span>
                    <ArrowRight className="w-3 h-3" />
                  </p>
                </>
              )}
            </div>
          </div>

          {/* 2. PERIOD EXPENSES */}
          <div
            onClick={() => openMetricDetail('expenses')}
            className="dashboard-metric-card metric-expense animate-card-in animate-stagger-3 bg-white dark:bg-black border border-slate-200/90 dark:border-neutral-900 rounded-xl sm:rounded-2xl p-3 sm:p-5 shadow-sm dark:shadow-none hover:border-rose-400 hover:shadow-lg flex flex-col justify-between cursor-pointer group"
            title="Click to view all recorded expenses & breakdown"
          >
            <div className="flex items-center justify-between mb-1.5 sm:mb-3">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-neutral-400 flex items-center gap-1 sm:gap-1.5 line-clamp-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"></span>
                <span className="truncate">Expenses ({periodLabel})</span>
              </span>
              <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold shrink-0 group-hover:scale-110 transition-transform duration-300">
                <Receipt className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
              </div>
            </div>
            <div>
              {data.currentRole === 'salesman' ? (
                <span className="text-xs sm:text-sm font-bold text-slate-400 dark:text-neutral-500 flex items-center gap-1 sm:gap-1.5 py-1">
                  <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" /> Restricted
                </span>
              ) : (
                <>
                  <h3 className="kpi-num text-sm sm:text-2xl font-black text-slate-900 dark:text-white tabular-nums tracking-tight truncate">
                    {data.settings.currency} {showBottomMetrics ? expensesVal.toLocaleString() : '••••••'}
                  </h3>
                  <p className="text-[10px] text-rose-600/80 font-bold mt-1 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    <span>All Details ({periodExpensesList.length})</span>
                    <ArrowRight className="w-3 h-3" />
                  </p>
                </>
              )}
            </div>
          </div>

          {/* 3. SUPPLIER PURCHASES */}
          <div
            onClick={() => openMetricDetail('outflow')}
            className="dashboard-metric-card metric-purchase animate-card-in animate-stagger-4 bg-white dark:bg-black border border-slate-200/90 dark:border-neutral-900 rounded-xl sm:rounded-2xl p-3 sm:p-5 shadow-sm dark:shadow-none hover:border-amber-400 hover:shadow-lg flex flex-col justify-between cursor-pointer group"
            title="Click to view all Supplier Outflow & Purchase Bills"
          >
            <div className="flex items-center justify-between mb-1.5 sm:mb-3">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-neutral-400 flex items-center gap-1 sm:gap-1.5 line-clamp-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>
                <span className="truncate">Outflow ({periodLabel})</span>
              </span>
              <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold shrink-0 group-hover:scale-110 transition-transform duration-300">
                <ShoppingBag className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
              </div>
            </div>
            <div>
              {data.currentRole === 'salesman' ? (
                <span className="text-xs sm:text-sm font-bold text-slate-400 dark:text-neutral-500 flex items-center gap-1 sm:gap-1.5 py-1">
                  <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" /> Restricted
                </span>
              ) : (
                <>
                  <h3 className="kpi-num text-sm sm:text-2xl font-black text-slate-900 dark:text-white tabular-nums tracking-tight truncate">
                    {data.settings.currency} {showBottomMetrics ? purchasesVal.toLocaleString() : '••••••'}
                  </h3>
                  <p className="text-[10px] text-amber-600/90 font-bold mt-1 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    <span>All Details</span>
                    <ArrowRight className="w-3 h-3" />
                  </p>
                </>
              )}
            </div>
          </div>

          {/* 4. TOTAL STOCK VALUE */}
          <div
            onClick={() => openMetricDetail('stock')}
            className="dashboard-metric-card metric-stock animate-card-in animate-stagger-5 bg-white dark:bg-black border border-slate-200/90 dark:border-neutral-900 rounded-xl sm:rounded-2xl p-3 sm:p-5 shadow-sm dark:shadow-none hover:border-blue-400 hover:shadow-lg flex flex-col justify-between cursor-pointer group"
            title="Click to view complete Inventory Stock Asset valuation"
          >
            <div className="flex items-center justify-between mb-1.5 sm:mb-3">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-neutral-400 flex items-center gap-1 sm:gap-1.5 line-clamp-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"></span>
                <span className="truncate">Stock Asset (Live)</span>
              </span>
              <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold shrink-0 group-hover:scale-110 transition-transform duration-300">
                <Layers className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
              </div>
            </div>
            <div>
              {data.currentRole === 'salesman' ? (
                <span className="text-xs sm:text-sm font-bold text-slate-400 dark:text-neutral-500 flex items-center gap-1 sm:gap-1.5 py-1">
                  <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" /> Restricted
                </span>
              ) : (
                <h3 className="kpi-num text-sm sm:text-2xl font-black text-slate-900 dark:text-white tabular-nums tracking-tight truncate">
                  {data.settings.currency} {showBottomMetrics ? stockCostVal.toLocaleString() : '••••••'}
                </h3>
              )}
              <p className="text-[10px] sm:text-[11px] text-blue-600/80 dark:text-neutral-400 mt-0.5 sm:mt-1 font-bold flex items-center justify-between truncate group-hover:translate-x-0.5 transition-transform">
                <span>{totalInStockUnits} units in stock</span>
                {data.currentRole !== 'salesman' && <ArrowRight className="w-3 h-3 shrink-0" />}
              </p>
            </div>
          </div>

          {/* 5. PERIOD CREDIT (UDHAR) GIVEN */}
          <div
            onClick={() => openMetricDetail('credit')}
            className="dashboard-metric-card metric-credit animate-card-in animate-stagger-6 col-span-2 sm:col-span-1 bg-white dark:bg-black border border-slate-200/90 dark:border-neutral-900 rounded-xl sm:rounded-2xl p-3 sm:p-5 shadow-sm dark:shadow-none hover:border-orange-500 hover:shadow-lg flex flex-col justify-between cursor-pointer group"
            title="Click to view all Credit & Khata details"
          >
            <div className="flex items-center justify-between mb-1.5 sm:mb-3">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-neutral-400 flex items-center gap-1 sm:gap-1.5 line-clamp-1">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse shrink-0"></span>
                <span className="truncate">Credit Issued ({periodLabel})</span>
              </span>
              <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-orange-50 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 flex items-center justify-center font-bold shrink-0 group-hover:scale-110 transition-transform duration-300">
                <Banknote className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
              </div>
            </div>
            <div>
              <h3 className="kpi-num text-sm sm:text-2xl font-black text-slate-900 dark:text-white tabular-nums tracking-tight truncate">
                {data.settings.currency} {showBottomMetrics ? periodCreditIssued.toLocaleString() : '••••••'}
              </h3>
              <p className="text-[10px] text-orange-600/90 dark:text-neutral-400 mt-0.5 sm:mt-1 font-bold flex items-center justify-between truncate group-hover:translate-x-0.5 transition-transform">
                <span>All Details ({periodLabel})</span>
                <ArrowRight className="w-3 h-3 shrink-0" />
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* FINANCIAL CHART                                          */}
      {/* ======================================================== */}
      <FinancialChart data={data} />

      {/* ======================================================== */}
      {/* BOTTOM SECTION: LOW STOCK ALERTS (Shortcuts removed)     */}
      {/* ======================================================== */}
      <div className="w-full animate-card-in animate-stagger-5">
        {/* Low Stock Alerts */}
        <div className="bg-white dark:bg-black rounded-2xl border border-slate-200/80 dark:border-neutral-900 p-5 shadow-sm dark:shadow-none space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-neutral-900 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-xl">
                <AlertCircle className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                  <span>Low Stock Warning</span>
                  {lowStockItems.length > 0 && (
                    <span className="px-2 py-0.5 bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 text-[10px] font-black rounded-full border border-rose-200 dark:border-rose-900/40">
                      {lowStockItems.length} ALERT{lowStockItems.length > 1 ? 'S' : ''}
                    </span>
                  )}
                </h4>
                <p className="text-[11px] text-slate-400 dark:text-neutral-500">
                  Products with {threshold} or fewer units remaining
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onSwitchTab('inventory')}
              className="group text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline flex items-center gap-1 cursor-pointer transition"
            >
              <span>Open Inventory</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          {lowStockItems.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-xs space-y-1">
              <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-1 animate-float" />
              <p className="font-bold text-slate-700 dark:text-neutral-300">Stock Levels Healthy</p>
              <p className="text-[11px] text-slate-400 dark:text-neutral-500">
                All inventory items have more than {threshold} available units
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1">
              {lowStockItems.map(item => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-rose-50/60 dark:bg-neutral-950 border border-rose-100 dark:border-neutral-900 hover:border-rose-300 dark:hover:border-rose-800/70 hover:-translate-y-0.5 transition-all duration-200 text-xs shadow-none"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="font-bold text-slate-900 dark:text-white truncate">{item.name}</p>
                    <p className="text-[10px] text-slate-500 dark:text-neutral-400 truncate">
                      {item.category} {item.imei && `• IMEI: ${item.imei}`}
                    </p>
                  </div>
                  <span className="font-black text-rose-700 dark:text-rose-400 bg-white dark:bg-black border border-rose-200 dark:border-neutral-800 px-2 py-0.5 rounded-lg text-xs tabular-nums shrink-0 shadow-none">
                    {item.qty} Left
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* INTERACTIVE CASH DRILL-DOWN LEDGER MODAL                  */}
      {/* ======================================================== */}
      {isDrilldownOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl space-y-4 border border-slate-100 my-auto animate-scale-in max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-600 text-white rounded-xl shadow-md">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-base">
                    Real-Time Cash Drawer Drill-Down Ledger
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Itemized chronological audit of cash sales, khata recoveries, expenses, and supplier payouts
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsDrilldownOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Balances Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs shrink-0">
              <div>
                <span className="text-[10px] text-slate-400 block font-bold">Cash In Hand</span>
                <span className="text-lg font-black tabular-nums text-emerald-700">
                  {data.settings.currency} {cashDrawer.cashInHand.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-bold">Bank / Online</span>
                <span className="text-lg font-black tabular-nums text-sky-700">
                  {data.settings.currency} {cashDrawer.bankBalance.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-bold">Total Liquid Funds</span>
                <span className="text-lg font-black tabular-nums text-slate-900">
                  {data.settings.currency} {cashDrawer.totalLiquidFunds.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-bold">Stock Cost Asset</span>
                <span className="text-lg font-black tabular-nums text-blue-700">
                  {data.settings.currency} {cashDrawer.totalStockCostValue.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Filter toolbar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter transactions..."
                  value={ledgerSearch}
                  onChange={e => setLedgerSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                {ledgerTypeFilter !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => setLedgerTypeFilter('ALL')}
                    className="px-2.5 py-1 bg-indigo-100 text-indigo-800 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <span>Filter: {ledgerTypeFilter.replace('_', ' ')}</span>
                    <X className="w-3 h-3" />
                  </button>
                )}
                <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold flex-1 sm:flex-none">
                  <button
                    type="button"
                    onClick={() => setLedgerFilter('ALL')}
                    className={`flex-1 sm:flex-none px-3 py-1 rounded-lg transition cursor-pointer ${
                      ledgerFilter === 'ALL' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    All ({cashDrawer.ledger.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setLedgerFilter('IN')}
                    className={`flex-1 sm:flex-none px-3 py-1 rounded-lg transition cursor-pointer ${
                      ledgerFilter === 'IN' ? 'bg-white text-emerald-600 shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    Inflow (+)
                  </button>
                  <button
                    type="button"
                    onClick={() => setLedgerFilter('OUT')}
                    className={`flex-1 sm:flex-none px-3 py-1 rounded-lg transition cursor-pointer ${
                      ledgerFilter === 'OUT' ? 'bg-white text-rose-600 shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    Outflow (-)
                  </button>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="border border-slate-200 rounded-xl overflow-x-auto overflow-y-auto flex-1 text-xs">
              <table className="w-full text-left min-w-[520px] lg:min-w-0">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Description</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3 text-right">Inflow (+)</th>
                    <th className="py-2.5 px-3 text-right">Outflow (-)</th>
                    <th className="py-2.5 px-3 text-right">Running Cash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLedger.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-400">
                        No transactions recorded in cash drawer yet
                      </td>
                    </tr>
                  ) : (
                    filteredLedger.map(item => {
                      const isIn = item.cashIn > 0 || item.bankIn > 0;
                      const isCash = item.cashIn > 0 || item.cashOut > 0;

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/70">
                          <td className="py-2 px-3 text-[11px] text-slate-500 whitespace-nowrap">
                            {new Date(item.date).toLocaleDateString()}
                          </td>
                          <td className="py-2 px-3">
                            <div className="font-bold text-slate-900">{item.title}</div>
                            {item.details && (
                              <div className="text-[10px] text-slate-400">{item.details}</div>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            <span
                              className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${
                                item.type === 'SALE'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : item.type === 'KHATA_RECOVERY'
                                  ? 'bg-sky-100 text-sky-800'
                                  : item.type === 'EXPENSE'
                                  ? 'bg-rose-100 text-rose-800'
                                  : item.type === 'SUPPLIER_PAYMENT'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-800'
                              }`}
                            >
                              {item.type.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-emerald-600">
                            {item.cashIn > 0
                              ? `+${data.settings.currency} ${item.cashIn.toLocaleString()}`
                              : item.bankIn > 0
                              ? `+${data.settings.currency} ${item.bankIn.toLocaleString()} (Bank)`
                              : '-'}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-rose-600">
                            {item.cashOut > 0
                              ? `-${data.settings.currency} ${item.cashOut.toLocaleString()}`
                              : item.bankOut > 0
                              ? `-${data.settings.currency} ${item.bankOut.toLocaleString()} (Bank)`
                              : '-'}
                          </td>
                          <td className="py-2 px-3 text-right font-black tabular-nums text-slate-900">
                            {data.settings.currency} {item.runningCashBalance.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsDrilldownOpen(false)}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Close Drawer View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* CLICKABLE METRIC "ALL DETAILS" MODAL                     */}
      {/* ======================================================== */}
      {activeMetricDetail && (() => {
        const cur = data.settings.currency;
        const q = metricDetailSearch.trim().toLowerCase();
        const isoToday = new Date().toISOString().split('T')[0];

        const completedSales = (data.sales || []).filter(
          s => s.status !== 'CANCELLED' && isDateInDashboardPeriod(s.date, periodFilter, latestClosing, isoToday)
        );
        const periodReturns = (data.salesReturns || []).filter(
          r => isDateInDashboardPeriod(r.returnDate, periodFilter, latestClosing, isoToday)
        );
        const rawSalesRev = completedSales.reduce((sum, s) => sum + (s.grandTotal || 0), 0);
        const rawSalesCogs = completedSales.reduce((sum, s) => sum + (s.totalCost || 0), 0);
        const totalRefundsInPeriod = periodReturns.reduce((sum, r) => sum + (Number(r.totalRefundAmount) || 0), 0);
        const totalCostReversedInPeriod = periodReturns.reduce((sum, r) => sum + (Number(r.totalCostReversed) || 0), 0);
        const totalSalesRev = Math.max(0, rawSalesRev - totalRefundsInPeriod);
        const totalSalesCogs = Math.max(0, rawSalesCogs - totalCostReversedInPeriod);
        const grossProfitSum = Math.max(0, totalSalesRev - totalSalesCogs);
        const totalStockSaleValue = (data.inventory || []).reduce((sum, i) => sum + (i.salePrice || 0) * (i.qty || 0), 0);

        const activePurchases = (data.supplierPurchases || []).filter(
          p => p.status !== 'REVERSED' && isDateInDashboardPeriod(p.date, periodFilter, latestClosing, isoToday)
        );
        const totalBilledPurchases = activePurchases.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
        const totalPurchaseDue = activePurchases.reduce((sum, p) => sum + Math.max(0, (p.totalAmount || 0) - (p.paidAmount || 0)), 0);

        const periodCreditEntries: Array<{ customerName: string; phone?: string; date: string; note?: string; amount: number }> = [];
        (data.khata || []).forEach(cust => {
          (cust.history || []).forEach(tx => {
            if (
              tx.type === 'credit' &&
              isDateInDashboardPeriod(tx.date, periodFilter, latestClosing, isoToday)
            ) {
              periodCreditEntries.push({
                customerName: cust.name,
                phone: cust.phone,
                date: tx.date,
                note: tx.note,
                amount: tx.amount,
              });
            }
          });
        });
        periodCreditEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const totalAllKhataBalance = (data.khata || []).reduce((sum, k) => sum + Math.max(0, k.balance || 0), 0);

        const titleMap: Record<'profit' | 'expenses' | 'outflow' | 'stock' | 'credit', { title: string; subtitle: string; tab: string; tabLabel: string }> = {
          profit: {
            title: `Net Profit (${periodLabel}) — Complete Breakdown`,
            subtitle: `Sales Revenue (${cur} ${totalSalesRev.toLocaleString()}) - COGS (${cur} ${totalSalesCogs.toLocaleString()}) - Expenses (${cur} ${expensesVal.toLocaleString()})`,
            tab: 'reports',
            tabLabel: 'Open Full P&L Reports',
          },
          expenses: {
            title: `Shop Expenses (${periodLabel}) — Itemized Details`,
            subtitle: `${periodExpensesList.length} expense entries totaling ${cur} ${expensesVal.toLocaleString()}`,
            tab: 'expenses',
            tabLabel: 'Open Expenses Tab',
          },
          outflow: {
            title: `Supplier Outflow & Purchases (${periodLabel}) — All Details`,
            subtitle: `${activePurchases.length} supplier bills | Total Paid: ${cur} ${purchasesVal.toLocaleString()} | Payable: ${cur} ${totalPurchaseDue.toLocaleString()}`,
            tab: 'purchases',
            tabLabel: 'Open Purchases Tab',
          },
          stock: {
            title: 'Stock Asset Valuation — Complete Inventory',
            subtitle: `${(data.inventory || []).length} products (${totalInStockUnits} units) | Cost Asset: ${cur} ${stockCostVal.toLocaleString()} | Retail Value: ${cur} ${totalStockSaleValue.toLocaleString()}`,
            tab: 'inventory',
            tabLabel: 'Open Inventory Tab',
          },
          credit: {
            title: `Credit Issued (${periodLabel}) & Active Khata — All Details`,
            subtitle: `Issued (${periodLabel}): ${cur} ${periodCreditIssued.toLocaleString()} | Total Receivable Khata: ${cur} ${totalAllKhataBalance.toLocaleString()}`,
            tab: 'khata',
            tabLabel: 'Open Khata / Credit Tab',
          },
        };
        const meta = titleMap[activeMetricDetail];

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
            <div className="bg-white rounded-2xl max-w-4xl w-full p-4 sm:p-6 shadow-2xl space-y-4 border border-slate-100 my-auto animate-scale-in max-h-[92vh] flex flex-col">
              {/* Header */}
              <div className="flex items-start justify-between border-b border-slate-100 pb-3 shrink-0 gap-3">
                <div>
                  <h3 className="font-black text-slate-900 text-sm sm:text-base">{meta.title}</h3>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">{meta.subtitle}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveMetricDetail(null)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Search inside details */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shrink-0">
                <div className="relative flex-1 sm:max-w-xs">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={metricDetailSearch}
                    onChange={e => setMetricDetailSearch(e.target.value)}
                    placeholder="Search records in this view..."
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const targetTab = meta.tab;
                    setActiveMetricDetail(null);
                    onSwitchTab(targetTab);
                  }}
                  className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>{meta.tabLabel}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 min-h-0 overflow-y-auto border border-slate-200 rounded-xl text-xs">
                {activeMetricDetail === 'profit' && (
                  <div className="space-y-3 p-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-[10px] text-slate-500 block font-bold">Total Sales Revenue</span>
                        <span className="font-black text-slate-900 tabular-nums text-sm">{cur} {totalSalesRev.toLocaleString()}</span>
                      </div>
                      <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-[10px] text-slate-500 block font-bold">Cost of Goods (COGS)</span>
                        <span className="font-black text-amber-700 tabular-nums text-sm">-{cur} {totalSalesCogs.toLocaleString()}</span>
                      </div>
                      <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-[10px] text-slate-500 block font-bold">Gross Profit - Expenses</span>
                        <span className="font-black text-rose-700 tabular-nums text-sm">
                          {cur} {grossProfitSum.toLocaleString()} - {cur} {expensesVal.toLocaleString()}
                        </span>
                      </div>
                      <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200">
                        <span className="text-[10px] text-emerald-700 block font-bold">Net Profit</span>
                        <span className={`font-black tabular-nums text-sm ${profitVal >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {cur} {profitVal.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-50 border-y border-slate-200 text-[10px] font-bold text-slate-500 uppercase">
                        <tr>
                          <th className="py-2 px-3">Date / Inv #</th>
                          <th className="py-2 px-3">Customer</th>
                          <th className="py-2 px-3 text-right">Sale</th>
                          <th className="py-2 px-3 text-right">Cost</th>
                          <th className="py-2 px-3 text-right">Profit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {completedSales
                          .filter(s =>
                            !q ||
                            s.invNo.toLowerCase().includes(q) ||
                            s.custName.toLowerCase().includes(q) ||
                            s.items.some(it => it.name.toLowerCase().includes(q))
                          )
                          .map(s => {
                            const eff = getEffectiveSaleFigures(s);
                            return (
                              <tr key={s.invNo} className={`hover:bg-slate-50 ${eff.isFullReturn ? 'bg-rose-50/40 opacity-80' : ''}`}>
                                <td className="py-2 px-3">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-bold text-slate-900">{s.invNo}</span>
                                    {eff.isFullReturn && (
                                      <span className="text-[9px] font-bold px-1.5 py-0.2 bg-rose-100 text-rose-700 rounded">
                                        RETURNED
                                      </span>
                                    )}
                                    {eff.isPartialReturn && (
                                      <span className="text-[9px] font-bold px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded">
                                        PARTIAL RET
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-slate-400">{new Date(s.date).toLocaleDateString()}</span>
                                </td>
                                <td className="py-2 px-3">
                                  <span className="font-semibold text-slate-800">{s.custName}</span>
                                  <span className="block text-[10px] text-slate-400">
                                    {s.items.map(it => `${it.name} x${it.qty}${it.returnedQty ? ` (Ret:${it.returnedQty})` : ''}`).join(', ')}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-right tabular-nums font-bold">
                                  {cur} {eff.revenue.toLocaleString()}
                                </td>
                                <td className="py-2 px-3 text-right tabular-nums text-slate-500">
                                  {cur} {eff.cost.toLocaleString()}
                                </td>
                                <td className={`py-2 px-3 text-right tabular-nums font-black ${eff.isFullReturn ? 'text-slate-400' : eff.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {cur} {eff.profit.toLocaleString()}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}

                {activeMetricDetail === 'expenses' && (
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase sticky top-0">
                      <tr>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Description</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3">Method</th>
                        <th className="py-2.5 px-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {periodExpensesList
                        .filter(e =>
                          !q ||
                          e.description.toLowerCase().includes(q) ||
                          e.category.toLowerCase().includes(q) ||
                          (e.paymentMethod || '').toLowerCase().includes(q)
                        )
                        .map(exp => (
                          <tr key={exp.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3 whitespace-nowrap text-slate-500">{new Date(exp.date).toLocaleDateString()}</td>
                            <td className="py-2 px-3 font-bold text-slate-900">{exp.description}</td>
                            <td className="py-2 px-3">
                              <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 font-bold text-[10px]">{exp.category}</span>
                            </td>
                            <td className="py-2 px-3 text-slate-600">{exp.paymentMethod || 'Cash'}</td>
                            <td className="py-2 px-3 text-right tabular-nums font-black text-rose-600">
                              {cur} {exp.amount.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      {periodExpensesList.length === 0 && (
                        <tr><td colSpan={5} className="py-8 text-center text-slate-400">No expenses recorded for {periodLabel}</td></tr>
                      )}
                    </tbody>
                  </table>
                )}

                {activeMetricDetail === 'outflow' && (
                  <div className="space-y-3 p-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-[10px] text-slate-500 block font-bold">Total Billed Purchases</span>
                        <span className="font-black text-slate-900 tabular-nums text-sm">{cur} {totalBilledPurchases.toLocaleString()}</span>
                      </div>
                      <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200">
                        <span className="text-[10px] text-amber-800 block font-bold">Total Outflow Paid</span>
                        <span className="font-black text-amber-800 tabular-nums text-sm">{cur} {purchasesVal.toLocaleString()}</span>
                      </div>
                      <div className="p-2.5 bg-rose-50 rounded-xl border border-rose-200">
                        <span className="text-[10px] text-rose-700 block font-bold">Remaining Payable</span>
                        <span className="font-black text-rose-700 tabular-nums text-sm">{cur} {totalPurchaseDue.toLocaleString()}</span>
                      </div>
                    </div>
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-50 border-y border-slate-200 text-[10px] font-bold text-slate-500 uppercase">
                        <tr>
                          <th className="py-2 px-3">Date / Bill #</th>
                          <th className="py-2 px-3">Supplier / Party</th>
                          <th className="py-2 px-3 text-right">Bill Total</th>
                          <th className="py-2 px-3 text-right">Paid</th>
                          <th className="py-2 px-3 text-right">Due</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {activePurchases
                          .filter(p =>
                            !q ||
                            p.partyName.toLowerCase().includes(q) ||
                            p.billNo.toLowerCase().includes(q) ||
                            p.items.some(it => it.name.toLowerCase().includes(q))
                          )
                          .map(p => (
                            <tr key={p.id} className="hover:bg-slate-50">
                              <td className="py-2 px-3">
                                <span className="font-bold text-slate-900 block">#{p.billNo}</span>
                                <span className="text-[10px] text-slate-400">{new Date(p.date).toLocaleDateString()}</span>
                              </td>
                              <td className="py-2 px-3">
                                <span className="font-semibold text-slate-800">{p.partyName}</span>
                                <span className="block text-[10px] text-slate-400">{p.items.length} item(s) • {p.paymentMethod}</span>
                              </td>
                              <td className="py-2 px-3 text-right tabular-nums font-bold">{cur} {p.totalAmount.toLocaleString()}</td>
                              <td className="py-2 px-3 text-right tabular-nums font-bold text-amber-700">{cur} {p.paidAmount.toLocaleString()}</td>
                              <td className="py-2 px-3 text-right tabular-nums font-bold text-rose-600">
                                {cur} {Math.max(0, p.totalAmount - p.paidAmount).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {activeMetricDetail === 'stock' && (
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase sticky top-0">
                      <tr>
                        <th className="py-2.5 px-3">Product</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3 text-right">Qty</th>
                        <th className="py-2.5 px-3 text-right">Unit Cost</th>
                        <th className="py-2.5 px-3 text-right">Stock Cost Asset</th>
                        <th className="py-2.5 px-3 text-right">Retail Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(data.inventory || [])
                        .filter(i =>
                          i.status !== 'ARCHIVED' &&
                          (!q || i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q))
                        )
                        .sort((a, b) => (b.costPrice * b.qty) - (a.costPrice * a.qty))
                        .map(item => (
                          <tr key={item.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-bold text-slate-900">{item.name}</td>
                            <td className="py-2 px-3 text-slate-600">{item.category}</td>
                            <td className="py-2 px-3 text-right tabular-nums font-bold">{item.qty}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-slate-500">{cur} {item.costPrice.toLocaleString()}</td>
                            <td className="py-2 px-3 text-right tabular-nums font-black text-blue-700">
                              {cur} {(item.costPrice * item.qty).toLocaleString()}
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums font-bold text-emerald-700">
                              {cur} {(item.salePrice * item.qty).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}

                {activeMetricDetail === 'credit' && (
                  <div className="space-y-3 p-3">
                    <div>
                      <h4 className="font-extrabold text-slate-800 text-[11px] uppercase tracking-wider mb-1.5">
                        Credit Entries — {periodLabel} ({periodCreditEntries.length})
                      </h4>
                      <table className="w-full text-left border-collapse border border-slate-200 rounded-lg overflow-hidden">
                        <thead className="bg-orange-50 text-[10px] font-bold text-orange-900 uppercase">
                          <tr>
                            <th className="py-2 px-3">Date</th>
                            <th className="py-2 px-3">Customer</th>
                            <th className="py-2 px-3">Details / Note</th>
                            <th className="py-2 px-3 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {periodCreditEntries
                            .filter(e => !q || e.customerName.toLowerCase().includes(q) || (e.note || '').toLowerCase().includes(q))
                            .map((entry, idx) => (
                              <tr key={idx}>
                                <td className="py-2 px-3 text-slate-500 whitespace-nowrap tabular-nums">{new Date(entry.date).toLocaleDateString()}</td>
                                <td className="py-2 px-3 font-bold text-slate-900">
                                  {entry.customerName} {entry.phone ? `(${entry.phone})` : ''}
                                </td>
                                <td className="py-2 px-3 text-slate-600">{entry.note || 'Credit Purchase'}</td>
                                <td className="py-2 px-3 text-right tabular-nums font-black text-orange-700">
                                  {cur} {entry.amount.toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          {periodCreditEntries.length === 0 && (
                            <tr><td colSpan={4} className="py-4 text-center text-slate-400">No credit issued for {periodLabel}</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div>
                      <h4 className="font-extrabold text-slate-800 text-[11px] uppercase tracking-wider mb-1.5">
                        All Outstanding Customer Khata Balances
                      </h4>
                      <table className="w-full text-left border-collapse border border-slate-200 rounded-lg overflow-hidden">
                        <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase">
                          <tr>
                            <th className="py-2 px-3">Customer</th>
                            <th className="py-2 px-3">Phone</th>
                            <th className="py-2 px-3 text-right">Outstanding Balance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(data.khata || [])
                            .filter(k => k.balance > 0 && (!q || k.name.toLowerCase().includes(q) || (k.phone || '').includes(q)))
                            .sort((a, b) => b.balance - a.balance)
                            .map(k => (
                              <tr key={k.id}>
                                <td className="py-2 px-3 font-bold text-slate-900">{k.name}</td>
                                <td className="py-2 px-3 text-slate-600 tabular-nums">{k.phone || '-'}</td>
                                <td className="py-2 px-3 text-right tabular-nums font-black text-rose-600">
                                  {cur} {k.balance.toLocaleString()}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveMetricDetail(null)}
                  className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Close Details
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* TOTP 2FA Setup Modal from Dashboard Banner */}
      <TotpSetupModal
        isOpen={is2faModalOpen}
        onClose={() => setIs2faModalOpen(false)}
        adminEmail={currentUser?.email || 'admin@fmzpos.com'}
        existingSecret={currentUser?.totpSecret}
        onVerifySuccess={(newSecret) => {
          if (currentUser) {
            const updatedUser = {
              ...currentUser,
              totpSecret: newSecret,
              is2faEnabled: true,
            };
            saveUserToFirestore(updatedUser, updatedUser.storeId);
            if (data.users) {
              data.users = data.users.map(u => u.id === updatedUser.id ? updatedUser : u);
            }
            data.currentUser = updatedUser;
          }
          showToast('Authenticator 2FA successfully configured & locked in!', 'success');
        }}
        title="Setup Authenticator App (2FA)"
        description="Scan the QR Code using Google Authenticator, Authy, or Microsoft Authenticator and enter the 6-digit passcode to verify."
      />
    </div>
  );
};

export const DashboardTab = React.memo(DashboardTabComponent);
