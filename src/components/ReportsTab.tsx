import React, { useState, useMemo } from 'react';
import { AppData, SaleRecord, InventoryItem, ExpenseItem, KhataCustomer } from '../types';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  BookOpen,
  PieChart,
  Printer,
  Calendar,
  Layers,
  Receipt,
  Share2,
  Download,
  X,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownLeft,
  ShoppingBag,
  Calculator,
  Eye,
  FileSpreadsheet,
  RotateCcw,
  Edit,
  Trash2,
  Store,
  Building2,
  Tag,
  Users,
  Check
} from 'lucide-react';
import { useToast } from './Toast';

interface ReportsTabProps {
  data: AppData;
  onViewReceipt: (sale: SaleRecord) => void;
  onOpenSalesReturn?: (sale?: SaleRecord | null) => void;
  onEditSale?: (sale: SaleRecord) => void;
  onDeleteSale?: (invNo: string, permanent?: boolean, reason?: string) => void;
}

export type ReportType =
  | 'sales'
  | 'expenses'
  | 'inventory'
  | 'khata'
  | 'pnl'
  | 'closings'
  | 'purchases'
  | 'returns'
  | 'top_products'
  | 'wholesale';

export type DateFilterMode = 'all' | 'today' | 'week' | 'month' | '6month' | 'year' | 'custom';

