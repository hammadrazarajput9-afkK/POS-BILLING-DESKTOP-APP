import React, { useState, useMemo } from 'react';
import { KhataCustomer, ShopSettings } from '../types';
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
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  FileText,
  Plus
} from 'lucide-react';
import { useToast } from './Toast';

interface CustomerAccountModalProps {
  customer: KhataCustomer | null;
  isOpen: boolean;
  onClose: () => void;
  settings: ShopSettings;
  onAddTransaction: (customerId: string, type: 'credit' | 'payment', amount: number, note?: string) => void;
}

export const CustomerAccountModal: React.FC<CustomerAccountModalProps> = ({
  customer,
  isOpen,
  onClose,
  settings,
  onAddTransaction,
}) => {
  const { showToast } = useToast();
  const [showTransactor, setShowTransactor] = useState<'payment' | 'credit' | null>(null);
  const [amount, setAmount] = useState<number | ''>('');
  const [note, setNote] = useState('');

  if (!isOpen || !customer) return null;

  const currency = settings.currency;

  const totalCreditGiven = useMemo(() => {
    return customer.history
      .filter(t => t.type === 'credit')
      .reduce((acc, t) => acc + t.amount, 0);
  }, [customer.history]);

  const totalPaymentReceived = useMemo(() => {
    return customer.history
      .filter(t => t.type === 'payment')
      .reduce((acc, t) => acc + t.amount, 0);
  }, [customer.history]);

  // Compute running balance for each transaction chronologically
  const runningLedger = useMemo(() => {
    let running = 0;
    // History sorted ascending for calculation
    const sorted = [...customer.history].sort(
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

    // Return reversed (newest first) for display
    return calculated.reverse();
  }, [customer.history]);

  const handleSendWhatsAppStatement = () => {
    const phone = customer.phone.replace(/[^0-9]/g, '');
    const cleanPhone = phone.startsWith('0') ? '92' + phone.substring(1) : phone;

    const recentLines = customer.history
      .slice(-5)
      .map(
        t =>
          `- ${new Date(t.date).toLocaleDateString()}: ${t.type === 'credit' ? 'Credit (+)' : 'Payment (-)'} ${currency} ${t.amount.toLocaleString()} ${t.note ? `(${t.note})` : ''}`
      )
      .join('\n');

    const message = encodeURIComponent(
      `*Account Statement - ${settings.shopName}*\n\n` +
        `Customer: *${customer.name}*\n` +
        `Phone: ${customer.phone}\n` +
        `Current Outstanding Udhar: *${currency} ${customer.balance.toLocaleString()}*\n\n` +
        `*Recent Transactions:*\n${recentLines || 'No transactions yet'}\n\n` +
        `Thank you for doing business with us!\n` +
        `Contact: ${settings.phone} | ${settings.address}`
    );

    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
    showToast('WhatsApp statement prepared', 'info');
  };

  const handlePrintStatement = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Popup blocked. Please allow popups to print statement.', 'error');
      return;
    }

    const rows = customer.history
      .map(
        tx => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${new Date(tx.date).toLocaleDateString()}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; color: ${tx.type === 'credit' ? '#b91c1c' : '#15803d'};">
            ${tx.type === 'credit' ? 'Credit Added (+)' : 'Payment Received (-)'}
          </td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${tx.note || '-'}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; font-family: monospace;">
            ${currency} ${tx.amount.toLocaleString()}
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
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #1e293b; max-width: 600px; margin: 0 auto; }
            .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px; }
            .shop-title { font-size: 20px; font-weight: 900; margin: 0; }
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
            <p style="margin: 2px 0;"><strong>Customer:</strong> ${customer.name}</p>
            <p style="margin: 2px 0;"><strong>Phone:</strong> ${customer.phone} ${customer.phone2 ? ` / ${customer.phone2}` : ''}</p>
            ${customer.address ? `<p style="margin: 2px 0;"><strong>Address:</strong> ${customer.address}</p>` : ''}
            <p style="margin: 2px 0;"><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
          </div>

          <div class="balance-box">
            <div>
              <span style="font-size: 11px; color: #64748b; text-transform: uppercase;">Total Outstanding Due Balance</span>
              <div style="font-size: 20px; font-weight: 800; color: #7e22ce;">${currency} ${customer.balance.toLocaleString()}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Remarks</th>
                <th style="text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="4" style="text-align: center; padding: 16px;">No transactions recorded</td></tr>'}
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

  const handleSaveTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      showToast('Please enter a valid amount', 'warning');
      return;
    }

    onAddTransaction(customer.id, showTransactor!, amt, note.trim() || undefined);
    setAmount('');
    setNote('');
    setShowTransactor(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-100 animate-in zoom-in-95 max-h-[92vh] flex flex-col overflow-hidden">
        {/* Top Header Card with Customer Profile */}
        <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 p-5 text-white shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3.5">
              {/* Customer Avatar / Photo */}
              <div className="w-14 h-14 rounded-2xl border-2 border-white/20 overflow-hidden bg-white/10 flex items-center justify-center shrink-0 shadow-md">
                {customer.image ? (
                  <img
                    src={customer.image}
                    alt={customer.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-7 h-7 text-white/80" />
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-extrabold tracking-tight leading-snug">
                    {customer.name}
                  </h2>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white border border-white/10">
                    ID: {customer.id}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-purple-200 mt-1">
                  <span className="flex items-center gap-1">
                    <Phone className="w-3 h-3 text-purple-300" />
                    <strong>{customer.phone}</strong> (Primary)
                  </span>
                  {customer.phone2 && (
                    <span className="flex items-center gap-1 text-purple-300">
                      <Phone className="w-3 h-3" />
                      {customer.phone2} (Secondary)
                    </span>
                  )}
                  {customer.address && (
                    <span className="flex items-center gap-1 text-purple-200">
                      <MapPin className="w-3 h-3 text-purple-300" />
                      {customer.address}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="text-white/70 hover:text-white p-1.5 rounded-xl hover:bg-white/10 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Account Metrics Bar */}
          <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-white/10">
            <div className="bg-white/10 rounded-xl p-2.5 backdrop-blur-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-200">
                Pending Balance (Udhar)
              </span>
              <p
                className={`text-base font-extrabold font-mono tabular-nums ${
                  customer.balance > 0 ? 'text-amber-300' : 'text-emerald-300'
                }`}
              >
                {currency} {customer.balance.toLocaleString()}
              </p>
            </div>

            <div className="bg-white/10 rounded-xl p-2.5 backdrop-blur-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-200">
                Total Credit Given
              </span>
              <p className="text-base font-extrabold font-mono tabular-nums text-white">
                {currency} {totalCreditGiven.toLocaleString()}
              </p>
            </div>

            <div className="bg-white/10 rounded-xl p-2.5 backdrop-blur-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-200">
                Total Recovered / Paid
              </span>
              <p className="text-base font-extrabold font-mono tabular-nums text-emerald-300">
                {currency} {totalPaymentReceived.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* Action Button Strip */}
        <div className="p-3 bg-slate-50 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setShowTransactor('credit');
                setAmount('');
                setNote('');
              }}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Give New Udhar (+)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowTransactor('payment');
                setAmount('');
                setNote('');
              }}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Receive Payment (-)</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSendWhatsAppStatement}
              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/80 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
              <span>WhatsApp Ledger</span>
            </button>

            <button
              type="button"
              onClick={handlePrintStatement}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Statement</span>
            </button>
          </div>
        </div>

        {/* Inline Transaction Entry Drawer */}
        {showTransactor && (
          <div className="p-4 bg-slate-100 border-b border-slate-200 animate-in slide-in-from-top-2">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                {showTransactor === 'credit' ? (
                  <span className="text-rose-600 font-extrabold flex items-center gap-1">
                    <ArrowUpRight className="w-4 h-4" /> Add Udhar to Customer Account
                  </span>
                ) : (
                  <span className="text-emerald-600 font-extrabold flex items-center gap-1">
                    <ArrowDownLeft className="w-4 h-4" /> Record Payment Received from Customer
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => setShowTransactor(null)}
                className="text-slate-400 hover:text-slate-600 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleSaveTransaction} className="flex flex-col sm:flex-row gap-2">
              <input
                type="number"
                min="1"
                required
                value={amount}
                onChange={e => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Amount"
                className="w-full sm:w-48 bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold focus:outline-none focus:border-purple-600"
              />
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Remarks / Item details"
                className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-purple-600"
              />
              <button
                type="submit"
                className={`px-4 py-2 text-white font-bold text-xs rounded-xl shadow-xs transition shrink-0 cursor-pointer ${
                  showTransactor === 'credit'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {showTransactor === 'credit' ? 'Confirm Credit' : 'Confirm Payment'}
              </button>
            </form>
          </div>
        )}

        {/* Complete Chronological Ledger History Table */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-extrabold text-slate-900 text-xs tracking-tight flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-purple-600" />
              Complete Account Ledger History ({customer.history.length} Entries)
            </h4>
            <span className="text-[11px] text-slate-400">Chronological ledger with running balance</span>
          </div>

          <div className="border border-slate-200/90 rounded-xl overflow-hidden shadow-2xs">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="p-2.5">Date & Time</th>
                  <th className="p-2.5">Type</th>
                  <th className="p-2.5">Remarks / Details</th>
                  <th className="p-2.5 text-right">Debit / Credit</th>
                  <th className="p-2.5 text-right">Running Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runningLedger.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-slate-400">
                      No transaction history recorded yet. Use the buttons above to record an udhar or payment.
                    </td>
                  </tr>
                ) : (
                  runningLedger.map((tx, idx) => {
                    const d = new Date(tx.date);
                    return (
                      <tr key={tx.id || idx} className="hover:bg-slate-50/70 transition">
                        <td className="p-2.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                          {d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}{' '}
                          <span className="text-slate-400 text-[10px]">
                            {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </td>
                        <td className="p-2.5 whitespace-nowrap">
                          {tx.type === 'credit' ? (
                            <span className="inline-flex items-center gap-1 font-bold text-[10px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                              <ArrowUpRight className="w-3 h-3" /> Udhar Added
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-bold text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <ArrowDownLeft className="w-3 h-3" /> Payment Received
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-slate-700 font-medium">{tx.note || '--'}</td>
                        <td
                          className={`p-2.5 text-right font-mono tabular-nums font-extrabold ${
                            tx.type === 'credit' ? 'text-rose-600' : 'text-emerald-600'
                          }`}
                        >
                          {tx.type === 'credit' ? '+' : '-'} {currency} {tx.amount.toLocaleString()}
                        </td>
                        <td className="p-2.5 text-right font-mono tabular-nums font-bold text-slate-900">
                          {currency} {tx.runningBalance.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-slate-100 flex justify-end shrink-0 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
          >
            Close Account
          </button>
        </div>
      </div>
    </div>
  );
};
