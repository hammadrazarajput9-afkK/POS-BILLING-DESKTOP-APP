import React, { useState, useMemo } from 'react';
import { ExpenseItem } from '../types';
import {
  Receipt,
  Plus,
  Trash2,
  Calendar,
  Tag,
  Image as ImageIcon,
  X,
  FileText,
  ArrowLeft,
  Eye,
  EyeOff,
  Search,
} from 'lucide-react';
import { useToast } from './Toast';
import { ConfirmModal } from './ConfirmModal';
import { smartMatch } from '../utils/smartSearch';

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
  onBackToHome?: () => void;
}

const ExpensesTabComponent: React.FC<ExpensesTabProps> = ({
  expenses,
  currency,
  categories = ['Refreshment', 'Utilities', 'Rent', 'Salaries', 'Shop Maintenance', 'Misc'],
  isAdmin = true,
  onOpenAddModal,
  onOpenManageCategories,
  onDeleteExpense,
  onOpenPdfReport,
  onBackToHome,
}) => {
  const { showToast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [expenseToDelete, setExpenseToDelete] = useState<ExpenseItem | null>(null);
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [hideAmounts, setHideAmounts] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<{ src: string; title: string } | null>(null);

  const todayStr = useMemo(() => new Date().toISOString().substring(0, 10), []);
  const yesterdayStr = useMemo(() => new Date(Date.now() - 86400000).toISOString().substring(0, 10), []);

  const dateTab: 'all' | 'today' | 'yesterday' | 'custom' = !selectedDate
    ? 'all'
    : selectedDate === todayStr
    ? 'today'
    : selectedDate === yesterdayStr
    ? 'yesterday'
    : 'custom';

  const filtered = useMemo(() => {
    const q = search.trim();
    return expenses.filter(e => {
      const matchCat = selectedCategory === 'ALL' || e.category === selectedCategory;
      const matchSearch =
        !q || smartMatch(q, [e.description, e.category], [e.amount]);

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
      setSelectedDate(todayStr);
    } else if (type === 'yesterday') {
      setSelectedDate(yesterdayStr);
    }
  };

  const formatAmount = (amount: number) =>
    hideAmounts ? `${currency} ••••` : `${currency} ${amount.toLocaleString()}`;

  return (
    <div className="space-y-3 pb-24 max-w-full overflow-hidden animate-in fade-in duration-200">
      {/* Top Rose Header + Overlapping White Summary Card */}
      <div>
        <div className="bg-rose-600 text-white rounded-2xl shadow-sm pt-3.5 pb-11 px-3.5 sm:px-5">
          {/* Row 1: Title & Header Controls */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              {onBackToHome && (
                <button
                  type="button"
                  onClick={onBackToHome}
                  className="lg:hidden w-8 h-8 -ml-1 rounded-full hover:bg-white/15 flex items-center justify-center transition cursor-pointer shrink-0"
                  aria-label="Back to home"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <h2 className="text-lg sm:text-xl font-extrabold tracking-tight truncate">
                Daily Expenses
              </h2>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {onOpenManageCategories && (
                <button
                  type="button"
                  onClick={onOpenManageCategories}
                  className="px-2.5 py-1.5 rounded-full bg-white/15 hover:bg-white/25 text-white text-[11px] font-bold transition cursor-pointer inline-flex items-center gap-1 whitespace-nowrap"
                  title="Manage Categories"
                >
                  <Tag className="w-3 h-3" />
                  <span>Categories</span>
                </button>
              )}

              {onOpenPdfReport && (
                <button
                  type="button"
                  onClick={onOpenPdfReport}
                  className="px-3 py-1.5 rounded-full bg-slate-900/90 hover:bg-slate-900 text-white text-[11px] font-black tracking-wide uppercase shadow-xs transition cursor-pointer inline-flex items-center gap-1 whitespace-nowrap"
                  title="Export Expenses PDF Report"
                >
                  <FileText className="w-3 h-3" />
                  <span>PDF</span>
                </button>
              )}
            </div>
          </div>

          {/* Row 2: Underline Date Tabs */}
          <div className="mt-3.5 flex items-center gap-6 border-b border-white/15 overflow-x-auto no-scrollbar">
            {([
              { id: 'all', label: `All (${expenses.length})` },
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
            ] as const).map(tab => {
              const active = dateTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDateShortcut(tab.id)}
                  className={`pb-2.5 text-[13px] font-bold transition relative cursor-pointer whitespace-nowrap shrink-0 ${
                    active ? 'text-white' : 'text-rose-100/80 hover:text-white'
                  }`}
                >
                  {tab.label}
                  {active && (
                    <span className="absolute left-0 right-0 bottom-0 h-[3px] rounded-full bg-amber-200" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Overlapping White Expense Summary Card */}
        <div className="-mt-8 mx-2 sm:mx-4 bg-white rounded-2xl border border-slate-200/90 shadow-sm px-3.5 py-3">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <button
              type="button"
              onClick={() => setHideAmounts(prev => !prev)}
              className="text-[11px] font-medium text-slate-500 hover:text-slate-700 flex items-center gap-1 cursor-pointer"
            >
              {hideAmounts ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span>{hideAmounts ? 'Show Amounts' : 'Hide Amounts'}</span>
            </button>

            <span className="text-[10.5px] font-semibold text-slate-400 tabular-nums truncate">
              {selectedDate ? `Date: ${selectedDate}` : 'All Dates'}
            </span>
          </div>

          <div className="grid grid-cols-2 divide-x divide-slate-100 items-center">
            <div className="pr-3">
              <div className="text-lg sm:text-2xl font-black text-rose-600 tabular-nums leading-tight truncate">
                {formatAmount(totalExpenseAmount)}
              </div>
              <div className="text-[11px] font-semibold text-slate-500 mt-0.5 truncate">
                {selectedDate ? 'Selected Period' : 'Filtered Expenses'}
              </div>
            </div>

            <div className="pl-3">
              <div className="text-base sm:text-xl font-black text-slate-900 leading-tight truncate">
                {topCategory}
              </div>
              <div className="text-[11px] font-semibold text-slate-500 mt-0.5 tabular-nums truncate">
                Top: {topCategory !== 'None' ? formatAmount(categoryTotals[topCategory] || 0) : 'No entries'}
              </div>
            </div>
          </div>

          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold text-slate-500 tabular-nums">
            <span className="truncate">All-Time: {formatAmount(allTimeTotal)}</span>
            <span className="shrink-0 ml-2">{filtered.length} entries</span>
          </div>
        </div>
      </div>

      {/* Search & Specific Date Filter Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search expense description..."
            className="w-full h-10 pl-9 pr-8 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-rose-600 shadow-2xs"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 h-7 w-7 flex items-center justify-center cursor-pointer"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2.5 h-10 text-xs shadow-2xs shrink-0">
          <Calendar className="w-3.5 h-3.5 text-rose-500 shrink-0" />
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="bg-transparent font-semibold outline-none text-slate-800 cursor-pointer text-[11px] sm:text-xs w-[112px] sm:w-auto"
          />
          {selectedDate && (
            <button
              type="button"
              onClick={() => setSelectedDate('')}
              className="text-slate-400 hover:text-rose-600 text-xs font-bold px-0.5 flex items-center justify-center cursor-pointer"
              title="Clear Date Filter"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Horizontal Category Filter Strip */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 text-[11px] sm:text-xs">
        {['ALL', ...categories].map(cat => {
          const active = selectedCategory === cat;
          const catAmount = cat === 'ALL' ? allTimeTotal : categoryTotals[cat] || 0;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer shrink-0 whitespace-nowrap flex items-center gap-1.5 border ${
                active
                  ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-rose-300 hover:text-rose-700'
              }`}
            >
              <span>{cat === 'ALL' ? 'All Categories' : cat}</span>
              {cat !== 'ALL' && catAmount > 0 && !hideAmounts && (
                <span className={`text-[10px] tabular-nums ${active ? 'text-rose-100' : 'text-slate-400'}`}>
                  {catAmount.toLocaleString()}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* MOBILE VIEW: Unified Clean Card Rows */}
      <div className="block md:hidden bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs divide-y divide-slate-100">
        {filtered.length === 0 ? (
          <div className="text-center py-10 px-4 text-slate-400">
            <Receipt className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="font-bold text-slate-700 text-xs">No expenses recorded</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {search || selectedDate ? 'Try clearing your filters' : 'Tap "+ ADD EXPENSE" below to log an expense'}
            </p>
          </div>
        ) : (
          filtered.map(expense => (
            <div
              key={expense.id}
              className="p-3 flex items-center justify-between gap-2.5 hover:bg-rose-50/30 transition"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                {expense.image ? (
                  <button
                    type="button"
                    onClick={() => setZoomedImage({ src: expense.image!, title: expense.description })}
                    className="w-10 h-10 rounded-xl border border-slate-200 overflow-hidden bg-slate-100 cursor-pointer shrink-0 shadow-2xs"
                    title="View receipt photo"
                  >
                    <img src={expense.image} alt="Receipt" className="w-full h-full object-cover" />
                  </button>
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                    <Receipt className="w-4.5 h-4.5" />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <h4 className="font-bold text-slate-900 text-xs truncate leading-snug">
                    {expense.description}
                  </h4>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5 truncate">
                    <span className="font-semibold text-slate-600 truncate">{expense.category}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums shrink-0">
                      {new Date(expense.date).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <div className="text-right">
                  <span className="tabular-nums font-black text-rose-600 text-xs block">
                    {formatAmount(expense.amount)}
                  </span>
                  {expense.image && (
                    <button
                      type="button"
                      onClick={() => setZoomedImage({ src: expense.image!, title: expense.description })}
                      className="text-[10px] font-semibold text-blue-600 hover:underline inline-flex items-center gap-0.5 cursor-pointer mt-0.5"
                    >
                      <ImageIcon className="w-2.5 h-2.5" /> Receipt
                    </button>
                  )}
                </div>

                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setExpenseToDelete(expense)}
                    className="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition cursor-pointer"
                    aria-label="Delete expense"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* DESKTOP VIEW: Clean Data Table */}
      <div className="hidden md:block bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <tr>
                <th className="p-3.5">Photo</th>
                <th className="p-3.5">Date</th>
                <th className="p-3.5">Expense Detail</th>
                <th className="p-3.5">Category</th>
                <th className="p-3.5 text-right">Amount</th>
                <th className="p-3.5 text-center w-14"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    <Receipt className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600">No expenses recorded</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {search || selectedDate ? 'Try clearing your filters' : 'Click "+ Add Expense" to log your first expenditure'}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map(expense => (
                  <tr key={expense.id} className="hover:bg-rose-50/30 transition">
                    <td className="p-3.5">
                      {expense.image ? (
                        <button
                          type="button"
                          onClick={() => setZoomedImage({ src: expense.image!, title: expense.description })}
                          className="w-10 h-10 rounded-xl border border-slate-200 overflow-hidden bg-slate-100 cursor-pointer hover:opacity-80 transition shrink-0 shadow-2xs"
                          title="Click to view full photo"
                        >
                          <img src={expense.image} alt="Receipt" className="w-full h-full object-cover" />
                        </button>
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
                          <Receipt className="w-4 h-4" />
                        </div>
                      )}
                    </td>

                    <td className="p-3.5 text-slate-500 tabular-nums text-[11px] whitespace-nowrap">
                      {new Date(expense.date).toLocaleDateString()}
                    </td>

                    <td className="p-3.5 font-bold text-slate-900 max-w-xs">
                      {expense.description}
                    </td>

                    <td className="p-3.5 text-slate-600 font-semibold">
                      {expense.category}
                    </td>

                    <td className="p-3.5 text-right tabular-nums font-extrabold text-rose-600 text-sm whitespace-nowrap">
                      {formatAmount(expense.amount)}
                    </td>

                    <td className="p-3.5 text-center">
                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={() => setExpenseToDelete(expense)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center mx-auto"
                          title="Delete Expense"
                        >
                          <Trash2 className="w-4 h-4" />
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

      {/* Floating Bottom Rose CTA */}
      <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-30">
        <button
          type="button"
          onClick={onOpenAddModal}
          className="h-11 px-5 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-black text-xs tracking-wide uppercase shadow-lg shadow-rose-600/30 flex items-center gap-2 transition active:scale-[0.97] cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Expense</span>
        </button>
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
