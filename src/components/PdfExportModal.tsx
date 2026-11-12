import React, { useState, useMemo, useEffect } from 'react';
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
  ChevronRight,
  Tag,
  Check,
  Truck,
  ShieldCheck,
} from 'lucide-react';
import { useToast } from './Toast';
import { generatePdfReport, DateFilterRange, getDateFilterBounds } from '../utils/pdfGenerator';

export interface PdfExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tab: 'sales' | 'inventory' | 'khata' | 'expenses' | 'activity' | 'dailyClosing';
  data: AppData;
  initialCategory?: string;
}

export const PdfExportModal: React.FC<PdfExportModalProps> = ({
  isOpen,
  onClose,
  tab,
  data,
  initialCategory,
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

  // Inventory-specific interactive options
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');
  const [includePartyDetails, setIncludePartyDetails] = useState<boolean>(true);

  // Sync category when opening modal
  useEffect(() => {
    if (isOpen) {
      if (initialCategory && initialCategory !== 'ALL') {
        setSelectedCategory(initialCategory);
      } else {
        setSelectedCategory('all');
      }
    }
  }, [isOpen, initialCategory]);

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
          title: 'Inventory & Stock Audit Report',
          subtitle: 'Select category, party inward details & download enterprise audit PDF',
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

  // Category counts and list
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    (data.categories || []).forEach(c => set.add(c));
    (data.inventory || []).forEach(i => {
      if (i.category) set.add(i.category);
    });
    return Array.from(set).sort();
  }, [data.categories, data.inventory]);

  const categoryStatsMap = useMemo(() => {
    const map = new Map<string, { count: number; units: number }>();
    (data.inventory || []).forEach(item => {
      const cat = item.category || 'General';
      const cur = map.get(cat) || { count: 0, units: 0 };
      cur.count += 1;
      cur.units += Number(item.qty) || 0;
      map.set(cat, cur);
    });
    return map;
  }, [data.inventory]);

  // Preview Count & Stats
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
        scope: label,
      };
    }
    if (tab === 'inventory') {
      let filtered = data.inventory || [];
      if (selectedCategory !== 'all') {
        filtered = filtered.filter(i => (i.category || '').toLowerCase() === selectedCategory.toLowerCase());
      }
      const lowThresh = data.settings.lowStockThreshold || 2;
      if (stockStatusFilter === 'in_stock') {
        filtered = filtered.filter(i => (i.qty || 0) > 0);
      } else if (stockStatusFilter === 'low_stock') {
        filtered = filtered.filter(i => (i.qty || 0) > 0 && (i.qty || 0) <= lowThresh);
      } else if (stockStatusFilter === 'out_of_stock') {
        filtered = filtered.filter(i => (i.qty || 0) <= 0);
      }

      const totalUnits = filtered.reduce((a, b) => a + (Number(b.qty) || 0), 0);
      const totalCost = filtered.reduce((a, b) => a + ((Number(b.costPrice) || 0) * (Number(b.qty) || 0)), 0);
      const totalRetail = filtered.reduce((a, b) => a + ((Number(b.salePrice) || 0) * (Number(b.qty) || 0)), 0);
      const margin = totalRetail - totalCost;

      return {
        count: `${filtered.length} Products (${totalUnits} Units)`,
        detail: `Stock Cost: ${currency} ${totalCost.toLocaleString()} | Retail: ${currency} ${totalRetail.toLocaleString()} | Margin: ${currency} ${margin.toLocaleString()}`,
        scope: selectedCategory === 'all' ? 'All Categories (Entire Store)' : `Category: ${selectedCategory}`,
      };
    }
    if (tab === 'khata') {
      const due = data.khata.reduce((a, b) => a + (b.balance > 0 ? b.balance : 0), 0);
      return {
        count: `${data.khata.length} Customers`,
        detail: `Total Receivables: ${currency} ${due.toLocaleString()}`,
        scope: label,
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
        scope: label,
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
        scope: label,
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
        scope: label,
      };
    }
    return { count: '0 items', detail: '', scope: label };
  }, [tab, data, start, end, label, selectedCategory, stockStatusFilter]);

  if (!isOpen) return null;

  const handleExport = async () => {
    setIsGenerating(true);
    try {
      await generatePdfReport({
        tab,
        dateFilter,
        data,
        categoryFilter: selectedCategory,
        stockStatusFilter,
        includePartyDetails,
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

  const totalStoreUnits = (data.inventory || []).reduce((acc, i) => acc + (Number(i.qty) || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full max-w-full overflow-x-hidden p-3.5 sm:p-6 shadow-2xl space-y-4 sm:space-y-5 border border-slate-100 animate-in zoom-in-95 my-auto max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center shadow-2xs shrink-0">
              {tabMeta.icon}
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-slate-900 text-xs sm:text-sm truncate">{tabMeta.title}</h3>
              <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">{tabMeta.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer shrink-0 ml-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Specific Content */}
        {tab === 'inventory' ? (
          <div className="space-y-4">
            {/* Category Selection Prompt */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-blue-600" />
                  <span>Select Category for PDF Export:</span>
                </label>
                <span className="text-[11px] font-bold text-blue-600">
                  {selectedCategory === 'all' ? 'All Categories' : selectedCategory}
                </span>
              </div>

              {/* All Categories Button */}
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`w-full py-2.5 px-3 rounded-xl text-xs font-extrabold transition cursor-pointer border flex items-center justify-between ${
                  selectedCategory === 'all'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-blue-50/60 hover:bg-blue-100/70 text-blue-900 border-blue-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 shrink-0" />
                  <span>All Categories (Complete Inventory Stock)</span>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  selectedCategory === 'all' ? 'bg-white/20 text-white' : 'bg-blue-200/70 text-blue-900'
                }`}>
                  {data.inventory?.length || 0} Models • {totalStoreUnits} Units
                </span>
              </button>

              {/* Specific Categories Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-36 overflow-y-auto p-1 bg-slate-50/70 rounded-xl border border-slate-200/70">
                {availableCategories.map(cat => {
                  const stats = categoryStatsMap.get(cat) || { count: 0, units: 0 };
                  const isSelected = selectedCategory.toLowerCase() === cat.toLowerCase();
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`p-2 rounded-lg text-left text-xs font-bold transition cursor-pointer border flex flex-col justify-between ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="truncate">{cat}</span>
                        {isSelected && <Check className="w-3 h-3 shrink-0 ml-1" />}
                      </div>
                      <span className={`text-[10px] mt-0.5 truncate ${
                        isSelected ? 'text-blue-100' : 'text-slate-400'
                      }`}>
                        {stats.count} models ({stats.units} pcs)
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Stock Health Filter */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600">Stock Status Filter:</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {[
                  { id: 'all', label: 'All Items' },
                  { id: 'in_stock', label: 'In Stock (>0)' },
                  { id: 'low_stock', label: 'Low Stock' },
                  { id: 'out_of_stock', label: 'Out of Stock' },
                ].map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setStockStatusFilter(item.id as any)}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-bold text-center border transition cursor-pointer ${
                      stockStatusFilter === item.id
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Inward Details & Party Checkbox */}
            <div className="p-2.5 bg-emerald-50/60 rounded-xl border border-emerald-200/70 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-emerald-950">
                <input
                  type="checkbox"
                  checked={includePartyDetails}
                  onChange={e => setIncludePartyDetails(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded-md border-emerald-300 focus:ring-emerald-500"
                />
                <Truck className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                <span>Include Supplier / Purchase Party Name for Each Device</span>
              </label>
              <p className="text-[10px] text-emerald-800/80 pl-6">
                PDF report will include invoice bill number and supplier party name (e.g. Khan Telecom, Direct Stock) on each record.
              </p>
            </div>
          </div>
        ) : (
          /* Standard Date Range for other tabs */
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
        )}

        {/* Selected Scope & Live Match Summary */}
        <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/80 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-500">Report Scope:</span>
            <span className="font-bold text-slate-800">{previewStats.scope}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-500">Matched Records:</span>
            <span className="font-extrabold text-blue-600">{previewStats.count}</span>
          </div>
          {previewStats.detail && (
            <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/60">
              <span className="font-semibold text-slate-500">Financial Summary:</span>
              <span className="font-bold text-emerald-700 text-right">{previewStats.detail}</span>
            </div>
          )}
        </div>

        {/* Features Preview List */}
        <div className="text-[11px] text-slate-500 space-y-1">
          <p className="font-bold text-slate-700">What's included in this Professional PDF:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>Shop Business Header (Name, Tagline, Phone, Address & Timestamp)</li>
            <li>No duplicate IMEIs (Unique deduplicated serial numbers per handset)</li>
            <li>Supplier & Party identification (Vendor bill number and supplier name)</li>
            <li>A4 Landscape layout with KPI metrics cards and signature lines</li>
          </ul>
        </div>

        {/* Actions */}
        <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-xs transition cursor-pointer text-center"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={isGenerating}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 sm:py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs whitespace-normal shadow-md shadow-blue-500/20 transition cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span>{isGenerating ? 'Generating PDF...' : 'Download PDF Report'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PdfExportModal;

