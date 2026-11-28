import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookUser, CheckCircle2, Phone, Upload } from 'lucide-react';
import { useToast } from './Toast';
import {
  SavedPhoneContact,
  loadSavedPhoneContacts,
  matchContacts,
  mergeAndSavePhoneContacts,
  parseVcfContacts,
  pickDevicePhoneContacts,
  subscribeSavedPhoneContacts,
} from '../utils/phoneContacts';

interface PhoneContactInputProps {
  value: string;
  onChange: (val: string) => void;
  onSelectContact: (contact: SavedPhoneContact) => void;
  contacts?: SavedPhoneContact[];
  placeholder?: string;
  required?: boolean;
  type?: 'text' | 'tel';
  inputClassName?: string;
  wrapperClassName?: string;
  leftIcon?: React.ReactNode;
  showContactPickerButton?: boolean;
  accent?: 'purple' | 'blue' | 'emerald' | 'slate';
  openOnFocus?: boolean;
  minCharsToOpen?: number;
  disabled?: boolean;
  title?: string;
}

export const useSavedPhoneContacts = (): SavedPhoneContact[] => {
  const [savedContacts, setSavedContacts] = useState<SavedPhoneContact[]>(() =>
    loadSavedPhoneContacts()
  );

  useEffect(() => {
    return subscribeSavedPhoneContacts(setSavedContacts);
  }, []);

  return savedContacts;
};

