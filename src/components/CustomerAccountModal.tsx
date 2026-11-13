import React, { useState, useMemo, useEffect, useRef } from 'react';
import { KhataCustomer, SaleRecord, ShopSettings } from '../types';
import {
  X,
  User,
  Phone,
  MapPin,
  MessageSquare,
  DollarSign,
  CreditCard,
  Printer,
  Calendar,
  ArrowUpRight,
  ArrowDownLeft,
  FileText,
  Navigation,
  ExternalLink,
  Search,
  Edit3,
  ShieldCheck,
  Download,
  Camera,
  Upload,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  ShoppingBag,
  Copy,
  Save,
  Image as ImageIcon,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useToast } from './Toast';
import { CustomerLocationPicker, CustomerLocationValue } from './CustomerLocationPicker';
import { CameraCaptureModal } from './CameraCaptureModal';
import { buildGoogleMapsTrackUrl, buildGoogleMapsViewUrl } from '../utils/mapsConfig';
import { compressImage } from '../utils/imageCompressor';

export interface CustomerAccountUpdatePayload {
  id: string;
  name: string;
  phone: string;
  phone2?: string;
  address?: string;
  lat?: number;
  lng?: number;
  placeId?: string;
  mapUrl?: string;
  image?: string;
  customerType?: 'retail' | 'retailer' | 'wholesaler';
  shopName?: string;
  city?: string;
  ntnNumber?: string;
  cnic?: string;
  creditLimit?: number;
  dueDate?: string;
  guarantorName?: string;
  guarantorPhone?: string;
  notes?: string;
}

interface CustomerAccountModalProps {
  customer: KhataCustomer | null;
  isOpen: boolean;
  onClose: () => void;
  settings: ShopSettings;
  sales?: SaleRecord[];
  isAdmin?: boolean;
  onAddTransaction: (
    customerId: string,
    type: 'credit' | 'payment',
    amount: number,
    paymentMethod?: string,
    accountId?: string,
    note?: string,
    receiptImage?: string
  ) => void;
  onUpdateCustomer?: (updated: CustomerAccountUpdatePayload) => void;
  onDeleteTransaction?: (customerId: string, txId: string) => void;
}

type AccountWorkspaceTab = 'ledger' | 'location' | 'invoices' | 'profile';

