import React, { useState } from 'react';
import { Tag, Plus, Trash2, ShieldAlert, CheckCircle2, X, Lock } from 'lucide-react';
import { InventoryItem } from '../types';
import { useToast } from './Toast';

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: string[];
  inventory: InventoryItem[];
  onAddCategory: (category: string) => void;
  onDeleteCategory: (category: string) => boolean;
}

export const CategoryModal: React.FC<CategoryModalProps> = ({
  isOpen,
  onClose,
  categories,
  inventory,
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
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold shadow-2xs">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">Category Management</h3>
              <p className="text-[11px] text-slate-400">
                Create categories or safely delete unused categories
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
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-purple-600 focus:bg-white transition"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </form>

        {/* Categories List with Item Count Safety */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[220px]">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 px-1">
            Registered Categories ({categories.length})
          </div>

          {categories.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              No categories found. Create one above.
            </div>
          ) : (
            categories.map(cat => {
              const productCount = inventory.filter(
                i => i.category.toLowerCase() === cat.toLowerCase()
              ).length;
              const hasData = productCount > 0;

              return (
                <div
                  key={cat}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50/80 border border-slate-200/80 hover:bg-white hover:shadow-2xs transition"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                        hasData ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {cat.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{cat}</p>
                      <p className="text-[10px] text-slate-400 flex items-center gap-1">
                        {hasData ? (
                          <span className="text-blue-600 font-semibold flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5" /> {productCount} product{productCount > 1 ? 's' : ''} in stock (Locked)
                          </span>
                        ) : (
                          <span className="text-emerald-600 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-2.5 h-2.5" /> 0 products (Safe to delete)
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div>
                    {hasData ? (
                      <button
                        type="button"
                        onClick={() =>
                          showToast(
                            `Cannot delete "${cat}": It contains ${productCount} active product(s). Please delete or reassign them first!`,
                            'error'
                          )
                        }
                        className="p-1.5 text-slate-300 hover:text-amber-600 rounded-lg hover:bg-amber-50 transition cursor-not-allowed"
                        title={`Protected: Contains ${productCount} product(s)`}
                      >
                        <Lock className="w-4 h-4 text-slate-400" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setCatToDelete(cat)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                        title="Delete empty category"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Informational Footer Note */}
        <div className="p-3 bg-amber-50/70 border border-amber-200/60 rounded-xl flex items-start gap-2 text-[11px] text-amber-800">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span>
            <strong>Data Safety Protection:</strong> A category cannot be deleted if any products are currently assigned to it.
          </span>
        </div>

        {/* Delete Confirmation Dialog */}
        {catToDelete && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between animate-in fade-in">
            <div className="text-xs text-rose-800">
              Confirm deleting empty category <strong>"{catToDelete}"</strong>?
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCatToDelete(null)}
                className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-800 font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConfirmDelete(catToDelete)}
                className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg shadow-2xs transition cursor-pointer"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        )}

        <div className="pt-2 flex justify-end border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
