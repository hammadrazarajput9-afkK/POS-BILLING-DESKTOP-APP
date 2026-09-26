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
  FileSpreadsheet
} from 'lucide-react';
import { useToast } from './Toast';

interface ReportsTabProps {
  data: AppData;
  onViewReceipt: (sale: SaleRecord) => void;
}

type ReportType =
  | 'sales'
  | 'expenses'
  | 'inventory'
  | 'khata'
  | 'pnl'
  | 'closings'
  | 'purchases'
  | 'top_products';

export const ReportsTab: React.FC<ReportsTabProps> = ({ data, onViewReceipt }) => {
  const { showToast } = useToast();
  const currency = data.settings.currency;
  const shopName = data.settings.shopName;

  const [activeReportModal, setActiveReportModal] = useState<ReportType | null>(null);

  // 1. Sales Calculations
  const totalSalesRevenue = useMemo(() => {
    return data.sales.reduce((acc, s) => acc + s.grandTotal, 0);
  }, [data.sales]);

  const totalCOGS = useMemo(() => {
    return data.sales.reduce((acc, s) => acc + s.totalCost, 0);
  }, [data.sales]);

  const grossProfit = Math.max(0, totalSalesRevenue - totalCOGS);

  // 2. Expense Calculations
  const totalExpenses = useMemo(() => {
    return data.expenses.reduce((acc, e) => acc + e.amount, 0);
  }, [data.expenses]);

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
    return data.purchasesLedger.reduce((acc, p) => acc + p.total, 0);
  }, [data.purchasesLedger]);

  // 6. Closings Total
  const closingsHistory = data.dailyClosings || [];
  const latestClosing = closingsHistory.length > 0 ? closingsHistory[0] : null;

  // 7. Top Selling Products
  const topSellingList = useMemo(() => {
    const map: Record<string, { id: string; name: string; category: string; unitsSold: number; totalRevenue: number }> = {};
    data.sales.forEach(sale => {
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
  }, [data.sales]);

  // Handle PDF Print of Active Report
  const handlePrintCurrentReport = () => {
    window.print();
  };

  // Handle WhatsApp Share of Active Report
  const handleShareWhatsAppReport = (type: ReportType) => {
    const lines: string[] = [];
    const dateStr = new Date().toLocaleDateString();

    lines.push(`📊 *${shopName.toUpperCase()} - BUSINESS REPORT*`);
    lines.push(`📅 *Date:* ${dateStr}`);
    lines.push(`----------------------------------------`);

    if (type === 'sales') {
      lines.push(`🛒 *SALES & REVENUE REPORT*`);
      lines.push(`• Total Invoices: ${data.sales.length}`);
      lines.push(`• Gross Revenue: ${currency} ${totalSalesRevenue.toLocaleString()}`);
      lines.push(`• Cost of Goods: ${currency} ${totalCOGS.toLocaleString()}`);
      lines.push(`• Net Profit: ${currency} ${netProfit.toLocaleString()} (${netMarginPercent}%)`);
    } else if (type === 'expenses') {
      lines.push(`🧾 *DAILY EXPENSES REPORT*`);
      lines.push(`• Total Expenses: ${currency} ${totalExpenses.toLocaleString()}`);
      lines.push(`• Total Entries: ${data.expenses.length}`);
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
      lines.push(`• Purchase Records: ${data.purchasesLedger.length}`);
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
      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <PieChart className="w-5 h-5 text-blue-600" /> Comprehensive Business Reports
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Click any report category to view detailed audit, download PDF, or send to WhatsApp
          </p>
        </div>

        <div className="text-right">
          <span className="text-[11px] font-bold px-3 py-1 bg-blue-50 text-blue-700 rounded-full border border-blue-200">
            Created by HAMMAD RAZA DEVELOPMENT
          </span>
        </div>
      </div>

      {/* Top 4 Quick Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => setActiveReportModal('sales')}
          className="bg-white border border-slate-200/90 rounded-2xl p-4.5 shadow-xs cursor-pointer hover:border-blue-500 hover:shadow-md transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Gross Sales Revenue
            </span>
            <Eye className="w-4 h-4 text-blue-600" />
          </div>
          <h3 className="text-xl font-extrabold text-slate-900 font-mono tabular-nums mt-1">
            {currency} {totalSalesRevenue.toLocaleString()}
          </h3>
          <p className="text-xs text-slate-400 mt-1">{data.sales.length} Invoices • Click for details</p>
        </div>

        <div
          onClick={() => setActiveReportModal('pnl')}
          className="bg-white border border-slate-200/90 rounded-2xl p-4.5 shadow-xs cursor-pointer hover:border-emerald-500 hover:shadow-md transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Net Business Profit
            </span>
            <Eye className="w-4 h-4 text-emerald-600" />
          </div>
          <h3
            className={`text-xl font-extrabold font-mono tabular-nums mt-1 ${
              netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {currency} {netProfit.toLocaleString()}
          </h3>
          <p className="text-xs text-slate-400 mt-1">Margin: {netMarginPercent}% • Click for P&L</p>
        </div>

        <div
          onClick={() => setActiveReportModal('expenses')}
          className="bg-white border border-slate-200/90 rounded-2xl p-4.5 shadow-xs cursor-pointer hover:border-rose-500 hover:shadow-md transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Total Expenses
            </span>
            <Eye className="w-4 h-4 text-rose-600" />
          </div>
          <h3 className="text-xl font-extrabold text-rose-600 font-mono tabular-nums mt-1">
            {currency} {totalExpenses.toLocaleString()}
          </h3>
          <p className="text-xs text-slate-400 mt-1">{data.expenses.length} Records • Click for details</p>
        </div>

        <div
          onClick={() => setActiveReportModal('inventory')}
          className="bg-white border border-slate-200/90 rounded-2xl p-4.5 shadow-xs cursor-pointer hover:border-indigo-500 hover:shadow-md transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Inventory Capital Value
            </span>
            <Eye className="w-4 h-4 text-indigo-600" />
          </div>
          <h3 className="text-xl font-extrabold text-slate-900 font-mono tabular-nums mt-1">
            {currency} {stockValuationCost.toLocaleString()}
          </h3>
          <p className="text-xs text-slate-400 mt-1">{totalStockUnits} Units in stock • Click for details</p>
        </div>
      </div>

      {/* ALL 8 REPORT CARDS SUITE */}
      <div>
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3">
          Available Detail Reports
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                      <td className="p-3 font-mono font-bold text-blue-600">
                        #{sale.invNo}
                      </td>
                      <td className="p-3">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            sale.invoiceType === 'credit'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {sale.invoiceType === 'credit' ? 'Credit' : 'Cash'}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500 font-mono text-[11px]">
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
                      <td className="p-3 text-right font-mono tabular-nums font-bold text-slate-900">
                        {currency} {sale.grandTotal.toLocaleString()}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums font-bold text-emerald-600">
                        +{currency} {sale.netProfit.toLocaleString()}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => onViewReceipt(sale)}
                          className="p-1 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                          title="Print Receipt"
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

      {/* DETAIL REPORT MODAL & PRINTABLE PDF AREA */}
      {activeReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl space-y-4 border border-slate-100 animate-in zoom-in-95 max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <PieChart className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm uppercase tracking-wide">
                    {activeReportModal === 'sales' && 'Sales & Revenue Report'}
                    {activeReportModal === 'expenses' && 'Daily Expenses Report'}
                    {activeReportModal === 'inventory' && 'Inventory & Stock Valuation Report'}
                    {activeReportModal === 'khata' && 'Customer Credit & Khata Report'}
                    {activeReportModal === 'pnl' && 'Profit & Loss Statement (P&L)'}
                    {activeReportModal === 'closings' && 'Daily Closing & Cash Flow Report'}
                    {activeReportModal === 'purchases' && 'Purchases & Stock Inward Ledger'}
                    {activeReportModal === 'top_products' && 'Top Selling Products Report'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Detailed audit report • {shopName}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleShareWhatsAppReport(activeReportModal)}
                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" /> Send to WhatsApp
                </button>

                <button
                  type="button"
                  onClick={handlePrintCurrentReport}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md shadow-blue-500/20 transition cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" /> Download / Print PDF
                </button>

                <button
                  type="button"
                  onClick={() => setActiveReportModal(null)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrollable Report Content Area */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 text-xs">
              {/* Report Header Information */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="font-extrabold text-slate-900 text-sm">{shopName}</h4>
                  <p className="text-[11px] text-slate-500">{data.settings.address} • Ph: {data.settings.phone}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-bold text-slate-700">Date Generated:</p>
                  <p className="text-[11px] text-slate-500 font-mono">{new Date().toLocaleString()}</p>
                </div>
              </div>

              {/* REPORT 1: SALES & REVENUE */}
              {activeReportModal === 'sales' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
                      <span className="text-[10px] font-bold text-blue-700 uppercase">Gross Revenue</span>
                      <p className="text-lg font-bold font-mono text-blue-900 mt-0.5">{currency} {totalSalesRevenue.toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-slate-100 rounded-xl border border-slate-200">
                      <span className="text-[10px] font-bold text-slate-600 uppercase">Total COGS</span>
                      <p className="text-lg font-bold font-mono text-slate-900 mt-0.5">{currency} {totalCOGS.toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                      <span className="text-[10px] font-bold text-emerald-700 uppercase">Total Profit</span>
                      <p className="text-lg font-bold font-mono text-emerald-900 mt-0.5">+{currency} {netProfit.toLocaleString()}</p>
                    </div>
                  </div>

                  <table className="w-full text-left border-collapse border border-slate-200 rounded-xl overflow-hidden">
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
                    <tbody className="divide-y divide-slate-100">
                      {data.sales.map(s => (
                        <tr key={s.invNo} className="hover:bg-slate-50">
                          <td className="p-2.5 font-mono font-bold text-blue-600">#{s.invNo}</td>
                          <td className="p-2.5 font-semibold capitalize">{s.invoiceType || 'Cash'}</td>
                          <td className="p-2.5 text-slate-500 font-mono text-[11px]">{new Date(s.date).toLocaleDateString()}</td>
                          <td className="p-2.5 font-bold text-slate-800">{s.custName}</td>
                          <td className="p-2.5">{s.paymentMethod}</td>
                          <td className="p-2.5 text-right font-mono font-bold">{currency} {s.grandTotal.toLocaleString()}</td>
                          <td className="p-2.5 text-right font-mono font-bold text-emerald-600">+{currency} {s.netProfit.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* REPORT 2: DAILY EXPENSES */}
              {activeReportModal === 'expenses' && (
                <div className="space-y-4">
                  <div className="p-3.5 bg-rose-50 rounded-xl border border-rose-200 flex justify-between items-center">
                    <div>
                      <span className="text-[10px] font-bold text-rose-700 uppercase">Total Recorded Expenses</span>
                      <p className="text-xl font-bold font-mono text-rose-900">{currency} {totalExpenses.toLocaleString()}</p>
                    </div>
                    <span className="text-xs font-bold text-rose-700 bg-white px-3 py-1 rounded-xl shadow-2xs">
                      {data.expenses.length} Records
                    </span>
                  </div>

                  <table className="w-full text-left border-collapse border border-slate-200 rounded-xl overflow-hidden">
                    <thead className="bg-slate-100 font-bold text-[10px] uppercase text-slate-600">
                      <tr>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">Description</th>
                        <th className="p-2.5">Category</th>
                        <th className="p-2.5">Payment Method</th>
                        <th className="p-2.5 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.expenses.map(e => (
                        <tr key={e.id} className="hover:bg-slate-50">
                          <td className="p-2.5 text-slate-500 font-mono text-[11px]">{new Date(e.date).toLocaleDateString()}</td>
                          <td className="p-2.5 font-semibold text-slate-900">{e.description}</td>
                          <td className="p-2.5"><span className="px-2 py-0.5 bg-slate-100 rounded text-[11px]">{e.category}</span></td>
                          <td className="p-2.5">{e.paymentMethod || 'Cash'}</td>
                          <td className="p-2.5 text-right font-mono font-bold text-rose-600">{currency} {e.amount.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* REPORT 3: INVENTORY VALUATION */}
              {activeReportModal === 'inventory' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-200">
                      <span className="text-[10px] font-bold text-indigo-700 uppercase">Cost Value</span>
                      <p className="text-lg font-bold font-mono text-indigo-900 mt-0.5">{currency} {stockValuationCost.toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
                      <span className="text-[10px] font-bold text-blue-700 uppercase">Retail Value</span>
                      <p className="text-lg font-bold font-mono text-blue-900 mt-0.5">{currency} {stockValuationRetail.toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                      <span className="text-[10px] font-bold text-emerald-700 uppercase">Expected Profit</span>
                      <p className="text-lg font-bold font-mono text-emerald-900 mt-0.5">+{currency} {(stockValuationRetail - stockValuationCost).toLocaleString()}</p>
                    </div>
                  </div>

                  <table className="w-full text-left border-collapse border border-slate-200 rounded-xl overflow-hidden">
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
                    <tbody className="divide-y divide-slate-100">
                      {data.inventory.map(item => (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="p-2.5 font-bold text-slate-900">{item.name}</td>
                          <td className="p-2.5 text-slate-500">{item.category}</td>
                          <td className="p-2.5 text-center font-mono font-bold">
                            <span className={item.qty <= 1 ? 'text-rose-600 font-bold' : ''}>{item.qty}</span>
                          </td>
                          <td className="p-2.5 text-right font-mono">{currency} {item.costPrice.toLocaleString()}</td>
                          <td className="p-2.5 text-right font-mono font-bold">{currency} {item.salePrice.toLocaleString()}</td>
                          <td className="p-2.5 text-right font-mono font-extrabold text-indigo-700">
                            {currency} {(item.costPrice * item.qty).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* REPORT 4: CUSTOMER KHATA */}
              {activeReportModal === 'khata' && (
                <div className="space-y-4">
                  <div className="p-3.5 bg-purple-50 rounded-xl border border-purple-200 flex justify-between items-center">
                    <div>
                      <span className="text-[10px] font-bold text-purple-700 uppercase">Total Pending Receivables</span>
                      <p className="text-xl font-bold font-mono text-purple-900">{currency} {totalUdhar.toLocaleString()}</p>
                    </div>
                    <span className="text-xs font-bold text-purple-700 bg-white px-3 py-1 rounded-xl">
                      {debtorCustomersCount} Customers with Balance
                    </span>
                  </div>

                  <table className="w-full text-left border-collapse border border-slate-200 rounded-xl overflow-hidden">
                    <thead className="bg-slate-100 font-bold text-[10px] uppercase text-slate-600">
                      <tr>
                        <th className="p-2.5">Customer Name</th>
                        <th className="p-2.5">Primary Phone</th>
                        <th className="p-2.5">Location / Address</th>
                        <th className="p-2.5 text-center">Tx Count</th>
                        <th className="p-2.5 text-right">Outstanding Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.khata.map(c => (
                        <tr key={c.id} className="hover:bg-slate-50">
                          <td className="p-2.5 font-bold text-slate-900">{c.name}</td>
                          <td className="p-2.5 font-mono">{c.phone}</td>
                          <td className="p-2.5 text-slate-500">{c.address || '-'}</td>
                          <td className="p-2.5 text-center">{c.history.length}</td>
                          <td className="p-2.5 text-right font-mono font-bold text-purple-700">{currency} {c.balance.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* REPORT 5: PROFIT & LOSS STATEMENT */}
              {activeReportModal === 'pnl' && (
                <div className="space-y-4 bg-white p-4 rounded-2xl border border-slate-200">
                  <h4 className="font-extrabold text-sm border-b pb-2 uppercase tracking-wide text-slate-800">
                    Comprehensive Financial Statement
                  </h4>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="font-semibold text-slate-700">Gross Sales Revenue:</span>
                      <span className="font-mono font-bold text-slate-900">{currency} {totalSalesRevenue.toLocaleString()}</span>
                    </div>

                    <div className="flex justify-between py-1.5 border-b border-slate-100 text-slate-600">
                      <span>Less: Cost of Goods Sold (COGS):</span>
                      <span className="font-mono font-bold text-slate-700">-{currency} {totalCOGS.toLocaleString()}</span>
                    </div>

                    <div className="flex justify-between py-2 border-b border-slate-200 font-bold bg-slate-50 px-2 rounded-lg">
                      <span className="text-slate-900">Gross Operating Profit:</span>
                      <span className="font-mono text-emerald-700">{currency} {grossProfit.toLocaleString()}</span>
                    </div>

                    <div className="flex justify-between py-1.5 border-b border-slate-100 text-rose-600">
                      <span>Less: Operational Shop Expenses:</span>
                      <span className="font-mono font-bold">-{currency} {totalExpenses.toLocaleString()}</span>
                    </div>

                    <div className="flex justify-between py-3 border-t-2 border-slate-900 font-extrabold text-sm">
                      <span className="text-slate-900">Net Business Profit (kat peet kar):</span>
                      <span className={`font-mono ${netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
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
                  <table className="w-full text-left border-collapse border border-slate-200 rounded-xl overflow-hidden">
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
                    <tbody className="divide-y divide-slate-100">
                      {closingsHistory.map(rec => (
                        <tr key={rec.id} className="hover:bg-slate-50">
                          <td className="p-2.5 font-mono font-bold">{rec.date} ({rec.time})</td>
                          <td className="p-2.5">{rec.closedBy}</td>
                          <td className="p-2.5 text-right font-mono font-bold text-emerald-600">{currency} {rec.totalCash.toLocaleString()}</td>
                          <td className="p-2.5 text-right font-mono font-bold text-blue-600">{currency} {rec.totalOnline.toLocaleString()}</td>
                          <td className="p-2.5 text-right font-mono font-extrabold text-slate-900">{currency} {rec.grandTotal.toLocaleString()}</td>
                          <td className="p-2.5 text-right font-mono font-bold">
                            {rec.difference === 0 ? 'Matched' : `${rec.difference! > 0 ? '+' : ''}${currency} ${rec.difference?.toLocaleString()}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* REPORT 7: PURCHASES LEDGER */}
              {activeReportModal === 'purchases' && (
                <div className="space-y-4">
                  <table className="w-full text-left border-collapse border border-slate-200 rounded-xl overflow-hidden">
                    <thead className="bg-slate-100 font-bold text-[10px] uppercase text-slate-600">
                      <tr>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">Item Name</th>
                        <th className="p-2.5 text-center">Qty Purchased</th>
                        <th className="p-2.5 text-right">Cost Price</th>
                        <th className="p-2.5 text-right">Total Investment</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.purchasesLedger.map(p => (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="p-2.5 text-slate-500 font-mono text-[11px]">{new Date(p.date).toLocaleDateString()}</td>
                          <td className="p-2.5 font-bold text-slate-900">{p.itemTitle}</td>
                          <td className="p-2.5 text-center font-mono font-bold">{p.qty}</td>
                          <td className="p-2.5 text-right font-mono">{currency} {p.costPrice.toLocaleString()}</td>
                          <td className="p-2.5 text-right font-mono font-bold text-amber-700">{currency} {p.total.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* REPORT 8: TOP SELLING PRODUCTS */}
              {activeReportModal === 'top_products' && (
                <div className="space-y-4">
                  <table className="w-full text-left border-collapse border border-slate-200 rounded-xl overflow-hidden">
                    <thead className="bg-slate-100 font-bold text-[10px] uppercase text-slate-600">
                      <tr>
                        <th className="p-2.5">Rank</th>
                        <th className="p-2.5">Product Name</th>
                        <th className="p-2.5">Category</th>
                        <th className="p-2.5 text-center">Units Sold</th>
                        <th className="p-2.5 text-right">Revenue Generated</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {topSellingList.map((p, idx) => (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="p-2.5 font-bold text-slate-400">#{idx + 1}</td>
                          <td className="p-2.5 font-bold text-slate-900">{p.name}</td>
                          <td className="p-2.5 text-slate-500">{p.category}</td>
                          <td className="p-2.5 text-center font-mono font-bold text-blue-600">{p.unitsSold}</td>
                          <td className="p-2.5 text-right font-mono font-extrabold text-slate-900">{currency} {p.totalRevenue.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
              {activeReportModal === 'sales' && 'SALES & REVENUE REPORT'}
              {activeReportModal === 'expenses' && 'DAILY EXPENSES REPORT'}
              {activeReportModal === 'inventory' && 'INVENTORY & VALUATION REPORT'}
              {activeReportModal === 'khata' && 'CUSTOMER CREDIT / KHATA REPORT'}
              {activeReportModal === 'pnl' && 'PROFIT & LOSS STATEMENT'}
              {activeReportModal === 'closings' && 'DAILY CLOSING REPORT'}
              {activeReportModal === 'purchases' && 'PURCHASES LEDGER REPORT'}
              {activeReportModal === 'top_products' && 'TOP SELLING PRODUCTS REPORT'}
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
                ) : activeReportModal === 'sales' ? (
                  data.sales.map(s => (
                    <tr key={s.invNo}>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>Invoice #{s.invNo} - {s.custName} ({new Date(s.date).toLocaleDateString()})</td>
                      <td style={{ padding: '6px', borderBottom: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold' }}>{currency} {s.grandTotal.toLocaleString()}</td>
                    </tr>
                  ))
                ) : activeReportModal === 'expenses' ? (
                  data.expenses.map(e => (
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
    </div>
  );
};
