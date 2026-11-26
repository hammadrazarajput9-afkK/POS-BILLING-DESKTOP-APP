import React, { useState, useMemo, useEffect } from 'react';
import { AppData, SaleRecord } from '../types';
import {
  TrendingUp,
  Package,
  BookOpen,
  PieChart,
  Printer,
  Calendar,
  Layers,
  Receipt,
  Share2,
  X,
  AlertTriangle,
  ArrowUpRight,
  ShoppingBag,
  Calculator,
  RotateCcw,
  Edit,
  Trash2,
  Store,
  Users,
  BarChart3,
} from 'lucide-react';
import { useToast } from './Toast';
import { getEffectiveSaleFigures } from '../utils/profitCalculator';

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

const DATE_FILTER_OPTIONS: { id: DateFilterMode; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: '6month', label: '6 Months' },
  { id: 'year', label: 'Year' },
  { id: 'custom', label: 'Custom' },
  { id: 'all', label: 'All Time' },
];

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
  const isSalesman = data.currentRole === 'salesman';

  const [activeReportModal, setActiveReportModal] = useState<ReportType | null>(null);
  const [deleteSaleModal, setDeleteSaleModal] = useState<SaleRecord | null>(null);
  const [deleteMode, setDeleteMode] = useState<'cancel' | 'permanent'>('cancel');
  const [cancelReason, setCancelReason] = useState('Customer request / cancelled');

  // Universal Date Range Filter State
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  useEffect(() => {
    if (!deleteSaleModal && !activeReportModal) return;
    const handleHardwareBack = (e: Event) => {
      if (deleteSaleModal) {
        e.preventDefault();
        setDeleteSaleModal(null);
      } else if (activeReportModal) {
        e.preventDefault();
        setActiveReportModal(null);
      }
    };
    window.addEventListener('pos-hardware-back', handleHardwareBack);
    return () => window.removeEventListener('pos-hardware-back', handleHardwareBack);
  }, [deleteSaleModal, activeReportModal]);

  const activeFilterLabel = useMemo(() => {
    if (dateFilterMode === 'today') return 'Today';
    if (dateFilterMode === 'week') return 'Last 7 Days';
    if (dateFilterMode === 'month') return 'This Month';
    if (dateFilterMode === '6month') return 'Last 6 Months';
    if (dateFilterMode === 'year') return 'This Year';
    if (dateFilterMode === 'custom') {
      if (customStartDate || customEndDate) {
        return `${customStartDate || 'Start'} → ${customEndDate || 'Today'}`;
      }
      return 'Custom Range';
    }
    return 'All Time';
  }, [dateFilterMode, customStartDate, customEndDate]);

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
    return data.sales.filter(s => s.status !== 'CANCELLED' && isDateInRange(s.date));
  }, [data.sales, dateFilterMode, customStartDate, customEndDate]);

  const auditTableSales = useMemo(() => {
    return [...data.sales].filter(s => isDateInRange(s.date)).reverse().slice(0, 20);
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

  const debtorCustomersCount = data.khata.filter(k => k.balance > 0).length;

  // 5. Purchases Total
  const totalPurchasesAmount = useMemo(() => {
    return filteredPurchases.reduce((acc, p) => acc + p.total, 0);
  }, [filteredPurchases]);

  // 6. Closings Total
  const closingsHistory = filteredClosings;
  const latestClosing = closingsHistory.length > 0 ? closingsHistory[0] : null;

  // 7. Top Selling Products (net of returned quantities)
  const topSellingList = useMemo(() => {
    const map: Record<string, { id: string; name: string; category: string; unitsSold: number; totalRevenue: number }> = {};
    filteredSales.forEach(sale => {
      if (sale.returnStatus === 'FULL') return;
      sale.items.forEach(item => {
        const netItemQty = Math.max(0, (Number(item.qty) || 0) - (Number(item.returnedQty) || 0));
        if (netItemQty <= 0) return;
        if (!map[item.id]) {
          map[item.id] = {
            id: item.id,
            name: item.name,
            category: item.category,
            unitsSold: 0,
            totalRevenue: 0,
          };
        }
        map[item.id].unitsSold += netItemQty;
        map[item.id].totalRevenue += item.salePrice * netItemQty;
      });
    });

    return Object.values(map).sort((a, b) => b.unitsSold - a.unitsSold);
  }, [filteredSales]);

  // 8. Wholesale Specific Calculations (post-returns)
  const wholesaleSales = useMemo(() => {
    return filteredSales.filter(
      s => s.saleMode === 'wholesale' || s.items.some(i => i.isWholesale || (i.wholesalePrice && i.wholesalePrice > 0))
    );
  }, [filteredSales]);

  const totalWholesaleRevenue = useMemo(() => {
    return wholesaleSales.reduce((acc, s) => acc + getEffectiveSaleFigures(s).revenue, 0);
  }, [wholesaleSales]);

  const totalWholesaleCost = useMemo(() => {
    return wholesaleSales.reduce((acc, s) => acc + getEffectiveSaleFigures(s).cost, 0);
  }, [wholesaleSales]);

  const totalWholesaleProfit = Math.max(0, totalWholesaleRevenue - totalWholesaleCost);

  const totalWholesaleDiscountsGiven = useMemo(() => {
    return wholesaleSales.reduce((acc, s) => {
      const eff = getEffectiveSaleFigures(s);
      return eff.isFullReturn ? acc : acc + (s.wholesaleSavings || 0) + (s.discount || 0);
    }, 0);
  }, [wholesaleSales]);

  const totalWholesaleUnits = useMemo(() => {
    return wholesaleSales.reduce(
      (acc, s) =>
        acc +
        (s.returnStatus === 'FULL'
          ? 0
          : s.items.reduce((sum, item) => sum + Math.max(0, (item.qty || 0) - (item.returnedQty || 0)), 0)),
      0
    );
  }, [wholesaleSales]);

  // Breakdown per Retailer (post-returns)
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
      const eff = getEffectiveSaleFigures(sale);
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
      map[key].totalPurchased += eff.revenue;
      map[key].totalCost += eff.cost;
      map[key].totalProfit += eff.profit;
      if (!eff.isFullReturn) {
        map[key].totalDiscounts += (sale.wholesaleSavings || 0) + (sale.discount || 0);
      }
    });

    return Object.values(map).sort((a, b) => b.totalPurchased - a.totalPurchased);
  }, [wholesaleSales]);

  const openReport = (type: ReportType) => {
    if (type === 'pnl' && isSalesman) {
      showToast('Restricted: Net Profit P&L Statement is restricted to Administrators', 'warning');
      return;
    }
    setActiveReportModal(type);
  };

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
          lines.push(
            `${idx + 1}. ${r.name} (${r.shopName !== '-' ? r.shopName : r.city}) - Total: ${currency} ${r.totalPurchased.toLocaleString()} | Profit: ${currency} ${r.totalProfit.toLocaleString()} | Discount: ${currency} ${r.totalDiscounts.toLocaleString()}`
          );
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
    } else if (type === 'returns') {
      lines.push(`🔄 *SALES RETURNS & REFUNDS REPORT*`);
      lines.push(`• Return Records: ${filteredReturns.length}`);
      lines.push(`• Total Refunds Paid: ${currency} ${totalRefundsAmount.toLocaleString()}`);
    }

    lines.push(`----------------------------------------`);
    lines.push(`\nCreated by HAMMAD RAZA DEVELOPMENT`);

    const encoded = encodeURIComponent(lines.join('\n'));
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
  };

  const reportModules: {
    id: ReportType;
    title: string;
    subtitle: string;
    metric: string;
    icon: React.ReactNode;
    iconBg: string;
    accentText: string;
    hoverBorder: string;
  }[] = [
    {
      id: 'wholesale',
      title: 'Wholesale B2B',
      subtitle: 'Retailer volume & discounts',
      metric: `${wholesaleSales.length} Invoices`,
      icon: <Store className="w-4 h-4" />,
      iconBg: 'bg-purple-50 text-purple-600',
      accentText: 'text-purple-600',
      hoverBorder: 'hover:border-purple-400',
    },
    {
      id: 'sales',
      title: 'Sales Ledger',
      subtitle: 'Itemized invoices & revenue',
      metric: `${filteredSales.length} Invoices`,
      icon: <ShoppingBag className="w-4 h-4" />,
      iconBg: 'bg-blue-50 text-blue-600',
      accentText: 'text-blue-600',
      hoverBorder: 'hover:border-blue-400',
    },
    {
      id: 'pnl',
      title: 'Profit & Loss',
      subtitle: 'COGS, gross & net margin',
      metric: isSalesman ? 'Admin Only' : `${netMarginPercent}% Margin`,
      icon: <TrendingUp className="w-4 h-4" />,
      iconBg: 'bg-emerald-50 text-emerald-600',
      accentText: 'text-emerald-600',
      hoverBorder: 'hover:border-emerald-400',
    },
    {
      id: 'expenses',
      title: 'Daily Expenses',
      subtitle: 'Spend log by category',
      metric: `${filteredExpenses.length} Entries`,
      icon: <Receipt className="w-4 h-4" />,
      iconBg: 'bg-rose-50 text-rose-600',
      accentText: 'text-rose-600',
      hoverBorder: 'hover:border-rose-400',
    },
    {
      id: 'inventory',
      title: 'Inventory Value',
      subtitle: 'Stock cost vs retail value',
      metric: `${totalStockUnits.toLocaleString()} Units`,
      icon: <Package className="w-4 h-4" />,
      iconBg: 'bg-indigo-50 text-indigo-600',
      accentText: 'text-indigo-600',
      hoverBorder: 'hover:border-indigo-400',
    },
    {
      id: 'khata',
      title: 'Customer Khata',
      subtitle: 'Pending credit receivables',
      metric: `${debtorCustomersCount} Accounts`,
      icon: <BookOpen className="w-4 h-4" />,
      iconBg: 'bg-purple-50 text-purple-600',
      accentText: 'text-purple-600',
      hoverBorder: 'hover:border-purple-400',
    },
    {
      id: 'closings',
      title: 'Daily Closings',
      subtitle: 'Drawer cash & digital sync',
      metric: `${closingsHistory.length} Records`,
      icon: <Calculator className="w-4 h-4" />,
      iconBg: 'bg-teal-50 text-teal-600',
      accentText: 'text-teal-600',
      hoverBorder: 'hover:border-teal-400',
    },
    {
      id: 'purchases',
      title: 'Stock Inward',
      subtitle: 'Supplier bills & stock cost',
      metric: `${filteredPurchases.length} Records`,
      icon: <Layers className="w-4 h-4" />,
      iconBg: 'bg-amber-50 text-amber-600',
      accentText: 'text-amber-600',
      hoverBorder: 'hover:border-amber-400',
    },
    {
      id: 'top_products',
      title: 'Top Products',
      subtitle: 'Fastest selling devices',
      metric: `${topSellingList.length} Models`,
      icon: <BarChart3 className="w-4 h-4" />,
      iconBg: 'bg-orange-50 text-orange-600',
      accentText: 'text-orange-600',
      hoverBorder: 'hover:border-orange-400',
    },
    {
      id: 'returns',
      title: 'Returns & Refunds',
      subtitle: 'Restored IMEIs & refunds',
      metric: `${filteredReturns.length} Returns`,
      icon: <RotateCcw className="w-4 h-4" />,
      iconBg: 'bg-amber-50 text-amber-600',
      accentText: 'text-amber-600',
      hoverBorder: 'hover:border-amber-400',
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* EXECUTIVE FINANCIAL HEADER + INTEGRATED PERIOD FILTER */}
      <div className="animate-card-in bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <PieChart className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
                  Business Reports
                </h2>
                <span className="text-[11px] font-semibold text-slate-400 truncate">
                  · {activeFilterLabel}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 truncate">
                {shopName} financial statements, wholesale margins &amp; invoice audit
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => openReport('sales')}
              className="h-8.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Export Statement</span>
            </button>
          </div>
        </div>

        {/* Period Filter Strip */}
        <div className="pt-2.5 border-t border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-2">
          <div className="no-scrollbar flex items-center gap-1 bg-slate-50 border border-slate-200/80 p-1 rounded-xl overflow-x-auto max-w-full">
            {DATE_FILTER_OPTIONS.map(opt => {
              const isActive = dateFilterMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setDateFilterMode(opt.id)}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer shrink-0 whitespace-nowrap ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500 tabular-nums shrink-0">
            <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>
              <strong className="text-slate-800">{filteredSales.length}</strong> sales ·{' '}
              <strong className="text-slate-800">{filteredExpenses.length}</strong> expenses ·{' '}
              <strong className="text-slate-800">{filteredReturns.length}</strong> returns
            </span>
          </div>
        </div>

        {dateFilterMode === 'custom' && (
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2 text-xs animate-scale-in">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-500 text-[11px]">From</span>
              <input
                type="date"
                value={customStartDate}
                onChange={e => setCustomStartDate(e.target.value)}
                className="compact-mobile-input bg-slate-50 border border-slate-200 text-slate-900 rounded-lg px-2.5 h-8 text-[11px] font-semibold outline-none focus:border-blue-600 cursor-pointer"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-500 text-[11px]">To</span>
              <input
                type="date"
                value={customEndDate}
                onChange={e => setCustomEndDate(e.target.value)}
                className="compact-mobile-input bg-slate-50 border border-slate-200 text-slate-900 rounded-lg px-2.5 h-8 text-[11px] font-semibold outline-none focus:border-blue-600 cursor-pointer"
              />
            </div>
            {(customStartDate || customEndDate) && (
              <button
                type="button"
                onClick={() => {
                  setCustomStartDate('');
                  setCustomEndDate('');
                }}
                className="text-[11px] text-rose-600 hover:underline font-bold cursor-pointer px-1"
              >
                Reset
              </button>
            )}
          </div>
        )}
      </div>

      {/* 5-METRIC FINANCIAL KPI STRIP */}
      <div className="animate-card-in animate-stagger-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
        {/* Sales Revenue */}
        <button
          type="button"
          onClick={() => openReport('sales')}
          className="text-left bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 shadow-2xs hover:border-blue-400 hover:shadow-sm transition cursor-pointer flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between gap-1 w-full">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 truncate">
              Sales Revenue
            </span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition shrink-0" />
          </div>
          <p className="text-base sm:text-xl font-extrabold text-slate-900 tabular-nums mt-1.5 truncate">
            {currency} {totalSalesRevenue.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5 truncate tabular-nums">
            {filteredSales.length} invoices
          </p>
        </button>

        {/* Wholesale B2B */}
        <button
          type="button"
          onClick={() => openReport('wholesale')}
          className="text-left bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 shadow-2xs hover:border-purple-400 hover:shadow-sm transition cursor-pointer flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between gap-1 w-full">
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 truncate">
              Wholesale B2B
            </span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-purple-600 transition shrink-0" />
          </div>
          <p className="text-base sm:text-xl font-extrabold text-purple-700 tabular-nums mt-1.5 truncate">
            {currency} {totalWholesaleRevenue.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5 truncate tabular-nums">
            {wholesaleSales.length} bills · {totalWholesaleUnits} pcs
          </p>
        </button>

        {/* Net Profit */}
        <button
          type="button"
          onClick={() => openReport('pnl')}
          className="text-left bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 shadow-2xs hover:border-emerald-400 hover:shadow-sm transition cursor-pointer flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between gap-1 w-full">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 truncate">
              Net Profit
            </span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600 transition shrink-0" />
          </div>
          {isSalesman ? (
            <>
              <p className="text-sm font-bold text-slate-400 mt-1.5">Restricted</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Admin access only</p>
            </>
          ) : (
            <>
              <p
                className={`text-base sm:text-xl font-extrabold tabular-nums mt-1.5 truncate ${
                  netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {currency} {netProfit.toLocaleString()}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate tabular-nums">
                {netMarginPercent}% net margin
              </p>
            </>
          )}
        </button>

        {/* Expenses */}
        <button
          type="button"
          onClick={() => openReport('expenses')}
          className="text-left bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 shadow-2xs hover:border-rose-400 hover:shadow-sm transition cursor-pointer flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between gap-1 w-full">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 truncate">
              Expenses
            </span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-rose-600 transition shrink-0" />
          </div>
          <p className="text-base sm:text-xl font-extrabold text-rose-600 tabular-nums mt-1.5 truncate">
            {currency} {totalExpenses.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5 truncate tabular-nums">
            {filteredExpenses.length} entries
          </p>
        </button>

        {/* Stock Value */}
        <button
          type="button"
          onClick={() => openReport('inventory')}
          className="col-span-2 sm:col-span-1 text-left bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 shadow-2xs hover:border-indigo-400 hover:shadow-sm transition cursor-pointer flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between gap-1 w-full">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 truncate">
              Stock Value
            </span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 transition shrink-0" />
          </div>
          <p className="text-base sm:text-xl font-extrabold text-slate-900 tabular-nums mt-1.5 truncate">
            {currency} {stockValuationCost.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5 truncate tabular-nums">
            {totalStockUnits.toLocaleString()} units on hand
          </p>
        </button>
      </div>

      {/* REPORT SUITE DIRECTORY (ALL 10 MODULES) */}
      <div className="animate-card-in animate-stagger-2 space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
            Financial Statements &amp; Ledgers
          </h3>
          <span className="text-[11px] text-slate-400 font-medium">
            Tap any report to inspect, print PDF or share
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-2.5">
          {reportModules.map(mod => (
            <button
              key={mod.id}
              type="button"
              onClick={() => openReport(mod.id)}
              className={`text-left bg-white border border-slate-200/90 rounded-xl p-2.5 sm:p-3 shadow-2xs transition cursor-pointer flex flex-col justify-between group ${mod.hoverBorder}`}
            >
              <div className="space-y-2 w-full">
                <div className="flex items-center justify-between gap-2">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${mod.iconBg}`}>
                    {mod.icon}
                  </div>
                  <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-600 transition shrink-0" />
                </div>
                <div className="min-w-0">
                  <h4 className="font-bold text-slate-900 text-xs leading-tight truncate">
                    {mod.title}
                  </h4>
                  <p className="text-[10.5px] text-slate-500 mt-0.5 leading-snug line-clamp-1">
                    {mod.subtitle}
                  </p>
                </div>
              </div>

              <div className={`mt-2 pt-1.5 border-t border-slate-100 text-[10.5px] font-bold tabular-nums w-full truncate ${mod.accentText}`}>
                {mod.metric}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* COMPLETED SALES HISTORY AUDIT TABLE */}
      <div className="animate-card-in animate-stagger-3 bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-4 space-y-3 shadow-2xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 gap-2">
          <div>
            <h4 className="font-extrabold text-slate-900 text-xs sm:text-sm">
              Completed Sales History
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Recent processed invoices ({auditTableSales.length} shown · {activeFilterLabel})
            </p>
          </div>
          <button
            type="button"
            onClick={() => openReport('sales')}
            className="text-xs font-bold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 shrink-0 cursor-pointer"
          >
            <span>Full Report</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="border border-slate-200/80 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 text-[10.5px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Invoice #</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3">Items</th>
                  <th className="py-2.5 px-3">Payment</th>
                  <th className="py-2.5 px-3 text-right">Total</th>
                  <th className="py-2.5 px-3 text-right">Profit</th>
                  <th className="py-2.5 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditTableSales.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-slate-400">
                      No invoices matched this date range.
                    </td>
                  </tr>
                ) : (
                  auditTableSales.map(sale => {
                    const eff = getEffectiveSaleFigures(sale);
                    const totalUnits = sale.items.reduce((acc, i) => acc + i.qty, 0);
                    return (
                      <tr key={sale.invNo} className="table-row-hover">
                        <td className="py-2.5 px-3 tabular-nums font-bold text-blue-600 whitespace-nowrap">
                          #{sale.invNo}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 tabular-nums text-[11px] whitespace-nowrap">
                          {new Date(sale.date).toLocaleDateString()}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-semibold text-slate-900 block truncate max-w-[160px]">
                            {sale.custName || 'Walk-in'}
                          </span>
                          <span className="text-[10.5px] text-slate-400">
                            {sale.invoiceType === 'credit' ? 'Credit' : 'Cash'}
                            {sale.status === 'CANCELLED' && (
                              <span className="text-rose-600 font-bold"> · Void</span>
                            )}
                            {sale.returnStatus === 'FULL' && (
                              <span className="text-rose-600 font-bold"> · Returned</span>
                            )}
                            {sale.returnStatus === 'PARTIAL' && (
                              <span className="text-amber-600 font-bold"> · Partial Ret</span>
                            )}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 tabular-nums whitespace-nowrap">
                          {sale.items.length} item{sale.items.length === 1 ? '' : 's'} ({totalUnits}u)
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 font-medium whitespace-nowrap">
                          {sale.paymentMethod}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums font-bold text-slate-900 whitespace-nowrap">
                          {sale.returnStatus === 'FULL' ? (
                            <span className="text-rose-600">{currency} 0</span>
                          ) : (
                            `${currency} ${eff.revenue.toLocaleString()}`
                          )}
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right tabular-nums font-bold whitespace-nowrap ${
                            sale.returnStatus === 'FULL' ? 'text-slate-400' : 'text-emerald-600'
                          }`}
                        >
                          {isSalesman
                            ? '••••'
                            : sale.returnStatus === 'FULL'
                            ? `${currency} 0`
                            : `+${currency} ${eff.profit.toLocaleString()}`}
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => onViewReceipt(sale)}
                              className="p-1.5 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                              title="Print Receipt"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            {onEditSale && sale.status !== 'CANCELLED' && (
                              <button
                                type="button"
                                onClick={() => onEditSale(sale)}
                                className="p-1.5 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition cursor-pointer"
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
                                className="p-1.5 text-slate-500 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                                title={sale.status === 'CANCELLED' ? 'Delete Permanently' : 'Delete / Void Invoice'}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {onOpenSalesReturn && sale.returnStatus !== 'FULL' && sale.status !== 'CANCELLED' && (
                              <button
                                type="button"
                                onClick={() => onOpenSalesReturn(sale)}
                                className="p-1.5 text-slate-500 hover:text-amber-600 rounded-lg hover:bg-amber-50 transition cursor-pointer"
                                title="Process Sales Return & Refund"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
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

      {/* DETAIL REPORT MODAL & PRINTABLE PDF AREA */}
      {activeReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 glass-modal-backdrop">
          <div className="glass-modal-panel animate-modal-pop rounded-2xl max-w-4xl w-full max-h-[84dvh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-2 items-stretch sm:items-center justify-between border-b border-slate-200/70 px-4 py-3 shrink-0">
              <div className="flex items-center justify-between sm:justify-start gap-2.5 min-w-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 shrink-0 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                    <PieChart className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-extrabold text-slate-900 text-xs sm:text-sm tracking-tight truncate">
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
                    <p className="text-[11px] text-slate-500 truncate">
                      {shopName} · {activeFilterLabel}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveReportModal(null)}
                  className="sm:hidden text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleShareWhatsAppReport(activeReportModal)}
                  className="h-8 px-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[11px] rounded-lg inline-flex items-center gap-1 transition cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5 shrink-0" />
                  <span>WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrintCurrentReport}
                  className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] rounded-lg inline-flex items-center gap-1 shadow-xs transition cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 shrink-0" />
                  <span>Print PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveReportModal(null)}
                  className="hidden sm:flex text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* In-Modal Date Range Filter */}
            <div className="bg-slate-50/80 border-b border-slate-200/70 px-4 py-2 space-y-1.5 shrink-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-bold text-[11px] text-slate-700">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  <span>Period</span>
                </div>
                <div className="no-scrollbar flex items-center gap-1 text-[10.5px] overflow-x-auto max-w-full">
                  {DATE_FILTER_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setDateFilterMode(opt.id)}
                      className={`px-2 py-0.5 rounded-md font-bold transition cursor-pointer shrink-0 whitespace-nowrap ${
                        dateFilterMode === opt.id
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {dateFilterMode === 'custom' && (
                <div className="pt-1.5 border-t border-slate-200/70 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-500 text-[11px]">From:</span>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={e => setCustomStartDate(e.target.value)}
                    className="compact-mobile-input bg-white border border-slate-200 text-slate-900 px-2 h-7 rounded-lg text-[11px]"
                  />
                  <span className="font-semibold text-slate-500 text-[11px]">To:</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={e => setCustomEndDate(e.target.value)}
                    className="compact-mobile-input bg-white border border-slate-200 text-slate-900 px-2 h-7 rounded-lg text-[11px]"
                  />
                </div>
              )}
            </div>

            {/* Scrollable Report Content Area */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3.5 space-y-4 text-xs">
              {/* Shop Meta Strip */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="font-extrabold text-slate-900 text-xs sm:text-sm">{shopName}</h4>
                  <p className="text-[11px] text-slate-500">
                    {data.settings.address} · Ph: {data.settings.phone}
                  </p>
                </div>
                <div className="text-left sm:text-right tabular-nums">
                  <p className="text-[10.5px] font-bold text-slate-600">Generated</p>
                  <p className="text-[11px] text-slate-500">{new Date().toLocaleString()}</p>
                </div>
              </div>

              {/* REPORT: WHOLESALE & RETAILER B2B */}
              {activeReportModal === 'wholesale' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="p-3 bg-purple-50 rounded-xl border border-purple-200">
                      <span className="text-[10px] font-bold text-purple-700 uppercase">Wholesale Sales</span>
                      <p className="text-base sm:text-lg font-extrabold tabular-nums text-purple-900 mt-0.5 truncate">
                        {currency} {totalWholesaleRevenue.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-purple-600 mt-0.5">
                        {wholesaleSales.length} Invoices · {totalWholesaleUnits} units
                      </p>
                    </div>

                    <div className="p-3 bg-slate-100 rounded-xl border border-slate-200">
                      <span className="text-[10px] font-bold text-slate-600 uppercase">Wholesale Cost</span>
                      <p className="text-base sm:text-lg font-extrabold tabular-nums text-slate-900 mt-0.5 truncate">
                        {currency} {totalWholesaleCost.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">Purchased COGS</p>
                    </div>

                    <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                      <span className="text-[10px] font-bold text-emerald-700 uppercase">Net Profit</span>
                      <p
                        className={`text-base sm:text-lg font-extrabold tabular-nums mt-0.5 truncate ${
                          totalWholesaleProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'
                        }`}
                      >
                        {totalWholesaleProfit >= 0 ? '+' : ''}
                        {currency} {totalWholesaleProfit.toLocaleString()}
                      </p>
                    </div>

                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                      <span className="text-[10px] font-bold text-amber-700 uppercase">Discounts Given</span>
                      <p className="text-base sm:text-lg font-extrabold tabular-nums text-amber-900 mt-0.5 truncate">
                        {currency} {totalWholesaleDiscountsGiven.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-extrabold text-slate-900 text-xs uppercase tracking-wide flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-purple-600" />
                        Retailer Breakdown
                      </h4>
                      <span className="text-[11px] text-slate-500 font-semibold tabular-nums">
                        {retailerStats.length} Retailers
                      </span>
                    </div>

                    <div className="w-full overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full min-w-[620px] text-left border-collapse text-xs">
                        <thead className="bg-slate-100 font-bold text-[10px] uppercase text-slate-600">
                          <tr>
                            <th className="p-2.5">Retailer</th>
                            <th className="p-2.5">Shop &amp; City</th>
                            <th className="p-2.5">Phone</th>
                            <th className="p-2.5 text-center">Bills</th>
                            <th className="p-2.5 text-right">Purchases</th>
                            <th className="p-2.5 text-right">Net Profit</th>
                            <th className="p-2.5 text-right">Discounts</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {retailerStats.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="text-center py-6 text-slate-400">
                                No wholesale transactions recorded for this period.
                              </td>
                            </tr>
                          ) : (
                            retailerStats.map((r, idx) => (
                              <tr key={idx} className="table-row-hover">
                                <td className="p-2.5 font-bold text-slate-900">{r.name}</td>
                                <td className="p-2.5 text-slate-600">
                                  {r.shopName !== '-' ? r.shopName : ''} {r.city !== '-' ? `(${r.city})` : '-'}
                                </td>
                                <td className="p-2.5 tabular-nums text-[11px] text-slate-500">{r.phone}</td>
                                <td className="p-2.5 text-center tabular-nums font-bold">{r.invoicesCount}</td>
                                <td className="p-2.5 text-right tabular-nums font-bold text-slate-900">
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

                  <div className="space-y-2">
                    <h4 className="font-extrabold text-slate-900 text-xs uppercase tracking-wide flex items-center gap-1.5">
                      <Receipt className="w-3.5 h-3.5 text-blue-600" />
                      Wholesale Invoices
                    </h4>

                    <div className="w-full overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full min-w-[700px] text-left border-collapse text-xs">
                        <thead className="bg-slate-100 font-bold text-[10px] uppercase text-slate-600">
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
                        <tbody className="divide-y divide-slate-100">
                          {wholesaleSales.length === 0 ? (
                            <tr>
                              <td colSpan={9} className="text-center py-8 text-slate-400">
                                No wholesale invoices recorded in this period.
                              </td>
                            </tr>
                          ) : (
                            wholesaleSales.map(s => (
                              <tr key={s.invNo} className="table-row-hover">
                                <td className="p-2.5 tabular-nums font-bold text-purple-600">#{s.invNo}</td>
                                <td className="p-2.5 text-slate-500 tabular-nums text-[11px]">
                                  {new Date(s.date).toLocaleDateString()}
                                </td>
                                <td className="p-2.5 font-semibold text-slate-900">
                                  {s.custName}
                                  {s.retailerShopName && (
                                    <span className="block text-[10px] text-slate-400">{s.retailerShopName}</span>
                                  )}
                                </td>
                                <td className="p-2.5 text-slate-700">
                                  {s.items.map((i, idx) => (
                                    <span key={idx} className="block text-[11px]">
                                      • {i.name} (x{i.qty}) @ {currency}{' '}
                                      {(i.wholesalePrice || i.salePrice).toLocaleString()}
                                    </span>
                                  ))}
                                </td>
                                <td className="p-2.5 font-medium text-slate-700">{s.paymentMethod}</td>
                                <td className="p-2.5 text-right tabular-nums font-bold text-amber-600">
                                  {currency} {((s.wholesaleSavings || 0) + (s.discount || 0)).toLocaleString()}
                                </td>
                                <td className="p-2.5 text-right tabular-nums font-bold text-slate-900">
                                  {currency} {getEffectiveSaleFigures(s).revenue.toLocaleString()}
                                </td>
                                <td
                                  className={`p-2.5 text-right tabular-nums font-bold ${
                                    s.returnStatus === 'FULL' ? 'text-slate-400' : 'text-emerald-600'
                                  }`}
                                >
                                  {s.returnStatus === 'FULL'
                                    ? `${currency} 0 (Ret)`
                                    : `+${currency} ${getEffectiveSaleFigures(s).profit.toLocaleString()}`}
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
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
                      <span className="text-[10px] font-bold text-blue-700 uppercase">
                        {totalRefundsAmount > 0 ? 'Net Revenue (Post-Returns)' : 'Gross Revenue'}
                      </span>
                      <p className="text-base sm:text-lg font-extrabold tabular-nums text-blue-900 mt-0.5 truncate">
                        {currency} {netSalesRevenue.toLocaleString()}
                      </p>
                    </div>
                    <div className="p-3 bg-slate-100 rounded-xl border border-slate-200">
                      <span className="text-[10px] font-bold text-slate-600 uppercase">
                        {totalCostReversed > 0 ? 'Net COGS (Post-Returns)' : 'Total COGS'}
                      </span>
                      <p className="text-base sm:text-lg font-extrabold tabular-nums text-slate-900 mt-0.5 truncate">
                        {currency} {netCOGS.toLocaleString()}
                      </p>
                    </div>
                    <div className="col-span-2 sm:col-span-1 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                      <span className="text-[10px] font-bold text-emerald-700 uppercase">Net Profit</span>
                      <p className="text-base sm:text-lg font-extrabold tabular-nums text-emerald-900 mt-0.5 truncate">
                        {isSalesman ? 'Restricted' : `+${currency} ${netProfit.toLocaleString()}`}
                      </p>
                    </div>
                  </div>

                  <div className="w-full overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full min-w-[580px] text-left border-collapse">
                      <thead className="bg-slate-100 font-bold text-[10px] uppercase text-slate-600">
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
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {filteredSales.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="text-center py-8 text-slate-400">
                              No sales found in selected period.
                            </td>
                          </tr>
                        ) : (
                          filteredSales.map(s => {
                            const eff = getEffectiveSaleFigures(s);
                            return (
                              <tr key={s.invNo} className="table-row-hover">
                                <td className="p-2.5 tabular-nums font-bold text-blue-600">
                                  #{s.invNo}
                                  {eff.isFullReturn && (
                                    <span className="ml-1.5 text-[10px] font-bold text-rose-600">· Ret</span>
                                  )}
                                  {eff.isPartialReturn && (
                                    <span className="ml-1.5 text-[10px] font-bold text-amber-600">· Part</span>
                                  )}
                                </td>
                                <td className="p-2.5 font-semibold capitalize">{s.invoiceType || 'Cash'}</td>
                                <td className="p-2.5 text-slate-500 tabular-nums text-[11px]">
                                  {new Date(s.date).toLocaleDateString()}
                                </td>
                                <td className="p-2.5 font-bold text-slate-800">{s.custName}</td>
                                <td className="p-2.5">{s.paymentMethod}</td>
                                <td className="p-2.5 text-right tabular-nums font-bold">
                                  {currency} {eff.revenue.toLocaleString()}
                                </td>
                                <td
                                  className={`p-2.5 text-right tabular-nums font-bold ${
                                    eff.isFullReturn ? 'text-slate-400' : 'text-emerald-600'
                                  }`}
                                >
                                  {isSalesman
                                    ? '••••'
                                    : eff.isFullReturn
                                    ? `${currency} 0`
                                    : `+${currency} ${eff.profit.toLocaleString()}`}
                                </td>
                              </tr>
                            );
                          })
                        )}
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
                      <span className="text-[10px] font-bold text-rose-700 uppercase">
                        Total Recorded Expenses ({activeFilterLabel})
                      </span>
                      <p className="text-lg sm:text-xl font-extrabold tabular-nums text-rose-900">
                        {currency} {totalExpenses.toLocaleString()}
                      </p>
                    </div>
                    <span className="text-xs font-bold text-rose-700 bg-white px-3 py-1 rounded-xl border border-rose-100 shrink-0 tabular-nums">
                      {filteredExpenses.length} Records
                    </span>
                  </div>

                  <div className="w-full overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full min-w-[520px] text-left border-collapse">
                      <thead className="bg-slate-100 font-bold text-[10px] uppercase text-slate-600">
                        <tr>
                          <th className="p-2.5">Date</th>
                          <th className="p-2.5">Description</th>
                          <th className="p-2.5">Category</th>
                          <th className="p-2.5">Method</th>
                          <th className="p-2.5 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {filteredExpenses.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-center py-8 text-slate-400">
                              No expenses recorded in this period.
                            </td>
                          </tr>
                        ) : (
                          filteredExpenses.map(e => (
                            <tr key={e.id} className="table-row-hover">
                              <td className="p-2.5 text-slate-500 tabular-nums text-[11px]">
                                {new Date(e.date).toLocaleDateString()}
                              </td>
                              <td className="p-2.5 font-semibold text-slate-900">{e.description}</td>
                              <td className="p-2.5 text-slate-600">{e.category}</td>
                              <td className="p-2.5">{e.paymentMethod || 'Cash'}</td>
                              <td className="p-2.5 text-right tabular-nums font-bold text-rose-600">
                                {currency} {e.amount.toLocaleString()}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* REPORT 3: INVENTORY VALUATION */}
              {activeReportModal === 'inventory' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-200">
                      <span className="text-[10px] font-bold text-indigo-700 uppercase">Cost Value</span>
                      <p className="text-base sm:text-lg font-extrabold tabular-nums text-indigo-900 mt-0.5 truncate">
                        {currency} {stockValuationCost.toLocaleString()}
                      </p>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
                      <span className="text-[10px] font-bold text-blue-700 uppercase">Retail Value</span>
                      <p className="text-base sm:text-lg font-extrabold tabular-nums text-blue-900 mt-0.5 truncate">
                        {currency} {stockValuationRetail.toLocaleString()}
                      </p>
                    </div>
                    <div className="col-span-2 sm:col-span-1 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                      <span className="text-[10px] font-bold text-emerald-700 uppercase">Expected Profit</span>
                      <p className="text-base sm:text-lg font-extrabold tabular-nums text-emerald-900 mt-0.5 truncate">
                        +{currency} {(stockValuationRetail - stockValuationCost).toLocaleString()}
                      </p>
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
                          <tr key={item.id} className="table-row-hover">
                            <td className="p-2.5 font-bold text-slate-900">{item.name}</td>
                            <td className="p-2.5 text-slate-500">{item.category}</td>
                            <td className="p-2.5 text-center tabular-nums font-bold">
                              <span className={item.qty <= 1 ? 'text-rose-600 font-bold' : ''}>{item.qty}</span>
                            </td>
                            <td className="p-2.5 text-right tabular-nums">
                              {currency} {item.costPrice.toLocaleString()}
                            </td>
                            <td className="p-2.5 text-right tabular-nums font-bold">
                              {currency} {item.salePrice.toLocaleString()}
                            </td>
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
                      <span className="text-[10px] font-bold text-purple-700 uppercase">
                        Total Pending Receivables
                      </span>
                      <p className="text-lg sm:text-xl font-extrabold tabular-nums text-purple-900">
                        {currency} {totalUdhar.toLocaleString()}
                      </p>
                    </div>
                    <span className="text-xs font-bold text-purple-700 bg-white px-3 py-1 rounded-xl shrink-0 border border-purple-100 tabular-nums">
                      {debtorCustomersCount} Customers with Balance
                    </span>
                  </div>

                  <div className="w-full overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full min-w-[550px] text-left border-collapse">
                      <thead className="bg-slate-100 font-bold text-[10px] uppercase text-slate-600">
                        <tr>
                          <th className="p-2.5">Customer Name</th>
                          <th className="p-2.5">Primary Phone</th>
                          <th className="p-2.5">Location</th>
                          <th className="p-2.5 text-center">Entries</th>
                          <th className="p-2.5 text-right">Outstanding Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {data.khata.map(c => (
                          <tr key={c.id} className="table-row-hover">
                            <td className="p-2.5 font-bold text-slate-900">{c.name}</td>
                            <td className="p-2.5 tabular-nums">{c.phone}</td>
                            <td className="p-2.5 text-slate-500">{c.address || '-'}</td>
                            <td className="p-2.5 text-center tabular-nums">{c.history.length}</td>
                            <td className="p-2.5 text-right tabular-nums font-bold text-purple-700">
                              {currency} {c.balance.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* REPORT 5: PROFIT & LOSS STATEMENT */}
              {activeReportModal === 'pnl' && (
                <div className="space-y-4 bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200">
                  <h4 className="font-extrabold text-xs sm:text-sm border-b border-slate-200 pb-2 uppercase tracking-wide text-slate-800">
                    Comprehensive Financial Statement ({activeFilterLabel})
                  </h4>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="font-semibold text-slate-700">Gross Sales Revenue:</span>
                      <span className="tabular-nums font-bold text-slate-900">
                        {currency} {totalSalesRevenue.toLocaleString()}
                      </span>
                    </div>

                    {totalRefundsAmount > 0 && (
                      <div className="flex justify-between py-1.5 border-b border-slate-100 text-amber-700">
                        <span>Less: Sales Returns &amp; Refunds:</span>
                        <span className="tabular-nums font-bold">
                          -{currency} {totalRefundsAmount.toLocaleString()}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between py-1.5 border-b border-slate-100 text-slate-600">
                      <span>Less: Cost of Goods Sold (Net COGS):</span>
                      <span className="tabular-nums font-bold text-slate-700">
                        -{currency} {netCOGS.toLocaleString()}
                      </span>
                    </div>

                    <div className="flex justify-between py-2 border-b border-slate-200 font-bold bg-slate-50 px-2.5 rounded-lg">
                      <span className="text-slate-900">Gross Operating Profit:</span>
                      <span className="tabular-nums text-emerald-700">
                        {currency} {grossProfit.toLocaleString()}
                      </span>
                    </div>

                    <div className="flex justify-between py-1.5 border-b border-slate-100 text-rose-600">
                      <span>Less: Operational Shop Expenses:</span>
                      <span className="tabular-nums font-bold">
                        -{currency} {totalExpenses.toLocaleString()}
                      </span>
                    </div>

                    <div className="flex justify-between py-3 border-t-2 border-slate-900 font-extrabold text-xs sm:text-sm">
                      <span className="text-slate-900">Net Business Profit:</span>
                      <span className={`tabular-nums ${netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {currency} {netProfit.toLocaleString()}
                      </span>
                    </div>

                    <div className="flex justify-between py-1 text-slate-500 text-[11px] tabular-nums">
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
                          <th className="p-2.5">Date &amp; Time</th>
                          <th className="p-2.5">Cashier</th>
                          <th className="p-2.5 text-right">Physical Cash</th>
                          <th className="p-2.5 text-right">Digital Accounts</th>
                          <th className="p-2.5 text-right">Grand Total</th>
                          <th className="p-2.5 text-right">Difference</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {closingsHistory.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="text-center py-8 text-slate-400">
                              No daily closing records in selected period.
                            </td>
                          </tr>
                        ) : (
                          closingsHistory.map(rec => (
                            <tr key={rec.id} className="table-row-hover">
                              <td className="p-2.5 tabular-nums font-bold">
                                {rec.date} ({rec.time})
                              </td>
                              <td className="p-2.5">{rec.closedBy}</td>
                              <td className="p-2.5 text-right tabular-nums font-bold text-emerald-600">
                                {currency} {rec.totalCash.toLocaleString()}
                              </td>
                              <td className="p-2.5 text-right tabular-nums font-bold text-blue-600">
                                {currency} {rec.totalOnline.toLocaleString()}
                              </td>
                              <td className="p-2.5 text-right tabular-nums font-extrabold text-slate-900">
                                {currency} {rec.grandTotal.toLocaleString()}
                              </td>
                              <td className="p-2.5 text-right tabular-nums font-bold">
                                {rec.difference === 0
                                  ? 'Matched'
                                  : `${(rec.difference || 0) > 0 ? '+' : ''}${currency} ${(rec.difference || 0).toLocaleString()}`}
                              </td>
                            </tr>
                          ))
                        )}
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
                        {filteredPurchases.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-center py-8 text-slate-400">
                              No purchases recorded in this period.
                            </td>
                          </tr>
                        ) : (
                          filteredPurchases.map(p => (
                            <tr key={p.id} className="table-row-hover">
                              <td className="p-2.5 text-slate-500 tabular-nums text-[11px]">
                                {new Date(p.date).toLocaleDateString()}
                              </td>
                              <td className="p-2.5 font-bold text-slate-900">{p.itemTitle}</td>
                              <td className="p-2.5 text-center tabular-nums font-bold">{p.qty}</td>
                              <td className="p-2.5 text-right tabular-nums">
                                {currency} {p.costPrice.toLocaleString()}
                              </td>
                              <td className="p-2.5 text-right tabular-nums font-bold text-amber-700">
                                {currency} {p.total.toLocaleString()}
                              </td>
                            </tr>
                          ))
                        )}
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
                        {topSellingList.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-center py-8 text-slate-400">
                              No product sales recorded in this period.
                            </td>
                          </tr>
                        ) : (
                          topSellingList.map((p, idx) => (
                            <tr key={p.id} className="table-row-hover">
                              <td className="p-2.5 font-bold text-slate-400 tabular-nums">#{idx + 1}</td>
                              <td className="p-2.5 font-bold text-slate-900">{p.name}</td>
                              <td className="p-2.5 text-slate-500">{p.category}</td>
                              <td className="p-2.5 text-center tabular-nums font-bold text-blue-600">
                                {p.unitsSold}
                              </td>
                              <td className="p-2.5 text-right tabular-nums font-extrabold text-slate-900">
                                {currency} {p.totalRevenue.toLocaleString()}
                              </td>
                            </tr>
                          ))
                        )}
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
                      <span className="text-[10px] font-bold text-amber-700 uppercase">
                        Total Customer Refunds Paid
                      </span>
                      <p className="text-lg sm:text-xl font-extrabold tabular-nums text-amber-900">
                        {currency} {totalRefundsAmount.toLocaleString()}
                      </p>
                    </div>
                    <span className="text-xs font-bold text-amber-800 bg-white px-3 py-1 rounded-xl border border-amber-200 shrink-0 tabular-nums">
                      {filteredReturns.length} Return Records
                    </span>
                  </div>

                  {filteredReturns.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 text-xs">
                      No sales returns recorded in this period.
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
                            <th className="p-2.5">Returned Items &amp; IMEIs</th>
                            <th className="p-2.5">Reason</th>
                            <th className="p-2.5">Method</th>
                            <th className="p-2.5 text-right">Refund Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredReturns.map(ret => (
                            <tr key={ret.id} className="table-row-hover">
                              <td className="p-2.5 tabular-nums font-bold text-amber-700">#{ret.returnNo}</td>
                              <td className="p-2.5 text-slate-500 tabular-nums text-[11px]">
                                {new Date(ret.returnDate).toLocaleDateString()}
                              </td>
                              <td className="p-2.5 tabular-nums font-semibold text-blue-600">
                                #{ret.originalInvNo}
                              </td>
                              <td className="p-2.5 font-bold text-slate-900">{ret.customerName}</td>
                              <td className="p-2.5">
                                {ret.items.map((i, idx) => (
                                  <div key={idx} className="text-[11px]">
                                    <span className="font-semibold text-slate-800">
                                      {i.name} (x{i.qty})
                                    </span>
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

              {/* Footer Attribution inside Modal */}
              <div className="pt-3 border-t border-slate-200/70 text-center space-y-0.5">
                <p className="font-extrabold text-slate-800 text-[11px] tracking-wider">
                  Created by HAMMAD RAZA DEVELOPMENT
                </p>
                <p className="text-[10px] text-slate-400">
                  {shopName} · Financial Reporting Suite
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-4 py-2.5 border-t border-slate-200/70 bg-white/85 flex justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setActiveReportModal(null)}
                className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer transition"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HIDDEN PRINTABLE REPORT AREA FOR PDF EXPORT */}
      {activeReportModal && (
        <div id="printable-report-area" className="hidden print:block font-sans text-xs">
          <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '12px', marginBottom: '16px' }}>
            <h1 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 4px 0' }}>{shopName}</h1>
            <p style={{ margin: '2px 0', fontSize: '11px' }}>
              {data.settings.address} | Ph: {data.settings.phone}
            </p>
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
            <p style={{ fontSize: '10px', color: '#666', margin: '4px 0 0 0' }}>
              Period: {activeFilterLabel} | Generated on: {new Date().toLocaleString()}
            </p>
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
                    <tr>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>
                        Net Sales Revenue (Post-Returns)
                      </td>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold' }}>
                        {currency} {netSalesRevenue.toLocaleString()}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>
                        Net Cost of Goods Sold (COGS)
                      </td>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold' }}>
                        -{currency} {netCOGS.toLocaleString()}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>Gross Profit</td>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold' }}>
                        {currency} {grossProfit.toLocaleString()}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>
                        Total Operational Expenses
                      </td>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold' }}>
                        -{currency} {totalExpenses.toLocaleString()}
                      </td>
                    </tr>
                    <tr style={{ fontWeight: 'bold', fontSize: '12px' }}>
                      <td style={{ padding: '8px', borderTop: '2px solid #000' }}>Net Profit</td>
                      <td style={{ padding: '8px', borderTop: '2px solid #000', textAlign: 'right' }}>
                        {currency} {netProfit.toLocaleString()}
                      </td>
                    </tr>
                  </>
                ) : activeReportModal === 'wholesale' ? (
                  <>
                    <tr style={{ background: '#f8fafc', fontWeight: 'bold' }}>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>Total Wholesale Revenue</td>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd', textAlign: 'right' }}>
                        {currency} {totalWholesaleRevenue.toLocaleString()}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>Wholesale Cost (COGS)</td>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd', textAlign: 'right' }}>
                        -{currency} {totalWholesaleCost.toLocaleString()}
                      </td>
                    </tr>
                    <tr style={{ fontWeight: 'bold' }}>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>Wholesale Net Profit</td>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd', textAlign: 'right', color: '#16a34a' }}>
                        {currency} {totalWholesaleProfit.toLocaleString()}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>
                        Total Retailer Discounts Given
                      </td>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd', textAlign: 'right' }}>
                        {currency} {totalWholesaleDiscountsGiven.toLocaleString()}
                      </td>
                    </tr>
                    {wholesaleSales.map(s => (
                      <tr key={s.invNo}>
                        <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>
                          Invoice #{s.invNo} - {s.custName} {s.retailerShopName ? `(${s.retailerShopName})` : ''} (
                          {new Date(s.date).toLocaleDateString()})
                        </td>
                        <td style={{ padding: '6px', borderBottom: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold' }}>
                          {currency} {getEffectiveSaleFigures(s).revenue.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </>
                ) : activeReportModal === 'sales' ? (
                  filteredSales.map(s => (
                    <tr key={s.invNo}>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>
                        Invoice #{s.invNo} - {s.custName} ({new Date(s.date).toLocaleDateString()})
                      </td>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold' }}>
                        {currency} {getEffectiveSaleFigures(s).revenue.toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : activeReportModal === 'expenses' ? (
                  filteredExpenses.map(e => (
                    <tr key={e.id}>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>
                        {e.description} [{e.category}] ({new Date(e.date).toLocaleDateString()})
                      </td>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold' }}>
                        {currency} {e.amount.toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : activeReportModal === 'inventory' ? (
                  data.inventory.map(i => (
                    <tr key={i.id}>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>
                        {i.name} ({i.category}) - Qty: {i.qty}
                      </td>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold' }}>
                        {currency} {(i.costPrice * i.qty).toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : activeReportModal === 'khata' ? (
                  data.khata.map(c => (
                    <tr key={c.id}>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>
                        {c.name} ({c.phone})
                      </td>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold' }}>
                        {currency} {c.balance.toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : activeReportModal === 'closings' ? (
                  closingsHistory.map(rec => (
                    <tr key={rec.id}>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>
                        {rec.date} ({rec.time}) - {rec.closedBy}
                      </td>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold' }}>
                        {currency} {rec.grandTotal.toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : activeReportModal === 'purchases' ? (
                  filteredPurchases.map(p => (
                    <tr key={p.id}>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>
                        {p.itemTitle} (x{p.qty}) ({new Date(p.date).toLocaleDateString()})
                      </td>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold' }}>
                        {currency} {p.total.toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : activeReportModal === 'top_products' ? (
                  topSellingList.map((p, idx) => (
                    <tr key={p.id}>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>
                        #{idx + 1} {p.name} ({p.unitsSold} units)
                      </td>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold' }}>
                        {currency} {p.totalRevenue.toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : activeReportModal === 'returns' ? (
                  filteredReturns.map(r => (
                    <tr key={r.id}>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>
                        Return #{r.returnNo} - Inv #{r.originalInvNo} ({r.customerName})
                      </td>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold' }}>
                        -{currency} {r.totalRefundAmount.toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={2} style={{ padding: '10px', textAlign: 'center' }}>
                      Audit Record Processed
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ textAlign: 'center', borderTop: '2px solid #000', paddingTop: '12px', marginTop: '20px' }}>
            <p style={{ fontWeight: 'bold', fontSize: '11px', margin: '0' }}>
              Created by HAMMAD RAZA DEVELOPMENT
            </p>
            <p style={{ fontSize: '9px', color: '#666', margin: '4px 0 0 0' }}>
              Software Developed by HAMMAD RAZA DEVELOPMENT
            </p>
          </div>
        </div>
      )}

      {/* Delete / Void Confirmation Modal */}
      {deleteSaleModal && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-2.5 sm:p-4 glass-modal-backdrop">
          <div className="glass-modal-panel animate-modal-pop rounded-2xl max-w-md w-full p-4 sm:p-5 space-y-4 max-h-[82dvh] overflow-y-auto">
            <div className="flex items-start justify-between pb-3 border-b border-slate-200/70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base leading-tight">
                    {deleteSaleModal.status === 'CANCELLED' ? 'Delete Cancelled Invoice' : 'Delete / Void Invoice'}
                  </h3>
                  <p className="text-xs text-slate-500 tabular-nums">
                    Invoice #{deleteSaleModal.invNo} · {new Date(deleteSaleModal.date).toLocaleDateString()}
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
                <span>Customer</span>
                <span className="font-bold text-slate-800">{deleteSaleModal.custName || 'Walk-in'}</span>
              </div>
              <div className="flex justify-between items-center pt-1.5 border-t border-slate-200">
                <span className="font-bold text-slate-700">Total</span>
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
                      ? 'border-rose-400 bg-rose-50/50 shadow-2xs'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 text-rose-600" />
                    <span className="font-bold text-xs text-slate-900">
                      Void &amp; Cancel (Safe - Stock Restored)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Restores inventory stock, marks IMEIs as available, reverses credit balance.
                  </p>
                </div>

                <div
                  onClick={() => setDeleteMode('permanent')}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                    deleteMode === 'permanent'
                      ? 'border-rose-400 bg-rose-50/50 shadow-2xs'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
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

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200/70">
              <button
                type="button"
                onClick={() => setDeleteSaleModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
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
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold shadow-xs cursor-pointer"
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
