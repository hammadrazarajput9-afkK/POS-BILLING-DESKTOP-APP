import { SaleRecord, ShopSettings } from '../types';

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = String(text || '').split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (!word) continue;
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      if (ctx.measureText(word).width > maxWidth) {
        let chunk = '';
        for (const ch of word) {
          if (ctx.measureText(chunk + ch).width > maxWidth && chunk) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk += ch;
          }
        }
        current = chunk;
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

function loadImageSafe(src?: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), 2000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export async function generateInvoicePreviewImage(
  sale: SaleRecord,
  settings: ShopSettings
): Promise<{ blob: Blob; dataUrl: string; fileName: string }> {
  const scale = 2;
  const W = 720;
  const pad = 28;
  const innerW = W - pad * 2;
  const currency = settings.currency || 'Rs.';

  const grandTotal = sale.grandTotal || 0;
  const prevBalance = Math.max(0, sale.previousBalance || 0);
  const combinedTotal = grandTotal + prevBalance;
  const amountPaid = sale.amountPaid !== undefined ? sale.amountPaid : grandTotal;
  const amountDue =
    sale.amountDue !== undefined ? sale.amountDue : Math.max(0, grandTotal - amountPaid);
  const netBalanceDue = Math.max(0, combinedTotal - amountPaid);
  const totalQty = (sale.items || []).reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
  const totalItemsCount = (sale.items || []).length;
  const isFullyPaid = netBalanceDue <= 0;
  const isPartial = !isFullyPaid && amountPaid > 0;
  const statusLabel = isFullyPaid ? 'PAID' : isPartial ? 'PARTIAL' : 'UNPAID KHATA';
  const statusColor = isFullyPaid ? '#059669' : isPartial ? '#d97706' : '#e11d48';

  const logoSrc = settings.invoiceLogo || settings.shopLogo || settings.logo;
  const logoImg = await loadImageSafe(logoSrc);

  // Measure canvas height dynamically before rendering
  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d')!;

  const returnPolicyText = (settings.returnPolicy || '').trim();
  const receiptFooterText = (settings.receiptFooter || '').trim();
  const footerNoteLines = Array.from(
    new Set([returnPolicyText, receiptFooterText].filter(Boolean))
  );
  if (footerNoteLines.length === 0) footerNoteLines.push('Thank you for your business!');

  // Compute exact content height
  let calcH = 0;
  calcH += 24; // Top padding
  calcH += 88; // Header band (logo + shop name + address + badge)
  calcH += 16;

  // Customer info box height
  let metaLinesCount = 2; // Invoice # + Customer
  if (sale.custPhone || sale.retailerShopName) metaLinesCount += 1;
  if (sale.retailerCity || sale.retailerNtn) metaLinesCount += 1;
  calcH += 22 + metaLinesCount * 22 + 16;

  // Items header row
  calcH += 34;

  // Each item height
  const itemMetrics = sale.items.map(item => {
    mctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const nameLines = wrapTextLines(mctx, item.name, innerW - 140);
    mctx.font = '500 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const imeiLines = item.imei ? wrapTextLines(mctx, `IMEI: ${item.imei}`, innerW - 30) : [];
    const hasBoxes = Boolean(item.boxCount && item.boxCount > 0);
    const blockH =
      12 +
      nameLines.length * 20 +
      20 + // price line directly under name: Qty x Price
      (hasBoxes ? 18 : 0) +
      imeiLines.length * 17 +
      10;
    return { item, nameLines, imeiLines, hasBoxes, blockH };
  });

  calcH += itemMetrics.reduce((acc, m) => acc + m.blockH, 0);
  calcH += 16;

  // Totals box height directly under items
  let totalRows = 3; // Total Quantity + Subtotal + Grand Total / Current Bill
  if (sale.discount > 0) totalRows += 1;
  if (prevBalance > 0) totalRows += 2; // Previous Balance + Total Payable
  totalRows += 1; // Paid row
  if (netBalanceDue > 0) totalRows += 1;
  calcH += 24 + totalRows * 28 + 20;

  // Notes box height
  let noteLines: string[] = [];
  if (sale.notes) {
    mctx.font = '600 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    noteLines = wrapTextLines(mctx, `Note: ${sale.notes}`, innerW - 28);
    calcH += 24 + noteLines.length * 19 + 14;
  }

  // Footer height
  calcH += 24 + footerNoteLines.length * 18 + 26;

  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = calcH * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  // Outer soft card background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, calcH);

  // Top accent bar
  ctx.fillStyle = sale.saleMode === 'wholesale' ? '#6d28d9' : '#1d4ed8';
  ctx.fillRect(0, 0, W, 8);

  let y = 26;

  // Header Section
  if (logoImg) {
    ctx.save();
    drawRoundedRect(ctx, pad, y, 64, 64, 32);
    ctx.clip();
    ctx.drawImage(logoImg, pad, y, 64, 64);
    ctx.restore();
  } else {
    ctx.fillStyle = '#1d4ed8';
    drawRoundedRect(ctx, pad, y, 60, 60, 30);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText((settings.shopName || 'FMZ').slice(0, 2).toUpperCase(), pad + 30, y + 38);
    ctx.textAlign = 'left';
  }

  const textStartX = pad + 78;
  ctx.fillStyle = '#0f172a';
  ctx.font = '900 22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText((settings.shopName || 'FMZ MOBILE').toUpperCase(), textStartX, y + 24);

  ctx.fillStyle = '#475569';
  ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  if (settings.address) {
    ctx.fillText(settings.address.slice(0, 56), textStartX, y + 44);
  }
  if (settings.phone) {
    ctx.fillText(`Ph: ${settings.phone}`, textStartX, y + 62);
  }

  // Right status badges
  ctx.font = '900 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const badgeW = ctx.measureText(statusLabel).width + 22;
  ctx.fillStyle = statusColor;
  drawRoundedRect(ctx, W - pad - badgeW, y + 4, badgeW, 26, 13);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(statusLabel, W - pad - badgeW / 2, y + 21);

  if (sale.saleMode === 'wholesale') {
    const wsText = 'WHOLESALE B2B';
    const wsW = ctx.measureText(wsText).width + 18;
    ctx.fillStyle = '#f3e8ff';
    drawRoundedRect(ctx, W - pad - wsW, y + 36, wsW, 22, 8);
    ctx.fill();
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#6b21a8';
    ctx.fillText(wsText, W - pad - wsW / 2, y + 51);
  }
  ctx.textAlign = 'left';

  y += 84;

  // Customer & Invoice Info Card
  const metaCardH = 18 + metaLinesCount * 22;
  ctx.fillStyle = '#f8fafc';
  drawRoundedRect(ctx, pad, y, innerW, metaCardH, 12);
  ctx.fill();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.stroke();

  let my = y + 24;
  ctx.fillStyle = '#0f172a';
  ctx.font = '800 15px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(`Invoice #${sale.invNo}`, pad + 14, my);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#475569';
  ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const dt = new Date(sale.date);
  ctx.fillText(
    `${dt.toLocaleDateString()} • ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    W - pad - 14,
    my
  );
  ctx.textAlign = 'left';

  my += 22;
  ctx.fillStyle = '#334155';
  ctx.font = '700 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(`Customer: ${sale.custName || 'Walk-in Customer'}`, pad + 14, my);

  if (sale.custPhone || sale.retailerShopName) {
    my += 22;
    ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const leftText = sale.custPhone ? `Phone: ${sale.custPhone}` : '';
    const rightText = sale.retailerShopName ? `Shop: ${sale.retailerShopName}` : '';
    if (leftText) ctx.fillText(leftText, pad + 14, my);
    if (rightText) {
      ctx.textAlign = 'right';
      ctx.fillText(rightText, W - pad - 14, my);
      ctx.textAlign = 'left';
    }
  }

  if (sale.retailerCity || sale.retailerNtn) {
    my += 22;
    ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const info = [
      sale.retailerCity ? `City: ${sale.retailerCity}` : '',
      sale.retailerNtn ? `NTN/GST: ${sale.retailerNtn}` : '',
    ]
      .filter(Boolean)
      .join('   •   ');
    ctx.fillText(info, pad + 14, my);
  }

  y += metaCardH + 16;

  // Items Table Header
  ctx.fillStyle = '#f1f5f9';
  drawRoundedRect(ctx, pad, y, innerW, 30, 8);
  ctx.fill();
  ctx.fillStyle = '#475569';
  ctx.font = '800 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText('PRODUCT & UNIT PRICE', pad + 12, y + 20);
  ctx.textAlign = 'right';
  ctx.fillText('TOTAL', W - pad - 12, y + 20);
  ctx.textAlign = 'left';
  y += 34;

  // Item Rows (Product Name + Price underneath + Total right-aligned)
  itemMetrics.forEach((m, idx) => {
    const { item, nameLines, imeiLines, hasBoxes, blockH } = m;
    let iy = y + 18;

    ctx.fillStyle = '#0f172a';
    ctx.font = '800 15.5px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    nameLines.forEach(nl => {
      ctx.fillText(nl, pad + 10, iy);
      iy += 20;
    });

    // Price directly underneath product name
    ctx.fillStyle = '#475569';
    ctx.font = '700 13.5px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(
      `${item.qty} ${item.qty === 1 ? 'pc' : 'pcs'} × ${currency} ${item.salePrice.toLocaleString()}`,
      pad + 10,
      iy
    );
    iy += 20;

    if (hasBoxes) {
      ctx.fillStyle = '#7e22ce';
      ctx.font = '700 12.5px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillText(`Boxes/Cartons: ${item.boxCount}`, pad + 10, iy);
      iy += 18;
    }

    if (imeiLines.length > 0) {
      ctx.fillStyle = '#1d4ed8';
      ctx.font = '600 12.5px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      imeiLines.forEach(il => {
        ctx.fillText(il, pad + 10, iy);
        iy += 17;
      });
    }

    // Line Total on Right
    ctx.textAlign = 'right';
    ctx.fillStyle = '#0f172a';
    ctx.font = '900 16px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(`${currency} ${(item.salePrice * item.qty).toLocaleString()}`, W - pad - 10, y + 22);
    ctx.textAlign = 'left';

    if (idx < itemMetrics.length - 1) {
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad + 8, y + blockH);
      ctx.lineTo(W - pad - 8, y + blockH);
      ctx.stroke();
    }

    y += blockH;
  });

  y += 14;

  // Financial Summary Directly Underneath Items (NO Wholesale Saving line)
  const summaryH = 22 + totalRows * 28;
  ctx.fillStyle = '#f8fafc';
  drawRoundedRect(ctx, pad, y, innerW, summaryH, 12);
  ctx.fill();
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.stroke();

  let sy = y + 24;
  ctx.fillStyle = '#334155';
  ctx.font = '800 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(`Total Quantity (${totalItemsCount} ${totalItemsCount === 1 ? 'item' : 'items'}):`, pad + 16, sy);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#0f172a';
  ctx.fillText(`${totalQty} ${totalQty === 1 ? 'pc' : 'pcs'}`, W - pad - 16, sy);
  ctx.textAlign = 'left';
  sy += 26;

  ctx.fillStyle = '#475569';
  ctx.font = '700 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText('Subtotal:', pad + 16, sy);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#0f172a';
  ctx.fillText(`${currency} ${sale.subtotal.toLocaleString()}`, W - pad - 16, sy);
  ctx.textAlign = 'left';
  sy += 26;

  if (sale.discount > 0) {
    ctx.fillStyle = '#059669';
    ctx.font = '700 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText('Discount:', pad + 16, sy);
    ctx.textAlign = 'right';
    ctx.fillText(`-${currency} ${sale.discount.toLocaleString()}`, W - pad - 16, sy);
    ctx.textAlign = 'left';
    sy += 26;
  }

  // Grand Total / Current Bill & Previous Balance Rows
  ctx.strokeStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.moveTo(pad + 14, sy - 14);
  ctx.lineTo(W - pad - 14, sy - 14);
  ctx.stroke();

  if (prevBalance > 0) {
    ctx.fillStyle = '#0f172a';
    ctx.font = '800 15px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText('Current Bill:', pad + 16, sy + 2);
    ctx.textAlign = 'right';
    ctx.fillText(`${currency} ${grandTotal.toLocaleString()}`, W - pad - 16, sy + 2);
    ctx.textAlign = 'left';
    sy += 26;

    ctx.fillStyle = '#b45309';
    ctx.font = '800 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText('Previous Balance:', pad + 16, sy + 2);
    ctx.textAlign = 'right';
    ctx.fillText(`+${currency} ${prevBalance.toLocaleString()}`, W - pad - 16, sy + 2);
    ctx.textAlign = 'left';
    sy += 26;

    ctx.fillStyle = '#0f172a';
    ctx.font = '900 18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText('TOTAL PAYABLE:', pad + 16, sy + 4);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#1d4ed8';
    ctx.fillText(`${currency} ${combinedTotal.toLocaleString()}`, W - pad - 16, sy + 4);
    ctx.textAlign = 'left';
    sy += 30;
  } else {
    ctx.fillStyle = '#0f172a';
    ctx.font = '900 18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText('GRAND TOTAL:', pad + 16, sy + 4);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#1d4ed8';
    ctx.fillText(`${currency} ${grandTotal.toLocaleString()}`, W - pad - 16, sy + 4);
    ctx.textAlign = 'left';
    sy += 30;
  }

  ctx.fillStyle = '#047857';
  ctx.font = '700 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(`Paid (${sale.paymentMethod || 'Cash'}):`, pad + 16, sy);
  ctx.textAlign = 'right';
  ctx.fillText(`${currency} ${amountPaid.toLocaleString()}`, W - pad - 16, sy);
  ctx.textAlign = 'left';

  if (netBalanceDue > 0) {
    sy += 26;
    ctx.fillStyle = '#dc2626';
    ctx.font = '900 15px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(prevBalance > 0 ? 'Net Balance Due:' : 'Remaining Balance Due:', pad + 16, sy);
    ctx.textAlign = 'right';
    ctx.fillText(`${currency} ${netBalanceDue.toLocaleString()}`, W - pad - 16, sy);
    ctx.textAlign = 'left';
  }

  y += summaryH + 14;

  // Notes Box
  if (noteLines.length > 0) {
    const nh = 16 + noteLines.length * 19;
    ctx.fillStyle = '#fffbeb';
    drawRoundedRect(ctx, pad, y, innerW, nh, 10);
    ctx.fill();
    ctx.strokeStyle = '#fde68a';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#92400e';
    ctx.font = '700 13.5px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    let ny = y + 20;
    noteLines.forEach(nl => {
      ctx.fillText(nl, pad + 12, ny);
      ny += 19;
    });
    y += nh + 12;
  }

  // Footer
  ctx.strokeStyle = '#cbd5e1';
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(W - pad, y);
  ctx.stroke();
  ctx.setLineDash([]);

  let fy = y + 20;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#64748b';
  ctx.font = 'italic 600 12.5px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  footerNoteLines.forEach(fl => {
    ctx.fillText(fl.slice(0, 75), W / 2, fy);
    fy += 18;
  });

  const dataUrl = canvas.toDataURL('image/png');
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => {
      if (b) resolve(b);
      else reject(new Error('Could not generate invoice image'));
    }, 'image/png');
  });

  const safeInv = (sale.invNo || 'Invoice').replace(/[^a-zA-Z0-9_-]/g, '_');
  return {
    blob,
    dataUrl,
    fileName: `Invoice_${safeInv}.png`,
  };
}
