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
  Store,
  Edit,
  Trash2,
  RotateCcw,
  Bluetooth,
  Loader2
} from 'lucide-react';
import { useToast } from './Toast';
import { printInvoiceViaBluetooth, isWebBluetoothSupported } from '../utils/bluetoothPrinter';
import { shareInvoiceOnWhatsApp } from '../utils/whatsappInvoice';

export interface InvoiceModalProps {
  sale: SaleRecord | null;
  settings: ShopSettings;
  isOpen: boolean;
  onClose: () => void;
  onOpenSalesReturn?: (sale: SaleRecord) => void;
  onEditSale?: (sale: SaleRecord) => void;
  onDeleteSale?: (invNo: string, permanent?: boolean, reason?: string) => void;
}

export type InvoiceFormat = 'thermal-80' | 'thermal-58' | 'a4';

export const InvoiceModal: React.FC<InvoiceModalProps> = ({
  sale,
  settings,
  isOpen,
  onClose,
  onOpenSalesReturn,
  onEditSale,
  onDeleteSale,
}) => {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [printFormat, setPrintFormat] = useState<InvoiceFormat>('thermal-80');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState<'cancel' | 'permanent'>('cancel');
  const [cancelReason, setCancelReason] = useState('Customer request / cancelled');
  const [isPrintingBluetooth, setIsPrintingBluetooth] = useState(false);

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

  const returnPolicyText = (settings.returnPolicy || '').trim();
  const receiptFooterText = (settings.receiptFooter || '').trim();
  const footerNoteLines = Array.from(
    new Set([returnPolicyText, receiptFooterText].filter(Boolean))
  );
  if (footerNoteLines.length === 0) {
    footerNoteLines.push('Thank you for your business!');
  }

  const handlePrint = () => {
    window.print();
  };

  const handleBluetoothPrint = async () => {
    if (!isWebBluetoothSupported()) {
      showToast(
        'Web Bluetooth is not supported on this browser. Please use Google Chrome, Edge, or Bluefy on mobile, or use the standard Print button.',
        'error'
      );
      return;
    }

    try {
      setIsPrintingBluetooth(true);
      showToast('Opening Bluetooth scanner... Please select your 58mm/80mm Thermal Printer', 'info');
      const format = printFormat === 'thermal-58' ? 'thermal-58' : 'thermal-80';
      const result = await printInvoiceViaBluetooth(sale, settings, format);
      if (result.success) {
        showToast(result.message, 'success');
      } else {
        showToast(result.message, result.message.includes('cancelled') ? 'info' : 'error');
      }
    } catch (err: any) {
      showToast(`Bluetooth printing failed: ${err?.message || 'Connection error'}`, 'error');
    } finally {
      setIsPrintingBluetooth(false);
    }
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
      sale.notes ? `Note: ${sale.notes}` : '',
      `==============================`,
      ...footerNoteLines,
      `==============================`,
    ].filter(Boolean);

    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    showToast('Invoice copied to clipboard', 'success');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleWhatsApp = () => {
    try {
      shareInvoiceOnWhatsApp(sale, settings);
      showToast(`Opening WhatsApp for Invoice #${sale.invNo}...`, 'success');
    } catch (err: any) {
      showToast(`Could not open WhatsApp: ${err?.message || 'Error'}`, 'error');
    }
  };

  const logoSrc = settings.invoiceLogo || settings.shopLogo || settings.logo;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      {/* ============================================================== */}
      {/* PRINT-ONLY AREA (Clean CSS for thermal or A4 page printing) */}
      {/* ============================================================== */}
      <div
        id="printable-thermal-invoice"
        className={`hidden print:block print:w-full print:bg-white text-black p-4 tabular-nums ${
          printFormat === 'thermal-58'
            ? 'thermal-58-print'
            : printFormat === 'thermal-80'
            ? 'thermal-80-print'
            : 'a4-print'
        }`}
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
          {sale.saleMode === 'wholesale' && (
            <div className="text-center font-black text-xs uppercase border border-black p-1 bg-gray-100 mb-1">
              *** WHOLESALE B2B BILL ***
            </div>
          )}
          <div className="flex justify-between font-bold">
            <span>INV #{sale.invNo}</span>
            <span>{new Date(sale.date).toLocaleDateString()} {new Date(sale.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div>Customer / Retailer: <span className="font-bold">{sale.custName || 'Walk-in'}</span></div>
          {sale.retailerShopName && <div>Shop: <span className="font-bold">{sale.retailerShopName}</span></div>}
          {sale.retailerCity && <div>City: {sale.retailerCity}</div>}
          {sale.retailerNtn && <div>NTN/GST: {sale.retailerNtn}</div>}
          {sale.custPhone && <div>Phone: {sale.custPhone}</div>}
          <div className="pt-1 flex items-center justify-between">
            <span className="font-black border border-black px-1.5 py-0.5 uppercase text-[10px]">
              [{paymentStatusText}]
            </span>
            {sale.saleMode === 'wholesale' && (
              <span className="font-bold text-[10px] uppercase">
                Mode: WHOLESALE
              </span>
            )}
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
                    {item.boxCount && item.boxCount > 0 ? (
                      <div className="text-[9px] font-bold">Box/Cartons: {item.boxCount}</div>
                    ) : null}
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

        {/* Custom Per-Bill Note (Urdu / English / Roman Urdu) */}
        {sale.notes && (
          <div
            dir="auto"
            className="mt-2 p-1.5 border border-dashed border-black text-[10px] font-semibold whitespace-pre-wrap text-left"
          >
            <span className="font-black uppercase text-[9px] mr-1">Note:</span>
            {sale.notes}
          </div>
        )}

        {/* Footer & Return Policy */}
        <div className="pt-3 text-center text-[10px] space-y-1">
          {footerNoteLines.map((line, idx) => (
            <p key={idx} className={idx === 0 ? 'font-semibold' : 'text-[9.5px] font-medium'}>
              {line}
            </p>
          ))}
          <p className="text-[8px] text-gray-500">System Generated Invoice</p>
        </div>
      </div>

      {/* ============================================================== */}
      {/* SCREEN MODAL DIALOG (Compact 2-column no-scroll view)          */}
      {/* ============================================================== */}
      <div className="print:hidden bg-white rounded-2xl max-w-4xl w-full overflow-hidden p-3 sm:p-4 shadow-2xl space-y-2.5 border border-slate-100 my-auto animate-in fade-in zoom-in-95">
        {/* Compact Modal Top Bar */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-2 shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-xl shrink-0">
              <Printer className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex items-center gap-2 flex-wrap">
              <h3 className="font-black text-slate-900 text-sm sm:text-base leading-tight truncate">
                Invoice #{sale.invNo}
              </h3>
              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase ${paymentStatusColor}`}>
                {paymentStatusText}
              </span>
              <span className="text-[11px] text-slate-400 truncate hidden sm:inline">
                {new Date(sale.date).toLocaleDateString()} • {new Date(sale.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Return Status Alert */}
        {sale.returnStatus && sale.returnStatus !== 'NONE' && (
          <div className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold flex items-center justify-between ${
            sale.returnStatus === 'FULL'
              ? 'bg-rose-50 border-rose-200 text-rose-700'
              : 'bg-amber-50 border-amber-200 text-amber-700'
          }`}>
            <span>
              {sale.returnStatus === 'FULL' ? '⚠️ This sale invoice has been fully returned & refunded.' : '⚠️ This sale invoice has items partially returned.'}
            </span>
            {sale.totalRefunded && sale.totalRefunded > 0 && (
              <span className="tabular-nums">
                Total Refunded: {settings.currency} {sale.totalRefunded.toLocaleString()}
              </span>
            )}
          </div>
        )}

        {/* 2-Column Zero-Scroll Body */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch">
          {/* LEFT: Compact Receipt Preview */}
          <div className="md:col-span-7 flex flex-col">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 tabular-nums text-[11px] text-slate-800 space-y-2 shadow-inner flex-1 flex flex-col justify-between">
              <div className="space-y-2">
                {/* Compact Shop Header Row */}
                <div className="flex items-center justify-between gap-2 border-b border-dashed border-slate-300 pb-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {logoSrc ? (
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-white p-0.5 shadow-2xs shrink-0 flex items-center justify-center">
                        <img
                          src={logoSrc}
                          alt={settings.shopName}
                          className="w-full h-full object-cover rounded-full"
                        />
                      </div>
                    ) : (
                      <div className="w-9 h-9 bg-blue-600 text-white rounded-full flex items-center justify-center font-black shrink-0 shadow-xs">
                        <Store className="w-4 h-4" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <h2 className="font-black text-xs uppercase tracking-wide text-slate-900 truncate">
                        {settings.shopName}
                      </h2>
                      <p className="text-[10px] text-slate-500 truncate">
                        {settings.address} {settings.phone ? `• Ph: ${settings.phone}` : ''}
                      </p>
                    </div>
                  </div>
                  {sale.saleMode === 'wholesale' && (
                    <span className="px-2 py-0.5 rounded-md bg-purple-100 border border-purple-300 text-purple-900 font-extrabold text-[10px] shrink-0">
                      WHOLESALE B2B
                    </span>
                  )}
                </div>

                {/* Compact Invoice Metadata */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10.5px] text-slate-600 border-b border-dashed border-slate-300 pb-2">
                  <div className="truncate">
                    Customer: <strong className="text-slate-900">{sale.custName || 'Walk-in'}</strong>
                  </div>
                  <div className="text-right truncate">
                    Date: <strong className="text-slate-800">{new Date(sale.date).toLocaleDateString()}</strong>
                  </div>
                  {sale.custPhone && (
                    <div className="truncate">
                      Phone: <strong className="text-slate-800">{sale.custPhone}</strong>
                    </div>
                  )}
                  {sale.retailerShopName && (
                    <div className="truncate">
                      Shop: <strong className="text-slate-800">{sale.retailerShopName}</strong>
                    </div>
                  )}
                  {(sale.retailerCity || sale.retailerNtn) && (
                    <div className="col-span-2 truncate">
                      {sale.retailerCity ? `City: ${sale.retailerCity}` : ''}{sale.retailerCity && sale.retailerNtn ? ' • ' : ''}{sale.retailerNtn ? `NTN/GST: ${sale.retailerNtn}` : ''}
                    </div>
                  )}
                </div>

                {/* Itemized Table (Full width, no horizontal overflow) */}
                <div className={`border-b border-dashed border-slate-300 pb-2 ${sale.items.length > 6 ? 'max-h-44 overflow-y-auto pr-1' : ''}`}>
                  <table className="w-full text-left text-[11px] table-auto">
                    <thead>
                      <tr className="border-b border-slate-300 text-slate-500 font-bold uppercase text-[9.5px]">
                        <th className="pb-1">Item</th>
                        <th className="pb-1 text-center w-10">Qty</th>
                        <th className="pb-1 text-right w-20">Price</th>
                        <th className="pb-1 text-right w-22">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/60">
                      {sale.items.map((item, idx) => (
                        <tr key={idx} className="align-top">
                          <td className="py-1 pr-2">
                            <div className="font-bold text-slate-900 leading-tight">{item.name}</div>
                            {item.boxCount && item.boxCount > 0 ? (
                              <div className="text-[9.5px] text-purple-700 font-bold">
                                📦 {item.boxCount} Cartons / Boxes
                              </div>
                            ) : null}
                            {item.imei && (
                              <div className="text-[9.5px] text-blue-700 font-semibold flex items-center gap-1 mt-0.5 break-all">
                                <Smartphone className="w-2.5 h-2.5 text-blue-500 shrink-0" />
                                <span>IMEI: {item.imei}</span>
                              </div>
                            )}
                          </td>
                          <td className="py-1 text-center font-bold text-slate-800">{item.qty}</td>
                          <td className="py-1 text-right text-slate-600">
                            {settings.currency} {item.salePrice.toLocaleString()}
                          </td>
                          <td className="py-1 text-right font-black text-slate-900">
                            {settings.currency} {(item.salePrice * item.qty).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Custom Per-Bill Note Preview */}
                {sale.notes && (
                  <div
                    dir="auto"
                    className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 text-left text-[11px] text-slate-800 whitespace-pre-wrap"
                  >
                    <span className="font-extrabold text-[9.5px] uppercase tracking-wider text-amber-800 mr-1">
                      Note:
                    </span>
                    {sale.notes}
                  </div>
                )}
              </div>

              {/* Compact Footer & Return Policy */}
              <div className="pt-1.5 border-t border-dashed border-slate-300 flex items-center justify-between gap-2 text-[9.5px] text-slate-500">
                <div className="flex items-center gap-1.5 shrink-0 bg-white px-2 py-1 rounded-lg border border-slate-200">
                  <QrCode className="w-5 h-5 text-slate-800" />
                  <span className="font-bold text-slate-700">#{sale.invNo}</span>
                </div>
                <div className="text-right leading-tight truncate">
                  {footerNoteLines.map((line, idx) => (
                    <p key={idx} className="italic truncate">
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Payment Totals, Print Format & Action Controls */}
          <div className="md:col-span-5 flex flex-col justify-between gap-2.5">
            {/* Financial Summary Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5 text-xs tabular-nums">
              <div className="flex justify-between text-slate-600 text-[11px]">
                <span>Subtotal:</span>
                <span>{settings.currency} {sale.subtotal.toLocaleString()}</span>
              </div>

              {sale.wholesaleSavings && sale.wholesaleSavings > 0 ? (
                <div className="flex justify-between text-purple-700 font-bold text-[11px] bg-purple-50 px-2 py-1 rounded-md border border-purple-200">
                  <span>Wholesale Savings:</span>
                  <span>{settings.currency} {sale.wholesaleSavings.toLocaleString()}</span>
                </div>
              ) : null}

              {sale.discount > 0 && (
                <div className="flex justify-between text-emerald-600 font-semibold text-[11px]">
                  <span>Discount / Tier:</span>
                  <span>-{settings.currency} {sale.discount.toLocaleString()}</span>
                </div>
              )}

              <div className="flex justify-between items-center text-sm font-black text-slate-900 pt-1.5 border-t border-slate-200">
                <span>GRAND TOTAL:</span>
                <span className="text-base text-blue-700">
                  {settings.currency} {grandTotal.toLocaleString()}
                </span>
              </div>

              <div className="flex justify-between text-emerald-700 font-bold text-[11px] pt-1 border-t border-slate-200/70">
                <span>Paid ({sale.paymentMethod || 'Cash'}):</span>
                <span>{settings.currency} {amountPaid.toLocaleString()}</span>
              </div>

              {amountDue > 0 && (
                <div className="flex justify-between text-rose-600 font-black text-xs pt-1 border-t border-dashed border-rose-200">
                  <span>Remaining Balance:</span>
                  <span>{settings.currency} {amountDue.toLocaleString()}</span>
                </div>
              )}
            </div>

            {/* Print Layout Switcher */}
            <div className="bg-slate-50 p-1.5 rounded-xl border border-slate-200 space-y-1">
              <span className="text-[10px] font-bold text-slate-500 px-1 block uppercase tracking-wider">Print Layout</span>
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() => setPrintFormat('thermal-80')}
                  className={`px-2 py-1.5 rounded-lg font-bold text-[11px] text-center transition cursor-pointer ${
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
                  className={`px-2 py-1.5 rounded-lg font-bold text-[11px] text-center transition cursor-pointer ${
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
                  className={`px-2 py-1.5 rounded-lg font-bold text-[11px] text-center transition cursor-pointer ${
                    printFormat === 'a4'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-200/60'
                  }`}
                >
                  Standard A4
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold shadow-sm shadow-blue-600/20 transition cursor-pointer active:scale-95"
                  title="Standard browser print dialog (A4 or thermal driver)"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Standard Print</span>
                </button>

                <button
                  type="button"
                  onClick={handleWhatsApp}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer active:scale-95"
                  title="Share itemized bill directly with customer on WhatsApp"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>WhatsApp</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleBluetoothPrint}
                disabled={isPrintingBluetooth}
                className={`w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-extrabold transition cursor-pointer active:scale-98 shadow-xs ${
                  isPrintingBluetooth
                    ? 'bg-indigo-100 text-indigo-800 cursor-wait border border-indigo-300'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/15'
                }`}
                title="Connect & print directly to paired Bluetooth ESC/POS 80mm/58mm thermal printer"
              >
                {isPrintingBluetooth ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-white shrink-0" />
                    <span>Connecting Bluetooth...</span>
                  </>
                ) : (
                  <>
                    <Bluetooth className="w-3.5 h-3.5 shrink-0" />
                    <span>Bluetooth Thermal Print ({printFormat === 'thermal-58' ? '58mm' : '80mm'})</span>
                  </>
                )}
              </button>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={handleCopyText}
                  className="flex items-center justify-center gap-1.5 py-1.5 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[11px] font-bold transition cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                  <span>{copied ? 'Copied!' : 'Copy Text'}</span>
                </button>

                {onOpenSalesReturn && sale.returnStatus !== 'FULL' ? (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenSalesReturn(sale);
                    }}
                    className="flex items-center justify-center gap-1 py-1.5 px-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-[11px] font-bold transition cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Sales Return</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex items-center justify-center py-1.5 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[11px] font-bold transition cursor-pointer"
                  >
                    Close
                  </button>
                )}
              </div>

              {(onEditSale || onDeleteSale) && (
                <div className="grid grid-cols-2 gap-1.5">
                  {onEditSale && sale.status !== 'CANCELLED' && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onEditSale(sale);
                      }}
                      className="flex items-center justify-center gap-1 py-1.5 px-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-[11px] font-bold transition cursor-pointer"
                      title="Load invoice in POS Cart to edit"
                    >
                      <Edit className="w-3 h-3 text-blue-600" />
                      <span>Edit Invoice</span>
                    </button>
                  )}
                  {onDeleteSale && (
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteMode(sale.status === 'CANCELLED' ? 'permanent' : 'cancel');
                        setDeleteConfirmOpen(true);
                      }}
                      className={`flex items-center justify-center gap-1 py-1.5 px-2.5 border rounded-xl text-[11px] font-bold transition cursor-pointer ${
                        !onEditSale || sale.status === 'CANCELLED' ? 'col-span-2 ' : ''
                      }${
                        sale.status === 'CANCELLED'
                          ? 'bg-rose-100 hover:bg-rose-200 text-rose-800 border-rose-300'
                          : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                      }`}
                      title={sale.status === 'CANCELLED' ? 'Delete Permanently' : 'Delete / Void Invoice'}
                    >
                      <Trash2 className="w-3 h-3 text-rose-600" />
                      <span>{sale.status === 'CANCELLED' ? 'Delete Permanently' : 'Void / Delete'}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete / Void confirmation dialog inside InvoiceModal */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4 border border-slate-100 animate-in zoom-in-95">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-extrabold text-slate-900 text-base">
                  {deleteMode === 'permanent' || sale.status === 'CANCELLED'
                    ? 'Delete Invoice Permanently'
                    : 'Void & Cancel Invoice'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 tabular-nums">Invoice #{sale.invNo}</p>
              </div>
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {sale.status !== 'CANCELLED' ? (
              <div className="space-y-2">
                <div
                  onClick={() => setDeleteMode('cancel')}
                  className={`p-2.5 rounded-xl border text-left cursor-pointer transition ${
                    deleteMode === 'cancel' ? 'border-rose-400 bg-rose-50' : 'border-slate-200'
                  }`}
                >
                  <p className="font-bold text-xs text-slate-900">Void & Cancel (Restore Stock)</p>
                  <p className="text-[11px] text-slate-500">Restores inventory stock and marks invoice status as CANCELLED.</p>
                </div>
                <div
                  onClick={() => setDeleteMode('permanent')}
                  className={`p-2.5 rounded-xl border text-left cursor-pointer transition ${
                    deleteMode === 'permanent' ? 'border-rose-400 bg-rose-50' : 'border-slate-200'
                  }`}
                >
                  <p className="font-bold text-xs text-rose-700">Permanently Delete</p>
                  <p className="text-[11px] text-slate-500">Completely purges this record from the database.</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-600">
                Are you sure you want to permanently remove this cancelled invoice from records?
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteSale) {
                    onDeleteSale(sale.invNo, deleteMode === 'permanent', cancelReason);
                  }
                  setDeleteConfirmOpen(false);
                  onClose();
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold shadow-sm"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
