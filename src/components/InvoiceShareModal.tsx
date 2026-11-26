import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { SaleRecord, ShopSettings } from '../types';
import {
  X,
  Share2,
  User,
  Store,
  Users,
  FileText,
  Image as ImageIcon,
  Download,
  MessageCircle,
  Loader2,
  Phone,
} from 'lucide-react';
import { useToast } from './Toast';
import {
  formatPhoneNumberForWhatsApp,
  shareInvoiceOnWhatsApp,
} from '../utils/whatsappInvoice';
import { generateInvoicePreviewImage } from '../utils/invoiceImageGenerator';

interface InvoiceShareModalProps {
  sale: SaleRecord | null;
  settings: ShopSettings;
  isOpen: boolean;
  onClose: () => void;
}

type ShareRecipient = 'customer' | 'owner' | 'both';
type ShareFormat = 'text' | 'image';

export const InvoiceShareModal: React.FC<InvoiceShareModalProps> = ({
  sale,
  settings,
  isOpen,
  onClose,
}) => {
  const { showToast } = useToast();
  const [recipient, setRecipient] = useState<ShareRecipient>(() =>
    sale?.custPhone?.trim() ? 'customer' : settings.phone?.trim() ? 'owner' : 'customer'
  );
  const [format, setFormat] = useState<ShareFormat>('text');
  const [customerPhoneInput, setCustomerPhoneInput] = useState('');
  const [ownerPhoneInput, setOwnerPhoneInput] = useState('');
  const [previewDataUrl, setPreviewDataUrl] = useState<string>('');
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewFileName, setPreviewFileName] = useState<string>('Invoice.png');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  useEffect(() => {
    if (!isOpen || !sale) return;
    setCustomerPhoneInput(sale.custPhone || '');
    setOwnerPhoneInput(settings.phone || '');
    setRecipient(sale.custPhone?.trim() ? 'customer' : 'owner');
    setPreviewDataUrl('');
    setPreviewBlob(null);
  }, [isOpen, sale, settings.phone]);

  useEffect(() => {
    if (!isOpen || !sale || format !== 'image') return;
    let cancelled = false;
    setIsGeneratingImage(true);
    generateInvoicePreviewImage(sale, settings)
      .then(res => {
        if (cancelled) return;
        setPreviewDataUrl(res.dataUrl);
        setPreviewBlob(res.blob);
        setPreviewFileName(res.fileName);
      })
      .catch(() => {
        if (!cancelled) showToast('Could not generate invoice preview photo', 'error');
      })
      .finally(() => {
        if (!cancelled) setIsGeneratingImage(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, sale, settings, format, showToast]);

  useEffect(() => {
    if (!isOpen) return;
    const handleHardwareBack = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    window.addEventListener('pos-hardware-back', handleHardwareBack);
    return () => window.removeEventListener('pos-hardware-back', handleHardwareBack);
  }, [isOpen, onClose]);

  if (!isOpen || !sale) return null;

  const targetCustomerPhone = customerPhoneInput.trim();
  const targetOwnerPhone = ownerPhoneInput.trim();

  const handleSendTextToPhone = (phone: string, label: string) => {
    shareInvoiceOnWhatsApp(sale, settings, phone);
    showToast(`Opening WhatsApp for ${label} (Invoice #${sale.invNo})`, 'success');
  };

  const handleDownloadPhoto = () => {
    if (!previewDataUrl) return;
    const link = document.createElement('a');
    link.href = previewDataUrl;
    link.download = previewFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Invoice Photo saved!', 'success');
  };

  const openWhatsAppChatWithCaption = (phone: string) => {
    const cleanPhone = formatPhoneNumberForWhatsApp(phone);
    const caption = encodeURIComponent(
      `Invoice #${sale.invNo} - ${settings.shopName}\nTotal: ${settings.currency} ${(sale.grandTotal || 0).toLocaleString()}`
    );
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${caption}`
      : `https://wa.me/?text=${caption}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleSharePhotoAction = async (overridePhone?: string) => {
    if (!previewBlob) {
      showToast('Generating invoice photo, please wait...', 'info');
      return;
    }

    const file = new File([previewBlob], previewFileName, { type: 'image/png' });
    const navAny = navigator as Navigator & {
      canShare?: (data?: ShareData) => boolean;
      share?: (data?: ShareData) => Promise<void>;
    };

    if (navAny.share && navAny.canShare && navAny.canShare({ files: [file] })) {
      try {
        await navAny.share({
          files: [file],
          title: `Invoice #${sale.invNo} - ${settings.shopName}`,
          text: `Invoice #${sale.invNo} (${settings.currency} ${(sale.grandTotal || 0).toLocaleString()})`,
        });
        showToast('Invoice Photo shared!', 'success');
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }

    // Fallback when direct file Web Share API is unavailable (e.g., desktop Chrome / iframe)
    try {
      if (navigator.clipboard && 'ClipboardItem' in window) {
        const ClipboardItemCtor = (window as unknown as {
          ClipboardItem: new (items: Record<string, Blob>) => ClipboardItem;
        }).ClipboardItem;
        await navigator.clipboard.write([new ClipboardItemCtor({ 'image/png': previewBlob })]);
        showToast('Invoice Photo copied & downloaded — paste directly in WhatsApp chat!', 'success');
      } else {
        showToast('Invoice Photo downloaded — attach it in WhatsApp chat!', 'info');
      }
    } catch {
      showToast('Invoice Photo downloaded — attach it in WhatsApp chat!', 'info');
    }

    handleDownloadPhoto();
    const phoneToOpen =
      overridePhone !== undefined
        ? overridePhone
        : recipient === 'owner'
        ? targetOwnerPhone
        : targetCustomerPhone;
    openWhatsAppChatWithCaption(phoneToOpen);
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-2.5 sm:p-4 glass-modal-backdrop">
      <div className="glass-modal-panel animate-modal-pop rounded-2xl max-w-md w-full max-h-[82dvh] flex flex-col overflow-hidden">
        {/* Pinned Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-slate-200/70 px-3.5 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Share2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-slate-900 text-sm truncate">
                Share Invoice #{sale.invNo}
              </h3>
              <p className="text-[11px] text-slate-500 truncate">
                Choose Recipient Number &amp; Share Format
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3.5 py-3 space-y-3">

        {/* Step 1: Recipient Choice */}
        <div className="space-y-1.5">
          <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600">
            1. Kisko Send Karein? (Recipient)
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => setRecipient('customer')}
              className={`p-2 rounded-xl border text-left transition cursor-pointer ${
                recipient === 'customer'
                  ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500 text-blue-900'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <User className="w-3.5 h-3.5 mb-1 text-blue-600" />
              <div className="text-[11px] font-extrabold leading-tight">Customer</div>
              <div className="text-[9.5px] text-slate-500 truncate tabular-nums mt-0.5">
                {targetCustomerPhone || 'No #'}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setRecipient('owner')}
              className={`p-2 rounded-xl border text-left transition cursor-pointer ${
                recipient === 'owner'
                  ? 'bg-emerald-50 border-emerald-500 ring-1 ring-emerald-500 text-emerald-900'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Store className="w-3.5 h-3.5 mb-1 text-emerald-600" />
              <div className="text-[11px] font-extrabold leading-tight">Owner Default</div>
              <div className="text-[9.5px] text-slate-500 truncate tabular-nums mt-0.5">
                {targetOwnerPhone || 'Shop #'}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setRecipient('both')}
              className={`p-2 rounded-xl border text-left transition cursor-pointer ${
                recipient === 'both'
                  ? 'bg-purple-50 border-purple-500 ring-1 ring-purple-500 text-purple-900'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Users className="w-3.5 h-3.5 mb-1 text-purple-600" />
              <div className="text-[11px] font-extrabold leading-tight">Both</div>
              <div className="text-[9.5px] text-slate-500 truncate mt-0.5">
                Cust + Owner
              </div>
            </button>
          </div>

          {/* Inline Phone Check/Edit */}
          <div className="grid grid-cols-1 gap-1.5 pt-1">
            {(recipient === 'customer' || recipient === 'both') && (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                <Phone className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="text-[10px] font-bold text-slate-500 shrink-0">Customer:</span>
                <input
                  type="text"
                  value={customerPhoneInput}
                  onChange={e => setCustomerPhoneInput(e.target.value)}
                  placeholder="Enter customer WhatsApp (e.g. 0300...)"
                  className="w-full bg-transparent text-xs font-bold text-slate-900 tabular-nums focus:outline-none"
                />
              </div>
            )}
            {(recipient === 'owner' || recipient === 'both') && (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                <Store className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="text-[10px] font-bold text-slate-500 shrink-0">Owner:</span>
                <input
                  type="text"
                  value={ownerPhoneInput}
                  onChange={e => setOwnerPhoneInput(e.target.value)}
                  placeholder="Enter owner WhatsApp (e.g. 0300...)"
                  className="w-full bg-transparent text-xs font-bold text-slate-900 tabular-nums focus:outline-none"
                />
              </div>
            )}
          </div>
        </div>

        {/* Step 2: Format Choice */}
        <div className="space-y-1.5">
          <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600">
            2. Kis Format Mein Bhejein? (Format)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFormat('text')}
              className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex items-center gap-2 ${
                format === 'text'
                  ? 'bg-emerald-50 border-emerald-500 ring-1 ring-emerald-500 text-emerald-950'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-extrabold">Text Format</div>
                <div className="text-[10px] text-slate-500 truncate">WhatsApp message</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setFormat('image')}
              className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex items-center gap-2 ${
                format === 'image'
                  ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500 text-blue-950'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <ImageIcon className="w-4 h-4 text-blue-600 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-extrabold">Invoice Photo</div>
                <div className="text-[10px] text-slate-500 truncate">Preview picture</div>
              </div>
            </button>
          </div>
        </div>

        {/* Image Preview Box when Photo Format is selected */}
        {format === 'image' && (
          <div className="bg-slate-100 border border-slate-200 rounded-xl p-2 flex flex-col items-center justify-center">
            {isGeneratingImage ? (
              <div className="py-8 flex items-center gap-2 text-xs font-bold text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                <span>Preparing Invoice Photo...</span>
              </div>
            ) : previewDataUrl ? (
              <img
                src={previewDataUrl}
                alt={`Invoice #${sale.invNo} Preview`}
                className="w-full max-h-52 object-contain rounded-lg border border-slate-200 shadow-xs bg-white"
              />
            ) : null}
          </div>
        )}

        </div>

        {/* Pinned Action Buttons */}
        <div className="shrink-0 px-3.5 py-2.5 border-t border-slate-200/70 bg-white/60 space-y-2">
          {format === 'text' ? (
            recipient === 'both' ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleSendTextToPhone(targetCustomerPhone, 'Customer')}
                  className="py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>1. Customer</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSendTextToPhone(targetOwnerPhone, 'Owner')}
                  className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>2. Owner</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() =>
                  handleSendTextToPhone(
                    recipient === 'owner' ? targetOwnerPhone : targetCustomerPhone,
                    recipient === 'owner' ? 'Owner' : 'Customer'
                  )
                }
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <MessageCircle className="w-4 h-4" />
                <span>
                  Send Text on WhatsApp ({recipient === 'owner' ? 'Owner' : 'Customer'})
                </span>
              </button>
            )
          ) : (
            <div className="space-y-2">
              {recipient === 'both' ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isGeneratingImage || !previewBlob}
                    onClick={() => handleSharePhotoAction(targetCustomerPhone)}
                    className="py-2.5 px-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>Photo → Customer</span>
                  </button>
                  <button
                    type="button"
                    disabled={isGeneratingImage || !previewBlob}
                    onClick={() => handleSharePhotoAction(targetOwnerPhone)}
                    className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>Photo → Owner</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isGeneratingImage || !previewBlob}
                  onClick={() => handleSharePhotoAction()}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                >
                  <Share2 className="w-4 h-4" />
                  <span>
                    Send Invoice Photo ({recipient === 'owner' ? 'Owner' : 'Customer'})
                  </span>
                </button>
              )}

              <button
                type="button"
                disabled={isGeneratingImage || !previewDataUrl}
                onClick={handleDownloadPhoto}
                className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Photo Only</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
