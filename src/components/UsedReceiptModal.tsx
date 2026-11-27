import React, { useEffect, useState } from 'react';
import {
  X,
  Printer,
  Share2,
  FileText,
  Edit,
  Copy,
  Check,
  Store,
  Smartphone,
  ShieldCheck,
  Calendar,
  User,
  Wrench,
} from 'lucide-react';
import { InventoryItem, ShopSettings, SupplierPurchase } from '../types';
import { useToast } from './Toast';
import { extractItemImeis } from '../utils/imeiManager';

interface UsedReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: InventoryItem | null;
  settings: ShopSettings;
  supplierPurchases?: SupplierPurchase[];
  onEditItem?: (item: InventoryItem) => void;
}

export const UsedReceiptModal: React.FC<UsedReceiptModalProps> = ({
  isOpen,
  onClose,
  item,
  settings,
  supplierPurchases = [],
  onEditItem,
}) => {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleHardwareBack = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    window.addEventListener('pos-hardware-back', handleHardwareBack);
    return () => window.removeEventListener('pos-hardware-back', handleHardwareBack);
  }, [isOpen, onClose]);

  if (!isOpen || !item) return null;

  const currency = settings.currency || 'Rs';
  const shopName = settings.shopName || 'Mobile Store';
  const shopPhone = settings.phone || '';
  const shopAddress = settings.address || '';
  const logoSrc = settings.logo || settings.shopLogo;

  const itemImeis = extractItemImeis(item);
  const itemImeiSet = new Set(itemImeis.map(i => i.toLowerCase()));
  const cleanItemBase = item.name.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();

  // Match supplier/party purchase record via IMEI, barcode, or exact name + category
  const matchedPurchase = supplierPurchases.find(p => {
    if (!p || p.status === 'REVERSED') return false;
    return (p.items || []).some(pi => {
      const piImeis = [
        ...(pi.imeis || []),
        ...(pi.imei ? pi.imei.split(',').map(s => s.trim()) : []),
      ].filter(Boolean);
      if (piImeis.some(im => itemImeiSet.has(im.toLowerCase()))) return true;
      if (item.barcode && pi.barcode && pi.barcode.toLowerCase() === item.barcode.toLowerCase()) return true;
      const piBase = (pi.name || '').replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
      return piBase === cleanItemBase && (pi.category || '').toLowerCase() === (item.category || '').toLowerCase();
    });
  });

  const matchedPurchaseItem = matchedPurchase?.items?.find(pi => {
    const piImeis = [
      ...(pi.imeis || []),
      ...(pi.imei ? pi.imei.split(',').map(s => s.trim()) : []),
    ].filter(Boolean);
    if (piImeis.some(im => itemImeiSet.has(im.toLowerCase()))) return true;
    const piBase = (pi.name || '').replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
    return piBase === cleanItemBase;
  });

  const partyName =
    item.purchasedFrom?.trim() ||
    matchedPurchase?.partyName ||
    'Direct / Walk-in Seller';
  const partyPhone =
    item.purchasedPhone?.trim() ||
    matchedPurchase?.partyPhone ||
    '';
  const purchaseDate = matchedPurchase?.date || item.createdAt || new Date().toISOString();
  const slipNo =
    matchedPurchase?.billNo ||
    `USED-${(item.id || '').slice(-6).toUpperCase() || 'SLIP'}`;

  const specsLabel = [item.ram, item.storage, item.color].filter(Boolean).join(' • ');
  const conditionLabel =
    item.condition ||
    item.variants?.find(v => v.condition)?.condition ||
    '';

  const unitCost = Number(matchedPurchaseItem?.costPrice ?? item.costPrice) || 0;
  const qty = Math.max(1, Number(item.qty) || 1);
  const totalCost = unitCost * qty;

  const formattedDate = new Date(purchaseDate).toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const formattedTime = new Date(purchaseDate).toLocaleTimeString('en-PK', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const buildSlipText = () => {
    const lines = [
      `*USED MOBILE PURCHASE SLIP - ${shopName}*`,
      `Slip #: ${slipNo}`,
      `Date: ${formattedDate} ${formattedTime}`,
      `Purchased From: ${partyName}${partyPhone ? ` (${partyPhone})` : ''}`,
      `--------------------------------`,
      `*Device:* ${item.name}`,
      ...(specsLabel ? [`*Specs:* ${specsLabel}`] : []),
      ...(conditionLabel ? [`*Condition:* ${conditionLabel}`] : []),
      `*Category:* ${item.category}`,
      `*Qty:* ${qty} Pcs`,
      ...(itemImeis.length > 0 ? [`*IMEI:* ${itemImeis.join(', ')}`] : []),
      ...(item.note ? [`*Note:* ${item.note}`] : []),
      `--------------------------------`,
      `*Purchase Cost:* ${currency} ${unitCost.toLocaleString()} x ${qty}`,
      `*TOTAL PAID:* ${currency} ${totalCost.toLocaleString()}`,
    ];
    return lines.join('\n');
  };

  const handlePrint = () => {
    window.print();
    showToast('Printing used device purchase slip...', 'success');
  };

  const handleCopySlip = () => {
    navigator.clipboard.writeText(buildSlipText());
    setCopied(true);
    showToast('Purchase slip copied to clipboard', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareWhatsApp = async () => {
    const text = buildSlipText();
    const navAny = navigator as Navigator & { share?: (data?: ShareData) => Promise<void> };
    const cleanPhone = partyPhone.replace(/[^\d]/g, '');
    const waPhone = cleanPhone.startsWith('0') && cleanPhone.length === 11
      ? `92${cleanPhone.slice(1)}`
      : cleanPhone;

    if (waPhone) {
      const link = document.createElement('a');
      link.href = `https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Opening WhatsApp to share slip', 'success');
      return;
    }

    if (navAny.share) {
      try {
        await navAny.share({
          title: `Used Device Slip #${slipNo} - ${shopName}`,
          text,
        });
        showToast('Purchase slip shared!', 'success');
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }

    const link = document.createElement('a');
    link.href = `https://wa.me/?text=${encodeURIComponent(text)}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Opening WhatsApp to share slip', 'success');
  };

  const handleEditClick = () => {
    if (onEditItem) {
      onClose();
      onEditItem(item);
    }
  };

  return (
    <div
      id="invoice-modal-backdrop"
      className="fixed inset-0 z-[55] flex items-center justify-center glass-modal-backdrop animate-fade-in p-2 sm:p-4 print:static print:block print:p-0 print:bg-white"
    >
      <div className="w-full max-w-md glass-modal-panel rounded-2xl sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden animate-modal-pop max-h-[90dvh] print:max-h-none print:shadow-none print:rounded-none print:border-none">
        {/* Top Modal Header (Hidden on Print) */}
        <div className="no-print px-4 py-3 border-b border-slate-200/80 flex items-center justify-between bg-white/95 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <FileText className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-slate-900 truncate">
                Used Mobile Purchase Receipt
              </h3>
              <p className="text-[11px] font-medium text-slate-500 truncate">
                Slip #{slipNo} · Cost Record Only
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer transition shrink-0"
            aria-label="Close receipt"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Printable Invoice-Style Slip Body */}
        <div
          id="printable-purchase-area"
          className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 bg-white text-slate-900 tabular-nums"
        >
          {/* Shop Header */}
          <div className="text-center pb-3.5 border-b border-dashed border-slate-300 space-y-1">
            {logoSrc ? (
              <img
                src={logoSrc}
                alt={shopName}
                className="w-12 h-12 rounded-xl object-contain mx-auto mb-1 border border-slate-200"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-1">
                <Store className="w-5 h-5" />
              </div>
            )}
            <h2 className="text-base sm:text-lg font-black uppercase tracking-wide text-slate-950">
              {shopName}
            </h2>
            {shopAddress && <p className="text-[11px] text-slate-500">{shopAddress}</p>}
            {shopPhone && <p className="text-[11px] font-semibold text-slate-600">Ph: {shopPhone}</p>}
            <div className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-black uppercase tracking-wider px-3 py-0.5 rounded-full mt-1.5">
              Used Mobile Purchase Slip · #{slipNo}
            </div>
          </div>

          {/* Purchase Party & Date Meta Box */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-2 text-xs">
            <div className="flex items-start justify-between gap-2">
              <span className="text-slate-500 font-medium inline-flex items-center gap-1.5 shrink-0">
                <User className="w-3.5 h-3.5 text-blue-600" /> Purchased From:
              </span>
              <div className="text-right">
                <span className="font-extrabold text-slate-900 block">{partyName}</span>
                {partyPhone && (
                  <span className="text-[11px] font-semibold text-slate-500">{partyPhone}</span>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-200/70">
              <span className="text-slate-500 font-medium inline-flex items-center gap-1.5 shrink-0">
                <Calendar className="w-3.5 h-3.5 text-blue-600" /> Purchase Date:
              </span>
              <span className="font-bold text-slate-800">
                {formattedDate} · {formattedTime}
              </span>
            </div>
          </div>

          {/* Device Details Table (Like Invoice Items) */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-100/90 px-3 py-2 flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-600 border-b border-slate-200">
              <span>Device Details</span>
              <span>Cost ({currency})</span>
            </div>

            <div className="p-3 space-y-2.5 text-xs">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Smartphone className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span className="font-black text-slate-900 text-sm">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200/70 px-2 py-0.5 rounded">
                      {item.category}
                    </span>
                    {specsLabel && (
                      <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                        {specsLabel}
                      </span>
                    )}
                    {conditionLabel && (
                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded border inline-flex items-center gap-1 ${
                          conditionLabel === 'Repairable'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}
                      >
                        {conditionLabel === 'Repairable' ? (
                          <Wrench className="w-2.5 h-2.5" />
                        ) : (
                          <ShieldCheck className="w-2.5 h-2.5" />
                        )}
                        Cond: {conditionLabel}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] font-semibold text-slate-500">
                    Qty: {qty} {qty === 1 ? 'Unit' : 'Units'} × {currency} {unitCost.toLocaleString()}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="font-black text-slate-900 text-sm block">
                    {currency} {totalCost.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* IMEI Numbers */}
              {itemImeis.length > 0 && (
                <div className="pt-2 border-t border-dashed border-slate-200">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1">
                    IMEI / Serial Numbers ({itemImeis.length})
                  </span>
                  <div className="bg-slate-50 border border-slate-200/70 p-2 rounded-lg space-y-0.5">
                    {itemImeis.map((im, idx) => (
                      <div key={idx} className="font-mono text-[11px] font-semibold text-slate-800">
                        #{idx + 1}: {im}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes if present */}
              {item.note && (
                <div className="pt-2 border-t border-dashed border-slate-200 text-[11px]">
                  <span className="font-bold text-slate-500">Note: </span>
                  <span className="font-medium text-slate-800">{item.note}</span>
                </div>
              )}
            </div>
          </div>

          {/* Total Purchase Cost Strip (Strictly NO Sale Price) */}
          <div className="bg-slate-900 text-white rounded-2xl p-3.5 flex items-center justify-between shadow-sm">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 block">
                Total Purchase Cost
              </span>
              <span className="text-[11px] text-slate-400">
                {qty} {qty === 1 ? 'Piece' : 'Pieces'} Inward Cost
              </span>
            </div>
            <span className="text-xl font-black text-white">
              {currency} {totalCost.toLocaleString()}
            </span>
          </div>

          <div className="text-center text-[10px] text-slate-400 pt-1 border-t border-dashed border-slate-200">
            Verified Used Mobile Inward Record · {shopName}
          </div>
        </div>

        {/* Bottom Invoice-Style Action Bar (Share, Print, Edit, Copy) */}
        <div className="no-print p-3 sm:p-4 bg-slate-50 border-t border-slate-200 grid grid-cols-2 sm:flex items-center gap-2 shrink-0">
          {onEditItem && (
            <button
              type="button"
              onClick={handleEditClick}
              className="py-2.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition"
            >
              <Edit className="w-3.5 h-3.5" /> Edit
            </button>
          )}
          <button
            type="button"
            onClick={handleCopySlip}
            className="py-2.5 px-3 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={handleShareWhatsApp}
            className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm flex items-center justify-center gap-1.5 cursor-pointer transition"
          >
            <Share2 className="w-3.5 h-3.5" /> Share
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-sm flex items-center justify-center gap-1.5 cursor-pointer transition"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
        </div>
      </div>
    </div>
  );
};
