import React, { useRef } from 'react';
import { ExpenseCategory } from '../types';
import { X, Receipt, Upload, Camera, Trash2, CheckCircle2, RotateCcw } from 'lucide-react';
import { useToast } from './Toast';
import { useFormDraft } from '../hooks/useFormDraft';

export interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (expense: {
    description: string;
    category: ExpenseCategory;
    amount: number;
    date: string;
    image?: string;
    paymentMethod?: string;
  }) => void;
  currency: string;
  categories?: string[];
  onOpenManageCategories?: () => void;
}

interface ExpenseDraftData {
  description: string;
  category: ExpenseCategory;
  amount: number | '';
  date: string;
  image: string;
  paymentMethod: string;
}

const DEFAULT_CATEGORIES = [
  'Shop Rent',
  'Electricity & Utility Bills',
  'Staff Salary & Tea',
  'Refreshment & Food',
  'Transportation & Cargo',
  'Packaging & Printing',
  'Maintenance & Repairs',
  'Miscellaneous & Others',
];

export const ExpenseModal: React.FC<ExpenseModalProps> = ({
  isOpen,
  onClose,
  onSave,
  currency,
  categories = DEFAULT_CATEGORIES,
  onOpenManageCategories,
}) => {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initialDraft: ExpenseDraftData = {
    description: '',
    category: categories[0] || 'Refreshment & Food',
    amount: '',
    date: new Date().toISOString().substring(0, 10),
    image: '',
    paymentMethod: 'Cash',
  };

  const [formData, setFormData, resetDraft, hasActiveDraft] = useFormDraft<ExpenseDraftData>(
    'expense_modal_form',
    initialDraft
  );

  if (!isOpen) return null;

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast('Image size should be less than 5MB', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setFormData(prev => ({
        ...prev,
        image: result,
      }));
      showToast('Expense receipt photo attached', 'info');
    };
    reader.onerror = () => {
      showToast('Failed to load image file. Please try another image.', 'error');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setFormData(prev => ({ ...prev, image: '' }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleExplicitCancel = () => {
    resetDraft();
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(formData.amount);
    if (!formData.description.trim()) {
      showToast('Please enter an expense description', 'warning');
      return;
    }
    if (!amt || amt <= 0) {
      showToast('Please enter a valid expense amount greater than 0', 'warning');
      return;
    }

    onSave({
      description: formData.description.trim(),
      category: formData.category || categories[0] || 'Miscellaneous & Others',
      amount: amt,
      date: new Date(formData.date).toISOString(),
      image: formData.image || undefined,
      paymentMethod: formData.paymentMethod || 'Cash',
    });

    showToast('Daily expense recorded successfully', 'success');
    resetDraft();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-100 animate-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-sm">Add Shop Expense</h3>
                {hasActiveDraft && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                    Draft Restored
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">Record daily bills, staff meals, utilities or operational costs</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
            title="Close without discarding draft"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          {/* Expense Description */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Expense Description *
            </label>
            <input
              type="text"
              required
              value={formData.description}
              onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="e.g. Electricity bill, Staff lunch, Shop stationery..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-medium focus:outline-none focus:border-rose-600 focus:bg-white transition"
            />
          </div>

          {/* Photo / Receipt Upload */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Receipt / Bill Photo (Optional)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageChange}
            />

            {formData.image ? (
              <div className="relative border border-slate-200 rounded-xl p-2 bg-slate-50 flex items-center gap-3">
                <img
                  src={formData.image}
                  alt="Expense receipt"
                  className="w-14 h-14 object-cover rounded-lg border border-slate-200"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-800 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Photo Attached
                  </p>
                  <p className="text-[10px] text-slate-400">Stored safely in local database</p>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                  title="Remove receipt image"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 py-2 px-3 border border-dashed border-slate-300 hover:border-rose-400 bg-slate-50 hover:bg-rose-50/50 rounded-xl text-slate-600 hover:text-rose-700 flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  <span className="font-semibold">Upload Receipt Picture</span>
                </button>
              </div>
            )}
          </div>

          {/* Category Dropdown & Manage Categories link */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-slate-700">Expense Category</label>
              {onOpenManageCategories && (
                <button
                  type="button"
                  onClick={onOpenManageCategories}
                  className="text-rose-600 hover:text-rose-700 font-bold text-[11px] cursor-pointer"
                >
                  Manage Categories
                </button>
              )}
            </div>
            <select
              value={formData.category}
              onChange={e => setFormData(prev => ({ ...prev, category: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:outline-none focus:border-rose-600 focus:bg-white"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Amount & Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Amount ({currency}) *
              </label>
              <input
                type="number"
                required
                min="1"
                value={formData.amount}
                onChange={e =>
                  setFormData(prev => ({
                    ...prev,
                    amount: e.target.value === '' ? '' : Number(e.target.value),
                  }))
                }
                placeholder="0"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono font-bold focus:outline-none focus:border-rose-600 focus:bg-white transition"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Date</label>
              <input
                type="date"
                required
                value={formData.date}
                onChange={e => setFormData(prev => ({ ...prev, date: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-rose-600 focus:bg-white transition cursor-pointer"
              />
            </div>
          </div>

          {/* Payment Method */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Paid From (Payment Channel)
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {['Cash', 'Bank', 'Easypaisa / JazzCash'].map(pm => (
                <button
                  key={pm}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, paymentMethod: pm }))}
                  className={`py-1.5 px-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    formData.paymentMethod === pm
                      ? 'bg-rose-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {pm}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="pt-3 flex items-center justify-between border-t border-slate-100">
            {hasActiveDraft ? (
              <button
                type="button"
                onClick={resetDraft}
                className="text-slate-400 hover:text-rose-600 font-semibold text-xs flex items-center gap-1 transition cursor-pointer"
                title="Discard all entered fields"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Form</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleExplicitCancel}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-md shadow-rose-500/20 transition cursor-pointer"
              >
                Save Expense
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ExpenseModal;
