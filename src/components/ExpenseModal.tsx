import React, { useRef, useState, useEffect, useMemo } from 'react';
import { ExpenseCategory, ExpenseItem, OnlineAccount } from '../types';
import { X, Receipt, Upload, Camera, Trash2, CheckCircle2, RotateCcw } from 'lucide-react';
import { useToast } from './Toast';
import { useFormDraft } from '../hooks/useFormDraft';
import { CameraCaptureModal } from './CameraCaptureModal';
import { normalizePaymentChannel } from '../utils/accounting';

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
    accountId?: string;
  }, existingId?: string) => void;
  currency: string;
  categories?: string[];
  onlineAccounts?: OnlineAccount[];
  onOpenManageCategories?: () => void;
  editExpense?: ExpenseItem | null;
}

interface ExpenseDraftData {
  description: string;
  category: ExpenseCategory;
  amount: number | '';
  date: string;
  image: string;
  paymentMethod: string;
  accountId: string;
}

const DEFAULT_CATEGORIES = [
  'Shop Rent',
  'Electricity & Utility Bills',
  'Staff Salary & Tea',
  'Refreshment & Food',
  'Transportation & Cargo',
  'Packaging & Printing',
  'Shop Maintenance & Utilities',
  'Miscellaneous & Others',
];

export const ExpenseModal: React.FC<ExpenseModalProps> = ({
  isOpen,
  onClose,
  onSave,
  currency,
  categories = DEFAULT_CATEGORIES,
  onlineAccounts = [],
  onOpenManageCategories,
}) => {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  const initialDraft: ExpenseDraftData = {
    description: '',
    category: categories[0] || 'Refreshment & Food',
    amount: '',
    date: new Date().toISOString().substring(0, 10),
    image: '',
    paymentMethod: 'Cash',
    accountId: '',
  };

  const [formData, setFormData, resetDraft, hasActiveDraft] = useFormDraft<ExpenseDraftData>(
    'expense_modal_form',
    initialDraft
  );

  const matchingAccounts = useMemo(() => {
    return onlineAccounts.filter(a => normalizePaymentChannel(a.bankType || a.name) === formData.paymentMethod);
  }, [onlineAccounts, formData.paymentMethod]);

  useEffect(() => {
    if (matchingAccounts.length === 1) {
      if (formData.accountId !== matchingAccounts[0].id) {
        setFormData(prev => ({ ...prev, accountId: matchingAccounts[0].id }));
      }
    } else if (matchingAccounts.length === 0) {
      if (formData.accountId !== '') {
        setFormData(prev => ({ ...prev, accountId: '' }));
      }
    }
  }, [formData.paymentMethod, matchingAccounts, formData.accountId]);

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

    if (matchingAccounts.length > 1 && !formData.accountId) {
      showToast(`Please select the specific ${formData.paymentMethod} account.`, 'warning');
      return;
    }

    onSave({
      description: formData.description.trim(),
      category: formData.category || categories[0] || 'Miscellaneous & Others',
      amount: amt,
      date: new Date(formData.date).toISOString(),
      image: formData.image || undefined,
      paymentMethod: formData.paymentMethod || 'Cash',
      accountId: matchingAccounts.length > 0 ? formData.accountId || undefined : undefined,
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
                placeholder="Enter amount"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs tabular-nums font-bold focus:outline-none focus:border-rose-600 focus:bg-white transition"
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
            <div className="grid grid-cols-5 gap-1.5">
              {['Cash', 'Bank', 'JazzCash', 'Easypaisa', 'Card'].map(pm => (
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
            {matchingAccounts.length > 1 && (
              <div className="mt-2.5">
                <label className="block text-[11px] font-bold text-rose-900 mb-1">
                  Select Specific {formData.paymentMethod} Account *
                </label>
                <select
                  value={formData.accountId}
                  onChange={e => setFormData(prev => ({ ...prev, accountId: e.target.value }))}
                  className="w-full px-3 py-2 bg-white border border-rose-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-rose-600"
                >
                  <option value="">-- Choose Account --</option>
                  {matchingAccounts.map((acc: OnlineAccount) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} {acc.accountNumber ? `(${acc.accountNumber})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Receipt Photo / Bill Image Attachment */}
            <div className="p-3 bg-rose-50/60 rounded-xl border border-rose-200/80 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                {formData.image ? (
                  <div className="relative w-12 h-12 rounded-xl border border-rose-200 overflow-hidden bg-white shrink-0 shadow-2xs">
                    <img src={formData.image} alt="Receipt" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="absolute top-0.5 right-0.5 bg-rose-600 text-white rounded-full p-0.5 hover:bg-rose-700 cursor-pointer"
                      title="Remove Receipt"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-xl border border-dashed border-rose-300 bg-white flex items-center justify-center text-rose-400 shrink-0">
                    <Receipt className="w-5 h-5 text-rose-300" />
                  </div>
                )}
                <div>
                  <span className="block font-bold text-slate-800 text-[11px]">Bill / Receipt Attachment</span>
                  <span className="text-[10px] text-slate-400 block">Optional proof photo</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageChange}
                  accept="image/*"
                  className="hidden"
                  id="expense-receipt-file"
                />
                <label
                  htmlFor="expense-receipt-file"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-lg text-[11px] cursor-pointer transition border border-slate-200 shadow-2xs"
                >
                  <Upload className="w-3 h-3 text-rose-600" />
                  <span>Gallery</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsCameraOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-[11px] cursor-pointer transition shadow-2xs"
                >
                  <Camera className="w-3 h-3 text-white" />
                  <span>Camera</span>
                </button>
              </div>
            </div>

            {/* Actions */}
          <div className="pt-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 border-t border-slate-100">
            {hasActiveDraft ? (
              <button
                type="button"
                onClick={resetDraft}
                className="text-slate-400 hover:text-rose-600 font-semibold text-xs flex items-center justify-center sm:justify-start gap-1 transition cursor-pointer py-1"
                title="Discard all entered fields"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Form</span>
              </button>
            ) : (
              <div className="hidden sm:block" />
            )}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <button
                type="button"
                onClick={handleExplicitCancel}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium transition cursor-pointer text-center"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="w-full sm:w-auto px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-md shadow-rose-500/20 transition cursor-pointer text-center"
              >
                Save Expense
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Live Camera Snapshot Modal for Expense Receipt */}
      <CameraCaptureModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        title="Capture Receipt Photo"
        onCapture={dataUrl => {
          setFormData(prev => ({ ...prev, image: dataUrl }));
          showToast('Expense receipt captured with camera!', 'success');
        }}
      />
    </div>
  );
};

export default ExpenseModal;
