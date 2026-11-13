import React, { useState } from 'react';
import { Tag, Plus, Trash2, X, Edit2, Check, Lock } from 'lucide-react';
import { ExpenseItem } from '../types';
import { useToast } from './Toast';

interface ExpenseCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: string[];
  expenses: ExpenseItem[];
  onAddCategory: (category: string) => void;
  onDeleteCategory: (category: string) => boolean;
  onRenameCategory?: (oldName: string, newName: string) => boolean;
}

export const ExpenseCategoryModal: React.FC<ExpenseCategoryModalProps> = ({
  isOpen,
  onClose,
  categories,
  expenses,
  onAddCategory,
  onDeleteCategory,
  onRenameCategory,
}) => {
  const { showToast } = useToast();
  const [newCatName, setNewCatName] = useState('');
  const [catToDelete, setCatToDelete] = useState<string | null>(null);
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState('');

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

  const handleSaveRename = (oldCat: string) => {
    const trimmed = editCatName.trim();
    if (!trimmed) {
      showToast('Category name cannot be empty', 'warning');
      return;
    }
    if (trimmed === oldCat) {
      setEditingCat(null);
      return;
    }
    if (categories.some(c => c.toLowerCase() === trimmed.toLowerCase() && c.toLowerCase() !== oldCat.toLowerCase())) {
      showToast('This category name already exists', 'info');
      return;
    }
    if (onRenameCategory) {
      const ok = onRenameCategory(oldCat, trimmed);
      if (ok) {
        setEditingCat(null);
        setEditCatName('');
      }
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
              const isEditingThis = editingCat === cat;

              return (
                <div
                  key={cat}
                  className="flex items-center justify-between gap-2 p-3 rounded-xl border border-slate-100 hover:border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0"></span>
                    <div className="min-w-0 flex-1">
                      {isEditingThis ? (
                        <input
                          type="text"
                          value={editCatName}
                          onChange={e => setEditCatName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSaveRename(cat);
                            } else if (e.key === 'Escape') {
                              setEditingCat(null);
                            }
                          }}
                          autoFocus
                          className="w-full bg-white border border-rose-400 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                        />
                      ) : (
                        <>
                          <h4 className="font-bold text-slate-900 text-xs truncate">{cat}</h4>
                          <p className="text-[10px] text-slate-500 flex items-center gap-1">
                            {hasRecords ? (
                              <>
                                <Lock className="w-2.5 h-2.5 text-amber-600" />
                                <span>{count} recorded expenses (Locked • Name editable)</span>
                              </>
                            ) : (
                              'No expenses recorded'
                            )}
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0">
                    {isEditingThis ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleSaveRename(cat)}
                          className="p-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition cursor-pointer"
                          title="Save Category Name"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCat(null)}
                          className="p-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition cursor-pointer"
                          title="Cancel"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : isDeletingThis ? (
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
                      <div className="flex items-center gap-1">
                        {onRenameCategory && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCat(cat);
                              setEditCatName(cat);
                              setCatToDelete(null);
                            }}
                            className="p-1.5 text-slate-500 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                            title="Edit Category Name"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (hasRecords) {
                              showToast(
                                `Cannot delete "${cat}": It is used in ${count} expense records! You can still edit its name.`,
                                'error'
                              );
                              return;
                            }
                            setCatToDelete(cat);
                          }}
                          className={`p-1.5 rounded-lg transition ${
                            hasRecords
                              ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50 cursor-not-allowed'
                              : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer'
                          }`}
                          title={
                            hasRecords
                              ? `Locked against deletion: active in ${count} expenses`
                              : 'Delete category'
                          }
                        >
                          {hasRecords ? <Lock className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
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
