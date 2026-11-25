import { AppData, DailyClosingRecord, SaleRecord, KhataTransaction, ExpenseItem, SupplierPurchase } from '../types';

export type AccountChannel = 'Cash' | 'Bank' | 'JazzCash' | 'Easypaisa' | 'Card' | 'Other';

/**
 * Unified Cash In Hand mode: all liquid payments route strictly through Cash In Hand
 */
export function normalizePaymentChannel(_pm?: string): AccountChannel {
  return 'Cash';
}

/**
 * Finds the latest valid closing prior to the target business date
 */
export function getPreviousDailyClosing(
  dailyClosings: DailyClosingRecord[] = [],
  targetDate: string,
  currentClosingId?: string
): DailyClosingRecord | null {
  const priorClosings = dailyClosings
    .filter(c => c.id !== currentClosingId && c.date < targetDate)
    .sort((a, b) => {
      const dateTimeA = `${a.date}T${a.time || '00:00'}`;
      const dateTimeB = `${b.date}T${b.time || '00:00'}`;
      return dateTimeB.localeCompare(dateTimeA);
    });

  return priorClosings[0] || null;
}

/**
 * Checks whether a transaction falls into the active period after previous closing cutoff
 */
export function isTxInClosingPeriod(
  txDateStr: string,
  previousClosing: DailyClosingRecord | null,
  targetDate: string,
  targetTime?: string
): boolean {
  if (!txDateStr) return false;

  const endCutoff = targetTime ? `${targetDate}T${targetTime}` : `${targetDate}T23:59:59.999`;

  if (previousClosing) {
    const startCutoff = previousClosing.createdAt || `${previousClosing.date}T${previousClosing.time || '23:59:59'}`;

    if (txDateStr.includes('T')) {
      const txTime = new Date(txDateStr).getTime();
      const startTime = new Date(startCutoff).getTime();
      const endTime = new Date(endCutoff).getTime();

      // If valid Date comparison
      if (!isNaN(txTime) && !isNaN(startTime)) {
        return txTime > startTime && (isNaN(endTime) || txTime <= endTime);
      }
    }

    // Fallback date-level comparison
    const txDateOnly = txDateStr.substring(0, 10);
    return txDateOnly > previousClosing.date && txDateOnly <= targetDate;
  }

  // No previous closing: include all transactions up to current target date/time
  if (txDateStr.includes('T')) {
    const txTime = new Date(txDateStr).getTime();
    const endTime = new Date(endCutoff).getTime();
    if (!isNaN(txTime) && !isNaN(endTime)) {
      return txTime <= endTime;
    }
  }

  return txDateStr.substring(0, 10) <= targetDate;
}

export interface AccountBreakdown {
  opening: number;
  sales: number;
  khataRecoveries: number;
  purchaseReversals: number;
  expenses: number;
  supplierPayments: number;
  salesRefunds: number;
  netMovement: number;
  expectedClosing: number;
}

export interface AccountingSummary {
  previousClosing: DailyClosingRecord | null;
  openingCash: number;
  openingOnlineTotal: number;
  openingGrandTotal: number;

  cash: AccountBreakdown;
  bank: AccountBreakdown;
  jazzCash: AccountBreakdown;
  easypaisa: AccountBreakdown;
  card: AccountBreakdown;
  other: AccountBreakdown;

  onlineAccounts: Array<{
    accountId: string;
    accountName: string;
    bankType?: string;
    opening: number;
    sales: number;
    khataRecoveries: number;
    purchaseReversals: number;
    expenses: number;
    supplierPayments: number;
    salesRefunds: number;
    expectedClosing: number;
  }>;

  totalExpectedCash: number;
  totalExpectedOnline: number;
  totalExpectedGrand: number;

  periodSales: SaleRecord[];
  periodKhataPayments: Array<{ customerId: string; customerName: string; tx: KhataTransaction }>;
  periodExpenses: ExpenseItem[];
  periodPurchases: SupplierPurchase[];
  periodPurchaseReversals: SupplierPurchase[];
  periodSalesReturns: Array<any>;
}

/**
 * Master accounting engine: computes isolated account balances strictly between previous closing and current date/time
 */
