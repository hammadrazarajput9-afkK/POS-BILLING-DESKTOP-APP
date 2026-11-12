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
  tab: 'sales' | 'inventory' | 'khata' | 'expenses' | 'activity' | 'dailyClosing' | 'purchases' | 'pnl' | 'top_products';
  dateFilter: DateFilterRange;
  data: AppData;
  categoryFilter?: string; // 'all' or specific category name
  stockStatusFilter?: 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';
  includePartyDetails?: boolean;
  includeCostValuation?: boolean;
}

/**
 * Deduplicate and clean IMEIs across single item and variants
 */
function extractUniqueImeis(item: InventoryItem): string[] {
  const rawList: string[] = [];

  // Check variants
  if (Array.isArray(item.variants) && item.variants.length > 0) {
    for (const v of item.variants) {
      if (Array.isArray(v.imeis)) {
        rawList.push(...v.imeis);
      }
    }
  }

  // Check item.imeis array
  if (Array.isArray(item.imeis)) {
    rawList.push(...item.imeis);
  }

  // Check item.imei string
  if (item.imei) {
    rawList.push(item.imei);
  }

  // Deduplicate case-insensitively and clean whitespace
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const imei of rawList) {
    if (!imei) continue;
    const clean = String(imei).trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(clean);
    }
  }

  return unique;
}

/**
 * Intelligent lookup to identify supplier / purchase party for any inventory item or IMEI
 */
function resolveItemSupplier(
  item: InventoryItem,
  data: AppData,
  imeis: string[]
): { partyName: string; billNo?: string } {
  const anyItem = item as any;
  if (anyItem.supplier) return { partyName: String(anyItem.supplier) };
  if (anyItem.partyName) return { partyName: String(anyItem.partyName) };
  if (anyItem.purchaseParty) return { partyName: String(anyItem.purchaseParty), billNo: anyItem.purchaseBillNo };

  // 1. Check permanent imeiRecords
  const imeiRecords = (data as any).imeiRecords as Array<{ imei: string; purchaseParty?: string; purchaseBillNo?: string }> | undefined;
  if (imeiRecords && Array.isArray(imeiRecords) && imeis.length > 0) {
    for (const imei of imeis) {
      const match = imeiRecords.find(r => r.imei === imei && r.purchaseParty);
      if (match?.purchaseParty) {
        return { partyName: match.purchaseParty, billNo: match.purchaseBillNo };
      }
    }
  }

  // 2. Check supplierPurchases stock inward bills
  const purchases = data.supplierPurchases || [];
  if (purchases.length > 0) {
    // Check by IMEI in purchases
    if (imeis.length > 0) {
      for (const p of purchases) {
        if (p.status === 'REVERSED') continue;
        for (const pi of (p.items || [])) {
          const piImeis = [pi.imei, ...(pi.imeis || [])].filter(Boolean);
          if (imeis.some(uImei => piImeis.includes(uImei))) {
            return { partyName: p.partyName, billNo: p.billNo };
          }
        }
      }
    }

    // Check by Item ID or Item Name
    for (const p of purchases) {
      if (p.status === 'REVERSED') continue;
      const found = (p.items || []).find(pi =>
        (pi.id && pi.id === item.id) ||
        (pi.name && pi.name.trim().toLowerCase() === item.name.trim().toLowerCase()) ||
        (pi.barcode && item.barcode && pi.barcode === item.barcode)
      );
      if (found) {
        return { partyName: p.partyName, billNo: p.billNo };
      }
    }
  }

  // 3. Check purchasesLedger entries
  const ledger = data.purchasesLedger || [];
  for (const pl of ledger) {
    if (pl.isReversed) continue;
    if (pl.itemTitle && pl.itemTitle.toLowerCase().includes(item.name.toLowerCase())) {
      const match = pl.itemTitle.match(/\(([^)]+)\)$/);
      if (match && match[1]) {
        return { partyName: match[1] };
      }
    }
  }

  return { partyName: 'Direct Stock / Opening' };
}

