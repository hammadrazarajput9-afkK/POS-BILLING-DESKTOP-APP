import React, { useEffect, useState } from 'react';
import { SaleRecord, ShopSettings } from '../types';
import {
  Printer,
  X,
  Copy,
  Check,
  Share2,
  Smartphone,
  QrCode,
  Store,
  Edit,
  Trash2,
  RotateCcw,
  Bluetooth,
  Loader2,
} from 'lucide-react';
import { useToast } from './Toast';
import { printInvoiceViaBluetooth, isWebBluetoothSupported } from '../utils/bluetoothPrinter';
import { InvoiceShareModal } from './InvoiceShareModal';

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
  const [cancelReason] = useState('Customer request / cancelled');
  const [isPrintingBluetooth, setIsPrintingBluetooth] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  // Dynamically sync @page size when printFormat changes (80mm, 58mm, A4)
  useEffect(() => {
    if (!isOpen) return;
    const styleId = 'dynamic-invoice-page-size';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }

    if (printFormat === 'thermal-58') {
      styleEl.textContent = `@media print { @page { size: 58mm auto; margin: 1.5mm; } }`;
    } else if (printFormat === 'thermal-80') {
      styleEl.textContent = `@media print { @page { size: 80mm auto; margin: 2mm; } }`;
    } else {
      styleEl.textContent = `@media print { @page { size: A4 portrait; margin: 10mm; } }`;
    }

    return () => {
      const existing = document.getElementById(styleId);
      if (existing) existing.remove();
    };
  }, [isOpen, printFormat]);

  if (!isOpen || !sale) return null;

  const grandTotal = sale.grandTotal || 0;
  const amountPaid = sale.amountPaid !== undefined ? sale.amountPaid : grandTotal;
  const amountDue =
    sale.amountDue !== undefined ? sale.amountDue : Math.max(0, grandTotal - amountPaid);
  const totalQty = (sale.items || []).reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
  const totalItemsCount = (sale.items || []).length;
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
      `Total Quantity: ${totalQty} pcs (${totalItemsCount} ${totalItemsCount === 1 ? 'item' : 'items'})`,
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

  const logoSrc = settings.invoiceLogo || settings.shopLogo || settings.logo;

  const is58 = printFormat === 'thermal-58';
  const is80 = printFormat === 'thermal-80';
  const isA4 = printFormat === 'a4';

  const previewSheetWidthClass = is58
    ? 'max-w-[270px] mx-auto p-2.5 text-[10px]'
    : is80
    ? 'max-w-[380px] mx-auto p-3 sm:p-3.5 text-[11px]'
    : 'max-w-[780px] mx-auto p-3.5 sm:p-5 text-xs';

  return (
    <div
      id="invoice-modal-backdrop"
      className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-start sm:items-center justify-center p-1.5 sm:p-3 overflow-y-auto print:static print:block print:p-0 print:bg-white print:overflow-visible"
    >
      {/* ============================================================== */}
      {/* PRINT-ONLY AREA (True 80mm / 58mm / A4 layout)                 */}
      {/* ============================================================== */}
      <div
        id="printable-thermal-invoice"
        className={`hidden print:block bg-white text-black tabular-nums ${
          is58 ? 'thermal-58-print' : is80 ? 'thermal-80-print' : 'a4-print'
        }`}
      >
        {/* Print Header */}
        <div className="text-center pb-2 border-b border-black">
          {logoSrc && (
            <img
              src={logoSrc}
              alt="Logo"
              className="w-14 h-14 rounded-full object-cover mx-auto mb-1 filter grayscale"
            />
          )}
          <h1 className="text-base font-black uppercase tracking-tight">{settings.shopName}</h1>
          {settings.tagline && <p className="text-[10px]">{settings.tagline}</p>}
          {settings.address && <p className="text-[10px]">{settings.address}</p>}
          {settings.phone && <p className="text-[10px] font-bold">Tel: {settings.phone}</p>}
        </div>

        {/* Print Invoice Info */}
        <div className="py-2 border-b border-dashed border-black text-[11px] space-y-0.5">
          {sale.saleMode === 'wholesale' && (
            <div className="text-center font-black text-xs uppercase border border-black p-1 bg-gray-100 mb-1">
              *** WHOLESALE B2B BILL ***
            </div>
          )}
          <div className="flex justify-between font-bold">
            <span>INV #{sale.invNo}</span>
            <span>
              {new Date(sale.date).toLocaleDateString()}{' '}
              {new Date(sale.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <div>
            Customer: <span className="font-bold">{sale.custName || 'Walk-in'}</span>
          </div>
          {sale.retailerShopName && (
            <div>
              Shop: <span className="font-bold">{sale.retailerShopName}</span>
            </div>
          )}
          {sale.retailerCity && <div>City: {sale.retailerCity}</div>}
          {sale.retailerNtn && <div>NTN/GST: {sale.retailerNtn}</div>}
          {sale.custPhone && <div>Phone: {sale.custPhone}</div>}
          <div className="pt-1 flex items-center justify-between">
            <span className="font-black border border-black px-1.5 py-0.5 uppercase text-[10px]">
              [{paymentStatusText}]
            </span>
            {sale.saleMode === 'wholesale' && (
              <span className="font-bold text-[10px] uppercase">Mode: WHOLESALE</span>
            )}
          </div>
        </div>

        {/* Print Items List (Price cleanly underneath product on thermal, or tabular on A4) */}
        <div className="py-2 border-b border-dashed border-black text-[11px]">
          {isA4 ? (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-black">
                  <th className="pb-1.5">#</th>
                  <th className="pb-1.5">Product &amp; Details</th>
                  <th className="pb-1.5 text-center">Qty</th>
                  <th className="pb-1.5 text-right">Unit Price</th>
                  <th className="pb-1.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((item, idx) => (
                  <tr key={idx} className="border-b border-dotted border-gray-400">
                    <td className="py-1.5 pr-2 font-bold">{idx + 1}</td>
                    <td className="py-1.5">
                      <div className="font-bold">{item.name}</div>
                      {item.boxCount && item.boxCount > 0 ? (
                        <div className="text-[10px] font-bold">Box/Cartons: {item.boxCount}</div>
                      ) : null}
                      {item.imei && <div className="text-[10px]">IMEI: {item.imei}</div>}
                    </td>
                    <td className="py-1.5 text-center font-bold">{item.qty}</td>
                    <td className="py-1.5 text-right">{item.salePrice.toLocaleString()}</td>
                    <td className="py-1.5 text-right font-bold">
                      {(item.salePrice * item.qty).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-black font-bold text-[10.5px]">
                  <td colSpan={2} className="pt-1.5">Total Items: {totalItemsCount}</td>
                  <td className="pt-1.5 text-center">{totalQty} pcs</td>
                  <td colSpan={2} className="pt-1.5 text-right">Subtotal: {settings.currency} {sale.subtotal.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <div className="space-y-1.5">
              {sale.items.map((item, idx) => (
                <div key={idx} className="pb-1 border-b border-dotted border-gray-400 last:border-b-0">
                  <div className="font-bold leading-tight">{item.name}</div>
                  {item.boxCount && item.boxCount > 0 ? (
                    <div className="text-[9px] font-bold">Box/Cartons: {item.boxCount}</div>
                  ) : null}
                  {item.imei && <div className="text-[9px] break-all">IMEI: {item.imei}</div>}
                  <div className="flex justify-between items-center text-[10.5px] mt-0.5">
                    <span>
                      {item.qty} × {settings.currency} {item.salePrice.toLocaleString()}
                    </span>
                    <span className="font-black">
                      {settings.currency} {(item.salePrice * item.qty).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Print Total Calculations Directly Underneath Products */}
        <div className="py-2 border-b border-black text-[11px] space-y-1">
          <div className="flex justify-between font-bold">
            <span>Total Quantity ({totalItemsCount} {totalItemsCount === 1 ? 'item' : 'items'}):</span>
            <span>{totalQty} {totalQty === 1 ? 'pc' : 'pcs'}</span>
          </div>
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span>
              {settings.currency} {sale.subtotal.toLocaleString()}
            </span>
          </div>
          {sale.discount > 0 && (
            <div className="flex justify-between">
              <span>Discount:</span>
              <span>
                -{settings.currency} {sale.discount.toLocaleString()}
              </span>
            </div>
          )}
          {sale.previousBalance !== undefined && sale.previousBalance > 0 && (
            <div className="flex justify-between font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded">
              <span>Previous Balance Due:</span>
              <span>
                {settings.currency} {sale.previousBalance.toLocaleString()}
              </span>
            </div>
          )}
          <div className="flex justify-between font-black text-[13px] pt-1 border-t border-black">
            <span>GRAND TOTAL:</span>
            <span>
              {settings.currency} {grandTotal.toLocaleString()}
            </span>
          </div>
          {sale.totalOutstanding !== undefined && sale.totalOutstanding > 0 && (
            <div className="flex justify-between font-black text-white bg-rose-700 px-1.5 py-1 rounded">
              <span>TOTAL OUTSTANDING:</span>
              <span>
                {settings.currency} {sale.totalOutstanding.toLocaleString()}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Paid ({sale.paymentMethod || 'Cash'}):</span>
            <span className="font-bold">
              {settings.currency} {amountPaid.toLocaleString()}
            </span>
          </div>
          {amountDue > 0 && (
            <div className="flex justify-between font-bold">
              <span>Remaining Balance:</span>
              <span>
                {settings.currency} {amountDue.toLocaleString()}
              </span>
            </div>
          )}
        </div>

        {/* Print Note */}
        {sale.notes && (
          <div
            dir="auto"
            className="mt-2 p-1.5 border border-dashed border-black text-[10px] font-semibold whitespace-pre-wrap text-left"
          >
            <span className="font-black uppercase text-[9px] mr-1">Note:</span>
            {sale.notes}
          </div>
        )}

        {/* Print Footer */}
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
      {/* SCREEN MODAL (Zero Inner Scroll, Full Clean Screen Layout)     */}
      {/* ============================================================== */}
      <div
        className={`print:hidden bg-white rounded-2xl w-full p-2.5 sm:p-4 shadow-2xl space-y-2.5 border border-slate-200 my-auto animate-in fade-in zoom-in-95 ${
          isA4 ? 'max-w-4xl' : 'max-w-2xl'
        }`}
      >
        {/* Top Modal Header + Layout Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg shrink-0">
                <Printer className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                <h3 className="font-black text-slate-900 text-sm sm:text-base leading-tight truncate">
                  Invoice #{sale.invNo}
                </h3>
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-[9.5px] font-black tracking-wider uppercase ${paymentStatusColor}`}
                >
                  {paymentStatusText}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="sm:hidden text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer shrink-0"
              aria-label="Close invoice"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2">
            {/* Print Layout Switcher (Visually Switches Screen Preview + Print Size) */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-[10.5px] font-bold">
              <button
                type="button"
                onClick={() => setPrintFormat('thermal-80')}
                className={`px-2 sm:px-2.5 py-1 rounded-lg transition cursor-pointer whitespace-nowrap ${
                  printFormat === 'thermal-80'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                80mm
              </button>
              <button
                type="button"
                onClick={() => setPrintFormat('thermal-58')}
                className={`px-2 sm:px-2.5 py-1 rounded-lg transition cursor-pointer whitespace-nowrap ${
                  printFormat === 'thermal-58'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                58mm
              </button>
              <button
                type="button"
                onClick={() => setPrintFormat('a4')}
                className={`px-2 sm:px-2.5 py-1 rounded-lg transition cursor-pointer whitespace-nowrap ${
                  printFormat === 'a4'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                A4 Size
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="hidden sm:inline-flex text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer shrink-0"
              aria-label="Close invoice"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Return Status Alert */}
        {sale.returnStatus && sale.returnStatus !== 'NONE' && (
          <div
            className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold flex items-center justify-between ${
              sale.returnStatus === 'FULL'
                ? 'bg-rose-50 border-rose-200 text-rose-700'
                : 'bg-amber-50 border-amber-200 text-amber-700'
            }`}
          >
            <span>
              {sale.returnStatus === 'FULL'
                ? '⚠️ This sale invoice has been fully returned & refunded.'
                : '⚠️ This sale invoice has items partially returned.'}
            </span>
            {sale.totalRefunded && sale.totalRefunded > 0 && (
              <span className="tabular-nums">
                Total Refunded: {settings.currency} {sale.totalRefunded.toLocaleString()}
              </span>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* UNIFIED ZERO-SCROLL INVOICE SHEET (Responsive to 80mm/58mm/A4) */}
        {/* ============================================================== */}
        <div className="bg-slate-100/80 border border-slate-200/80 rounded-xl p-2 sm:p-3">
          <div
            className={`bg-white border border-slate-300 rounded-xl shadow-xs tabular-nums text-slate-800 space-y-2 transition-all duration-200 ${previewSheetWidthClass}`}
          >
            {/* Shop Header */}
            <div className="flex items-center justify-between gap-2 border-b border-dashed border-slate-300 pb-2">
              <div className="flex items-center gap-2 min-w-0">
                {logoSrc ? (
                  <div
                    className={`${
                      is58 ? 'w-8 h-8' : 'w-10 h-10'
                    } rounded-full overflow-hidden shrink-0 flex items-center justify-center`}
                  >
                    <img
                      src={logoSrc}
                      alt={settings.shopName}
                      className="w-full h-full object-cover rounded-full"
                    />
                  </div>
                ) : (
                  <div
                    className={`${
                      is58 ? 'w-8 h-8' : 'w-9 h-9'
                    } bg-blue-600 text-white rounded-full flex items-center justify-center font-black shrink-0`}
                  >
                    <Store className="w-4 h-4" />
                  </div>
                )}
                <div className="min-w-0">
                  <h2
                    className={`font-black uppercase tracking-wide text-slate-900 truncate ${
                      is58 ? 'text-[11px]' : isA4 ? 'text-sm sm:text-base' : 'text-xs'
                    }`}
                  >
                    {settings.shopName}
                  </h2>
                  <p className="text-[9.5px] sm:text-[10px] text-slate-500 truncate">
                    {settings.address} {settings.phone ? `• Ph: ${settings.phone}` : ''}
                  </p>
                </div>
              </div>
              {sale.saleMode === 'wholesale' && (
                <span className="px-1.5 py-0.5 rounded bg-purple-100 border border-purple-300 text-purple-900 font-extrabold text-[9px] shrink-0">
                  WHOLESALE
                </span>
              )}
            </div>

            {/* Customer & Invoice Info */}
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] sm:text-[11px] text-slate-600 border-b border-dashed border-slate-300 pb-2">
              <div className="truncate">
                Customer: <strong className="text-slate-900">{sale.custName || 'Walk-in'}</strong>
              </div>
              <div className="text-right truncate">
                Date:{' '}
                <strong className="text-slate-800">
                  {new Date(sale.date).toLocaleDateString()}
                </strong>
              </div>
              {sale.custPhone && (
                <div className="truncate">
                  Phone: <strong className="text-slate-800">{sale.custPhone}</strong>
                </div>
              )}
              <div className={`${sale.custPhone ? 'text-right' : 'col-span-2'} truncate`}>
                Time:{' '}
                <strong className="text-slate-800">
                  {new Date(sale.date).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </strong>
              </div>
              {sale.retailerShopName && (
                <div className="col-span-2 truncate">
                  Shop: <strong className="text-slate-800">{sale.retailerShopName}</strong>
                </div>
              )}
              {(sale.retailerCity || sale.retailerNtn) && (
                <div className="col-span-2 truncate">
                  {sale.retailerCity ? `City: ${sale.retailerCity}` : ''}
                  {sale.retailerCity && sale.retailerNtn ? ' • ' : ''}
                  {sale.retailerNtn ? `NTN/GST: ${sale.retailerNtn}` : ''}
                </div>
              )}
            </div>

            {/* Products List — Full Height (Zero Scroll), Prices Directly Under Product & Totals Below */}
            <div className="border-b border-dashed border-slate-300 pb-2">
              {isA4 ? (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-300 text-slate-500 font-extrabold uppercase text-[10px]">
                      <th className="pb-1.5 w-6">#</th>
                      <th className="pb-1.5">Product &amp; Specs / IMEI</th>
                      <th className="pb-1.5 text-center w-12">Qty</th>
                      <th className="pb-1.5 text-right w-24">Price</th>
                      <th className="pb-1.5 text-right w-24">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70">
                    {sale.items.map((item, idx) => (
                      <tr key={idx} className="align-top">
                        <td className="py-1.5 text-slate-400 font-bold">{idx + 1}</td>
                        <td className="py-1.5 pr-2">
                          <div className="font-bold text-slate-900 leading-tight">{item.name}</div>
                          {item.boxCount && item.boxCount > 0 ? (
                            <div className="text-[10px] text-purple-700 font-bold">
                              Boxes/Cartons: {item.boxCount}
                            </div>
                          ) : null}
                          {item.imei && (
                            <div className="text-[10px] text-blue-700 font-semibold flex items-center gap-1 mt-0.5 break-all">
                              <Smartphone className="w-2.5 h-2.5 text-blue-500 shrink-0" />
                              <span>IMEI: {item.imei}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-1.5 text-center font-bold text-slate-800">{item.qty}</td>
                        <td className="py-1.5 text-right text-slate-700 font-semibold">
                          {settings.currency} {item.salePrice.toLocaleString()}
                        </td>
                        <td className="py-1.5 text-right font-black text-slate-900">
                          {settings.currency} {(item.salePrice * item.qty).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-300 bg-slate-50/80 text-[11px] font-extrabold text-slate-800">
                      <td colSpan={2} className="py-1.5 px-1">
                        Total Products: {totalItemsCount}
                      </td>
                      <td className="py-1.5 text-center text-blue-700">{totalQty}</td>
                      <td colSpan={2} className="py-1.5 text-right">
                        Total Qty: {totalQty} {totalQty === 1 ? 'pc' : 'pcs'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <div className="divide-y divide-slate-200/70">
                  <div className="flex items-center justify-between text-[9.5px] font-extrabold uppercase text-slate-500 pb-1 border-b border-slate-300">
                    <span>Product &amp; Rate</span>
                    <span>Total</span>
                  </div>
                  {sale.items.map((item, idx) => (
                    <div key={idx} className="py-1.5 space-y-0.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-900 leading-tight break-words">
                            {item.name}
                          </div>
                          {item.boxCount && item.boxCount > 0 ? (
                            <div className="text-[9px] text-purple-700 font-bold">
                              Boxes/Cartons: {item.boxCount}
                            </div>
                          ) : null}
                          {item.imei && (
                            <div className="text-[9px] text-blue-700 font-semibold flex items-start gap-1 mt-0.5 break-all">
                              <Smartphone className="w-2.5 h-2.5 text-blue-500 shrink-0 mt-0.5" />
                              <span>IMEI: {item.imei}</span>
                            </div>
                          )}
                          {/* Price cleanly right underneath product name */}
                          <div className="text-[10px] font-semibold text-slate-600 mt-0.5">
                            {item.qty} × {settings.currency} {item.salePrice.toLocaleString()}
                          </div>
                        </div>
                        <div className="text-right font-black text-slate-900 shrink-0">
                          {settings.currency} {(item.salePrice * item.qty).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Price & Payment Totals Directly Below Products Inside the Same Invoice */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 sm:p-2.5 space-y-1">
              <div className="flex justify-between text-slate-700 font-bold pb-1 border-b border-slate-200/70">
                <span>
                  {is58 ? 'Total Qty:' : `Total Quantity (${totalItemsCount} ${totalItemsCount === 1 ? 'item' : 'items'}):`}
                </span>
                <span className="text-slate-900 font-extrabold">
                  {totalQty} {totalQty === 1 ? 'pc' : 'pcs'}
                </span>
              </div>

              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span className="font-bold text-slate-800">
                  {settings.currency} {sale.subtotal.toLocaleString()}
                </span>
              </div>

              {sale.discount > 0 && (
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span>Discount / Tier:</span>
                  <span>
                    -{settings.currency} {sale.discount.toLocaleString()}
                  </span>
                </div>
              )}

              {sale.previousBalance !== undefined && sale.previousBalance > 0 && (
                <div className="flex justify-between font-bold text-rose-700 bg-rose-50 px-2 py-1 rounded-lg">
                  <span>Previous Balance Due:</span>
                  <span>
                    {settings.currency} {sale.previousBalance.toLocaleString()}
                  </span>
                </div>
              )}

              <div className="flex justify-between items-center font-black text-slate-900 pt-1 border-t border-slate-200">
                <span className={is58 ? 'text-xs' : 'text-sm'}>GRAND TOTAL:</span>
                <span className={`${is58 ? 'text-sm' : 'text-base'} text-blue-700`}>
                  {settings.currency} {grandTotal.toLocaleString()}
                </span>
              </div>

              {sale.totalOutstanding !== undefined && sale.totalOutstanding > 0 && (
                <div className="flex justify-between font-black text-white bg-rose-600 px-2 py-1.5 rounded-lg text-xs">
                  <span>TOTAL OUTSTANDING:</span>
                  <span>
                    {settings.currency} {sale.totalOutstanding.toLocaleString()}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-emerald-700 font-bold pt-1 border-t border-slate-200/70">
                <span>Paid ({sale.paymentMethod || 'Cash'}):</span>
                <span>
                  {settings.currency} {amountPaid.toLocaleString()}
                </span>
              </div>

              {amountDue > 0 && (
                <div className="flex justify-between text-rose-600 font-black pt-1 border-t border-dashed border-rose-200">
                  <span>Remaining Balance:</span>
                  <span>
                    {settings.currency} {amountDue.toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {/* Custom Per-Bill Note Preview */}
            {sale.notes && (
              <div
                dir="auto"
                className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 text-left text-[10.5px] text-slate-800 whitespace-pre-wrap"
              >
                <span className="font-extrabold text-[9px] uppercase tracking-wider text-amber-800 mr-1">
                  Note:
                </span>
                {sale.notes}
              </div>
            )}

            {/* Compact Footer & Return Policy */}
            <div className="pt-1.5 border-t border-dashed border-slate-300 flex items-center justify-between gap-2 text-[9px] sm:text-[9.5px] text-slate-500">
              <div className="flex items-center gap-1 shrink-0 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                <QrCode className="w-4 h-4 text-slate-800" />
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

        {/* ============================================================== */}
        {/* COMPACT ACTION BAR                                             */}
        {/* ============================================================== */}
        <div className="space-y-1.5 pt-0.5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center justify-center gap-1.5 py-2 px-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold shadow-xs transition cursor-pointer"
              title={`Print using ${is58 ? '58mm Mini' : is80 ? '80mm Thermal' : 'A4 Size'} layout`}
            >
              <Printer className="w-3.5 h-3.5 shrink-0" />
              <span>Print ({is58 ? '58mm' : is80 ? '80mm' : 'A4'})</span>
            </button>

            <button
              type="button"
              onClick={() => setIsShareModalOpen(true)}
              className="flex items-center justify-center gap-1.5 py-2 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-xs transition cursor-pointer"
              title="Share via WhatsApp (Text or Invoice Photo to Customer / Owner)"
            >
              <Share2 className="w-3.5 h-3.5 shrink-0" />
              <span>Share Bill</span>
            </button>

            <button
              type="button"
              onClick={handleBluetoothPrint}
              disabled={isPrintingBluetooth}
              className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-xs font-extrabold transition cursor-pointer shadow-xs ${
                isPrintingBluetooth
                  ? 'bg-indigo-100 text-indigo-800 cursor-wait border border-indigo-300'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
              title="Bluetooth ESC/POS Thermal Print"
            >
              {isPrintingBluetooth ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span>BT Print...</span>
                </>
              ) : (
                <>
                  <Bluetooth className="w-3.5 h-3.5 shrink-0" />
                  <span>BT {is58 ? '58mm' : '80mm'}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleCopyText}
              className="flex items-center justify-center gap-1.5 py-2 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-500" />
              )}
              <span>{copied ? 'Copied!' : 'Copy Text'}</span>
            </button>
          </div>

          {(onOpenSalesReturn || onEditSale || onDeleteSale) && (
            <div className="grid grid-cols-3 gap-1.5">
              {onOpenSalesReturn && sale.returnStatus !== 'FULL' && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSalesReturn(sale);
                  }}
                  className="flex items-center justify-center gap-1 py-1.5 px-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-[11px] font-bold transition cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3 shrink-0" />
                  <span>Return</span>
                </button>
              )}

              {onEditSale && sale.status !== 'CANCELLED' && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onEditSale(sale);
                  }}
                  className="flex items-center justify-center gap-1 py-1.5 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-[11px] font-bold transition cursor-pointer"
                >
                  <Edit className="w-3 h-3 shrink-0 text-blue-600" />
                  <span>Edit</span>
                </button>
              )}

              {onDeleteSale && (
                <button
                  type="button"
                  onClick={() => {
                    setDeleteMode(sale.status === 'CANCELLED' ? 'permanent' : 'cancel');
                    setDeleteConfirmOpen(true);
                  }}
                  className={`flex items-center justify-center gap-1 py-1.5 px-2 border rounded-xl text-[11px] font-bold transition cursor-pointer ${
                    sale.status === 'CANCELLED'
                      ? 'bg-rose-100 hover:bg-rose-200 text-rose-800 border-rose-300'
                      : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                  }`}
                >
                  <Trash2 className="w-3 h-3 shrink-0 text-rose-600" />
                  <span>{sale.status === 'CANCELLED' ? 'Purge' : 'Void'}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Interactive Share Dialog (Recipient + Text vs Invoice Photo) */}
      <InvoiceShareModal
        sale={sale}
        settings={settings}
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
      />

      {/* Delete / Void confirmation dialog inside InvoiceModal */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in">
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
                  <p className="font-bold text-xs text-slate-900">Void &amp; Cancel (Restore Stock)</p>
                  <p className="text-[11px] text-slate-500">
                    Restores inventory stock and marks invoice status as CANCELLED.
                  </p>
                </div>
                <div
                  onClick={() => setDeleteMode('permanent')}
                  className={`p-2.5 rounded-xl border text-left cursor-pointer transition ${
                    deleteMode === 'permanent' ? 'border-rose-400 bg-rose-50' : 'border-slate-200'
                  }`}
                >
                  <p className="font-bold text-xs text-rose-700">Permanently Delete</p>
                  <p className="text-[11px] text-slate-500">
                    Completely purges this record from the database.
                  </p>
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
