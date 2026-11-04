import { AppData, DailyClosingRecord, OnlineAccount, SaleRecord, KhataTransaction, ExpenseItem, SupplierPurchase } from '../types';

export type AccountChannel = 'Cash' | 'Bank' | 'JazzCash' | 'Easypaisa' | 'Card' | 'Other';

/**
 * Normalizes payment method string to standard AccountChannel without text guessing
 */
export function normalizePaymentChannel(pm?: string): AccountChannel {
  if (!pm) return 'Cash';
  const clean = pm.trim().toLowerCase();
  if (clean === 'cash' || clean === 'cash drawer') return 'Cash';
  if (clean === 'bank' || clean === 'bank transfer' || clean === 'meezan bank' || clean === 'cheque') return 'Bank';
  if (clean === 'jazzcash') return 'JazzCash';
  if (clean === 'easypaisa') return 'Easypaisa';
  if (clean === 'card' || clean === 'credit card' || clean === 'debit card') return 'Card';
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

  // 2. Opening Online Balances
  const openingOnlineMap = new Map<string, number>();
  if (previousClosing && Array.isArray(previousClosing.onlineBalances)) {
    previousClosing.onlineBalances.forEach(b => {
      openingOnlineMap.set(b.accountId, Number(b.balance) || 0);
    });
  }

  // 3. Filter period transactions
  const periodSales = (data.sales || []).filter(s =>
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

  // Helper to check account matching for general channel breakdown
  const matchesChannel = (pm?: string, targetChannel: AccountChannel = 'Cash'): boolean => {
    return normalizePaymentChannel(pm) === targetChannel;
  };

  // Helper to check online account matching (exact accountId or legacy single fallback)
  const matchesAccount = (
    tx: { paymentMethod?: string; accountId?: string },
    accId: string,
    accChannel: AccountChannel,
    onlineAccountsList: OnlineAccount[]
  ): boolean => {
    if (normalizePaymentChannel(tx.paymentMethod) !== accChannel) return false;
    if (tx.accountId) {
      return tx.accountId === accId;
    }
    // Legacy fallback: if tx has no accountId, attribute to this account if it's the only one of this channel
    const sameChannelAccounts = onlineAccountsList.filter(a => normalizePaymentChannel(a.bankType || a.name) === accChannel);
    return sameChannelAccounts.length === 1 && sameChannelAccounts[0].id === accId;
  };

  const allOnlineAccounts = data.onlineAccounts || [];

  // Channel Accumulator Helper
  const createChannelBreakdown = (channel: AccountChannel, openingVal: number = 0): AccountBreakdown => {
    const isChannelAccount = (tx: { paymentMethod?: string; accountId?: string }) => {
      if (!matchesChannel(tx.paymentMethod, channel)) return false;
      // If channel is Cash or Card or Other, aggregate all matching
      if (channel === 'Cash' || channel === 'Card' || channel === 'Other') return true;
      // For Bank, JazzCash, Easypaisa, if online accounts are defined, ensure we don't double count items explicitly assigned to an online account unless this channel breakdown represents unassigned or general channel
      if (tx.accountId && allOnlineAccounts.some(a => a.id === tx.accountId)) {
        const assignedAcc = allOnlineAccounts.find(a => a.id === tx.accountId);
        return normalizePaymentChannel(assignedAcc?.bankType || assignedAcc?.name) === channel;
      }
      return true;
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

    // Sales return refund outflow
    const salesRefunds = periodSalesReturns
      .filter(r => isChannelAccount({ paymentMethod: r.refundPaymentMethod, accountId: r.accountId }))
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

  // Find opening for major digital channels from previous closing
  const getOpeningForChannel = (channel: AccountChannel): number => {
    if (!previousClosing || !previousClosing.onlineBalances) return 0;
    return previousClosing.onlineBalances
      .filter(b => {
        const acc = allOnlineAccounts.find(a => a.id === b.accountId);
        const channelOfAcc = acc ? normalizePaymentChannel(acc.bankType || acc.name) : normalizePaymentChannel(b.accountName);
        return channelOfAcc === channel;
      })
      .reduce((sum, b) => sum + (Number(b.balance) || 0), 0);
  };

  const cash = createChannelBreakdown('Cash', openingCash);
  const bank = createChannelBreakdown('Bank', getOpeningForChannel('Bank'));
  const jazzCash = createChannelBreakdown('JazzCash', getOpeningForChannel('JazzCash'));
  const easypaisa = createChannelBreakdown('Easypaisa', getOpeningForChannel('Easypaisa'));
  const card = createChannelBreakdown('Card', getOpeningForChannel('Card'));
  const other = createChannelBreakdown('Other', getOpeningForChannel('Other'));

  // Online Accounts Detailed Breakdown
  const onlineAccounts = allOnlineAccounts.map(acc => {
    const opening = openingOnlineMap.get(acc.id) ?? 0;
    const channel = normalizePaymentChannel(acc.bankType || acc.name);

    const sales = periodSales
      .filter(s => matchesAccount(s, acc.id, channel, allOnlineAccounts))
      .reduce((sum, s) => {
        const isCredit = s.invoiceType === 'credit';
        const paid = !isCredit
          ? (s.amountPaid !== undefined && s.amountPaid !== null ? Number(s.amountPaid) : Number(s.grandTotal) || 0)
          : (Number(s.amountPaid) || 0);
        return sum + paid;
      }, 0);

    const khataRecoveries = periodKhataPayments
      .filter(item => matchesAccount(item.tx, acc.id, channel, allOnlineAccounts))
      .reduce((sum, item) => sum + (Number(item.tx.amount) || 0), 0);

    const purchaseReversals = periodPurchaseReversals
      .filter(p => matchesAccount(p, acc.id, channel, allOnlineAccounts))
      .reduce((sum, p) => sum + (Number(p.paidAmount) || 0), 0);

    const expenses = periodExpenses
      .filter(e => matchesAccount(e, acc.id, channel, allOnlineAccounts))
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const supplierPayments = periodPurchases
      .filter(p => matchesAccount(p, acc.id, channel, allOnlineAccounts))
      .reduce((sum, p) => sum + (Number(p.paidAmount) || 0), 0);

    const salesRefunds = periodSalesReturns
      .filter(r => matchesAccount({ paymentMethod: r.refundPaymentMethod, accountId: r.accountId }, acc.id, channel, allOnlineAccounts))
      .reduce((sum, r) => sum + (Number(r.totalRefundAmount) || 0), 0);

    const netMovement = sales + khataRecoveries + purchaseReversals - expenses - supplierPayments - salesRefunds;
    const expectedClosing = opening + netMovement;

    return {
      accountId: acc.id,
      accountName: acc.name,
      bankType: acc.bankType,
      opening,
      sales,
      khataRecoveries,
      purchaseReversals,
      expenses,
      supplierPayments,
      salesRefunds,
      expectedClosing,
    };
  });

  const openingOnlineTotal = allOnlineAccounts.reduce(
    (sum, acc) => sum + (openingOnlineMap.get(acc.id) ?? 0),
    0
  );
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
