import { useMemo } from 'react';
import { AppData, DailyClosingRecord } from '../types';
import { normalizePaymentChannel, isTxInClosingPeriod } from './accounting';

export interface CashLedgerItem {
  id: string;
  date: string;
  type: 'OPENING' | 'SALE' | 'KHATA_RECOVERY' | 'EXPENSE' | 'SUPPLIER_PAYMENT' | 'SALES_REFUND' | 'PURCHASE_REVERSAL';
  title: string;
  details?: string;
  paymentMethod: string;
  cashIn: number;
  cashOut: number;
  bankIn: number;
  bankOut: number;
  runningCashBalance: number;
  runningBankBalance: number;
}

export interface CashDrawerSummary {
  openingCash: number;
  openingBank: number;
  
  // Sales
  cashSales: number;
  bankSales: number;
  creditSales: number;
  totalSales: number;

  // Sales Returns / Refunds
  cashSalesRefunds: number;
  bankSalesRefunds: number;
  totalSalesRefunds: number;
  
  // Khata Collections
  khataRecoveriesCash: number;
  khataRecoveriesBank: number;
  totalKhataRecoveries: number;
  
  // Outflows
  cashExpenses: number;
  bankExpenses: number;
  totalExpenses: number;
  
  supplierPaidCash: number;
  supplierPaidBank: number;
  totalSupplierPaid: number;
  
  // Net Balances
  cashInHand: number;
  bankBalance: number;
  totalLiquidFunds: number;
  
  // Stock Asset Balancing
  totalStockCostValue: number;
  totalStockRetailValue: number;
  expectedGrossMargin: number;
  
  // Real-time Profitability
  realTimeNetProfit: number;
  
  // Itemized Drilldown
  ledger: CashLedgerItem[];
}

export type DashboardPeriodMode =
  | 'live'
  | 'today'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'date'
  | 'all';

export interface DashboardPeriodFilter {
  mode: DashboardPeriodMode;
  specificDate?: string; // YYYY-MM-DD
  endDate?: string; // optional YYYY-MM-DD
}

export function isDateInDashboardPeriod(
  dateStr: string | undefined,
  filter: DashboardPeriodFilter,
  latestClosing: DailyClosingRecord | null,
  todayStr: string
): boolean {
  if (!dateStr) return false;
  if (filter.mode === 'live') {
    return isTxInClosingPeriod(dateStr, latestClosing, todayStr);
  }
  if (filter.mode === 'all') {
    return true;
  }

  const parsed = new Date(dateStr);
  const txDay =
    dateStr.includes('T') && !isNaN(parsed.getTime())
      ? `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
      : dateStr.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(dateStr)
      ? dateStr.substring(0, 10)
      : !isNaN(parsed.getTime())
      ? `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
      : '';

  const now = new Date();
  const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  if (filter.mode === 'today') {
    return txDay === localToday;
  }

  if (filter.mode === 'weekly') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    if (!isNaN(parsed.getTime())) {
      return parsed >= start && parsed <= end;
    }
    const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    return txDay >= startStr && txDay <= localToday;
  }

  if (filter.mode === 'monthly') {
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return txDay.startsWith(monthPrefix);
  }

  if (filter.mode === 'yearly') {
    const yearPrefix = `${now.getFullYear()}-`;
    return txDay.startsWith(yearPrefix);
  }

  if (filter.mode === 'date') {
    const startDay = filter.specificDate || localToday;
    const endDay = filter.endDate && filter.endDate >= startDay ? filter.endDate : startDay;
    return txDay >= startDay && txDay <= endDay;
  }

  return true;
}

