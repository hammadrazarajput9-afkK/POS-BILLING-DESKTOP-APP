import React, { useState, useMemo } from 'react';
import { AppData } from '../types';
import { FinancialChart } from './FinancialChart';
import { useCashDrawer, CashLedgerItem } from '../utils/useCashDrawer';
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
  EyeOff
} from 'lucide-react';

interface DashboardTabProps {
  data: AppData;
  onSwitchTab: (tab: string) => void;
  onOpenModal: (modal: 'stock' | 'khata' | 'expense') => void;
  onOpenSettings?: () => void;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  data,
  onSwitchTab,
  onOpenModal,
  onOpenSettings,
}) => {
  // Dynamic Cash Drawer Engine
  const cashDrawer = useCashDrawer(data);

  // Cash Ledger Drill-down Modal state
  const [isDrilldownOpen, setIsDrilldownOpen] = useState(false);
  const [ledgerFilter, setLedgerFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [ledgerSearch, setLedgerSearch] = useState('');

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

      return matchesSearch && matchesType;
    });
  }, [cashDrawer.ledger, ledgerSearch, ledgerFilter]);

  const logoSrc = data.settings.shopLogo || data.settings.logo;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ======================================================== */}
      {/* REAL-TIME DYNAMIC CASH DRAWER & ASSET BALANCING BANNER   */}
      {/* ======================================================== */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 text-white shadow-xl border border-indigo-900/40 relative overflow-hidden">
        {/* Glow lights */}
        <div className="absolute -right-10 -bottom-10 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-10 -top-10 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Cash In Hand
              </span>

              {logoSrc && (
                <span className="text-xs text-slate-300 font-bold flex items-center gap-1">
                  • {data.settings.shopName}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div
                onClick={() => setIsDrilldownOpen(true)}
                className="group cursor-pointer flex items-baseline gap-2.5"
                title="Click to view Cash Ledger Drilldown"
              >
                <h2 className="text-3xl sm:text-5xl font-black font-mono tracking-tight text-white tabular-nums group-hover:text-emerald-400 transition">
                  {data.settings.currency} {showBalance ? cashVal.toLocaleString() : '••••••'}
                </h2>
              </div>

              {/* Eye icon to toggle hide/unhide balance */}
              <button
                type="button"
                onClick={toggleShowBalance}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition cursor-pointer border border-white/10"
                title={showBalance ? 'Hide balance figures' : 'Unhide balance figures'}
              >
                {showBalance ? <Eye className="w-4 h-4 text-emerald-400" /> : <EyeOff className="w-4 h-4 text-amber-300" />}
              </button>

              {cashDrawer.bankBalance !== 0 && (
                <div className="flex items-baseline gap-1.5 text-slate-300 text-sm font-semibold ml-2">
                  <span className="text-slate-400 text-xs">Digital / Bank:</span>
                  <span className="font-mono font-bold text-sky-400">
                    {data.settings.currency} {showBalance ? bankVal.toLocaleString() : '••••••'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Quick Ledger Action */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsDrilldownOpen(true)}
              className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm border border-white/10"
            >
              <Wallet className="w-4 h-4 text-emerald-400" />
              Cash Ledger Drill-Down
            </button>
          </div>
        </div>

        {/* Real-time Math Formula Breakdown Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mt-5 pt-4 border-t border-white/10 text-xs">
          <div className="bg-white/5 rounded-xl p-2.5">
            <span className="text-[10px] text-slate-400 block font-semibold">(+) Cash Sales</span>
            <p className="font-mono font-bold text-emerald-400 mt-0.5">
              +{data.settings.currency} {showBalance ? cashDrawer.cashSales.toLocaleString() : '••••••'}
            </p>
          </div>

          <div className="bg-white/5 rounded-xl p-2.5">
            <span className="text-[10px] text-slate-400 block font-semibold">(+) Khata Recoveries</span>
            <p className="font-mono font-bold text-sky-400 mt-0.5">
              +{data.settings.currency} {showBalance ? cashDrawer.khataRecoveriesCash.toLocaleString() : '••••••'}
            </p>
          </div>

          <div className="bg-white/5 rounded-xl p-2.5">
            <span className="text-[10px] text-slate-400 block font-semibold">(-) Cash Expenses</span>
            <p className="font-mono font-bold text-rose-400 mt-0.5">
              -{data.settings.currency} {showBalance ? cashDrawer.cashExpenses.toLocaleString() : '••••••'}
            </p>
          </div>

          <div className="bg-white/5 rounded-xl p-2.5">
            <span className="text-[10px] text-slate-400 block font-semibold">(-) Supplier Paid</span>
            <p className="font-mono font-bold text-amber-400 mt-0.5">
              -{data.settings.currency} {showBalance ? cashDrawer.supplierPaidCash.toLocaleString() : '••••••'}
            </p>
          </div>

          <div
            onClick={() => setIsDrilldownOpen(true)}
            className="bg-emerald-500/15 border border-emerald-500/30 rounded-xl p-2.5 col-span-2 sm:col-span-1 cursor-pointer hover:bg-emerald-500/25 transition"
          >
            <span className="text-[10px] text-emerald-300 block font-extrabold flex items-center justify-between">
              <span>(=) Drawer Cash</span>
              <ArrowRight className="w-3 h-3 text-emerald-400" />
            </span>
            <p className="font-mono font-black text-white mt-0.5">
              {data.settings.currency} {showBalance ? cashVal.toLocaleString() : '••••••'}
            </p>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 4 PRIMARY METRICS: Profit, Expense, Purchases, Stock Val */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. REAL-TIME NET PROFIT */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs transition hover:border-emerald-400 hover:shadow-md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Net Profit
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div>
            <h3
              className={`text-2xl font-black font-mono tabular-nums tracking-tight ${
                profitVal >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {data.settings.currency} {showBalance ? profitVal.toLocaleString() : '••••••'}
            </h3>
          </div>
        </div>

        {/* 2. DAILY EXPENSES */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs transition hover:border-rose-400 hover:shadow-md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
              Total Expenses
            </span>
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
              <Receipt className="w-5 h-5" />
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-black text-slate-900 font-mono tabular-nums tracking-tight">
              {data.settings.currency} {showBalance ? expensesVal.toLocaleString() : '••••••'}
            </h3>
          </div>
        </div>

        {/* 3. SUPPLIER PURCHASES */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs transition hover:border-amber-400 hover:shadow-md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              Supplier Outflow
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <ShoppingBag className="w-5 h-5" />
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-black text-slate-900 font-mono tabular-nums tracking-tight">
              {data.settings.currency} {showBalance ? purchasesVal.toLocaleString() : '••••••'}
            </h3>
          </div>
        </div>

        {/* 4. TOTAL STOCK VALUE */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs transition hover:border-blue-400 hover:shadow-md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
              Stock Asset Value
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Layers className="w-5 h-5" />
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-black text-slate-900 font-mono tabular-nums tracking-tight">
              {data.settings.currency} {showBalance ? stockCostVal.toLocaleString() : '••••••'}
            </h3>
            <p className="text-[11px] text-slate-400 mt-1">
              {totalInStockUnits} units in stock
            </p>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* FINANCIAL CHART                                          */}
      {/* ======================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs">
        <FinancialChart data={data} />
      </div>

      {/* ======================================================== */}
      {/* BOTTOM SECTION: LOW STOCK ALERTS (Shortcuts removed)     */}
      {/* ======================================================== */}
      <div className="w-full">
        {/* Low Stock Alerts */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
                <AlertCircle className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                  <span>Low Stock Warning</span>
                  {lowStockItems.length > 0 && (
                    <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-black rounded-full">
                      {lowStockItems.length} ALERT{lowStockItems.length > 1 ? 'S' : ''}
                    </span>
                  )}
                </h4>
                <p className="text-[11px] text-slate-400">
                  Products with {threshold} or fewer units remaining
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onSwitchTab('inventory')}
              className="text-xs text-blue-600 font-bold hover:underline flex items-center gap-1 cursor-pointer transition"
            >
              Open Inventory <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {lowStockItems.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-xs space-y-1">
              <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-1" />
              <p className="font-bold text-slate-700">Stock Levels Healthy</p>
              <p className="text-[11px] text-slate-400">
                All inventory items have more than {threshold} available units
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1">
              {lowStockItems.map(item => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-rose-50/60 border border-rose-100 text-xs"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="font-bold text-slate-900 truncate">{item.name}</p>
                    <p className="text-[10px] text-slate-500 truncate">
                      {item.category} {item.imei && `• IMEI: ${item.imei}`}
                    </p>
                  </div>
                  <span className="font-black text-rose-700 bg-white border border-rose-200 px-2 py-0.5 rounded-lg text-xs font-mono shrink-0">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl space-y-4 border border-slate-100 my-auto animate-in fade-in zoom-in-95 max-h-[92vh] flex flex-col">
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
                <span className="text-lg font-black font-mono text-emerald-700">
                  {data.settings.currency} {cashDrawer.cashInHand.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-bold">Bank / Online</span>
                <span className="text-lg font-black font-mono text-sky-700">
                  {data.settings.currency} {cashDrawer.bankBalance.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-bold">Total Liquid Funds</span>
                <span className="text-lg font-black font-mono text-slate-900">
                  {data.settings.currency} {cashDrawer.totalLiquidFunds.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-bold">Stock Cost Asset</span>
                <span className="text-lg font-black font-mono text-blue-700">
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

              <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold w-full sm:w-auto">
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

            {/* Table */}
            <div className="border border-slate-200 rounded-xl overflow-y-auto flex-1 text-xs">
              <table className="w-full text-left">
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
                          <td className="py-2 px-3 text-right font-black font-mono text-slate-900">
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
    </div>
  );
};
