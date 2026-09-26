import React, { useState, useMemo } from 'react';
import { ActivityLog } from '../types';
import {
  Activity,
  ShoppingCart,
  Boxes,
  BookOpen,
  Receipt,
  Tag,
  Settings,
  Search,
  Trash2,
  Download,
  Calendar,
  Filter,
  CheckCircle2,
  Clock,
  Layers,
  History,
  FileText
} from 'lucide-react';
import { useToast } from './Toast';
import { ConfirmModal } from './ConfirmModal';

interface ActivityCenterTabProps {
  activities: ActivityLog[];
  onClearActivities: () => void;
  onOpenPdfReport?: () => void;
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export const ActivityCenterTab: React.FC<ActivityCenterTabProps> = ({
  activities,
  onClearActivities,
  onOpenPdfReport,
}) => {
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState<string>('ALL');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Filter ONLY activities that occurred within the last 24 hours
  const recent24hActivities = useMemo(() => {
    const now = Date.now();
    return activities.filter(act => {
      const actTime = new Date(act.timestamp).getTime();
      return now - actTime <= TWENTY_FOUR_HOURS_MS;
    });
  }, [activities]);

  const getCategoryIcon = (cat: ActivityLog['category']) => {
    switch (cat) {
      case 'Sale':
        return <ShoppingCart className="w-4 h-4 text-emerald-600" />;
      case 'Inventory':
        return <Boxes className="w-4 h-4 text-blue-600" />;
      case 'Khata':
        return <BookOpen className="w-4 h-4 text-purple-600" />;
      case 'Expense':
        return <Receipt className="w-4 h-4 text-rose-600" />;
      case 'Purchase':
        return <Layers className="w-4 h-4 text-amber-600" />;
      case 'Category':
        return <Tag className="w-4 h-4 text-amber-600" />;
      case 'Settings':
        return <Settings className="w-4 h-4 text-slate-600" />;
      default:
        return <Activity className="w-4 h-4 text-slate-500" />;
    }
  };

  const getBadgeStyle = (cat: ActivityLog['category']) => {
    switch (cat) {
      case 'Sale':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200/60';
      case 'Inventory':
        return 'bg-blue-50 text-blue-700 border-blue-200/60';
      case 'Khata':
        return 'bg-purple-50 text-purple-700 border-purple-200/60';
      case 'Expense':
        return 'bg-rose-50 text-rose-700 border-rose-200/60';
      case 'Purchase':
        return 'bg-amber-50 text-amber-700 border-amber-200/60';
      case 'Category':
        return 'bg-amber-50 text-amber-700 border-amber-200/60';
      case 'Settings':
        return 'bg-slate-100 text-slate-700 border-slate-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const filteredActivities = useMemo(() => {
    const q = search.toLowerCase().trim();

    return recent24hActivities
      .filter(act => {
        const matchSearch =
          !q ||
          act.title.toLowerCase().includes(q) ||
          act.details.toLowerCase().includes(q) ||
          act.category.toLowerCase().includes(q);

        const matchCat = selectedCat === 'ALL' || act.category === selectedCat;

        return matchSearch && matchCat;
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [recent24hActivities, search, selectedCat]);

  const stats = useMemo(() => {
    const total = recent24hActivities.length;
    const salesCount = recent24hActivities.filter(a => a.category === 'Sale').length;
    const inventoryCount = recent24hActivities.filter(a => a.category === 'Inventory').length;
    const expenseCount = recent24hActivities.filter(a => a.category === 'Expense').length;
    return {
      total,
      sales: salesCount,
      inventory: inventoryCount,
      expense: expenseCount,
    };
  }, [recent24hActivities]);

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts);
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const date = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    const diffHours = Math.round((Date.now() - d.getTime()) / (1000 * 60 * 60));
    return { time, date, diff: `${diffHours === 0 ? 'Just now' : `${diffHours}h ago`}` };
  };

  const handleExportCSV = () => {
    if (recent24hActivities.length === 0) {
      showToast('No 24-hour activities to export', 'warning');
      return;
    }

    const headers = ['Timestamp', 'Category', 'Action Title', 'Details'];
    const rows = recent24hActivities.map(a => [
      `"${a.timestamp}"`,
      `"${a.category}"`,
      `"${a.title.replace(/"/g, '""')}"`,
      `"${a.details.replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity_log_24h_${new Date().toISOString().substring(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('24-Hour activity CSV exported', 'success');
  };

  return (
    <div className="space-y-6">
      {/* 24-Hour Rolling Window Information Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-2xl p-4.5 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center font-bold shrink-0">
            <History className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm sm:text-base">
              24-Hour Rolling Activity Window
            </h3>
            <p className="text-xs text-blue-100">
              Only actions performed within the last 24 hours are retained. Older changes are cleared daily.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono bg-white/20 px-3 py-1.5 rounded-xl font-bold">
            {recent24hActivities.length} Actions Recorded in 24h
          </span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total (Last 24 Hours)</span>
          <h3 className="text-2xl font-extrabold font-mono text-slate-900 tabular-nums mt-1">{stats.total}</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Live activities logged</p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sales Processed</span>
          <h3 className="text-2xl font-extrabold font-mono text-emerald-600 tabular-nums mt-1">{stats.sales}</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Invoices completed</p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Stock Modifications</span>
          <h3 className="text-2xl font-extrabold font-mono text-blue-600 tabular-nums mt-1">{stats.inventory}</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Product additions/updates</p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Expenses Logged</span>
          <h3 className="text-2xl font-extrabold font-mono text-rose-600 tabular-nums mt-1">{stats.expense}</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Disbursements made</p>
        </div>
      </div>

      {/* Main Audit Feed Card */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-4 shadow-xs">
        {/* Controls Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search audit trail..."
                className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-blue-600 focus:bg-white w-56 sm:w-64"
              />
            </div>

            <div className="flex items-center gap-1 text-xs">
              {['ALL', 'Sale', 'Inventory', 'Purchase', 'Khata', 'Expense', 'Settings'].map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCat(cat)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                    selectedCat === cat
                      ? 'bg-blue-600 text-white font-bold'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenPdfReport && (
              <button
                type="button"
                onClick={onOpenPdfReport}
                className="px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                title="Export System Audit Log PDF Report"
              >
                <FileText className="w-3.5 h-3.5 text-rose-600" /> Export PDF
              </button>
            )}

            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" /> Export CSV
            </button>

            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              className="px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear Feed
            </button>
          </div>
        </div>

        {/* Audit Trail List */}
        <div className="space-y-2.5 max-h-[550px] overflow-y-auto pr-1">
          {filteredActivities.length === 0 ? (
            <div className="text-center py-16 text-slate-400 space-y-2">
              <Clock className="w-8 h-8 mx-auto text-slate-300" />
              <p className="font-semibold text-slate-600">No actions recorded in the last 24 hours</p>
              <p className="text-[11px] text-slate-400">
                Any sale, inventory change, purchase, or expense will appear here automatically.
              </p>
            </div>
          ) : (
            filteredActivities.map(act => {
              const { time, date, diff } = formatTimestamp(act.timestamp);

              return (
                <div
                  key={act.id}
                  className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-slate-50 hover:border-slate-200 transition flex items-start justify-between gap-3 text-xs"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white border border-slate-200/80 flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                      {getCategoryIcon(act.category)}
                    </div>

                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getBadgeStyle(act.category)}`}>
                          {act.category}
                        </span>
                        <h4 className="font-bold text-slate-900 text-xs">
                          {act.title}
                        </h4>
                      </div>
                      <p className="text-slate-600 text-[11px]">
                        {act.details}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                      {diff}
                    </span>
                    <p className="text-[10px] text-slate-400 font-mono mt-1">
                      {time}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        title="Clear Activity Trail"
        message="Are you sure you want to clear current 24-hour activity log records?"
        confirmText="Clear Log"
        onConfirm={() => {
          onClearActivities();
          setShowClearConfirm(false);
          showToast('24-Hour activity trail cleared', 'info');
        }}
      />
    </div>
  );
};
