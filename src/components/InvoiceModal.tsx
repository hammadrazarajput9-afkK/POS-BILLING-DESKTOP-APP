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

  const [isPrintingBluetooth, setIsPrintingBluetooth] = useState(false);

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

        {/* Footer & Return Policy */}
        <div className="pt-3 text-center text-[10px] space-y-1">
          <p className="font-semibold">{settings.returnPolicy || settings.receiptFooter || 'Thank you for your business!'}</p>
          <p className="text-[8px] text-gray-500">System Generated Invoice</p>
        </div>
      </div>

      {/* ============================================================== */}
      {/* SCREEN MODAL DIALOG (Interactive preview with options) */}
      {/* ============================================================== */}
      <div className="print:hidden bg-white rounded-2xl max-w-lg w-full max-w-full overflow-x-hidden p-3.5 sm:p-6 shadow-2xl space-y-4 border border-slate-100 my-auto animate-in fade-in zoom-in-95 max-h-[92vh] flex flex-col">
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl shrink-0">
              <Printer className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-slate-900 text-sm sm:text-base leading-tight truncate">
                Customer Invoice & Receipt
              </h3>
              <p className="text-[11px] text-slate-400 truncate">
                Invoice #{sale.invNo} • {new Date(sale.date).toLocaleDateString()}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer shrink-0 ml-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Print Format Switcher Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 bg-slate-50 p-1.5 rounded-xl border border-slate-200 text-xs shrink-0">
          <span className="text-[11px] font-bold text-slate-500 pl-2">Print Layout:</span>
          <div className="grid grid-cols-3 sm:flex gap-1 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setPrintFormat('thermal-80')}
              className={`px-2.5 py-1.5 sm:py-1 rounded-lg font-bold text-[11px] text-center transition cursor-pointer ${
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
              className={`px-2.5 py-1.5 sm:py-1 rounded-lg font-bold text-[11px] text-center transition cursor-pointer ${
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
              className={`px-2.5 py-1.5 sm:py-1 rounded-lg font-bold text-[11px] text-center transition cursor-pointer ${
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
        <div className="overflow-y-auto overflow-x-hidden pr-1 flex-1">
          <div
            className={`mx-auto bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 font-mono text-xs text-slate-800 space-y-4 shadow-inner w-full overflow-x-hidden ${
              printFormat === 'thermal-58' ? 'max-w-xs' : 'max-w-md'
            }`}
          >
            {/* Shop Header */}
            <div className="text-center border-b border-dashed border-slate-300 pb-3 space-y-1">
              {logoSrc ? (
                <div className="flex justify-center mb-2">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden bg-white p-0.5 shadow-2xs flex items-center justify-center">
                    <img
                      src={logoSrc}
                      alt={settings.shopName}
                      className="w-full h-full object-cover rounded-full"
                    />
                  </div>
                </div>
              ) : (
                <div className="w-12 h-12 bg-blue-600 text-white rounded-full mx-auto flex items-center justify-center font-black mb-1 shadow-xs">
                  <Store className="w-6 h-6" />
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
              {sale.saleMode === 'wholesale' && (
                <div className="bg-purple-100 border border-purple-300 text-purple-900 rounded-lg p-1.5 text-center font-extrabold text-[11px] mb-2 flex items-center justify-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse"></span>
                  <span>WHOLESALE B2B BILL</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-slate-900">
                <span>Invoice: #{sale.invNo}</span>
                <span>{new Date(sale.date).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Retailer / Buyer: <strong className="text-slate-800">{sale.custName || 'Walk-in'}</strong></span>
                <span>{new Date(sale.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              {sale.retailerShopName && (
                <div>Shop Name: <span className="font-extrabold text-slate-800">{sale.retailerShopName}</span></div>
              )}
              {sale.retailerCity && (
                <div>City: <span className="font-semibold text-slate-800">{sale.retailerCity}</span></div>
              )}
              {sale.retailerNtn && (
                <div>NTN/GST: <span className="font-mono text-slate-800">{sale.retailerNtn}</span></div>
              )}
              {sale.custPhone && (
                <div>Phone: <span className="font-semibold text-slate-800">{sale.custPhone}</span></div>
              )}
            </div>

            {/* Itemized Table */}
            <div className="border-b border-dashed border-slate-300 pb-3 overflow-x-auto">
              <table className="w-full text-left text-[11px] min-w-[520px] lg:min-w-0">
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
                        {item.boxCount && item.boxCount > 0 ? (
                          <div className="text-[10px] text-purple-700 font-bold">
                            📦 {item.boxCount} Cartons / Boxes
                          </div>
                        ) : null}
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

              {sale.wholesaleSavings && sale.wholesaleSavings > 0 ? (
                <div className="flex justify-between text-purple-700 font-extrabold bg-purple-50 p-1.5 rounded-lg border border-purple-200">
                  <span>Wholesale B2B Savings:</span>
                  <span>{settings.currency} {sale.wholesaleSavings.toLocaleString()}</span>
                </div>
              ) : null}

              {sale.discount > 0 && (
                <div className="flex justify-between text-emerald-600 font-semibold">
                  <span>Discount / Tier:</span>
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

        {/* Return Status Alert */}
        {sale.returnStatus && sale.returnStatus !== 'NONE' && (
          <div className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between ${
            sale.returnStatus === 'FULL'
              ? 'bg-rose-50 border-rose-200 text-rose-700'
              : 'bg-amber-50 border-amber-200 text-amber-700'
          }`}>
            <span>
              {sale.returnStatus === 'FULL' ? '⚠️ This sale invoice has been fully returned & refunded.' : '⚠️ This sale invoice has items partially returned.'}
            </span>
            {sale.totalRefunded && sale.totalRefunded > 0 && (
              <span className="font-mono">
                Total Refunded: {settings.currency} {sale.totalRefunded.toLocaleString()}
              </span>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2 pt-2 border-t border-slate-100 shrink-0">
          {/* Quick Edit & Delete Row */}
          {(onEditSale || onDeleteSale) && (
            <div className="grid grid-cols-2 gap-2">
              {onEditSale && sale.status !== 'CANCELLED' && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onEditSale(sale);
                  }}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition cursor-pointer"
                  title="Load invoice in POS Cart to edit"
                >
                  <Edit className="w-3.5 h-3.5 text-blue-600" />
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
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 border rounded-xl text-xs font-bold transition cursor-pointer ${
                    sale.status === 'CANCELLED'
                      ? 'bg-rose-100 hover:bg-rose-200 text-rose-800 border-rose-300'
                      : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                  }`}
                  title={sale.status === 'CANCELLED' ? 'Delete Permanently' : 'Delete / Void Invoice'}
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>{sale.status === 'CANCELLED' ? 'Delete Permanently' : 'Delete / Void Invoice'}</span>
                </button>
              )}
            </div>
          )}

          {/* Direct Bluetooth Thermal Printer Action */}
          <button
            type="button"
            onClick={handleBluetoothPrint}
            disabled={isPrintingBluetooth}
            className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-extrabold transition cursor-pointer active:scale-98 shadow-sm ${
              isPrintingBluetooth
                ? 'bg-indigo-100 text-indigo-800 cursor-wait border border-indigo-300'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/20'
            }`}
            title="Connect & print directly to paired Bluetooth ESC/POS 80mm/58mm thermal printer"
          >
            {isPrintingBluetooth ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white shrink-0" />
                <span>Connecting to Bluetooth Printer...</span>
              </>
            ) : (
              <>
                <Bluetooth className="w-4 h-4 shrink-0" />
                <span>Print via Bluetooth Thermal Printer ({printFormat === 'thermal-58' ? '58mm' : '80mm'})</span>
              </>
            )}
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={handleCopyText}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-500" />}
              <span>{copied ? 'Copied!' : 'Copy Text'}</span>
            </button>

            <button
              type="button"
              onClick={handleWhatsApp}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer active:scale-95"
              title="Share itemized bill directly with customer on WhatsApp"
            >
              <Share2 className="w-4 h-4" />
              <span>Share via WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold shadow-lg shadow-blue-600/25 transition cursor-pointer active:scale-95"
              title="Standard browser print dialog (A4 or thermal driver)"
            >
              <Printer className="w-4 h-4" />
              <span>Standard Print</span>
            </button>
          </div>

          {onOpenSalesReturn && sale.returnStatus !== 'FULL' && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenSalesReturn(sale);
              }}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              <span className="text-base">↩️</span>
              <span>Sales Return & Refund for Inv #{sale.invNo}</span>
            </button>
          )}
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
                <p className="text-xs text-slate-500 mt-0.5 font-mono">Invoice #{sale.invNo}</p>
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