export const PhoneContactInput: React.FC<PhoneContactInputProps> = ({
  value,
  onChange,
  onSelectContact,
  contacts,
  placeholder = '03XX-XXXXXXX',
  required = false,
  type = 'tel',
  inputClassName = '',
  wrapperClassName = '',
  leftIcon,
  showContactPickerButton = true,
  accent = 'purple',
  openOnFocus = true,
  minCharsToOpen = 0,
  disabled = false,
  title,
}) => {
  const { showToast } = useToast();
  const savedOnly = useSavedPhoneContacts();
  const effectiveContacts = contacts ?? savedOnly;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const vcfInputRef = useRef<HTMLInputElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [dropdownRect, setDropdownRect] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
  } | null>(null);

  const matched = useMemo(
    () => matchContacts(effectiveContacts, value, 16),
    [effectiveContacts, value]
  );

  const hasPhoneBookContacts = useMemo(
    () => effectiveContacts.some(c => c.source === 'phone'),
    [effectiveContacts]
  );

  const updatePosition = () => {
    const el = wrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || 700;
    const vw = window.innerWidth || 380;
    const spaceBelow = vh - rect.bottom - 10;
    const spaceAbove = rect.top - 10;
    const openUpward = spaceBelow < 180 && spaceAbove > spaceBelow;

    const minReadableWidth = Math.max(rect.width, 250);
    const clampedWidth = Math.min(minReadableWidth, vw - 16);
    const clampedLeft = Math.max(8, Math.min(rect.left, vw - clampedWidth - 8));

    if (openUpward) {
      setDropdownRect({
        left: clampedLeft,
        width: clampedWidth,
        bottom: vh - rect.top + 4,
        maxHeight: Math.min(240, Math.max(120, spaceAbove - 8)),
      });
    } else {
      setDropdownRect({
        left: clampedLeft,
        width: clampedWidth,
        top: rect.bottom + 4,
        maxHeight: Math.min(240, Math.max(120, spaceBelow - 8)),
      });
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handleScrollOrResize = () => updatePosition();
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (wrapperRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [isOpen]);

  const handlePickFromPhoneContacts = async () => {
    const res = await pickDevicePhoneContacts();
    if (res.usedNative) {
      if (res.contacts.length > 0) {
        onSelectContact(res.contacts[0]);
        setIsOpen(false);
        if (res.contacts.length > 1) {
          showToast(
            `${res.contacts.length} phone contacts saved! Ab type karte hi show honge.`,
            'info'
          );
        }
      }
      return;
    }
    if (res.unsupportedOrBlocked) {
      vcfInputRef.current?.click();
    }
  };

  const handleVcfImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const imported = parseVcfContacts(text);
      if (imported.length === 0) {
        showToast('Is .vcf file mein koi phone contact nahi mila', 'warning');
        return;
      }
      mergeAndSavePhoneContacts(imported);
      setIsOpen(true);
      showToast(
        `${imported.length} phone contacts load ho gaye! Ab number likhte hi show honge.`,
        'success'
      );
      inputRef.current?.focus();
    } catch {
      showToast('Contacts file read nahi ho saki', 'warning');
    }
  };

  const accentClasses = {
    purple: {
      btn: 'text-purple-600 hover:bg-purple-50 hover:text-purple-700',
      border: 'border-purple-200',
      rowHover: 'hover:bg-purple-50/80',
      pill: 'bg-purple-600 hover:bg-purple-700 text-white',
      outlinePill: 'bg-white hover:bg-purple-50 text-purple-700 border-purple-200',
    },
    blue: {
      btn: 'text-blue-600 hover:bg-blue-50 hover:text-blue-700',
      border: 'border-blue-200',
      rowHover: 'hover:bg-blue-50/80',
      pill: 'bg-blue-600 hover:bg-blue-700 text-white',
      outlinePill: 'bg-white hover:bg-blue-50 text-blue-700 border-blue-200',
    },
    emerald: {
      btn: 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700',
      border: 'border-emerald-200',
      rowHover: 'hover:bg-emerald-50/80',
      pill: 'bg-emerald-600 hover:bg-emerald-700 text-white',
      outlinePill: 'bg-white hover:bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    slate: {
      btn: 'text-slate-600 hover:bg-slate-100 hover:text-slate-800',
      border: 'border-slate-200',
      rowHover: 'hover:bg-slate-50',
      pill: 'bg-slate-800 hover:bg-slate-900 text-white',
      outlinePill: 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200',
    },
  }[accent];

  const handleFocus = () => {
    if (disabled) return;
    if (openOnFocus && (effectiveContacts.length > 0 || showContactPickerButton)) {
      if (value.trim().length >= minCharsToOpen) {
        updatePosition();
        setIsOpen(true);
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = e.target.value;
    onChange(nextVal);
    if (nextVal.trim().length >= minCharsToOpen) {
      updatePosition();
      setIsOpen(true);
    } else if (!openOnFocus) {
      setIsOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className={`relative ${wrapperClassName}`}>
      <input
        ref={vcfInputRef}
        type="file"
        accept=".vcf,text/vcard,text/x-vcard"
        onChange={handleVcfImport}
        className="hidden"
      />
      {leftIcon}
      <input
        ref={inputRef}
        type={type}
        required={required}
        disabled={disabled}
        value={value}
        onFocus={handleFocus}
        onChange={handleChange}
        onKeyDown={e => {
          if (e.key === 'Escape' && isOpen) {
            e.stopPropagation();
            setIsOpen(false);
          }
        }}
        placeholder={placeholder}
        title={title}
        autoComplete="off"
        className={`${inputClassName} ${showContactPickerButton ? 'pr-8' : ''}`}
      />
      {showContactPickerButton && !disabled && (
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={() => {
            if (!isOpen) {
              updatePosition();
              setIsOpen(true);
            }
            handlePickFromPhoneContacts();
          }}
          title="Pick from Phone Contacts"
          aria-label="Pick from Phone Contacts"
          className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-lg transition cursor-pointer ${accentClasses.btn}`}
        >
          <BookUser className="w-3.5 h-3.5" />
        </button>
      )}

      {isOpen &&
        dropdownRect &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: 'fixed',
              left: dropdownRect.left,
              width: dropdownRect.width,
              top: dropdownRect.top,
              bottom: dropdownRect.bottom,
              zIndex: 9999,
            }}
            className={`bg-white border ${accentClasses.border} rounded-xl shadow-2xl overflow-hidden flex flex-col`}
          >
            <div
              style={{ maxHeight: dropdownRect.maxHeight }}
              className="overflow-y-auto divide-y divide-slate-100"
            >
              {matched.length === 0 ? (
                <div className="px-3 py-2.5 text-center space-y-1">
                  <p className="text-[11px] font-semibold text-slate-500">
                    {value.trim()
                      ? `"${value.trim()}" ke liye koi contact nahi mila`
                      : 'Phone contacts load karne ke liye neeche button dabaye'}
                  </p>
                </div>
              ) : (
                matched.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => {
                      onSelectContact(c);
                      setIsOpen(false);
                    }}
                    className={`w-full px-3 py-2 flex items-center justify-between gap-2 text-left transition cursor-pointer ${accentClasses.rowHover}`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5">
                        <span className="truncate">{c.name}</span>
                        {c.alreadyInKhata && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 text-[9px] font-bold shrink-0">
                            <CheckCircle2 className="w-2.5 h-2.5" /> Khata
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-600 tabular-nums truncate">
                        {c.phone || 'No number'}
                        {c.phone2 ? ` · ${c.phone2}` : ''}
                      </p>
                    </div>
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
                      {c.source === 'phone'
                        ? 'Phone'
                        : c.source === 'khata'
                        ? 'Khata'
                        : c.source === 'supplier'
                        ? 'Party'
                        : c.source === 'sale'
                        ? 'Sale'
                        : 'Stock'}
                    </span>
                  </button>
                ))
              )}
            </div>

            {showContactPickerButton && (
              <div className="px-2.5 py-1.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-1.5 shrink-0">
                <span className="text-[10px] font-semibold text-slate-500 truncate">
                  {hasPhoneBookContacts
                    ? `${effectiveContacts.filter(c => c.source === 'phone').length} Phone Contacts`
                    : 'Phone Contacts'}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={handlePickFromPhoneContacts}
                    className={`px-2 py-1 rounded-lg font-bold text-[10px] flex items-center gap-1 transition cursor-pointer ${accentClasses.pill}`}
                  >
                    <Phone className="w-2.5 h-2.5" />
                    <span>Phone Contacts</span>
                  </button>
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => vcfInputRef.current?.click()}
                    className={`px-2 py-1 rounded-lg border font-bold text-[10px] flex items-center gap-1 transition cursor-pointer ${accentClasses.outlinePill}`}
                    title="Import Phone Contacts (.vcf)"
                  >
                    <Upload className="w-2.5 h-2.5" />
                    <span>.vcf</span>
                  </button>
                </div>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};
