import React, { useState } from 'react';
import { Tag, Plus, Trash2, X, AlertTriangle, ShieldCheck } from 'lucide-react';
import { ExpenseItem } from '../types';
import { useToast } from './Toast';

interface ExpenseCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: string[];
  expenses: ExpenseItem[];
  onAddCategory: (category: string) => void;
  onDeleteCategory: (category: string) => boolean;
}

export const ExpenseCategoryModal: React.FC<ExpenseCategoryModalProps> = ({
  isOpen,
  onClose,
  categories,
  expenses,
  onAddCategory,
  onDeleteCategory,
}) => {
  const { showToast } = useToast();
  const [newCatName, setNewCatName] = useState('');
  const [catToDelete, setCatToDelete] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCatName.trim();
    if (!trimmed) {
      showToast('Category name cannot be empty', 'warning');
      return;
    }
    if (categories.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      showToast('This category already exists', 'info');
      return;
    }
    onAddCategory(trimmed);
    setNewCatName('');
    showToast(`Category "${trimmed}" created!`, 'success');
  };

  const handleConfirmDelete = (cat: string) => {
    const success = onDeleteCategory(cat);
    if (success) {
      setCatToDelete(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-slate-100 animate-in zoom-in-95 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold shadow-2xs">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">Manage Expense Categories</h3>
              <p className="text-[11px] text-slate-500">
                Add new expense types or delete unused categories
              </p>
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

        {/* Add New Category Form */}
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="text"
            value={newCatName}
            onChange={e => setNewCatName(e.target.value)}
            placeholder="Enter category name..."
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-rose-600 focus:bg-white transition"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Add Category
          </button>
        </form>

        {/* Categories List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[220px]">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 px-1">
            Registered Expense Categories ({categories.length})
          </div>

          {categories.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400">
              No custom expense categories found.
            </div>
          ) : (
            categories.map(cat => {
              const count = expenses.filter(
                e => e.category.toLowerCase() === cat.toLowerCase()
              ).length;
              const hasRecords = count > 0;
              const isDeletingThis = catToDelete === cat;

              return (
                <div
                  key={cat}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs">{cat}</h4>
                      <p className="text-[10px] text-slate-500">
                        {hasRecords ? `${count} recorded expenses` : 'No expenses recorded'}
                      </p>
                    </div>
                  </div>

                  <div>
                    {isDeletingThis ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleConfirmDelete(cat)}
                          className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] rounded-lg transition cursor-pointer"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setCatToDelete(null)}
                          className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] rounded-lg transition cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          if (hasRecords) {
                            showToast(
                              `Cannot delete "${cat}": It is used in ${count} expense records!`,
                              'error'
                            );
                            return;
                          }
                          setCatToDelete(cat);
                        }}
                        className={`p-1.5 rounded-lg transition cursor-pointer ${
                          hasRecords
                            ? 'text-slate-300 hover:text-slate-400'
                            : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                        }`}
                        title={
                          hasRecords
                            ? `Category is active in ${count} expenses`
                            : 'Delete category'
                        }
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="pt-2 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