export function useCashDrawer(
  data: AppData,
  periodFilter: DashboardPeriodFilter = { mode: 'live' }
): CashDrawerSummary {
  return useMemo(() => {
    const isLiveMode = periodFilter.mode === 'live';

    // 1. Determine Opening Balance from last Daily Closing (only applied in live drawer mode)
    let openingCash = 0;
    let openingBank = 0;

    const closings = data.dailyClosings || [];
    let latestClosing: DailyClosingRecord | null = null;
    if (closings.length > 0) {
      const sortedClosings = [...closings].sort((a, b) => {
        const dateTimeA = `${a.date}T${a.time || '00:00:00'}`;
        const dateTimeB = `${b.date}T${b.time || '00:00:00'}`;
        return dateTimeB.localeCompare(dateTimeA);
      });
      latestClosing = sortedClosings[0] || null;
      if (isLiveMode && latestClosing) {
        openingCash = Number(latestClosing.totalCash) || 0;
        openingBank = Number(latestClosing.totalOnline) || 0;
      }
    }

    const nowLocal = new Date();
    const todayStr = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`;

    // 2. Compute Sales Breakdown for active period
    let cashSales = 0;
    let bankSales = 0;
    let creditSales = 0;
    let totalSales = 0;
    let totalCOGS = 0;

    const salesLedgerEntries: CashLedgerItem[] = [];

    (data.sales || []).forEach(sale => {
      if (sale.status === 'CANCELLED') {
        return;
      }
      if (!isDateInDashboardPeriod(sale.date, periodFilter, latestClosing, todayStr)) {
        return;
      }

      const isCredit = sale.invoiceType === 'credit';
      const grandTotal = Number(sale.grandTotal) || 0;
      const paid = !isCredit
        ? (sale.amountPaid !== undefined && sale.amountPaid !== null ? Number(sale.amountPaid) : grandTotal)
        : (sale.amountPaid !== undefined ? Number(sale.amountPaid) : 0);
      const cost = Number(sale.totalCost) || 0;

      totalSales += grandTotal;
      totalCOGS += cost;

      if (isCredit) {
        creditSales += Number(sale.amountDue) || 0;
      }

      const channel = normalizePaymentChannel(sale.paymentMethod);
      const isCash = channel === 'Cash';

      if (paid > 0) {
        if (isCash) {
          cashSales += paid;
        } else {
          bankSales += paid;
        }

        salesLedgerEntries.push({
          id: `SALE-${sale.invNo}`,
          date: sale.date,
          type: 'SALE',
          title: `Invoice #${sale.invNo} (${sale.custName || 'Walk-in'})`,
          details: `${sale.items?.length || 0} item(s) • Paid via ${sale.paymentMethod || 'Cash'}`,
          paymentMethod: sale.paymentMethod || 'Cash',
          cashIn: isCash ? paid : 0,
          cashOut: 0,
          bankIn: !isCash ? paid : 0,
          bankOut: 0,
          runningCashBalance: 0,
          runningBankBalance: 0,
        });
      }
    });

    // 3. Compute Khata Recoveries (Only transactions after previous closing, using structured paymentMethod)
    let khataRecoveriesCash = 0;
    let khataRecoveriesBank = 0;
    const khataLedgerEntries: CashLedgerItem[] = [];

    (data.khata || []).forEach(customer => {
      (customer.history || []).forEach(tx => {
        if (
          tx.type === 'payment' &&
          tx.amount > 0 &&
          isDateInDashboardPeriod(tx.date, periodFilter, latestClosing, todayStr)
        ) {
          const channel = normalizePaymentChannel(tx.paymentMethod);
          const isCash = channel === 'Cash';

          if (isCash) {
            khataRecoveriesCash += tx.amount;
          } else {
            khataRecoveriesBank += tx.amount;
          }

          khataLedgerEntries.push({
            id: `KHATA-${tx.id}`,
            date: tx.date,
            type: 'KHATA_RECOVERY',
            title: `Khata Recovery: ${customer.name}`,
            details: tx.note || `Customer phone: ${customer.phone}`,
            paymentMethod: tx.paymentMethod || 'Cash',
            cashIn: isCash ? tx.amount : 0,
            cashOut: 0,
            bankIn: !isCash ? tx.amount : 0,
            bankOut: 0,
            runningCashBalance: 0,
            runningBankBalance: 0,
          });
        }
      });
    });

    // 4. Compute Expenses (Only transactions after previous closing)
    let cashExpenses = 0;
    let bankExpenses = 0;
    const expenseLedgerEntries: CashLedgerItem[] = [];

    (data.expenses || []).forEach(exp => {
      if (!isDateInDashboardPeriod(exp.date, periodFilter, latestClosing, todayStr)) {
        return;
      }

      const amount = Number(exp.amount) || 0;
      const channel = normalizePaymentChannel(exp.paymentMethod);
      const isCash = channel === 'Cash';

      if (isCash) {
        cashExpenses += amount;
      } else {
        bankExpenses += amount;
      }

      expenseLedgerEntries.push({
        id: `EXP-${exp.id}`,
        date: exp.date,
        type: 'EXPENSE',
        title: `Expense: ${exp.description}`,
        details: `Category: ${exp.category} • Paid via ${exp.paymentMethod || 'Cash'}`,
        paymentMethod: exp.paymentMethod || 'Cash',
        cashIn: 0,
        cashOut: isCash ? amount : 0,
        bankIn: 0,
        bankOut: !isCash ? amount : 0,
        runningCashBalance: 0,
        runningBankBalance: 0,
      });
    });

    // 5. Compute Supplier Purchases Paid (Only transactions after previous closing, ignoring reversed purchases)
    let supplierPaidCash = 0;
    let supplierPaidBank = 0;
    const supplierLedgerEntries: CashLedgerItem[] = [];

    (data.supplierPurchases || []).forEach(purchase => {
      // Skip cancelled / reversed purchases
      if (purchase.status === 'REVERSED') {
        return;
      }

      if (!isDateInDashboardPeriod(purchase.date, periodFilter, latestClosing, todayStr)) {
        return;
      }

      const paid = Number(purchase.paidAmount) || 0;
      if (paid > 0) {
        const channel = normalizePaymentChannel(purchase.paymentMethod);
        const isCash = channel === 'Cash';

        if (isCash) {
          supplierPaidCash += paid;
        } else {
          supplierPaidBank += paid;
        }

        supplierLedgerEntries.push({
          id: `PUR-${purchase.id}`,
          date: purchase.date,
          type: 'SUPPLIER_PAYMENT',
          title: `Supplier Bill: ${purchase.partyName} (#${purchase.billNo})`,
          details: `${purchase.items?.length || 0} item(s) • Paid via ${purchase.paymentMethod || 'Cash'}`,
          paymentMethod: purchase.paymentMethod || 'Cash',
          cashIn: 0,
          cashOut: isCash ? paid : 0,
          bankIn: 0,
          bankOut: !isCash ? paid : 0,
          runningCashBalance: 0,
          runningBankBalance: 0,
        });
      }
    });

    // 5b. Compute Sales Returns & Refunds (Cash / Bank Outflows + All Revenue Reversals for Profit)
    let cashSalesRefunds = 0;
    let bankSalesRefunds = 0;
    let allSalesRefundsInPeriod = 0;
    let totalCostReversedInPeriod = 0;
    let totalProfitLostFromReturns = 0;
    const returnLedgerEntries: CashLedgerItem[] = [];

    (data.salesReturns || []).forEach(ret => {
      if (!isDateInDashboardPeriod(ret.returnDate, periodFilter, latestClosing, todayStr)) {
        return;
      }

      const refundAmt = Number(ret.totalRefundAmount) || 0;
      allSalesRefundsInPeriod += refundAmt;
      totalCostReversedInPeriod += Number(ret.totalCostReversed) || 0;
      totalProfitLostFromReturns += Number(ret.netProfitDeducted) || 0;

      if (refundAmt > 0 && ret.refundPaymentMethod !== 'Credit Adjustment') {
        const channel = normalizePaymentChannel(ret.refundPaymentMethod);
        const isCash = channel === 'Cash';

        if (isCash) {
          cashSalesRefunds += refundAmt;
        } else {
          bankSalesRefunds += refundAmt;
        }

        returnLedgerEntries.push({
          id: `RET-${ret.id}`,
          date: ret.returnDate,
          type: 'SALES_REFUND',
          title: `Sales Return #${ret.returnNo} (Inv #${ret.originalInvNo})`,
          details: `${ret.items?.length || 0} item(s) • Refunded via ${ret.refundPaymentMethod || 'Cash'} • ${ret.customerName || 'Customer'}`,
          paymentMethod: ret.refundPaymentMethod || 'Cash',
          cashIn: 0,
          cashOut: isCash ? refundAmt : 0,
          bankIn: 0,
          bankOut: !isCash ? refundAmt : 0,
          runningCashBalance: 0,
          runningBankBalance: 0,
        });
      }
    });

    const totalSalesRefunds = cashSalesRefunds + bankSalesRefunds;

    // 6. Net Balances
    // Cash In Hand = (Opening Cash + Cash Sales + Cash Khata Recoveries) - (Cash Expenses + Supplier Cash Paid + Cash Sales Refunds)
    const cashInHand = (openingCash + cashSales + khataRecoveriesCash) - (cashExpenses + supplierPaidCash + cashSalesRefunds);
    const bankBalance = (openingBank + bankSales + khataRecoveriesBank) - (bankExpenses + supplierPaidBank + bankSalesRefunds);
    const totalLiquidFunds = cashInHand + bankBalance;

    // 7. Stock Asset Valuation
    let totalStockCostValue = 0;
    let totalStockRetailValue = 0;

    (data.inventory || []).forEach(item => {
      const qty = Math.max(0, Number(item.qty) || 0);
      totalStockCostValue += (Number(item.costPrice) || 0) * qty;
      totalStockRetailValue += (Number(item.salePrice) || 0) * qty;
    });

    const expectedGrossMargin = totalStockRetailValue - totalStockCostValue;

    // 8. Real-time Net Profit
    // Net Profit = (Net Sales after ALL returns - Net COGS after returned cost) - Total Expenses
    const totalExpenses = cashExpenses + bankExpenses;
    const grossProfit = Math.max(0, (totalSales - allSalesRefundsInPeriod) - (totalCOGS - totalCostReversedInPeriod));
    const realTimeNetProfit = grossProfit - totalExpenses;

    // 9. Chronological Running Balance Ledger Construction
    const allRawEntries = [
      ...salesLedgerEntries,
      ...khataLedgerEntries,
      ...expenseLedgerEntries,
      ...supplierLedgerEntries,
      ...returnLedgerEntries,
    ];

    // Sort chronologically ascending
    allRawEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningCash = openingCash;
    let runningBank = openingBank;

    const chronologicalLedger: CashLedgerItem[] = [];

    // Add opening balance entry if non-zero
    if (openingCash > 0 || openingBank > 0) {
      chronologicalLedger.push({
        id: 'OPENING-BALANCE',
        date: latestClosing?.date || todayStr,
        type: 'OPENING',
        title: 'Opening Balance (Cash Drawer & Digital Accounts)',
        details: latestClosing ? `Brought forward from closing on ${latestClosing.date}` : 'Baseline funds',
        paymentMethod: 'Drawer Float',
        cashIn: openingCash,
        cashOut: 0,
        bankIn: openingBank,
        bankOut: 0,
        runningCashBalance: runningCash,
        runningBankBalance: runningBank,
      });
    }

    allRawEntries.forEach(entry => {
      runningCash = runningCash + entry.cashIn - entry.cashOut;
      runningBank = runningBank + entry.bankIn - entry.bankOut;

      chronologicalLedger.push({
        ...entry,
        runningCashBalance: runningCash,
        runningBankBalance: runningBank,
      });
    });

    // Provide reverse chronological for display (newest first)
    const reversedLedger = [...chronologicalLedger].reverse();

    return {
      openingCash,
      openingBank,
      cashSales,
      bankSales,
      creditSales,
      totalSales,
      cashSalesRefunds,
      bankSalesRefunds,
      totalSalesRefunds,
      khataRecoveriesCash,
      khataRecoveriesBank,
      totalKhataRecoveries: khataRecoveriesCash + khataRecoveriesBank,
      cashExpenses,
      bankExpenses,
      totalExpenses,
      supplierPaidCash,
      supplierPaidBank,
      totalSupplierPaid: supplierPaidCash + supplierPaidBank,
      cashInHand,
      bankBalance,
      totalLiquidFunds,
      totalStockCostValue,
      totalStockRetailValue,
      expectedGrossMargin,
      realTimeNetProfit,
      ledger: reversedLedger,
    };
  }, [data, periodFilter.mode, periodFilter.specificDate, periodFilter.endDate]);
}
