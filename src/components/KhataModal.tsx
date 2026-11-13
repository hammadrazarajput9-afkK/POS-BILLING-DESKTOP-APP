import React, { useState, useRef } from 'react';
import { KhataCustomer } from '../types';
import {
  X,
  UserPlus,
  CreditCard,
  DollarSign,
  Camera,
  Image as ImageIcon,
  Trash2,
  Phone,
  MapPin,
  User,
  Upload,
  ShieldCheck,
  Calendar,
  FileText,
} from 'lucide-react';
import { useToast } from './Toast';
import { useFormDraft } from '../hooks/useFormDraft';
import { CameraCaptureModal } from './CameraCaptureModal';
import { CustomerLocationPicker } from './CustomerLocationPicker';

interface AddKhataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (customer: {
    id?: string;
    name: string;
    phone: string;
    phone2?: string;
    address?: string;
    lat?: number;
    lng?: number;
    placeId?: string;
    mapUrl?: string;
    image?: string;
    customerType?: 'retail' | 'retailer' | 'wholesaler';
    shopName?: string;
    city?: string;
    ntnNumber?: string;
    cnic?: string;
    creditLimit?: number;
    dueDate?: string;
    guarantorName?: string;
    guarantorPhone?: string;
    notes?: string;
    openingBalance?: number;
    initialBalanceType?: 'payable' | 'receivable';
  }) => void;
  currency: string;
}

interface KhataDraftState {
  name: string;
  phone: string;
  phone2: string;
  address: string;
  lat?: number;
  lng?: number;
  placeId?: string;
  mapUrl?: string;
  image: string;
  customerType: 'retail' | 'retailer';
  shopName: string;
  city: string;
  ntnNumber: string;
  cnic: string;
  creditLimit: string;
  dueDate: string;
  guarantorName: string;
  guarantorPhone: string;
  notes: string;
  openingBalance: string;
  initialBalanceType: 'receivable' | 'payable';
}

const initialKhataDraft: KhataDraftState = {
  name: '',
  phone: '',
  phone2: '',
  address: '',
  lat: undefined,
  lng: undefined,
  placeId: undefined,
  mapUrl: undefined,
  image: '',
  customerType: 'retail',
  shopName: '',
  city: '',
  ntnNumber: '',
  cnic: '',
  creditLimit: '',
  dueDate: '',
  guarantorName: '',
  guarantorPhone: '',
  notes: '',
  openingBalance: '',
  initialBalanceType: 'receivable',
};

