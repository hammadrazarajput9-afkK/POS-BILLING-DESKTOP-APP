import React, { useState } from 'react';
import { SaleRecord, ShopSettings } from '../types';
import {
  Printer,
  X,
  Copy,
  Check,
  Share2,
  FileText,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  QrCode,
  Store
} from 'lucide-react';
import { useToast } from './Toast';

export interface InvoiceModalProps {
  sale: SaleRecord | null;
  settings: ShopSettings;
  isOpen: boolean;
  onClose: () => void;
}

export type InvoiceFormat = 'thermal-80' | 'thermal-58' | 'a4';

export const InvoiceModal: React.FC<InvoiceModalProps> = ({
  sale,
  settings,
  isOpen,
  onClose,
}) => {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [printFormat, setPrintFormat] = useState<InvoiceFormat>('thermal-80');

  if (!isOpen || !sale) return null;

  const isCreditSale = sale.invoiceType === 'credit';
  const grandTotal = sale.grandTotal || 0;
  const amountPaid = sale.amountPaid !== undefined ? sale.amountPaid : grandTotal;
  const amountDue = sale.amountDue !== undefined ? sale.amountDue : Math.max(0, grandTotal - amountPaid);
  const isFullyPaid = amountDue <= 0;
  const isPartial = !isFullyPaid && amountPaid > 0;

  const paymentStatusText = isFullyPaid
    ? 'PAID'
    : isPartial
    ? 'PARTIAL PAYMENT'
    : 'UNPAID KHATA';

  const paymentStatusColor = isFullyPaid
    ? 'bg-emerald-600 text-white'
    : isPartial
    ? 'bg-amber-600 text-white'
    : 'bg-rose-600 text-white';

  const handlePrint = () => {
    window.print();
  };

  const handleCopyText = () => {
    const lines = [
      `==============================`,
      `${settings.shopName.toUpperCase()}`,
      `${settings.tagline || ''}`,
      `${settings.address}`,
      `Ph: ${settings.phone}`,
      `==============================`,
      `Invoice #: ${sale.invNo}`,
      `Date: ${new Date(sale.date).toLocaleString()}`,
      `Customer: ${sale.custName || 'Walk-in Customer'}`,
      sale.custPhone ? `Phone: ${sale.custPhone}` : '',
      `Status: ${paymentStatusText}`,
      `------------------------------`,
      ...sale.items.map(
        i =>
          `${i.name} x${i.qty} @ ${settings.currency} ${i.salePrice}\n` +
          (i.imei ? `  IMEI: ${i.imei}\n` : '') +
          `  Total: ${settings.currency} ${(i.salePrice * i.qty).toLocaleString()}`
      ),
      `------------------------------`,
      `Subtotal: ${settings.currency} ${sale.subtotal.toLocaleString()}`,
      sale.discount > 0 ? `Discount: -${settings.currency} ${sale.discount.toLocaleString()}` : '',
      `GRAND TOTAL: ${settings.currency} ${grandTotal.toLocaleString()}`,
      `Paid Amount: ${settings.currency} ${amountPaid.toLocaleString()} (${sale.paymentMethod || 'Cash'})`,
      amountDue > 0 ? `Balance Due: ${settings.currency} ${amountDue.toLocaleString()}` : '',
      `==============================`,
      settings.returnPolicy || settings.receiptFooter || 'Thank you for your visit!',
      `==============================`,
    ].filter(Boolean);

    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    showToast('Invoice copied to clipboard', 'success');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleWhatsApp = () => {
    const phone = sale.custPhone ? sale.custPhone.replace(/[^0-9]/g, '') : '';
    const textLines = [
      `*${settings.shopName.toUpperCase()}*`,
      `*Customer Receipt - Invoice #${sale.invNo}*`,
      `Date: ${new Date(sale.date).toLocaleDateString()}`,
      `Customer: ${sale.custName || 'Valued Customer'}`,
      `Status: *${paymentStatusText}*`,
      `------------------------`,
      ...sale.items.map(
        i => `• ${i.name} (Qty: ${i.qty}) = ${settings.currency} ${(i.salePrice * i.qty).toLocaleString()}${i.imei ? `\n  (IMEI: ${i.imei})` : ''}`
      ),
      `------------------------`,
      `*Grand Total: ${settings.currency} ${grandTotal.toLocaleString()}*`,
      `*Paid: ${settings.currency} ${amountPaid.toLocaleString()}*`,
      amountDue > 0 ? `*Remaining Due: ${settings.currency} ${amountDue.toLocaleString()}*` : '',
      `------------------------`,
      settings.returnPolicy || settings.receiptFooter || 'Thank you for shopping with us!',
    ].filter(Boolean);

    const message = encodeURIComponent(textLines.join('\n'));
    const url = phone
      ? `https://wa.me/${phone.startsWith('0') ? '92' + phone.substring(1) : phone}?text=${message}`
      : `https://wa.me/?text=${message}`;
    window.open(url, '_blank');
  };

  const logoSrc = settings.shopLogo || settings.logo;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      {/* ============================================================== */}
      {/* PRINT-ONLY AREA (Clean CSS for thermal or A4 page printing) */}
      {/* ============================================================== */}
      <div
        id="printable-thermal-invoice"
        className="hidden print:block print:w-full print:bg-white text-black p-4 font-mono"
        style={{
          maxWidth: printFormat === 'thermal-58' ? '58mm' : printFormat === 'thermal-80' ? '80mm' : '210mm',
          margin: '0 auto',
        }}
      >
        {/* Print Header */}
        <div className="text-center pb-2 border-b border-black">
          {logoSrc && (
            <img
              src={logoSrc}
              alt="Logo"
              className="w-16 h-16 object-contain mx-auto mb-1 filter grayscale"
            />
          )}
          <h1 className="text-base font-black uppercase tracking-tight">{settings.shopName}</h1>
          {settings.tagline && <p className="text-[10px]">{settings.tagline}</p>}
          <p className="text-[10px]">{settings.address}</p>
          <p className="text-[10px] font-bold">Tel: {settings.phone}</p>
        </div>

        {/* Invoice Info */}
        <div className="py-2 border-b border-dashed border-black text-[11px] space-y-0.5">
          <div className="flex justify-between font-bold">
            <span>INV #{sale.invNo}</span>
            <span>{new Date(sale.date).toLocaleDateString()} {new Date(sale.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div>Customer: <span className="font-bold">{sale.custName || 'Walk-in'}</span></div>
          {sale.custPhone && <div>Phone: {sale.custPhone}</div>}
          <div className="pt-1">
            <span className="font-black border border-black px-1.5 py-0.5 uppercase text-[10px]">
              [{paymentStatusText}]
            </span>
          </div>
        </div>

        {/* Items List */}
        <div className="py-2 border-b border-dashed border-black text-[11px]">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-black">
                <th className="pb-1">Item & Details</th>
                <th className="pb-1 text-center">Qty</th>
                <th className="pb-1 text-right">Price</th>
                <th className="pb-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item, idx) => (
                <tr key={idx} className="border-b border-dotted border-gray-300">
                  <td className="py-1">
                    <div className="font-bold">{item.name}</div>
                    {item.imei && <div className="text-[9px]">IMEI: {item.imei}</div>}
                  </td>
                  <td className="py-1 text-center font-bold">{item.qty}</td>
                  <td className="py-1 text-right">{item.salePrice.toLocaleString()}</td>
                  <td className="py-1 text-right font-bold">{(item.salePrice * item.qty).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Total Calculations */}
        <div className="py-2 border-b border-black text-[11px] space-y-1">
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span>{settings.currency} {sale.subtotal.toLocaleString()}</span>
          </div>
          {sale.discount > 0 && (
            <div className="flex justify-between">
              <span>Discount:</span>
              <span>-{settings.currency} {sale.discount.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between font-black text-[13px] pt-1 border-t border-black">
            <span>GRAND TOTAL:</span>
            <span>{settings.currency} {grandTotal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span>Paid ({sale.paymentMethod || 'Cash'}):</span>
            <span className="font-bold">{settings.currency} {amountPaid.toLocaleString()}</span>
          </div>
          {amountDue > 0 && (
            <div className="flex justify-between font-bold">
              <span>Remaining Balance:</span>
              <span>{settings.currency} {amountDue.toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* Footer & Return Policy */}
        <div className="pt-3 text-center text-[10px] space-y-1">
          <p className="font-semibold">{settings.returnPolicy || settings.receiptFooter || 'Thank you for your business!'}</p>
          <p className="text-[8px] text-gray-500">System Generated Invoice</p>
        </div>
      </div>

      {/* ============================================================== */}
      {/* SCREEN MODAL DIALOG (Interactive preview with options) */}
      {/* ============================================================== */}
      <div className="print:hidden bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 border border-slate-100 my-auto animate-in fade-in zoom-in-95 max-h-[92vh] flex flex-col">
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-sm sm:text-base leading-tight">
                Customer Invoice & Receipt
              </h3>
              <p className="text-[11px] text-slate-400">
                Invoice #{sale.invNo} • {new Date(sale.date).toLocaleDateString()}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Print Format Switcher Toolbar */}
        <div className="flex items-center justify-between bg-slate-50 p-1.5 rounded-xl border border-slate-200 text-xs shrink-0">
          <span className="text-[11px] font-bold text-slate-500 pl-2">Print Layout:</span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setPrintFormat('thermal-80')}
              className={`px-3 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                printFormat === 'thermal-80'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              80mm Thermal
            </button>
            <button
              type="button"
              onClick={() => setPrintFormat('thermal-58')}
              className={`px-3 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                printFormat === 'thermal-58'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              58mm Mini
            </button>
            <button
              type="button"
              onClick={() => setPrintFormat('a4')}
              className={`px-3 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                printFormat === 'a4'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              Standard A4
            </button>
          </div>
        </div>

        {/* Scrollable Receipt Preview */}
        <div className="overflow-y-auto pr-1 flex-1">
          <div
            className={`mx-auto bg-slate-50 border border-slate-200 rounded-2xl p-5 font-mono text-xs text-slate-800 space-y-4 shadow-inner ${
              printFormat === 'thermal-58' ? 'max-w-xs' : 'max-w-md'
            }`}
          >
            {/* Shop Header */}
            <div className="text-center border-b border-dashed border-slate-300 pb-3 space-y-1">
              {logoSrc ? (
                <div className="flex justify-center mb-2">
                  <img
                    src={logoSrc}
                    alt={settings.shopName}
                    className="w-14 h-14 object-contain rounded-lg border border-slate-200 bg-white p-1 shadow-2xs"
                  />
                </div>
              ) : (
                <div className="w-10 h-10 bg-blue-600 text-white rounded-xl mx-auto flex items-center justify-center font-black mb-1">
                  <Store className="w-5 h-5" />
                </div>
              )}

              <h2 className="font-black text-sm uppercase tracking-wide text-slate-900">
                {settings.shopName}
              </h2>
              {settings.tagline && <p className="text-[10px] text-slate-500">{settings.tagline}</p>}
              <p className="text-[10px] text-slate-500">{settings.address}</p>
              <p className="text-[10px] text-slate-600 font-semibold">Ph: {settings.phone}</p>

              {/* Bold Status Badge */}
              <div className="pt-2">
                <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-black tracking-wider uppercase shadow-2xs ${paymentStatusColor}`}>
                  {paymentStatusText}
                </span>
              </div>
            </div>

            {/* Invoice Metadata */}
            <div className="space-y-1 text-[11px] text-slate-600 border-b border-dashed border-slate-300 pb-2.5">
              <div className="flex justify-between font-bold text-slate-900">
                <span>Invoice: #{sale.invNo}</span>
                <span>{new Date(sale.date).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Customer: <strong className="text-slate-800">{sale.custName || 'Walk-in'}</strong></span>
                <span>{new Date(sale.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              {sale.custPhone && (
                <div>Phone: <span className="font-semibold text-slate-800">{sale.custPhone}</span></div>
              )}
            </div>

            {/* Itemized Table */}
            <div className="border-b border-dashed border-slate-300 pb-3">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="border-b border-slate-300 text-slate-500 font-bold uppercase text-[10px]">
                    <th className="pb-1.5">Item</th>
                    <th className="pb-1.5 text-center">Qty</th>
                    <th className="pb-1.5 text-right">Price</th>
                    <th className="pb-1.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60">
                  {sale.items.map((item, idx) => (
                    <tr key={idx} className="align-top">
                      <td className="py-1.5">
                        <div className="font-bold text-slate-900">{item.name}</div>
                        {item.imei && (
                          <div className="text-[10px] text-blue-700 font-bold flex items-center gap-1 mt-0.5">
                            <Smartphone className="w-3 h-3 text-blue-500 inline" />
                            <span>IMEI: {item.imei}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-1.5 text-center font-bold text-slate-800">{item.qty}</td>
                      <td className="py-1.5 text-right text-slate-600">
                        {settings.currency} {item.salePrice.toLocaleString()}
                      </td>
                      <td className="py-1.5 text-right font-black text-slate-900">
                        {settings.currency} {(item.salePrice * item.qty).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Calculations Breakdown */}
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span>{settings.currency} {sale.subtotal.toLocaleString()}</span>
              </div>

              {sale.discount > 0 && (
                <div className="flex justify-between text-emerald-600 font-semibold">
                  <span>Discount:</span>
                  <span>-{settings.currency} {sale.discount.toLocaleString()}</span>
                </div>
              )}

              <div className="flex justify-between items-center text-sm font-black text-slate-900 pt-1.5 border-t border-slate-300">
                <span>GRAND TOTAL:</span>
                <span className="text-base text-blue-700">
                  {settings.currency} {grandTotal.toLocaleString()}
                </span>
              </div>

              <div className="flex justify-between text-slate-700 pt-1 border-t border-slate-200 text-[11px]">
                <span>Payment Mode:</span>
                <span className="font-bold uppercase">{sale.paymentMethod || 'Cash'}</span>
              </div>

              <div className="flex justify-between text-emerald-700 font-bold text-[11px]">
                <span>Amount Paid Now:</span>
                <span>{settings.currency} {amountPaid.toLocaleString()}</span>
              </div>

              {amountDue > 0 && (
                <div className="flex justify-between text-rose-600 font-black text-xs pt-1 border-t border-dashed border-rose-200">
                  <span>Remaining Khata Balance:</span>
                  <span>{settings.currency} {amountDue.toLocaleString()}</span>
                </div>
              )}
            </div>

            {/* QR Code & Return Policy Footer */}
            <div className="pt-3 border-t border-dashed border-slate-300 text-center space-y-2">
              <div className="flex items-center justify-center gap-2 p-2 bg-white rounded-xl border border-slate-200 w-fit mx-auto">
                <QrCode className="w-8 h-8 text-slate-800" />
                <div className="text-left text-[9px] text-slate-500 font-sans leading-tight">
                  <p className="font-bold text-slate-800">Scan to Verify</p>
                  <p>Digital Receipt #{sale.invNo}</p>
                </div>
              </div>

              <p className="text-[10px] text-slate-600 font-sans italic">
                {settings.returnPolicy || settings.receiptFooter || 'Warranty claims require original invoice.'}
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 shrink-0">
          <button
            type="button"
            onClick={handleCopyText}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-500" />}
            <span>{copied ? 'Copied!' : 'Copy Text'}</span>
          </button>

          <button
            type="button"
            onClick={handleWhatsApp}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            <Share2 className="w-4 h-4 text-emerald-600" />
            <span>WhatsApp</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center justify-center gap-1.5 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold shadow-lg shadow-blue-600/25 transition cursor-pointer active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>Print Receipt</span>
          </button>
        </div>
      </div>
    </div>
  );
};