/**
 * Universal PDF Report Generator
 */
export async function generatePdfReport({
  tab,
  dateFilter,
  data,
  categoryFilter = 'all',
  stockStatusFilter = 'all',
  includePartyDetails = true,
  includeCostValuation = true,
}: GeneratePdfOptions): Promise<void> {
  const { start, end, label: filterLabel } = getDateFilterBounds(dateFilter);
  const isLandscape = tab === 'inventory';
  const doc = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const currency = data.settings.currency || 'Rs.';
  const shopName = (data.settings.shopName || 'FMZ FRIENDS MOBILE ZONE').toUpperCase();
  const address = data.settings.address || 'Mobile Market, Main Bazar';
  const phone = data.settings.phone || '';
  const tagline = data.settings.tagline || 'Mobile Sales, Accessories & Complete Stock Audit Suite';

  // --- HEADER SECTION ---
  // Deep Royal Navy Header Background
  doc.setFillColor(15, 23, 42); // #0f172a
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Gold / Amber Accent Stripe
  doc.setFillColor(245, 158, 11); // #f59e0b
  doc.rect(0, 27, pageWidth, 1.5, 'F');

  // Shop Name & Subtitle
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(shopName, 14, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225); // Slate 300
  doc.text(tagline, 14, 16.5);
  doc.text(`Address: ${address}  |  Ph: ${phone}`, 14, 21.5);

  // Report Tag Pill in Top Right
  const generatedAt = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  doc.setFontSize(7.5);
  doc.setTextColor(226, 232, 240);
  doc.text(`Generated: ${generatedAt}`, pageWidth - 14, 11, { align: 'right' });

  const scopeLabel = tab === 'inventory'
    ? (categoryFilter && categoryFilter !== 'all' ? `Category: ${categoryFilter.toUpperCase()}` : 'Scope: All Categories')
    : `Period: ${filterLabel}`;
  doc.text(scopeLabel, pageWidth - 14, 17, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(245, 158, 11); // Gold
  doc.text(
    tab === 'inventory' ? 'OFFICIAL INVENTORY & PARTY AUDIT' : 'CERTIFIED FINANCIAL REPORT',
    pageWidth - 14,
    23,
    { align: 'right' }
  );

  let yCursor = 36;

  // --- TAB SPECIFIC CONTENT BUILDER ---
  if (tab === 'sales') {
    // 1. Filter Sales within range
    const filteredSales = data.sales.filter(s => {
      const sDate = new Date(s.date).getTime();
      return sDate >= start.getTime() && sDate <= end.getTime();
    });

    const totalRevenue = filteredSales.reduce((acc, s) => acc + s.grandTotal, 0);
    const totalRefundedSum = filteredSales.reduce((acc, s) => acc + (s.totalRefunded || 0), 0);
    const netRevenue = Math.max(0, totalRevenue - totalRefundedSum);
    const totalCost = filteredSales.reduce((acc, s) => acc + s.totalCost, 0);
    const totalProfit = Math.max(0, netRevenue - totalCost);
    const profitMargin = netRevenue > 0 ? Math.round((totalProfit / netRevenue) * 100) : 0;

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
    doc.text(totalRefundedSum > 0 ? 'NET REVENUE (POST-RETURNS)' : 'TOTAL REVENUE', 20, yCursor + 7);
    doc.text('NET PROFIT MARGIN', 75, yCursor + 7);
    doc.text('CASH VS ONLINE', 130, yCursor + 7);
    doc.text('CREDIT/UDHARI', pageWidth - 20, yCursor + 7, { align: 'right' });

    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`${currency} ${netRevenue.toLocaleString()}`, 20, yCursor + 15);
    doc.setTextColor(16, 185, 129); // Green
    doc.text(`${currency} ${totalProfit.toLocaleString()} (${profitMargin}%)`, 75, yCursor + 15);
    doc.setTextColor(37, 99, 235); // Blue
    doc.text(`Cash: ${currency} ${cashSales.toLocaleString()} | Digital: ${currency} ${digitalSales.toLocaleString()}`, 130, yCursor + 15);
    doc.setTextColor(225, 29, 72); // Rose
    doc.text(`${currency} ${creditDue.toLocaleString()}`, pageWidth - 20, yCursor + 15, { align: 'right' });

    yCursor += 28;

    // Table of Sales
    const tableRows = filteredSales.map((s, idx) => {
      const isFullRet = s.returnStatus === 'FULL';
      const isPartRet = s.returnStatus === 'PARTIAL';
      const itemSummaries = s.items
        .map(i => `${i.name} (x${i.qty})${i.imei ? ' [IMEI: ' + i.imei + ']' : ''}${i.returnedQty ? ' (Returned: ' + i.returnedQty + ')' : ''}`)
        .join(', ');

      const cost = s.totalCost || 0;
      const netSaleVal = Math.max(0, s.grandTotal - (s.totalRefunded || 0));
      const profit = isFullRet ? 0 : Math.max(0, netSaleVal - cost);

      return [
        (idx + 1).toString(),
        new Date(s.date).toLocaleDateString() + ' ' + new Date(s.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isFullRet ? `[RETURNED] ${s.invNo}` : isPartRet ? `[PART-RET] ${s.invNo}` : s.invNo,
        s.custName || 'Walk-in Customer',
        itemSummaries || 'N/A',
        s.paymentMethod || 'Cash',
        isFullRet ? `${currency} 0 (Refunded)` : `${currency} ${netSaleVal.toLocaleString()}`,
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
    // 2. Advanced Professional Inventory & Stock Audit Report
    let targetInventory = data.inventory || [];

    // Filter by Category if specified
    if (categoryFilter && categoryFilter !== 'all') {
      targetInventory = targetInventory.filter(
        i => (i.category || '').trim().toLowerCase() === categoryFilter.trim().toLowerCase()
      );
    }

    // Filter by Stock Status if specified
    const lowStockThreshold = data.settings.lowStockThreshold || 2;
    if (stockStatusFilter === 'in_stock') {
      targetInventory = targetInventory.filter(i => (i.qty || 0) > 0);
    } else if (stockStatusFilter === 'low_stock') {
      targetInventory = targetInventory.filter(i => (i.qty || 0) > 0 && (i.qty || 0) <= lowStockThreshold);
    } else if (stockStatusFilter === 'out_of_stock') {
      targetInventory = targetInventory.filter(i => (i.qty || 0) <= 0);
    }

    const totalItemsCount = targetInventory.reduce((acc, i) => acc + (Number(i.qty) || 0), 0);
    const totalCostValue = targetInventory.reduce((acc, i) => acc + ((Number(i.costPrice) || 0) * (Number(i.qty) || 0)), 0);
    const totalRetailValue = targetInventory.reduce((acc, i) => acc + ((Number(i.salePrice) || 0) * (Number(i.qty) || 0)), 0);
    const expectedMargin = totalRetailValue - totalCostValue;
    const marginPercent = totalCostValue > 0 ? ((expectedMargin / totalCostValue) * 100).toFixed(1) : '0';

    const inStockItems = targetInventory.filter(i => (i.qty || 0) > lowStockThreshold);
    const lowStockItems = targetInventory.filter(i => (i.qty || 0) > 0 && (i.qty || 0) <= lowStockThreshold);
    const outOfStockItems = targetInventory.filter(i => (i.qty || 0) <= 0);

    // Title & Scope Row
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    const titleText = categoryFilter && categoryFilter !== 'all'
      ? `INVENTORY AUDIT: ${categoryFilter.toUpperCase()} CATEGORY`
      : 'ALL CATEGORIES INVENTORY VALUATION & STOCK AUDIT';
    doc.text(titleText, 14, yCursor);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    const filterDesc = `Filter Status: ${stockStatusFilter.toUpperCase()} | Valuation Method: FIFO / Cost Basis | Total Products: ${targetInventory.length}`;
    doc.text(filterDesc, 14, yCursor + 4.5);
    yCursor += 8;

    // --- KPI SUMMARY CARDS (5 Balanced Executive Cards across landscape 269mm width) ---
    const cardGap = 3.5;
    const totalAvailWidth = pageWidth - 28;
    const cardWidth = (totalAvailWidth - (cardGap * 4)) / 5;
    const cardHeight = 18;

    const kpiCards = [
      {
        title: 'MODELS & TOTAL UNITS',
        val: `${targetInventory.length} Items • ${totalItemsCount} Pcs`,
        sub: `In Stock: ${totalItemsCount} Units`,
        color: [30, 58, 138], // Navy
        bg: [239, 246, 255],  // Blue 50
        border: [191, 219, 254],
      },
      {
        title: 'TOTAL ASSET COST',
        val: `${currency} ${totalCostValue.toLocaleString()}`,
        sub: 'Shop Capital Invested',
        color: [15, 23, 42],  // Slate 900
        bg: [248, 250, 252],  // Slate 50
        border: [226, 232, 240],
      },
      {
        title: 'TOTAL RETAIL VALUE',
        val: `${currency} ${totalRetailValue.toLocaleString()}`,
        sub: 'Projected Gross Revenue',
        color: [14, 116, 144], // Cyan 700
        bg: [236, 254, 255],  // Cyan 50
        border: [165, 243, 252],
      },
      {
        title: 'PROJECTED MARGIN',
        val: `${currency} ${expectedMargin.toLocaleString()}`,
        sub: `Margin Ratio: +${marginPercent}%`,
        color: [16, 122, 60], // Green 700
        bg: [240, 253, 244],  // Green 50
        border: [187, 247, 208],
      },
      {
        title: 'STOCK AUDIT ALERTS',
        val: `${inStockItems.length} OK | ${lowStockItems.length} Low`,
        sub: `${outOfStockItems.length} Out of Stock Items`,
        color: outOfStockItems.length > 0 ? [190, 18, 60] : [180, 83, 9],
        bg: [255, 241, 242],  // Rose 50
        border: [254, 205, 211],
      },
    ];

    kpiCards.forEach((c, idx) => {
      const x = 14 + idx * (cardWidth + cardGap);
      doc.setDrawColor(c.border[0], c.border[1], c.border[2]);
      doc.setFillColor(c.bg[0], c.bg[1], c.bg[2]);
      doc.roundedRect(x, yCursor, cardWidth, cardHeight, 1.8, 1.8, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(71, 85, 105);
      doc.text(c.title, x + 3.5, yCursor + 4.5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(c.color[0], c.color[1], c.color[2]);
      doc.text(c.val, x + 3.5, yCursor + 10.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      doc.text(c.sub, x + 3.5, yCursor + 15);
    });

    yCursor += cardHeight + 5;

    // Build Table Rows
    const tableRows = targetInventory.map((item, idx) => {
      const stockCost = (Number(item.costPrice) || 0) * (Number(item.qty) || 0);
      const stockRetail = (Number(item.salePrice) || 0) * (Number(item.qty) || 0);

      // Extract deduplicated unique IMEIs
      const uniqueImeis = extractUniqueImeis(item);
      let imeiDisplay = '-';
      if (uniqueImeis.length === 1) {
        imeiDisplay = uniqueImeis[0];
      } else if (uniqueImeis.length > 1) {
        imeiDisplay = uniqueImeis.map((im, iIdx) => `${iIdx + 1}) ${im}`).join('\n');
      }

      // Resolve Supplier / Party Name
      const supplierInfo = resolveItemSupplier(item, data, uniqueImeis);
      const partyText = supplierInfo.billNo
        ? `${supplierInfo.partyName} (Bill #${supplierInfo.billNo})`
        : supplierInfo.partyName;

      // Status
      const statusText = (item.qty || 0) <= 0
        ? 'OUT OF STOCK'
        : (item.qty || 0) <= lowStockThreshold
          ? 'LOW STOCK'
          : 'IN STOCK';

      // Specifications
      const specs = [
        item.ram && item.storage ? `${item.ram}/${item.storage}` : (item.storage || item.ram || ''),
        item.color || '',
      ].filter(Boolean).join(' • ');

      const itemNameWithSpecs = specs ? `${item.name}\n[${specs}]` : item.name;

      return [
        (idx + 1).toString(),
        itemNameWithSpecs,
        item.category || 'General',
        partyText,
        (item.qty || 0).toString(),
        `${currency} ${(item.costPrice || 0).toLocaleString()}`,
        `${currency} ${(item.salePrice || 0).toLocaleString()}`,
        `${currency} ${stockCost.toLocaleString()}`,
        `${currency} ${stockRetail.toLocaleString()}`,
        imeiDisplay,
        statusText,
      ];
    });

    autoTable(doc, {
      startY: yCursor,
      head: [[
        '#',
        'Model Name & Specifications',
        'Category',
        'Supplier / Purchase Party',
        'Qty',
        'Cost Rate',
        'Sale Rate',
        'Stock Cost',
        'Retail Value',
        'Dedicated IMEIs / Serials',
        'Status',
      ]],
      body: tableRows,
      theme: 'grid',
      headStyles: {
        fillColor: [15, 23, 42], // Deep Slate 900
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.2,
        halign: 'left',
        cellPadding: 2.2,
      },
      styles: {
        fontSize: 6.8,
        cellPadding: 2,
        valign: 'middle',
        lineColor: [226, 232, 240],
        lineWidth: 0.15,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252], // Slate 50
      },
      columnStyles: {
        0: { cellWidth: 7, halign: 'center' },
        1: { cellWidth: 44, fontStyle: 'bold' },
        2: { cellWidth: 23 },
        3: { cellWidth: 32 },
        4: { cellWidth: 12, halign: 'center', fontStyle: 'bold' },
        5: { cellWidth: 20, halign: 'right' },
        6: { cellWidth: 20, halign: 'right' },
        7: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
        8: { cellWidth: 26, halign: 'right' },
        9: { cellWidth: 38 },
        10: { cellWidth: 21, halign: 'center', fontStyle: 'bold' },
      },
      foot: [[
        '',
        'TOTAL AUDITED VALUATION',
        `${targetInventory.length} Products`,
        'All Parties Recorded',
        `${totalItemsCount} Pcs`,
        '',
        '',
        `${currency} ${totalCostValue.toLocaleString()}`,
        `${currency} ${totalRetailValue.toLocaleString()}`,
        '',
        `${inStockItems.length} In Stock`,
      ]],
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        fontSize: 7.2,
        lineColor: [203, 213, 225],
        lineWidth: 0.2,
      },
      didParseCell: (hookData) => {
        // Highlight Status column
        if (hookData.section === 'body' && hookData.column.index === 10) {
          const val = hookData.cell.raw;
          if (val === 'IN STOCK') {
            hookData.cell.styles.textColor = [16, 122, 60]; // Green
          } else if (val === 'LOW STOCK') {
            hookData.cell.styles.textColor = [194, 65, 12]; // Amber
          } else if (val === 'OUT OF STOCK') {
            hookData.cell.styles.textColor = [225, 29, 72]; // Red
          }
        }
      },
    });

    // Signatures and Auditor Stamping
    let finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 8 : yCursor + 20;
    if (finalY > pageHeight - 35) {
      doc.addPage();
      finalY = 25;
    }

    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(14, finalY, 90, finalY);
    doc.line(pageWidth - 90, finalY, pageWidth - 14, finalY);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text('Inventory Auditor & Physical Count By', 14, finalY + 4.5);
    doc.text('Store Owner / Authorized Stamp & Sign', pageWidth - 14, finalY + 4.5, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text('FMZ Friends Mobile Zone • Computer Generated Certified Stock Record', 14, finalY + 9);

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
  } else if (tab === 'purchases') {
    // 7. Supplier Purchases & Stock Inward Ledger Report
    const filteredPurchases = (data.supplierPurchases || []).filter(p => {
      const pDate = new Date(p.date).getTime();
      return pDate >= start.getTime() && pDate <= end.getTime();
    });

    const activePurchases = filteredPurchases.filter(p => p.status !== 'REVERSED');
    const totalPurchasesCost = activePurchases.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
    const totalPaidSum = activePurchases.reduce((sum, p) => sum + (p.paidAmount || 0), 0);
    const totalBalanceDue = activePurchases.reduce((sum, p) => sum + (p.balanceDue || 0), 0);

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('SUPPLIER PURCHASES & STOCK INWARD LEDGER REPORT', 14, yCursor);
    yCursor += 6;

    // KPI Summary Box
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, yCursor, pageWidth - 28, 22, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text('TOTAL PURCHASES', 20, yCursor + 7);
    doc.text('TOTAL PAID OUTFLOW', 80, yCursor + 7);
    doc.text('PENDING SUPPLIER DUE', 140, yCursor + 7);
    doc.text('BILLS COUNT', pageWidth - 20, yCursor + 7, { align: 'right' });

    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`${currency} ${totalPurchasesCost.toLocaleString()}`, 20, yCursor + 15);
    doc.setTextColor(5, 150, 105);
    doc.text(`${currency} ${totalPaidSum.toLocaleString()}`, 80, yCursor + 15);
    doc.setTextColor(225, 29, 72);
    doc.text(`${currency} ${totalBalanceDue.toLocaleString()}`, 140, yCursor + 15);
    doc.setTextColor(37, 99, 235);
    doc.text(`${filteredPurchases.length} Inward Bills`, pageWidth - 20, yCursor + 15, { align: 'right' });

    yCursor += 28;

    const tableRows = filteredPurchases.map((p, idx) => {
      const isReversed = p.status === 'REVERSED';
      const itemSummaries = (p.items || [])
        .map(i => `${i.name} (x${i.qty}) @ ${currency} ${i.costPrice}`)
        .join(', ');

      return [
        (idx + 1).toString(),
        p.date,
        isReversed ? `[REVERSED] ${p.billNo || '-'}` : (p.billNo || '-'),
        `${p.partyName}\n${p.partyPhone || ''}`,
        itemSummaries || 'Direct Stock Inward',
        p.paymentMethod || 'Cash',
        `${currency} ${(p.totalAmount || 0).toLocaleString()}`,
        `${currency} ${(p.paidAmount || 0).toLocaleString()}`,
        isReversed ? 'REVERSED' : (p.balanceDue > 0 ? `${currency} ${p.balanceDue.toLocaleString()}` : 'Cleared'),
      ];
    });

    autoTable(doc, {
      startY: yCursor,
      head: [['#', 'Date', 'Bill #', 'Vendor / Supplier', 'Inward Products List', 'Payment', 'Bill Total', 'Amount Paid', 'Balance Due']],
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
        0: { cellWidth: 7 },
        1: { cellWidth: 18 },
        2: { cellWidth: 18 },
        3: { cellWidth: 26 },
        4: { cellWidth: 46 },
        5: { cellWidth: 16 },
        6: { cellWidth: 20, halign: 'right' },
        7: { cellWidth: 18, halign: 'right' },
        8: { cellWidth: 18, halign: 'center' },
      },
      foot: [
        ['', 'TOTALS', `${filteredPurchases.length} Bills`, '', '', '', `${currency} ${totalPurchasesCost.toLocaleString()}`, `${currency} ${totalPaidSum.toLocaleString()}`, `${currency} ${totalBalanceDue.toLocaleString()}`]
      ],
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        fontSize: 7.5,
      },
    });

  } else if (tab === 'pnl') {
    // 8. Comprehensive Profit & Loss Statement
    const filteredSales = data.sales.filter(s => {
      const sDate = new Date(s.date).getTime();
      return sDate >= start.getTime() && sDate <= end.getTime();
    });
    const filteredExpenses = data.expenses.filter(e => {
      const eDate = new Date(e.date).getTime();
      return eDate >= start.getTime() && eDate <= end.getTime();
    });

    const totalRev = filteredSales.reduce((sum, s) => sum + s.grandTotal, 0);
    const totalCogs = filteredSales.reduce((sum, s) => sum + s.totalCost, 0);
    const grossP = Math.max(0, totalRev - totalCogs);
    const totalExp = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
    const netP = grossP - totalExp;
    const margin = totalRev > 0 ? Math.round((netP / totalRev) * 100) : 0;

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('COMPREHENSIVE PROFIT & LOSS (P&L) STATEMENT', 14, yCursor);
    yCursor += 6;

    const pnlRows = [
      ['1. REVENUE', 'Total Gross Sales Invoiced', `${filteredSales.length} Invoices`, `${currency} ${totalRev.toLocaleString()}`],
      ['2. COST OF GOODS', 'Total Inventory Cost of Sold Items (COGS)', 'Wholesale Cost', `-${currency} ${totalCogs.toLocaleString()}`],
      ['3. GROSS PROFIT', 'Gross Trading Margin (Revenue - COGS)', `${totalRev > 0 ? Math.round((grossP / totalRev) * 100) : 0}% Margin`, `${currency} ${grossP.toLocaleString()}`],
      ['4. OPERATING EXPENSES', 'Shop Rents, Salaries, Utilities & Miscellaneous', `${filteredExpenses.length} Expense Logs`, `-${currency} ${totalExp.toLocaleString()}`],
      ['5. NET PROFIT', 'Final Net Business Profit / Earnings', `${margin}% Net Return`, `${currency} ${netP.toLocaleString()}`],
    ];

    autoTable(doc, {
      startY: yCursor,
      head: [['Line Item', 'Description / Account Name', 'Volume / Margin', 'Total Amount']],
      body: pnlRows,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 8,
      },
      styles: {
        fontSize: 8,
        cellPadding: 3.5,
        valign: 'middle',
      },
      columnStyles: {
        0: { cellWidth: 40, fontStyle: 'bold' },
        1: { cellWidth: 75 },
        2: { cellWidth: 35 },
        3: { cellWidth: 35, halign: 'right', fontStyle: 'bold' },
      },
    });

  } else if (tab === 'top_products') {
    // 9. Top Selling Products Report
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

    const topList = Object.values(map).sort((a, b) => b.unitsSold - a.unitsSold);

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('TOP SELLING INVENTORY PRODUCTS REPORT', 14, yCursor);
    yCursor += 6;

    const rows = topList.map((p, idx) => [
      `#${idx + 1}`,
      p.name,
      p.category,
      `${p.unitsSold} Units`,
      `${currency} ${p.totalRevenue.toLocaleString()}`,
    ]);

    autoTable(doc, {
      startY: yCursor,
      head: [['Rank', 'Product Name', 'Category', 'Units Sold', 'Revenue Generated']],
      body: rows,
      theme: 'striped',
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 8,
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 2.5,
      },
      columnStyles: {
        0: { cellWidth: 15 },
        1: { cellWidth: 80 },
        2: { cellWidth: 35 },
        3: { cellWidth: 25, halign: 'center' },
        4: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
      },
    });
  }

  // --- FOOTER SECTION (Page numbers & Branding) ---
  const pageCount = (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const footerY = pageHeight - 8;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(14, footerY - 3, pageWidth - 14, footerY - 3);

    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`FMZ Friends Mobile Zone  •  Official Certified Report  •  ${shopName}`, 14, footerY);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, footerY, { align: 'right' });
  }

  // Robust universal download trigger (Works smoothly in iframes and all browsers)
  const cleanShop = shopName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  const fileName = `${cleanShop}_${tab}_detailed_report_${new Date().toISOString().substring(0, 10)}.pdf`;

  try {
    const pdfBlob = doc.output('blob');
    const blobUrl = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
      URL.revokeObjectURL(blobUrl);
    }, 2000);
  } catch (err) {
    console.warn('Blob download fallback to direct doc.save:', err);
    doc.save(fileName);
  }
}
