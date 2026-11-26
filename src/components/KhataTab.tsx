import React, { useState, useMemo } from 'react';
import {
  KhataCustomer,
  SaleRecord,
  SalesReturnRecord,
  ShopSettings,
  SupplierPurchase,
} from '../types';
import {
  Search,
  UserPlus,
  BookOpen,
  MessageSquare,
  Trash2,
  Phone,
  MapPin,
  FileText,
  Navigation,
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Eye,
  EyeOff,
  SlidersHorizontal,
  Building2,
  X,
  CheckCircle2,
  Clock,
  Receipt,
} from 'lucide-react';
import { useToast } from './Toast';
import { CustomerAccountModal, CustomerAccountUpdatePayload } from './CustomerAccountModal';
import { AllTransactionsModal } from './AllTransactionsModal';
import { ConfirmModal } from './ConfirmModal';
import { buildGoogleMapsTrackUrl } from '../utils/mapsConfig';
import { smartFilterAndSort } from '../utils/smartSearch';
import { cleanWhatsAppPhone, formatLedgerTimestamp, getInitials } from '../utils/ledgerFormatters';

interface KhataTabProps {
  khata: KhataCustomer[];
  settings: ShopSettings;
  sales?: SaleRecord[];
  salesReturns?: SalesReturnRecord[];
  supplierPurchases?: SupplierPurchase[];
  isAdmin?: boolean;
  onOpenAddModal: () => void;
  onOpenSettleModal: (customer: KhataCustomer) => void;
  onDeleteCustomer: (id: string) => void;
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
  selectedCustomerId?: string | null;
  onClearSelectedCustomer?: () => void;
  onOpenPdfReport?: () => void;
  onGoToPurchases?: () => void;
  onBackToHome?: () => void;
}

type PartySubTab = 'customers' | 'suppliers' | 'all';
type PartyFilterType = 'all' | 'get' | 'give' | 'overdue' | 'settled';
type PartySortType = 'latest' | 'highest' | 'name';

interface AggregatedSupplier {
  id: string;
  name: string;
  phone?: string;
  balanceDue: number;
  totalPurchased: number;
  billCount: number;
  lastDate: string;
}

type UnifiedPartyRow =
  | {
      kind: 'customer';
      id: string;
      name: string;
      phone?: string;
      lastDate: string;
      customer: KhataCustomer;
    }
  | {
      kind: 'supplier';
      id: string;
      name: string;
      phone?: string;
      lastDate: string;
      supplier: AggregatedSupplier;
    };

