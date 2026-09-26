import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AppData, SaleRecord, InventoryItem, KhataCustomer, ExpenseItem, ActivityLog } from '../types';

export type DateFilterType = 'today' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export interface DateFilterRange {
  type: DateFilterType;
  startDate?: string;
  endDate?: string;
}

export function getDateFilterBounds(range: DateFilterRange): { start: Date; end: Date; label: string } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  let label = 'Today';

  switch (range.type) {
    case 'today':
      label = `Today (${now.toLocaleDateString()})`;
      break;
    case 'weekly':
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      label = `Last 7 Days (${start.toLocaleDateString()} - ${end.toLocaleDateString()})`;
      break;
    case 'monthly':
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      label = `This Month (${start.toLocaleDateString()} - ${end.toLocaleDateString()})`;
      break;
    case 'yearly':
      start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      label = `Year ${now.getFullYear()}`;
      break;
    case 'custom':
      if (range.startDate) {
        start = new Date(range.startDate);
        start.setHours(0, 0, 0, 0);
      }
      if (range.endDate) {
        const customEnd = new Date(range.endDate);
        customEnd.setHours(23, 59, 59, 999);
        label = `Custom (${start.toLocaleDateString()} - ${customEnd.toLocaleDateString()})`;
        return { start, end: customEnd, label };
      }
      label = `Custom (From ${start.toLocaleDateString()})`;
      break;
  }

  return { start, end, label };
}

export interface GeneratePdfOptions {
  tab: 'sales' | 'inventory' | 'khata' | 'expenses' | 'activity' | 'dailyClosing';
  dateFilter: DateFilterRange;
  data: AppData;
}

/**
 * Universal PDF Report Generator
 */
