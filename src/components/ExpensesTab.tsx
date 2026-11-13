import React, { useState, useMemo } from 'react';
import { ExpenseItem, ExpenseCategory } from '../types';
import {
  Receipt,
  Plus,
  Trash2,
  Calendar,
  Filter,
  DollarSign,
  Coffee,
  Zap,
  Building,
  Users,
  Tag,
  Sliders,
  Image as ImageIcon,
  X,
  CreditCard,
  Banknote,
  Layers,
  FileText
} from 'lucide-react';
import { useToast } from './Toast';
import { ConfirmModal } from './ConfirmModal';

interface ExpensesTabProps {
  expenses: ExpenseItem[];
  currency: string;
  categories?: string[];
  isAdmin?: boolean;
  onOpenAddModal: () => void;
  onOpenManageCategories?: () => void;
  onDeleteExpense: (id: string) => void;
  onOpenSettings?: () => void;
  onOpenPdfReport?: () => void;
}

const ExpensesTabComponent: React.FC<ExpensesTabProps> = ({
  expenses,
  currency,
  categories = ['Refreshment', 'Utilities', 'Rent', 'Salaries', 'Shop Maintenance', 'Misc'],
  isAdmin = true,
  onOpenAddModal,
  onOpenManageCategories,
  onDeleteExpense,
  onOpenSettings,
  onOpenPdfReport,
}) => {
  const { showToast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [expenseToDelete, setExpenseToDelete] = useState<ExpenseItem | null>(null);
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(''); // empty string means "all dates"
  const [zoomedImage, setZoomedImage] = useState<{ src: string; title: string } | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return expenses.filter(e => {
      const matchCat = selectedCategory === 'ALL' || e.category === selectedCategory;
      const matchSearch = !q || e.description.toLowerCase().includes(q);
      
      let matchDate = true;
      if (selectedDate) {
        const itemDateStr = new Date(e.date).toISOString().substring(0, 10);
        matchDate = itemDateStr === selectedDate;
      }

      return matchCat && matchSearch && matchDate;
    });
  }, [expenses, selectedCategory, search, selectedDate]);

  const totalExpenseAmount = useMemo(() => {
    return filtered.reduce((acc, e) => acc + e.amount, 0);
  }, [filtered]);

  const allTimeTotal = useMemo(() => {
    return expenses.reduce((acc, e) => acc + e.amount, 0);
  }, [expenses]);

  const categoryTotals = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach(e => {
      map[e.category] = (map[e.category] || 0) + e.amount;
    });
    return map;
  }, [expenses]);

  const topCategory = useMemo(() => {
    const entries = Object.entries(categoryTotals);
    if (entries.length === 0) return 'None';
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0][0];
  }, [categoryTotals]);

  const setDateShortcut = (type: 'today' | 'yesterday' | 'all') => {
    if (type === 'all') {
      setSelectedDate('');
    } else if (type === 'today') {
      setSelectedDate(new Date().toISOString().substring(0, 10));
    } else if (type === 'yesterday') {
      const y = new Date(Date.now() - 86400000);
      setSelectedDate(y.toISOString().substring(0, 10));
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-full overflow-hidden">
      {/* Metric Highlights - Responsive Mobile & Desktop Layout */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-4">
        {/* Primary Total Card */}
        <div className="col-span-2 sm:col-span-1 bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-4.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {selectedDate ? `Expenses (${selectedDate})` : 'Filtered Expenses'}
            </span>
            <span className="p-1.5 rounded-lg bg-rose-50 text-rose-600 sm:hidden">
              <Receipt className="w-3.5 h-3.5" />
            </span>
          </div>
          <h3 className="text-xl sm:text-2xl font-extrabold text-rose-600 tabular-nums mt-0.5 sm:mt-1">
            {currency} {totalExpenseAmount.toLocaleString()}
          </h3>
          <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 sm:mt-1 truncate">
            {selectedDate ? `Date: ${selectedDate}` : `All-time: ${currency} ${allTimeTotal.toLocaleString()}`}
          </p>
        </div>

        {/* Highest Category Card */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-4.5 shadow-xs">
          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 block truncate">
            Top Category
          </span>
          <h3 className="text-base sm:text-2xl font-extrabold text-slate-900 mt-0.5 sm:mt-1 truncate">
            {topCategory}
          </h3>
          <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 sm:mt-1 truncate">
            {topCategory !== 'None'
              ? `${currency} ${(categoryTotals[topCategory] || 0).toLocaleString()}`
              : 'No records'}
          </p>
        </div>

        {/* Records Count Card */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-4.5 shadow-xs">
          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 block truncate">
            Expense Records
          </span>
          <h3 className="text-base sm:text-2xl font-extrabold text-slate-900 tabular-nums mt-0.5 sm:mt-1">
            {filtered.length} Entries
          </h3>
          <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 sm:mt-1 truncate">
            {Object.keys(categoryTotals).length} categories active
          </p>
        </div>
      </div>

      {/* Main Expenses Container Card */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 sm:p-5 space-y-3.5 sm:space-y-4 shadow-xs max-w-full overflow-hidden">
        {/* Controls Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-3 border-b border-slate-100 pb-3 sm:pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full lg:w-auto">
            {/* Search Input */}
            <div className="relative w-full sm:w-60">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search expense description..."
                className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-rose-600 focus:bg-white min-h-[40px]"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm font-bold min-h-[30px] min-w-[30px] flex items-center justify-center cursor-pointer"
                >
                  ×
                </button>
              )}
            </div>

            {/* Date Filter & Quick Date Buttons Row */}
            <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs flex-1 sm:flex-initial min-h-[40px]">
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="bg-transparent font-medium outline-none text-slate-800 cursor-pointer text-xs w-full"
                />
                {selectedDate && (
                  <button
                    type="button"
                    onClick={() => setSelectedDate('')}
                    className="text-slate-400 hover:text-slate-600 text-xs font-bold px-1 min-h-[30px] min-w-[30px] flex items-center justify-center cursor-pointer"
                    title="Clear Date Filter"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Date Shortcut Pills */}
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl text-xs shrink-0 min-h-[40px]">
                <button
                  type="button"
                  onClick={() => setDateShortcut('all')}
                  className={`px-2.5 py-1.5 rounded-lg font-semibold transition cursor-pointer text-xs ${
                    !selectedDate ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setDateShortcut('today')}
                  className={`px-2.5 py-1.5 rounded-lg font-semibold transition cursor-pointer text-xs ${
                    selectedDate === new Date().toISOString().substring(0, 10)
                      ? 'bg-white text-rose-600 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setDateShortcut('yesterday')}
                  className={`px-2.5 py-1.5 rounded-lg font-semibold transition cursor-pointer text-xs ${
                    selectedDate === new Date(Date.now() - 86400000).toISOString().substring(0, 10)
                      ? 'bg-white text-rose-600 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Yesterday
                </button>
              </div>
            </div>
          </div>

          {/* Action Buttons Row */}
          <div className="flex items-center gap-2 w-full lg:w-auto">
            {onOpenPdfReport && (
              <button
                type="button"
                onClick={onOpenPdfReport}
                className="flex-1 sm:flex-initial px-3 py-2 sm:py-2.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs min-h-[42px]"
                title="Export Operational Expenses PDF Report"
              >
                <FileText className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                <span className="hidden sm:inline">Export PDF Report</span>
                <span className="sm:hidden">PDF</span>
              </button>
            )}

            {onOpenManageCategories && (
              <button
                type="button"
                onClick={onOpenManageCategories}
                className="flex-1 sm:flex-initial px-3 py-2 sm:py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs min-h-[42px]"
              >
                <Tag className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                <span className="hidden sm:inline">Manage Categories</span>
                <span className="sm:hidden">Categories</span>
              </button>
            )}

            <button
              type="button"
              onClick={onOpenAddModal}
              className="flex-1 sm:flex-initial px-4 py-2 sm:py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md shadow-rose-500/20 flex items-center justify-center gap-1.5 transition cursor-pointer min-h-[42px]"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Add Expense</span>
            </button>
          </div>
        </div>

        {/* Category Pills Filter - Horizontal Scrolling on Mobile */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 no-scrollbar text-xs">
          {['ALL', ...categories].map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl font-semibold transition cursor-pointer shrink-0 min-h-[34px] flex items-center ${
                selectedCategory === cat
                  ? 'bg-rose-600 text-white font-bold shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              {cat === 'ALL' ? 'All Categories' : cat}
            </button>
          ))}
        </div>

        {/* ========================================================= */}
        {/* MOBILE VIEW: Touch-Friendly Compact Expense Cards (< md:) */}
        {/* ========================================================= */}
        <div className="block md:hidden space-y-2.5">
          {filtered.length === 0 ? (
            <div className="text-center py-10 text-slate-400 bg-slate-50/50 rounded-2xl border border-slate-200/80 p-4">
              <Receipt className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="font-semibold text-slate-600 text-xs">No expenses recorded</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {search || selectedDate ? 'Try clearing your filters' : 'Tap "+ Add Expense" to record expenditure'}
              </p>
            </div>
          ) : (
            filtered.map(expense => (
              <div
                key={expense.id}
                className="bg-white border border-slate-200/90 rounded-2xl p-3 shadow-2xs space-y-2.5 hover:border-rose-200 transition"
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Thumbnail / Photo */}
                    {expense.image ? (
                      <div
                        onClick={() => setZoomedImage({ src: expense.image!, title: expense.description })}
                        className="w-11 h-11 rounded-xl border border-slate-200 overflow-hidden bg-slate-100 cursor-pointer hover:opacity-80 transition shrink-0 shadow-2xs"
                        title="View receipt picture"
                      >
                        <img src={expense.image} alt="Receipt thumbnail" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-11 h-11 rounded-xl border border-slate-200/70 bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                        <Receipt className="w-5 h-5 text-slate-400" />
                      </div>
                    )}

                    <div className="min-w-0">
                      <h4 className="font-bold text-slate-900 text-xs truncate leading-snug">
                        {expense.description}
                      </h4>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                          {expense.category}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-500 tabular-nums">
                          {new Date(expense.date).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Amount & Delete Button */}
                  <div className="text-right shrink-0 flex flex-col items-end">
                    <span className="tabular-nums font-extrabold text-rose-600 text-sm tabular-nums">
                      {currency} {expense.amount.toLocaleString()}
                    </span>
                    <span className="text-[10px] font-medium text-slate-500 mt-0.5">
                      {expense.paymentMethod || 'Cash'}
                    </span>
                  </div>
                </div>

                {isAdmin && (
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    {expense.image ? (
                      <button
                        type="button"
                        onClick={() => setZoomedImage({ src: expense.image!, title: expense.description })}
                        className="text-blue-600 hover:text-blue-700 font-semibold text-[11px] flex items-center gap-1 cursor-pointer min-h-[36px]"
                      >
                        <ImageIcon className="w-3.5 h-3.5" /> View Receipt
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-400">No Photo</span>
                    )}

                    <button
                      type="button"
                      onClick={() => setExpenseToDelete(expense)}
                      className="px-2.5 py-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer text-[11px] font-bold flex items-center gap-1 min-h-[36px]"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* ========================================================= */}
        {/* DESKTOP VIEW: Full Data Table (>= md:)                    */}
        {/* ========================================================= */}
        <div className="hidden md:block border border-slate-200/80 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="p-3">Photo</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Expense Detail</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Payment Channel</th>
                  <th className="p-3 text-right">Amount</th>
                  <th className="p-3 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-400">
                      <Receipt className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      <p className="font-semibold text-slate-600">No expenses recorded</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {search || selectedDate ? 'Try clearing your filters' : 'Click "Add Expense" to log your first expenditure'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filtered.map(expense => (
                    <tr key={expense.id} className="hover:bg-slate-50/70 transition">
                      <td className="p-3">
                        {expense.image ? (
                          <div
                            onClick={() => setZoomedImage({ src: expense.image!, title: expense.description })}
                            className="w-10 h-10 rounded-lg border border-slate-200 overflow-hidden bg-slate-100 cursor-pointer hover:opacity-80 transition shrink-0 shadow-2xs"
                            title="Click to view full photo"
                          >
                            <img src={expense.image} alt="Receipt thumbnail" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-lg border border-slate-200/70 bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                            <Receipt className="w-4 h-4" />
                          </div>
                        )}
                      </td>

                      <td className="p-3 text-slate-500 tabular-nums text-[11px] whitespace-nowrap">
                        {new Date(expense.date).toLocaleDateString()}
                      </td>

                      <td className="p-3 font-semibold text-slate-900 max-w-xs">
                        {expense.description}
                      </td>

                      <td className="p-3">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">
                          {expense.category}
                        </span>
                      </td>

                      <td className="p-3">
                        <span className="text-[11px] font-semibold text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200/70">
                          {expense.paymentMethod || 'Cash'}
                        </span>
                      </td>

                      <td className="p-3 text-right tabular-nums font-extrabold text-rose-600 text-sm tabular-nums whitespace-nowrap">
                        {currency} {expense.amount.toLocaleString()}
                      </td>

                      <td className="p-3 text-center">
                        {isAdmin ? (
                          <button
                            type="button"
                            onClick={() => setExpenseToDelete(expense)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                            title="Delete Expense"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <span className="text-slate-300 text-[10px]">--</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!expenseToDelete}
        title="Delete Expense"
        message={`Are you sure you want to delete this expense "${expenseToDelete?.description}" of ${currency} ${expenseToDelete?.amount.toLocaleString()}?`}
        confirmText="Delete Expense"
        onConfirm={() => {
          if (expenseToDelete) {
            onDeleteExpense(expenseToDelete.id);
            setExpenseToDelete(null);
            showToast('Expense deleted', 'info');
          }
        }}
        onClose={() => setExpenseToDelete(null)}
      />

      {/* Full Photo Zoom Modal */}
      {zoomedImage && (
        <div
          onClick={() => setZoomedImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-2xl w-full p-4 space-y-3 shadow-2xl animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h4 className="font-bold text-slate-900 text-sm truncate">{zoomedImage.title}</h4>
              <button
                type="button"
                onClick={() => setZoomedImage(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-hidden rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center">
              <img src={zoomedImage.src} alt={zoomedImage.title} className="max-h-[70vh] w-auto object-contain" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const ExpensesTab = React.memo(ExpensesTabComponent);