export const AddKhataModal: React.FC<AddKhataModalProps> = ({
  isOpen,
  onClose,
  onSave,
  currency,
}) => {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData, resetDraft] = useFormDraft<KhataDraftState>(
    'khata_add_form',
    initialKhataDraft
  );
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(true);
  const [showGuarantor, setShowGuarantor] = useState(false);

  if (!isOpen) return null;

  const {
    name,
    phone,
    phone2,
    address,
    lat,
    lng,
    placeId,
    mapUrl,
    image,
    customerType = 'retail',
    shopName = '',
    city = '',
    ntnNumber = '',
    cnic = '',
    creditLimit = '',
    dueDate = '',
    guarantorName = '',
    guarantorPhone = '',
    notes = '',
    openingBalance = '',
    initialBalanceType = 'receivable',
  } = formData;

  const updateField = <K extends keyof KhataDraftState>(key: K, val: KhataDraftState[K]) => {
    setFormData(p => ({ ...p, [key]: val }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        showToast('Image size should be less than 2MB', 'warning');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        updateField('image', reader.result as string);
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

    const parsedOpening = openingBalance.trim() ? Number(openingBalance) : 0;
    const parsedLimit = creditLimit.trim() ? Number(creditLimit) : undefined;

    onSave({
      name: name.trim(),
      phone: phone.trim(),
      phone2: phone2.trim() || undefined,
      address: address.trim() || undefined,
      lat,
      lng,
      placeId,
      mapUrl,
      image: image || undefined,
      customerType,
      shopName: customerType === 'retailer' ? shopName.trim() || undefined : undefined,
      city: city.trim() || undefined,
      ntnNumber: customerType === 'retailer' ? ntnNumber.trim() || undefined : undefined,
      cnic: cnic.trim() || undefined,
      creditLimit: parsedLimit && Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined,
      dueDate: dueDate.trim() || undefined,
      guarantorName: guarantorName.trim() || undefined,
      guarantorPhone: guarantorPhone.trim() || undefined,
      notes: notes.trim() || undefined,
      openingBalance: Number.isFinite(parsedOpening) && parsedOpening > 0 ? parsedOpening : 0,
      initialBalanceType,
    });

    resetDraft();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/65 backdrop-blur-xs animate-in fade-in overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 animate-in zoom-in-95 my-auto max-h-[94vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center font-bold shrink-0 shadow-xs">
              <UserPlus className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-slate-900 text-sm sm:text-base truncate">
                New Customer Khata Account
              </h3>
              <p className="text-[11px] text-slate-500 truncate">
                Add profile, credit limits, due date & pin exact house/shop location on Google Maps
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-200/70 transition cursor-pointer shrink-0 ml-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
          {/* Row 1: Photo + Account Type + Core Name/CNIC */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
            {/* Photo Card */}
            <div className="md:col-span-4 bg-slate-50/80 border border-slate-200 rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700 text-[11px]">Customer / CNIC Photo</span>
                {image && (
                  <button
                    type="button"
                    onClick={() => {
                      updateField('image', '');
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="text-rose-600 hover:text-rose-700 text-[10px] font-bold flex items-center gap-0.5 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" /> Clear
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-xl border border-slate-200 overflow-hidden bg-white flex items-center justify-center shrink-0">
                  {image ? (
                    <img src={image} alt="Customer Preview" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-6 h-6 text-slate-300" />
                  )}
                </div>
                <div className="flex flex-col gap-1.5 flex-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                    id="khata-photo-file"
                  />
                  <label
                    htmlFor="khata-photo-file"
                    className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-lg text-[11px] cursor-pointer transition border border-slate-200"
                  >
                    <Upload className="w-3 h-3 text-purple-600" />
                    <span>Gallery</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsCameraOpen(true)}
                    className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg text-[11px] cursor-pointer transition"
                  >
                    <Camera className="w-3 h-3" />
                    <span>Camera</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Name + Type + CNIC */}
            <div className="md:col-span-8 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => updateField('customerType', 'retail')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer border ${
                    customerType === 'retail'
                      ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Retail Customer
                </button>
                <button
                  type="button"
                  onClick={() => updateField('customerType', 'retailer')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer border ${
                    customerType === 'retailer'
                      ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Retailer / Wholesaler
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {customerType === 'retailer' ? 'Contact Person Name' : 'Customer Name'} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={e => updateField('name', e.target.value)}
                    placeholder="Full Name"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-purple-600 focus:bg-white transition"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">CNIC / ID Number</label>
                  <input
                    type="text"
                    value={cnic}
                    onChange={e => updateField('cnic', e.target.value)}
                    placeholder="e.g. 35202-1234567-1"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs tabular-nums focus:outline-none focus:border-purple-600 focus:bg-white transition"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Retailer / Shop Extra Fields */}
          {customerType === 'retailer' && (
            <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-xl grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block font-bold text-purple-950 mb-1">Shop / Firm Name</label>
                <input
                  type="text"
                  value={shopName}
                  onChange={e => updateField('shopName', e.target.value)}
                  placeholder="Shop Name"
                  className="w-full bg-white border border-purple-200 rounded-lg px-3 py-2 text-xs font-medium focus:outline-none focus:border-purple-600"
                />
              </div>
              <div>
                <label className="block font-bold text-purple-950 mb-1">City / Bazaar</label>
                <input
                  type="text"
                  value={city}
                  onChange={e => updateField('city', e.target.value)}
                  placeholder="City"
                  className="w-full bg-white border border-purple-200 rounded-lg px-3 py-2 text-xs font-medium focus:outline-none focus:border-purple-600"
                />
              </div>
              <div>
                <label className="block font-bold text-purple-950 mb-1">NTN / GST No</label>
                <input
                  type="text"
                  value={ntnNumber}
                  onChange={e => updateField('ntnNumber', e.target.value)}
                  placeholder="Optional"
                  className="w-full bg-white border border-purple-200 rounded-lg px-3 py-2 text-xs tabular-nums focus:outline-none focus:border-purple-600"
                />
              </div>
            </div>
          )}

          {/* Row 2: Phones + Credit Limit + Due Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Primary Phone <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  required
                  value={phone}
                  onChange={e => updateField('phone', e.target.value)}
                  placeholder="03XX-XXXXXXX"
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs tabular-nums focus:outline-none focus:border-purple-600 focus:bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Secondary Phone</label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={phone2}
                  onChange={e => updateField('phone2', e.target.value)}
                  placeholder="Optional"
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs tabular-nums focus:outline-none focus:border-purple-600 focus:bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Credit Limit ({currency})</label>
              <input
                type="number"
                min="0"
                value={creditLimit}
                onChange={e => updateField('creditLimit', e.target.value)}
                placeholder="No Limit"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs tabular-nums focus:outline-none focus:border-purple-600 focus:bg-white"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-purple-600" /> Promise Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={e => updateField('dueDate', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs tabular-nums focus:outline-none focus:border-purple-600 focus:bg-white"
              />
            </div>
          </div>

          {/* Row 3: Opening Balance + Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 bg-slate-50 border border-slate-200/80 rounded-xl p-3">
            <div className="sm:col-span-4">
              <label className="block font-semibold text-slate-700 mb-1">Opening Balance ({currency})</label>
              <input
                type="number"
                min="0"
                value={openingBalance}
                onChange={e => updateField('openingBalance', e.target.value)}
                placeholder="Optional amount"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs tabular-nums font-bold focus:outline-none focus:border-purple-600"
              />
            </div>
            <div className="sm:col-span-4">
              <label className="block font-semibold text-slate-700 mb-1">Balance Type</label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => updateField('initialBalanceType', 'receivable')}
                  className={`py-2 px-2 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                    initialBalanceType === 'receivable'
                      ? 'bg-rose-50 border-rose-500 text-rose-700'
                      : 'bg-white border-slate-200 text-slate-600'
                  }`}
                >
                  Due (+)
                </button>
                <button
                  type="button"
                  onClick={() => updateField('initialBalanceType', 'payable')}
                  className={`py-2 px-2 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                    initialBalanceType === 'payable'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                      : 'bg-white border-slate-200 text-slate-600'
                  }`}
                >
                  Advance (-)
                </button>
              </div>
            </div>
            <div className="sm:col-span-4">
              <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <FileText className="w-3 h-3 text-slate-400" /> Account Notes
              </label>
              <input
                type="text"
                value={notes}
                onChange={e => updateField('notes', e.target.value)}
                placeholder="Agreement / Installment notes"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-purple-600"
              />
            </div>
          </div>

          {/* Optional Guarantor Toggle */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowGuarantor(prev => !prev)}
              className="w-full px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-xs font-bold text-slate-700 transition cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                Guarantor / Reference Details (Optional)
              </span>
              <span className="text-[11px] text-purple-600">{showGuarantor ? 'Hide' : 'Add Guarantor'}</span>
            </button>
            {showGuarantor && (
              <div className="p-3 bg-white grid grid-cols-1 sm:grid-cols-2 gap-2.5 border-t border-slate-100">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Guarantor / Witness Name</label>
                  <input
                    type="text"
                    value={guarantorName}
                    onChange={e => updateField('guarantorName', e.target.value)}
                    placeholder="Reference person name"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-purple-600 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Guarantor Phone</label>
                  <input
                    type="text"
                    value={guarantorPhone}
                    onChange={e => updateField('guarantorPhone', e.target.value)}
                    placeholder="03XX-XXXXXXX"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs tabular-nums focus:outline-none focus:border-purple-600 focus:bg-white"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Google Maps Customer Location Picker */}
          <div className="border border-purple-200/80 rounded-xl p-3.5 bg-purple-50/30 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-purple-600" />
                <span className="font-extrabold text-slate-900 text-xs">
                  Customer Location & Google Maps Pin
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowMapPicker(prev => !prev)}
                className="text-[11px] font-bold text-purple-700 hover:underline cursor-pointer"
              >
                {showMapPicker ? 'Hide Map Picker' : 'Show Google Maps Picker'}
              </button>
            </div>

            {showMapPicker ? (
              <CustomerLocationPicker
                value={{ address, lat, lng, placeId, mapUrl }}
                onChange={loc => {
                  setFormData(p => ({
                    ...p,
                    address: loc.address,
                    lat: loc.lat,
                    lng: loc.lng,
                    placeId: loc.placeId,
                    mapUrl: loc.mapUrl,
                  }));
                }}
                customerName={name || 'New Customer'}
                heightClass="h-52 sm:h-60"
                showAddressInput={true}
                showTrackActions={false}
              />
            ) : (
              <input
                type="text"
                value={address}
                onChange={e => updateField('address', e.target.value)}
                placeholder="House / Shop Address or Landmark"
                className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-purple-600"
              />
            )}
          </div>

          {/* Footer Buttons */}
          <div className="pt-3 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-xs transition cursor-pointer text-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="w-full sm:w-auto px-5 py-2.5 sm:py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md shadow-purple-500/20 transition cursor-pointer text-center"
            >
              Save & Open Account
            </button>
          </div>
        </form>
      </div>

      {/* Live Camera Snapshot Modal for Customer */}
      <CameraCaptureModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        title="Capture Customer / CNIC Photo"
        onCapture={dataUrl => {
          updateField('image', dataUrl);
          showToast('Customer photo captured with camera!', 'success');
        }}
      />
    </div>
  );
};

interface SettleKhataModalProps {
  customer: KhataCustomer | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    customerId: string,
    type: 'credit' | 'payment',
    amount: number,
    paymentMethod?: string,
    accountId?: string,
    note?: string
  ) => void;
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
  const [paymentMethod, setPaymentMethod] = useState<string>('Cash');
  const [note, setNote] = useState('');

  if (!isOpen || !customer) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      showToast('Please enter a valid amount', 'warning');
      return;
    }

    onSave(
      customer.id,
      type,
      amt,
      type === 'payment' ? paymentMethod : undefined,
      undefined,
      note.trim() || undefined
    );
    setAmount('');
    setNote('');
    setPaymentMethod('Cash');
    showToast(
      type === 'payment'
        ? `Payment of ${currency} ${amt.toLocaleString()} received via ${paymentMethod}`
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
          <span className="text-xs text-purple-900 font-medium">Outstanding Balance:</span>
          <span className="text-base font-extrabold text-purple-700 tabular-nums">
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
              placeholder="Enter amount"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs tabular-nums font-semibold focus:outline-none focus:border-purple-600 focus:bg-white transition"
            />
          </div>

          {/* Structured Payment Channel (Only for Received Payment) */}
          {type === 'payment' && (
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Payment Channel (Destination Account) *
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { id: 'Cash', label: 'Cash Drawer' },
                  { id: 'JazzCash', label: 'JazzCash' },
                  { id: 'Easypaisa', label: 'Easypaisa' },
                  { id: 'Bank', label: 'Bank' },
                ].map(channel => (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => setPaymentMethod(channel.id)}
                    className={`py-2 px-1 rounded-xl text-[11px] font-bold text-center border transition cursor-pointer ${
                      paymentMethod === channel.id
                        ? 'border-purple-600 bg-purple-50 text-purple-700 shadow-2xs'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {channel.label}
                  </button>
                ))}
              </div>
            </div>
          )}

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

          <div className="pt-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium text-xs transition cursor-pointer text-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`w-full sm:w-auto px-5 py-2 rounded-xl text-white font-bold text-xs shadow-md transition cursor-pointer text-center ${
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