export const CustomerAccountModal: React.FC<CustomerAccountModalProps> = ({
  customer,
  isOpen,
  onClose,
  settings,
  sales = [],
  isAdmin = true,
  onAddTransaction,
  onUpdateCustomer,
  onDeleteTransaction,
}) => {
  const { showToast } = useToast();
  const profileFileInputRef = useRef<HTMLInputElement>(null);
  const txReceiptFileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<AccountWorkspaceTab>('ledger');
  const [showTransactor, setShowTransactor] = useState<'payment' | 'credit' | null>(null);
  const [amount, setAmount] = useState<number | ''>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('Cash');
  const [note, setNote] = useState('');
  const [txReceiptImage, setTxReceiptImage] = useState<string>('');
  const [isTxCameraOpen, setIsTxCameraOpen] = useState(false);
  const [viewingImageModal, setViewingImageModal] = useState<string | null>(null);

  // Ledger search & filtering
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerFilter, setLedgerFilter] = useState<'all' | 'credit' | 'payment'>('all');
  const [confirmDeleteTxId, setConfirmDeleteTxId] = useState<string | null>(null);

  // Location Draft State
  const [locationDraft, setLocationDraft] = useState<CustomerLocationValue>({
    address: '',
  });
  const [locationDirty, setLocationDirty] = useState(false);

  // Profile Edit State
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profilePhone2, setProfilePhone2] = useState('');
  const [profileType, setProfileType] = useState<'retail' | 'retailer'>('retail');
  const [profileShopName, setProfileShopName] = useState('');
  const [profileCity, setProfileCity] = useState('');
  const [profileNtn, setProfileNtn] = useState('');
  const [profileCnic, setProfileCnic] = useState('');
  const [profileCreditLimit, setProfileCreditLimit] = useState('');
  const [profileDueDate, setProfileDueDate] = useState('');
  const [profileGuarantorName, setProfileGuarantorName] = useState('');
  const [profileGuarantorPhone, setProfileGuarantorPhone] = useState('');
  const [profileNotes, setProfileNotes] = useState('');
  const [profileImage, setProfileImage] = useState('');
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  useEffect(() => {
    if (!customer || !isOpen) return;
    setLocationDraft({
      address: customer.address || '',
      lat: customer.lat,
      lng: customer.lng,
      placeId: customer.placeId,
      mapUrl: customer.mapUrl,
    });
    setLocationDirty(false);

    setProfileName(customer.name || '');
    setProfilePhone(customer.phone || '');
    setProfilePhone2(customer.phone2 || '');
    setProfileType(customer.customerType === 'retailer' || customer.customerType === 'wholesaler' ? 'retailer' : 'retail');
    setProfileShopName(customer.shopName || '');
    setProfileCity(customer.city || '');
    setProfileNtn(customer.ntnNumber || '');
    setProfileCnic(customer.cnic || '');
    setProfileCreditLimit(customer.creditLimit ? String(customer.creditLimit) : '');
    setProfileDueDate(customer.dueDate || '');
    setProfileGuarantorName(customer.guarantorName || '');
    setProfileGuarantorPhone(customer.guarantorPhone || '');
    setProfileNotes(customer.notes || '');
    setProfileImage(customer.image || '');
    setConfirmDeleteTxId(null);
    setTxReceiptImage('');
  }, [customer, isOpen]);

  const history = customer?.history || [];

  const totalCreditGiven = useMemo(() => {
    return history
      .filter(t => t.type === 'credit')
      .reduce((acc, t) => acc + t.amount, 0);
  }, [history]);

  const totalPaymentReceived = useMemo(() => {
    return history
      .filter(t => t.type === 'payment')
      .reduce((acc, t) => acc + t.amount, 0);
  }, [history]);

  const runningLedger = useMemo(() => {
    let running = 0;
    const sorted = [...history].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const calculated = sorted.map(tx => {
      if (tx.type === 'credit') {
        running += tx.amount;
      } else {
        running -= tx.amount;
      }
      return {
        ...tx,
        runningBalance: running,
      };
    });

    return calculated.reverse();
  }, [history]);

  const filteredLedger = useMemo(() => {
    const q = ledgerSearch.toLowerCase().trim();
    return runningLedger.filter(tx => {
      if (ledgerFilter !== 'all' && tx.type !== ledgerFilter) return false;
      if (!q) return true;
      return (
        (tx.note || '').toLowerCase().includes(q) ||
        (tx.paymentMethod || '').toLowerCase().includes(q) ||
        String(tx.amount).includes(q)
      );
    });
  }, [runningLedger, ledgerSearch, ledgerFilter]);

  const customerSales = useMemo(() => {
    if (!customer) return [];
    const normPhone = customer.phone.replace(/[^0-9]/g, '');
    const normName = customer.name.trim().toLowerCase();
    return sales
      .filter(s => {
        if (s.status === 'CANCELLED') return false;
        if (s.khataCustomerId && s.khataCustomerId === customer.id) return true;
        const sPhone = (s.custPhone || '').replace(/[^0-9]/g, '');
        if (normPhone.length >= 7 && sPhone && sPhone === normPhone) return true;
        if (normName && s.custName.trim().toLowerCase() === normName) return true;
        return false;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [customer, sales]);

  const dueStatus = useMemo(() => {
    if (!customer?.dueDate || customer.balance <= 0) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(customer.dueDate);
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      return { label: `${Math.abs(diffDays)} din overdue hai!`, tone: 'overdue' as const };
    }
    if (diffDays === 0) {
      return { label: 'Aaj due date hai', tone: 'today' as const };
    }
    return { label: `${diffDays} din mein due hai`, tone: 'upcoming' as const };
  }, [customer?.dueDate, customer?.balance]);

  if (!isOpen || !customer) return null;

  const currency = settings.currency;
  const hasGpsPin =
    typeof customer.lat === 'number' &&
    typeof customer.lng === 'number' &&
    Number.isFinite(customer.lat) &&
    Number.isFinite(customer.lng);

  const trackLocationUrl = buildGoogleMapsTrackUrl({
    lat: customer.lat,
    lng: customer.lng,
    placeId: customer.placeId,
    address: customer.address,
  });

  const viewLocationUrl = buildGoogleMapsViewUrl({
    lat: customer.lat,
    lng: customer.lng,
    placeId: customer.placeId,
    address: customer.address,
  });

  const creditUsagePct =
    customer.creditLimit && customer.creditLimit > 0
      ? Math.min(100, Math.max(0, Math.round((customer.balance / customer.creditLimit) * 100)))
      : null;
  const isOverLimit =
    customer.creditLimit && customer.creditLimit > 0 && customer.balance > customer.creditLimit;

  const cleanPhoneForWhatsApp = (() => {
    const phone = customer.phone.replace(/[^0-9]/g, '');
    return phone.startsWith('0') ? '92' + phone.substring(1) : phone;
  })();

  // WhatsApp Message in Clean Roman English / Roman Urdu
  const whatsAppUrl = (() => {
    const recentLines = customer.history
      .slice(0, 5)
      .map(
        t =>
          `- ${new Date(t.date).toLocaleDateString()}: ${t.type === 'credit' ? 'Credit (+)' : 'Payment (-)'} ${currency} ${t.amount.toLocaleString()} ${t.note ? `(${t.note})` : ''}`
      )
      .join('\n');

    const dueLine = customer.dueDate ? `\nPromise Due Date: ${new Date(customer.dueDate).toLocaleDateString()}` : '';

    const message = encodeURIComponent(
      `Salam ${customer.name}!\n\n` +
        `Yeh reminder *${settings.shopName}* ki taraf se hai. Aap ka total pending Khata balance *${currency} ${customer.balance.toLocaleString()}* hai.${dueLine}\n\n` +
        `*Aakhri Transactions:*\n${recentLines || 'Koi transaction nahi hai'}\n\n` +
        `Baraye meharbani apna balance time par clear karein. Shukriya!\n` +
        `Contact: ${settings.phone} | ${settings.address}`
    );
    return `https://wa.me/${cleanPhoneForWhatsApp}?text=${message}`;
  })();

  const handleDownloadPdfStatement = () => {
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      doc.setFillColor(30, 27, 75);
      doc.rect(0, 0, 210, 32, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(settings.shopName || 'FMZ Friends Mobile Zone', 14, 14);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`${settings.address || ''}  |  Ph: ${settings.phone || ''}`, 14, 21);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('CUSTOMER ACCOUNT STATEMENT', 196, 15, { align: 'right' });
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.text(`Generated: ${new Date().toLocaleString()}`, 196, 22, { align: 'right' });

      doc.setTextColor(15, 23, 42);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`Customer: ${customer.name}`, 14, 42);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Account ID: ${customer.id}`, 14, 48);
      doc.text(`Phone: ${customer.phone}${customer.phone2 ? ` / ${customer.phone2}` : ''}`, 14, 54);
      if (customer.cnic) doc.text(`CNIC: ${customer.cnic}`, 14, 60);
      if (customer.address) doc.text(`Address: ${customer.address}`, 14, customer.cnic ? 66 : 60, { maxWidth: 115 });

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(132, 38, 64, 30, 2, 2, 'FD');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text('PENDING BALANCE', 136, 44);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(customer.balance > 0 ? 185 : 21, customer.balance > 0 ? 28 : 128, customer.balance > 0 ? 28 : 61);
      doc.text(`${currency} ${customer.balance.toLocaleString()}`, 136, 51);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.text(`Credit Given: ${currency} ${totalCreditGiven.toLocaleString()}`, 136, 58);
      doc.text(`Recovered: ${currency} ${totalPaymentReceived.toLocaleString()}`, 136, 64);

      const tableRows = runningLedger.map(tx => [
        new Date(tx.date).toLocaleDateString(),
        tx.type === 'credit' ? 'Credit (+)' : `Paid (${tx.paymentMethod || 'Cash'})`,
        tx.note || '--',
        `${tx.type === 'credit' ? '+' : '-'} ${currency} ${tx.amount.toLocaleString()}`,
        `${currency} ${tx.runningBalance.toLocaleString()}`,
      ]);

      autoTable(doc, {
        startY: 74,
        head: [['Date', 'Type', 'Remarks / Details', 'Amount', 'Balance']],
        body: tableRows.length > 0 ? tableRows : [['--', '--', 'No transactions recorded', '--', '--']],
        styles: { fontSize: 8.5, cellPadding: 3 },
        headStyles: { fillColor: [88, 28, 135], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          3: { halign: 'right', fontStyle: 'bold' },
          4: { halign: 'right', fontStyle: 'bold' },
        },
      });

      const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 120;
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text('Created by HAMMAD RAZA DEVELOPMENT', 105, Math.min(285, finalY + 14), { align: 'center' });

      const safeName = customer.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      doc.save(`Khata_Statement_${safeName}.pdf`);
      showToast('PDF Account Statement downloaded', 'success');
    } catch (err) {
      console.error('PDF statement error:', err);
      showToast('Could not generate PDF statement', 'error');
    }
  };

  const handlePrintStatement = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Popup blocked. Please allow popups to print statement.', 'error');
      return;
    }

    const rows = runningLedger
      .map(
        tx => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${new Date(tx.date).toLocaleDateString()}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; color: ${tx.type === 'credit' ? '#b91c1c' : '#15803d'};">
            ${tx.type === 'credit' ? 'Credit Added (+)' : `Payment (${tx.paymentMethod || 'Cash'})`}
          </td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${tx.note || '-'}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; font-variant-numeric: tabular-nums; font-weight: 600;">
            ${tx.type === 'credit' ? '+' : '-'} ${currency} ${tx.amount.toLocaleString()}
          </td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; font-variant-numeric: tabular-nums; font-weight: 700;">
            ${currency} ${tx.runningBalance.toLocaleString()}
          </td>
        </tr>
      `
      )
      .join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Account Ledger - ${customer.name}</title>
          <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
          <style>
            body { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 24px; color: #1e293b; max-width: 720px; margin: 0 auto; font-variant-numeric: tabular-nums; }
            .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px; }
            .shop-title { font-family: 'Outfit', 'Plus Jakarta Sans', sans-serif; font-size: 20px; font-weight: 800; margin: 0; }
            .meta { font-size: 11px; color: #64748b; margin-top: 4px; }
            .balance-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th { text-align: left; padding: 8px; background: #f1f5f9; border-bottom: 1px solid #cbd5e1; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 class="shop-title">${settings.shopName}</h1>
            <p class="meta">${settings.address} | Ph: ${settings.phone}</p>
            <h2 style="font-size: 14px; margin-top: 8px;">Customer Credit & Ledger Statement</h2>
          </div>

          <div style="margin-bottom: 16px; font-size: 12px;">
            <p style="margin: 2px 0;"><strong>Customer:</strong> ${customer.name} (${customer.id})</p>
            <p style="margin: 2px 0;"><strong>Phone:</strong> ${customer.phone} ${customer.phone2 ? ` / ${customer.phone2}` : ''}</p>
            ${customer.cnic ? `<p style="margin: 2px 0;"><strong>CNIC:</strong> ${customer.cnic}</p>` : ''}
            ${customer.address ? `<p style="margin: 2px 0;"><strong>Address:</strong> ${customer.address}</p>` : ''}
            ${customer.dueDate ? `<p style="margin: 2px 0;"><strong>Due Date:</strong> ${new Date(customer.dueDate).toLocaleDateString()}</p>` : ''}
            <p style="margin: 2px 0;"><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
          </div>

          <div class="balance-box">
            <div>
              <span style="font-size: 11px; color: #64748b; text-transform: uppercase;">Pending Balance</span>
              <div style="font-size: 20px; font-weight: 800; color: #7e22ce;">${currency} ${customer.balance.toLocaleString()}</div>
            </div>
            <div style="text-align: right; font-size: 11px;">
              <div>Credit Given: <strong>${currency} ${totalCreditGiven.toLocaleString()}</strong></div>
              <div>Total Paid: <strong>${currency} ${totalPaymentReceived.toLocaleString()}</strong></div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Remarks</th>
                <th style="text-align: right;">Amount</th>
                <th style="text-align: right;">Balance</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="5" style="text-align: center; padding: 16px;">No transactions recorded</td></tr>'}
            </tbody>
          </table>

          <div style="margin-top: 24px; text-align: center; font-size: 11px; color: #1e293b; border-top: 1px solid #000; padding-top: 12px;">
            <p style="font-weight: bold; margin: 0 0 4px 0;">Created by HAMMAD RAZA DEVELOPMENT</p>
            <p style="font-size: 10px; color: #64748b; margin: 0;">${settings.receiptFooter || 'Computer Generated Ledger Statement'}</p>
          </div>

          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      showToast('Please enter a valid amount', 'warning');
      return;
    }

    let optimizedReceiptImg = txReceiptImage;
    if (optimizedReceiptImg && optimizedReceiptImg.startsWith('data:image')) {
      try {
        optimizedReceiptImg = await compressImage(optimizedReceiptImg, 700, 0.7);
      } catch {
        // use original if compression fails
      }
    }

    onAddTransaction(
      customer.id,
      showTransactor!,
      amt,
      showTransactor === 'payment' ? paymentMethod : undefined,
      undefined,
      note.trim() || undefined,
      optimizedReceiptImg || undefined
    );
    setAmount('');
    setNote('');
    setPaymentMethod('Cash');
    setTxReceiptImage('');
    setShowTransactor(null);
  };

  const handleTxReceiptFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, 700, 0.7);
      setTxReceiptImage(compressed);
      showToast('Receipt picture attached & optimized!', 'success');
    } catch {
      showToast('Could not attach receipt image', 'warning');
    }
  };

  const handleSaveLocationOnly = () => {
    if (!onUpdateCustomer) return;
    onUpdateCustomer({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      phone2: customer.phone2,
      address: locationDraft.address.trim() || undefined,
      lat: locationDraft.lat,
      lng: locationDraft.lng,
      placeId: locationDraft.placeId,
      mapUrl: locationDraft.mapUrl,
      image: customer.image,
      customerType: customer.customerType,
      shopName: customer.shopName,
      city: customer.city,
      ntnNumber: customer.ntnNumber,
      cnic: customer.cnic,
      creditLimit: customer.creditLimit,
      dueDate: customer.dueDate,
      guarantorName: customer.guarantorName,
      guarantorPhone: customer.guarantorPhone,
      notes: customer.notes,
    });
    setLocationDirty(false);
  };

  const handleSaveFullProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateCustomer) return;
    if (!profileName.trim() || !profilePhone.trim()) {
      showToast('Customer Name and Primary Phone are required', 'warning');
      return;
    }

    let optProfileImg = profileImage;
    if (optProfileImg && optProfileImg.startsWith('data:image')) {
      try {
        optProfileImg = await compressImage(optProfileImg, 700, 0.7);
      } catch {}
    }

    const parsedLimit = profileCreditLimit.trim() ? Number(profileCreditLimit) : undefined;
    onUpdateCustomer({
      id: customer.id,
      name: profileName.trim(),
      phone: profilePhone.trim(),
      phone2: profilePhone2.trim() || undefined,
      address: locationDraft.address.trim() || undefined,
      lat: locationDraft.lat,
      lng: locationDraft.lng,
      placeId: locationDraft.placeId,
      mapUrl: locationDraft.mapUrl,
      image: optProfileImg,
      customerType: profileType,
      shopName: profileType === 'retailer' ? profileShopName.trim() || undefined : undefined,
      city: profileCity.trim() || undefined,
      ntnNumber: profileType === 'retailer' ? profileNtn.trim() || undefined : undefined,
      cnic: profileCnic.trim() || undefined,
      creditLimit: parsedLimit && Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined,
      dueDate: profileDueDate.trim() || undefined,
      guarantorName: profileGuarantorName.trim() || undefined,
      guarantorPhone: profileGuarantorPhone.trim() || undefined,
      notes: profileNotes.trim() || undefined,
    });
    setLocationDirty(false);
    setActiveTab('ledger');
    showToast('Customer profile updated successfully', 'success');
  };

  const handleProfileImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, 700, 0.7);
      setProfileImage(compressed);
      showToast('Profile photo optimized & attached!', 'success');
    } catch {
      showToast('Could not process image', 'warning');
    }
  };

  const handleCopyLocationLink = () => {
    const url = trackLocationUrl || viewLocationUrl;
    if (!url) return;
    navigator.clipboard?.writeText(url).then(() => {
      showToast('Google Maps link copied!', 'success');
    }).catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/75 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-5xl w-[98vw] shadow-2xl border border-slate-200 animate-in zoom-in-95 max-h-[96vh] flex flex-col overflow-hidden">
        {/* Top Command Header - Clear & Easy to Use */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-purple-950 px-5 py-4 text-white shrink-0">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
            <div className="flex items-start gap-3.5 min-w-0">
              {/* Customer Avatar */}
              <div className="w-16 h-16 rounded-2xl border-2 border-white/20 overflow-hidden bg-white/10 flex items-center justify-center shrink-0 shadow-md">
                {customer.image ? (
                  <img src={customer.image} alt={customer.name} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-8 h-8 text-white/80" />
                )}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg sm:text-xl font-extrabold tracking-tight leading-snug">
                    {customer.name}
                  </h2>
                  <span className="text-[11px] font-bold text-purple-200 bg-white/10 px-2 py-0.5 rounded-lg border border-white/15">
                    {customer.customerType === 'retailer' || customer.customerType === 'wholesaler'
                      ? 'Retailer / Wholesaler'
                      : 'Retail Customer'}
                  </span>
                  <span className="text-[11px] font-mono text-slate-300">ID: {customer.id}</span>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-200 mt-1.5">
                  <a
                    href={`tel:${customer.phone.replace(/[^0-9+]/g, '')}`}
                    className="flex items-center gap-1 hover:text-white transition font-semibold tabular-nums"
                  >
                    <Phone className="w-3.5 h-3.5 text-emerald-400" />
                    {customer.phone}
                  </a>
                  {customer.phone2 && (
                    <a
                      href={`tel:${customer.phone2.replace(/[^0-9+]/g, '')}`}
                      className="flex items-center gap-1 text-slate-300 hover:text-white transition tabular-nums"
                    >
                      <Phone className="w-3 h-3" />
                      {customer.phone2}
                    </a>
                  )}
                  {customer.cnic && (
                    <span className="text-slate-300 tabular-nums">CNIC: {customer.cnic}</span>
                  )}
                  {customer.shopName && (
                    <span className="text-purple-200 font-medium">{customer.shopName}</span>
                  )}
                </div>

                {/* Location Line */}
                <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
                  <span className="flex items-center gap-1 text-slate-300">
                    <MapPin className={`w-3.5 h-3.5 ${hasGpsPin ? 'text-emerald-400' : 'text-purple-300'}`} />
                    {customer.address ? (
                      <span>{customer.address}</span>
                    ) : (
                      <span className="italic text-slate-400">Address set nahi hai</span>
                    )}
                  </span>
                  {hasGpsPin && (
                    <span className="text-[10px] font-bold text-emerald-300 tabular-nums bg-white/10 px-2 py-0.5 rounded-full">
                      GPS Pinned
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Header Right: Track Location + Close */}
            <div className="flex items-center gap-2 shrink-0 self-end lg:self-start">
              {trackLocationUrl ? (
                <a
                  href={trackLocationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-sm transition flex items-center gap-1.5"
                >
                  <Navigation className="w-4 h-4" />
                  <span>Track Customer Location</span>
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveTab('location')}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <MapPin className="w-4 h-4 text-amber-300" />
                  <span>Pin Location on Map</span>
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="text-white/75 hover:text-white p-2 rounded-xl hover:bg-white/10 transition cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* 4 Financial KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mt-4 pt-3.5 border-t border-white/10">
            <div className="bg-white/10 rounded-xl p-3">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                  Pending Balance
                </span>
                {isOverLimit && (
                  <span className="text-[10px] font-extrabold text-rose-300 flex items-center gap-0.5">
                    <AlertTriangle className="w-3 h-3" /> Over Limit
                  </span>
                )}
              </div>
              <p
                className={`text-lg font-extrabold tabular-nums mt-0.5 ${
                  customer.balance > 0 ? 'text-amber-300' : 'text-emerald-300'
                }`}
              >
                {currency} {customer.balance.toLocaleString()}
              </p>
              {creditUsagePct !== null && (
                <div className="mt-1.5 space-y-0.5">
                  <div className="h-1.5 w-full bg-white/15 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${isOverLimit ? 'bg-rose-400' : 'bg-amber-300'}`}
                      style={{ width: `${creditUsagePct}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-300 tabular-nums">
                    Limit: {currency} {customer.creditLimit?.toLocaleString()} ({creditUsagePct}%)
                  </p>
                </div>
              )}
            </div>

            <div className="bg-white/10 rounded-xl p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                Total Credit Given
              </span>
              <p className="text-lg font-extrabold tabular-nums text-white mt-0.5">
                {currency} {totalCreditGiven.toLocaleString()}
              </p>
              <p className="text-[10px] text-slate-300 mt-0.5 tabular-nums">
                {history.filter(t => t.type === 'credit').length} credit entries
              </p>
            </div>

            <div className="bg-white/10 rounded-xl p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                Total Recovered / Paid
              </span>
              <p className="text-lg font-extrabold tabular-nums text-emerald-300 mt-0.5">
                {currency} {totalPaymentReceived.toLocaleString()}
              </p>
              <p className="text-[10px] text-slate-300 mt-0.5 tabular-nums">
                {history.filter(t => t.type === 'payment').length} payment entries
              </p>
            </div>

            <div className="bg-white/10 rounded-xl p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                Promise Due Date
              </span>
              {customer.dueDate ? (
                <>
                  <p className="text-sm font-extrabold tabular-nums text-white mt-1">
                    {new Date(customer.dueDate).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                  {dueStatus && (
                    <p
                      className={`text-[10px] font-bold mt-0.5 ${
                        dueStatus.tone === 'overdue'
                          ? 'text-rose-300'
                          : dueStatus.tone === 'today'
                          ? 'text-amber-300'
                          : 'text-emerald-300'
                      }`}
                    >
                      {dueStatus.label}
                    </p>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  className="mt-1 text-xs font-bold text-purple-200 hover:text-white underline cursor-pointer block"
                >
                  + Due Date Set Karein
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Workspace Navigation Tabs + Quick Action Toolbar */}
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 xl:pb-0">
            <button
              type="button"
              onClick={() => setActiveTab('ledger')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'ledger'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-700 bg-white border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-purple-600" />
              Ledger History ({history.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('location')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'location'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-700 bg-white border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <MapPin className="w-3.5 h-3.5 text-blue-600" />
              Location & Map
              {hasGpsPin && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('invoices')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'invoices'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-700 bg-white border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5 text-amber-600" />
              Invoices & Phones ({customerSales.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'profile'
                  ? 'bg-purple-700 text-white shadow-2xs'
                  : 'text-slate-700 bg-white border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5 text-purple-600" />
              Edit Profile & Limits
            </button>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setActiveTab('ledger');
                setShowTransactor('credit');
                setAmount('');
                setNote('');
                setTxReceiptImage('');
              }}
              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <CreditCard className="w-3.5 h-3.5" />
              Add Credit (+)
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('ledger');
                setShowTransactor('payment');
                setAmount('');
                setNote('');
                setTxReceiptImage('');
              }}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <DollarSign className="w-3.5 h-3.5" />
              Receive Payment (-)
            </button>

            <a
              href={whatsAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-xs rounded-xl transition flex items-center gap-1.5"
              title="WhatsApp Roman English Statement"
            >
              <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
              WhatsApp
            </a>

            <button
              type="button"
              onClick={handleDownloadPdfStatement}
              className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-purple-600" />
              PDF
            </button>

            <button
              type="button"
              onClick={handlePrintStatement}
              className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
          </div>
        </div>

        {/* Inline Transaction Entry Drawer with Camera Picture Attachment */}
        {showTransactor && (
          <div className="p-4 bg-slate-100 border-b border-slate-200 shrink-0 animate-in slide-in-from-top-2 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                {showTransactor === 'credit' ? (
                  <span className="text-rose-600 font-extrabold flex items-center gap-1">
                    <ArrowUpRight className="w-4 h-4" /> Add Credit (Udhar) to Customer Account
                  </span>
                ) : (
                  <span className="text-emerald-600 font-extrabold flex items-center gap-1">
                    <ArrowDownLeft className="w-4 h-4" /> Receive Payment (Wasooli) from Customer
                  </span>
                )}
              </span>
              <div className="flex items-center gap-3">
                {showTransactor === 'payment' && customer.balance > 0 && (
                  <button
                    type="button"
                    onClick={() => setAmount(customer.balance)}
                    className="text-xs font-bold text-purple-700 hover:underline cursor-pointer"
                  >
                    Full Balance ({currency} {customer.balance.toLocaleString()})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowTransactor(null)}
                  className="text-slate-500 hover:text-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveTransaction} className="space-y-2.5">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                <input
                  type="number"
                  min="1"
                  required
                  value={amount}
                  onChange={e => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder={`Amount (${currency}) *`}
                  className="md:col-span-3 bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs tabular-nums font-bold focus:outline-none focus:border-purple-600"
                />
                <input
                  type="text"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Remarks (e.g. Mobile model, IMEI, Bill #)"
                  className="md:col-span-5 bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-purple-600"
                />

                {/* Attached Photo Preview / Upload for Transaction */}
                <div className="md:col-span-4 flex items-center gap-2 bg-white border border-slate-300 rounded-xl px-2 py-1">
                  <input
                    ref={txReceiptFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleTxReceiptFileChange}
                    className="hidden"
                  />
                  {txReceiptImage ? (
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <img
                        src={txReceiptImage}
                        alt="Receipt"
                        className="w-8 h-8 rounded-lg object-cover border border-slate-200 cursor-pointer"
                        onClick={() => setViewingImageModal(txReceiptImage)}
                      />
                      <span className="text-[10px] font-bold text-emerald-700 truncate">Photo attached</span>
                      <button
                        type="button"
                        onClick={() => setTxReceiptImage('')}
                        className="text-rose-600 hover:text-rose-700 ml-auto p-1 cursor-pointer"
                        title="Remove photo"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[11px] text-slate-400 pl-1">Attach Photo (Opt.)</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => txReceiptFileInputRef.current?.click()}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-[10px] flex items-center gap-1 cursor-pointer"
                        >
                          <Upload className="w-3 h-3 text-purple-600" /> Gallery
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsTxCameraOpen(true)}
                          className="px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg text-[10px] flex items-center gap-1 cursor-pointer"
                        >
                          <Camera className="w-3 h-3" /> Camera
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                {showTransactor === 'payment' ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-slate-600">Channel:</span>
                    {(['Cash', 'JazzCash', 'Easypaisa', 'Bank'] as const).map(channel => (
                      <button
                        key={channel}
                        type="button"
                        onClick={() => setPaymentMethod(channel)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold border transition cursor-pointer ${
                          paymentMethod === channel
                            ? 'border-purple-600 bg-purple-100 text-purple-900'
                            : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {channel}
                      </button>
                    ))}
                  </div>
                ) : <div />}

                <button
                  type="submit"
                  className={`px-5 py-2 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer ${
                    showTransactor === 'credit'
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {showTransactor === 'credit' ? 'Confirm Credit Entry' : 'Confirm Payment Received'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Main Workspace Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-white">
          {/* TAB 1: LEDGER HISTORY */}
          {activeTab === 'ledger' && (
            <div className="space-y-3">
              {(customer.guarantorName || customer.notes) && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/90 flex flex-wrap items-center justify-between gap-3 text-xs">
                  {customer.guarantorName && (
                    <span className="flex items-center gap-1.5 text-slate-700">
                      <ShieldCheck className="w-4 h-4 text-purple-600" />
                      <strong>Guarantor:</strong> {customer.guarantorName}
                      {customer.guarantorPhone ? ` (${customer.guarantorPhone})` : ''}
                    </span>
                  )}
                  {customer.notes && (
                    <span className="text-slate-600">
                      <strong>Notes:</strong> {customer.notes}
                    </span>
                  )}
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={ledgerSearch}
                    onChange={e => setLedgerSearch(e.target.value)}
                    placeholder="Search remarks, amount, or payment channel..."
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-purple-600 focus:bg-white"
                  />
                </div>

                <div className="flex items-center gap-1.5">
                  {(['all', 'credit', 'payment'] as const).map(f => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setLedgerFilter(f)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                        ledgerFilter === f
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {f === 'all' ? 'All Entries' : f === 'credit' ? 'Credit (+)' : 'Payments (-)'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border border-slate-200/90 rounded-xl overflow-x-auto shadow-2xs">
                <table className="w-full min-w-[650px] text-left border-collapse text-xs">
                  <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="p-3">Date & Time</th>
                      <th className="p-3">Transaction Type</th>
                      <th className="p-3">Channel</th>
                      <th className="p-3">Remarks / Photo</th>
                      <th className="p-3 text-right">Debit / Credit</th>
                      <th className="p-3 text-right">Running Balance</th>
                      {isAdmin && onDeleteTransaction && <th className="p-3 text-center">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLedger.length === 0 ? (
                      <tr>
                        <td colSpan={isAdmin && onDeleteTransaction ? 7 : 6} className="text-center py-12 text-slate-400">
                          No transactions found. Use "Add Credit" or "Receive Payment" above.
                        </td>
                      </tr>
                    ) : (
                      filteredLedger.map((tx, idx) => {
                        const d = new Date(tx.date);
                        return (
                          <tr key={tx.id || idx} className="hover:bg-slate-50/70 transition">
                            <td className="p-3 tabular-nums text-[11px] text-slate-500 whitespace-nowrap">
                              {d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}{' '}
                              <span className="text-slate-400 text-[10px]">
                                {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              {tx.type === 'credit' ? (
                                <span className="inline-flex items-center gap-1 font-bold text-[11px] text-rose-700">
                                  <ArrowUpRight className="w-3.5 h-3.5" /> Credit Added
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 font-bold text-[11px] text-emerald-700">
                                  <ArrowDownLeft className="w-3.5 h-3.5" /> Payment Received
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-[11px] text-slate-500 font-medium">
                              {tx.type === 'credit' ? 'Udhar / Credit' : tx.paymentMethod || 'Cash'}
                            </td>
                            <td className="p-3 text-slate-700 font-medium">
                              <div className="flex items-center gap-2">
                                <span>{tx.note || '--'}</span>
                                {tx.receiptImage && (
                                  <button
                                    type="button"
                                    onClick={() => setViewingImageModal(tx.receiptImage || null)}
                                    className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded border border-purple-200 text-[10px] font-bold cursor-pointer"
                                  >
                                    <ImageIcon className="w-3 h-3" /> Photo
                                  </button>
                                )}
                              </div>
                            </td>
                            <td
                              className={`p-3 text-right tabular-nums font-extrabold whitespace-nowrap ${
                                tx.type === 'credit' ? 'text-rose-600' : 'text-emerald-600'
                              }`}
                            >
                              {tx.type === 'credit' ? '+' : '-'} {currency} {tx.amount.toLocaleString()}
                            </td>
                            <td className="p-3 text-right tabular-nums font-bold text-slate-900 whitespace-nowrap">
                              {currency} {tx.runningBalance.toLocaleString()}
                            </td>
                            {isAdmin && onDeleteTransaction && (
                              <td className="p-3 text-center whitespace-nowrap">
                                {confirmDeleteTxId === tx.id ? (
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        onDeleteTransaction(customer.id, tx.id);
                                        setConfirmDeleteTxId(null);
                                      }}
                                      className="px-2 py-0.5 bg-rose-600 text-white rounded text-[10px] font-bold cursor-pointer"
                                    >
                                      Confirm
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteTxId(null)}
                                      className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-[10px] font-semibold cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteTxId(tx.id)}
                                    className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition cursor-pointer"
                                    title="Delete Entry"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: GOOGLE MAPS LOCATION & TRACKING */}
          {activeTab === 'location' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              <div className="lg:col-span-4 space-y-3 bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <div>
                  <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                    <Navigation className="w-4 h-4 text-blue-600" />
                    Customer Location & Pinning
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Map ab automatically aap ki local surroundings par center hoga. Search karein ya map par click karke customer ki exact location pin karein.
                  </p>
                </div>

                <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1.5 text-xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Saved Address
                  </span>
                  <p className="font-semibold text-slate-800">
                    {locationDraft.address || 'Koi address save nahi hai'}
                  </p>
                  {typeof locationDraft.lat === 'number' && typeof locationDraft.lng === 'number' ? (
                    <p className="text-[11px] text-emerald-700 font-bold tabular-nums">
                      GPS Pinned: {locationDraft.lat.toFixed(5)}, {locationDraft.lng.toFixed(5)}
                    </p>
                  ) : (
                    <p className="text-[11px] text-amber-600 font-semibold">
                      Map par click karke pin lagayein
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  {onUpdateCustomer && locationDirty && (
                    <button
                      type="button"
                      onClick={handleSaveLocationOnly}
                      className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Save className="w-4 h-4" />
                      Save Location to Account
                    </button>
                  )}

                  {(() => {
                    const activeTrackUrl = buildGoogleMapsTrackUrl({
                      lat: locationDraft.lat,
                      lng: locationDraft.lng,
                      placeId: locationDraft.placeId,
                      address: locationDraft.address,
                    });
                    const activeViewUrl = buildGoogleMapsViewUrl({
                      lat: locationDraft.lat,
                      lng: locationDraft.lng,
                      placeId: locationDraft.placeId,
                      address: locationDraft.address,
                    });
                    return (
                      <>
                        {activeTrackUrl && (
                          <a
                            href={activeTrackUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center justify-center gap-1.5"
                          >
                            <Navigation className="w-4 h-4" />
                            Track Customer Location (Google Maps)
                          </a>
                        )}
                        {activeViewUrl && (
                          <a
                            href={activeViewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full py-2 px-4 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5"
                          >
                            <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                            View on Google Maps
                          </a>
                        )}
                      </>
                    );
                  })()}

                  {(trackLocationUrl || viewLocationUrl) && (
                    <button
                      type="button"
                      onClick={handleCopyLocationLink}
                      className="w-full py-2 px-4 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 font-semibold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy Link
                    </button>
                  )}
                </div>
              </div>

              <div className="lg:col-span-8">
                <CustomerLocationPicker
                  value={locationDraft}
                  onChange={next => {
                    setLocationDraft(next);
                    setLocationDirty(true);
                  }}
                  customerName={customer.name}
                  readOnly={!onUpdateCustomer}
                  heightClass="h-72 sm:h-96"
                  showAddressInput={true}
                  showTrackActions={false}
                />
              </div>
            </div>
          )}

          {/* TAB 3: LINKED CREDIT INVOICES & ITEMS */}
          {activeTab === 'invoices' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                  <ShoppingBag className="w-4 h-4 text-purple-600" />
                  Customer Purchase Invoices & IMEI History ({customerSales.length})
                </h4>
                <span className="text-[11px] text-slate-500 tabular-nums">
                  Total Invoiced: {currency}{' '}
                  {customerSales.reduce((acc, s) => acc + s.grandTotal, 0).toLocaleString()}
                </span>
              </div>

              {customerSales.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-400">
                  No POS invoices linked to this customer yet.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-x-auto">
                  <table className="w-full min-w-[600px] text-left border-collapse text-xs">
                    <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="p-3">Invoice #</th>
                        <th className="p-3">Date</th>
                        <th className="p-3">Phones / Items & IMEIs</th>
                        <th className="p-3">Type</th>
                        <th className="p-3 text-right">Bill Total</th>
                        <th className="p-3 text-right">Paid</th>
                        <th className="p-3 text-right">Due</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {customerSales.map(sale => (
                        <tr key={sale.invNo} className="hover:bg-slate-50/70">
                          <td className="p-3 font-bold text-slate-900 tabular-nums whitespace-nowrap">
                            {sale.invNo}
                          </td>
                          <td className="p-3 text-slate-500 tabular-nums whitespace-nowrap">
                            {new Date(sale.date).toLocaleDateString()}
                          </td>
                          <td className="p-3 text-slate-700">
                            <div className="space-y-1">
                              {sale.items.map((item, i) => {
                                const imeis =
                                  Array.isArray(item.imeis) && item.imeis.length > 0
                                    ? item.imeis.join(', ')
                                    : item.imei;
                                return (
                                  <div key={i} className="text-[11px]">
                                    <span className="font-semibold text-slate-800">
                                      {item.name} × {item.qty}
                                    </span>
                                    {imeis && (
                                      <span className="text-slate-400 ml-1.5 tabular-nums">
                                        [IMEI: {imeis}]
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                          <td className="p-3">
                            <span
                              className={`text-[10px] font-bold ${
                                sale.invoiceType === 'credit' ? 'text-rose-700' : 'text-emerald-700'
                              }`}
                            >
                              {sale.invoiceType === 'credit' ? 'Credit / Udhar' : sale.paymentMethod}
                            </span>
                          </td>
                          <td className="p-3 text-right font-bold tabular-nums text-slate-900">
                            {currency} {sale.grandTotal.toLocaleString()}
                          </td>
                          <td className="p-3 text-right tabular-nums text-emerald-700 font-semibold">
                            {currency} {(sale.amountPaid ?? sale.grandTotal).toLocaleString()}
                          </td>
                          <td className="p-3 text-right tabular-nums font-bold text-rose-600">
                            {currency} {(sale.amountDue ?? 0).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: EDIT PROFILE, CREDIT LIMITS & GUARANTOR */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveFullProfile} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-4 bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800">Customer Photo</span>
                    {profileImage && (
                      <button
                        type="button"
                        onClick={() => setProfileImage('')}
                        className="text-rose-600 text-[11px] font-bold cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-xl border border-slate-200 overflow-hidden bg-white flex items-center justify-center shrink-0">
                      {profileImage ? (
                        <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-7 h-7 text-slate-300" />
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5 flex-1">
                      <input
                        ref={profileFileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleProfileImageChange}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => profileFileInputRef.current?.click()}
                        className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-lg border border-slate-200 flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Upload className="w-3 h-3 text-purple-600" /> Gallery
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsCameraOpen(true)}
                        className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Camera className="w-3 h-3" /> Camera
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200">
                    <label className="block font-bold text-slate-700 mb-1">Account Category</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setProfileType('retail')}
                        className={`py-1.5 rounded-lg font-bold border cursor-pointer ${
                          profileType === 'retail'
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-200'
                        }`}
                      >
                        Retail
                      </button>
                      <button
                        type="button"
                        onClick={() => setProfileType('retailer')}
                        className={`py-1.5 rounded-lg font-bold border cursor-pointer ${
                          profileType === 'retailer'
                            ? 'bg-purple-600 text-white border-purple-600'
                            : 'bg-white text-slate-600 border-slate-200'
                        }`}
                      >
                        Retailer
                      </button>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Customer Name *</label>
                    <input
                      type="text"
                      required
                      value={profileName}
                      onChange={e => setProfileName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-purple-600 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">CNIC / ID Number</label>
                    <input
                      type="text"
                      value={profileCnic}
                      onChange={e => setProfileCnic(e.target.value)}
                      placeholder="35202-1234567-1"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 tabular-nums focus:outline-none focus:border-purple-600 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Primary Phone *</label>
                    <input
                      type="text"
                      required
                      value={profilePhone}
                      onChange={e => setProfilePhone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 tabular-nums focus:outline-none focus:border-purple-600 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Secondary Phone</label>
                    <input
                      type="text"
                      value={profilePhone2}
                      onChange={e => setProfilePhone2(e.target.value)}
                      placeholder="Optional"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 tabular-nums focus:outline-none focus:border-purple-600 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Credit Limit ({currency})</label>
                    <input
                      type="number"
                      min="0"
                      value={profileCreditLimit}
                      onChange={e => setProfileCreditLimit(e.target.value)}
                      placeholder="No Limit"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 tabular-nums focus:outline-none focus:border-purple-600 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Promise Due Date</label>
                    <input
                      type="date"
                      value={profileDueDate}
                      onChange={e => setProfileDueDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 tabular-nums focus:outline-none focus:border-purple-600 focus:bg-white"
                    />
                  </div>
                  {profileType === 'retailer' && (
                    <>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Shop / Firm Name</label>
                        <input
                          type="text"
                          value={profileShopName}
                          onChange={e => setProfileShopName(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-purple-600 focus:bg-white"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">NTN / GST</label>
                        <input
                          type="text"
                          value={profileNtn}
                          onChange={e => setProfileNtn(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 tabular-nums focus:outline-none focus:border-purple-600 focus:bg-white"
                        />
                      </div>
                    </>
                  )}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">City / Bazaar</label>
                    <input
                      type="text"
                      value={profileCity}
                      onChange={e => setProfileCity(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-purple-600 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Guarantor Name</label>
                    <input
                      type="text"
                      value={profileGuarantorName}
                      onChange={e => setProfileGuarantorName(e.target.value)}
                      placeholder="Witness / Reference"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-purple-600 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Guarantor Phone</label>
                    <input
                      type="text"
                      value={profileGuarantorPhone}
                      onChange={e => setProfileGuarantorPhone(e.target.value)}
                      placeholder="03XX-XXXXXXX"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 tabular-nums focus:outline-none focus:border-purple-600 focus:bg-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">Account Notes</label>
                    <input
                      type="text"
                      value={profileNotes}
                      onChange={e => setProfileNotes(e.target.value)}
                      placeholder="Installment agreement notes..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-purple-600 focus:bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('location')}
                  className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <MapPin className="w-3.5 h-3.5" /> Edit Google Maps Pin on Location Tab
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('ledger')}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save Account Changes
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-2 shrink-0 bg-slate-50">
          <span className="text-[11px] text-slate-400">
            Last updated: {new Date(customer.lastUpdated).toLocaleString()}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
          >
            Close Account
          </button>
        </div>
      </div>

      {/* Profile Photo Camera Modal */}
      <CameraCaptureModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        title="Capture Customer Photo"
        onCapture={async dataUrl => {
          try {
            const compressed = await compressImage(dataUrl, 700, 0.7);
            setProfileImage(compressed);
            showToast('Customer photo captured & optimized!', 'success');
          } catch {
            setProfileImage(dataUrl);
          }
        }}
      />

      {/* Transaction Receipt Camera Modal */}
      <CameraCaptureModal
        isOpen={isTxCameraOpen}
        onClose={() => setIsTxCameraOpen(false)}
        title="Capture Receipt / Transaction Photo"
        onCapture={async dataUrl => {
          try {
            const compressed = await compressImage(dataUrl, 700, 0.7);
            setTxReceiptImage(compressed);
            showToast('Receipt picture captured & optimized!', 'success');
          } catch {
            setTxReceiptImage(dataUrl);
          }
        }}
      />

      {/* Image Lightbox Modal */}
      {viewingImageModal && (
        <div
          className="fixed inset-0 z-60 bg-slate-950/80 flex items-center justify-center p-4"
          onClick={() => setViewingImageModal(null)}
        >
          <div className="relative max-w-lg w-full bg-white rounded-2xl p-3 shadow-2xl space-y-2" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-slate-800">Attached Transaction Photo / Receipt</span>
              <button
                type="button"
                onClick={() => setViewingImageModal(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-900 flex items-center justify-center max-h-[75vh]">
              <img src={viewingImageModal} alt="Receipt Attachment" className="max-w-full max-h-[70vh] object-contain" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
