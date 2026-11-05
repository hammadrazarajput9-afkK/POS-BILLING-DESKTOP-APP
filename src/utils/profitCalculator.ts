import { SaleRecord, SalesReturnRecord, ExpenseItem } from '../types';

export interface ProfitCalculationResult {
  grossSales: number;           // Gross revenue before discount
  totalDiscounts: number;       // Discounts given
  netSalesBeforeReturns: number;// Gross Sales - Discounts (total invoice grandTotal)
  totalSalesRefunds: number;    // Sales returns refunds
  netSales: number;             // Net Sales = Gross Sales - Discounts - Returns
  grossCOGS: number;            // Cost of goods sold before returns
  costReversedFromReturns: number; // Cost restored back into inventory from returns
  netCOGS: number;              // Net COGS = grossCOGS - costReversedFromReturns
  grossProfit: number;          // Gross Profit = Net Sales - Net COGS
  operatingExpenses: number;    // Operating expenses (shop rent, utilities, tea, etc.)
  netProfit: number;            // Net Profit = Gross Profit - Operating Expenses
  netMarginPercent: number;     // (Net Profit / Net Sales) * 100
}

/**
 * Standardized Profit Engine for Mobile POS Pro.
 * Audited Formula:
 * Gross Sales - Discounts = Net Sales (before returns)
 * Net Sales - Sales Returns = Final Net Sales
 * Cost of Goods Sold - Returned Stock Cost = Net COGS
 * Net Sales - Net COGS = Gross Profit
 * Gross Profit - Operating Expenses = Net Profit
 * 
 * Rules:
 * - Sales returns reduce sales revenue.
 * - Returned stock restores inventory and reverses COGS.
 * - Discounts are subtracted properly.
 * - Purchases are NOT operating expenses (they are asset/stock inward).
 * - Expenses are strictly operational costs and not double counted.
 */
export function calculateAuditedProfit({
  sales = [],
  returns = [],
  expenses = [],
}: {
  sales: SaleRecord[];
  returns?: SalesReturnRecord[];
  expenses?: ExpenseItem[];
}): ProfitCalculationResult {
  let grossSales = 0;
  let totalDiscounts = 0;
  let netSalesBeforeReturns = 0;
  let grossCOGS = 0;

  sales.forEach(sale => {
    const sub = Number(sale.subtotal) || Number(sale.grandTotal) || 0;
    const disc = Number(sale.discount) || 0;
    const grand = Number(sale.grandTotal) || (sub - disc);
    const cost = Number(sale.totalCost) || 0;

    grossSales += sub;
    totalDiscounts += disc;
    netSalesBeforeReturns += grand;
    grossCOGS += cost;
  });

  const totalSalesRefunds = (returns || []).reduce(
    (sum, r) => sum + (Number(r.totalRefundAmount) || 0),
    0
  );

  const costReversedFromReturns = (returns || []).reduce(
    (sum, r) => sum + (Number(r.totalCostReversed) || 0),
    0
  );

  const netSales = Math.max(0, netSalesBeforeReturns - totalSalesRefunds);
  const netCOGS = Math.max(0, grossCOGS - costReversedFromReturns);
  const grossProfit = Math.max(0, netSales - netCOGS);

  const operatingExpenses = (expenses || []).reduce(
    (sum, e) => sum + (Number(e.amount) || 0),
    0
  );

  const netProfit = grossProfit - operatingExpenses;
  const netMarginPercent = netSales > 0 ? Math.round((netProfit / netSales) * 100) : 0;

  return {
    grossSales,
    totalDiscounts,
    netSalesBeforeReturns,
    totalSalesRefunds,
    netSales,
    grossCOGS,
    costReversedFromReturns,
    netCOGS,
    grossProfit,
    operatingExpenses,
    netProfit,
    netMarginPercent,
  };
}