const ReportsTabComponent: React.FC<ReportsTabProps> = ({
  data,
  onViewReceipt,
  onOpenSalesReturn,
  onEditSale,
  onDeleteSale,
}) => {
  const { showToast } = useToast();
  const currency = data.settings.currency;
  const shopName = data.settings.shopName;

  const [activeReportModal, setActiveReportModal] = useState<ReportType | null>(null);
  const [deleteSaleModal, setDeleteSaleModal] = useState<SaleRecord | null>(null);
  const [deleteMode, setDeleteMode] = useState<'cancel' | 'permanent'>('cancel');
  const [cancelReason, setCancelReason] = useState('Customer request / cancelled');

  // Universal Date Range Filter State
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Date In Range Checker
  const isDateInRange = (dateStr?: string) => {
    if (!dateStr || dateFilterMode === 'all') return true;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return true;
    const now = new Date();

    if (dateFilterMode === 'today') {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      return d >= todayStart && d <= todayEnd;
    }
    if (dateFilterMode === 'week') {
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return d >= weekStart;
    }
    if (dateFilterMode === 'month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      return d >= monthStart;
    }
    if (dateFilterMode === '6month') {
      const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      return d >= sixMonthsAgo;
    }
    if (dateFilterMode === 'year') {
      const yearStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
      return d >= yearStart;
    }
    if (dateFilterMode === 'custom') {
      if (!customStartDate && !customEndDate) return true;
      if (customStartDate) {
        const start = new Date(customStartDate);
        start.setHours(0, 0, 0, 0);
        if (d < start) return false;
      }
      if (customEndDate) {
        const end = new Date(customEndDate);
        end.setHours(23, 59, 59, 999);
        if (d > end) return false;
      }
      return true;
    }
    return true;
  };

  // Filtered Core Collections
  const filteredSales = useMemo(() => {
    return data.sales.filter(s => isDateInRange(s.date));
  }, [data.sales, dateFilterMode, customStartDate, customEndDate]);

  const filteredExpenses = useMemo(() => {
    return data.expenses.filter(e => isDateInRange(e.date));
  }, [data.expenses, dateFilterMode, customStartDate, customEndDate]);

  const filteredReturns = useMemo(() => {
    return (data.salesReturns || []).filter(r => isDateInRange(r.returnDate));
  }, [data.salesReturns, dateFilterMode, customStartDate, customEndDate]);

  const filteredPurchases = useMemo(() => {
    return (data.purchasesLedger || []).filter(p => isDateInRange(p.date));
  }, [data.purchasesLedger, dateFilterMode, customStartDate, customEndDate]);

  const filteredClosings = useMemo(() => {
    return (data.dailyClosings || []).filter(c => isDateInRange(c.date || c.createdAt));
  }, [data.dailyClosings, dateFilterMode, customStartDate, customEndDate]);

  // 1. Sales & Returns Calculations
  const totalSalesRevenue = useMemo(() => {
    return filteredSales.reduce((acc, s) => acc + s.grandTotal, 0);
  }, [filteredSales]);

  const totalCOGS = useMemo(() => {
    return filteredSales.reduce((acc, s) => acc + s.totalCost, 0);
  }, [filteredSales]);

  const totalRefundsAmount = useMemo(() => {
    return filteredReturns.reduce((acc, r) => acc + (r.totalRefundAmount || 0), 0);
  }, [filteredReturns]);

  const totalCostReversed = useMemo(() => {
    return filteredReturns.reduce((acc, r) => acc + (r.totalCostReversed || 0), 0);
  }, [filteredReturns]);

  const netSalesRevenue = Math.max(0, totalSalesRevenue - totalRefundsAmount);
  const netCOGS = Math.max(0, totalCOGS - totalCostReversed);
  const grossProfit = Math.max(0, netSalesRevenue - netCOGS);

  // 2. Expense Calculations
  const totalExpenses = useMemo(() => {
    return filteredExpenses.reduce((acc, e) => acc + e.amount, 0);
  }, [filteredExpenses]);

  const netProfit = grossProfit - totalExpenses;
  const netMarginPercent = totalSalesRevenue > 0 ? Math.round((netProfit / totalSalesRevenue) * 100) : 0;

  // 3. Stock Calculations
  const stockValuationCost = useMemo(() => {
    return data.inventory.reduce((acc, i) => acc + i.costPrice * i.qty, 0);
  }, [data.inventory]);

  const stockValuationRetail = useMemo(() => {
    return data.inventory.reduce((acc, i) => acc + i.salePrice * i.qty, 0);
  }, [data.inventory]);

  const totalStockUnits = useMemo(() => {
    return data.inventory.reduce((acc, i) => acc + i.qty, 0);
  }, [data.inventory]);

  // 4. Khata Receivables Calculations
  const totalUdhar = useMemo(() => {
    return data.khata.reduce((acc, k) => acc + k.balance, 0);
  }, [data.khata]);

  const totalKhataCustomers = data.khata.length;
  const debtorCustomersCount = data.khata.filter(k => k.balance > 0).length;

  // 5. Purchases Total
  const totalPurchasesAmount = useMemo(() => {
    return filteredPurchases.reduce((acc, p) => acc + p.total, 0);
  }, [filteredPurchases]);

  // 6. Closings Total
  const closingsHistory = filteredClosings;
  const latestClosing = closingsHistory.length > 0 ? closingsHistory[0] : null;

  // 7. Top Selling Products
  const topSellingList = useMemo(() => {
    const map: Record<string, { id: string; name: string; category: string; unitsSold: number; totalRevenue: number }> = {};
    filteredSales.forEach(sale => {
      sale.items.forEach(item => {
        if (!map[item.id]) {
          map[item.id] = {
            id: item.id,
            name: item.name,
            category: item.category,
            unitsSold: 0,
            totalRevenue: 0,
          };
        }
        map[item.id].unitsSold += item.qty;
        map[item.id].totalRevenue += item.salePrice * item.qty;
      });
    });

    return Object.values(map).sort((a, b) => b.unitsSold - a.unitsSold);
  }, [filteredSales]);

  // 8. Wholesale Specific Calculations
  const wholesaleSales = useMemo(() => {
    return filteredSales.filter(
      s => s.saleMode === 'wholesale' || s.items.some(i => i.isWholesale || (i.wholesalePrice && i.wholesalePrice > 0))
    );
  }, [filteredSales]);

  const totalWholesaleRevenue = useMemo(() => {
    return wholesaleSales.reduce((acc, s) => acc + s.grandTotal, 0);
  }, [wholesaleSales]);

  const totalWholesaleCost = useMemo(() => {
    return wholesaleSales.reduce((acc, s) => acc + s.totalCost, 0);
  }, [wholesaleSales]);

  const totalWholesaleProfit = totalWholesaleRevenue - totalWholesaleCost;

  const totalWholesaleDiscountsGiven = useMemo(() => {
    return wholesaleSales.reduce((acc, s) => acc + (s.wholesaleSavings || 0) + (s.discount || 0), 0);
  }, [wholesaleSales]);

  const totalWholesaleUnits = useMemo(() => {
    return wholesaleSales.reduce((acc, s) => acc + s.items.reduce((sum, item) => sum + item.qty, 0), 0);
  }, [wholesaleSales]);

  // Breakdown per Retailer
  const retailerStats = useMemo(() => {
    const map: Record<
      string,
      {
        name: string;
        shopName: string;
        city: string;
        phone: string;
        invoicesCount: number;
        totalPurchased: number;
        totalCost: number;
        totalProfit: number;
        totalDiscounts: number;
      }
    > = {};

    wholesaleSales.forEach(sale => {
      const key = (sale.custName || sale.retailerShopName || 'Walk-in Retailer').toLowerCase().trim();
      if (!map[key]) {
        map[key] = {
          name: sale.custName || 'Retailer',
          shopName: sale.retailerShopName || '-',
          city: sale.retailerCity || '-',
          phone: sale.custPhone || '-',
          invoicesCount: 0,
          totalPurchased: 0,
          totalCost: 0,
          totalProfit: 0,
          totalDiscounts: 0,
        };
      }
      map[key].invoicesCount += 1;
      map[key].totalPurchased += sale.grandTotal;
      map[key].totalCost += sale.totalCost;
      map[key].totalProfit += sale.netProfit;
      map[key].totalDiscounts += (sale.wholesaleSavings || 0) + (sale.discount || 0);
    });

    return Object.values(map).sort((a, b) => b.totalPurchased - a.totalPurchased);
  }, [wholesaleSales]);

  // Handle PDF Print of Active Report
  const handlePrintCurrentReport = () => {
    window.print();
  };

  // Handle WhatsApp Share of Active Report
  const handleShareWhatsAppReport = (type: ReportType) => {
    const lines: string[] = [];
    const dateStr = new Date().toLocaleDateString();

    const filterText =
      dateFilterMode === 'today'
        ? 'Aaj (Today)'
        : dateFilterMode === 'week'
        ? 'Is Hafte (This Week)'
        : dateFilterMode === 'month'
        ? 'Is Mahine (This Month)'
        : dateFilterMode === '6month'
        ? 'Last 6 Months'
        : dateFilterMode === 'year'
        ? 'This Year'
        : dateFilterMode === 'custom'
        ? `Custom (${customStartDate || 'Start'} to ${customEndDate || 'End'})`
        : 'All Time';

    lines.push(`📊 *${shopName.toUpperCase()} - BUSINESS REPORT*`);
    lines.push(`📅 *Date:* ${dateStr}`);
    lines.push(`⏳ *Filter:* ${filterText}`);
    lines.push(`----------------------------------------`);

    if (type === 'wholesale') {
      lines.push(`🏢 *WHOLESALE & RETAILER B2B REPORT*`);
      lines.push(`• Wholesale Invoices: ${wholesaleSales.length}`);
      lines.push(`• Wholesale Revenue: ${currency} ${totalWholesaleRevenue.toLocaleString()}`);
      lines.push(`• Wholesale Cost (COGS): ${currency} ${totalWholesaleCost.toLocaleString()}`);
      lines.push(`• Wholesale Net Profit/Loss: ${currency} ${totalWholesaleProfit.toLocaleString()}`);
      lines.push(`• Total Discounts/Savings Given: ${currency} ${totalWholesaleDiscountsGiven.toLocaleString()}`);
      lines.push(`• Units Sold: ${totalWholesaleUnits}`);
      if (retailerStats.length > 0) {
        lines.push(`\n*TOP RETAILERS BREAKDOWN:*`);
        retailerStats.slice(0, 5).forEach((r, idx) => {
          lines.push(`${idx + 1}. ${r.name} (${r.shopName !== '-' ? r.shopName : r.city}) - Total: ${currency} ${r.totalPurchased.toLocaleString()} | Profit: ${currency} ${r.totalProfit.toLocaleString()} | Discount: ${currency} ${r.totalDiscounts.toLocaleString()}`);
        });
      }
    } else if (type === 'sales') {
      lines.push(`🛒 *SALES & REVENUE REPORT*`);
      lines.push(`• Total Invoices: ${filteredSales.length}`);
      lines.push(`• Gross Revenue: ${currency} ${totalSalesRevenue.toLocaleString()}`);
      lines.push(`• Cost of Goods: ${currency} ${totalCOGS.toLocaleString()}`);
      lines.push(`• Net Profit: ${currency} ${netProfit.toLocaleString()} (${netMarginPercent}%)`);
    } else if (type === 'expenses') {
      lines.push(`🧾 *DAILY EXPENSES REPORT*`);
      lines.push(`• Total Expenses: ${currency} ${totalExpenses.toLocaleString()}`);
      lines.push(`• Total Entries: ${filteredExpenses.length}`);
    } else if (type === 'inventory') {
      lines.push(`📦 *INVENTORY & STOCK VALUATION REPORT*`);
      lines.push(`• Total Products: ${data.inventory.length}`);
      lines.push(`• Total Stock Units: ${totalStockUnits}`);
      lines.push(`• Inventory Value (Cost): ${currency} ${stockValuationCost.toLocaleString()}`);
      lines.push(`• Expected Retail Value: ${currency} ${stockValuationRetail.toLocaleString()}`);
    } else if (type === 'khata') {
      lines.push(`📒 *CUSTOMER CREDIT / KHATA REPORT*`);
      lines.push(`• Total Outstanding Due: ${currency} ${totalUdhar.toLocaleString()}`);
      lines.push(`• Customers with Balance: ${debtorCustomersCount}`);
    } else if (type === 'pnl') {
      lines.push(`📈 *PROFIT & LOSS STATEMENT*`);
      lines.push(`• Gross Revenue: ${currency} ${totalSalesRevenue.toLocaleString()}`);
      lines.push(`• Cost of Goods Sold: ${currency} ${totalCOGS.toLocaleString()}`);
      lines.push(`• Gross Profit: ${currency} ${grossProfit.toLocaleString()}`);
      lines.push(`• Total Expenses: ${currency} ${totalExpenses.toLocaleString()}`);
      lines.push(`• Net Business Profit: ${currency} ${netProfit.toLocaleString()} (${netMarginPercent}%)`);
    } else if (type === 'closings') {
      lines.push(`🧮 *DAILY CLOSING REPORT*`);
      lines.push(`• Total Closing Records: ${closingsHistory.length}`);
      if (latestClosing) {
        lines.push(`• Last Closing (${latestClosing.date}): ${currency} ${latestClosing.grandTotal.toLocaleString()}`);
        lines.push(`• Physical Cash: ${currency} ${latestClosing.totalCash.toLocaleString()}`);
        lines.push(`• Digital Balances: ${currency} ${latestClosing.totalOnline.toLocaleString()}`);
      }
    } else if (type === 'purchases') {
      lines.push(`📥 *PURCHASES / STOCK ACQUISITION REPORT*`);
      lines.push(`• Total Purchase Cost: ${currency} ${totalPurchasesAmount.toLocaleString()}`);
      lines.push(`• Purchase Records: ${filteredPurchases.length}`);
    } else if (type === 'top_products') {
      lines.push(`🏆 *TOP SELLING PRODUCTS REPORT*`);
      topSellingList.slice(0, 5).forEach((p, idx) => {
        lines.push(`${idx + 1}. ${p.name} - ${p.unitsSold} units (${currency} ${p.totalRevenue.toLocaleString()})`);
      });
    }

    lines.push(`----------------------------------------`);
    lines.push(`\nCreated by HAMMAD RAZA DEVELOPMENT`);

    const encoded = encodeURIComponent(lines.join('\n'));
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="border-b border-slate-200 dark:border-neutral-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <PieChart className="w-5 h-5 text-blue-600" /> Comprehensive Business Reports
          </h2>
        </div>

        <div className="text-right">
          <span className="text-[11px] font-bold px-3 py-1 bg-blue-50 dark:bg-neutral-800 text-blue-700 dark:text-blue-400 rounded-full border border-blue-200 dark:border-neutral-700">
            Created by HAMMAD RAZA DEVELOPMENT
          </span>
        </div>
      </div>

      {/* UNIVERSAL DATE RANGE FILTER TOOLBAR */}
      <div className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-2xl p-3.5 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-neutral-800 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <span className="font-extrabold text-xs text-slate-900 dark:text-white uppercase tracking-wide">
                Date Range Filter
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold px-2.5 py-1 bg-blue-50 dark:bg-neutral-800 text-blue-700 dark:text-blue-300 rounded-lg border border-blue-200 dark:border-neutral-700">
              Active: {dateFilterMode === 'today' && 'Today'}
              {dateFilterMode === 'week' && 'This Week'}
              {dateFilterMode === 'month' && 'This Month'}
              {dateFilterMode === '6month' && 'Last 6 Months'}
              {dateFilterMode === 'year' && 'This Year'}
              {dateFilterMode === 'custom' && 'Specific Date Range'}
              {dateFilterMode === 'all' && 'All Time'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs pt-1">
          {[
            { id: 'today', label: 'Today' },
            { id: 'week', label: 'This Week' },
            { id: 'month', label: 'This Month' },
            { id: '6month', label: '6 Months' },
            { id: 'year', label: 'This Year' },
            { id: 'custom', label: 'Custom Date Range' },
            { id: 'all', label: 'All Time' },
          ].map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setDateFilterMode(opt.id as DateFilterMode)}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer ${
                dateFilterMode === opt.id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 hover:bg-slate-200 dark:hover:bg-neutral-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {dateFilterMode === 'custom' && (
          <div className="pt-2.5 border-t border-slate-100 dark:border-neutral-800 flex flex-wrap items-center gap-3 text-xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-600 dark:text-neutral-400">From (Kahan se):</span>
              <input
                type="date"
                value={customStartDate}
                onChange={e => setCustomStartDate(e.target.value)}
                className="bg-slate-50 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-slate-900 dark:text-white rounded-lg px-2.5 py-1 text-xs font-semibold outline-none focus:border-blue-600 cursor-pointer"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-600 dark:text-neutral-400">To (Kahan tak):</span>
              <input
                type="date"
                value={customEndDate}
                onChange={e => setCustomEndDate(e.target.value)}
                className="bg-slate-50 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-slate-900 dark:text-white rounded-lg px-2.5 py-1 text-xs font-semibold outline-none focus:border-blue-600 cursor-pointer"
              />
            </div>
            {(customStartDate || customEndDate) && (
              <button
                type="button"
                onClick={() => {
                  setCustomStartDate('');
                  setCustomEndDate('');
                }}
                className="text-[11px] text-rose-600 hover:underline font-bold cursor-pointer"
              >
                Clear Dates
              </button>
            )}
          </div>
        )}
      </div>

      {/* Top 5 Quick Summary KPI Cards */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5 sm:gap-4">
        {/* Sales Revenue */}
        <div
          onClick={() => setActiveReportModal('sales')}
          className="bg-white dark:bg-neutral-900 border border-slate-200/90 dark:border-neutral-800 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 shadow-xs cursor-pointer hover:border-blue-500 hover:shadow-md transition flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-neutral-400 line-clamp-1">
              Sales Revenue
            </span>
            <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 shrink-0" />
          </div>
          <h3 className="text-sm sm:text-xl font-extrabold text-slate-900 dark:text-white tabular-nums mt-0.5 sm:mt-1 truncate">
            {currency} {totalSalesRevenue.toLocaleString()}
          </h3>
          <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 sm:mt-1 truncate">{filteredSales.length} Invoices</p>
        </div>

        {/* Wholesale B2B Sales */}
        <div
          onClick={() => setActiveReportModal('wholesale')}
          className="bg-white dark:bg-neutral-900 border border-slate-200/90 dark:border-neutral-800 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 shadow-xs cursor-pointer hover:border-purple-500 hover:shadow-md transition flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 line-clamp-1">
              Wholesale B2B
            </span>
            <Store className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-600 shrink-0" />
          </div>
          <h3 className="text-sm sm:text-xl font-extrabold text-purple-700 dark:text-purple-400 tabular-nums mt-0.5 sm:mt-1 truncate">
            {currency} {totalWholesaleRevenue.toLocaleString()}
          </h3>
          <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 sm:mt-1 truncate">{wholesaleSales.length} Invoices</p>
        </div>

        {/* Net Profit */}
        <div
          onClick={() => {
            if (data.currentRole === 'salesman') {
              showToast('Restricted: Net Profit P&L Statement is restricted to Administrators', 'warning');
              return;
            }
            setActiveReportModal('pnl');
          }}
          className="bg-white dark:bg-neutral-900 border border-slate-200/90 dark:border-neutral-800 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 shadow-xs cursor-pointer hover:border-emerald-500 hover:shadow-md transition flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-neutral-400 line-clamp-1">
              Net Profit
            </span>
            <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 shrink-0" />
          </div>
          {data.currentRole === 'salesman' ? (
            <span className="text-[10px] sm:text-xs font-bold text-slate-400 block mt-1">Restricted</span>
          ) : (
            <>
              <h3
                className={`text-sm sm:text-xl font-extrabold tabular-nums mt-0.5 sm:mt-1 truncate ${
                  netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'
                }`}
              >
                {currency} {netProfit.toLocaleString()}
              </h3>
              <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 sm:mt-1 truncate">Margin: {netMarginPercent}%</p>
            </>
          )}
        </div>

        {/* Expenses */}
        <div
          onClick={() => setActiveReportModal('expenses')}
          className="bg-white dark:bg-neutral-900 border border-slate-200/90 dark:border-neutral-800 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 shadow-xs cursor-pointer hover:border-rose-500 hover:shadow-md transition flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-neutral-400 line-clamp-1">
              Total Expenses
            </span>
            <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-600 shrink-0" />
          </div>
          <h3 className="text-sm sm:text-xl font-extrabold text-rose-600 dark:text-rose-400 tabular-nums mt-0.5 sm:mt-1 truncate">
            {currency} {totalExpenses.toLocaleString()}
          </h3>
          <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 sm:mt-1 truncate">{filteredExpenses.length} Records</p>
        </div>

        {/* Stock Valuation */}
        <div
          onClick={() => setActiveReportModal('inventory')}
          className="bg-white dark:bg-neutral-900 border border-slate-200/90 dark:border-neutral-800 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 shadow-xs cursor-pointer hover:border-indigo-500 hover:shadow-md transition flex flex-col justify-between col-span-2 sm:col-span-1"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-neutral-400 line-clamp-1">
              Stock Value
            </span>
            <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-600 shrink-0" />
          </div>
          <h3 className="text-sm sm:text-xl font-extrabold text-slate-900 dark:text-white tabular-nums mt-0.5 sm:mt-1 truncate">
            {currency} {stockValuationCost.toLocaleString()}
          </h3>
          <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 sm:mt-1 truncate">{totalStockUnits} Units in stock</p>
        </div>
      </div>

      {/* ALL DETAIL REPORT CARDS SUITE */}
      <div>
        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3">
          Available Detail Reports
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* WHOLESALE & RETAILER B2B REPORT CARD (NEW) */}
          <div
            onClick={() => setActiveReportModal('wholesale')}
            className="bg-white dark:bg-neutral-900 border-2 border-purple-300 dark:border-purple-800 rounded-2xl p-4 shadow-xs hover:border-purple-500 hover:shadow-md transition cursor-pointer flex flex-col justify-between relative overflow-hidden"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
                  <Store className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-extrabold px-2 py-0.5 bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 rounded-full">
                  B2B Wholesale
                </span>
              </div>
              <div>
                <h4 className="font-extrabold text-slate-900 dark:text-white text-sm">
                  Wholesale & Retailer B2B Report
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-neutral-400 mt-0.5">
                  Retailer sales, wholesale cost, net profit/loss, and discounts given
                </p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-purple-100 dark:border-neutral-800 flex items-center justify-between text-xs font-bold text-purple-600 dark:text-purple-400">
              <span>{wholesaleSales.length} Wholesale Invoices</span>
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>

          {/* 1. Sales Report Card */}
          <div
            onClick={() => setActiveReportModal('sales')}
            className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs hover:border-blue-500 hover:shadow-md transition cursor-pointer flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">Sales & Invoices Report</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Itemized sales, customer invoices, cash vs credit split
                </p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-blue-600">
              <span>View Detail Report</span>
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>

          {/* 2. Daily Expenses Report Card */}
          <div
            onClick={() => setActiveReportModal('expenses')}
            className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs hover:border-rose-500 hover:shadow-md transition cursor-pointer flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">Daily Expenses Report</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Expenditure log by date, category, and payment channel
                </p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-rose-600">
              <span>View Detail Report</span>
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>

          {/* 3. Inventory Stock Valuation Card */}
          <div
            onClick={() => setActiveReportModal('inventory')}
            className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs hover:border-indigo-500 hover:shadow-md transition cursor-pointer flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">Inventory & Valuation</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Stock levels, cost value, retail value, low stock warnings
                </p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-indigo-600">
              <span>View Detail Report</span>
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>

          {/* 4. Customer Credit / Khata Report Card */}
          <div
            onClick={() => setActiveReportModal('khata')}
            className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs hover:border-purple-500 hover:shadow-md transition cursor-pointer flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">Customer Credit & Khata</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Outstanding credit, customer accounts, recovery records
                </p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-purple-600">
              <span>View Detail Report</span>
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>

          {/* 5. Profit & Loss Statement Card */}
          <div
            onClick={() => setActiveReportModal('pnl')}
            className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs hover:border-emerald-500 hover:shadow-md transition cursor-pointer flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">Profit & Loss Statement</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Revenue, cost of sales, operating expenses, net margin
                </p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-emerald-600">
              <span>View Detail Report</span>
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>

          {/* 6. Daily Closing Report Card */}
          <div
            onClick={() => setActiveReportModal('closings')}
            className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs hover:border-teal-500 hover:shadow-md transition cursor-pointer flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
                <Calculator className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">Daily Closing & Cash Flow</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Physical cash counts, digital account balances, reconciliation
                </p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-teal-600">
              <span>View Detail Report</span>
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>

          {/* 7. Purchases & Stock Inward Card */}
          <div
            onClick={() => setActiveReportModal('purchases')}
            className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs hover:border-amber-500 hover:shadow-md transition cursor-pointer flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">Purchases Ledger</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Stock inward acquisition history and purchase cost entries
                </p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-amber-600">
              <span>View Detail Report</span>
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>

          {/* 8. Top Selling Products Card */}
          <div
            onClick={() => setActiveReportModal('top_products')}
            className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs hover:border-orange-500 hover:shadow-md transition cursor-pointer flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="w-9 h-9 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center font-bold">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">Top Selling Products</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Sales ranking by units sold, total volume, and profit contribution
                </p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-orange-600">
              <span>View Detail Report</span>
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>

          {/* 9. Returns & Refunds Report Card */}
          <div
            onClick={() => setActiveReportModal('returns')}
            className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs hover:border-amber-500 hover:shadow-md transition cursor-pointer flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">Returns & Refunds</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Restored inventory, IMEIs, customer refunds & reversed margins
                </p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-amber-600">
              <span>{(data.salesReturns || []).length} Returns Recorded</span>
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>

      {/* Sales Invoices Audit Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h4 className="font-bold text-slate-900 text-sm">Completed Sales History & Invoices</h4>
            <p className="text-xs text-slate-500 mt-0.5">Audit trail of processed customer purchases</p>
          </div>
          <button
            type="button"
            onClick={() => setActiveReportModal('sales')}
            className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            <span>Full Sales Report</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="border border-slate-200/80 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="p-3">Invoice #</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Items Sold</th>
                  <th className="p-3">Payment</th>
                  <th className="p-3 text-right">Grand Total</th>
                  <th className="p-3 text-right">Net Profit</th>
                  <th className="p-3 text-center">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.sales.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-10 text-slate-400">
                      No sales recorded yet. Process a transaction in POS.
                    </td>
                  </tr>
                ) : (
                  [...data.sales].reverse().slice(0, 15).map(sale => (
                    <tr key={sale.invNo} className="hover:bg-slate-50/60 transition">
                      <td className="p-3 tabular-nums font-bold text-blue-600">
                        #{sale.invNo}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col gap-1 items-start">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              sale.invoiceType === 'credit'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {sale.invoiceType === 'credit' ? 'Credit' : 'Cash'}
                          </span>
                          {sale.returnStatus === 'FULL' && (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 bg-rose-100 text-rose-800 rounded">
                              RETURNED
                            </span>
                          )}
                          {sale.returnStatus === 'PARTIAL' && (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded">
                              PARTIAL RET
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-slate-500 tabular-nums text-[11px]">
                        {new Date(sale.date).toLocaleDateString()}
                      </td>
                      <td className="p-3 font-semibold text-slate-900">
                        {sale.custName || 'Walk-in'}
                      </td>
                      <td className="p-3 text-slate-600">
                        {sale.items.length} {sale.items.length === 1 ? 'item' : 'items'} (
                        {sale.items.reduce((acc, i) => acc + i.qty, 0)} units)
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 bg-slate-100 rounded text-[11px] font-semibold text-slate-700">
                          {sale.paymentMethod}
                        </span>
                      </td>
                      <td className="p-3 text-right tabular-nums font-bold text-slate-900">
                        {currency} {sale.grandTotal.toLocaleString()}
                      </td>
                      <td className="p-3 text-right tabular-nums font-bold text-emerald-600">
                        {data.currentRole === 'salesman' ? '••••' : `+${currency} ${sale.netProfit.toLocaleString()}`}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => onViewReceipt(sale)}
                            className="p-1 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                            title="Print Receipt"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          {onEditSale && sale.status !== 'CANCELLED' && (
                            <button
                              type="button"
                              onClick={() => onEditSale(sale)}
                              className="p-1 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition cursor-pointer"
                              title="Edit Invoice"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {onDeleteSale && (
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteSaleModal(sale);
                                setDeleteMode(sale.status === 'CANCELLED' ? 'permanent' : 'cancel');
                                setCancelReason('Customer request / cancelled');
                              }}
                              className="p-1 text-slate-500 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                              title={sale.status === 'CANCELLED' ? 'Delete Permanently' : 'Delete / Void Invoice'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {onOpenSalesReturn && sale.returnStatus !== 'FULL' && (
                            <button
                              type="button"
                              onClick={() => onOpenSalesReturn(sale)}
                              className="p-1 text-slate-500 hover:text-amber-600 rounded-lg hover:bg-amber-50 transition cursor-pointer"
                              title="Process Sales Return & Refund"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* DETAIL REPORT MODAL & PRINTABLE PDF AREA */}
      {activeReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl sm:rounded-3xl max-w-4xl w-full max-w-full overflow-x-hidden p-3 sm:p-6 shadow-2xl space-y-4 border border-slate-100 animate-in zoom-in-95 max-h-[92dvh] lg:max-h-[92vh] flex flex-col my-auto">
            {/* Modal Header */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-2 items-stretch sm:items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center justify-between sm:justify-start gap-2.5 min-w-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 shrink-0 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                    <PieChart className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-extrabold text-slate-900 dark:text-white text-xs sm:text-sm uppercase tracking-wide truncate">
                      {activeReportModal === 'wholesale' && 'Wholesale & Retailer B2B Report'}
                      {activeReportModal === 'sales' && 'Sales & Revenue Report'}
                      {activeReportModal === 'expenses' && 'Daily Expenses Report'}
                      {activeReportModal === 'inventory' && 'Inventory & Stock Valuation Report'}
                      {activeReportModal === 'khata' && 'Customer Credit & Khata Report'}
                      {activeReportModal === 'pnl' && 'Profit & Loss Statement (P&L)'}
                      {activeReportModal === 'closings' && 'Daily Closing & Cash Flow Report'}
                      {activeReportModal === 'purchases' && 'Purchases & Stock Inward Ledger'}
                      {activeReportModal === 'top_products' && 'Top Selling Products Report'}
                      {activeReportModal === 'returns' && 'Sales Returns & Refunds Report'}
                    </h3>
                    <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">
                      Detailed audit report • {shopName}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveReportModal(null)}
                  className="sm:hidden text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 transition cursor-pointer shrink-0 ml-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                <button
                  type="button"
                  onClick={() => handleShareWhatsAppReport(activeReportModal)}
                  className="w-full sm:w-auto px-3 py-2 sm:py-1.5 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 font-bold text-xs whitespace-normal rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5 shrink-0" /> <span>Send to WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrintCurrentReport}
                  className="w-full sm:w-auto px-3.5 py-2 sm:py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs whitespace-normal rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/20 transition cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 shrink-0" /> <span>Download / Print PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveReportModal(null)}
                  className="hidden sm:flex text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 transition cursor-pointer items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* In-Modal Quick Date Range Filter */}
            <div className="bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl p-2.5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-bold text-xs text-slate-700 dark:text-neutral-300">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  <span>Timeframe Filter:</span>
                </div>
                <div className="flex flex-wrap items-center gap-1 text-[11px]">
                  {[
                    { id: 'today', label: 'Today' },
                    { id: 'week', label: 'This Week' },
                    { id: 'month', label: 'This Month' },
                    { id: '6month', label: '6 Months' },
                    { id: 'year', label: 'This Year' },
                    { id: 'custom', label: 'Custom Date' },
                    { id: 'all', label: 'All Time' },
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setDateFilterMode(opt.id as DateFilterMode)}
                      className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                        dateFilterMode === opt.id
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'bg-white dark:bg-neutral-800 text-slate-600 dark:text-neutral-300 border border-slate-200 dark:border-neutral-700 hover:bg-slate-100 dark:hover:bg-neutral-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {dateFilterMode === 'custom' && (
                <div className="pt-2 border-t border-slate-200 dark:border-neutral-800 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-500 dark:text-neutral-400">From:</span>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={e => setCustomStartDate(e.target.value)}
                    className="bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-slate-900 dark:text-white px-2 py-0.5 rounded-lg text-xs"
                  />
                  <span className="font-semibold text-slate-500 dark:text-neutral-400">To:</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={e => setCustomEndDate(e.target.value)}
                    className="bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-slate-900 dark:text-white px-2 py-0.5 rounded-lg text-xs"
                  />
                </div>
              )}
            </div>

            {/* Scrollable Report Content Area */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 text-xs">
              {/* Report Header Information */}
              <div className="bg-slate-50 dark:bg-neutral-900 p-3 sm:p-3.5 rounded-2xl border border-slate-200/80 dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="font-extrabold text-slate-900 dark:text-white text-xs sm:text-sm">{shopName}</h4>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-neutral-400">{data.settings.address} • Ph: {data.settings.phone}</p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-[10px] sm:text-[11px] font-bold text-slate-700 dark:text-neutral-300">Date Generated:</p>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-neutral-400 tabular-nums">{new Date().toLocaleString()}</p>
                </div>
              </div>

              {/* REPORT: WHOLESALE & RETAILER B2B REPORT */}
              {activeReportModal === 'wholesale' && (
                <div className="space-y-4">
                  {/* Top 4 Wholesale KPI metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
                    <div className="p-3 bg-purple-50 dark:bg-neutral-900 rounded-xl border border-purple-200 dark:border-purple-900/60">
                      <span className="text-[10px] font-bold text-purple-700 dark:text-purple-400 uppercase">Wholesale Sales</span>
                      <p className="text-base sm:text-lg font-bold tabular-nums text-purple-900 dark:text-purple-300 mt-0.5 truncate">
                        {currency} {totalWholesaleRevenue.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-purple-600 dark:text-purple-400 mt-0.5">{wholesaleSales.length} Invoices • {totalWholesaleUnits} units</p>
                    </div>

                    <div className="p-3 bg-slate-100 dark:bg-neutral-900 rounded-xl border border-slate-200 dark:border-neutral-800">
                      <span className="text-[10px] font-bold text-slate-600 dark:text-neutral-400 uppercase">Wholesale Cost (COGS)</span>
                      <p className="text-base sm:text-lg font-bold tabular-nums text-slate-900 dark:text-neutral-200 mt-0.5 truncate">
                        {currency} {totalWholesaleCost.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">Purchased Cost</p>
                    </div>

                    <div className="p-3 bg-emerald-50 dark:bg-neutral-900 rounded-xl border border-emerald-200 dark:border-emerald-900/60">
                      <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase">Wholesale Net Profit/Loss</span>
                      <p className={`text-base sm:text-lg font-bold tabular-nums mt-0.5 truncate ${totalWholesaleProfit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600'}`}>
                        {totalWholesaleProfit >= 0 ? '+' : ''}{currency} {totalWholesaleProfit.toLocaleString()}
                      </p>
                    </div>

                    <div className="p-3 bg-amber-50 dark:bg-neutral-900 rounded-xl border border-amber-200 dark:border-amber-900/60">
                      <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase">Retailer Discounts Given</span>
                      <p className="text-base sm:text-lg font-bold tabular-nums text-amber-900 dark:text-amber-300 mt-0.5 truncate">
                        {currency} {totalWholesaleDiscountsGiven.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Section 1: Retailers Summary */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-extrabold text-slate-900 dark:text-white text-xs uppercase tracking-wide flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-purple-600" />
                        Retailer Breakdown
                      </h4>
                      <span className="text-[11px] text-slate-500 dark:text-neutral-400 font-semibold">
                        {retailerStats.length} Registered Retailers
                      </span>
                    </div>

                    <div className="w-full overflow-x-auto border border-slate-200 dark:border-neutral-800 rounded-xl">
                      <table className="w-full min-w-[620px] text-left border-collapse text-xs">
                        <thead className="bg-slate-100 dark:bg-neutral-800 font-bold text-[10px] uppercase text-slate-600 dark:text-neutral-400">
                          <tr>
                            <th className="p-2.5">Retailer / Shopkeeper</th>
                            <th className="p-2.5">Shop Name & City</th>
                            <th className="p-2.5">Contact Phone</th>
                            <th className="p-2.5 text-center">Invoices</th>
                            <th className="p-2.5 text-right">Total Purchases</th>
                            <th className="p-2.5 text-right">Net Profit</th>
                            <th className="p-2.5 text-right">Discount / Savings</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                          {retailerStats.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="text-center py-6 text-slate-400">
                                No wholesale transactions recorded for this timeframe.
                              </td>
                            </tr>
                          ) : (
                            retailerStats.map((r, idx) => (
                              <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-neutral-850">
                                <td className="p-2.5 font-bold text-slate-900 dark:text-white">{r.name}</td>
                                <td className="p-2.5 text-slate-600 dark:text-neutral-300">
                                  {r.shopName !== '-' ? r.shopName : ''} {r.city !== '-' ? `(${r.city})` : '-'}
                                </td>
                                <td className="p-2.5 tabular-nums text-[11px] text-slate-500 dark:text-neutral-400">{r.phone}</td>
                                <td className="p-2.5 text-center tabular-nums font-bold">{r.invoicesCount}</td>
                                <td className="p-2.5 text-right tabular-nums font-bold text-slate-900 dark:text-white">
                                  {currency} {r.totalPurchased.toLocaleString()}
                                </td>
                                <td className="p-2.5 text-right tabular-nums font-bold text-emerald-600">
                                  +{currency} {r.totalProfit.toLocaleString()}
                                </td>
                                <td className="p-2.5 text-right tabular-nums font-bold text-amber-600">
                                  {currency} {r.totalDiscounts.toLocaleString()}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Section 2: Detailed Wholesale Invoices Table */}
                  <div className="space-y-2">
                    <h4 className="font-extrabold text-slate-900 dark:text-white text-xs uppercase tracking-wide flex items-center gap-1.5">
                      <Receipt className="w-3.5 h-3.5 text-blue-600" />
                      Detailed Wholesale Invoices
                    </h4>

                    <div className="w-full overflow-x-auto border border-slate-200 dark:border-neutral-800 rounded-xl">
                      <table className="w-full min-w-[700px] text-left border-collapse text-xs">
                        <thead className="bg-slate-100 dark:bg-neutral-800 font-bold text-[10px] uppercase text-slate-600 dark:text-neutral-400">
                          <tr>
                            <th className="p-2.5">Inv #</th>
                            <th className="p-2.5">Date</th>
                            <th className="p-2.5">Retailer</th>
                            <th className="p-2.5">Products Sold</th>
                            <th className="p-2.5">Payment</th>
                            <th className="p-2.5 text-right">Discount</th>
                            <th className="p-2.5 text-right">Total Bill</th>
                            <th className="p-2.5 text-right">Profit</th>
                            <th className="p-2.5 text-center">Receipt</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                          {wholesaleSales.length === 0 ? (
                            <tr>
                              <td colSpan={9} className="text-center py-8 text-slate-400">
                                No wholesale invoices recorded in this period.
                              </td>
                            </tr>
                          ) : (
                            wholesaleSales.map(s => (
                              <tr key={s.invNo} className="hover:bg-slate-50 dark:hover:bg-neutral-850">
                                <td className="p-2.5 tabular-nums font-bold text-purple-600">#{s.invNo}</td>
                                <td className="p-2.5 text-slate-500 tabular-nums text-[11px]">
                                  {new Date(s.date).toLocaleDateString()}
                                </td>
                                <td className="p-2.5 font-semibold text-slate-900 dark:text-white">
                                  {s.custName}
                                  {s.retailerShopName && (
                                    <span className="block text-[10px] text-slate-400">{s.retailerShopName}</span>
                                  )}
                                </td>
                                <td className="p-2.5 text-slate-700 dark:text-neutral-300">
                                  {s.items.map((i, idx) => (
                                    <span key={idx} className="block text-[11px]">
                                      • {i.name} (x{i.qty}) @ {currency} {(i.wholesalePrice || i.salePrice).toLocaleString()}
                                    </span>
                                  ))}
                                </td>
                                <td className="p-2.5">
                                  <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-neutral-800 text-[10px] font-semibold">
                                    {s.paymentMethod}
                                  </span>
                                </td>
                                <td className="p-2.5 text-right tabular-nums font-bold text-amber-600">
                                  {currency} {((s.wholesaleSavings || 0) + (s.discount || 0)).toLocaleString()}
                                </td>
                                <td className="p-2.5 text-right tabular-nums font-bold text-slate-900 dark:text-white">
                                  {currency} {s.grandTotal.toLocaleString()}
                                </td>
                                <td className="p-2.5 text-right tabular-nums font-bold text-emerald-600">
                                  +{currency} {s.netProfit.toLocaleString()}
                                </td>
                                <td className="p-2.5 text-center">
                                  <button
                                    type="button"
                                    onClick={() => onViewReceipt(s)}
                                    className="p-1 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                                    title="View Wholesale Receipt"
                                  >
                                    <Printer className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* REPORT 1: SALES & REVENUE */}
              {activeReportModal === 'sales' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                    <div className="p-2.5 sm:p-3 bg-blue-50 dark:bg-neutral-900 rounded-xl border border-blue-200 dark:border-blue-900/60">
                      <span className="text-[10px] font-bold text-blue-700 dark:text-blue-400 uppercase">Gross Revenue</span>
                      <p className="text-base sm:text-lg font-bold tabular-nums text-blue-900 dark:text-blue-300 mt-0.5 truncate">{currency} {totalSalesRevenue.toLocaleString()}</p>
                    </div>
                    <div className="p-2.5 sm:p-3 bg-slate-100 dark:bg-neutral-900 rounded-xl border border-slate-200 dark:border-neutral-800">
                      <span className="text-[10px] font-bold text-slate-600 dark:text-neutral-400 uppercase">Total COGS</span>
                      <p className="text-base sm:text-lg font-bold tabular-nums text-slate-900 dark:text-neutral-200 mt-0.5 truncate">{currency} {totalCOGS.toLocaleString()}</p>
                    </div>
                    <div className="col-span-2 sm:col-span-1 p-2.5 sm:p-3 bg-emerald-50 dark:bg-neutral-900 rounded-xl border border-emerald-200 dark:border-emerald-900/60">
                      <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase">Total Profit</span>
                      <p className="text-base sm:text-lg font-bold tabular-nums text-emerald-900 dark:text-emerald-300 mt-0.5 truncate">+{currency} {netProfit.toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="w-full overflow-x-auto border border-slate-200 dark:border-neutral-800 rounded-xl">
                    <table className="w-full min-w-[580px] text-left border-collapse">
                      <thead className="bg-slate-100 dark:bg-neutral-800 font-bold text-[10px] uppercase text-slate-600 dark:text-neutral-400">
                        <tr>
                          <th className="p-2.5">Inv #</th>
                          <th className="p-2.5">Type</th>
                          <th className="p-2.5">Date</th>
                          <th className="p-2.5">Customer</th>
                          <th className="p-2.5">Method</th>
                          <th className="p-2.5 text-right">Total</th>
                          <th className="p-2.5 text-right">Profit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-neutral-800 text-xs">
                        {filteredSales.map(s => (
                          <tr key={s.invNo} className="hover:bg-slate-50 dark:hover:bg-neutral-850">
                            <td className="p-2.5 tabular-nums font-bold text-blue-600">#{s.invNo}</td>
                            <td className="p-2.5 font-semibold capitalize">{s.invoiceType || 'Cash'}</td>
                            <td className="p-2.5 text-slate-500 tabular-nums text-[11px]">{new Date(s.date).toLocaleDateString()}</td>
                            <td className="p-2.5 font-bold text-slate-800 dark:text-white">{s.custName}</td>
                            <td className="p-2.5">{s.paymentMethod}</td>
                            <td className="p-2.5 text-right tabular-nums font-bold">{currency} {s.grandTotal.toLocaleString()}</td>
                            <td className="p-2.5 text-right tabular-nums font-bold text-emerald-600">+{currency} {s.netProfit.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* REPORT 2: DAILY EXPENSES */}
              {activeReportModal === 'expenses' && (
                <div className="space-y-4">
                  <div className="p-3 sm:p-3.5 bg-rose-50 rounded-xl border border-rose-200 flex justify-between items-center gap-2">
                    <div>
                      <span className="text-[10px] font-bold text-rose-700 uppercase">Total Recorded Expenses</span>
                      <p className="text-lg sm:text-xl font-bold tabular-nums text-rose-900">{currency} {totalExpenses.toLocaleString()}</p>
                    </div>
                    <span className="text-xs font-bold text-rose-700 bg-white px-3 py-1 rounded-xl shadow-2xs border border-rose-100 shrink-0">
                      {data.expenses.length} Records
                    </span>
                  </div>

                  <div className="w-full overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full min-w-[520px] text-left border-collapse">
                      <thead className="bg-slate-100 font-bold text-[10px] uppercase text-slate-600">
                        <tr>
                          <th className="p-2.5">Date</th>
                          <th className="p-2.5">Description</th>
                          <th className="p-2.5">Category</th>
                          <th className="p-2.5">Payment Method</th>
                          <th className="p-2.5 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {data.expenses.map(e => (
                          <tr key={e.id} className="hover:bg-slate-50">
                            <td className="p-2.5 text-slate-500 tabular-nums text-[11px]">{new Date(e.date).toLocaleDateString()}</td>
                            <td className="p-2.5 font-semibold text-slate-900">{e.description}</td>
                            <td className="p-2.5"><span className="px-2 py-0.5 bg-slate-100 rounded text-[11px]">{e.category}</span></td>
                            <td className="p-2.5">{e.paymentMethod || 'Cash'}</td>
                            <td className="p-2.5 text-right tabular-nums font-bold text-rose-600">{currency} {e.amount.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* REPORT 3: INVENTORY VALUATION */}
              {activeReportModal === 'inventory' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                    <div className="p-2.5 sm:p-3 bg-indigo-50 rounded-xl border border-indigo-200">
                      <span className="text-[10px] font-bold text-indigo-700 uppercase">Cost Value</span>
                      <p className="text-base sm:text-lg font-bold tabular-nums text-indigo-900 mt-0.5 truncate">{currency} {stockValuationCost.toLocaleString()}</p>
                    </div>
                    <div className="p-2.5 sm:p-3 bg-blue-50 rounded-xl border border-blue-200">
                      <span className="text-[10px] font-bold text-blue-700 uppercase">Retail Value</span>
                      <p className="text-base sm:text-lg font-bold tabular-nums text-blue-900 mt-0.5 truncate">{currency} {stockValuationRetail.toLocaleString()}</p>
                    </div>
                    <div className="col-span-2 sm:col-span-1 p-2.5 sm:p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                      <span className="text-[10px] font-bold text-emerald-700 uppercase">Expected Profit</span>
                      <p className="text-base sm:text-lg font-bold tabular-nums text-emerald-900 mt-0.5 truncate">+{currency} {(stockValuationRetail - stockValuationCost).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="w-full overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full min-w-[580px] text-left border-collapse">
                      <thead className="bg-slate-100 font-bold text-[10px] uppercase text-slate-600">
                        <tr>
                          <th className="p-2.5">Product Title</th>
                          <th className="p-2.5">Category</th>
                          <th className="p-2.5 text-center">Stock Qty</th>
                          <th className="p-2.5 text-right">Cost Price</th>
                          <th className="p-2.5 text-right">Sale Price</th>
                          <th className="p-2.5 text-right">Total Valuation</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {data.inventory.map(item => (
                          <tr key={item.id} className="hover:bg-slate-50">
                            <td className="p-2.5 font-bold text-slate-900">{item.name}</td>
                            <td className="p-2.5 text-slate-500">{item.category}</td>
                            <td className="p-2.5 text-center tabular-nums font-bold">
                              <span className={item.qty <= 1 ? 'text-rose-600 font-bold' : ''}>{item.qty}</span>
                            </td>
                            <td className="p-2.5 text-right tabular-nums">{currency} {item.costPrice.toLocaleString()}</td>
                            <td className="p-2.5 text-right tabular-nums font-bold">{currency} {item.salePrice.toLocaleString()}</td>
                            <td className="p-2.5 text-right tabular-nums font-extrabold text-indigo-700">
                              {currency} {(item.costPrice * item.qty).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* REPORT 4: CUSTOMER KHATA */}
              {activeReportModal === 'khata' && (
                <div className="space-y-4">
                  <div className="p-3 sm:p-3.5 bg-purple-50 rounded-xl border border-purple-200 flex justify-between items-center gap-2">
                    <div>
                      <span className="text-[10px] font-bold text-purple-700 uppercase">Total Pending Receivables</span>
                      <p className="text-lg sm:text-xl font-bold tabular-nums text-purple-900">{currency} {totalUdhar.toLocaleString()}</p>
                    </div>
                    <span className="text-xs font-bold text-purple-700 bg-white px-3 py-1 rounded-xl shrink-0 border border-purple-100">
                      {debtorCustomersCount} Customers with Balance
                    </span>
                  </div>

                  <div className="w-full overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full min-w-[550px] text-left border-collapse">
                      <thead className="bg-slate-100 font-bold text-[10px] uppercase text-slate-600">
                        <tr>
                          <th className="p-2.5">Customer Name</th>
                          <th className="p-2.5">Primary Phone</th>
                          <th className="p-2.5">Location / Address</th>
                          <th className="p-2.5 text-center">Tx Count</th>
                          <th className="p-2.5 text-right">Outstanding Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {data.khata.map(c => (
                          <tr key={c.id} className="hover:bg-slate-50">
                            <td className="p-2.5 font-bold text-slate-900">{c.name}</td>
                            <td className="p-2.5 tabular-nums">{c.phone}</td>
                            <td className="p-2.5 text-slate-500">{c.address || '-'}</td>
                            <td className="p-2.5 text-center">{c.history.length}</td>
                            <td className="p-2.5 text-right tabular-nums font-bold text-purple-700">{currency} {c.balance.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* REPORT 5: PROFIT & LOSS STATEMENT */}
              {activeReportModal === 'pnl' && (
                <div className="space-y-4 bg-white p-3 sm:p-4 rounded-2xl border border-slate-200">
                  <h4 className="font-extrabold text-xs sm:text-sm border-b pb-2 uppercase tracking-wide text-slate-800">
                    Comprehensive Financial Statement
                  </h4>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="font-semibold text-slate-700">Gross Sales Revenue:</span>
                      <span className="tabular-nums font-bold text-slate-900">{currency} {totalSalesRevenue.toLocaleString()}</span>
                    </div>

                    <div className="flex justify-between py-1.5 border-b border-slate-100 text-slate-600">
                      <span>Less: Cost of Goods Sold (COGS):</span>
                      <span className="tabular-nums font-bold text-slate-700">-{currency} {totalCOGS.toLocaleString()}</span>
                    </div>

                    <div className="flex justify-between py-2 border-b border-slate-200 font-bold bg-slate-50 px-2 rounded-lg">
                      <span className="text-slate-900">Gross Operating Profit:</span>
                      <span className="tabular-nums text-emerald-700">{currency} {grossProfit.toLocaleString()}</span>
                    </div>

                    <div className="flex justify-between py-1.5 border-b border-slate-100 text-rose-600">
                      <span>Less: Operational Shop Expenses:</span>
                      <span className="tabular-nums font-bold">-{currency} {totalExpenses.toLocaleString()}</span>
                    </div>

                    <div className="flex justify-between py-3 border-t-2 border-slate-900 font-extrabold text-xs sm:text-sm">
                      <span className="text-slate-900">Net Business Profit (kat peet kar):</span>
                      <span className={`tabular-nums ${netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {currency} {netProfit.toLocaleString()}
                      </span>
                    </div>

                    <div className="flex justify-between py-1 text-slate-500 text-[11px]">
                      <span>Net Profit Margin:</span>
                      <span className="font-bold">{netMarginPercent}%</span>
                    </div>
                  </div>
                </div>
              )}

              {/* REPORT 6: DAILY CLOSINGS */}
              {activeReportModal === 'closings' && (
                <div className="space-y-4">
                  <div className="w-full overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full min-w-[580px] text-left border-collapse">
                      <thead className="bg-slate-100 font-bold text-[10px] uppercase text-slate-600">
                        <tr>
                          <th className="p-2.5">Date & Time</th>
                          <th className="p-2.5">Cashier</th>
                          <th className="p-2.5 text-right">Physical Cash</th>
                          <th className="p-2.5 text-right">Digital Accounts</th>
                          <th className="p-2.5 text-right">Grand Total</th>
                          <th className="p-2.5 text-right">Difference</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {closingsHistory.map(rec => (
                          <tr key={rec.id} className="hover:bg-slate-50">
                            <td className="p-2.5 tabular-nums font-bold">{rec.date} ({rec.time})</td>
                            <td className="p-2.5">{rec.closedBy}</td>
                            <td className="p-2.5 text-right tabular-nums font-bold text-emerald-600">{currency} {rec.totalCash.toLocaleString()}</td>
                            <td className="p-2.5 text-right tabular-nums font-bold text-blue-600">{currency} {rec.totalOnline.toLocaleString()}</td>
                            <td className="p-2.5 text-right tabular-nums font-extrabold text-slate-900">{currency} {rec.grandTotal.toLocaleString()}</td>
                            <td className="p-2.5 text-right tabular-nums font-bold">
                              {rec.difference === 0 ? 'Matched' : `${rec.difference! > 0 ? '+' : ''}${currency} ${rec.difference?.toLocaleString()}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* REPORT 7: PURCHASES LEDGER */}
              {activeReportModal === 'purchases' && (
                <div className="space-y-4">
                  <div className="w-full overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full min-w-[520px] text-left border-collapse">
                      <thead className="bg-slate-100 font-bold text-[10px] uppercase text-slate-600">
                        <tr>
                          <th className="p-2.5">Date</th>
                          <th className="p-2.5">Item Name</th>
                          <th className="p-2.5 text-center">Qty Purchased</th>
                          <th className="p-2.5 text-right">Cost Price</th>
                          <th className="p-2.5 text-right">Total Investment</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {data.purchasesLedger.map(p => (
                          <tr key={p.id} className="hover:bg-slate-50">
                            <td className="p-2.5 text-slate-500 tabular-nums text-[11px]">{new Date(p.date).toLocaleDateString()}</td>
                            <td className="p-2.5 font-bold text-slate-900">{p.itemTitle}</td>
                            <td className="p-2.5 text-center tabular-nums font-bold">{p.qty}</td>
                            <td className="p-2.5 text-right tabular-nums">{currency} {p.costPrice.toLocaleString()}</td>
                            <td className="p-2.5 text-right tabular-nums font-bold text-amber-700">{currency} {p.total.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* REPORT 8: TOP SELLING PRODUCTS */}
              {activeReportModal === 'top_products' && (
                <div className="space-y-4">
                  <div className="w-full overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full min-w-[520px] text-left border-collapse">
                      <thead className="bg-slate-100 font-bold text-[10px] uppercase text-slate-600">
                        <tr>
                          <th className="p-2.5">Rank</th>
                          <th className="p-2.5">Product Name</th>
                          <th className="p-2.5 text-slate-500">Category</th>
                          <th className="p-2.5 text-center">Units Sold</th>
                          <th className="p-2.5 text-right">Revenue Generated</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {topSellingList.map((p, idx) => (
                          <tr key={p.id} className="hover:bg-slate-50">
                            <td className="p-2.5 font-bold text-slate-400">#{idx + 1}</td>
                            <td className="p-2.5 font-bold text-slate-900">{p.name}</td>
                            <td className="p-2.5 text-slate-500">{p.category}</td>
                            <td className="p-2.5 text-center tabular-nums font-bold text-blue-600">{p.unitsSold}</td>
                            <td className="p-2.5 text-right tabular-nums font-extrabold text-slate-900">{currency} {p.totalRevenue.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* REPORT 9: SALES RETURNS & REFUNDS */}
              {activeReportModal === 'returns' && (
                <div className="space-y-4">
                  <div className="p-3 sm:p-3.5 bg-amber-50 rounded-xl border border-amber-200 flex justify-between items-center gap-2">
                    <div>
                      <span className="text-[10px] font-bold text-amber-700 uppercase">Total Customer Refunds Paid</span>
                      <p className="text-lg sm:text-xl font-bold tabular-nums text-amber-900">{currency} {totalRefundsAmount.toLocaleString()}</p>
                    </div>
                    <span className="text-xs font-bold text-amber-800 bg-white px-3 py-1 rounded-xl shadow-2xs border border-amber-200 shrink-0">
                      {(data.salesReturns || []).length} Return Records
                    </span>
                  </div>

                  {(!data.salesReturns || data.salesReturns.length === 0) ? (
                    <div className="text-center py-12 text-slate-400 text-xs">
                      No sales returns recorded yet.
                    </div>
                  ) : (
                    <div className="w-full overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full min-w-[650px] text-left border-collapse text-xs">
                        <thead className="bg-slate-100 font-bold text-[10px] uppercase text-slate-600">
                          <tr>
                            <th className="p-2.5">Return #</th>
                            <th className="p-2.5">Date</th>
                            <th className="p-2.5">Inv #</th>
                            <th className="p-2.5">Customer</th>
                            <th className="p-2.5">Returned Items & IMEIs</th>
                            <th className="p-2.5">Reason</th>
                            <th className="p-2.5">Method</th>
                            <th className="p-2.5 text-right">Refund Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {data.salesReturns.map(ret => (
                            <tr key={ret.id} className="hover:bg-slate-50">
                              <td className="p-2.5 tabular-nums font-bold text-amber-700">#{ret.returnNo}</td>
                              <td className="p-2.5 text-slate-500 tabular-nums text-[11px]">{new Date(ret.returnDate).toLocaleDateString()}</td>
                              <td className="p-2.5 tabular-nums font-semibold text-blue-600">#{ret.originalInvNo}</td>
                              <td className="p-2.5 font-bold text-slate-900">{ret.customerName}</td>
                              <td className="p-2.5">
                                {ret.items.map((i, idx) => (
                                  <div key={idx} className="text-[11px]">
                                    <span className="font-semibold text-slate-800">{i.name} (x{i.qty})</span>
                                    {i.imeis && i.imeis.length > 0 && (
                                      <div className="text-[10px] tabular-nums text-purple-700">
                                        IMEI: {i.imeis.join(', ')}
                                      </div>
                                    )}
                                    {i.imei && !i.imeis && (
                                      <div className="text-[10px] tabular-nums text-purple-700">
                                        IMEI: {i.imei}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </td>
                              <td className="p-2.5 text-slate-600 text-[11px]">{ret.reason}</td>
                              <td className="p-2.5 text-slate-700 font-semibold">{ret.refundPaymentMethod}</td>
                              <td className="p-2.5 text-right tabular-nums font-bold text-rose-600">
                                -{currency} {ret.totalRefundAmount.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Watermark & Mandatory Footer */}
              <div className="pt-4 border-t border-slate-200 text-center space-y-1">
                <p className="font-extrabold text-slate-800 text-xs tracking-wider">
                  Created by HAMMAD RAZA DEVELOPMENT
                </p>
                <p className="text-[10px] text-slate-400">
                  {shopName} • Management Information System
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-2 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setActiveReportModal(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HIDDEN PRINTABLE REPORT AREA FOR PDF EXPORT */}
      {activeReportModal && (
        <div id="printable-report-area" className="hidden font-sans text-xs">
          <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '12px', marginBottom: '16px' }}>
            <h1 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 4px 0' }}>{shopName}</h1>
            <p style={{ margin: '2px 0', fontSize: '11px' }}>{data.settings.address} | Ph: {data.settings.phone}</p>
            <h2 style={{ fontSize: '14px', fontWeight: 'bold', margin: '8px 0 0 0', textTransform: 'uppercase' }}>
              {activeReportModal === 'wholesale' && 'WHOLESALE & RETAILER B2B REPORT'}
              {activeReportModal === 'sales' && 'SALES & REVENUE REPORT'}
              {activeReportModal === 'expenses' && 'DAILY EXPENSES REPORT'}
              {activeReportModal === 'inventory' && 'INVENTORY & VALUATION REPORT'}
              {activeReportModal === 'khata' && 'CUSTOMER CREDIT / KHATA REPORT'}
              {activeReportModal === 'pnl' && 'PROFIT & LOSS STATEMENT'}
              {activeReportModal === 'closings' && 'DAILY CLOSING REPORT'}
              {activeReportModal === 'purchases' && 'PURCHASES LEDGER REPORT'}
              {activeReportModal === 'top_products' && 'TOP SELLING PRODUCTS REPORT'}
              {activeReportModal === 'returns' && 'SALES RETURNS & REFUNDS REPORT'}
            </h2>
            <p style={{ fontSize: '10px', color: '#666', margin: '4px 0 0 0' }}>Generated on: {new Date().toLocaleString()}</p>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #000' }}>
                  <th style={{ padding: '6px', textAlign: 'left' }}>Item / Description</th>
                  <th style={{ padding: '6px', textAlign: 'right' }}>Amount / Details</th>
                </tr>
              </thead>
              <tbody>
                {activeReportModal === 'pnl' ? (
                  <>
                    <tr><td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>Gross Sales Revenue</td><td style={{ padding: '6px', borderBottom: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold' }}>{currency} {totalSalesRevenue.toLocaleString()}</td></tr>
                    <tr><td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>Cost of Goods Sold (COGS)</td><td style={{ padding: '6px', borderBottom: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold' }}>-{currency} {totalCOGS.toLocaleString()}</td></tr>
                    <tr><td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>Gross Profit</td><td style={{ padding: '6px', borderBottom: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold' }}>{currency} {grossProfit.toLocaleString()}</td></tr>
                    <tr><td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>Total Operational Expenses</td><td style={{ padding: '6px', borderBottom: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold' }}>-{currency} {totalExpenses.toLocaleString()}</td></tr>
                    <tr style={{ fontWeight: 'bold', fontSize: '12px' }}><td style={{ padding: '8px', borderTop: '2px solid #000' }}>Net Profit</td><td style={{ padding: '8px', borderTop: '2px solid #000', textAlign: 'right' }}>{currency} {netProfit.toLocaleString()}</td></tr>
                  </>
                ) : activeReportModal === 'wholesale' ? (
                  <>
                    <tr style={{ background: '#f8fafc', fontWeight: 'bold' }}>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>Total Wholesale Revenue</td>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd', textAlign: 'right' }}>{currency} {totalWholesaleRevenue.toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>Wholesale Cost (COGS)</td>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd', textAlign: 'right' }}>-{currency} {totalWholesaleCost.toLocaleString()}</td>
                    </tr>
                    <tr style={{ fontWeight: 'bold' }}>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>Wholesale Net Profit</td>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd', textAlign: 'right', color: '#16a34a' }}>{currency} {totalWholesaleProfit.toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>Total Retailer Discounts Given</td>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd', textAlign: 'right' }}>{currency} {totalWholesaleDiscountsGiven.toLocaleString()}</td>
                    </tr>
                    {wholesaleSales.map(s => (
                      <tr key={s.invNo}>
                        <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>
                          Invoice #{s.invNo} - {s.custName} {s.retailerShopName ? `(${s.retailerShopName})` : ''} ({new Date(s.date).toLocaleDateString()})
                        </td>
                        <td style={{ padding: '6px', borderBottom: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold' }}>
                          {currency} {s.grandTotal.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </>
                ) : activeReportModal === 'sales' ? (
                  filteredSales.map(s => (
                    <tr key={s.invNo}>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>Invoice #{s.invNo} - {s.custName} ({new Date(s.date).toLocaleDateString()})</td>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold' }}>{currency} {s.grandTotal.toLocaleString()}</td>
                    </tr>
                  ))
                ) : activeReportModal === 'expenses' ? (
                  filteredExpenses.map(e => (
                    <tr key={e.id}>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>{e.description} [{e.category}] ({new Date(e.date).toLocaleDateString()})</td>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold' }}>{currency} {e.amount.toLocaleString()}</td>
                    </tr>
                  ))
                ) : activeReportModal === 'inventory' ? (
                  data.inventory.map(i => (
                    <tr key={i.id}>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>{i.name} ({i.category}) - Qty: {i.qty}</td>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold' }}>{currency} {(i.costPrice * i.qty).toLocaleString()}</td>
                    </tr>
                  ))
                ) : activeReportModal === 'khata' ? (
                  data.khata.map(c => (
                    <tr key={c.id}>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>{c.name} ({c.phone})</td>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold' }}>{currency} {c.balance.toLocaleString()}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={2} style={{ padding: '10px', textAlign: 'center' }}>Audit Record Processed</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ textAlign: 'center', borderTop: '2px solid #000', paddingTop: '12px', marginTop: '20px' }}>
            <p style={{ fontWeight: 'bold', fontSize: '11px', margin: '0' }}>Created by HAMMAD RAZA DEVELOPMENT</p>
            <p style={{ fontSize: '9px', color: '#666', margin: '4px 0 0 0' }}>Software Developed by HAMMAD RAZA DEVELOPMENT</p>
          </div>
        </div>
      )}

      {/* Delete / Void Confirmation Modal */}
      {deleteSaleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4 border border-slate-100 animate-in zoom-in-95">
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base leading-tight">
                    {deleteSaleModal.status === 'CANCELLED' ? 'Delete Cancelled Invoice' : 'Delete / Void Invoice'}
                  </h3>
                  <p className="text-xs text-slate-500 tabular-nums">
                    Invoice #{deleteSaleModal.invNo} • {new Date(deleteSaleModal.date).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeleteSaleModal(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between text-slate-600">
                <span>Customer:</span>
                <span className="font-bold text-slate-800">{deleteSaleModal.custName || 'Walk-in'}</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-slate-200">
                <span className="font-bold text-slate-700">Total:</span>
                <span className="tabular-nums font-black text-sm text-slate-900">
                  {currency} {deleteSaleModal.grandTotal.toLocaleString()}
                </span>
              </div>
            </div>

            {deleteSaleModal.status !== 'CANCELLED' ? (
              <div className="space-y-2">
                <div
                  onClick={() => setDeleteMode('cancel')}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                    deleteMode === 'cancel'
                      ? 'border-rose-400 bg-rose-50/50 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 text-rose-600" />
                    <span className="font-bold text-xs text-slate-900">Void & Cancel (Safe - Stock Restored)</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Restores inventory stock, marks IMEIs as available, reverses credit balance.
                  </p>
                </div>

                <div
                  onClick={() => setDeleteMode('permanent')}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                    deleteMode === 'permanent'
                      ? 'border-rose-400 bg-rose-50/50 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Trash2 className="w-4 h-4 text-rose-600" />
                    <span className="font-bold text-xs text-rose-700">Permanently Delete</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Completely removes this invoice from records.
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-600">
                Are you sure you want to permanently delete this cancelled invoice from records?
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteSaleModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteSale) {
                    onDeleteSale(deleteSaleModal.invNo, deleteMode === 'permanent', cancelReason);
                  }
                  setDeleteSaleModal(null);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold shadow-sm"
              >
                {deleteMode === 'permanent' || deleteSaleModal.status === 'CANCELLED'
                  ? 'Permanently Delete'
                  : 'Confirm Void & Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const ReportsTab = React.memo(ReportsTabComponent);
