import React, { useMemo, useState, useEffect } from 'react';
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Printer,
  Search,
  TrendingUp,
  X,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { KhataCustomer, ShopSettings } from '../types';
import { formatLedgerTimestamp } from '../utils/ledgerFormatters';
import { smartMatch } from '../utils/smartSearch';
import { useToast } from './Toast';

interface AllTransactionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  khata: KhataCustomer[];
  settings: ShopSettings;
  onSelectEntry: (customerId: string, txId: string) => void;
}

interface FlattenedLedgerEntry {
  txId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  date: string;
  timestampMs: number;
  type: 'credit' | 'payment' | 'debit';
  amount: number;
  note?: string;
  runningBalance: number;
  paymentMethod?: string;
}

export const AllTransactionsModal: React.FC<AllTransactionsModalProps> = ({
  isOpen,
  onClose,
  khata,
  settings,
  onSelectEntry,
}) => {
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'gave' | 'got'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showProfitSummary, setShowProfitSummary] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleHardwareBack = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    window.addEventListener('pos-hardware-back', handleHardwareBack);
    return () => window.removeEventListener('pos-hardware-back', handleHardwareBack);
  }, [isOpen, onClose]);

  const currency = settings.currency || 'Rs';

  // Compute running balance per customer first, then flatten & sort newest first
  const allEntries = useMemo<FlattenedLedgerEntry[]>(() => {
    const flat: FlattenedLedgerEntry[] = [];

    for (const cust of khata) {
      const sortedHist = [...(cust.history || [])].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      let running = 0;
      for (const tx of sortedHist) {
        if (tx.type === 'credit') {
          running += tx.amount;
        } else {
          running -= tx.amount;
        }
        flat.push({
          txId: tx.id,
          customerId: cust.id,
          customerName: cust.name,
          customerPhone: cust.phone,
          date: tx.date,
          timestampMs: new Date(tx.date).getTime() || 0,
          type: tx.type,
          amount: tx.amount,
          note: tx.note,
          runningBalance: running,
          paymentMethod: tx.paymentMethod,
        });
      }
    }

    return flat.sort((a, b) => b.timestampMs - a.timestampMs);
  }, [khata]);

  const filteredEntries = useMemo(() => {
    const q = search.trim();
    const startMs = startDate ? new Date(`${startDate}T00:00:00`).getTime() : null;
    const endMs = endDate ? new Date(`${endDate}T23:59:59.999`).getTime() : null;

    return allEntries.filter(entry => {
      if (typeFilter === 'gave' && entry.type !== 'credit') return false;
      if (typeFilter === 'got' && entry.type === 'credit') return false;
      if (startMs !== null && entry.timestampMs < startMs) return false;
      if (endMs !== null && entry.timestampMs > endMs) return false;
      if (!q) return true;
      return smartMatch(
        q,
        [entry.customerName, entry.customerPhone, entry.note, entry.amount],
        [entry.paymentMethod]
      );
    });
  }, [allEntries, search, typeFilter, startDate, endDate]);

  const totals = useMemo(() => {
    let totalGave = 0;
    let totalGot = 0;
    for (const e of filteredEntries) {
      if (e.type === 'credit') totalGave += e.amount;
      else totalGot += e.amount;
    }
    const netBalance = totalGave - totalGot;
    return {
      count: filteredEntries.length,
      totalGave,
      totalGot,
      netBalance,
    };
  }, [filteredEntries]);

  if (!isOpen) return null;

  const handleExportPdf = () => {
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      doc.setFillColor(5, 150, 105);
      doc.rect(0, 0, 210, 30, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(15);
      doc.setFont('helvetica', 'bold');
      doc.text(settings.shopName || 'Ledger Report', 14, 13);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text('All Party Ledger Transactions', 14, 20);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 196, 15, { align: 'right' });

      doc.setTextColor(15, 23, 42);
      doc.setFontSize(9);
      doc.text(
        `Entries: ${totals.count}   |   You Gave: ${currency} ${totals.totalGave.toLocaleString()}   |   You Got: ${currency} ${totals.totalGot.toLocaleString()}   |   Net: ${currency} ${Math.abs(totals.netBalance).toLocaleString()}`,
        14,
        38
      );

      autoTable(doc, {
        startY: 44,
        head: [['Date', 'Party', 'Details', 'You Gave', 'You Got', 'Bal.']],
        body:
          filteredEntries.length > 0
            ? filteredEntries.slice(0, 1000).map(e => [
                new Date(e.date).toLocaleDateString(),
                e.customerName,
                e.note || '-',
                e.type === 'credit' ? `${currency} ${e.amount.toLocaleString()}` : '-',
                e.type !== 'credit' ? `${currency} ${e.amount.toLocaleString()}` : '-',
                `${currency} ${e.runningBalance.toLocaleString()}`,
              ])
            : [['--', '--', 'No entries found', '--', '--', '--']],
        styles: { fontSize: 8, cellPadding: 2.2 },
        headStyles: { fillColor: [5, 150, 105], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right', fontStyle: 'bold' },
        },
      });

      doc.save(`All_Ledger_Transactions_${new Date().toISOString().slice(0, 10)}.pdf`);
      showToast('All Transactions PDF downloaded', 'success');
    } catch (err) {
      console.error('PDF export error:', err);
      showToast('Could not generate PDF report', 'error');
    }
  };

  const handlePrint = () => {
    const win = window.open('', '_blank');
    if (!win) {
      showToast('Popup blocked. Please allow popups to print.', 'warning');
      return;
    }

    const rowsHtml = filteredEntries
      .slice(0, 1000)
      .map(
        e => `
        <tr>
          <td style="padding:7px;border-bottom:1px solid #e2e8f0;font-size:11px;">${formatLedgerTimestamp(e.date)}</td>
          <td style="padding:7px;border-bottom:1px solid #e2e8f0;font-weight:700;">${e.customerName}</td>
          <td style="padding:7px;border-bottom:1px solid #e2e8f0;">${e.note || '-'}</td>
          <td style="padding:7px;border-bottom:1px solid #e2e8f0;text-align:right;color:#dc2626;font-weight:700;">
            ${e.type === 'credit' ? e.amount.toLocaleString() : ''}
          </td>
          <td style="padding:7px;border-bottom:1px solid #e2e8f0;text-align:right;color:#059669;font-weight:700;">
            ${e.type !== 'credit' ? e.amount.toLocaleString() : ''}
          </td>
          <td style="padding:7px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;">
            ${currency} ${e.runningBalance.toLocaleString()}
          </td>
        </tr>`
      )
      .join('');

    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>All Transactions - ${settings.shopName}</title>
          <style>
            body { font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; padding: 20px; color: #0f172a; font-variant-numeric: tabular-nums; }
            h1 { margin: 0; font-size: 18px; }
            .sub { color: #64748b; font-size: 11px; margin-bottom: 12px; }
            .bar { display: flex; gap: 16px; padding: 10px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 14px; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th { text-align: left; padding: 8px 7px; background: #ecfdf5; border-bottom: 2px solid #059669; font-size: 11px; text-transform: uppercase; }
          </style>
        </head>
        <body>
          <h1>${settings.shopName} — All Ledger Transactions</h1>
          <div class="sub">${settings.address} | Ph: ${settings.phone} | Generated: ${new Date().toLocaleString()}</div>
          <div class="bar">
            <div>Entries: <strong>${totals.count}</strong></div>
            <div>You Gave: <strong style="color:#dc2626">${currency} ${totals.totalGave.toLocaleString()}</strong></div>
            <div>You Got: <strong style="color:#059669">${currency} ${totals.totalGot.toLocaleString()}</strong></div>
            <div>Net Balance: <strong>${currency} ${Math.abs(totals.netBalance).toLocaleString()}</strong></div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Party</th>
                <th>Details</th>
                <th style="text-align:right;">You Gave</th>
                <th style="text-align:right;">You Got</th>
                <th style="text-align:right;">Balance</th>
              </tr>
            </thead>
            <tbody>${rowsHtml || '<tr><td colspan="6" style="padding:16px;text-align:center;">No entries found</td></tr>'}</tbody>
          </table>
          <script>window.onload = function(){ window.print(); }</script>
        </body>
      </html>
    `);
    win.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col overflow-hidden animate-in fade-in pb-[env(safe-area-inset-bottom,0px)]">
      {/* Green Header */}
      <div className="app-fullscreen-modal-header bg-emerald-600 text-white px-3 sm:px-5 pt-[calc(env(safe-area-inset-top,0px)+0.85rem)] sm:pt-3 pb-3 flex items-center justify-between gap-2 shrink-0 shadow-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center transition cursor-pointer shrink-0"
            aria-label="Back to Party List"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base sm:text-lg font-extrabold tracking-tight truncate">
            All Transactions
          </h2>
        </div>
        <span className="text-[11px] font-bold bg-white/15 px-2.5 py-1 rounded-full tabular-nums shrink-0">
          {totals.count} Entries
        </span>
      </div>

      {/* Top Filter & Summary Stack */}
      <div className="bg-slate-50 border-b border-slate-200 px-3 sm:px-5 py-2.5 space-y-2 shrink-0">
        {/* Profit & Loss / Recovery Summary Row */}
        <button
          type="button"
          onClick={() => setShowProfitSummary(v => !v)}
          className="w-full bg-white border border-slate-200/90 rounded-xl px-3.5 py-2.5 flex items-center justify-between shadow-2xs hover:border-emerald-300 transition cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <span className="text-xs sm:text-sm font-bold text-slate-800">
              Ledger Cashflow &amp; Recovery Summary
            </span>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform ${
              showProfitSummary ? 'rotate-180 text-emerald-600' : ''
            }`}
          />
        </button>

        {showProfitSummary && (
          <div className="bg-white border border-emerald-200 rounded-xl p-3 grid grid-cols-3 gap-2 text-center animate-in fade-in">
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Recovery Ratio</span>
              <span className="text-xs sm:text-sm font-extrabold text-emerald-700 tabular-nums">
                {totals.totalGave > 0
                  ? `${Math.min(100, Math.round((totals.totalGot / totals.totalGave) * 100))}%`
                  : '100%'}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Active Ledgers</span>
              <span className="text-xs sm:text-sm font-extrabold text-slate-800 tabular-nums">
                {khata.filter(k => k.balance !== 0).length} Parties
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Status</span>
              <span className="text-xs sm:text-sm font-extrabold text-emerald-600 inline-flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" />
                {totals.netBalance >= 0 ? 'Receivable' : 'Advance'}
              </span>
            </div>
          </div>
        )}

        {/* Search + Type Filter Row */}
        <div className="bg-white border border-slate-200/90 rounded-xl px-3 py-1.5 flex items-center gap-2 shadow-2xs">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search Entries, Customer, Amount..."
            className="compact-mobile-input flex-1 bg-transparent text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none min-w-0 py-1"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <div className="h-5 w-px bg-slate-200 shrink-0" />
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as 'all' | 'gave' | 'got')}
            className="compact-mobile-input bg-transparent text-xs font-extrabold text-slate-700 focus:outline-none cursor-pointer pr-1"
          >
            <option value="all">All</option>
            <option value="gave">You Gave</option>
            <option value="got">You Got</option>
          </select>
        </div>

        {/* Date Range Row */}
        <div className="bg-white border border-slate-200/90 rounded-xl px-3 py-1.5 grid grid-cols-2 divide-x divide-slate-200 shadow-2xs">
          <label className="flex items-center gap-2 pr-2 cursor-pointer min-w-0">
            <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="min-w-0 flex-1">
              <span className="block text-[9px] font-bold uppercase text-slate-400">Start Date</span>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="compact-mobile-input w-full bg-transparent text-[11px] font-bold text-slate-700 focus:outline-none"
              />
            </div>
          </label>
          <label className="flex items-center gap-2 pl-3 cursor-pointer min-w-0">
            <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="min-w-0 flex-1">
              <span className="block text-[9px] font-bold uppercase text-slate-400">End Date</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="compact-mobile-input w-full bg-transparent text-[11px] font-bold text-slate-700 focus:outline-none"
              />
            </div>
          </label>
        </div>

        {/* Net Balance + Totals Strip */}
        <div className="bg-white border border-slate-200/90 rounded-xl p-3 space-y-2 shadow-2xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-xs sm:text-sm font-bold text-slate-700">Net Balance</span>
            <span
              className={`text-sm sm:text-base font-extrabold tabular-nums ${
                totals.netBalance > 0 ? 'text-rose-600' : 'text-emerald-600'
              }`}
            >
              {currency} {Math.abs(totals.netBalance).toLocaleString()}
            </span>
          </div>

          <div className="grid grid-cols-12 gap-2 items-center text-xs">
            <div className="col-span-4 flex items-center gap-1.5">
              <span className="text-emerald-600 font-bold text-sm leading-none">↑</span>
              <div>
                <span className="block text-[10px] text-slate-400 font-semibold">Entries</span>
                <span className="font-extrabold text-slate-800 tabular-nums">{totals.count}</span>
              </div>
            </div>
            <div className="col-span-4 text-right">
              <span className="block text-[10px] text-slate-400 font-semibold">You Gave</span>
              <span className="font-extrabold text-rose-600 tabular-nums">
                {currency} {totals.totalGave.toLocaleString()}
              </span>
            </div>
            <div className="col-span-4 text-right">
              <span className="block text-[10px] text-slate-400 font-semibold">You Got</span>
              <span className="font-extrabold text-emerald-600 tabular-nums">
                {currency} {totals.totalGot.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Chronological Entries List */}
      <div className="flex-1 overflow-y-auto touch-pan-y bg-white divide-y divide-slate-100">
        {filteredEntries.length === 0 ? (
          <div className="py-14 text-center text-slate-400 text-xs space-y-1.5 px-4">
            <FileText className="w-8 h-8 mx-auto text-slate-300" />
            <p className="font-bold text-slate-600">No ledger entries found</p>
            <p className="text-[11px]">Try clearing search or date range filters.</p>
          </div>
        ) : (
          filteredEntries.map(entry => {
            const isGave = entry.type === 'credit';
            return (
              <button
                key={`${entry.customerId}-${entry.txId}`}
                type="button"
                onClick={() => onSelectEntry(entry.customerId, entry.txId)}
                className="w-full px-3 sm:px-5 py-3 hover:bg-slate-50 active:bg-slate-100/80 transition grid grid-cols-12 gap-2 items-center text-left cursor-pointer"
              >
                <div className="col-span-6 min-w-0 space-y-0.5">
                  <span className="block text-[10px] text-slate-400 font-medium tabular-nums truncate">
                    {formatLedgerTimestamp(entry.date)}
                  </span>
                  <span className="block text-xs sm:text-sm font-bold text-slate-900 truncate">
                    {entry.customerName}
                  </span>
                  {entry.note && (
                    <span className="block text-[11px] text-slate-600 truncate">
                      {entry.note}
                    </span>
                  )}
                  <span className="inline-block text-[10px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded tabular-nums mt-0.5">
                    Bal. {currency} {entry.runningBalance.toLocaleString()}
                  </span>
                </div>

                <div className="col-span-3 text-right tabular-nums">
                  {isGave && (
                    <span className="text-xs sm:text-sm font-extrabold text-rose-600">
                      {entry.amount.toLocaleString()}
                    </span>
                  )}
                </div>

                <div className="col-span-3 text-right tabular-nums">
                  {!isGave && (
                    <span className="text-xs sm:text-sm font-extrabold text-emerald-600">
                      {entry.amount.toLocaleString()}
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Bottom Sticky PDF & Print Bar */}
      <div className="bg-white border-t border-slate-200 px-3 sm:px-5 py-2.5 flex items-center gap-2.5 shrink-0">
        <button
          type="button"
          onClick={handleExportPdf}
          className="flex-1 h-11 rounded-full border-2 border-emerald-600 bg-white hover:bg-emerald-50 text-emerald-700 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer"
        >
          <FileText className="w-4 h-4" />
          <span>PDF</span>
        </button>
        <button
          type="button"
          onClick={handlePrint}
          className="w-11 h-11 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center shadow-md shadow-emerald-600/25 transition cursor-pointer shrink-0"
          title="Print All Transactions"
          aria-label="Print All Transactions"
        >
          <Printer className="w-4.5 h-4.5" />
        </button>
      </div>
    </div>
  );
};
