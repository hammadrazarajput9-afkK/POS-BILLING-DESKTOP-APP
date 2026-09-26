import React, { useState, useMemo } from 'react';
import { AppData } from '../types';
import {
  FileText,
  Download,
  Calendar,
  X,
  Printer,
  CheckCircle2,
  Layers,
  Sparkles,
  ShoppingBag,
  Boxes,
  BookOpen,
  Receipt,
  Activity,
  Calculator,
  ChevronRight
} from 'lucide-react';
import { useToast } from './Toast';
import { generatePdfReport, DateFilterRange, getDateFilterBounds } from '../utils/pdfGenerator';

export interface PdfExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tab: 'sales' | 'inventory' | 'khata' | 'expenses' | 'activity' | 'dailyClosing';
  data: AppData;
}

export const PdfExportModal: React.FC<PdfExportModalProps> = ({
  isOpen,
  onClose,
  tab,
  data,
}) => {
  const { showToast } = useToast();
  const [filterType, setFilterType] = useState<DateFilterRange['type']>('monthly');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().substring(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [isGenerating, setIsGenerating] = useState(false);

  const dateFilter: DateFilterRange = useMemo(
    () => ({
      type: filterType,
      startDate,
      endDate,
    }),
    [filterType, startDate, endDate]
  );

  const { start, end, label } = useMemo(() => getDateFilterBounds(dateFilter), [dateFilter]);

  // Tab titles & metadata
  const tabMeta = useMemo(() => {
    switch (tab) {
      case 'sales':
        return {
          title: 'Sales & Revenue Report',
          subtitle: 'Detailed invoices, IMEI numbers, profits, cash vs online splits',
          icon: <ShoppingBag className="w-5 h-5 text-emerald-600" />,
          accent: 'emerald',
        };
      case 'inventory':
        return {
          title: 'Inventory Valuation Report',
          subtitle: 'Stock counts, cost vs selling prices, low-stock alerts & serial IMEIs',
          icon: <Boxes className="w-5 h-5 text-blue-600" />,
          accent: 'blue',
        };
      case 'khata':
        return {
          title: 'Customer Khata Statement',
          subtitle: 'Receivables summary, balance ledger, phone numbers & overdue status',
          icon: <BookOpen className="w-5 h-5 text-purple-600" />,
          accent: 'purple',
        };
      case 'expenses':
        return {
          title: 'Expense Distribution Report',
          subtitle: 'Operational costs, categories, receipts and net profit deduction',
          icon: <Receipt className="w-5 h-5 text-rose-600" />,
          accent: 'rose',
        };
      case 'activity':
        return {
          title: 'System Activity & Audit Log',
          subtitle: 'Audit trail of sales, deletes, edits, logins and modifications',
          icon: <Activity className="w-5 h-5 text-indigo-600" />,
          accent: 'indigo',
        };
      case 'dailyClosing':
        return {
          title: 'Daily Closing Reconciliation Report',
          subtitle: 'End-of-day roznamcha, physical cash notes count, digital balances, surplus/shortages',
          icon: <Calculator className="w-5 h-5 text-emerald-600" />,
          accent: 'emerald',
        };
    }
  }, [tab]);

  // Preview Count
  const previewStats = useMemo(() => {
    const currency = data.settings.currency || 'Rs.';
    if (tab === 'sales') {
      const items = data.sales.filter(s => {
        const t = new Date(s.date).getTime();
        return t >= start.getTime() && t <= end.getTime();
      });
      const rev = items.reduce((a, b) => a + b.grandTotal, 0);
      return {
        count: `${items.length} Invoices`,
        detail: `Total Revenue: ${currency} ${rev.toLocaleString()}`,
      };
    }
    if (tab === 'inventory') {
      const totalUnits = data.inventory.reduce((a, b) => a + b.qty, 0);
      const totalValue = data.inventory.reduce((a, b) => a + b.costPrice * b.qty, 0);
      return {
        count: `${data.inventory.length} Products`,
        detail: `${totalUnits} Units | Stock Cost: ${currency} ${totalValue.toLocaleString()}`,
      };
    }
    if (tab === 'khata') {
      const due = data.khata.reduce((a, b) => a + (b.balance > 0 ? b.balance : 0), 0);
      return {
        count: `${data.khata.length} Customers`,
        detail: `Total Receivables: ${currency} ${due.toLocaleString()}`,
      };
    }
    if (tab === 'expenses') {
      const items = data.expenses.filter(e => {
        const t = new Date(e.date).getTime();
        return t >= start.getTime() && t <= end.getTime();
      });
      const total = items.reduce((a, b) => a + b.amount, 0);
      return {
        count: `${items.length} Expenses`,
        detail: `Total: ${currency} ${total.toLocaleString()}`,
      };
    }
    if (tab === 'activity') {
      const items = (data.activities || []).filter(a => {
        const t = new Date(a.timestamp).getTime();
        return t >= start.getTime() && t <= end.getTime();
      });
      return {
        count: `${items.length} Logs`,
        detail: `Filter Period: ${label}`,
      };
    }
    if (tab === 'dailyClosing') {
      const items = (data.dailyClosings || []).filter(c => {
        const t = new Date(c.date).getTime();
        return t >= start.getTime() && t <= end.getTime();
      });
      const cashSum = items.reduce((a, b) => a + (b.totalCash || 0), 0);
      const grandSum = items.reduce((a, b) => a + (b.grandTotal || 0), 0);
      return {
        count: `${items.length} Closings Logged`,
        detail: `Physical Cash: ${currency} ${cashSum.toLocaleString()} | Total: ${currency} ${grandSum.toLocaleString()}`,
      };
    }
    return { count: '0 items', detail: '' };
  }, [tab, data, start, end, label]);

  if (!isOpen) return null;

  const handleExport = async () => {
    setIsGenerating(true);
    try {
      await generatePdfReport({
        tab,
        dateFilter,
        data,
      });
      showToast('PDF Report generated and downloaded successfully!', 'success');
      onClose();
    } catch (error) {
      console.error('PDF export failed:', error);
      showToast('Failed to generate PDF. Please try again.', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 border border-slate-100 animate-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center shadow-2xs">
              {tabMeta.icon}
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">{tabMeta.title}</h3>
              <p className="text-[11px] text-slate-400">{tabMeta.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Date Range Options */}
        <div className="space-y-3">
          <label className="block text-xs font-bold text-slate-700">
            Select Report Date Range:
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { id: 'today', label: '📅 Today' },
              { id: 'weekly', label: '🗓️ Last 7 Days' },
              { id: 'monthly', label: '📆 This Month' },
              { id: 'yearly', label: '📈 Full Year' },
              { id: 'custom', label: '🎯 Custom Range' },
            ].map(btn => (
              <button
                key={btn.id}
                type="button"
                onClick={() => setFilterType(btn.id as any)}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer border text-center ${
                  filterType === btn.id
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* Custom Date Pickers */}
          {filterType === 'custom' && (
            <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 grid grid-cols-2 gap-3 animate-in fade-in">
              <div>
                <label className="block text-[11px] font-bold text-blue-900 mb-1">From Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full bg-white border border-blue-200 rounded-lg px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-blue-900 mb-1">To Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full bg-white border border-blue-200 rounded-lg px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>
          )}
        </div>

        {/* Selected Period & Live Match Summary */}
        <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/80 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-500">Report Scope:</span>
            <span className="font-bold text-slate-800">{label}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-500">Matched Records:</span>
            <span className="font-extrabold text-blue-600">{previewStats.count}</span>
          </div>
          {previewStats.detail && (
            <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/60">
              <span className="font-semibold text-slate-500">Financial Summary:</span>
              <span className="font-bold text-emerald-700">{previewStats.detail}</span>
            </div>
          )}
        </div>

        {/* Features Preview List */}
        <div className="text-[11px] text-slate-500 space-y-1">
          <p className="font-bold text-slate-700">What's included in this PDF:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>Shop Business Header (Name, Phone, Address & Generation Timestamp)</li>
            <li>Summary KPI metrics block with profit / asset totals</li>
            <li>Clean tabular layout with auto-pagination & page numbers</li>
          </ul>
        </div>

        {/* Actions */}
        <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-xs transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={isGenerating}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isGenerating ? 'Generating PDF...' : 'Download PDF Report'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PdfExportModal;
