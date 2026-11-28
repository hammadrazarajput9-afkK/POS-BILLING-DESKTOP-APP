import { InventoryItem, KhataCustomer, SaleRecord, SupplierPurchase } from '../types';
import { smartMatch } from './smartSearch';

export interface SavedPhoneContact {
  id: string;
  name: string;
  phone: string;
  phone2?: string;
  address?: string;
  source: 'phone' | 'sale' | 'supplier' | 'khata' | 'stock';
  alreadyInKhata?: boolean;
  khataId?: string;
}

export const PHONE_CONTACTS_STORAGE_KEY = 'mobile_pos_saved_phone_contacts_v1';
const CONTACTS_UPDATED_EVENT = 'pos-phone-contacts-updated';

export const normalizeContactPhone = (raw: string): string => {
  const cleaned = raw.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+92')) return `0${cleaned.slice(3)}`;
  if (cleaned.startsWith('0092')) return `0${cleaned.slice(4)}`;
  return cleaned;
};

export const normalizePhoneDigits = (raw: string): string => {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0092')) return `0${digits.slice(4)}`;
  if (digits.startsWith('92') && digits.length >= 11) return `0${digits.slice(2)}`;
  return digits;
};

export const loadSavedPhoneContacts = (): SavedPhoneContact[] => {
  try {
    const raw = localStorage.getItem(PHONE_CONTACTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const persistSavedPhoneContacts = (contacts: SavedPhoneContact[]): void => {
  try {
    localStorage.setItem(PHONE_CONTACTS_STORAGE_KEY, JSON.stringify(contacts.slice(0, 3000)));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(CONTACTS_UPDATED_EVENT));
    }
  } catch {
    // Ignore storage quota errors
  }
};

export const mergeAndSavePhoneContacts = (incoming: SavedPhoneContact[]): SavedPhoneContact[] => {
  const existing = loadSavedPhoneContacts();
  const seen = new Set<string>();
  const merged: SavedPhoneContact[] = [];

  for (const c of [...incoming, ...existing]) {
    if (!c) continue;
    const normPhone = normalizeContactPhone(c.phone || '');
    const key = normalizePhoneDigits(normPhone || c.phone || '') || `name_${(c.name || '').trim().toLowerCase()}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push({
      ...c,
      name: (c.name || normPhone || 'Contact').trim(),
      phone: normPhone || c.phone || '',
      source: c.source || 'phone',
    });
  }

  persistSavedPhoneContacts(merged);
  return merged;
};

export const subscribeSavedPhoneContacts = (
  listener: (contacts: SavedPhoneContact[]) => void
): (() => void) => {
  if (typeof window === 'undefined') return () => {};
  const handleUpdate = () => listener(loadSavedPhoneContacts());
  const handleStorage = (e: StorageEvent) => {
    if (e.key === PHONE_CONTACTS_STORAGE_KEY) {
      listener(loadSavedPhoneContacts());
    }
  };
  window.addEventListener(CONTACTS_UPDATED_EVENT, handleUpdate);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(CONTACTS_UPDATED_EVENT, handleUpdate);
    window.removeEventListener('storage', handleStorage);
  };
};

export const parseVcfContacts = (vcfText: string): SavedPhoneContact[] => {
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

export const supportsNativeContactPicker = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const navAny = navigator as Navigator & {
    contacts?: { select?: unknown };
  };
  return Boolean(navAny.contacts && typeof navAny.contacts.select === 'function');
};

export async function pickDevicePhoneContacts(): Promise<{
  contacts: SavedPhoneContact[];
  usedNative: boolean;
  cancelled: boolean;
  unsupportedOrBlocked: boolean;
}> {
  const navAny = navigator as Navigator & {
    contacts?: {
      select: (
        properties: string[],
        options?: { multiple?: boolean }
      ) => Promise<Array<{ name?: string[]; tel?: string[]; address?: Array<{ addressLine?: string[] }> }>>;
    };
  };

  if (!navAny?.contacts || typeof navAny.contacts.select !== 'function') {
    return { contacts: [], usedNative: false, cancelled: false, unsupportedOrBlocked: true };
  }

  try {
    const picked = await navAny.contacts.select(['name', 'tel', 'address'], {
      multiple: true,
    });
    if (!picked || picked.length === 0) {
      return { contacts: [], usedNative: true, cancelled: true, unsupportedOrBlocked: false };
    }
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
      mergeAndSavePhoneContacts(parsedPicked);
    }
    return {
      contacts: parsedPicked,
      usedNative: true,
      cancelled: parsedPicked.length === 0,
      unsupportedOrBlocked: false,
    };
  } catch {
    return { contacts: [], usedNative: false, cancelled: false, unsupportedOrBlocked: true };
  }
}

export function buildMergedContactDirectory(params: {
  savedPhoneContacts?: SavedPhoneContact[];
  khata?: KhataCustomer[];
  supplierPurchases?: SupplierPurchase[];
  sales?: SaleRecord[];
  inventory?: InventoryItem[];
}): SavedPhoneContact[] {
  const {
    savedPhoneContacts = [],
    khata = [],
    supplierPurchases = [],
    sales = [],
    inventory = [],
  } = params;

  const khataByDigits = new Map<string, KhataCustomer>();
  for (const k of khata) {
    const d = normalizePhoneDigits(k.phone || '');
    if (d) khataByDigits.set(d, k);
    const d2 = normalizePhoneDigits(k.phone2 || '');
    if (d2 && !khataByDigits.has(d2)) khataByDigits.set(d2, k);
  }

  const seen = new Set<string>();
  const list: SavedPhoneContact[] = [];

  const pushContact = (c: SavedPhoneContact) => {
    const normPhone = normalizeContactPhone(c.phone || '');
    const digits = normalizePhoneDigits(normPhone || c.phone || '');
    const key = digits || `name_${(c.name || '').trim().toLowerCase()}`;
    if (!key || seen.has(key)) return;
    seen.add(key);

    const linkedKhata = c.khataId
      ? khata.find(k => k.id === c.khataId)
      : digits
      ? khataByDigits.get(digits)
      : undefined;

    list.push({
      ...c,
      name: (c.name || normPhone || 'Contact').trim(),
      phone: normPhone || c.phone || '',
      khataId: linkedKhata?.id || c.khataId,
      alreadyInKhata: Boolean(linkedKhata) || c.source === 'khata',
    });
  };

  for (const pc of savedPhoneContacts) {
    pushContact(pc);
  }

  for (const k of khata) {
    pushContact({
      id: `khata_${k.id}`,
      name: k.name,
      phone: k.phone,
      phone2: k.phone2,
      address: k.address,
      source: 'khata',
      alreadyInKhata: true,
      khataId: k.id,
    });
  }

  for (const p of supplierPurchases) {
    if (p.status === 'REVERSED') continue;
    const sName = (p.partyName || '').trim();
    const sPhone = (p.partyPhone || '').trim();
    if (!sName && !sPhone) continue;
    pushContact({
      id: `sup_${p.id}`,
      name: sName || sPhone,
      phone: sPhone,
      source: 'supplier',
    });
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

  for (const item of inventory) {
    const selName = (item.purchasedFrom || '').trim();
    const selPhone = (item.purchasedPhone || '').trim();
    if (!selName && !selPhone) continue;
    pushContact({
      id: `stk_${item.id}`,
      name: selName || selPhone,
      phone: selPhone,
      source: 'stock',
    });
  }

  return list;
}

export function matchContacts(
  contacts: SavedPhoneContact[],
  query: string,
  limit = 15
): SavedPhoneContact[] {
  const q = query.trim();
  if (!q) return contacts.slice(0, limit);

  const qDigits = normalizePhoneDigits(q);
  const rawQDigits = q.replace(/\D/g, '');

  return contacts
    .filter(c => {
      if (smartMatch(q, [c.name, c.phone, c.phone2, c.address])) return true;
      if (qDigits.length >= 2 || rawQDigits.length >= 2) {
        const p1 = normalizePhoneDigits(c.phone || '');
        const p2 = normalizePhoneDigits(c.phone2 || '');
        const r1 = (c.phone || '').replace(/\D/g, '');
        const r2 = (c.phone2 || '').replace(/\D/g, '');
        if (qDigits && (p1.includes(qDigits) || p2.includes(qDigits))) return true;
        if (rawQDigits && (r1.includes(rawQDigits) || r2.includes(rawQDigits))) return true;
      }
      return false;
    })
    .slice(0, limit);
}
