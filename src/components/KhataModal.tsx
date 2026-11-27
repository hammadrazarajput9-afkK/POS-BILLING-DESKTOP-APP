import React, { useState, useRef, useEffect, useMemo } from 'react';
import { KhataCustomer, SaleRecord, SupplierPurchase } from '../types';
import {
  X,
  UserPlus,
  CreditCard,
  DollarSign,
  Camera,
  Trash2,
  Phone,
  MapPin,
  User,
  Upload,
  ShieldCheck,
  Calendar,
  FileText,
  Search,
  Users,
  CheckCircle2,
} from 'lucide-react';
import { useToast } from './Toast';
import { useFormDraft } from '../hooks/useFormDraft';
import { CameraCaptureModal } from './CameraCaptureModal';
import { CustomerLocationPicker } from './CustomerLocationPicker';
import { smartMatch } from '../utils/smartSearch';

interface SavedPhoneContact {
  id: string;
  name: string;
  phone: string;
  phone2?: string;
  address?: string;
  source: 'phone' | 'sale' | 'supplier' | 'khata';
  alreadyInKhata?: boolean;
}

const PHONE_CONTACTS_STORAGE_KEY = 'mobile_pos_saved_phone_contacts_v1';

const loadSavedPhoneContacts = (): SavedPhoneContact[] => {
  try {
    const raw = localStorage.getItem(PHONE_CONTACTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const persistSavedPhoneContacts = (contacts: SavedPhoneContact[]) => {
  try {
    localStorage.setItem(PHONE_CONTACTS_STORAGE_KEY, JSON.stringify(contacts.slice(0, 2000)));
  } catch {
    // Ignore storage quota errors
  }
};

const normalizeContactPhone = (raw: string): string => {
  const cleaned = raw.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+92')) return `0${cleaned.slice(3)}`;
  if (cleaned.startsWith('0092')) return `0${cleaned.slice(4)}`;
  return cleaned;
};

const parseVcfContacts = (vcfText: string): SavedPhoneContact[] => {
  const unfolded = vcfText.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const cards = unfolded.split(/BEGIN:VCARD/i).slice(1);
  const results: SavedPhoneContact[] = [];

  for (const card of cards) {
    const endIdx = card.search(/END:VCARD/i);
    const body = endIdx >= 0 ? card.slice(0, endIdx) : card;
    const lines = body.split(/\r?\n/);

    let name = '';
    const phones: string[] = [];
    let address = '';

    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx < 0) continue;
      const keyPart = line.slice(0, colonIdx).toUpperCase();
      let valPart = line.slice(colonIdx + 1).trim();
      if (!valPart) continue;

      if (keyPart.includes('QUOTED-PRINTABLE')) {
        try {
          valPart = decodeURIComponent(
            valPart.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, '%$1')
          );
        } catch {
          // keep original if malformed
        }
      }

      if (keyPart === 'FN' || keyPart.startsWith('FN;')) {
        name = valPart.replace(/\\([,;\\])/g, '$1').trim();
      } else if ((keyPart === 'N' || keyPart.startsWith('N;')) && !name) {
        const parts = valPart
          .split(';')
          .map(p => p.trim())
          .filter(Boolean);
        if (parts.length > 0) {
          name = parts.reverse().join(' ').trim();
        }
      } else if (keyPart === 'TEL' || keyPart.startsWith('TEL;')) {
        const num = normalizeContactPhone(valPart);
        if (num && !phones.includes(num)) {
          phones.push(num);
        }
      } else if ((keyPart === 'ADR' || keyPart.startsWith('ADR;')) && !address) {
        const addrParts = valPart
          .split(';')
          .map(p => p.replace(/\\n/g, ' ').replace(/\\([,;\\])/g, '$1').trim())
          .filter(Boolean);
        if (addrParts.length > 0) {
          address = addrParts.join(', ');
        }
      }
    }

    if (phones.length > 0) {
      results.push({
        id: `vcf_${phones[0]}_${name || 'contact'}`,
        name: name || phones[0],
        phone: phones[0],
        phone2: phones[1] || undefined,
        address: address || undefined,
        source: 'phone',
      });
    }
  }

  return results;
};

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
  sales?: SaleRecord[];
  supplierPurchases?: SupplierPurchase[];
  existingKhata?: KhataCustomer[];
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
  sales = [],
  supplierPurchases = [],
  existingKhata = [],
}) => {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const vcfInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData, resetDraft] = useFormDraft<KhataDraftState>(
    'khata_add_form',
    initialKhataDraft
  );
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(true);
  const [showGuarantor, setShowGuarantor] = useState(false);
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [contactDropdownOpen, setContactDropdownOpen] = useState(false);
  const [savedPhoneContacts, setSavedPhoneContacts] = useState<SavedPhoneContact[]>(() =>
    loadSavedPhoneContacts()
  );

  useEffect(() => {
    if (!isOpen) return;
    const handleHardwareBack = (e: Event) => {
      if (isCameraOpen) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('pos-hardware-back', handleHardwareBack);
    return () => window.removeEventListener('pos-hardware-back', handleHardwareBack);
  }, [isOpen, isCameraOpen, onClose]);

  const mergedContacts = useMemo<SavedPhoneContact[]>(() => {
    const khataPhones = new Set(
      existingKhata
        .map(k => normalizeContactPhone(k.phone || ''))
        .filter(Boolean)
    );
    const seen = new Set<string>();
    const list: SavedPhoneContact[] = [];

    const pushContact = (c: SavedPhoneContact) => {
      const normPhone = normalizeContactPhone(c.phone || '');
      const key = normPhone || `name_${c.name.trim().toLowerCase()}`;
      if (!key || seen.has(key)) return;
      seen.add(key);
      list.push({
        ...c,
        phone: normPhone || c.phone,
        alreadyInKhata: c.source === 'khata' || (Boolean(normPhone) && khataPhones.has(normPhone)),
      });
    };

    for (const pc of savedPhoneContacts) {
      pushContact(pc);
    }

    for (const s of sales) {
      if (s.status === 'CANCELLED') continue;
      const cName = (s.custName || '').trim();
      const cPhone = (s.custPhone || '').trim();
      if (!cName && !cPhone) continue;
      if (cName.toLowerCase() === 'walk-in customer' && !cPhone) continue;
      pushContact({
        id: `sale_${s.invNo}`,
        name: cName || cPhone,
        phone: cPhone,
        source: 'sale',
      });
    }

    for (const p of supplierPurchases) {
      if (p.status === 'REVERSED') continue;
      const sName = (p.partyName || '').trim();
      const sPhone = (p.partyPhone || '').trim();
      if (!sName || !sPhone) continue;
      pushContact({
        id: `sup_${p.id}`,
        name: sName,
        phone: sPhone,
        source: 'supplier',
      });
    }

    for (const k of existingKhata) {
      pushContact({
        id: `khata_${k.id}`,
        name: k.name,
        phone: k.phone,
        phone2: k.phone2,
        address: k.address,
        source: 'khata',
        alreadyInKhata: true,
      });
    }

    return list;
  }, [savedPhoneContacts, sales, supplierPurchases, existingKhata]);

  const matchingContacts = useMemo(() => {
    const q = contactSearchQuery.trim();
    if (!q) return mergedContacts.slice(0, 12);
    return mergedContacts
      .filter(c => smartMatch(q, [c.name, c.phone, c.phone2, c.address]))
      .slice(0, 20);
  }, [mergedContacts, contactSearchQuery]);

  const applyPickedContact = (c: SavedPhoneContact) => {
    setFormData(p => ({
      ...p,
      name: c.name || p.name,
      phone: c.phone || p.phone,
      phone2: c.phone2 || p.phone2,
      address: c.address || p.address,
    }));
    setContactSearchQuery('');
    setContactDropdownOpen(false);
    showToast(`Contact filled: ${c.name}`, 'success');
  };

  const handlePickFromPhoneContacts = async () => {
    const navAny = navigator as Navigator & {
      contacts?: {
        select: (
          properties: string[],
          options?: { multiple?: boolean }
        ) => Promise<Array<{ name?: string[]; tel?: string[]; address?: Array<{ addressLine?: string[] }> }>>;
      };
    };

    if (navAny?.contacts && typeof navAny.contacts.select === 'function') {
      try {
        const picked = await navAny.contacts.select(['name', 'tel', 'address'], {
          multiple: true,
        });
        if (picked && picked.length > 0) {
          const parsedPicked: SavedPhoneContact[] = picked
            .map((entry, idx) => {
              const cName = (entry.name?.[0] || '').trim();
              const phones = (entry.tel || [])
                .map(t => normalizeContactPhone(t))
                .filter(Boolean);
              const addr = entry.address?.[0]?.addressLine?.filter(Boolean).join(', ') || '';
              return {
                id: `dev_${Date.now()}_${idx}`,
                name: cName || phones[0] || 'Contact',
                phone: phones[0] || '',
                phone2: phones[1] || undefined,
                address: addr || undefined,
                source: 'phone' as const,
              };
            })
            .filter(c => c.name || c.phone);

          if (parsedPicked.length > 0) {
            const updatedCache = [...parsedPicked, ...savedPhoneContacts].filter(
              (c, i, arr) =>
                arr.findIndex(x => (x.phone || x.name) === (c.phone || c.name)) === i
            );
            setSavedPhoneContacts(updatedCache);
            persistSavedPhoneContacts(updatedCache);
            applyPickedContact(parsedPicked[0]);
            if (parsedPicked.length > 1) {
              showToast(`${parsedPicked.length} phone contacts saved for search!`, 'info');
            }
            return;
          }
        }
        return;
      } catch {
        // Fallback to VCF import when blocked inside iframe or cancelled
      }
    }

    vcfInputRef.current?.click();
  };

  const handleVcfImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const imported = parseVcfContacts(text);
      if (imported.length === 0) {
        showToast('No phone contacts found inside selected .vcf file', 'warning');
        return;
      }
      const merged = [...imported, ...savedPhoneContacts].filter(
        (c, i, arr) =>
          arr.findIndex(x => (x.phone || x.name) === (c.phone || c.name)) === i
      );
      setSavedPhoneContacts(merged);
      persistSavedPhoneContacts(merged);
      setContactDropdownOpen(true);
      showToast(`Imported ${imported.length} phone contacts! Search by name or number above.`, 'success');
    } catch {
      showToast('Could not read contacts file', 'warning');
    }
  };

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
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 glass-modal-backdrop">
      <div className="glass-modal-panel animate-modal-pop rounded-2xl max-w-2xl lg:max-w-3xl w-full my-auto max-h-[84dvh] flex flex-col overflow-hidden">
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

        {/* Form Body + Pinned Footer */}
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col overflow-hidden text-xs">
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Quick Contact Search & Phone Contact Picker */}
          <div className="relative bg-purple-50/75 border border-purple-200/90 rounded-xl p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-purple-600" />
                <span className="font-extrabold text-purple-950 text-[11.5px]">
                  Search from Contacts
                </span>
                {savedPhoneContacts.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-bold">
                    {savedPhoneContacts.length} Phone
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <input
                  ref={vcfInputRef}
                  type="file"
                  accept=".vcf,text/vcard,text/x-vcard"
                  onChange={handleVcfImport}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={handlePickFromPhoneContacts}
                  className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-[11px] flex items-center gap-1 shadow-2xs transition cursor-pointer"
                >
                  <Phone className="w-3 h-3" />
                  <span>Phone Contacts</span>
                </button>
                <button
                  type="button"
                  onClick={() => vcfInputRef.current?.click()}
                  className="px-2 py-1 rounded-lg bg-white hover:bg-purple-100/70 text-purple-700 border border-purple-200 font-bold text-[10.5px] flex items-center gap-1 transition cursor-pointer"
                  title="Import exported Phone Contacts (.vcf)"
                >
                  <Upload className="w-3 h-3" />
                  <span>Import .vcf</span>
                </button>
              </div>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={contactSearchQuery}
                onFocus={() => setContactDropdownOpen(true)}
                onChange={e => {
                  setContactSearchQuery(e.target.value);
                  setContactDropdownOpen(true);
                }}
                placeholder="Search contact name or mobile number..."
                className="w-full pl-8 pr-8 py-2 bg-white border border-purple-200 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-purple-600"
              />
              {(contactSearchQuery || contactDropdownOpen) && (
                <button
                  type="button"
                  onClick={() => {
                    setContactSearchQuery('');
                    setContactDropdownOpen(false);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  aria-label="Close contact suggestions"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {contactDropdownOpen && (
              <div className="bg-white border border-purple-200 rounded-xl shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100">
                {matchingContacts.length === 0 ? (
                  <div className="p-3 text-center space-y-1.5">
                    <p className="text-[11px] font-semibold text-slate-500">
                      {contactSearchQuery.trim()
                        ? `No contacts matched "${contactSearchQuery}"`
                        : 'Tap "Phone Contacts" or "Import .vcf" to load phone contacts'}
                    </p>
                  </div>
                ) : (
                  matchingContacts.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => applyPickedContact(c)}
                      className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left hover:bg-purple-50/70 transition cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 truncate flex items-center gap-1.5">
                          <span>{c.name}</span>
                          {c.alreadyInKhata && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[9.5px] font-bold">
                              <CheckCircle2 className="w-2.5 h-2.5" /> In Khata
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-500 tabular-nums truncate">
                          {c.phone || 'No number'}
                          {c.phone2 ? ` · ${c.phone2}` : ''}
                        </p>
                      </div>
                      <span className="text-[9.5px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
                        {c.source === 'phone'
                          ? 'Phone'
                          : c.source === 'sale'
                          ? 'POS Sale'
                          : c.source === 'supplier'
                          ? 'Supplier'
                          : 'Khata'}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

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

          </div>

          {/* Pinned Floating Footer Buttons */}
          <div className="shrink-0 bg-white/95 px-4 sm:px-5 py-3 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 border-t border-slate-200/80">
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
    </>
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
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!isOpen || !customer) return;
    const handleHardwareBack = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    window.addEventListener('pos-hardware-back', handleHardwareBack);
    return () => window.removeEventListener('pos-hardware-back', handleHardwareBack);
  }, [isOpen, customer, onClose]);

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
      type === 'payment' ? 'Cash' : undefined,
      undefined,
      note.trim() || undefined
    );
    setAmount('');
    setNote('');
    showToast(
      type === 'payment'
        ? `Payment of ${currency} ${amt.toLocaleString()} received in Cash`
        : `Credit of ${currency} ${amt.toLocaleString()} added`,
      'success'
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 glass-modal-backdrop">
      <div className="glass-modal-panel animate-modal-pop rounded-2xl max-w-md w-full p-5 sm:p-6 space-y-4 max-h-[82dvh] overflow-y-auto">
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

          {/* Received into Cash In Hand automatically */}

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
