import { AppData, DailyClosingRecord, SaleRecord, KhataTransaction, ExpenseItem, SupplierPurchase } from '../types';

export type AccountChannel = 'Cash' | 'Bank' | 'JazzCash' | 'Easypaisa' | 'Card' | 'Other';

/**
 * Resolves payment channel display label
 */
export function normalizePaymentChannel(pm?: string): AccountChannel {
  const val = (pm || '').trim().toLowerCase();
  if (val.includes('jazz')) return 'JazzCash';
  if (val.includes('easy')) return 'Easypaisa';
  if (val.includes('bank')) return 'Bank';
  if (val.includes('card')) return 'Card';
  if (val === '' || val.includes('cash')) return 'Cash';
  return 'Other';
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
 * Master accounting engine: computes isolated cash & digital account balances strictly between previous closing and current date/time
 */
export function calculateAccountingSummary(
  data: AppData,
  targetDate: string,
  targetTime?: string,
  currentClosingId?: string
): AccountingSummary {
  const previousClosing = getPreviousDailyClosing(data.dailyClosings || [], targetDate, currentClosingId);
  const configuredOnlineAccounts = data.onlineAccounts || [];
  const activeOnlineAccountIds = new Set(configuredOnlineAccounts.map(a => a.id));

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

  const computeBreakdown = (
    matcher: (tx: { paymentMethod?: string; accountId?: string }) => boolean,
    openingVal: number = 0
  ): AccountBreakdown => {
    const sales = periodSales
      .filter(s => matcher(s))
      .reduce((sum, s) => {
        const isCredit = s.invoiceType === 'credit';
        const paid = !isCredit
          ? (s.amountPaid !== undefined && s.amountPaid !== null ? Number(s.amountPaid) : Number(s.grandTotal) || 0)
          : (Number(s.amountPaid) || 0);
        return sum + paid;
      }, 0);

    const khataRecoveries = periodKhataPayments
      .filter(item => matcher(item.tx))
      .reduce((sum, item) => sum + (Number(item.tx.amount) || 0), 0);

    const purchaseReversals = periodPurchaseReversals
      .filter(p => matcher(p))
      .reduce((sum, p) => sum + (Number(p.paidAmount) || 0), 0);

    const expenses = periodExpenses
      .filter(e => matcher(e))
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const supplierPayments = periodPurchases
      .filter(p => matcher(p))
      .reduce((sum, p) => sum + (Number(p.paidAmount) || 0), 0);

    const salesRefunds = periodSalesReturns
      .filter(
        r =>
          r.refundPaymentMethod !== 'Credit Adjustment' &&
          matcher({ paymentMethod: r.refundPaymentMethod, accountId: r.accountId })
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

  // Cash In Hand absorbs all transactions not tied to a configured Digital Account ID
  const cash = computeBreakdown(
    tx => !tx.accountId || !activeOnlineAccountIds.has(tx.accountId),
    openingCash
  );

  // Per-Digital Account Breakdown
  const onlineAccounts: AccountingSummary['onlineAccounts'] = configuredOnlineAccounts.map(acc => {
    const prevOnlineEntry = previousClosing?.onlineBalances?.find(b => b.accountId === acc.id);
    const openingVal = prevOnlineEntry ? Number(prevOnlineEntry.balance) || 0 : 0;
    const accBreakdown = computeBreakdown(tx => tx.accountId === acc.id, openingVal);

    return {
      accountId: acc.id,
      accountName: acc.name,
      bankType: acc.bankType,
      opening: accBreakdown.opening,
      sales: accBreakdown.sales,
      khataRecoveries: accBreakdown.khataRecoveries,
      purchaseReversals: accBreakdown.purchaseReversals,
      expenses: accBreakdown.expenses,
      supplierPayments: accBreakdown.supplierPayments,
      salesRefunds: accBreakdown.salesRefunds,
      expectedClosing: accBreakdown.expectedClosing,
    };
  });

  const emptyChannel = (): AccountBreakdown => ({
    opening: 0,
    sales: 0,
    khataRecoveries: 0,
    purchaseReversals: 0,
    expenses: 0,
    supplierPayments: 0,
    salesRefunds: 0,
    netMovement: 0,
    expectedClosing: 0,
  });

  const bank = emptyChannel();
  const jazzCash = emptyChannel();
  const easypaisa = emptyChannel();
  const card = emptyChannel();
  const other = emptyChannel();

  const openingOnlineTotal = onlineAccounts.reduce((sum, a) => sum + a.opening, 0);
  const openingGrandTotal = openingCash + openingOnlineTotal;

  const totalExpectedCash = cash.expectedClosing;
  const totalExpectedOnline = onlineAccounts.reduce((sum, a) => sum + a.expectedClosing, 0);
  const totalExpectedGrand = totalExpectedCash + totalExpectedOnline;

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
