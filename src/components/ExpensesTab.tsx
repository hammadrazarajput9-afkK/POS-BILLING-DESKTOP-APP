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

export const ExpensesTab: React.FC<ExpensesTabProps> = ({
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
    <div className="space-y-6">
      {/* Metric Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4.5 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            {selectedDate ? `Expenses on ${selectedDate}` : 'Filtered Expenses'}
          </span>
          <h3 className="text-2xl font-extrabold text-rose-600 font-mono tabular-nums mt-1">
            {currency} {totalExpenseAmount.toLocaleString()}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            {selectedDate ? `Date: ${selectedDate}` : `All time total: ${currency} ${allTimeTotal.toLocaleString()}`}
          </p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-4.5 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Highest Expense Category
          </span>
          <h3 className="text-2xl font-extrabold text-slate-900 mt-1">
            {topCategory}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            {topCategory !== 'None'
              ? `${currency} ${(categoryTotals[topCategory] || 0).toLocaleString()} recorded`
              : 'No records'}
          </p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-4.5 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Total Expense Entries
          </span>
          <h3 className="text-2xl font-extrabold text-slate-900 font-mono tabular-nums mt-1">
            {filtered.length} Records
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Across {Object.keys(categoryTotals).length} categories
          </p>
        </div>
      </div>

      {/* Main Expenses Table Card */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-4 shadow-xs">
        {/* Controls Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search expense description..."
                className="pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-rose-600 focus:bg-white w-52 sm:w-64"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  ×
                </button>
              )}
            </div>

            {/* Date Filter & Quick Date Buttons */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="bg-transparent font-medium outline-none text-slate-800 cursor-pointer text-xs"
              />
              {selectedDate && (
                <button
                  type="button"
                  onClick={() => setSelectedDate('')}
                  className="text-slate-400 hover:text-slate-600 text-xs font-bold ml-1"
                  title="Clear Date Filter"
                >
                  ×
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => setDateShortcut('all')}
                className={`px-2 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  !selectedDate ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setDateShortcut('today')}
                className={`px-2 py-1 rounded-lg font-semibold transition cursor-pointer ${
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
                className={`px-2 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  selectedDate === new Date(Date.now() - 86400000).toISOString().substring(0, 10)
                    ? 'bg-white text-rose-600 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Yesterday
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenPdfReport && (
              <button
                type="button"
                onClick={onOpenPdfReport}
                className="px-3.5 py-2.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                title="Export Operational Expenses PDF Report"
              >
                <FileText className="w-4 h-4 text-rose-600" /> Export PDF Report
              </button>
            )}

            {onOpenManageCategories && (
              <button
                type="button"
                onClick={onOpenManageCategories}
                className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
              >
                <Tag className="w-4 h-4 text-purple-600" /> Manage Categories
              </button>
            )}

            <button
              type="button"
              onClick={onOpenAddModal}
              className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md shadow-rose-500/20 flex items-center gap-1.5 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Add Expense
            </button>
          </div>
        </div>

        {/* Category Pills Filter */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {['ALL', ...categories].map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-rose-600 text-white font-bold shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              {cat === 'ALL' ? 'All Categories' : cat}
            </button>
          ))}
        </div>

        {/* Expenses List Table */}
        <div className="border border-slate-200/80 rounded-xl overflow-hidden">
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

                      <td className="p-3 text-slate-500 font-mono text-[11px] whitespace-nowrap">
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

                      <td className="p-3 text-right font-mono font-extrabold text-rose-600 text-sm tabular-nums whitespace-nowrap">
                        {currency} {expense.amount.toLocaleString()}
                      </td>

                      <td className="p-3 text-center">
                        {isAdmin ? (
                          <button
                            type="button"
                            onClick={() => setExpenseToDelete(expense)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-2xl w-full p-4 space-y-3 shadow-2xl animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h4 className="font-bold text-slate-900 text-sm">{zoomedImage.title}</h4>
              <button
                type="button"
                onClick={() => setZoomedImage(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
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
