import React, { useState, useMemo, useEffect, useRef } from 'react';
import { KhataCustomer, SaleItem, SaleRecord, SalesReturnRecord, ShopSettings } from '../types';
import {
  X,
  User,
  Phone,
  MapPin,
  MessageSquare,
  Printer,
  Calendar,
  ArrowLeft,
  ArrowLeftRight,
  FileText,
  Navigation,
  Search,
  Edit3,
  Download,
  Camera,
  Upload,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  ShoppingBag,
  Save,
  Image as ImageIcon,
  RotateCcw,
  MoreVertical,
  Bell,
  CloudCheck,
  Pencil,
  ChevronRight,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useToast } from './Toast';
import { CustomerLocationPicker, CustomerLocationValue } from './CustomerLocationPicker';
import { CameraCaptureModal } from './CameraCaptureModal';
import { LedgerCalculatorEntry, LedgerCalculatorEntryInitial } from './LedgerCalculatorEntry';
import { buildGoogleMapsTrackUrl, buildGoogleMapsViewUrl } from '../utils/mapsConfig';
import { compressImage } from '../utils/imageCompressor';
import { smartMatch } from '../utils/smartSearch';
import { cleanWhatsAppPhone, formatLedgerTimestamp, getInitials } from '../utils/ledgerFormatters';

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
  salesReturns?: SalesReturnRecord[];
  isAdmin?: boolean;
  onAddTransaction: (
    customerId: string,
    type: 'credit' | 'payment',
    amount: number,
    paymentMethod?: string,
    accountId?: string,
    note?: string,
    receiptImage?: string,
    customDate?: string
  ) => void;
  onEditTransaction?: (
    customerId: string,
    txId: string,
    updates: {
      type: 'credit' | 'payment';
      amount: number;
      note?: string;
      date?: string;
      receiptImage?: string;
    }
  ) => void;
  onUpdateCustomer?: (updated: CustomerAccountUpdatePayload) => void;
  onDeleteTransaction?: (customerId: string, txId: string) => void;
  initialTxId?: string | null;
  onClearInitialTxId?: () => void;
}

type SettingsSubTab = 'profile' | 'location' | 'invoices';

