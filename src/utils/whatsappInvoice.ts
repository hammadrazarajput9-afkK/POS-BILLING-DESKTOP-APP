/**
 * WhatsApp Direct Invoice Sharing Helper
 * Formats rich, itemized bill text and opens WhatsApp chat via wa.me API
 */

import { SaleRecord, ShopSettings } from '../types';

/**
 * Sanitizes phone number to international WhatsApp format (e.g. 03001234567 -> 923001234567)
 */
export function formatPhoneNumberForWhatsApp(phoneStr?: string): string {
  if (!phoneStr) return '';
  const digits = phoneStr.replace(/[^0-9]/g, '');
  if (!digits) return '';

  // If local Pakistani format starting with 03xx
  if (digits.startsWith('03') && digits.length === 11) {
    return '92' + digits.substring(1);
  }
  // If local Pakistani without leading 0 (3001234567)
  if (digits.startsWith('3') && digits.length === 10) {
    return '92' + digits;
  }
  // If already prefixed with 923xx
  if (digits.startsWith('92') && digits.length === 12) {
    return digits;
  }
  // If international starting with + or 00
  return digits;
}

/**
 * Generates formatted invoice summary text for WhatsApp
 */
export function generateWhatsAppInvoiceText(sale: SaleRecord, settings: ShopSettings): string {
  const cur = settings.currency || 'Rs.';
  const grandTotal = sale.grandTotal || 0;
  const amountPaid = sale.amountPaid !== undefined ? sale.amountPaid : grandTotal;
  const amountDue = sale.amountDue !== undefined ? sale.amountDue : Math.max(0, grandTotal - amountPaid);
  const isPaid = amountDue <= 0;
  const isWholesale = sale.saleMode === 'wholesale';

  const statusEmoji = isPaid ? '✅ PAID' : amountPaid > 0 ? '⚠️ PARTIAL' : '🔴 UNPAID KHATA';
  const headerTitle = isWholesale ? `🏬 *WHOLESALE B2B INVOICE*` : `🧾 *${(settings.shopName || 'MOBILE SHOP').toUpperCase()}*`;

  const lines = [
    headerTitle,
    isWholesale ? `🏪 *Supplier:* ${settings.shopName || 'FMZ Friends Mobile Zone'}` : '',
    settings.tagline ? `_${settings.tagline}_` : '',
    settings.address ? `📍 ${settings.address}` : '',
    settings.phone ? `📞 ${settings.phone}` : '',
    `━━━━━━━━━━━━━━━━━━━━`,
    `📄 *Invoice #:* ${sale.invNo}`,
    `📅 *Date:* ${new Date(sale.date).toLocaleDateString()} ${new Date(sale.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    `👤 *Customer / Retailer:* ${sale.custName || 'Valued Buyer'}`,
    sale.retailerShopName ? `🏢 *Shop Name:* ${sale.retailerShopName}` : '',
    sale.retailerCity ? `🌆 *City:* ${sale.retailerCity}` : '',
    sale.retailerNtn ? `🆔 *NTN/GST:* ${sale.retailerNtn}` : '',
    sale.custPhone ? `📞 *Phone:* ${sale.custPhone}` : '',
    `💳 *Status:* ${statusEmoji}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📦 *${isWholesale ? 'WHOLESALE BULK ITEMS:' : 'ITEMS PURCHASED:'}*`,
    ...sale.items.map((item, idx) => {
      let itemLine = `${idx + 1}. *${item.name}*\n   Qty: ${item.qty} × ${cur} ${item.salePrice.toLocaleString()} = *${cur} ${(item.salePrice * item.qty).toLocaleString()}*`;
      if (item.boxCount && item.boxCount > 0) {
        itemLine += ` (📦 ${item.boxCount} Cartons/Boxes)`;
      }
      if (item.imei) {
        itemLine += `\n   📱 IMEI: \`${item.imei}\``;
      }
      return itemLine;
    }),
    `━━━━━━━━━━━━━━━━━━━━`,
    `💰 *Subtotal:* ${cur} ${sale.subtotal.toLocaleString()}`,
    sale.wholesaleSavings && sale.wholesaleSavings > 0 ? `🎉 *Wholesale B2B Savings:* *${cur} ${sale.wholesaleSavings.toLocaleString()}*` : '',
    sale.discount > 0 ? `🎁 *Discount / Tier:* -${cur} ${sale.discount.toLocaleString()}` : '',
    `⭐ *GRAND TOTAL:* *${cur} ${grandTotal.toLocaleString()}*`,
    `💵 *Paid Amount:* ${cur} ${amountPaid.toLocaleString()} (${sale.paymentMethod || 'Cash'})`,
    amountDue > 0 ? `⚠️ *Remaining Balance:* *${cur} ${amountDue.toLocaleString()}*` : '',
    `━━━━━━━━━━━━━━━━━━━━`,
    settings.returnPolicy || settings.receiptFooter || '🙏 Thank you for your B2B partnership!',
    `_Note: B2B Wholesale terms apply. Please retain for warranty claims._`,
  ].filter(Boolean);

  return lines.join('\n');
}

/**
 * Opens WhatsApp directly with formatted invoice
 */
export function shareInvoiceOnWhatsApp(sale: SaleRecord, settings: ShopSettings): void {
  const text = generateWhatsAppInvoiceText(sale, settings);
  const cleanPhone = formatPhoneNumberForWhatsApp(sale.custPhone);
  const encodedText = encodeURIComponent(text);

  let url: string;
  if (cleanPhone) {
    url = `https://wa.me/${cleanPhone}?text=${encodedText}`;
  } else {
    // If no phone attached, allow cashier to pick contact in WhatsApp
    url = `https://wa.me/?text=${encodedText}`;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}