export async function generatePdfReport({ tab, dateFilter, data }: GeneratePdfOptions): Promise<void> {
  const { start, end, label: filterLabel } = getDateFilterBounds(dateFilter);
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const currency = data.settings.currency || 'Rs.';
  const shopName = (data.settings.shopName || 'Mobile Shop Pro').toUpperCase();
  const address = data.settings.address || 'Mobile Market';
  const phone = data.settings.phone || '';
  const tagline = data.settings.tagline || 'Mobile POS & Repair Management Suite';

  // --- HEADER SECTION ---
  doc.setFillColor(30, 58, 138); // Deep Navy #1e3a8a
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Shop Name & Subtitle
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(shopName, 14, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(tagline, 14, 16);
  doc.text(`Address: ${address}  |  Ph: ${phone}`, 14, 21);

  // Report Tag Pill in Top Right
  const generatedAt = new Date().toLocaleString();
  doc.setFontSize(7.5);
  doc.text(`Generated: ${generatedAt}`, pageWidth - 14, 12, { align: 'right' });
  doc.text(`Period: ${filterLabel}`, pageWidth - 14, 18, { align: 'right' });

  let yCursor = 35;

  // --- TAB SPECIFIC CONTENT BUILDER ---
  if (tab === 'sales') {
    // 1. Filter Sales within range
    const filteredSales = data.sales.filter(s => {
      const sDate = new Date(s.date).getTime();
      return sDate >= start.getTime() && sDate <= end.getTime();
    });

    const totalRevenue = filteredSales.reduce((acc, s) => acc + s.grandTotal, 0);
    const totalCost = filteredSales.reduce((acc, s) => acc + s.totalCost, 0);
    const totalProfit = Math.max(0, totalRevenue - totalCost);
    const profitMargin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0;

    const cashSales = filteredSales
      .filter(s => (s.paymentMethod || 'Cash').toLowerCase() === 'cash')
      .reduce((acc, s) => acc + (s.amountPaid !== undefined ? s.amountPaid : s.grandTotal), 0);

    const digitalSales = filteredSales
      .filter(s => (s.paymentMethod || 'Cash').toLowerCase() !== 'cash')
      .reduce((acc, s) => acc + (s.amountPaid !== undefined ? s.amountPaid : s.grandTotal), 0);

    const creditDue = filteredSales
      .filter(s => s.invoiceType === 'credit')
      .reduce((acc, s) => acc + (s.amountDue || 0), 0);

    // Title
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('SALES REVENUE & PROFIT AUDIT REPORT', 14, yCursor);
    yCursor += 6;

    // KPI Summary Box
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, yCursor, pageWidth - 28, 22, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text('TOTAL REVENUE', 20, yCursor + 7);
    doc.text('NET PROFIT MARGIN', 75, yCursor + 7);
    doc.text('CASH VS ONLINE', 130, yCursor + 7);
    doc.text('CREDIT/UDHARI', pageWidth - 20, yCursor + 7, { align: 'right' });

    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`${currency} ${totalRevenue.toLocaleString()}`, 20, yCursor + 15);
    doc.setTextColor(16, 185, 129); // Green
    doc.text(`${currency} ${totalProfit.toLocaleString()} (${profitMargin}%)`, 75, yCursor + 15);
    doc.setTextColor(37, 99, 235); // Blue
    doc.text(`Cash: ${currency} ${cashSales.toLocaleString()} | Digital: ${currency} ${digitalSales.toLocaleString()}`, 130, yCursor + 15);
    doc.setTextColor(225, 29, 72); // Rose
    doc.text(`${currency} ${creditDue.toLocaleString()}`, pageWidth - 20, yCursor + 15, { align: 'right' });

    yCursor += 28;

    // Table of Sales
    const tableRows = filteredSales.map((s, idx) => {
      const itemSummaries = s.items
        .map(i => `${i.name} (x${i.qty})${i.imei ? ' [IMEI: ' + i.imei + ']' : ''}`)
        .join(', ');

      const cost = s.totalCost || 0;
      const profit = Math.max(0, s.grandTotal - cost);

      return [
        (idx + 1).toString(),
        new Date(s.date).toLocaleDateString() + ' ' + new Date(s.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        s.invNo,
        s.custName || 'Walk-in Customer',
        itemSummaries || 'N/A',
        s.paymentMethod || 'Cash',
        `${currency} ${s.grandTotal.toLocaleString()}`,
        `${currency} ${profit.toLocaleString()}`,
      ];
    });

    autoTable(doc, {
      startY: yCursor,
      head: [['#', 'Date & Time', 'Inv #', 'Customer', 'Items Sold & IMEI', 'Channel', 'Total', 'Profit']],
      body: tableRows,
      theme: 'striped',
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 7.5,
      },
      styles: {
        fontSize: 7,
        cellPadding: 2,
        valign: 'middle',
      },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 24 },
        2: { cellWidth: 16 },
        3: { cellWidth: 24 },
        4: { cellWidth: 55 },
        5: { cellWidth: 16 },
        6: { cellWidth: 20, halign: 'right' },
        7: { cellWidth: 19, halign: 'right' },
      },
      foot: [
        ['', 'TOTALS', `${filteredSales.length} Bills`, '', '', '', `${currency} ${totalRevenue.toLocaleString()}`, `${currency} ${totalProfit.toLocaleString()}`]
      ],
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        fontSize: 7.5,
      },
    });

  } else if (tab === 'inventory') {
    // 2. Inventory Stock Valuation & Health Report
    const totalItemsCount = data.inventory.reduce((acc, i) => acc + i.qty, 0);
    const totalCostValue = data.inventory.reduce((acc, i) => acc + (i.costPrice * i.qty), 0);
    const totalRetailValue = data.inventory.reduce((acc, i) => acc + (i.salePrice * i.qty), 0);
    const expectedMargin = totalRetailValue - totalCostValue;
    const lowStockThreshold = data.settings.lowStockThreshold || 2;
    const lowStockItems = data.inventory.filter(i => i.qty > 0 && i.qty <= lowStockThreshold);
    const outOfStockItems = data.inventory.filter(i => i.qty <= 0);

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('INVENTORY VALUATION & STOCK AUDIT REPORT', 14, yCursor);
    yCursor += 6;

    // KPI Summary Box
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, yCursor, pageWidth - 28, 22, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text('TOTAL ASSET VALUE (COST)', 20, yCursor + 7);
    doc.text('TOTAL RETAIL VALUE', 80, yCursor + 7);
    doc.text('PROJECTED PROFIT', 135, yCursor + 7);
    doc.text('STOCK ALERTS', pageWidth - 20, yCursor + 7, { align: 'right' });

    doc.setFontSize(11);
    doc.setTextColor(37, 99, 235);
    doc.text(`${currency} ${totalCostValue.toLocaleString()}`, 20, yCursor + 15);
    doc.setTextColor(15, 23, 42);
    doc.text(`${currency} ${totalRetailValue.toLocaleString()}`, 80, yCursor + 15);
    doc.setTextColor(16, 185, 129);
    doc.text(`${currency} ${expectedMargin.toLocaleString()}`, 135, yCursor + 15);
    doc.setTextColor(225, 29, 72);
    doc.text(`${lowStockItems.length} Low | ${outOfStockItems.length} Out`, pageWidth - 20, yCursor + 15, { align: 'right' });

    yCursor += 28;

    const tableRows = data.inventory.map((item, idx) => {
      const stockCost = item.costPrice * item.qty;
      const stockRetail = item.salePrice * item.qty;
      const imeis = [item.imei || '', ...(item.imeis || [])].filter(Boolean).join(', ');
      const status = item.qty <= 0 ? 'OUT OF STOCK' : item.qty <= lowStockThreshold ? 'LOW STOCK' : 'IN STOCK';

      return [
        (idx + 1).toString(),
        item.name,
        item.category,
        item.qty.toString(),
        `${currency} ${item.costPrice.toLocaleString()}`,
        `${currency} ${item.salePrice.toLocaleString()}`,
        `${currency} ${stockCost.toLocaleString()}`,
        `${currency} ${stockRetail.toLocaleString()}`,
        imeis || 'None',
        status,
      ];
    });

    autoTable(doc, {
      startY: yCursor,
      head: [['#', 'Item Name', 'Category', 'Qty', 'Cost', 'Sale', 'Stock Cost', 'Retail Value', 'Serial / IMEIs', 'Status']],
      body: tableRows,
      theme: 'striped',
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 7.5,
      },
      styles: {
        fontSize: 6.5,
        cellPadding: 1.8,
        valign: 'middle',
      },
      columnStyles: {
        0: { cellWidth: 7 },
        1: { cellWidth: 32 },
        2: { cellWidth: 22 },
        3: { cellWidth: 10, halign: 'center' },
        4: { cellWidth: 16, halign: 'right' },
        5: { cellWidth: 16, halign: 'right' },
        6: { cellWidth: 18, halign: 'right' },
        7: { cellWidth: 18, halign: 'right' },
        8: { cellWidth: 28 },
        9: { cellWidth: 15, halign: 'center' },
      },
      foot: [
        ['', 'TOTALS', `${data.inventory.length} Products`, `${totalItemsCount} Pcs`, '', '', `${currency} ${totalCostValue.toLocaleString()}`, `${currency} ${totalRetailValue.toLocaleString()}`, '', '']
      ],
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        fontSize: 7.5,
      },
    });

  } else if (tab === 'khata') {
    // 3. Khata Customer Credit Ledger Report
    const totalReceivables = data.khata.reduce((acc, k) => acc + (k.balance > 0 ? k.balance : 0), 0);
    const totalAdvance = data.khata.reduce((acc, k) => acc + (k.balance < 0 ? Math.abs(k.balance) : 0), 0);
    const customersWithBalance = data.khata.filter(k => k.balance > 0);

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('CUSTOMER KHATA & RECEIVABLES STATEMENT', 14, yCursor);
    yCursor += 6;

    // KPI Summary Box
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, yCursor, pageWidth - 28, 22, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text('TOTAL RECEIVABLES (UDHARI)', 20, yCursor + 7);
    doc.text('CUSTOMERS WITH BALANCE', 90, yCursor + 7);
    doc.text('ADVANCE DEPOSITS', 150, yCursor + 7);

    doc.setFontSize(11);
    doc.setTextColor(225, 29, 72); // Rose
    doc.text(`${currency} ${totalReceivables.toLocaleString()}`, 20, yCursor + 15);
    doc.setTextColor(15, 23, 42);
    doc.text(`${customersWithBalance.length} of ${data.khata.length} accounts`, 90, yCursor + 15);
    doc.setTextColor(16, 185, 129);
    doc.text(`${currency} ${totalAdvance.toLocaleString()}`, 150, yCursor + 15);

    yCursor += 28;

    const tableRows = data.khata.map((cust, idx) => {
      const history = cust.history || [];
      const totalCredit = history.filter(h => h.type === 'credit').reduce((a, b) => a + b.amount, 0);
      const totalPaid = history.filter(h => h.type === 'payment').reduce((a, b) => a + b.amount, 0);
      const lastTx = history.length > 0 ? new Date(history[history.length - 1].date).toLocaleDateString() : 'N/A';
      const status = cust.balance > 0 ? 'DUE / PENDING' : cust.balance < 0 ? 'ADVANCE' : 'CLEAR (0)';

      return [
        (idx + 1).toString(),
        cust.name,
        cust.phone || 'N/A',
        cust.address || 'N/A',
        `${currency} ${totalCredit.toLocaleString()}`,
        `${currency} ${totalPaid.toLocaleString()}`,
        `${currency} ${cust.balance.toLocaleString()}`,
        lastTx,
        status,
      ];
    });

    autoTable(doc, {
      startY: yCursor,
      head: [['#', 'Customer Name', 'Phone', 'Address / Details', 'Total Credit', 'Total Paid', 'Current Balance', 'Last Tx', 'Status']],
      body: tableRows,
      theme: 'striped',
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 7.5,
      },
      styles: {
        fontSize: 7,
        cellPadding: 2,
        valign: 'middle',
      },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 32 },
        2: { cellWidth: 22 },
        3: { cellWidth: 30 },
        4: { cellWidth: 20, halign: 'right' },
        5: { cellWidth: 20, halign: 'right' },
        6: { cellWidth: 22, halign: 'right' },
        7: { cellWidth: 16 },
        8: { cellWidth: 18, halign: 'center' },
      },
      foot: [
        ['', 'TOTALS', `${data.khata.length} Customers`, '', '', '', `${currency} ${totalReceivables.toLocaleString()}`, '', '']
      ],
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        fontSize: 7.5,
      },
    });

  } else if (tab === 'expenses') {
    // 4. Expenses Breakdown Report
    const filteredExpenses = data.expenses.filter(e => {
      const eDate = new Date(e.date).getTime();
      return eDate >= start.getTime() && eDate <= end.getTime();
    });

    const totalExpense = filteredExpenses.reduce((acc, e) => acc + e.amount, 0);

    // Group by category
    const categoryTotals: Record<string, number> = {};
    filteredExpenses.forEach(e => {
      categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
    });

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('OPERATIONAL EXPENSES AUDIT REPORT', 14, yCursor);
    yCursor += 6;

    // KPI Summary Box
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, yCursor, pageWidth - 28, 22, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text('TOTAL EXPENSES FOR PERIOD', 20, yCursor + 7);
    doc.text('EXPENSE ENTRIES', 90, yCursor + 7);
    doc.text('PRIMARY EXPENSE CATEGORY', 150, yCursor + 7);

    // Find top category
    let topCat = 'None';
    let topAmt = 0;
    Object.entries(categoryTotals).forEach(([cat, amt]) => {
      if (amt > topAmt) {
        topAmt = amt;
        topCat = cat;
      }
    });

    doc.setFontSize(11);
    doc.setTextColor(225, 29, 72);
    doc.text(`${currency} ${totalExpense.toLocaleString()}`, 20, yCursor + 15);
    doc.setTextColor(15, 23, 42);
    doc.text(`${filteredExpenses.length} Records`, 90, yCursor + 15);
    doc.setTextColor(37, 99, 235);
    doc.text(`${topCat} (${currency} ${topAmt.toLocaleString()})`, 150, yCursor + 15);

    yCursor += 28;

    const tableRows = filteredExpenses.map((exp, idx) => {
      return [
        (idx + 1).toString(),
        new Date(exp.date).toLocaleDateString(),
        exp.category,
        exp.description,
        exp.paymentMethod || 'Cash',
        exp.image ? 'Receipt Attached' : 'No Receipt',
        `${currency} ${exp.amount.toLocaleString()}`,
      ];
    });

    autoTable(doc, {
      startY: yCursor,
      head: [['#', 'Date', 'Category', 'Description', 'Paid Via', 'Proof', 'Amount']],
      body: tableRows,
      theme: 'striped',
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 7.5,
      },
      styles: {
        fontSize: 7,
        cellPadding: 2,
        valign: 'middle',
      },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 25 },
        2: { cellWidth: 35 },
        3: { cellWidth: 55 },
        4: { cellWidth: 22 },
        5: { cellWidth: 22 },
        6: { cellWidth: 21, halign: 'right' },
      },
      foot: [
        ['', 'TOTAL EXPENSES', `${filteredExpenses.length} items`, '', '', '', `${currency} ${totalExpense.toLocaleString()}`]
      ],
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        fontSize: 7.5,
      },
    });

  } else if (tab === 'activity') {
    // 5. Activity Audit Log
    const filteredActivities = (data.activities || []).filter(a => {
      const aDate = new Date(a.timestamp).getTime();
      return aDate >= start.getTime() && aDate <= end.getTime();
    });

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('SYSTEM & STAFF ACTIVITY AUDIT LOG', 14, yCursor);
    yCursor += 6;

    // KPI Summary Box
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, yCursor, pageWidth - 28, 22, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text('TOTAL AUDIT LOG ENTRIES', 20, yCursor + 7);
    doc.text('FILTER RANGE', 100, yCursor + 7);

    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`${filteredActivities.length} Actions Logged`, 20, yCursor + 15);
    doc.setTextColor(37, 99, 235);
    doc.text(filterLabel, 100, yCursor + 15);

    yCursor += 28;

    const tableRows = filteredActivities.map((act, idx) => {
      return [
        (idx + 1).toString(),
        new Date(act.timestamp).toLocaleString(),
        act.category,
        act.title,
        act.details,
      ];
    });

    autoTable(doc, {
      startY: yCursor,
      head: [['#', 'Timestamp', 'Category', 'Action / Event', 'Audit Details']],
      body: tableRows,
      theme: 'striped',
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 7.5,
      },
      styles: {
        fontSize: 7,
        cellPadding: 2,
        valign: 'middle',
      },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 35 },
        2: { cellWidth: 25 },
        3: { cellWidth: 50 },
        4: { cellWidth: 70 },
      },
      foot: [
        ['', 'TOTAL LOGS', '', `${filteredActivities.length} Events`, '']
      ],
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        fontSize: 7.5,
      },
    });
  } else if (tab === 'dailyClosing') {
    // 6. Daily Closing Reconciliation History
    const filteredClosings = (data.dailyClosings || []).filter(c => {
      const cDate = new Date(c.date).getTime();
      return cDate >= start.getTime() && cDate <= end.getTime();
    });

    const totalCashSum = filteredClosings.reduce((sum, c) => sum + (c.totalCash || 0), 0);
    const totalOnlineSum = filteredClosings.reduce((sum, c) => sum + (c.totalOnline || 0), 0);
    const grandTotalSum = filteredClosings.reduce((sum, c) => sum + (c.grandTotal || 0), 0);
    const netDifference = filteredClosings.reduce((sum, c) => sum + (c.difference || 0), 0);

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('DAILY CLOSING & CASH RECONCILIATION REPORT', 14, yCursor);
    yCursor += 6;

    // 4 KPI Summary Cards
    const cardWidth = (pageWidth - 28 - 9) / 4;
    const cardHeight = 20;

    // Card 1: Physical Cash
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, yCursor, cardWidth, cardHeight, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text('TOTAL PHYSICAL CASH', 17, yCursor + 6);
    doc.setFontSize(10);
    doc.setTextColor(5, 150, 105);
    doc.text(`${currency} ${totalCashSum.toLocaleString()}`, 17, yCursor + 14);

    // Card 2: Digital Accounts
    const card2X = 14 + cardWidth + 3;
    doc.roundedRect(card2X, yCursor, cardWidth, cardHeight, 2, 2, 'FD');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text('DIGITAL BALANCES', card2X + 3, yCursor + 6);
    doc.setFontSize(10);
    doc.setTextColor(37, 99, 235);
    doc.text(`${currency} ${totalOnlineSum.toLocaleString()}`, card2X + 3, yCursor + 14);

    // Card 3: Grand Total
    const card3X = card2X + cardWidth + 3;
    doc.roundedRect(card3X, yCursor, cardWidth, cardHeight, 2, 2, 'FD');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text('GRAND RECONCILED', card3X + 3, yCursor + 6);
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(`${currency} ${grandTotalSum.toLocaleString()}`, card3X + 3, yCursor + 14);

    // Card 4: Net Difference
    const card4X = card3X + cardWidth + 3;
    doc.roundedRect(card4X, yCursor, cardWidth, cardHeight, 2, 2, 'FD');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text('NET DIFFERENCE', card4X + 3, yCursor + 6);
    doc.setFontSize(10);
    if (netDifference === 0) {
      doc.setTextColor(5, 150, 105);
      doc.text('Balanced (0)', card4X + 3, yCursor + 14);
    } else if (netDifference > 0) {
      doc.setTextColor(37, 99, 235);
      doc.text(`+${currency} ${netDifference.toLocaleString()}`, card4X + 3, yCursor + 14);
    } else {
      doc.setTextColor(225, 29, 72);
      doc.text(`-${currency} ${Math.abs(netDifference).toLocaleString()}`, card4X + 3, yCursor + 14);
    }

    yCursor += 26;

    const tableRows = filteredClosings.map((c, idx) => {
      const diffStr =
        c.difference === undefined || c.difference === 0
          ? 'Matched'
          : c.difference > 0
          ? `+${currency} ${c.difference.toLocaleString()}`
          : `-${currency} ${Math.abs(c.difference).toLocaleString()}`;

      return [
        (idx + 1).toString(),
        `${c.date}\n${c.time || ''}`,
        c.closedBy || 'Cashier',
        `${currency} ${(c.totalCash || 0).toLocaleString()}`,
        `${currency} ${(c.totalOnline || 0).toLocaleString()}`,
        `${currency} ${(c.grandTotal || 0).toLocaleString()}`,
        diffStr,
        c.notes || '-',
      ];
    });

    autoTable(doc, {
      startY: yCursor,
      head: [['#', 'Date & Time', 'Staff', 'Physical Cash', 'Digital', 'Grand Total', 'Difference', 'Closing Notes']],
      body: tableRows,
      theme: 'striped',
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 7.5,
      },
      styles: {
        fontSize: 7,
        cellPadding: 2.2,
        valign: 'middle',
      },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 24 },
        2: { cellWidth: 24 },
        3: { cellWidth: 26, halign: 'right' },
        4: { cellWidth: 24, halign: 'right' },
        5: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
        6: { cellWidth: 22, halign: 'center' },
        7: { cellWidth: 32 },
      },
      foot: [
        [
          '',
          'TOTALS',
          `${filteredClosings.length} Records`,
          `${currency} ${totalCashSum.toLocaleString()}`,
          `${currency} ${totalOnlineSum.toLocaleString()}`,
          `${currency} ${grandTotalSum.toLocaleString()}`,
          netDifference === 0 ? 'Matched' : `${currency} ${netDifference.toLocaleString()}`,
          '',
        ],
      ],
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        fontSize: 7.5,
      },
    });
  }

  // --- FOOTER SECTION (Page numbers & Branding) ---
  const pageCount = (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.line(14, 285, pageWidth - 14, 285);

    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`Mobile POS Pro  •  Confidential Business Report  •  ${shopName}`, 14, 290);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, 290, { align: 'right' });
  }

  // Trigger download with sanitized filename
  const cleanShop = shopName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  const fileName = `${cleanShop}_${tab}_report_${new Date().toISOString().substring(0, 10)}.pdf`;
  doc.save(fileName);
}
