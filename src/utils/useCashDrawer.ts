import { useMemo } from 'react';
import { AppData, DailyClosingRecord } from '../types';

export interface CashLedgerItem {
  id: string;
  date: string;
  type: 'OPENING' | 'SALE' | 'KHATA_RECOVERY' | 'EXPENSE' | 'SUPPLIER_PAYMENT';
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

export function useCashDrawer(data: AppData): CashDrawerSummary {
  return useMemo(() => {
    // 1. Determine Opening Balance from last Daily Closing or default to 0
    let openingCash = 0;
    let openingBank = 0;

    const closings = data.dailyClosings || [];
    if (closings.length > 0) {
      // Find the most recent closing safely
      const sortedClosings = [...closings].sort((a, b) => {
        const tA = (a.time || '00:00:00').length === 5 ? `${a.time}:00` : (a.time || '00:00:00');
        const tB = (b.time || '00:00:00').length === 5 ? `${b.time}:00` : (b.time || '00:00:00');
        const timeA = new Date(`${a.date}T${tA}`).getTime() || 0;
        const timeB = new Date(`${b.date}T${tB}`).getTime() || 0;
        return timeB - timeA;
      });
      const latestClosing = sortedClosings[0];
      if (latestClosing) {
        openingCash = Number(latestClosing.totalCash) || 0;
        openingBank = Number(latestClosing.totalOnline) || 0;
      }
    }

    // 2. Compute Sales Breakdown
    let cashSales = 0;
    let bankSales = 0;
    let creditSales = 0;
    let totalSales = 0;
    let totalCOGS = 0;

    const salesLedgerEntries: CashLedgerItem[] = [];

    (data.sales || []).forEach(sale => {
      const isCredit = sale.invoiceType === 'credit';
      const grandTotal = Number(sale.grandTotal) || 0;
      // For cash invoice, full grandTotal is received in cash/channel; for credit, amountPaid is received
      const paid = !isCredit
        ? (sale.amountPaid !== undefined && sale.amountPaid !== null ? Number(sale.amountPaid) : grandTotal)
        : (sale.amountPaid !== undefined ? Number(sale.amountPaid) : 0);
      const cost = Number(sale.totalCost) || 0;

      totalSales += grandTotal;
      totalCOGS += cost;

      if (isCredit) {
        creditSales += Number(sale.amountDue) || 0;
      }

      const method = (sale.paymentMethod || 'Cash').trim().toLowerCase();
      const isCash = method === 'cash' || method === '';

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

    // 3. Compute Khata Recoveries
    let khataRecoveriesCash = 0;
    let khataRecoveriesBank = 0;
    const khataLedgerEntries: CashLedgerItem[] = [];

    (data.khata || []).forEach(customer => {
      (customer.history || []).forEach(tx => {
        if (tx.type === 'payment' && tx.amount > 0) {
          // Default Khata payments are cash unless noted
          const isBank = (tx.note || '').toLowerCase().includes('bank') ||
            (tx.note || '').toLowerCase().includes('online') ||
            (tx.note || '').toLowerCase().includes('jazzcash') ||
            (tx.note || '').toLowerCase().includes('easypaisa');

          if (isBank) {
            khataRecoveriesBank += tx.amount;
          } else {
            khataRecoveriesCash += tx.amount;
          }

          khataLedgerEntries.push({
            id: `KHATA-${tx.id}`,
            date: tx.date,
            type: 'KHATA_RECOVERY',
            title: `Khata Recovery: ${customer.name}`,
            details: tx.note || `Customer phone: ${customer.phone}`,
            paymentMethod: isBank ? 'Bank / Online' : 'Cash',
            cashIn: isBank ? 0 : tx.amount,
            cashOut: 0,
            bankIn: isBank ? tx.amount : 0,
            bankOut: 0,
            runningCashBalance: 0,
            runningBankBalance: 0,
          });
        }
      });
    });

    // 4. Compute Expenses
    let cashExpenses = 0;
    let bankExpenses = 0;
    const expenseLedgerEntries: CashLedgerItem[] = [];

    (data.expenses || []).forEach(exp => {
      const amount = Number(exp.amount) || 0;
      const method = (exp.paymentMethod || 'Cash').trim().toLowerCase();
      const isCash = method === 'cash' || method === '';

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

    // 5. Compute Supplier Purchases Paid
    let supplierPaidCash = 0;
    let supplierPaidBank = 0;
    const supplierLedgerEntries: CashLedgerItem[] = [];

    (data.supplierPurchases || []).forEach(purchase => {
      const paid = Number(purchase.paidAmount) || 0;
      if (paid > 0) {
        const method = (purchase.paymentMethod || 'Cash').trim().toLowerCase();
        const isCash = method === 'cash' || method === '';

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

    // 6. Net Balances
    // Cash In Hand = (Opening Cash + Total Cash Sales + Khata Recoveries) - (Cash Expenses + Supplier Cash Paid)
    const cashInHand = (openingCash + cashSales + khataRecoveriesCash) - (cashExpenses + supplierPaidCash);
    const bankBalance = (openingBank + bankSales + khataRecoveriesBank) - (bankExpenses + supplierPaidBank);
    const totalLiquidFunds = cashInHand + bankBalance;

    // 7. Stock Asset Valuation
    let totalStockCostValue = 0;
    let totalStockRetailValue = 0;

    (data.inventory || []).forEach(item => {
      const qty = Math.max(0, item.qty || 0);
      totalStockCostValue += (item.costPrice || 0) * qty;
      totalStockRetailValue += (item.salePrice || 0) * qty;
    });

    const expectedGrossMargin = totalStockRetailValue - totalStockCostValue;

    // 8. Real-time Net Profit
    // Net Profit = (Total Sales Revenue - Total Cost of Goods Sold) - Total Expenses
    const totalExpenses = cashExpenses + bankExpenses;
    const grossProfit = totalSales - totalCOGS;
    const realTimeNetProfit = grossProfit - totalExpenses;

    // 9. Chronological Running Balance Ledger Construction
    const allRawEntries = [
      ...salesLedgerEntries,
      ...khataLedgerEntries,
      ...expenseLedgerEntries,
      ...supplierLedgerEntries,
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
        date: new Date().toISOString().substring(0, 10),
        type: 'OPENING',
        title: 'Opening Balance (Cash Drawer & Digital Accounts)',
        details: 'Baseline funds brought forward',
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
  }, [data]);
}
