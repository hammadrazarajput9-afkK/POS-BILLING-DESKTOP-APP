import React, { useState, useMemo } from 'react';
import { KhataCustomer, ShopSettings } from '../types';
import {
  Search,
  UserPlus,
  BookOpen,
  DollarSign,
  CreditCard,
  MessageSquare,
  Trash2,
  Phone,
  Clock,
  CheckCircle2,
  X,
  User,
  ExternalLink,
  MapPin,
  FileText
} from 'lucide-react';
import { useToast } from './Toast';
import { CustomerAccountModal } from './CustomerAccountModal';
import { ConfirmModal } from './ConfirmModal';

interface KhataTabProps {
  khata: KhataCustomer[];
  settings: ShopSettings;
  isAdmin?: boolean;
  onOpenAddModal: () => void;
  onOpenSettleModal: (customer: KhataCustomer) => void;
  onDeleteCustomer: (id: string) => void;
  onAddTransaction: (customerId: string, type: 'credit' | 'payment', amount: number, note?: string) => void;
  selectedCustomerId?: string | null;
  onClearSelectedCustomer?: () => void;
  onOpenPdfReport?: () => void;
}

export const KhataTab: React.FC<KhataTabProps> = ({
  khata,
  settings,
  isAdmin = true,
  onOpenAddModal,
  onOpenSettleModal,
  onDeleteCustomer,
  onAddTransaction,
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

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return khata.filter(k => {
      return (
        !q ||
        k.name.toLowerCase().includes(q) ||
        k.phone.toLowerCase().includes(q) ||
        (k.phone2 && k.phone2.toLowerCase().includes(q)) ||
        (k.address && k.address.toLowerCase().includes(q))
      );
    });
  }, [khata, search]);

  const totalOutstanding = useMemo(() => {
    return khata.reduce((acc, k) => acc + k.balance, 0);
  }, [khata]);

  const debtorCount = useMemo(() => {
    return khata.filter(k => k.balance > 0).length;
  }, [khata]);

  const handleSendWhatsAppReminder = (customer: KhataCustomer) => {
    const phone = customer.phone.replace(/[^0-9]/g, '');
    const cleanPhone = phone.startsWith('0') ? '92' + phone.substring(1) : phone;
    const message = encodeURIComponent(
      `Assalam-o-Alaikum ${customer.name},\n\nThis is a polite reminder from *${settings.shopName}* regarding your pending Khata/Udhar balance of *${settings.currency} ${customer.balance.toLocaleString()}*.\n\nPlease arrange payment at your earliest convenience. Thank you!\nPh: ${settings.phone}`
    );
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
    showToast(`WhatsApp reminder opened for ${customer.name}`, 'info');
  };

  return (
    <div className="space-y-6">
      {/* Khata Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4.5 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Total Outstanding Credit
          </span>
          <h3 className="text-2xl font-extrabold text-purple-700 font-mono tabular-nums mt-1">
            {settings.currency} {totalOutstanding.toLocaleString()}
          </h3>
          <p className="text-xs text-slate-400 mt-1">Pending receivables from customers</p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-4.5 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Accounts with Pending Balance
          </span>
          <h3 className="text-2xl font-extrabold text-slate-900 font-mono tabular-nums mt-1">
            {debtorCount} Customers
          </h3>
          <p className="text-xs text-slate-400 mt-1">Active credit ledger accounts</p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-4.5 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Total Customer Ledger Accounts
          </span>
          <h3 className="text-2xl font-extrabold text-slate-900 font-mono tabular-nums mt-1">
            {khata.length} Accounts
          </h3>
          <p className="text-xs text-slate-400 mt-1">Credit clients & regular buyers</p>
        </div>
      </div>

      {/* Main Khata Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-bold text-slate-900 text-base">Customer Credit & Ledger Accounts</h3>
            <p className="text-xs text-slate-500">
              Track outstanding balances, view customer accounts, and record ledger payments
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onOpenPdfReport && (
              <button
                type="button"
                onClick={onOpenPdfReport}
                className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200/80 transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="Export Customer Khata & Receivables PDF Report"
              >
                <FileText className="w-3.5 h-3.5 text-rose-600" /> Export PDF Report
              </button>
            )}
            <button
              onClick={onOpenAddModal}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-md shadow-purple-500/20 transition flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" /> Add Customer Account
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
            placeholder="Search by customer name, phone number, or address..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-purple-600 focus:bg-white transition"
          />
        </div>

        {/* Ledger Table */}
        <div className="border border-slate-200/80 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="p-3">Customer Profile</th>
                  <th className="p-3">Contact Details</th>
                  <th className="p-3 text-right">Outstanding Due Balance</th>
                  <th className="p-3 text-center">Last Activity</th>
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
                  filtered.map(cust => (
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
                            <p className="font-bold text-slate-900 leading-snug group-hover:text-purple-700 transition">
                              {cust.name}
                            </p>
                            {cust.address && (
                              <p className="text-[11px] text-slate-400 flex items-center gap-1 truncate max-w-[200px]">
                                <MapPin className="w-2.5 h-2.5 text-slate-400" /> {cust.address}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-3 font-mono text-slate-600">
                        <div className="space-y-0.5">
                          <p className="text-xs font-semibold text-slate-800">{cust.phone}</p>
                          {cust.phone2 && (
                            <p className="text-[10px] text-slate-400">Alt: {cust.phone2}</p>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <span
                          className={`font-mono tabular-nums font-extrabold text-sm ${
                            cust.balance > 0 ? 'text-purple-700' : 'text-emerald-600'
                          }`}
                        >
                          {settings.currency} {cust.balance.toLocaleString()}
                        </span>
                      </td>
                      <td className="p-3 text-center text-slate-400 text-[11px]">
                        {new Date(cust.lastUpdated).toLocaleDateString()}
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
                          {cust.balance > 0 && (
                            <button
                              type="button"
                              onClick={() => handleSendWhatsAppReminder(cust)}
                              className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition cursor-pointer"
                              title="Send WhatsApp Reminder"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Full Dedicated Customer Account Modal */}
      {currentActiveCustomer && (
        <CustomerAccountModal
          customer={currentActiveCustomer}
          isOpen={true}
          onClose={() => {
            setActiveAccountCustomer(null);
            if (onClearSelectedCustomer) onClearSelectedCustomer();
          }}
          settings={settings}
          onAddTransaction={onAddTransaction}
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
