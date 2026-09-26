import React, { useState, useRef } from 'react';
import { KhataCustomer } from '../types';
import { X, UserPlus, CreditCard, DollarSign, Camera, Image, Trash2, Phone, MapPin, User, RotateCcw } from 'lucide-react';
import { useToast } from './Toast';
import { useFormDraft } from '../hooks/useFormDraft';

interface AddKhataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (customer: {
    name: string;
    phone: string;
    phone2?: string;
    address?: string;
    image?: string;
  }) => void;
  currency: string;
}

interface KhataDraftState {
  name: string;
  phone: string;
  phone2: string;
  address: string;
  image: string;
}

const initialKhataDraft: KhataDraftState = {
  name: '',
  phone: '',
  phone2: '',
  address: '',
  image: '',
};

export const AddKhataModal: React.FC<AddKhataModalProps> = ({
  isOpen,
  onClose,
  onSave,
  currency,
}) => {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData, resetDraft, hasActiveDraft] = useFormDraft<KhataDraftState>(
    'khata_add_form',
    initialKhataDraft
  );

  const name = formData.name;
  const phone = formData.phone;
  const phone2 = formData.phone2;
  const address = formData.address;
  const image = formData.image;

  const setName = (val: string) => setFormData(p => ({ ...p, name: val }));
  const setPhone = (val: string) => setFormData(p => ({ ...p, phone: val }));
  const setPhone2 = (val: string) => setFormData(p => ({ ...p, phone2: val }));
  const setAddress = (val: string) => setFormData(p => ({ ...p, address: val }));
  const setImage = (val: string) => setFormData(p => ({ ...p, image: val }));

  if (!isOpen) return null;

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        showToast('Image size should be less than 2MB', 'warning');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Customer name is required', 'warning');
      return;
    }
    if (!phone.trim()) {
      showToast('Primary phone number is required (Compulsory)', 'warning');
      return;
    }

    onSave({
      name: name.trim(),
      phone: phone.trim(),
      phone2: phone2.trim() || undefined,
      address: address.trim() || undefined,
      image: image || undefined,
    });

    resetDraft();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-100 animate-in zoom-in-95">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">New Khata Customer Account</h3>
              <p className="text-[11px] text-slate-500">Register customer profile and open ledger account</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          {/* Customer Picture Upload */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
              <span>Customer Picture (Optional)</span>
              {image && (
                <button
                  type="button"
                  onClick={() => setImage('')}
                  className="text-rose-600 hover:text-rose-700 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" /> Remove
                </button>
              )}
            </label>

            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-2xl border-2 border-dashed border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center shrink-0">
                {image ? (
                  <img src={image} alt="Customer Preview" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-6 h-6 text-slate-300" />
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5 text-purple-600" />
                <span>{image ? 'Change Photo' : 'Upload Customer Photo'}</span>
              </button>
            </div>
          </div>

          {/* Customer Name */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Customer / Business Name <span className="text-rose-500 font-bold">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Customer Name"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-medium focus:outline-none focus:border-purple-600 focus:bg-white transition"
            />
          </div>

          {/* 2 Phone Numbers: 1 Compulsory, 1 Optional */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Phone Number 1 <span className="text-rose-500 font-bold">* (Compulsory)</span>
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  required
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="Primary Phone Number"
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:border-purple-600 focus:bg-white transition"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Phone Number 2 <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={phone2}
                  onChange={e => setPhone2(e.target.value)}
                  placeholder="Secondary Phone Number"
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:border-purple-600 focus:bg-white transition"
                />
              </div>
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-purple-600" />
              <span>Customer Address / Shop Location</span>
            </label>
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Address / Location"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-medium focus:outline-none focus:border-purple-600 focus:bg-white transition"
            />
          </div>

          <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium text-xs transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md shadow-purple-500/20 transition cursor-pointer"
            >
              Save & Open Account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface SettleKhataModalProps {
  customer: KhataCustomer | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (customerId: string, type: 'credit' | 'payment', amount: number, note?: string) => void;
  currency: string;
}

export const SettleKhataModal: React.FC<SettleKhataModalProps> = ({
  customer,
  isOpen,
  onClose,
  onSave,
  currency,
}) => {
  const { showToast } = useToast();
  const [type, setType] = useState<'payment' | 'credit'>('payment');
  const [amount, setAmount] = useState<number | ''>('');
  const [note, setNote] = useState('');

  if (!isOpen || !customer) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      showToast('Please enter a valid amount', 'warning');
      return;
    }

    onSave(customer.id, type, amt, note.trim() || undefined);
    setAmount('');
    setNote('');
    showToast(
      type === 'payment'
        ? `Payment of ${currency} ${amt.toLocaleString()} recorded`
        : `Credit of ${currency} ${amt.toLocaleString()} added`,
      'success'
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-100 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Update Khata Balance</h3>
            <p className="text-[11px] text-slate-500">{customer.name} ({customer.phone})</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current Balance Notice */}
        <div className="p-3 bg-purple-50/70 border border-purple-100 rounded-xl flex items-center justify-between">
          <span className="text-xs text-purple-900 font-medium">Outstanding Udhar:</span>
          <span className="text-base font-extrabold text-purple-700 font-mono tabular-nums">
            {currency} {customer.balance.toLocaleString()}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          {/* Action Type Toggle */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Transaction Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType('payment')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  type === 'payment'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-700 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5" /> Receive Payment (-)
              </button>
              <button
                type="button"
                onClick={() => setType('credit')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  type === 'credit'
                    ? 'border-rose-600 bg-rose-50 text-rose-700 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" /> Give Credit (+)
              </button>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="font-semibold text-slate-700">Amount ({currency}) *</label>
              {type === 'payment' && customer.balance > 0 && (
                <button
                  type="button"
                  onClick={() => setAmount(customer.balance)}
                  className="text-[10px] text-purple-600 font-bold hover:underline"
                >
                  Pay Full ({currency} {customer.balance.toLocaleString()})
                </button>
              )}
            </div>
            <input
              type="number"
              required
              min="1"
              value={amount}
              onChange={e => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="0"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-mono tabular-nums font-semibold focus:outline-none focus:border-purple-600 focus:bg-white transition"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Note / Remarks (Optional)</label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Remarks / Note"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-medium focus:outline-none focus:border-purple-600 focus:bg-white transition"
            />
          </div>

          <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium text-xs transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`px-5 py-2 rounded-xl text-white font-bold text-xs shadow-md transition cursor-pointer ${
                type === 'payment'
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20'
                  : 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/20'
              }`}
            >
              {type === 'payment' ? 'Confirm Payment Received' : 'Add Credit to Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