export function calculateAccountingSummary(
  data: AppData,
  targetDate: string,
  targetTime?: string,
  currentClosingId?: string
): AccountingSummary {
  const previousClosing = getPreviousDailyClosing(data.dailyClosings || [], targetDate, currentClosingId);

  // 1. Opening Cash
  const openingCash = previousClosing ? Number(previousClosing.totalCash) || 0 : 0;

  // 2. Filter period transactions (exclude CANCELLED sales)
  const periodSales = (data.sales || []).filter(s =>
    s.status !== 'CANCELLED' &&
    isTxInClosingPeriod(s.date, previousClosing, targetDate, targetTime)
  );

  const periodKhataPayments: Array<{ customerId: string; customerName: string; tx: KhataTransaction }> = [];
  (data.khata || []).forEach(customer => {
    (customer.history || []).forEach(tx => {
      if (tx.type === 'payment' && isTxInClosingPeriod(tx.date, previousClosing, targetDate, targetTime)) {
        periodKhataPayments.push({
          customerId: customer.id,
          customerName: customer.name,
          tx,
        });
      }
    });
  });

  const periodExpenses = (data.expenses || []).filter(e =>
    isTxInClosingPeriod(e.date, previousClosing, targetDate, targetTime)
  );

  const periodPurchases = (data.supplierPurchases || []).filter(p =>
    p.status !== 'REVERSED' &&
    isTxInClosingPeriod(p.date, previousClosing, targetDate, targetTime)
  );

  const periodPurchaseReversals = (data.supplierPurchases || []).filter(p =>
    p.status === 'REVERSED' &&
    isTxInClosingPeriod(p.reversedAt || p.date, previousClosing, targetDate, targetTime)
  );

  const periodSalesReturns = (data.salesReturns || []).filter(r =>
    isTxInClosingPeriod(r.returnDate, previousClosing, targetDate, targetTime)
  );

  // Channel Accumulator Helper (Cash In Hand absorbs all liquid transactions)
  const createChannelBreakdown = (channel: AccountChannel, openingVal: number = 0): AccountBreakdown => {
    const isChannelAccount = (_tx: { paymentMethod?: string; accountId?: string }) => {
      return channel === 'Cash';
    };

    // Sales inflow
    const sales = periodSales
      .filter(s => isChannelAccount(s))
      .reduce((sum, s) => {
        const isCredit = s.invoiceType === 'credit';
        const paid = !isCredit
          ? (s.amountPaid !== undefined && s.amountPaid !== null ? Number(s.amountPaid) : Number(s.grandTotal) || 0)
          : (Number(s.amountPaid) || 0);
        return sum + paid;
      }, 0);

    // Khata recovery inflow
    const khataRecoveries = periodKhataPayments
      .filter(item => isChannelAccount(item.tx))
      .reduce((sum, item) => sum + (Number(item.tx.amount) || 0), 0);

    // Purchase reversal inflow
    const purchaseReversals = periodPurchaseReversals
      .filter(p => isChannelAccount(p))
      .reduce((sum, p) => sum + (Number(p.paidAmount) || 0), 0);

    // Expense outflow
    const expenses = periodExpenses
      .filter(e => isChannelAccount(e))
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    // Supplier payment outflow
    const supplierPayments = periodPurchases
      .filter(p => isChannelAccount(p))
      .reduce((sum, p) => sum + (Number(p.paidAmount) || 0), 0);

    // Sales return refund outflow (exclude non-cash Credit Adjustment returns)
    const salesRefunds = periodSalesReturns
      .filter(
        r =>
          r.refundPaymentMethod !== 'Credit Adjustment' &&
          isChannelAccount({ paymentMethod: r.refundPaymentMethod, accountId: r.accountId })
      )
      .reduce((sum, r) => sum + (Number(r.totalRefundAmount) || 0), 0);

    const netMovement = sales + khataRecoveries + purchaseReversals - expenses - supplierPayments - salesRefunds;
    const expectedClosing = openingVal + netMovement;

    return {
      opening: openingVal,
      sales,
      khataRecoveries,
      purchaseReversals,
      expenses,
      supplierPayments,
      salesRefunds,
      netMovement,
      expectedClosing,
    };
  };

  const cash = createChannelBreakdown('Cash', openingCash);
  const bank = createChannelBreakdown('Bank', 0);
  const jazzCash = createChannelBreakdown('JazzCash', 0);
  const easypaisa = createChannelBreakdown('Easypaisa', 0);
  const card = createChannelBreakdown('Card', 0);
  const other = createChannelBreakdown('Other', 0);

  const onlineAccounts: AccountingSummary['onlineAccounts'] = [];
  const openingOnlineTotal = 0;
  const openingGrandTotal = openingCash;

  const totalExpectedCash = cash.expectedClosing;
  const totalExpectedOnline = 0;
  const totalExpectedGrand = totalExpectedCash;

  return {
    previousClosing,
    openingCash,
    openingOnlineTotal,
    openingGrandTotal,
    cash,
    bank,
    jazzCash,
    easypaisa,
    card,
    other,
    onlineAccounts,
    totalExpectedCash,
    totalExpectedOnline,
    totalExpectedGrand,
    periodSales,
    periodKhataPayments,
    periodExpenses,
    periodPurchases,
    periodPurchaseReversals,
    periodSalesReturns,
  };
}