export const CustomerAccountModal: React.FC<CustomerAccountModalProps> = ({
  customer,
  isOpen,
  onClose,
  settings,
  sales = [],
  salesReturns = [],
  isAdmin = true,
  onAddTransaction,
  onEditTransaction,
  onUpdateCustomer,
  onDeleteTransaction,
  initialTxId,
  onClearInitialTxId,
}) => {
  const { showToast } = useToast();
  const profileFileInputRef = useRef<HTMLInputElement>(null);

  // Navigation inside Customer Account
  const [workspaceView, setWorkspaceView] = useState<'ledger' | 'settings'>('ledger');
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTab>('profile');
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Entry Detail & Calculator Screens
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [calculatorConfig, setCalculatorConfig] = useState<LedgerCalculatorEntryInitial | null>(null);
  const [confirmDeleteTxId, setConfirmDeleteTxId] = useState<string | null>(null);

  // Due Date Quick Modal
  const [isSetDateOpen, setIsSetDateOpen] = useState(false);
  const [quickDueDate, setQuickDueDate] = useState('');

  // Image Lightbox
  const [viewingImageModal, setViewingImageModal] = useState<string | null>(null);

  // Ledger Search
  const [ledgerSearch, setLedgerSearch] = useState('');

  // Location Draft State
  const [locationDraft, setLocationDraft] = useState<CustomerLocationValue>({ address: '' });
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
    setProfileType(
      customer.customerType === 'retailer' || customer.customerType === 'wholesaler'
        ? 'retailer'
        : 'retail'
    );
    setProfileShopName(customer.shopName || '');
    setProfileCity(customer.city || '');
    setProfileNtn(customer.ntnNumber || '');
    setProfileCnic(customer.cnic || '');
    setProfileCreditLimit(customer.creditLimit ? String(customer.creditLimit) : '');
    setProfileDueDate(customer.dueDate || '');
    setQuickDueDate(customer.dueDate || '');
    setProfileGuarantorName(customer.guarantorName || '');
    setProfileGuarantorPhone(customer.guarantorPhone || '');
    setProfileNotes(customer.notes || '');
    setProfileImage(customer.image || '');
    setConfirmDeleteTxId(null);
    setShowMoreMenu(false);
  }, [customer, isOpen]);

  useEffect(() => {
    if (isOpen && initialTxId) {
      setSelectedTxId(initialTxId);
      setWorkspaceView('ledger');
    } else if (!isOpen) {
      setSelectedTxId(null);
      setCalculatorConfig(null);
      setWorkspaceView('ledger');
    }
  }, [isOpen, initialTxId]);

  const history = customer?.history || [];

  const totalCreditGiven = useMemo(
    () => history.filter(t => t.type === 'credit').reduce((acc, t) => acc + t.amount, 0),
    [history]
  );

  const totalPaymentReceived = useMemo(
    () => history.filter(t => t.type !== 'credit').reduce((acc, t) => acc + t.amount, 0),
    [history]
  );

  const findLinkedSaleForTx = (
    tx: KhataCustomer['history'][number],
    pool: SaleRecord[]
  ): SaleRecord | undefined => {
    if (tx.originalInvNo) {
      const targetOrig = tx.originalInvNo.trim().toLowerCase();
      const byOrig = pool.find(s => s.invNo.trim().toLowerCase() === targetOrig);
      if (byOrig) return byOrig;
    }
    const noteStr = tx.note || '';
    const invMatch =
      noteStr.match(/(INV-[A-Z0-9-]+)/i) ||
      noteStr.match(/Invoice\s*#?\s*([A-Z0-9-]+)/i) ||
      noteStr.match(/#([A-Z0-9-]{4,})/i);
    if (invMatch && invMatch[1]) {
      const targetInv = invMatch[1].trim().toLowerCase();
      const byInv = pool.find(s => s.invNo.trim().toLowerCase() === targetInv);
      if (byInv) return byInv;
    }
    if (tx.type === 'credit') {
      const txTime = new Date(tx.date).getTime();
      const txDay = tx.date ? tx.date.substring(0, 10) : '';
      const closeMatch = pool.find(s => {
        if (s.status === 'CANCELLED') return false;
        const diffMs = Math.abs(new Date(s.date).getTime() - txTime);
        const sameDay = txDay && s.date && s.date.substring(0, 10) === txDay;
        const dueMatches = Math.abs((s.amountDue || 0) - tx.amount) < 1;
        return (diffMs <= 5 * 60 * 1000 || sameDay) && dueMatches;
      });
      if (closeMatch) return closeMatch;
    }
    return undefined;
  };

  const findLinkedReturnForTx = (
    tx: KhataCustomer['history'][number],
    pool: SalesReturnRecord[]
  ): SalesReturnRecord | undefined => {
    if (tx.returnNo) {
      const byRetNo = pool.find(
        r => r.returnNo.trim().toLowerCase() === tx.returnNo!.trim().toLowerCase()
      );
      if (byRetNo) return byRetNo;
    }
    const noteStr = tx.note || '';
    const retMatch = noteStr.match(/(RET-[A-Z0-9-]+)/i);
    if (retMatch && retMatch[1]) {
      const targetRet = retMatch[1].trim().toLowerCase();
      const byNoteRet = pool.find(r => r.returnNo.trim().toLowerCase() === targetRet);
      if (byNoteRet) return byNoteRet;
    }
    return undefined;
  };

  const customerSalesPool = useMemo(() => {
    if (!customer) return sales;
    const normPhone = customer.phone.replace(/[^0-9]/g, '');
    const normName = customer.name.trim().toLowerCase();
    const matched = sales.filter(s => {
      if (s.status === 'CANCELLED') return false;
      if (s.khataCustomerId && s.khataCustomerId === customer.id) return true;
      const sPhone = (s.custPhone || '').replace(/[^0-9]/g, '');
      if (normPhone.length >= 7 && sPhone && sPhone === normPhone) return true;
      if (normName && s.custName.trim().toLowerCase() === normName) return true;
      return false;
    });
    return matched.length > 0 ? matched : sales.filter(s => s.status !== 'CANCELLED');
  }, [customer, sales]);

  const customerSalesReturns = useMemo(() => {
    if (!customer) return salesReturns;
    const normPhone = customer.phone.replace(/[^0-9]/g, '');
    const normName = customer.name.trim().toLowerCase();
    const matched = salesReturns.filter(r => {
      if (r.khataCustomerId && r.khataCustomerId === customer.id) return true;
      const rPhone = (r.customerPhone || '').replace(/[^0-9]/g, '');
      if (normPhone.length >= 7 && rPhone && rPhone === normPhone) return true;
      if (normName && (r.customerName || '').trim().toLowerCase() === normName) return true;
      return customerSalesPool.some(s => s.invNo === r.originalInvNo);
    });
    return matched.length > 0 ? matched : salesReturns;
  }, [customer, salesReturns, customerSalesPool]);

  const getSaleItemReturnMeta = (saleInvNo: string | undefined, item: SaleItem) => {
    const directQty = item.returnedQty || 0;
    const directImeis = Array.isArray(item.returnedImeis) ? item.returnedImeis : [];
    const directReason = item.returnReason || '';

    const matchingReturns = saleInvNo
      ? salesReturns.filter(r => r.originalInvNo === saleInvNo)
      : [];

    let recordQty = 0;
    const recordReasons: string[] = [];
    const recordImeis: string[] = [];

    for (const r of matchingReturns) {
      for (const ri of r.items) {
        const idMatches = ri.productId === item.id;
        const variantMatches =
          !ri.variantId || !item.variantId || ri.variantId === item.variantId;
        const nameMatches =
          (ri.name || '').trim().toLowerCase() === (item.name || '').trim().toLowerCase();
        if ((idMatches && variantMatches) || (!ri.productId && nameMatches)) {
          recordQty += ri.qty || 0;
          const rsn = (r.reason || '').trim();
          if (rsn && !recordReasons.includes(rsn)) recordReasons.push(rsn);
          if (Array.isArray(ri.imeis)) {
            ri.imeis.forEach(im => {
              if (im && !recordImeis.includes(im)) recordImeis.push(im);
            });
          }
        }
      }
    }

    const returnedQty = Math.max(directQty, recordQty);
    const returnedImeis = directImeis.length > 0 ? directImeis : recordImeis;
    const returnReason =
      directReason || (recordReasons.length > 0 ? recordReasons.join(', ') : '');

    return {
      isReturned: returnedQty > 0,
      returnedQty,
      returnedImeis,
      returnReason,
    };
  };

  const runningLedger = useMemo(() => {
    let running = 0;
    const sorted = [...history].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const calculated = sorted.map(tx => {
      const prevBalance = running;
      if (tx.type === 'credit') {
        running += tx.amount;
      } else {
        running -= tx.amount;
      }
      const linkedSale = findLinkedSaleForTx(tx, customerSalesPool);
      const linkedReturn = findLinkedReturnForTx(tx, customerSalesReturns);
      const isSalesReturn =
        tx.type === 'debit' ||
        Boolean(tx.returnNo) ||
        Boolean(linkedReturn) ||
        (tx.note || '').toLowerCase().includes('sales return');
      return {
        ...tx,
        prevBalance,
        runningBalance: running,
        linkedSale,
        linkedReturn,
        isSalesReturn,
      };
    });

    return calculated.reverse();
  }, [history, customerSalesPool, customerSalesReturns]);

  const filteredLedger = useMemo(() => {
    const q = ledgerSearch.trim();
    if (!q) return runningLedger;
    return runningLedger.filter(tx => {
      const itemsText = (tx.linkedSale?.items || [])
        .map(
          it =>
            `${it.name} ${it.variantLabel || ''} ${it.imei || ''} ${(it.imeis || []).join(' ')}`
        )
        .join(' ');
      const returnItemsText = (tx.returnedItemsSummary || tx.linkedReturn?.items || [])
        .map(ri => `${ri.name} ${ri.variantLabel || ''} ${(ri.imeis || []).join(' ')}`)
        .join(' ');
      return smartMatch(
        q,
        [
          tx.note,
          tx.paymentMethod,
          tx.linkedSale?.invNo,
          tx.returnNo,
          tx.originalInvNo,
          tx.returnReason,
          tx.amount,
        ],
        [itemsText, returnItemsText]
      );
    });
  }, [runningLedger, ledgerSearch]);

  const selectedEntry = useMemo(
    () => (selectedTxId ? runningLedger.find(t => t.id === selectedTxId) || null : null),
    [selectedTxId, runningLedger]
  );

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
    if (diffDays < 0) return { label: `${Math.abs(diffDays)}d overdue`, tone: 'overdue' as const };
    if (diffDays === 0) return { label: 'Due today', tone: 'today' as const };
    return { label: `Due in ${diffDays}d`, tone: 'upcoming' as const };
  }, [customer?.dueDate, customer?.balance]);

  if (!isOpen || !customer) return null;

  const currency = settings.currency || 'Rs';
  const waPhone = cleanWhatsAppPhone(customer.phone);
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

  const reminderMessageText = (() => {
    const dueLine = customer.dueDate
      ? `\nDue Date: ${new Date(customer.dueDate).toLocaleDateString()}`
      : '';
    return (
      `Assalam-o-Alaikum ${customer.name},\n` +
      `Reminder from ${settings.shopName}: Your pending ledger balance is ${currency} ${Math.abs(customer.balance).toLocaleString()}${dueLine}.\n` +
      `Contact: ${settings.phone}`
    );
  })();

  const whatsAppReminderUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(reminderMessageText)}`;
  const smsReminderUrl = `sms:${customer.phone.replace(/[^0-9+]/g, '')}?body=${encodeURIComponent(reminderMessageText)}`;

  const handleDownloadPdfStatement = () => {
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      doc.setFillColor(5, 150, 105);
      doc.rect(0, 0, 210, 32, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(settings.shopName || 'Customer Ledger Statement', 14, 14);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`${settings.address || ''}  |  Ph: ${settings.phone || ''}`, 14, 21);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('PARTY LEDGER STATEMENT', 196, 15, { align: 'right' });
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.text(`Generated: ${new Date().toLocaleString()}`, 196, 22, { align: 'right' });

      doc.setTextColor(15, 23, 42);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`Party: ${customer.name}`, 14, 42);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Phone: ${customer.phone}${customer.phone2 ? ` / ${customer.phone2}` : ''}`, 14, 48);
      if (customer.cnic) doc.text(`CNIC: ${customer.cnic}`, 14, 54);
      if (customer.address) doc.text(`Address: ${customer.address}`, 14, customer.cnic ? 60 : 54, { maxWidth: 115 });

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(132, 38, 64, 30, 2, 2, 'FD');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(customer.balance >= 0 ? 'YOU WILL GET' : 'YOU WILL GIVE', 136, 44);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(customer.balance > 0 ? 185 : 5, customer.balance > 0 ? 28 : 150, customer.balance > 0 ? 28 : 105);
      doc.text(`${currency} ${Math.abs(customer.balance).toLocaleString()}`, 136, 51);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.text(`You Gave: ${currency} ${totalCreditGiven.toLocaleString()}`, 136, 58);
      doc.text(`You Got: ${currency} ${totalPaymentReceived.toLocaleString()}`, 136, 64);

      const tableRows = runningLedger.map(tx => [
        new Date(tx.date).toLocaleDateString(),
        tx.note || (tx.type === 'credit' ? 'You Gave' : 'You Got'),
        tx.type === 'credit' ? `${currency} ${tx.amount.toLocaleString()}` : '-',
        tx.type !== 'credit' ? `${currency} ${tx.amount.toLocaleString()}` : '-',
        `${currency} ${tx.runningBalance.toLocaleString()}`,
      ]);

      autoTable(doc, {
        startY: 74,
        head: [['Date', 'Details / Remarks', 'You Gave', 'You Got', 'Balance']],
        body: tableRows.length > 0 ? tableRows : [['--', 'No entries recorded', '--', '--', '--']],
        styles: { fontSize: 8.5, cellPadding: 2.5, overflow: 'linebreak' },
        headStyles: { fillColor: [5, 150, 105], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          1: { cellWidth: 74 },
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right', fontStyle: 'bold' },
        },
      });

      const safeName = customer.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      doc.save(`Ledger_${safeName}.pdf`);
      showToast('Ledger PDF report downloaded', 'success');
    } catch (err) {
      console.error('PDF error:', err);
      showToast('Could not generate PDF report', 'error');
    }
  };

  const handlePrintStatement = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Popup blocked. Please allow popups to print.', 'warning');
      return;
    }

    const rows = runningLedger
      .map(
        tx => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #eee;">${formatLedgerTimestamp(tx.date)}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;">${tx.note || '-'}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;color:#dc2626;font-weight:700;">
            ${tx.type === 'credit' ? tx.amount.toLocaleString() : ''}
          </td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;color:#059669;font-weight:700;">
            ${tx.type !== 'credit' ? tx.amount.toLocaleString() : ''}
          </td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;font-weight:800;">
            ${currency} ${tx.runningBalance.toLocaleString()}
          </td>
        </tr>`
      )
      .join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Ledger - ${customer.name}</title>
          <style>
            body { font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; padding: 24px; color: #0f172a; font-variant-numeric: tabular-nums; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 12px; }
            th { text-align: left; padding: 8px; background: #ecfdf5; border-bottom: 2px solid #059669; }
          </style>
        </head>
        <body>
          <h2 style="margin:0;">${settings.shopName}</h2>
          <p style="margin:2px 0 12px 0;font-size:11px;color:#64748b;">Party: <strong>${customer.name}</strong> (${customer.phone}) | Net Balance: <strong>${currency} ${customer.balance.toLocaleString()}</strong></p>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Entries</th>
                <th style="text-align:right;">You Gave</th>
                <th style="text-align:right;">You Got</th>
                <th style="text-align:right;">Balance</th>
              </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="5" style="text-align:center;padding:16px;">No entries recorded</td></tr>'}</tbody>
          </table>
          <script>window.onload = function(){ window.print(); }</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleSaveQuickDueDate = () => {
    if (!onUpdateCustomer) return;
    onUpdateCustomer({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      phone2: customer.phone2,
      address: customer.address,
      lat: customer.lat,
      lng: customer.lng,
      placeId: customer.placeId,
      mapUrl: customer.mapUrl,
      image: customer.image,
      customerType: customer.customerType,
      shopName: customer.shopName,
      city: customer.city,
      ntnNumber: customer.ntnNumber,
      cnic: customer.cnic,
      creditLimit: customer.creditLimit,
      dueDate: quickDueDate.trim() || undefined,
      guarantorName: customer.guarantorName,
      guarantorPhone: customer.guarantorPhone,
      notes: customer.notes,
    });
    setIsSetDateOpen(false);
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
    showToast('Location saved!', 'success');
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
    setWorkspaceView('ledger');
    showToast('Customer settings updated', 'success');
  };

  const handleProfileImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, 700, 0.7);
      setProfileImage(compressed);
      showToast('Profile photo attached!', 'success');
    } catch {
      showToast('Could not process image', 'warning');
    }
  };

  const handleSaveCalculatorEntry = (payload: {
    txId?: string;
    type: 'credit' | 'payment';
    amount: number;
    note?: string;
    date?: string;
    receiptImage?: string;
  }) => {
    if (payload.txId && onEditTransaction) {
      onEditTransaction(customer.id, payload.txId, {
        type: payload.type,
        amount: payload.amount,
        note: payload.note,
        date: payload.date,
        receiptImage: payload.receiptImage,
      });
    } else {
      onAddTransaction(
        customer.id,
        payload.type,
        payload.amount,
        payload.type === 'payment' ? 'Cash' : undefined,
        undefined,
        payload.note,
        payload.receiptImage,
        payload.date
      );
      showToast(
        payload.type === 'credit'
          ? `Recorded You Gave ${currency} ${payload.amount.toLocaleString()}`
          : `Recorded You Got ${currency} ${payload.amount.toLocaleString()}`,
        'success'
      );
    }
    setCalculatorConfig(null);
  };

  const handleCloseEntryDetail = () => {
    setSelectedTxId(null);
    setConfirmDeleteTxId(null);
    if (onClearInitialTxId) onClearInitialTxId();
  };

  const handleFlipEntryDirection = () => {
    if (!selectedEntry || !onEditTransaction) return;
    const nextType: 'credit' | 'payment' = selectedEntry.type === 'credit' ? 'payment' : 'credit';
    onEditTransaction(customer.id, selectedEntry.id, {
      type: nextType,
      amount: selectedEntry.amount,
      note: selectedEntry.note,
      date: selectedEntry.date,
      receiptImage: selectedEntry.receiptImage,
    });
  };

  // =========================================================================
  // VIEW A: ENTRY DETAIL SCREEN (Screenshot 3, Green Theme)
  // =========================================================================
  if (selectedEntry) {
    const isGave = selectedEntry.type === 'credit';
    const isReturn = selectedEntry.isSalesReturn;
    const sale = selectedEntry.linkedSale;
    const retRecord = selectedEntry.linkedReturn;
    const returnedSummaryItems =
      selectedEntry.returnedItemsSummary && selectedEntry.returnedItemsSummary.length > 0
        ? selectedEntry.returnedItemsSummary
        : (retRecord?.items || []).map(ri => ({
            name: ri.name,
            variantLabel: ri.variantLabel,
            qty: ri.qty,
            imeis: ri.imeis,
            reason: selectedEntry.returnReason || retRecord?.reason || 'Returned',
            refundAmount: ri.qty * ri.salePrice,
          }));

    const entryMessage =
      `${settings.shopName}\n` +
      `Party: ${customer.name}\n` +
      `Entry: ${isGave ? 'You Gave' : isReturn ? 'Returned' : 'You Got'} ${currency} ${selectedEntry.amount.toLocaleString()}\n` +
      `Date: ${formatLedgerTimestamp(selectedEntry.date)}\n` +
      `${selectedEntry.note ? `Details: ${selectedEntry.note}\n` : ''}` +
      `Running Balance: ${currency} ${Math.abs(selectedEntry.runningBalance).toLocaleString()}`;

    const entryWaUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(entryMessage)}`;
    const entrySmsUrl = `sms:${customer.phone.replace(/[^0-9+]/g, '')}?body=${encodeURIComponent(entryMessage)}`;

    return (
      <>
        <div className="fixed inset-0 z-[55] bg-slate-50 flex flex-col overflow-hidden animate-in fade-in pb-[env(safe-area-inset-bottom,0px)]">
          {/* Green Header */}
          <div className="app-fullscreen-modal-header bg-emerald-600 text-white px-3 sm:px-5 pt-[calc(env(safe-area-inset-top,0px)+0.85rem)] sm:pt-3 pb-3 flex items-center justify-between gap-2 shrink-0 shadow-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={handleCloseEntryDetail}
                className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center transition cursor-pointer shrink-0"
                aria-label="Back to Ledger"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-base sm:text-lg font-extrabold tracking-tight truncate">
                Entry Detail
              </h2>
            </div>

            {isAdmin && onEditTransaction && !isReturn && (
              <button
                type="button"
                onClick={handleFlipEntryDirection}
                className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center transition cursor-pointer shrink-0"
                title="Switch between You Gave / You Got"
                aria-label="Switch Entry Type"
              >
                <ArrowLeftRight className="w-4.5 h-4.5" />
              </button>
            )}
          </div>

          {/* Main Entry Detail Card Stack */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-3 max-w-2xl w-full mx-auto">
            {/* Primary Card */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden divide-y divide-slate-100">
              {/* Top Customer & Amount Row */}
              <div className="p-3.5 sm:p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-full bg-slate-100 text-emerald-700 font-extrabold text-sm flex items-center justify-center overflow-hidden shrink-0">
                    {customer.image ? (
                      <img src={customer.image} alt={customer.name} className="w-full h-full object-cover" />
                    ) : (
                      getInitials(customer.name)
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-extrabold text-slate-900 truncate">
                      {customer.name}
                    </h3>
                    <p className="text-[11px] text-slate-500 tabular-nums truncate">
                      {formatLedgerTimestamp(selectedEntry.date)}
                    </p>
                    {isAdmin && onEditTransaction && (
                      <button
                        type="button"
                        onClick={() =>
                          setCalculatorConfig({
                            txId: selectedEntry.id,
                            type: selectedEntry.type === 'credit' ? 'credit' : 'payment',
                            amount: selectedEntry.amount,
                            note: selectedEntry.note,
                            date: selectedEntry.date,
                            receiptImage: selectedEntry.receiptImage,
                          })
                        }
                        className="text-[11px] font-bold text-emerald-600 hover:underline mt-0.5 cursor-pointer"
                      >
                        Change
                      </button>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <p
                    className={`text-base sm:text-lg font-extrabold tabular-nums ${
                      isGave ? 'text-rose-600' : 'text-emerald-600'
                    }`}
                  >
                    {currency} {selectedEntry.amount.toLocaleString()}
                  </p>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {isGave ? 'You Gave' : isReturn ? 'Returned' : 'You Got'}
                  </span>
                </div>
              </div>

              {/* Details Row */}
              <div className="p-3.5 sm:p-4 space-y-2">
                <span className="block text-[11px] font-semibold text-slate-400">Details</span>
                <p className="text-sm font-bold text-slate-900 break-words">
                  {selectedEntry.note || (isGave ? 'Credit Entry' : 'Payment Received')}
                </p>

                {selectedEntry.receiptImage && (
                  <button
                    type="button"
                    onClick={() => setViewingImageModal(selectedEntry.receiptImage || null)}
                    className="inline-flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200 hover:border-emerald-400 transition cursor-pointer"
                  >
                    <img
                      src={selectedEntry.receiptImage}
                      alt="Receipt"
                      className="w-12 h-12 rounded-lg object-cover"
                    />
                    <span className="text-xs font-bold text-emerald-700">View Receipt Photo</span>
                  </button>
                )}

                {/* Linked POS Invoice Items if present */}
                {!isReturn && sale && sale.items && sale.items.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-100 space-y-1.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                      Invoice {sale.invNo} • Items ({sale.items.length})
                    </span>
                    {sale.items.map((it, idx) => {
                      const imeis =
                        Array.isArray(it.imeis) && it.imeis.length > 0 ? it.imeis.join(', ') : it.imei;
                      const retMeta = getSaleItemReturnMeta(sale.invNo, it);
                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-2 text-xs bg-slate-50 rounded-lg px-2.5 py-1.5"
                        >
                          <div className="min-w-0">
                            <span className="font-bold text-slate-800 block truncate">
                              {it.name}
                              {it.variantLabel ? ` (${it.variantLabel})` : ''}
                            </span>
                            {imeis && (
                              <span className="text-[10px] font-mono text-emerald-700 break-all">
                                IMEI: {imeis}
                              </span>
                            )}
                            {retMeta.isReturned && (
                              <span className="text-[10px] font-bold text-amber-700 block">
                                Returned ({retMeta.returnedQty})
                              </span>
                            )}
                          </div>
                          <span className="font-bold text-slate-700 tabular-nums shrink-0">
                            {it.qty} × {currency} {it.salePrice.toLocaleString()}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Returned Items if present */}
                {isReturn && returnedSummaryItems.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-100 space-y-1.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700 block">
                      Returned Products
                    </span>
                    {returnedSummaryItems.map((ri, rIdx) => (
                      <div
                        key={rIdx}
                        className="flex items-center justify-between gap-2 text-xs bg-amber-50/70 rounded-lg px-2.5 py-1.5"
                      >
                        <div className="min-w-0">
                          <span className="font-bold text-slate-900 block truncate">{ri.name}</span>
                          <span className="text-[10px] text-amber-800">{ri.reason}</span>
                        </div>
                        <span className="font-bold text-amber-900 tabular-nums shrink-0">
                          Qty {ri.qty} • -{currency} {(ri.refundAmount || 0).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Running Balance Row */}
              <div className="p-3.5 sm:p-4 flex items-center justify-between">
                <span className="text-xs sm:text-sm font-semibold text-slate-700">Running Balance</span>
                <span
                  className={`text-sm sm:text-base font-extrabold tabular-nums ${
                    selectedEntry.runningBalance > 0 ? 'text-rose-600' : 'text-emerald-600'
                  }`}
                >
                  {currency} {Math.abs(selectedEntry.runningBalance).toLocaleString()}
                </span>
              </div>

              {/* Edit Entry Button */}
              {isAdmin && onEditTransaction && (
                <button
                  type="button"
                  onClick={() =>
                    setCalculatorConfig({
                      txId: selectedEntry.id,
                      type: selectedEntry.type === 'credit' ? 'credit' : 'payment',
                      amount: selectedEntry.amount,
                      note: selectedEntry.note,
                      date: selectedEntry.date,
                      receiptImage: selectedEntry.receiptImage,
                    })
                  }
                  className="w-full py-3.5 px-4 flex items-center justify-center gap-2 text-xs sm:text-sm font-extrabold text-emerald-700 hover:bg-emerald-50/60 transition cursor-pointer"
                >
                  <Pencil className="w-4 h-4" />
                  <span>EDIT ENTRY</span>
                </button>
              )}
            </div>

            {/* Backup Status Card */}
            <div className="bg-white rounded-2xl border border-slate-200/90 px-4 py-3.5 flex items-center gap-3 text-slate-600 shadow-2xs">
              <CloudCheck className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
              <span className="text-xs sm:text-sm font-medium">Entry is backed up</span>
            </div>

            {/* Delete Entry Card */}
            {isAdmin && onDeleteTransaction && (
              <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-2xs">
                {confirmDeleteTxId === selectedEntry.id ? (
                  <div className="p-3.5 flex items-center justify-between gap-2 bg-rose-50/60">
                    <span className="text-xs font-bold text-rose-800">
                      Delete this entry permanently?
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteTxId(null)}
                        className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteTransaction(customer.id, selectedEntry.id);
                          setConfirmDeleteTxId(null);
                          handleCloseEntryDetail();
                        }}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-extrabold cursor-pointer"
                      >
                        Confirm Delete
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteTxId(selectedEntry.id)}
                    className="w-full px-4 py-3.5 flex items-center gap-3 text-slate-700 hover:text-rose-600 hover:bg-rose-50/40 transition text-left cursor-pointer"
                  >
                    <Trash2 className="w-4.5 h-4.5 shrink-0" />
                    <span className="text-xs sm:text-sm font-bold tracking-wide">DELETE ENTRY</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Bottom Dual Outline Buttons: WHATSAPP & SMS */}
          <div className="bg-white border-t border-slate-200 px-3 sm:px-5 py-2.5 grid grid-cols-2 gap-2.5 shrink-0 max-w-2xl w-full mx-auto">
            <a
              href={entryWaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="h-11 rounded-full border-2 border-emerald-600 bg-white hover:bg-emerald-50 text-emerald-700 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition"
            >
              <MessageSquare className="w-4 h-4" />
              <span>WHATSAPP</span>
            </a>
            <a
              href={entrySmsUrl}
              className="h-11 rounded-full border-2 border-emerald-600 bg-white hover:bg-emerald-50 text-emerald-700 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition"
            >
              <MessageSquare className="w-4 h-4" />
              <span>SMS</span>
            </a>
          </div>
        </div>

        {/* Calculator Entry Overlay (for editing this entry) */}
        {calculatorConfig && (
          <LedgerCalculatorEntry
            isOpen={true}
            onClose={() => setCalculatorConfig(null)}
            customerName={customer.name}
            currentBalance={customer.balance}
            currency={currency}
            initial={calculatorConfig}
            onSave={handleSaveCalculatorEntry}
          />
        )}

        {viewingImageModal && (
          <div
            className="fixed inset-0 z-[70] bg-slate-950/80 flex items-center justify-center p-4"
            onClick={() => setViewingImageModal(null)}
          >
            <div
              className="relative max-w-lg w-full bg-white rounded-2xl p-3 shadow-2xl space-y-2"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-800">Attached Photo / Receipt</span>
                <button
                  type="button"
                  onClick={() => setViewingImageModal(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-900 flex items-center justify-center max-h-[75vh]">
                <img src={viewingImageModal} alt="Receipt" className="max-w-full max-h-[70vh] object-contain" />
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // =========================================================================
  // VIEW B: PROFILE / MAP LOCATION / INVOICES SETTINGS WORKSPACE
  // =========================================================================
  if (workspaceView === 'settings') {
    return (
      <>
        <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col overflow-hidden animate-in fade-in pb-[env(safe-area-inset-bottom,0px)]">
          {/* Green Header */}
          <div className="app-fullscreen-modal-header bg-emerald-600 text-white px-3 sm:px-5 pt-[calc(env(safe-area-inset-top,0px)+0.85rem)] sm:pt-3 pb-3 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => setWorkspaceView('ledger')}
                className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center transition cursor-pointer shrink-0"
                aria-label="Back to Ledger"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-extrabold truncate">{customer.name}</h2>
                <p className="text-[11px] text-emerald-100 truncate">
                  Customer Settings, Location &amp; Invoices
                </p>
              </div>
            </div>
            {trackLocationUrl && (
              <a
                href={trackLocationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="h-8 px-3 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs font-bold flex items-center gap-1 shrink-0"
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>Track</span>
              </a>
            )}
          </div>

          {/* Sub-Tabs Bar */}
          <div className="bg-white border-b border-slate-200 px-3 sm:px-5 py-2 flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setSettingsSubTab('profile')}
              className={`h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                settingsSubTab === 'profile'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" /> Profile &amp; Limits
            </button>
            <button
              type="button"
              onClick={() => setSettingsSubTab('location')}
              className={`h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                settingsSubTab === 'location'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" /> Map Pin
              {hasGpsPin && <CheckCircle2 className="w-3 h-3 text-emerald-300" />}
            </button>
            <button
              type="button"
              onClick={() => setSettingsSubTab('invoices')}
              className={`h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                settingsSubTab === 'invoices'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" /> Invoices ({customerSales.length})
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-5 max-w-4xl w-full mx-auto">
            {settingsSubTab === 'profile' && (
              <form onSubmit={handleSaveFullProfile} className="space-y-4 text-xs bg-white border border-slate-200 rounded-2xl p-4">
                <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                  <div className="w-14 h-14 rounded-full border border-slate-200 overflow-hidden bg-slate-100 flex items-center justify-center shrink-0">
                    {profileImage ? (
                      <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-6 h-6 text-slate-400" />
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
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
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg flex items-center gap-1 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-emerald-600" /> Gallery
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsCameraOpen(true)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg flex items-center gap-1 cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5" /> Camera
                    </button>
                    {profileImage && (
                      <button
                        type="button"
                        onClick={() => setProfileImage('')}
                        className="px-2.5 py-1.5 text-rose-600 font-bold cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Customer Name *</label>
                    <input
                      type="text"
                      required
                      value={profileName}
                      onChange={e => setProfileName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-600 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Primary Phone *</label>
                    <input
                      type="text"
                      required
                      value={profilePhone}
                      onChange={e => setProfilePhone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 tabular-nums focus:outline-none focus:border-emerald-600 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Secondary Phone</label>
                    <input
                      type="text"
                      value={profilePhone2}
                      onChange={e => setProfilePhone2(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 tabular-nums focus:outline-none focus:border-emerald-600 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">CNIC / ID Number</label>
                    <input
                      type="text"
                      value={profileCnic}
                      onChange={e => setProfileCnic(e.target.value)}
                      placeholder="35202-1234567-1"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 tabular-nums focus:outline-none focus:border-emerald-600 focus:bg-white"
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
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 tabular-nums focus:outline-none focus:border-emerald-600 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Promise Due Date</label>
                    <input
                      type="date"
                      value={profileDueDate}
                      onChange={e => setProfileDueDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 tabular-nums focus:outline-none focus:border-emerald-600 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">City / Bazaar</label>
                    <input
                      type="text"
                      value={profileCity}
                      onChange={e => setProfileCity(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-600 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Account Category</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setProfileType('retail')}
                        className={`py-2 rounded-xl font-bold border cursor-pointer ${
                          profileType === 'retail'
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        Retail
                      </button>
                      <button
                        type="button"
                        onClick={() => setProfileType('retailer')}
                        className={`py-2 rounded-xl font-bold border cursor-pointer ${
                          profileType === 'retailer'
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        Retailer
                      </button>
                    </div>
                  </div>
                  {profileType === 'retailer' && (
                    <>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Shop / Firm Name</label>
                        <input
                          type="text"
                          value={profileShopName}
                          onChange={e => setProfileShopName(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-600 focus:bg-white"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">NTN / GST</label>
                        <input
                          type="text"
                          value={profileNtn}
                          onChange={e => setProfileNtn(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 tabular-nums focus:outline-none focus:border-emerald-600 focus:bg-white"
                        />
                      </div>
                    </>
                  )}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Guarantor Name</label>
                    <input
                      type="text"
                      value={profileGuarantorName}
                      onChange={e => setProfileGuarantorName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-600 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Guarantor Phone</label>
                    <input
                      type="text"
                      value={profileGuarantorPhone}
                      onChange={e => setProfileGuarantorPhone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 tabular-nums focus:outline-none focus:border-emerald-600 focus:bg-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">Account Notes</label>
                    <input
                      type="text"
                      value={profileNotes}
                      onChange={e => setProfileNotes(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-600 focus:bg-white"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setWorkspaceView('ledger')}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" /> Save Changes
                  </button>
                </div>
              </form>
            )}

            {settingsSubTab === 'location' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                <CustomerLocationPicker
                  value={locationDraft}
                  onChange={val => {
                    setLocationDraft(val);
                    setLocationDirty(true);
                  }}
                  customerName={customer.name}
                  heightClass="h-64 sm:h-80"
                  showAddressInput={true}
                  showTrackActions={true}
                />
                {locationDirty && (
                  <div className="flex justify-end pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={handleSaveLocationOnly}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" /> Save Map Pin
                    </button>
                  </div>
                )}
              </div>
            )}

            {settingsSubTab === 'invoices' && (
              <div className="space-y-2.5">
                {customerSales.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-xs text-slate-400">
                    No POS invoices linked to this customer yet.
                  </div>
                ) : (
                  customerSales.map(sale => (
                    <div
                      key={sale.invNo}
                      className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="font-extrabold text-slate-900 tabular-nums">{sale.invNo}</span>
                          <span className="block text-[11px] text-slate-500">
                            {formatLedgerTimestamp(sale.date)}
                          </span>
                        </div>
                        <div className="text-right tabular-nums">
                          <span className="font-extrabold text-slate-900 block">
                            {currency} {sale.grandTotal.toLocaleString()}
                          </span>
                          {(sale.amountDue || 0) > 0 && (
                            <span className="text-[11px] font-bold text-rose-600">
                              Due: {currency} {(sale.amountDue || 0).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="divide-y divide-slate-100 border-t border-slate-100 pt-1">
                        {sale.items.map((item, idx) => (
                          <div key={idx} className="py-1 flex items-center justify-between gap-2">
                            <span className="font-semibold text-slate-700 truncate">
                              {item.name} {item.variantLabel ? `(${item.variantLabel})` : ''}
                            </span>
                            <span className="tabular-nums text-slate-600 shrink-0">
                              {item.qty} × {currency} {item.salePrice.toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <CameraCaptureModal
          isOpen={isCameraOpen}
          onClose={() => setIsCameraOpen(false)}
          title="Capture Customer Photo"
          onCapture={async dataUrl => {
            try {
              const compressed = await compressImage(dataUrl, 700, 0.7);
              setProfileImage(compressed);
            } catch {
              setProfileImage(dataUrl);
            }
          }}
        />
      </>
    );
  }

  // =========================================================================
  // VIEW C: MAIN PARTY LEDGER SCREEN (Screenshot 2, Green Theme)
  // =========================================================================
  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col overflow-hidden animate-in fade-in pb-[env(safe-area-inset-bottom,0px)]">
        {/* Green Header + Overlapping White Balance Card */}
        <div className="app-fullscreen-modal-header bg-emerald-600 text-white px-3 sm:px-5 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] sm:pt-3 pb-10 shrink-0 relative">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center transition cursor-pointer shrink-0"
                aria-label="Back to Party List"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setSettingsSubTab('profile');
                  setWorkspaceView('settings');
                }}
                className="min-w-0 text-left cursor-pointer group"
              >
                <div className="flex items-center gap-1.5">
                  <h2 className="text-base sm:text-lg font-extrabold tracking-tight truncate">
                    {customer.name}
                  </h2>
                  <span className="px-2 py-0.5 rounded-full bg-white/95 text-emerald-700 text-[10px] font-extrabold shrink-0">
                    {customer.customerType === 'retailer' || customer.customerType === 'wholesaler'
                      ? 'Retailer'
                      : 'Customer'}
                  </span>
                </div>
                <span className="block text-[11px] text-emerald-50/90 group-hover:underline truncate">
                  Click here to view settings
                </span>
              </button>
            </div>

            <div className="flex items-center gap-1 shrink-0 relative">
              <a
                href={`tel:${customer.phone.replace(/[^0-9+]/g, '')}`}
                className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center transition"
                title={`Call ${customer.phone}`}
                aria-label="Call Customer"
              >
                <Phone className="w-4.5 h-4.5" />
              </a>

              <button
                type="button"
                onClick={() => setShowMoreMenu(v => !v)}
                className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center transition cursor-pointer"
                aria-label="More Options"
              >
                <MoreVertical className="w-4.5 h-4.5" />
              </button>

              {showMoreMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowMoreMenu(false)}
                  />
                  <div className="absolute right-0 top-11 z-50 w-48 bg-white text-slate-800 rounded-2xl shadow-xl border border-slate-200 py-1.5 text-xs font-bold animate-in fade-in zoom-in-95">
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreMenu(false);
                        setSettingsSubTab('profile');
                        setWorkspaceView('settings');
                      }}
                      className="w-full px-3.5 py-2.5 hover:bg-slate-50 flex items-center gap-2 text-left cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-emerald-600" /> Edit Profile &amp; Limits
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreMenu(false);
                        setSettingsSubTab('location');
                        setWorkspaceView('settings');
                      }}
                      className="w-full px-3.5 py-2.5 hover:bg-slate-50 flex items-center gap-2 text-left cursor-pointer"
                    >
                      <MapPin className="w-3.5 h-3.5 text-blue-600" /> Map Location
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreMenu(false);
                        setSettingsSubTab('invoices');
                        setWorkspaceView('settings');
                      }}
                      className="w-full px-3.5 py-2.5 hover:bg-slate-50 flex items-center gap-2 text-left cursor-pointer"
                    >
                      <ShoppingBag className="w-3.5 h-3.5 text-amber-600" /> Linked Invoices ({customerSales.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreMenu(false);
                        handlePrintStatement();
                      }}
                      className="w-full px-3.5 py-2.5 hover:bg-slate-50 flex items-center gap-2 text-left cursor-pointer border-t border-slate-100"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-600" /> Print Ledger
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Overlapping White Balance Card */}
        <div className="px-3 sm:px-5 -mt-7 relative z-10 shrink-0">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p
                className={`text-lg sm:text-xl font-extrabold tabular-nums leading-tight ${
                  customer.balance > 0
                    ? 'text-rose-600'
                    : customer.balance < 0
                    ? 'text-emerald-600'
                    : 'text-slate-900'
                }`}
              >
                {currency} {Math.abs(customer.balance).toLocaleString()}
              </p>
              <span className="text-[11px] font-semibold text-slate-400">
                {customer.balance > 0
                  ? 'You will get'
                  : customer.balance < 0
                  ? 'You will give'
                  : 'Settled'}
              </span>
            </div>

            <div className="text-right space-y-0.5">
              {dueStatus && (
                <span
                  className={`inline-block text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                    dueStatus.tone === 'overdue'
                      ? 'bg-rose-50 text-rose-700'
                      : dueStatus.tone === 'today'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {dueStatus.label}
                </span>
              )}
              {customer.creditLimit && customer.creditLimit > 0 && (
                <span className="block text-[10px] text-slate-400 tabular-nums">
                  Limit: {currency} {customer.creditLimit.toLocaleString()}
                </span>
              )}
              {customer.balance > customer.creditLimit! && customer.creditLimit ? (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-rose-600">
                  <AlertTriangle className="w-3 h-3" /> Over Limit
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* 4 Quick Action Cards Row (Report, Set Date, Reminder, SMS) */}
        <div className="px-3 sm:px-5 pt-2.5 pb-2 grid grid-cols-4 gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDownloadPdfStatement}
            className="bg-white border border-slate-200/80 hover:border-emerald-300 rounded-xl py-2.5 px-1 flex flex-col items-center justify-center gap-1 shadow-2xs transition cursor-pointer"
          >
            <Download className="w-4.5 h-4.5 text-emerald-600" />
            <span className="text-[11px] font-bold text-slate-700">Report</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setQuickDueDate(customer.dueDate || '');
              setIsSetDateOpen(true);
            }}
            className="bg-white border border-slate-200/80 hover:border-emerald-300 rounded-xl py-2.5 px-1 flex flex-col items-center justify-center gap-1 shadow-2xs transition cursor-pointer"
          >
            <Calendar className="w-4.5 h-4.5 text-emerald-600" />
            <span className="text-[11px] font-bold text-slate-700">Set Date</span>
          </button>

          <a
            href={whatsAppReminderUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white border border-slate-200/80 hover:border-emerald-300 rounded-xl py-2.5 px-1 flex flex-col items-center justify-center gap-1 shadow-2xs transition"
          >
            <Bell className="w-4.5 h-4.5 text-emerald-600" />
            <span className="text-[11px] font-bold text-slate-700">Reminder</span>
          </a>

          <a
            href={smsReminderUrl}
            className="bg-white border border-slate-200/80 hover:border-emerald-300 rounded-xl py-2.5 px-1 flex flex-col items-center justify-center gap-1 shadow-2xs transition"
          >
            <MessageSquare className="w-4.5 h-4.5 text-emerald-600" />
            <span className="text-[11px] font-bold text-slate-700">SMS</span>
          </a>
        </div>

        {/* Search Input */}
        <div className="px-3 sm:px-5 pb-2 shrink-0">
          <div className="relative bg-white border border-slate-200/90 rounded-xl flex items-center px-3 h-9.5 shadow-2xs">
            <Search className="w-4 h-4 text-slate-400 shrink-0 mr-2" />
            <input
              type="text"
              value={ledgerSearch}
              onChange={e => setLedgerSearch(e.target.value)}
              placeholder="Search"
              className="compact-mobile-input flex-1 bg-transparent text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none"
            />
            {ledgerSearch && (
              <button
                type="button"
                onClick={() => setLedgerSearch('')}
                className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 3-Column Ledger Header */}
        <div className="px-3 sm:px-5 py-1.5 grid grid-cols-12 gap-2 text-[11px] font-bold text-slate-500 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="col-span-6">Entries</div>
          <div className="col-span-3 text-right">You Gave</div>
          <div className="col-span-3 text-right">You Got</div>
        </div>

        {/* Scrollable Ledger Entries Rows */}
        <div className="flex-1 overflow-y-auto touch-pan-y bg-white divide-y divide-slate-100">
          {filteredLedger.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400 space-y-1.5 px-4">
              <FileText className="w-8 h-8 mx-auto text-slate-300" />
              <p className="font-bold text-slate-600">No entries yet</p>
              <p className="text-[11px]">
                Tap &ldquo;YOU GAVE Rs&rdquo; or &ldquo;YOU GOT Rs&rdquo; below to record an entry.
              </p>
            </div>
          ) : (
            filteredLedger.map((tx, idx) => {
              const isGave = tx.type === 'credit';
              return (
                <button
                  key={tx.id || idx}
                  type="button"
                  onClick={() => setSelectedTxId(tx.id)}
                  className="w-full px-3 sm:px-5 py-2.5 grid grid-cols-12 gap-2 items-center text-left hover:bg-slate-50 active:bg-slate-100/80 transition cursor-pointer"
                >
                  {/* Entries Column */}
                  <div className="col-span-6 min-w-0 pr-2 border-r border-slate-100 space-y-0.5">
                    <span className="block text-[10px] text-slate-400 font-medium tabular-nums truncate">
                      {formatLedgerTimestamp(tx.date)}
                    </span>
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                        {tx.note || (isGave ? 'Credit Added' : 'Cash Received')}
                      </span>
                      {tx.receiptImage && (
                        <ImageIcon className="w-3 h-3 text-emerald-600 shrink-0" />
                      )}
                    </div>
                    <span className="inline-block text-[10px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded tabular-nums">
                      Bal. {currency} {tx.runningBalance.toLocaleString()}
                    </span>
                  </div>

                  {/* You Gave Column */}
                  <div className="col-span-3 text-right pr-2 border-r border-slate-100 h-full flex items-center justify-end tabular-nums">
                    {isGave && (
                      <span className="text-xs sm:text-sm font-extrabold text-rose-600">
                        {tx.amount.toLocaleString()}
                      </span>
                    )}
                  </div>

                  {/* You Got Column */}
                  <div className="col-span-3 text-right h-full flex items-center justify-end tabular-nums">
                    {!isGave && (
                      <span className="text-xs sm:text-sm font-extrabold text-emerald-600">
                        {tx.amount.toLocaleString()}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Pinned Bottom Action Bar: YOU GAVE Rs | YOU GOT Rs */}
        <div className="bg-white border-t border-slate-200 px-3 sm:px-5 py-2.5 grid grid-cols-2 gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setCalculatorConfig({ type: 'credit' })}
            className="h-11 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs sm:text-sm tracking-wide shadow-md shadow-rose-600/20 flex items-center justify-center transition cursor-pointer"
          >
            YOU GAVE {currency}
          </button>
          <button
            type="button"
            onClick={() => setCalculatorConfig({ type: 'payment' })}
            className="h-11 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm tracking-wide shadow-md shadow-emerald-600/20 flex items-center justify-center transition cursor-pointer"
          >
            YOU GOT {currency}
          </button>
        </div>
      </div>

      {/* Quick Set Due Date Modal */}
      {isSetDateOpen && (
        <div
          className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsSetDateOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-sm w-full p-4 space-y-3 shadow-2xl border border-slate-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="text-sm font-extrabold text-slate-900">Set Promise Due Date</h3>
              <button
                type="button"
                onClick={() => setIsSetDateOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="date"
              value={quickDueDate}
              onChange={e => setQuickDueDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
            />
            <div className="flex items-center justify-between gap-2 pt-1">
              {customer.dueDate ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuickDueDate('');
                    if (onUpdateCustomer) {
                      onUpdateCustomer({
                        id: customer.id,
                        name: customer.name,
                        phone: customer.phone,
                        phone2: customer.phone2,
                        address: customer.address,
                        lat: customer.lat,
                        lng: customer.lng,
                        placeId: customer.placeId,
                        mapUrl: customer.mapUrl,
                        image: customer.image,
                        customerType: customer.customerType,
                        shopName: customer.shopName,
                        city: customer.city,
                        ntnNumber: customer.ntnNumber,
                        cnic: customer.cnic,
                        creditLimit: customer.creditLimit,
                        dueDate: undefined,
                        guarantorName: customer.guarantorName,
                        guarantorPhone: customer.guarantorPhone,
                        notes: customer.notes,
                      });
                    }
                    setIsSetDateOpen(false);
                  }}
                  className="text-xs font-bold text-rose-600 hover:underline cursor-pointer"
                >
                  Clear Date
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsSetDateOpen(false)}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveQuickDueDate}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold cursor-pointer"
                >
                  Save Date
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Calculator Entry Screen (Screenshots 5 & 6) */}
      {calculatorConfig && (
        <LedgerCalculatorEntry
          isOpen={true}
          onClose={() => setCalculatorConfig(null)}
          customerName={customer.name}
          currentBalance={customer.balance}
          currency={currency}
          initial={calculatorConfig}
          onSave={handleSaveCalculatorEntry}
        />
      )}
    </>
  );
};