const KhataTabComponent: React.FC<KhataTabProps> = ({
  khata,
  settings,
  sales = [],
  salesReturns = [],
  supplierPurchases = [],
  isAdmin = true,
  onOpenAddModal,
  onDeleteCustomer,
  onAddTransaction,
  onEditTransaction,
  onUpdateCustomer,
  onDeleteTransaction,
  selectedCustomerId,
  onClearSelectedCustomer,
  onOpenPdfReport,
  onGoToPurchases,
  onBackToHome,
}) => {
  const { showToast } = useToast();
  const currency = settings.currency || 'Rs';

  const [partyTab, setPartyTab] = useState<PartySubTab>('customers');
  const [search, setSearch] = useState('');
  const [hideBalance, setHideBalance] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [filterType, setFilterType] = useState<PartyFilterType>('all');
  const [sortType, setSortType] = useState<PartySortType>('latest');
  const [collectionMode, setCollectionMode] = useState(false);
  const [collectionOnlyOverdue, setCollectionOnlyOverdue] = useState(false);

  const [activeAccountCustomer, setActiveAccountCustomer] = useState<KhataCustomer | null>(null);
  const [initialEntryTxId, setInitialEntryTxId] = useState<string | null>(null);
  const [showAllTransactionsModal, setShowAllTransactionsModal] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<KhataCustomer | null>(null);

  // Sync externally selected customer (e.g. right after adding a new customer)
  React.useEffect(() => {
    if (selectedCustomerId) {
      const match = khata.find(k => k.id === selectedCustomerId);
      if (match) {
        setActiveAccountCustomer(match);
        setInitialEntryTxId(null);
      }
    }
  }, [selectedCustomerId, khata]);

  const currentActiveCustomer = useMemo(() => {
    if (!activeAccountCustomer) return null;
    return khata.find(k => k.id === activeAccountCustomer.id) || null;
  }, [activeAccountCustomer, khata]);

  const isDueOverdue = (cust: KhataCustomer) => {
    if (!cust.dueDate || cust.balance <= 0) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(cust.dueDate);
    due.setHours(0, 0, 0, 0);
    return due.getTime() < today.getTime();
  };

  // Aggregate active supplier bills from Stock Inward
  const suppliers = useMemo<AggregatedSupplier[]>(() => {
    const map = new Map<string, AggregatedSupplier>();
    for (const p of supplierPurchases) {
      if (p.status === 'REVERSED') continue;
      const rawName = (p.partyName || '').trim() || 'Supplier';
      const key = rawName.toLowerCase();
      const existing = map.get(key);
      const pTime = new Date(p.date || 0).getTime();
      if (!existing) {
        map.set(key, {
          id: `sup_${key}`,
          name: rawName,
          phone: p.partyPhone,
          balanceDue: Math.max(0, p.balanceDue || 0),
          totalPurchased: p.totalAmount || 0,
          billCount: 1,
          lastDate: p.date,
        });
      } else {
        existing.balanceDue += Math.max(0, p.balanceDue || 0);
        existing.totalPurchased += p.totalAmount || 0;
        existing.billCount += 1;
        if (!existing.phone && p.partyPhone) existing.phone = p.partyPhone;
        if (pTime > new Date(existing.lastDate || 0).getTime()) {
          existing.lastDate = p.date;
        }
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.lastDate || 0).getTime() - new Date(a.lastDate || 0).getTime()
    );
  }, [supplierPurchases]);

  // Summary totals respecting active tab (Customers vs Suppliers vs All)
  const summaryTotals = useMemo(() => {
    const customerGet = khata.reduce((sum, c) => sum + (c.balance > 0 ? c.balance : 0), 0);
    const customerGive = khata.reduce((sum, c) => sum + (c.balance < 0 ? Math.abs(c.balance) : 0), 0);
    const supplierGive = suppliers.reduce((sum, s) => sum + s.balanceDue, 0);

    if (partyTab === 'customers') {
      return { youWillGive: customerGive, youWillGet: customerGet };
    }
    if (partyTab === 'suppliers') {
      return { youWillGive: supplierGive, youWillGet: 0 };
    }
    return {
      youWillGive: customerGive + supplierGive,
      youWillGet: customerGet,
    };
  }, [khata, suppliers, partyTab]);

  // Unified filtered & sorted party rows
  const filteredRows = useMemo<UnifiedPartyRow[]>(() => {
    const rows: UnifiedPartyRow[] = [];

    if (partyTab === 'customers' || partyTab === 'all') {
      for (const c of khata) {
        if (filterType === 'get' && c.balance <= 0) continue;
        if (filterType === 'give' && c.balance >= 0) continue;
        if (filterType === 'overdue' && !isDueOverdue(c)) continue;
        if (filterType === 'settled' && c.balance !== 0) continue;

        rows.push({
          kind: 'customer',
          id: c.id,
          name: c.name,
          phone: c.phone,
          lastDate: c.lastUpdated,
          customer: c,
        });
      }
    }

    if (partyTab === 'suppliers' || partyTab === 'all') {
      for (const s of suppliers) {
        if (filterType === 'get') continue;
        if (filterType === 'give' && s.balanceDue <= 0) continue;
        if (filterType === 'overdue') continue;
        if (filterType === 'settled' && s.balanceDue !== 0) continue;

        rows.push({
          kind: 'supplier',
          id: s.id,
          name: s.name,
          phone: s.phone,
          lastDate: s.lastDate,
          supplier: s,
        });
      }
    }

    const searched = smartFilterAndSort(rows, search, r => {
      if (r.kind === 'customer') {
        const c = r.customer;
        return {
          primary: [c.name, c.phone, c.shopName],
          secondary: [c.phone2, c.address, c.cnic, c.city, c.ntnNumber],
        };
      }
      return {
        primary: [r.supplier.name, r.supplier.phone],
        secondary: [],
      };
    });

    if (search.trim()) return searched;

    return [...searched].sort((a, b) => {
      if (sortType === 'name') {
        return a.name.localeCompare(b.name);
      }
      if (sortType === 'highest') {
        const balA = a.kind === 'customer' ? Math.abs(a.customer.balance) : a.supplier.balanceDue;
        const balB = b.kind === 'customer' ? Math.abs(b.customer.balance) : b.supplier.balanceDue;
        if (balB !== balA) return balB - balA;
      }
      return new Date(b.lastDate || 0).getTime() - new Date(a.lastDate || 0).getTime();
    });
  }, [khata, suppliers, partyTab, filterType, sortType, search]);

  // Collection mode customer list (positive balances sorted by overdue / highest due)
  const collectionCustomers = useMemo(() => {
    const pending = khata.filter(c => c.balance > 0);
    const filteredCol = collectionOnlyOverdue ? pending.filter(isDueOverdue) : pending;
    const searched = smartFilterAndSort(filteredCol, search, c => ({
      primary: [c.name, c.phone, c.shopName],
      secondary: [c.address, c.city],
    }));
    if (search.trim()) return searched;
    return [...searched].sort((a, b) => {
      const aOver = isDueOverdue(a) ? 1 : 0;
      const bOver = isDueOverdue(b) ? 1 : 0;
      if (bOver !== aOver) return bOver - aOver;
      return b.balance - a.balance;
    });
  }, [khata, collectionOnlyOverdue, search]);

  const overdueCount = useMemo(
    () => khata.filter(c => isDueOverdue(c)).length,
    [khata]
  );

  const getWhatsAppReminderUrl = (customer: KhataCustomer) => {
    const cleanPhone = cleanWhatsAppPhone(customer.phone);
    const message = encodeURIComponent(
      `Assalam-o-Alaikum ${customer.name},\n\nThis is a polite reminder from *${settings.shopName}* regarding your pending Khata/Udhar balance of *${currency} ${customer.balance.toLocaleString()}*.\n\nPlease arrange payment at your earliest convenience. Thank you!\nPh: ${settings.phone}`
    );
    return `https://wa.me/${cleanPhone}?text=${message}`;
  };

  const getSmsReminderUrl = (customer: KhataCustomer) => {
    const cleanPhone = (customer.phone || '').replace(/[^0-9+]/g, '');
    const body = encodeURIComponent(
      `Assalam-o-Alaikum ${customer.name}, reminder from ${settings.shopName}: your pending balance is ${currency} ${customer.balance.toLocaleString()}. Ph: ${settings.phone}`
    );
    return `sms:${cleanPhone}?body=${body}`;
  };

  const tabCountLabel =
    partyTab === 'customers'
      ? `${khata.length} Customers`
      : partyTab === 'suppliers'
      ? `${suppliers.length} Suppliers`
      : `${khata.length + suppliers.length} Parties`;

  // =========================================================================
  // COLLECTION VIEW MODE
  // =========================================================================
  if (collectionMode) {
    const pendingTotal = collectionCustomers.reduce((sum, c) => sum + c.balance, 0);
    return (
      <div className="space-y-3 pb-20">
        {/* Collection Emerald Header */}
        <div className="bg-emerald-600 text-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setCollectionMode(false)}
                className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition cursor-pointer"
                aria-label="Back to Party list"
              >
                <ArrowLeft className="w-4.5 h-4.5" />
              </button>
              <div>
                <h2 className="text-base sm:text-lg font-extrabold tracking-tight leading-tight">
                  Recovery &amp; Collection
                </h2>
                <p className="text-[11px] text-emerald-100 font-medium">
                  {collectionCustomers.length} parties · Total {currency} {pendingTotal.toLocaleString()}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCollectionMode(false)}
              className="px-3 py-1.5 rounded-full bg-slate-900/90 hover:bg-slate-900 text-white text-[11px] font-black tracking-wide uppercase transition cursor-pointer"
            >
              ALL PARTIES
            </button>
          </div>

          <div className="px-4 pb-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCollectionOnlyOverdue(false)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
                !collectionOnlyOverdue
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'bg-emerald-700/60 text-emerald-50 hover:bg-emerald-700'
              }`}
            >
              All Pending ({khata.filter(c => c.balance > 0).length})
            </button>
            <button
              type="button"
              onClick={() => setCollectionOnlyOverdue(true)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                collectionOnlyOverdue
                  ? 'bg-white text-rose-600 shadow-xs'
                  : 'bg-emerald-700/60 text-emerald-50 hover:bg-emerald-700'
              }`}
            >
              <AlertTriangle className="w-3 h-3" /> Overdue ({overdueCount})
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search pending customer by name, phone, area..."
            className="w-full pl-10 pr-9 h-10 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-emerald-600 shadow-2xs"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Pending Customer List */}
        {collectionCustomers.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl py-12 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500" />
            <p className="text-sm font-bold text-slate-800">
              {collectionOnlyOverdue ? 'No overdue customers' : 'All customer balances cleared'}
            </p>
            <p className="text-xs text-slate-400">Great job keeping recoveries up to date.</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden shadow-2xs">
            {collectionCustomers.map(cust => {
              const overdue = isDueOverdue(cust);
              const trackUrl = buildGoogleMapsTrackUrl({
                lat: cust.lat,
                lng: cust.lng,
                placeId: cust.placeId,
                address: cust.address,
              });
              return (
                <div
                  key={cust.id}
                  onClick={() => {
                    setInitialEntryTxId(null);
                    setActiveAccountCustomer(cust);
                  }}
                  className="p-3.5 hover:bg-emerald-50/30 transition cursor-pointer flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center text-emerald-700 font-bold text-xs">
                        {cust.image ? (
                          <img src={cust.image} alt={cust.name} className="w-full h-full object-cover" />
                        ) : (
                          getInitials(cust.name)
                        )}
                      </div>
                      {overdue && (
                        <span
                          className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-white"
                          title="Overdue"
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-slate-900 truncate">{cust.name}</p>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1 truncate">
                        <span>{cust.phone}</span>
                        {cust.dueDate && (
                          <span className={overdue ? 'text-rose-600 font-bold' : 'text-amber-600 font-semibold'}>
                            · {overdue ? 'Overdue' : 'Due'} {new Date(cust.dueDate).toLocaleDateString()}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                    <div className="text-right mr-1">
                      <p className="text-[13px] font-extrabold text-rose-600 tabular-nums">
                        {currency} {cust.balance.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium">You&apos;ll Get</p>
                    </div>
                    <a
                      href={`tel:${(cust.phone || '').replace(/[^0-9+]/g, '')}`}
                      className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition"
                      title="Call"
                    >
                      <Phone className="w-3.5 h-3.5" />
                    </a>
                    <a
                      href={getWhatsAppReminderUrl(cust)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-8 h-8 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-600 flex items-center justify-center transition border border-emerald-200"
                      title="WhatsApp Reminder"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                    </a>
                    <a
                      href={getSmsReminderUrl(cust)}
                      className="hidden sm:flex w-8 h-8 rounded-full bg-sky-50 hover:bg-sky-100 text-sky-600 items-center justify-center transition border border-sky-200"
                      title="SMS Reminder"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                    </a>
                    {trackUrl && (
                      <a
                        href={trackUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hidden sm:flex w-8 h-8 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600 items-center justify-center transition border border-blue-200"
                        title="Open Google Maps Location"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setCustomerToDelete(cust)}
                        className="w-8 h-8 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition cursor-pointer"
                        title="Delete Account"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Customer Account Modal */}
        {currentActiveCustomer && (
          <CustomerAccountModal
            customer={currentActiveCustomer}
            isOpen={true}
            onClose={() => {
              setActiveAccountCustomer(null);
              setInitialEntryTxId(null);
              if (onClearSelectedCustomer) onClearSelectedCustomer();
            }}
            settings={settings}
            sales={sales}
            salesReturns={salesReturns}
            isAdmin={isAdmin}
            onAddTransaction={onAddTransaction}
            onEditTransaction={onEditTransaction}
            onUpdateCustomer={onUpdateCustomer}
            onDeleteTransaction={onDeleteTransaction}
            initialTxId={initialEntryTxId}
            onClearInitialTxId={() => setInitialEntryTxId(null)}
          />
        )}

        <ConfirmModal
          isOpen={!!customerToDelete}
          onClose={() => setCustomerToDelete(null)}
          onConfirm={() => {
            if (customerToDelete) {
              onDeleteCustomer(customerToDelete.id);
              showToast(`Khata account for "${customerToDelete.name}" deleted`, 'info');
              setCustomerToDelete(null);
            }
          }}
          title="Delete Customer Khata Account?"
          message={`Are you sure you want to delete the account for "${customerToDelete?.name}"? All transaction records for this customer will be removed.`}
          confirmText="Delete Account"
        />
      </div>
    );
  }

  // =========================================================================
  // MAIN PARTY SCREEN (Screenshot 1 adapted to Emerald Green)
  // =========================================================================
  return (
    <div className="space-y-3 pb-24">
      {/* Top Emerald Header + Overlapping Summary Card */}
      <div>
        <div className="bg-emerald-600 text-white rounded-2xl shadow-sm pt-3.5 pb-11 px-3.5 sm:px-5">
          {/* Header Top Row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              {onBackToHome && (
                <button
                  type="button"
                  onClick={onBackToHome}
                  className="lg:hidden w-8 h-8 -ml-1 rounded-full hover:bg-white/15 flex items-center justify-center transition cursor-pointer"
                  aria-label="Back to home"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <h2 className="text-lg sm:text-xl font-extrabold tracking-tight">Party</h2>
            </div>

            <button
              type="button"
              onClick={() => setCollectionMode(true)}
              className="px-3.5 py-1.5 rounded-full bg-slate-900/90 hover:bg-slate-900 text-white text-[11px] font-black tracking-wide uppercase shadow-xs transition cursor-pointer flex items-center gap-1.5"
            >
              <span>COLLECTION</span>
              {overdueCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              )}
            </button>
          </div>

          {/* Sub-Tabs: Customers | Suppliers | All */}
          <div className="mt-3.5 flex items-center gap-6 border-b border-white/15">
            {(
              [
                { id: 'customers', label: 'Customers' },
                { id: 'suppliers', label: 'Suppliers' },
                { id: 'all', label: 'All' },
              ] as { id: PartySubTab; label: string }[]
            ).map(tab => {
              const active = partyTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setPartyTab(tab.id);
                    setFilterType('all');
                  }}
                  className={`pb-2.5 text-[13px] font-bold transition relative cursor-pointer ${
                    active ? 'text-white' : 'text-emerald-100/80 hover:text-white'
                  }`}
                >
                  {tab.label}
                  {active && (
                    <span className="absolute left-0 right-0 bottom-0 h-[3px] rounded-full bg-lime-300" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Overlapping White Balance Summary Card */}
        <div className="-mt-8 mx-2 sm:mx-4 bg-white rounded-2xl border border-slate-200/90 shadow-sm px-3.5 py-3">
          <div className="flex items-center justify-between mb-1.5">
            <button
              type="button"
              onClick={() => setHideBalance(prev => !prev)}
              className="text-[11px] font-medium text-slate-500 hover:text-slate-700 flex items-center gap-1 cursor-pointer"
            >
              {hideBalance ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span>{hideBalance ? 'Show Balance' : 'Hide Balance'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowAllTransactionsModal(true)}
              className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer flex items-center gap-0.5"
            >
              <span>All Entries</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowAllTransactionsModal(true)}
            className="w-full flex items-center justify-between gap-2 text-left cursor-pointer group"
          >
            <div className="flex-1 text-center py-0.5">
              <p className="text-base sm:text-xl font-extrabold text-emerald-600 tabular-nums leading-tight">
                {hideBalance ? `${currency} •••••` : `${currency} ${summaryTotals.youWillGive.toLocaleString()}`}
              </p>
              <p className="text-[11px] font-medium text-slate-500 mt-0.5">You will give</p>
            </div>

            <div className="w-px h-9 bg-slate-100 shrink-0" />

            <div className="flex-1 text-center py-0.5">
              <p className="text-base sm:text-xl font-extrabold text-rose-600 tabular-nums leading-tight">
                {hideBalance ? `${currency} •••••` : `${currency} ${summaryTotals.youWillGet.toLocaleString()}`}
              </p>
              <p className="text-[11px] font-medium text-slate-500 mt-0.5">You will get</p>
            </div>

            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition shrink-0" />
          </button>
        </div>
      </div>

      {/* Search + Filter + PDF Toolbar */}
      <div className="flex items-center gap-2 px-0.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={tabCountLabel}
            className="w-full pl-9 pr-8 h-10 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-600 shadow-2xs transition"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowFilterMenu(prev => !prev)}
          className={`h-10 w-10 rounded-xl border flex items-center justify-center transition cursor-pointer shrink-0 ${
            showFilterMenu || filterType !== 'all' || sortType !== 'latest'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
              : 'bg-white border-slate-200 text-emerald-600 hover:bg-slate-50'
          }`}
          title="Filter & Sort Parties"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>

        {onOpenPdfReport && (
          <button
            type="button"
            onClick={onOpenPdfReport}
            className="h-10 px-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-emerald-600 flex flex-col items-center justify-center transition cursor-pointer shrink-0"
            title="Export Khata PDF Report"
          >
            <FileText className="w-3.5 h-3.5 leading-none" />
            <span className="text-[9px] font-black leading-none mt-0.5">PDF</span>
          </button>
        )}
      </div>

      {/* Expandable Filter & Sort Strip */}
      {showFilterMenu && (
        <div className="bg-white border border-slate-200 rounded-2xl p-3 space-y-2.5 shadow-2xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">
              Filter:
            </span>
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'get', label: "You'll Get" },
                { id: 'give', label: "You'll Give" },
                { id: 'overdue', label: `Overdue (${overdueCount})` },
                { id: 'settled', label: 'Rs 0 Settled' },
              ] as { id: PartyFilterType; label: string }[]
            ).map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFilterType(opt.id)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition cursor-pointer ${
                  filterType === opt.id
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">
              Sort:
            </span>
            {(
              [
                { id: 'latest', label: 'Latest Activity' },
                { id: 'highest', label: 'Highest Balance' },
                { id: 'name', label: 'Name A–Z' },
              ] as { id: PartySortType; label: string }[]
            ).map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSortType(opt.id)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition cursor-pointer ${
                  sortType === opt.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Clean Party List Rows */}
      <div className="bg-white border border-slate-200/90 rounded-2xl divide-y divide-slate-100 overflow-hidden shadow-2xs">
        {filteredRows.length === 0 ? (
          <div className="py-12 px-4 text-center space-y-2">
            <BookOpen className="w-9 h-9 mx-auto text-slate-300" />
            <p className="text-sm font-bold text-slate-700">
              {partyTab === 'suppliers' ? 'No supplier bills found' : 'No party accounts found'}
            </p>
            <p className="text-xs text-slate-400">
              {partyTab === 'suppliers'
                ? 'Supplier balances from Stock Inward will appear here automatically'
                : 'Tap ADD CUSTOMER below to create a new ledger'}
            </p>
          </div>
        ) : (
          filteredRows.map(row => {
            if (row.kind === 'supplier') {
              const sup = row.supplier;
              const timeStr = formatLedgerTimestamp(sup.lastDate, true);
              return (
                <div
                  key={row.id}
                  onClick={() => {
                    if (onGoToPurchases) {
                      onGoToPurchases();
                    } else {
                      showToast(`Manage "${sup.name}" bills in Stock Inward`, 'info');
                    }
                  }}
                  className="px-3.5 py-3 flex items-center justify-between gap-3 hover:bg-emerald-50/30 active:bg-slate-50 transition cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-xs flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-[13px] sm:text-sm font-semibold text-slate-900 truncate group-hover:text-emerald-700 transition">
                          {sup.name}
                        </p>
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0">
                          Supplier · {sup.billCount}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate flex items-center gap-1">
                        <Clock className="w-3 h-3 shrink-0 hidden sm:inline" />
                        <span>{timeStr || 'Stock Inward'}</span>
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p
                      className={`text-[13px] sm:text-sm font-extrabold tabular-nums ${
                        sup.balanceDue > 0 ? 'text-emerald-600' : 'text-slate-700'
                      }`}
                    >
                      {hideBalance ? `${currency} ••••` : `${currency} ${sup.balanceDue.toLocaleString()}`}
                    </p>
                    {sup.balanceDue > 0 && (
                      <p className="text-[10px] font-medium text-slate-400">You&apos;ll Give</p>
                    )}
                  </div>
                </div>
              );
            }

            // Customer Row
            const cust = row.customer;
            const overdue = isDueOverdue(cust);
            const overLimit =
              Boolean(cust.creditLimit && cust.creditLimit > 0 && cust.balance > cust.creditLimit);
            const absBal = Math.abs(cust.balance || 0);
            const timeStr = formatLedgerTimestamp(cust.lastUpdated, true);
            const trackUrl = buildGoogleMapsTrackUrl({
              lat: cust.lat,
              lng: cust.lng,
              placeId: cust.placeId,
              address: cust.address,
            });

            return (
              <div
                key={cust.id}
                onClick={() => {
                  setInitialEntryTxId(null);
                  setActiveAccountCustomer(cust);
                }}
                className="px-3.5 py-3 flex items-center justify-between gap-3 hover:bg-emerald-50/30 active:bg-slate-50 transition cursor-pointer group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200/80 overflow-hidden flex items-center justify-center text-emerald-700 font-bold text-xs">
                      {cust.image ? (
                        <img src={cust.image} alt={cust.name} className="w-full h-full object-cover" />
                      ) : (
                        getInitials(cust.name)
                      )}
                    </div>
                    {(overdue || overLimit) && (
                      <span
                        className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-white flex items-center justify-center"
                        title={overdue ? 'Payment Overdue' : 'Credit Limit Exceeded'}
                      />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[13px] sm:text-sm font-semibold text-slate-900 truncate group-hover:text-emerald-700 transition">
                        {cust.name}
                      </p>
                      {partyTab === 'all' && (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 shrink-0 hidden sm:inline">
                          Customer
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 truncate flex items-center gap-1.5">
                      <span>{timeStr}</span>
                      {cust.address && (
                        <span className="hidden md:inline-flex items-center gap-0.5 text-slate-400 truncate max-w-[200px]">
                          · <MapPin className="w-2.5 h-2.5 text-emerald-600 shrink-0" /> {cust.address}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Subtle desktop quick links on hover */}
                  <div
                    className="hidden lg:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition mr-1"
                    onClick={e => e.stopPropagation()}
                  >
                    {trackUrl && (
                      <a
                        href={trackUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition"
                        title="Track Customer Location"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {cust.balance > 0 && (
                      <a
                        href={getWhatsAppReminderUrl(cust)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition"
                        title="Send WhatsApp Reminder"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setCustomerToDelete(cust)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                        title="Delete Account"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="text-right">
                    <p
                      className={`text-[13px] sm:text-sm font-extrabold tabular-nums ${
                        cust.balance > 0
                          ? 'text-rose-600'
                          : cust.balance < 0
                          ? 'text-emerald-600'
                          : 'text-slate-700'
                      }`}
                    >
                      {hideBalance ? `${currency} ••••` : `${currency} ${absBal.toLocaleString()}`}
                    </p>
                    {cust.balance !== 0 && (
                      <p className="text-[10px] font-medium text-slate-400">
                        {cust.balance > 0 ? "You'll Get" : "You'll Give"}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Floating Bottom Emerald Pill CTA (ADD CUSTOMER / ADD STOCK BILL) */}
      {partyTab === 'suppliers' && onGoToPurchases ? (
        <button
          type="button"
          onClick={onGoToPurchases}
          className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] right-4 z-30 h-11 px-4 rounded-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs tracking-wide uppercase shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition cursor-pointer"
        >
          <Building2 className="w-4 h-4" />
          <span>STOCK INWARD</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={onOpenAddModal}
          className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] right-4 z-30 h-11 px-4 rounded-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs tracking-wide uppercase shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>ADD CUSTOMER</span>
        </button>
      )}

      {/* Fullscreen Customer Ledger Modal */}
      {currentActiveCustomer && (
        <CustomerAccountModal
          customer={currentActiveCustomer}
          isOpen={true}
          onClose={() => {
            setActiveAccountCustomer(null);
            setInitialEntryTxId(null);
            if (onClearSelectedCustomer) onClearSelectedCustomer();
          }}
          settings={settings}
          sales={sales}
          salesReturns={salesReturns}
          isAdmin={isAdmin}
          onAddTransaction={onAddTransaction}
          onEditTransaction={onEditTransaction}
          onUpdateCustomer={onUpdateCustomer}
          onDeleteTransaction={onDeleteTransaction}
          initialTxId={initialEntryTxId}
          onClearInitialTxId={() => setInitialEntryTxId(null)}
        />
      )}

      {/* Fullscreen All Transactions Daybook Modal */}
      <AllTransactionsModal
        isOpen={showAllTransactionsModal}
        onClose={() => setShowAllTransactionsModal(false)}
        khata={khata}
        settings={settings}
        sales={sales}
        onSelectEntry={(customerId, txId) => {
          const cust = khata.find(k => k.id === customerId);
          if (cust) {
            setShowAllTransactionsModal(false);
            setInitialEntryTxId(txId);
            setActiveAccountCustomer(cust);
          }
        }}
      />

      {/* Safe In-App Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!customerToDelete}
        onClose={() => setCustomerToDelete(null)}
        onConfirm={() => {
          if (customerToDelete) {
            onDeleteCustomer(customerToDelete.id);
            showToast(`Khata account for "${customerToDelete.name}" deleted`, 'info');
            setCustomerToDelete(null);
          }
        }}
        title="Delete Customer Khata Account?"
        message={`Are you sure you want to delete the account for "${customerToDelete?.name}"? All transaction records for this customer will be removed.`}
        confirmText="Delete Account"
      />
    </div>
  );
};

export const KhataTab = React.memo(KhataTabComponent);
