import React, { useState, useMemo } from 'react';
import { KhataCustomer, SaleRecord, SalesReturnRecord, ShopSettings } from '../types';
import {
  Search,
  UserPlus,
  BookOpen,
  MessageSquare,
  Trash2,
  Phone,
  User,
  ExternalLink,
  MapPin,
  FileText,
  Navigation,
  AlertTriangle,
  Calendar,
} from 'lucide-react';
import { useToast } from './Toast';
import { CustomerAccountModal, CustomerAccountUpdatePayload } from './CustomerAccountModal';
import { ConfirmModal } from './ConfirmModal';
import { buildGoogleMapsTrackUrl } from '../utils/mapsConfig';
import { smartFilterAndSort } from '../utils/smartSearch';

interface KhataTabProps {
  khata: KhataCustomer[];
  settings: ShopSettings;
  sales?: SaleRecord[];
  salesReturns?: SalesReturnRecord[];
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
    receiptImage?: string
  ) => void;
  onUpdateCustomer?: (updated: CustomerAccountUpdatePayload) => void;
  onDeleteTransaction?: (customerId: string, txId: string) => void;
  selectedCustomerId?: string | null;
  onClearSelectedCustomer?: () => void;
  onOpenPdfReport?: () => void;
}

const KhataTabComponent: React.FC<KhataTabProps> = ({
  khata,
  settings,
  sales = [],
  salesReturns = [],
  isAdmin = true,
  onOpenAddModal,
  onDeleteCustomer,
  onAddTransaction,
  onUpdateCustomer,
  onDeleteTransaction,
  selectedCustomerId,
  onClearSelectedCustomer,
  onOpenPdfReport,
}) => {
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [activeAccountCustomer, setActiveAccountCustomer] = useState<KhataCustomer | null>(null);
  const [customerToDelete, setCustomerToDelete] = useState<KhataCustomer | null>(null);

  // If selectedCustomerId is passed from props (e.g. right after adding customer), open that account
  React.useEffect(() => {
    if (selectedCustomerId) {
      const match = khata.find(k => k.id === selectedCustomerId);
      if (match) {
        setActiveAccountCustomer(match);
      }
    }
  }, [selectedCustomerId, khata]);

  // Keep activeAccountCustomer synced with updated khata data
  const currentActiveCustomer = useMemo(() => {
    if (!activeAccountCustomer) return null;
    return khata.find(k => k.id === activeAccountCustomer.id) || null;
  }, [activeAccountCustomer, khata]);

  const sortedByHighestUdhar = useMemo(() => {
    return [...khata].sort((a, b) => {
      const balDiff = (b.balance || 0) - (a.balance || 0);
      if (balDiff !== 0) return balDiff;
      return new Date(b.lastUpdated || 0).getTime() - new Date(a.lastUpdated || 0).getTime();
    });
  }, [khata]);

  const filtered = useMemo(() => {
    return smartFilterAndSort(sortedByHighestUdhar, search, k => ({
      primary: [k.name, k.phone, k.shopName],
      secondary: [k.phone2, k.address, k.cnic, k.city, k.ntnNumber],
    }));
  }, [sortedByHighestUdhar, search]);

  const totalOutstanding = useMemo(() => {
    return khata.reduce((acc, k) => acc + k.balance, 0);
  }, [khata]);

  const debtorCount = useMemo(() => {
    return khata.filter(k => k.balance > 0).length;
  }, [khata]);

  const getWhatsAppReminderUrl = (customer: KhataCustomer) => {
    const phone = customer.phone.replace(/[^0-9]/g, '');
    const cleanPhone = phone.startsWith('0') ? '92' + phone.substring(1) : phone;
    const message = encodeURIComponent(
      `Assalam-o-Alaikum ${customer.name},\n\nThis is a polite reminder from *${settings.shopName}* regarding your pending Khata/Udhar balance of *${settings.currency} ${customer.balance.toLocaleString()}*.\n\nPlease arrange payment at your earliest convenience. Thank you!\nPh: ${settings.phone}`
    );
    return `https://wa.me/${cleanPhone}?text=${message}`;
  };

  const isDueOverdue = (cust: KhataCustomer) => {
    if (!cust.dueDate || cust.balance <= 0) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(cust.dueDate);
    due.setHours(0, 0, 0, 0);
    return due.getTime() < today.getTime();
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Khata Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-4">
        <div className="col-span-2 sm:col-span-1 bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-2.5 sm:p-4.5 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 line-clamp-1">
            Total Outstanding Credit
          </span>
          <h3 className="text-sm sm:text-2xl font-extrabold text-purple-700 tabular-nums mt-0.5 sm:mt-1 truncate">
            {settings.currency} {totalOutstanding.toLocaleString()}
          </h3>
          <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 sm:mt-1 truncate">Pending receivables from customers</p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-2.5 sm:p-4.5 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 line-clamp-1">
            Pending Balance
          </span>
          <h3 className="text-sm sm:text-2xl font-extrabold text-slate-900 tabular-nums mt-0.5 sm:mt-1 truncate">
            {debtorCount} Customers
          </h3>
          <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 sm:mt-1 truncate">Active credit accounts</p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-2.5 sm:p-4.5 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 line-clamp-1">
            Total Ledger Accounts
          </span>
          <h3 className="text-sm sm:text-2xl font-extrabold text-slate-900 tabular-nums mt-0.5 sm:mt-1 truncate">
            {khata.length} Accounts
          </h3>
          <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 sm:mt-1 truncate">Credit clients & buyers</p>
        </div>
      </div>

      {/* Main Khata Table */}
      <div className="bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-2.5 sm:p-5 space-y-2.5 sm:space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 border-b border-slate-100 pb-2.5 sm:pb-4">
          <div>
            <h3 className="font-bold text-slate-900 text-sm sm:text-base">Customer Credit &amp; Ledger Accounts</h3>
            <p className="text-[11px] sm:text-xs text-slate-500">
              Tap any customer to open full-screen ledger, track location &amp; record entries
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {onOpenPdfReport && (
              <button
                type="button"
                onClick={onOpenPdfReport}
                className="h-8 sm:h-9 px-2.5 sm:px-3.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px] sm:text-xs rounded-lg sm:rounded-xl border border-rose-200/80 transition flex items-center gap-1 cursor-pointer shadow-2xs"
                title="Export Customer Khata & Receivables PDF Report"
              >
                <FileText className="w-3.5 h-3.5 text-rose-600" />
                <span className="sm:hidden">PDF</span>
                <span className="hidden sm:inline">Export PDF Report</span>
              </button>
            )}
            <button
              onClick={onOpenAddModal}
              className="h-8 sm:h-9 px-3 sm:px-4 bg-purple-600 hover:bg-purple-700 text-white font-bold text-[11px] sm:text-xs rounded-lg sm:rounded-xl shadow-sm shadow-purple-500/20 transition flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span className="sm:hidden">Add Customer</span>
              <span className="hidden sm:inline">Add Customer Account</span>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by customer name, phone, CNIC, shop name, or address..."
            className="compact-mobile-input w-full pl-8.5 pr-4 h-8 sm:h-9 bg-slate-50 border border-slate-200 rounded-lg sm:rounded-xl text-xs font-medium focus:outline-none focus:border-purple-600 focus:bg-white transition"
          />
        </div>

        {/* Desktop Ledger Table (>= lg: breakpoint) */}
        <div className="hidden lg:block border border-slate-200/80 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="p-3">Customer Profile</th>
                  <th className="p-3">Contact Details</th>
                  <th className="p-3 text-right">Outstanding Due Balance</th>
                  <th className="p-3 text-center">Due / Activity</th>
                  <th className="p-3 text-center">Customer Account</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-slate-400">
                      <BookOpen className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      <p className="font-semibold text-slate-700">No khata accounts found</p>
                      <p className="text-[11px] text-slate-400">Add customers to maintain an udhar register</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map(cust => {
                    const trackUrl = buildGoogleMapsTrackUrl({
                      lat: cust.lat,
                      lng: cust.lng,
                      placeId: cust.placeId,
                      address: cust.address,
                    });
                    const hasGps = typeof cust.lat === 'number' && typeof cust.lng === 'number';
                    const overdue = isDueOverdue(cust);
                    const overLimit = cust.creditLimit && cust.creditLimit > 0 && cust.balance > cust.creditLimit;

                    return (
                      <tr
                        key={cust.id}
                        className="hover:bg-purple-50/30 transition group cursor-pointer"
                        onClick={() => setActiveAccountCustomer(cust)}
                      >
                        <td className="p-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-purple-100/70 border border-purple-200 overflow-hidden flex items-center justify-center shrink-0">
                              {cust.image ? (
                                <img src={cust.image} alt={cust.name} className="w-full h-full object-cover" />
                              ) : (
                                <User className="w-5 h-5 text-purple-600" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <p className="font-bold text-slate-900 leading-snug group-hover:text-purple-700 transition">
                                  {cust.name}
                                </p>
                                {overLimit && (
                                  <span className="text-[10px] font-bold text-rose-600 flex items-center gap-0.5" title="Over Credit Limit">
                                    <AlertTriangle className="w-3 h-3" /> Limit
                                  </span>
                                )}
                              </div>
                              {cust.address && (
                                <p className="text-[11px] text-slate-400 flex items-center gap-1 truncate max-w-[230px]">
                                  <MapPin className={`w-2.5 h-2.5 shrink-0 ${hasGps ? 'text-emerald-600' : 'text-slate-400'}`} />
                                  {cust.address}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-3 tabular-nums text-slate-600">
                          <div className="space-y-0.5">
                            <p className="text-xs font-semibold text-slate-800">{cust.phone}</p>
                            {cust.phone2 && (
                              <p className="text-[10px] text-slate-400">Alt: {cust.phone2}</p>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          <span
                            className={`tabular-nums font-extrabold text-sm ${
                              cust.balance > 0 ? 'text-purple-700' : 'text-emerald-600'
                            }`}
                          >
                            {settings.currency} {cust.balance.toLocaleString()}
                          </span>
                        </td>
                        <td className="p-3 text-center text-[11px]">
                          {overdue ? (
                            <span className="font-bold text-rose-600 flex items-center justify-center gap-1">
                              <Calendar className="w-3 h-3" /> Overdue ({new Date(cust.dueDate!).toLocaleDateString()})
                            </span>
                          ) : cust.dueDate && cust.balance > 0 ? (
                            <span className="font-semibold text-amber-700">
                              Due {new Date(cust.dueDate).toLocaleDateString()}
                            </span>
                          ) : (
                            <span className="text-slate-400">{new Date(cust.lastUpdated).toLocaleDateString()}</span>
                          )}
                        </td>
                        <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setActiveAccountCustomer(cust)}
                              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs transition cursor-pointer flex items-center gap-1 shadow-2xs"
                            >
                              <ExternalLink className="w-3 h-3" /> Open Account
                            </button>
                            {trackUrl && (
                              <a
                                href={trackUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition"
                                title="Track Customer Location in Google Maps"
                              >
                                <Navigation className="w-3.5 h-3.5" />
                              </a>
                            )}
                            {cust.balance > 0 && (
                              <a
                                href={getWhatsAppReminderUrl(cust)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition"
                                title="Send WhatsApp Reminder"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                              </a>
                            )}
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => setCustomerToDelete(cust)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                                title="Delete Account"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile Customer Cards View (< lg: breakpoint) */}
        <div className="block lg:hidden space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-400 space-y-1">
              <BookOpen className="w-7 h-7 mx-auto text-slate-300" />
              <p className="font-semibold text-slate-700">No khata accounts found</p>
              <p className="text-[11px] text-slate-400">Add customers to maintain customer credit ledgers</p>
            </div>
          ) : (
            filtered.map(cust => {
              const trackUrl = buildGoogleMapsTrackUrl({
                lat: cust.lat,
                lng: cust.lng,
                placeId: cust.placeId,
                address: cust.address,
              });
              const hasGps = typeof cust.lat === 'number' && typeof cust.lng === 'number';
              return (
                <div
                  key={cust.id}
                  onClick={() => setActiveAccountCustomer(cust)}
                  className="bg-white border border-slate-200 rounded-xl p-2.5 space-y-2 shadow-2xs transition hover:border-purple-300 cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-purple-100 text-purple-700 font-bold flex items-center justify-center shrink-0 border border-purple-200 overflow-hidden">
                        {cust.image ? (
                          <img src={cust.image} alt={cust.name} className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-4.5 h-4.5 text-purple-600" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-900 text-xs leading-snug truncate">
                          {cust.name}
                        </h4>
                        <p className="text-[11px] text-slate-500 tabular-nums flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{cust.phone}</span>
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`text-[11px] font-black tabular-nums ${
                          cust.balance > 0 ? 'text-rose-700' : 'text-emerald-700'
                        }`}
                      >
                        {cust.balance > 0 ? `${settings.currency} ${cust.balance.toLocaleString()} DUE` : 'Settled (0)'}
                      </span>
                    </div>
                  </div>

                  {cust.address && (
                    <p className="text-[10px] text-slate-500 flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 truncate">
                      <MapPin className={`w-3 h-3 shrink-0 ${hasGps ? 'text-emerald-600' : 'text-slate-400'}`} />
                      <span className="truncate">{cust.address}</span>
                    </p>
                  )}

                  {/* Mobile Compact Action Bar */}
                  <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 text-[11px]" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <a
                        href={`tel:${cust.phone.replace(/[^0-9+]/g, '')}`}
                        className="h-7 w-7 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold flex items-center justify-center transition"
                        title="Direct Call"
                      >
                        <Phone className="w-3.5 h-3.5 text-slate-600" />
                      </a>

                      {trackUrl && (
                        <a
                          href={trackUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="h-7 w-7 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-bold flex items-center justify-center transition border border-blue-200"
                          title="Track Location in Google Maps"
                        >
                          <Navigation className="w-3.5 h-3.5 text-blue-600" />
                        </a>
                      )}

                      <a
                        href={getWhatsAppReminderUrl(cust)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-7 w-7 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg font-bold flex items-center justify-center transition border border-emerald-200"
                        title="WhatsApp Reminder"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                      </a>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setActiveAccountCustomer(cust)}
                        className="h-7 px-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg text-[11px] transition flex items-center gap-1 cursor-pointer shadow-2xs"
                      >
                        <ExternalLink className="w-3 h-3" /> Open Ledger
                      </button>

                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => setCustomerToDelete(cust)}
                          className="h-7 w-7 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition border border-slate-200 flex items-center justify-center cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Full Enlarged Customer Account Modal */}
      {currentActiveCustomer && (
        <CustomerAccountModal
          customer={currentActiveCustomer}
          isOpen={true}
          onClose={() => {
            setActiveAccountCustomer(null);
            if (onClearSelectedCustomer) onClearSelectedCustomer();
          }}
          settings={settings}
          sales={sales}
          salesReturns={salesReturns}
          isAdmin={isAdmin}
          onAddTransaction={onAddTransaction}
          onUpdateCustomer={onUpdateCustomer}
          onDeleteTransaction={onDeleteTransaction}
        />
      )}

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
