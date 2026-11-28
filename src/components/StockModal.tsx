import React, { useState, useEffect, useRef, useMemo } from 'react';
import { InventoryItem, MobileVariant, ImeiRecord, SaleRecord, StockAdjustment, StockAdjustmentReason } from '../types';
import {
  X,
  Package,
  Barcode,
  Hash,
  Upload,
  Image as ImageIcon,
  Plus,
  Trash2,
  Smartphone,
  Check,
  Camera,
  Copy,
  Layers,
  Sparkles,
  TrendingUp,
  Cpu,
  HardDrive,
  Palette,
  AlertTriangle,
  Edit2,
  FileText,
  ChevronDown,
  ShieldCheck,
  User,
  Wrench
} from 'lucide-react';
import { useToast } from './Toast';
import { useFormDraft } from '../hooks/useFormDraft';
import { CameraCaptureModal } from './CameraCaptureModal';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import {
  validateImeis,
  extractItemImeis,
  distributeImeiInput,
  getActiveSoldImeiMap,
  isUsedCategory,
  MAX_SINGLE_IMEI_LENGTH,
} from '../utils/imeiManager';
import { KhataCustomer, SupplierPurchase } from '../types';
import { buildMergedContactDirectory } from '../utils/phoneContacts';
import { PhoneContactInput, useSavedPhoneContacts } from './PhoneContactInput';

export interface StockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    item: Omit<InventoryItem, 'id' | 'createdAt'> | Omit<InventoryItem, 'id' | 'createdAt'>[],
    existingId?: string,
    adjustment?: {
      reason: StockAdjustmentReason | string;
      notes?: string;
    }
  ) => void;
  editItem?: InventoryItem | null;
  currency: string;
  categories: string[];
  inventory?: InventoryItem[];
  imeiRecords?: ImeiRecord[];
  sales?: SaleRecord[];
  salesReturns?: import('../types').SalesReturnRecord[];
  onAddCategory: (categoryName: string) => void;
  onRenameCategory?: (oldName: string, newName: string) => boolean;
  onStockAdjustment?: (
    adjustment: Omit<StockAdjustment, 'id' | 'adjustedAt'>
  ) => void;
  isAdmin?: boolean;
  allowCostEntry?: boolean;
  initialCategory?: string;
  khata?: KhataCustomer[];
  supplierPurchases?: SupplierPurchase[];
}

interface StockDraftState {
  name: string;
  category: string;
  image: string;
  barcode: string;
  costPrice: number | '';
  salePrice: number | '';
  qty: number | '';
  imeis: string[];
  note?: string;
  variants: MobileVariant[];
}

const RAM_OPTIONS = ['3GB', '4GB', '6GB', '8GB', '12GB', '16GB', '24GB'];
const STORAGE_OPTIONS = ['32GB', '64GB', '128GB', '256GB', '512GB', '1TB'];
export const CONDITION_OPTIONS = [
  '10/10',
  '10/9',
  '10/8',
  '10/7',
  '10/6',
  '10/5',
  'Some Part Broke',
  'Internal Issues',
  'Repairable',
] as const;

const isUsedCategoryName = (cat?: string): boolean => {
  const c = (cat || '').toLowerCase();
  return c.includes('used') || c.includes('second') || c.includes('pre-owned') || c.includes('refurbished');
};

const getConditionBadgeStyle = (cond?: string) => {
  if (!cond) return 'bg-slate-100 text-slate-600 border-slate-200';
  if (cond === '10/10' || cond === '10/9' || cond === '10/8') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (cond === '10/7' || cond === '10/6' || cond === '10/5') {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  if (cond === 'Repairable') {
    return 'bg-rose-50 text-rose-700 border-rose-300';
  }
  return 'bg-orange-50 text-orange-700 border-orange-200';
};

const createDefaultVariant = (id: string, ram = '4GB', storage = '64GB'): MobileVariant => ({
  id,
  ram,
  storage,
  color: '',
  costPrice: '',
  wholesalePrice: '',
  salePrice: '',
  qty: '',
  imeis: [''],
  note: '',
  condition: '',
});

const initialStockDraft: StockDraftState = {
  name: '',
  category: 'Android Mobile',
  image: '',
  barcode: '',
  costPrice: '',
  salePrice: '',
  qty: '',
  imeis: [''],
  note: '',
  variants: [createDefaultVariant('var-1', '4GB', '64GB')],
};

const LAST_SELECTED_CAT_KEY = 'mobile_pos_last_selected_category';

export const getLastSelectedCategory = (categories: string[]): string => {
  try {
    const saved = localStorage.getItem(LAST_SELECTED_CAT_KEY);
    if (saved && categories && categories.includes(saved)) {
      return saved;
    }
  } catch {
    // ignore
  }
  if (categories && categories.length > 0) {
    return categories[0];
  }
  return 'Keypad Phone';
};

export const isAndroidCategory = (cat: string): boolean => {
  if (!cat) return false;
  const c = cat.toLowerCase().trim();
  // Exclude non-phone, gadget, wearable & keypad categories first
  if (
    c.includes('keypad') ||
    c.includes('feature') ||
    c.includes('button') ||
    c.includes('bar phone') ||
    c.includes('accessory') ||
    c.includes('accessories') ||
    c.includes('charger') ||
    c.includes('cable') ||
    c.includes('audio') ||
    c.includes('airpod') ||
    c.includes('earbud') ||
    c.includes('earphone') ||
    c.includes('headset') ||
    c.includes('handsfree') ||
    c.includes('hands-free') ||
    c.includes('handfree') ||
    c.includes('headphone') ||
    c.includes('neckband') ||
    c.includes('tws') ||
    c.includes('buds') ||
    c.includes('speaker') ||
    c.includes('powerbank') ||
    c.includes('power bank') ||
    c.includes('battery') ||
    c.includes('repair') ||
    c.includes('part') ||
    c.includes('cover') ||
    c.includes('case') ||
    c.includes('pouch') ||
    c.includes('glass') ||
    c.includes('protector') ||
    c.includes('guard') ||
    c.includes('temper') ||
    c.includes('skin') ||
    c.includes('sheet') ||
    c.includes('stand') ||
    c.includes('holder') ||
    c.includes('mount') ||
    c.includes('tripod') ||
    c.includes('ring') ||
    c.includes('light') ||
    c.includes('selfie') ||
    c.includes('stylus') ||
    c.includes('mic') ||
    c.includes('adapter') ||
    c.includes('otg') ||
    c.includes('usb') ||
    c.includes('pendrive') ||
    c.includes('flash') ||
    c.includes('memory') ||
    c.includes('card') ||
    c.includes('watch') ||
    c.includes('band') ||
    c.includes('tablet') ||
    c.includes('ipad') ||
    c.includes('laptop') ||
    c.includes('gadget') ||
    c.includes('router') ||
    c.includes('modem') ||
    c.includes('dongle') ||
    c.includes('lcd') ||
    c.includes('panel') ||
    c.includes('folder') ||
    c.includes('touch') ||
    c.includes('tool') ||
    c.includes('sim')
  ) {
    return false;
  }
  return (
    c.includes('android') ||
    c.includes('smartphone') ||
    (c.includes('smart') && c.includes('mobile')) ||
    c.includes('used') ||
    c.includes('second hand') ||
    c.includes('pre-owned') ||
    c.includes('refurbished') ||
    c.includes('iphone') ||
    c.includes('box pack') ||
    c.includes('mobile') ||
    c.includes('phone')
  );
};

export const isKeypadCategory = (cat: string): boolean => {
  if (!cat) return false;
  const c = cat.toLowerCase().trim();
  if (
    c.includes('android') ||
    c.includes('smart') ||
    c.includes('smartphone') ||
    c.includes('accessory') ||
    c.includes('accessories') ||
    c.includes('charger') ||
    c.includes('cable') ||
    c.includes('audio') ||
    c.includes('headphone') ||
    c.includes('earphone') ||
    c.includes('handsfree') ||
    c.includes('hands-free') ||
    c.includes('cover') ||
    c.includes('case') ||
    c.includes('glass') ||
    c.includes('watch') ||
    c.includes('tablet') ||
    c.includes('stand') ||
    c.includes('holder') ||
    c.includes('repair')
  ) {
    return false;
  }
  return c.includes('keypad') || c.includes('feature') || c.includes('button') || c.includes('bar phone');
};

export const isMobileCategory = (cat: string): boolean => {
  if (!cat) return false;
  return isAndroidCategory(cat) || isKeypadCategory(cat);
};

export const StockModal: React.FC<StockModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editItem,
  currency,
  categories,
  inventory = [],
  imeiRecords = [],
  sales = [],
  salesReturns = [],
  onAddCategory,
  onRenameCategory,
  onStockAdjustment,
  isAdmin = true,
  allowCostEntry = false,
  initialCategory,
  khata = [],
  supplierPurchases = [],
}) => {
  const canSeeCostAndWholesale = true;
  const canSeeProfitSummary = isAdmin;
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const savedPhoneContacts = useSavedPhoneContacts();
  const mergedSellerContacts = useMemo(
    () =>
      buildMergedContactDirectory({
        savedPhoneContacts,
        khata,
        supplierPurchases,
        sales,
        inventory,
      }),
    [savedPhoneContacts, khata, supplierPurchases, sales, inventory]
  );

  const [draftData, setDraftData, resetDraft] = useFormDraft<StockDraftState>(
    'stock_add_modal_form_v2',
    initialStockDraft
  );

  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>('Android Mobile');
  const [image, setImage] = useState<string>('');
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false);
  const [barcodeScanCallback, setBarcodeScanCallback] = useState<((code: string) => void) | null>(null);
  const [barcodeScanTitle, setBarcodeScanTitle] = useState('Scan Barcode / IMEI');

  const openBarcodeScanner = (title: string, onScanned: (code: string) => void) => {
    setBarcodeScanTitle(title);
    setBarcodeScanCallback(() => onScanned);
    setBarcodeScannerOpen(true);
  };

  // Non-mobile or single edit fields
  const [barcode, setBarcode] = useState('');
  const [costPrice, setCostPrice] = useState<number | ''>('');
  const [salePrice, setSalePrice] = useState<number | ''>('');
  const [wholesalePrice, setWholesalePrice] = useState<number | ''>('');
  const [boxSize, setBoxSize] = useState<number | ''>(10);
  const [qty, setQty] = useState<number | ''>('');
  const [color, setColor] = useState('');
  const [itemNote, setItemNote] = useState('');
  const [itemCondition, setItemCondition] = useState('');
  const [purchasedFrom, setPurchasedFrom] = useState('');
  const [purchasedPhone, setPurchasedPhone] = useState('');
  const [openConditionDropdown, setOpenConditionDropdown] = useState<string | null>(null);
  const [imeis, setImeis] = useState<string[]>(['']);

  // Stock Adjustment state for edit quantity changes
  const [adjustmentReason, setAdjustmentReason] = useState<StockAdjustmentReason>('Stock Correction');
  const [adjustmentNotes, setAdjustmentNotes] = useState('');

  // Multi-variant list for Android Mobile & mobile categories
  const [variants, setVariants] = useState<MobileVariant[]>([
    createDefaultVariant('var-1', '4GB', '64GB'),
  ]);

  // Category creation / rename inline state
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [editCategoryName, setEditCategoryName] = useState('');

  // Track initial mount / modal open to prevent circular draft sync loops
  const prevIsOpenRef = useRef(false);
  const prevEditItemRef = useRef<InventoryItem | null | undefined>(undefined);
  const isEditingRef = useRef(false);

  useEffect(() => {
    // Only synchronize state when modal transitions from closed to open, or when editItem changes
    const justOpened = isOpen && !prevIsOpenRef.current;
    const editItemChanged = editItem !== prevEditItemRef.current;

    if (isOpen && (justOpened || editItemChanged)) {
      prevEditItemRef.current = editItem;
      if (editItem) {
        isEditingRef.current = true;
        // Clean base name without parenthetical specs or color (e.g. "Infinix Note 40 (Black)" -> "Infinix Note 40")
        const cleanBaseName = editItem.name.replace(/\s*\([^)]*\)\s*$/, '').trim();
        setName(cleanBaseName || editItem.name);
        const cleanCat = (editItem.category || '').trim();
        const resolvedEditCategory =
          !cleanCat
            ? categories[0] || ''
            : categories.find(c => c === cleanCat) ||
              categories.find(c => c.trim().toLowerCase() === cleanCat.toLowerCase()) ||
              (isKeypadCategory(cleanCat) ? categories.find(c => isKeypadCategory(c)) : undefined) ||
              (isAndroidCategory(cleanCat) ? categories.find(c => isAndroidCategory(c)) : undefined) ||
              cleanCat;
        setCategory(resolvedEditCategory);
        setImage(editItem.image || '');
        setBarcode(editItem.barcode || '');
        setCostPrice(editItem.costPrice);
        setSalePrice(editItem.salePrice);
        setWholesalePrice(editItem.wholesalePrice !== undefined ? editItem.wholesalePrice : '');
        setBoxSize(editItem.boxSize !== undefined ? editItem.boxSize : 10);
        setQty(editItem.qty);
        setColor(editItem.color || '');
        setItemNote(editItem.note || '');
        setItemCondition(editItem.condition || '');
        setPurchasedFrom(editItem.purchasedFrom || '');
        setPurchasedPhone(editItem.purchasedPhone || '');
        setOpenConditionDropdown(null);

        const existingImeis = editItem.imeis && editItem.imeis.length > 0
          ? [...editItem.imeis]
          : editItem.imei
          ? editItem.imei.split(',').map(s => s.trim()).filter(Boolean)
          : [];

        if (existingImeis.length > 0) {
          setImeis(existingImeis);
        } else {
          const q = Math.max(1, editItem.qty || 1);
          setImeis(Array(q).fill(''));
        }

        if (
          (isAndroidCategory(resolvedEditCategory) || isKeypadCategory(resolvedEditCategory)) &&
          editItem.variants &&
          editItem.variants.length > 0
        ) {
          setVariants(
            editItem.variants.map(v => ({
              ...v,
              note: v.note || '',
              condition: v.condition || editItem.condition || '',
              costPrice: v.autoCostPrice ? '' : v.costPrice,
              wholesalePrice: v.autoWholesalePrice
                ? ''
                : v.wholesalePrice !== undefined
                ? v.wholesalePrice
                : '',
              salePrice: v.autoSalePrice ? '' : v.salePrice,
              imeis: v.imeis && v.imeis.length > 0 ? [...v.imeis] : Array(Math.max(1, Number(v.qty) || 1)).fill(''),
            }))
          );
        } else if (isMobileCategory(resolvedEditCategory)) {
          // If mobile category without variants, seed the current item as Variant #1
          const parenMatch = editItem.name.match(/\(([^)]+)\)/);
          const parenColor = parenMatch ? parenMatch[1].trim() : '';
          setVariants([{
            id: 'var-1',
            ram: editItem.ram || (isKeypadCategory(resolvedEditCategory) ? '' : '6GB'),
            storage: editItem.storage || (isKeypadCategory(resolvedEditCategory) ? '' : '128GB'),
            color: editItem.color || parenColor || '',
            note: editItem.note || '',
            condition: editItem.condition || '',
            costPrice: editItem.costPrice,
            wholesalePrice: editItem.wholesalePrice !== undefined ? editItem.wholesalePrice : '',
            salePrice: editItem.salePrice,
            qty: editItem.qty || 1,
            imeis: existingImeis.length > 0 ? existingImeis : [''],
          }]);
        } else {
          setVariants([createDefaultVariant('var-1', '', '')]);
        }
      } else {
        isEditingRef.current = false;
        const resolvedInitialCat = initialCategory
          ? categories.find(c => c.trim().toLowerCase() === initialCategory.trim().toLowerCase()) || initialCategory
          : getLastSelectedCategory(categories);
        if (initialCategory && !categories.some(c => c.trim().toLowerCase() === initialCategory.trim().toLowerCase())) {
          onAddCategory(initialCategory);
        }
        const hasMeaningfulDraft = Boolean(
          (draftData.name && draftData.name.trim()) ||
          draftData.costPrice !== '' ||
          draftData.salePrice !== ''
        );
        setName(draftData.name || '');
        setCategory(resolvedInitialCat);
        setImage(draftData.image || '');
        setBarcode(draftData.barcode || '');
        setCostPrice(draftData.costPrice !== undefined ? draftData.costPrice : '');
        setSalePrice(draftData.salePrice !== undefined ? draftData.salePrice : '');
        setWholesalePrice('');
        setBoxSize(10);
        setQty(hasMeaningfulDraft && draftData.qty !== undefined ? draftData.qty : '');
        setColor('');
        setItemNote(draftData.note || '');
        setItemCondition('');
        setPurchasedFrom('');
        setPurchasedPhone('');
        setOpenConditionDropdown(null);
        setImeis(draftData.imeis && draftData.imeis.length > 0 ? [...draftData.imeis] : ['']);

        if (hasMeaningfulDraft && draftData.variants && draftData.variants.length > 0 && isAndroidCategory(resolvedInitialCat)) {
          setVariants(
            draftData.variants.map(v => ({
              ...v,
              note: v.note || '',
              condition: v.condition || '',
              costPrice: v.autoCostPrice ? '' : v.costPrice,
              wholesalePrice: v.autoWholesalePrice ? '' : v.wholesalePrice,
              salePrice: v.autoSalePrice ? '' : v.salePrice,
              imeis: [...(v.imeis || [''])],
            }))
          );
        } else {
          const isAndroidLast = isAndroidCategory(resolvedInitialCat);
          setVariants([createDefaultVariant('var-1', isAndroidLast ? '6GB' : '', isAndroidLast ? '128GB' : '')]);
        }
      }
      setIsCreatingCategory(false);
      setNewCategoryName('');
    }
    prevIsOpenRef.current = isOpen;
    prevEditItemRef.current = editItem;
  }, [isOpen, editItem, categories, initialCategory]);

  // Intercept hardware/navigation Back button while StockModal is topmost
  useEffect(() => {
    if (!isOpen) return;
    const handleHardwareBack = (e: Event) => {
      if (isCameraOpen || barcodeScannerOpen) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('pos-hardware-back', handleHardwareBack);
    return () => window.removeEventListener('pos-hardware-back', handleHardwareBack);
  }, [isOpen, isCameraOpen, barcodeScannerOpen, onClose]);

  // Debounced draft save to avoid freezing during high-speed barcode scanning
  const draftTimerRef = useRef<any>(null);
  useEffect(() => {
    if (!isOpen || editItem) return;

    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
    }

    draftTimerRef.current = setTimeout(() => {
      setDraftData({
        name,
        category,
        image,
        barcode,
        costPrice,
        salePrice,
        qty,
        imeis,
        note: itemNote,
        variants,
      });
    }, 400);

    return () => {
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current);
      }
    };
  }, [name, category, image, barcode, costPrice, salePrice, qty, imeis, itemNote, variants, editItem, isOpen, setDraftData]);

  const isAndroid = isAndroidCategory(category);
  const isKeypad = isKeypadCategory(category);
  const isMobile = isMobileCategory(category);
  const showVariantMode = isAndroid || isKeypad;

  useEffect(() => {
    if (isEditingRef.current) return;
    if (isKeypad) {
      setVariants(prev => prev.map(v => ({
        ...v,
        ram: '',
        storage: '',
        color: v.color || ''
      })));
    } else if (isAndroid) {
      setVariants(prev => prev.map(v => ({
        ...v,
        ram: v.ram || '6GB',
        storage: v.storage || '128GB'
      })));
    }
  }, [category]);

  // Build sets of all existing database IMEIs for real-time validation and cross-checking
  const existingDbImeis = useMemo(() => {
    const invMap = new Map<string, string>(); // lowercase imei -> product name

    for (const item of inventory) {
      if (editItem && item.id === editItem.id) continue;
      if (item.status === 'ARCHIVED') continue;
      const itemImeis = extractItemImeis(item);
      for (const im of itemImeis) {
        invMap.set(im.toLowerCase(), item.name);
      }
    }

    const activeSold = getActiveSoldImeiMap({ imeiRecords, sales, salesReturns });
    const soldMap = new Map<string, string>();
    const editOwnedSet = new Set(
      (editItem ? extractItemImeis(editItem) : []).map(i => i.trim().toLowerCase()).filter(Boolean)
    );
    activeSold.forEach((info, lowerImei) => {
      if (!editOwnedSet.has(lowerImei)) {
        soldMap.set(lowerImei, info.invoiceNo || 'Sold Record');
      }
    });

    const returnsMap = new Map<string, string>();
    for (const ret of salesReturns) {
      for (const item of ret.items) {
        const itemImeis = extractItemImeis(item);
        for (const im of itemImeis) {
          returnsMap.set(im.toLowerCase(), ret.returnNo);
        }
      }
    }

    return { invMap, soldMap, returnsMap };
  }, [inventory, imeiRecords, sales, salesReturns, editItem]);

  // Compute duplicate frequencies within current modal inputs (across all variants)
  const currentModalImeiCounts = useMemo(() => {
    const counts = new Map<string, { count: number; variantIndices: number[] }>();
    variants.forEach((v, vIdx) => {
      (v.imeis || []).forEach(im => {
        const clean = (im || '').trim().toLowerCase();
        if (clean) {
          const entry = counts.get(clean) || { count: 0, variantIndices: [] };
          entry.count += 1;
          if (!entry.variantIndices.includes(vIdx + 1)) {
            entry.variantIndices.push(vIdx + 1);
          }
          counts.set(clean, entry);
        }
      });
    });
    return counts;
  }, [variants]);

  // Helper to get real-time validation error for a specific variant IMEI input
  const getVariantImeiError = (imeiVal: string, currentVariantIdx: number): string | null => {
    const clean = (imeiVal || '').trim().toLowerCase();
    if (!clean) return null;

    const modalEntry = currentModalImeiCounts.get(clean);
    if (modalEntry && modalEntry.count > 1) {
      const otherVariants = modalEntry.variantIndices.filter((vi: number) => vi !== currentVariantIdx + 1);
      if (otherVariants.length > 0) {
        return `Duplicate: Also entered in Variant #${otherVariants.join(', #')}`;
      }
      return 'Duplicate IMEI in this variant!';
    }
    if (existingDbImeis.invMap.has(clean)) {
      return `Already in inventory (${existingDbImeis.invMap.get(clean)})`;
    }
    if (existingDbImeis.soldMap.has(clean)) {
      return `Already sold on Invoice #${existingDbImeis.soldMap.get(clean)}`;
    }
    return null;
  };

  // Helper to get real-time validation error for a single-mode IMEI input
  const getSingleImeiError = (imeiVal: string, currentIdx: number): string | null => {
    const clean = (imeiVal || '').trim().toLowerCase();
    if (!clean) return null;
    const dupIdx = imeis.findIndex((other, oIdx) => oIdx !== currentIdx && (other || '').trim().toLowerCase() === clean);
    if (dupIdx >= 0) {
      return `Duplicate IMEI in Box #${dupIdx + 1}`;
    }
    if (existingDbImeis.invMap.has(clean)) {
      return `Already in inventory (${existingDbImeis.invMap.get(clean)})`;
    }
    if (existingDbImeis.soldMap.has(clean)) {
      return `Already sold on Invoice #${existingDbImeis.soldMap.get(clean)}`;
    }
    return null;
  };

  // Variant helper functions
  const handleAddVariant = () => {
    const lastVar = variants[variants.length - 1];
    let nextRam = isKeypad ? '' : '6GB';
    let nextStorage = isKeypad ? '' : '128GB';

    if (lastVar && isAndroid) {
      if (lastVar.ram === '4GB') nextRam = '6GB';
      else if (lastVar.ram === '6GB') nextRam = '8GB';
      else if (lastVar.ram === '8GB') nextRam = '12GB';
      else nextRam = lastVar.ram;

      if (lastVar.storage === '64GB') nextStorage = '128GB';
      else if (lastVar.storage === '128GB') nextStorage = '256GB';
      else if (lastVar.storage === '256GB') nextStorage = '512GB';
      else nextStorage = lastVar.storage;
    }

    // Keep price inputs EMPTY so suggested values (when RAM & Storage match) only appear faintly as placeholders
    const newVar: MobileVariant = {
      id: 'var-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5),
      ram: nextRam,
      storage: nextStorage,
      color: '',
      costPrice: '',
      wholesalePrice: '',
      salePrice: '',
      autoCostPrice: false,
      autoWholesalePrice: false,
      autoSalePrice: false,
      qty: '',
      imeis: [''],
      note: '',
    };

    setVariants(prev => [...prev, newVar]);
    showToast(isKeypad ? `Color Variant #${variants.length + 1} added` : `Variant #${variants.length + 1} added`, 'info');
  };

  const handleDuplicateVariant = (idx: number) => {
    const source = variants[idx];
    const newQty = Math.max(1, Number(source.qty) || 1);
    const newVar: MobileVariant = {
      id: 'var-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5),
      ram: source.ram,
      storage: source.storage,
      color: source.color ? `${source.color} (Copy)` : '',
      costPrice: '',
      wholesalePrice: '',
      salePrice: '',
      autoCostPrice: false,
      autoWholesalePrice: false,
      autoSalePrice: false,
      qty: newQty,
      imeis: Array(newQty).fill(''),
      note: source.note || '',
    };

    setVariants(prev => {
      const copy = [...prev];
      copy.splice(idx + 1, 0, newVar);
      return copy;
    });
    showToast('Variant duplicated with new empty IMEIs', 'info');
  };

  const handleRemoveVariant = (idx: number) => {
    if (variants.length <= 1) {
      showToast('At least one variant is required for mobile phones', 'warning');
      return;
    }
    setVariants(prev => prev.filter((_, i) => i !== idx));
    showToast('Variant removed', 'info');
  };

  const handleUpdateVariantField = (idx: number, field: keyof MobileVariant, value: any) => {
    setVariants(prev => {
      const copy = prev.map(v => ({ ...v }));
      copy[idx][field] = value as never;

      if (field === 'costPrice') copy[idx].autoCostPrice = false;
      if (field === 'wholesalePrice') copy[idx].autoWholesalePrice = false;
      if (field === 'salePrice') copy[idx].autoSalePrice = false;

      return copy;
    });
  };

  // Critical requirement: When Variant quantity changes, dynamically match IMEIs count exactly!
  const handleVariantQtyChange = (idx: number, val: number | '') => {
    setVariants(prev => {
      const copy = [...prev];
      const target = { ...copy[idx] };
      target.qty = val;
      const targetCount = val === '' ? 1 : Math.max(1, Math.min(100, Math.floor(Number(val))));
      const curImeis = target.imeis || [];
      const nextImeis = [...curImeis];
      while (nextImeis.length < targetCount) nextImeis.push('');
      target.imeis = nextImeis.slice(0, targetCount);
      copy[idx] = target;
      return copy;
    });
  };

  const focusElementSafely = (id: string) => {
    setTimeout(() => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (el) el.focus();
    }, 0);
  };

  const handleVariantImeiChange = (variantIdx: number, imeiIdx: number, rawValue: string) => {
    const curVariantImeis = variants[variantIdx]?.imeis || [''];
    const result = distributeImeiInput({
      rawValue,
      currentImeis: curVariantImeis,
      targetIndex: imeiIdx,
    });

    setVariants(prev => {
      const copy = [...prev];
      const target = { ...copy[variantIdx] };
      target.imeis = result.nextImeis;
      copy[variantIdx] = target;
      return copy;
    });

    if (result.overflowCount > 0) {
      showToast('1 box = 1 IMEI only! Increase Qty to add more IMEI boxes.', 'warning');
    } else if (result.multipleDetected) {
      showToast('1 IMEI per box enforced — extra IMEIs moved to next boxes.', 'info');
    }

    if (result.focusIndex !== null) {
      focusElementSafely(`variant-imei-${variantIdx}-${result.focusIndex}`);
    }
  };

  const handleVariantImeiKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    variantIdx: number,
    imeiIdx: number
  ) => {
    const currentVal = variants[variantIdx]?.imeis?.[imeiIdx]?.trim() || '';

    // Prevent typing space/comma/semicolon inside an IMEI box; advance to next box if populated
    if (e.key === ' ' || e.key === ',' || e.key === ';') {
      e.preventDefault();
      if (currentVal) {
        const nextSame = document.getElementById(`variant-imei-${variantIdx}-${imeiIdx + 1}`);
        if (nextSame) {
          nextSame.focus();
          return;
        }
        const nextVar = document.getElementById(`variant-imei-${variantIdx + 1}-0`);
        if (nextVar) {
          nextVar.focus();
          return;
        }
        showToast('1 box = 1 IMEI only! Increase Qty for more IMEIs.', 'warning');
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();

      if (currentVal) {
        showToast(`IMEI #${imeiIdx + 1} captured`, 'info');
      }

      const nextSameVariant = document.getElementById(`variant-imei-${variantIdx}-${imeiIdx + 1}`);
      if (nextSameVariant) {
        nextSameVariant.focus();
        return;
      }

      const nextVariantFirst = document.getElementById(`variant-imei-${variantIdx + 1}-0`);
      if (nextVariantFirst) {
        nextVariantFirst.focus();
        return;
      }
    }
  };

  const handleVariantImeiPaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    variantIdx: number,
    imeiIdx: number
  ) => {
    const pasted = e.clipboardData.getData('text');
    if (!pasted) return;

    const inputEl = e.currentTarget;
    const isAllSelected =
      inputEl.selectionStart === 0 && inputEl.selectionEnd === inputEl.value.length;
    const curVariantImeis = variants[variantIdx]?.imeis || [''];
    const currentBoxVal = (curVariantImeis[imeiIdx] || '').trim();

    // If current box already has a full IMEI (not replacing via Select All), put pasted IMEI(s) into subsequent boxes
    if (currentBoxVal.length >= 15 && !isAllSelected) {
      e.preventDefault();
      const nextEmptyIdx = curVariantImeis.findIndex((im, idx) => idx > imeiIdx && !im.trim());
      if (nextEmptyIdx === -1) {
        showToast('This box already holds 1 IMEI! Increase Qty for more boxes.', 'warning');
        return;
      }
      const res = distributeImeiInput({
        rawValue: pasted,
        currentImeis: curVariantImeis,
        targetIndex: nextEmptyIdx,
      });
      setVariants(prev => {
        const copy = [...prev];
        copy[variantIdx] = { ...copy[variantIdx], imeis: res.nextImeis };
        return copy;
      });
      if (res.overflowCount > 0) {
        showToast('1 box = 1 IMEI only! Extra IMEIs could not fit; increase Qty.', 'warning');
      }
      if (res.focusIndex !== null) {
        focusElementSafely(`variant-imei-${variantIdx}-${res.focusIndex}`);
      }
      return;
    }

    e.preventDefault();
    const res = distributeImeiInput({
      rawValue: pasted,
      currentImeis: curVariantImeis,
      targetIndex: imeiIdx,
    });
    setVariants(prev => {
      const copy = [...prev];
      copy[variantIdx] = { ...copy[variantIdx], imeis: res.nextImeis };
      return copy;
    });

    if (res.overflowCount > 0) {
      showToast('1 box = 1 IMEI only! Extra IMEIs skipped — increase Qty for more boxes.', 'warning');
    } else if (res.multipleDetected) {
      showToast('IMEIs placed 1 per box cleanly!', 'success');
    }

    if (res.focusIndex !== null) {
      focusElementSafely(`variant-imei-${variantIdx}-${res.focusIndex}`);
    }
  };

  // Non-mobile single quantity change handler
  const handleSingleQtyChange = (val: number | '') => {
    setQty(val);
    if (val !== '' && isMobile) {
      const targetCount = Math.max(1, Math.min(100, Math.floor(Number(val))));
      setImeis(prev => {
        const next = [...prev];
        while (next.length < targetCount) next.push('');
        return next.slice(0, targetCount);
      });
    }
  };

  const handleSingleImeiChange = (index: number, rawValue: string) => {
    const res = distributeImeiInput({
      rawValue,
      currentImeis: imeis,
      targetIndex: index,
    });
    setImeis(res.nextImeis);

    if (res.overflowCount > 0) {
      showToast('1 box = 1 IMEI only! Increase Qty to add more IMEI boxes.', 'warning');
    } else if (res.multipleDetected) {
      showToast('1 IMEI per box enforced — extra IMEIs moved to next boxes.', 'info');
    }

    if (res.focusIndex !== null) {
      focusElementSafely(`single-imei-${res.focusIndex}`);
    }
  };

  const handleSingleImeiKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    index: number
  ) => {
    const currentVal = imeis[index]?.trim() || '';

    if (e.key === ' ' || e.key === ',' || e.key === ';') {
      e.preventDefault();
      if (currentVal) {
        const nextEl = document.getElementById(`single-imei-${index + 1}`);
        if (nextEl) {
          nextEl.focus();
        } else {
          showToast('1 box = 1 IMEI only! Increase Qty for more IMEIs.', 'warning');
        }
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();

      if (currentVal) {
        showToast(`Device #${index + 1} IMEI captured!`, 'info');
      }

      const nextEl = document.getElementById(`single-imei-${index + 1}`);
      if (nextEl) {
        nextEl.focus();
      }
    }
  };

  const handleSingleImeiPaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    index: number
  ) => {
    const pasted = e.clipboardData.getData('text');
    if (!pasted) return;

    const inputEl = e.currentTarget;
    const isAllSelected =
      inputEl.selectionStart === 0 && inputEl.selectionEnd === inputEl.value.length;
    const currentBoxVal = (imeis[index] || '').trim();

    if (currentBoxVal.length >= 15 && !isAllSelected) {
      e.preventDefault();
      const nextEmptyIdx = imeis.findIndex((im, idx) => idx > index && !im.trim());
      if (nextEmptyIdx === -1) {
        showToast('This box already holds 1 IMEI! Increase Qty for more boxes.', 'warning');
        return;
      }
      const res = distributeImeiInput({
        rawValue: pasted,
        currentImeis: imeis,
        targetIndex: nextEmptyIdx,
      });
      setImeis(res.nextImeis);
      if (res.overflowCount > 0) {
        showToast('1 box = 1 IMEI only! Increase Qty to add more IMEI boxes.', 'warning');
      }
      if (res.focusIndex !== null) {
        focusElementSafely(`single-imei-${res.focusIndex}`);
      }
      return;
    }

    e.preventDefault();
    const res = distributeImeiInput({
      rawValue: pasted,
      currentImeis: imeis,
      targetIndex: index,
    });
    setImeis(res.nextImeis);

    if (res.overflowCount > 0) {
      showToast('1 box = 1 IMEI only! Extra IMEIs skipped — increase Qty for more boxes.', 'warning');
    } else if (res.multipleDetected) {
      showToast('IMEIs placed 1 per box cleanly!', 'success');
    }

    if (res.focusIndex !== null) {
      focusElementSafely(`single-imei-${res.focusIndex}`);
    }
  };

  // Image Upload handler
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
      showToast('Image size exceeds 3MB limit', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImage(reader.result);
        showToast('Product photo uploaded', 'info');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setImage('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Category inline save handler
  const handleSelectCategory = (selectedCat: string) => {
    setCategory(selectedCat);
    try {
      localStorage.setItem(LAST_SELECTED_CAT_KEY, selectedCat);
    } catch {
      // ignore
    }
  };

  const handleSaveNewCategory = (e: React.MouseEvent) => {
    e.preventDefault();
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      showToast('Please enter category name', 'warning');
      return;
    }

    if (categories.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      showToast('Category already exists', 'info');
      handleSelectCategory(trimmed);
      setIsCreatingCategory(false);
      setNewCategoryName('');
      return;
    }

    onAddCategory(trimmed);
    handleSelectCategory(trimmed);
    setIsCreatingCategory(false);
    setNewCategoryName('');
    showToast(`Category "${trimmed}" created!`, 'success');
  };

  const handleSaveEditedCategory = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    const trimmed = editCategoryName.trim();
    if (!trimmed) {
      showToast('Category name cannot be empty', 'warning');
      return;
    }
    if (trimmed === category) {
      setIsEditingCategory(false);
      return;
    }
    if (categories.some(c => c.toLowerCase() === trimmed.toLowerCase() && c.toLowerCase() !== category.toLowerCase())) {
      showToast('Category already exists', 'info');
      return;
    }
    if (onRenameCategory && onRenameCategory(category, trimmed)) {
      handleSelectCategory(trimmed);
      setIsEditingCategory(false);
      setEditCategoryName('');
    }
  };

  // Totals calculations for mobile variants (strictly from entered values, no auto-fill)
  const totalVariantsCount = variants.length;
  const totalVariantsQty = variants.reduce((acc, v) => acc + (Number(v.qty) || 0), 0);
  const totalVariantsCost = variants.reduce((acc, v) => {
    const effCost = v.costPrice !== '' && v.costPrice !== undefined ? Number(v.costPrice) : 0;
    return acc + effCost * (Number(v.qty) || 0);
  }, 0);
  const totalVariantsSale = variants.reduce((acc, v) => {
    const effSale = v.salePrice !== '' && v.salePrice !== undefined ? Number(v.salePrice) : 0;
    return acc + effSale * (Number(v.qty) || 0);
  }, 0);
  const totalVariantsProfit = totalVariantsSale - totalVariantsCost;

  // Submit Handler
  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim()) {
      showToast('Product Title / Model Name is required (e.g. Samsung Galaxy A15)', 'warning');
      return;
    }

    // UNIFIED MULTI-VARIANT FLOW FOR ANDROID, USED & KEYPAD (Single unified product with variants array)
    if (showVariantMode) {
      if (variants.length === 0) {
        showToast('Please add at least one mobile variant', 'warning');
        return;
      }

      for (let i = 0; i < variants.length; i++) {
        if (variants[i].qty === '' || Number(variants[i].qty) < (editItem ? 0 : 1)) {
          showToast(
            editItem
              ? `Please enter a valid quantity for Variant #${i + 1}`
              : `Please enter quantity (at least 1) for Variant #${i + 1}`,
            'warning'
          );
          return;
        }
      }

      // 1. Synchronize every variant's imeis array — preserve blank prices as '' (never auto-fill)
      const synchronizedVariants = variants.map(v => {
        const qty = editItem ? Math.max(0, Number(v.qty) || 0) : Math.max(1, Number(v.qty));
        const curImeis = v.imeis || [];
        const nextImeis = [...curImeis];
        while (nextImeis.length < qty) nextImeis.push('');

        const hasManualCost = v.costPrice !== '' && v.costPrice !== undefined;
        const hasManualWholesale = v.wholesalePrice !== '' && v.wholesalePrice !== undefined;
        const hasManualSale = v.salePrice !== '' && v.salePrice !== undefined;

        return {
          ...v,
          costPrice: hasManualCost ? Number(v.costPrice) : ('' as const),
          wholesalePrice: hasManualWholesale ? Number(v.wholesalePrice) : ('' as const),
          salePrice: hasManualSale ? Number(v.salePrice) : ('' as const),
          autoCostPrice: false,
          autoWholesalePrice: false,
          autoSalePrice: false,
          qty,
          imeis: nextImeis.slice(0, qty),
          note: v.note?.trim() || undefined,
          condition: v.condition?.trim() || undefined,
        };
      });

      // 2. Collect all IMEIs across all variants and check for duplicates within the form
      const allVariantImeis: string[] = [];
      const enteredImeiVariantMap = new Map<string, number>();

      for (let i = 0; i < synchronizedVariants.length; i++) {
        const v = synchronizedVariants[i];
        for (const im of v.imeis || []) {
          const clean = (im || '').trim();
          if (clean) {
            const lower = clean.toLowerCase();
            if (enteredImeiVariantMap.has(lower)) {
              const prevVarIdx = enteredImeiVariantMap.get(lower)!;
              showToast(
                prevVarIdx === i
                  ? `Variant #${i + 1} has duplicate IMEI: "${clean}"`
                  : `Duplicate IMEI "${clean}" between Variant #${prevVarIdx + 1} and Variant #${i + 1}`,
                'error'
              );
              return;
            }
            enteredImeiVariantMap.set(lower, i);
            allVariantImeis.push(clean);
          }
        }
      }

      // 3. Validate all IMEIs for uniqueness against inventory, sales, and sales returns
      const validation = validateImeis({
        imeisToCheck: allVariantImeis,
        currentProductId: editItem?.id,
        allowedSoldImeis: editItem ? extractItemImeis(editItem) : [],
        inventory,
        imeiRecords,
        sales,
        salesReturns,
      });

      if (!validation.valid) {
        showToast(validation.error || 'Invalid IMEI entry', 'error');
        return;
      }

      for (let i = 0; i < synchronizedVariants.length; i++) {
        const v = synchronizedVariants[i];
        const cost = Number(v.costPrice) || 0;
        const sale = Number(v.salePrice) || 0;
        const quantity = editItem ? Math.max(0, Number(v.qty) || 0) : Math.max(1, Number(v.qty) || 1);

        if (cost < 0 || sale < 0 || quantity < 0 || (!editItem && quantity < 1)) {
          showToast(`Variant #${i + 1} has invalid price or quantity`, 'error');
          return;
        }
      }

      const totalQuantity = synchronizedVariants.reduce((sum, v) => sum + (Number(v.qty) || 0), 0);
      const primaryCost =
        Number(synchronizedVariants.find(v => v.costPrice !== '' && v.costPrice !== undefined)?.costPrice) || 0;
      const primarySale =
        Number(synchronizedVariants.find(v => v.salePrice !== '' && v.salePrice !== undefined)?.salePrice) || 0;
      const firstWholesaleVar = synchronizedVariants.find(
        v => v.wholesalePrice !== '' && v.wholesalePrice !== undefined
      );
      const primaryWholesale = firstWholesaleVar ? Number(firstWholesaleVar.wholesalePrice) : undefined;

      const missingAlerts: string[] = [];
      if (!image) missingAlerts.push('Picture');
      synchronizedVariants.forEach((v, idx) => {
        const varLabel = isKeypad
          ? v.color?.trim() || `Var #${idx + 1}`
          : [v.ram, v.storage, v.color?.trim()].filter(Boolean).join('/') || `Var #${idx + 1}`;
        const varMissing: string[] = [];
        if (canSeeCostAndWholesale && (v.costPrice === '' || v.costPrice === undefined)) varMissing.push('Cost Price');
        if (v.salePrice === '' || v.salePrice === undefined) varMissing.push('Sale Price');
        if (canSeeCostAndWholesale && (v.wholesalePrice === '' || v.wholesalePrice === undefined)) varMissing.push('Wholesale Price');
        const emptyImeiIndices = (v.imeis || [])
          .map((im, iIdx) => (!(im || '').trim() ? `#${iIdx + 1}` : null))
          .filter(Boolean) as string[];
        if (emptyImeiIndices.length > 0) {
          varMissing.push(`IMEI ${emptyImeiIndices.slice(0, 4).join(', ')}${emptyImeiIndices.length > 4 ? ` (+${emptyImeiIndices.length - 4})` : ''}`);
        }
        if (varMissing.length > 0) {
          missingAlerts.push(`${varLabel}: ${varMissing.join(', ')}`);
        }
      });

      const allColors = synchronizedVariants.map(v => v.color?.trim()).filter(Boolean).join(', ');

      // Check if stock quantity changed during edit for Stock Adjustment tracking
      const isQtyChanged = editItem && editItem.qty !== totalQuantity;
      const adjustmentData = isQtyChanged
        ? {
            reason: adjustmentReason,
            notes: adjustmentNotes.trim() || undefined,
          }
        : undefined;

      if (isQtyChanged && onStockAdjustment && editItem) {
        onStockAdjustment({
          productId: editItem.id,
          productName: name.trim() || editItem.name,
          previousQty: editItem.qty,
          newQty: totalQuantity,
          difference: totalQuantity - editItem.qty,
          reason: adjustmentReason,
          notes: adjustmentNotes.trim() || undefined,
          adjustedBy: isAdmin ? 'Admin' : 'Salesman',
        });
      }

      const primaryCondition =
        synchronizedVariants.find(v => v.condition && v.condition.trim())?.condition?.trim() ||
        itemCondition.trim() ||
        undefined;
      const hasRepairable =
        primaryCondition === 'Repairable' ||
        synchronizedVariants.some(v => v.condition === 'Repairable');

      if (!editItem && isUsedCategory(category) && synchronizedVariants.length > 1) {
        // For Used Mobiles with multiple pieces, save each piece as an independent InventoryItem
        // so different Cost Prices, Sale Prices, Conditions, and IMEIs never mix!
        const separateUsedItems: Omit<InventoryItem, 'id' | 'createdAt'>[] = synchronizedVariants.map(v => {
          const vImeis = (v.imeis || []).map(s => s.trim()).filter(Boolean);
          const vCost = Number(v.costPrice) || 0;
          const vSale = Number(v.salePrice) || 0;
          const vWholesale =
            v.wholesalePrice !== '' && v.wholesalePrice !== undefined
              ? Number(v.wholesalePrice)
              : undefined;
          const vQty = Math.max(1, Number(v.qty) || 1);
          const vCond = v.condition?.trim() || itemCondition.trim() || undefined;
          return {
            name: name.trim(),
            category,
            image: image || undefined,
            imei: vImeis.length > 0 ? vImeis.join(', ') : undefined,
            imeis: vImeis.length > 0 ? vImeis : undefined,
            costPrice: vCost,
            wholesalePrice: vWholesale,
            salePrice: vSale,
            qty: vQty,
            status: 'ACTIVE' as const,
            ram: isAndroid ? v.ram : undefined,
            storage: isAndroid ? v.storage : undefined,
            color: v.color?.trim() || undefined,
            note: v.note?.trim() || itemNote.trim() || undefined,
            condition: vCond,
            purchasedFrom: purchasedFrom.trim() || undefined,
            purchasedPhone: purchasedPhone.trim() || undefined,
            variants: [{ ...v, condition: vCond }],
          };
        });

        onSave(separateUsedItems);
        if (hasRepairable && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission().catch(() => {});
        }
        showToast(
          `Added ${separateUsedItems.length} separate "${name.trim()}" pieces with individual Cost & Sale prices!`,
          'success'
        );
      } else {
        const singleProduct: Omit<InventoryItem, 'id' | 'createdAt'> = {
          name: name.trim(),
          category,
          image: image || undefined,
          imei: allVariantImeis.length > 0 ? allVariantImeis.join(', ') : undefined,
          imeis: allVariantImeis.length > 0 ? allVariantImeis : undefined,
          costPrice: primaryCost,
          wholesalePrice: primaryWholesale,
          salePrice: primarySale,
          qty: totalQuantity,
          status: editItem?.status || 'ACTIVE',
          ram: isAndroid ? synchronizedVariants[0]?.ram : undefined,
          storage: isAndroid ? synchronizedVariants[0]?.storage : undefined,
          color: allColors || undefined,
          note: itemNote.trim() || synchronizedVariants[0]?.note?.trim() || undefined,
          condition: primaryCondition,
          purchasedFrom: purchasedFrom.trim() || undefined,
          purchasedPhone: purchasedPhone.trim() || undefined,
          variants: synchronizedVariants,
        };

        onSave(singleProduct, editItem ? editItem.id : undefined, adjustmentData);
        if (hasRepairable && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission().catch(() => {});
        }
        showToast(
          editItem
            ? `Product "${singleProduct.name}" updated with ${synchronizedVariants.length} variants!`
            : `Product "${singleProduct.name}" added with ${synchronizedVariants.length} variants!`,
          'success'
        );
      }
      if (hasRepairable) {
        setTimeout(() => {
          showToast(`Repairable Reminder Active: "${name.trim()}" — hourly reminder enabled!`, 'warning');
        }, 450);
      }
      if (missingAlerts.length > 0) {
        setTimeout(() => {
          showToast(`Missing fields notice: ${missingAlerts.join(' | ')}`, 'warning');
        }, 350);
      }
      if (!editItem) {
        try {
          localStorage.setItem(LAST_SELECTED_CAT_KEY, category);
        } catch {
          // ignore
        }
        resetDraft();
      }
      onClose();
    } else {
      // SINGLE PRODUCT / KEYPAD PHONE / ACCESSORIES / EDIT MODE FLOW
      if (qty === '' || Number(qty) < 0 || (!editItem && Number(qty) < 1)) {
        showToast(editItem ? 'Please enter a valid quantity' : 'Please enter quantity (at least 1)', 'warning');
        return;
      }

      const cost = Number(costPrice) || 0;
      const sale = Number(salePrice) || 0;
      const wholesale = wholesalePrice !== '' ? Number(wholesalePrice) : undefined;
      const quantity = Number(qty);

      if (sale < 0 || cost < 0 || quantity < 0) {
        showToast('Prices and quantity cannot be negative', 'error');
        return;
      }

      let finalImeis: string[] | undefined = undefined;
      let finalImeiStr: string | undefined = undefined;

      if (isMobile) {
        const cleaned = imeis.map(i => i.trim()).filter(Boolean);

        // Validate IMEIs for uniqueness
        const validation = validateImeis({
          imeisToCheck: cleaned,
          currentProductId: editItem?.id,
          allowedSoldImeis: editItem ? extractItemImeis(editItem) : [],
          inventory,
          imeiRecords,
          sales,
          salesReturns,
        });

        if (!validation.valid) {
          showToast(validation.error || 'Invalid IMEI entry', 'error');
          return;
        }

        finalImeis = cleaned.length > 0 ? cleaned : undefined;
        finalImeiStr = cleaned.length > 0 ? cleaned.join(', ') : undefined;
      }

      const singleMissing: string[] = [];
      if (!image) singleMissing.push('Picture');
      if (canSeeCostAndWholesale && costPrice === '') singleMissing.push('Cost Price');
      if (salePrice === '') singleMissing.push('Sale Price');
      if (canSeeCostAndWholesale && wholesalePrice === '') singleMissing.push('Wholesale Price');
      if (isMobile) {
        const missingImeiSlots: string[] = [];
        for (let k = 0; k < quantity; k++) {
          if (!(imeis[k] || '').trim()) missingImeiSlots.push(`#${k + 1}`);
        }
        if (missingImeiSlots.length > 0) {
          singleMissing.push(`IMEI ${missingImeiSlots.slice(0, 4).join(', ')}${missingImeiSlots.length > 4 ? ` (+${missingImeiSlots.length - 4})` : ''}`);
        }
      }

      // Check if stock quantity changed during edit for Stock Adjustment tracking
      const isQtyChanged = editItem && editItem.qty !== quantity;
      const adjustmentData = isQtyChanged
        ? {
            reason: adjustmentReason,
            notes: adjustmentNotes.trim() || undefined,
          }
        : undefined;

      if (isQtyChanged && onStockAdjustment && editItem) {
        onStockAdjustment({
          productId: editItem.id,
          productName: name.trim() || editItem.name,
          previousQty: editItem.qty,
          newQty: quantity,
          difference: quantity - editItem.qty,
          reason: adjustmentReason,
          notes: adjustmentNotes.trim() || undefined,
          adjustedBy: isAdmin ? 'Admin' : 'Salesman',
        });
      }

      const formattedTitle = isKeypad && color.trim() && !name.toLowerCase().includes(color.toLowerCase())
        ? `${name.trim()} (${color.trim()})`
        : name.trim();

      onSave(
        {
          name: formattedTitle,
          category,
          image: image || undefined,
          imei: finalImeiStr,
          imeis: finalImeis,
          barcode: !isMobile ? barcode.trim() || undefined : undefined,
          costPrice: cost,
          wholesalePrice: wholesale,
          salePrice: sale,
          qty: quantity,
          ram: undefined,
          storage: undefined,
          variants: undefined,
          color: color.trim() || undefined,
          note: itemNote.trim() || undefined,
          condition: itemCondition.trim() || undefined,
          purchasedFrom: purchasedFrom.trim() || undefined,
          purchasedPhone: purchasedPhone.trim() || undefined,
          status: editItem?.status || 'ACTIVE',
        },
        editItem ? editItem.id : undefined,
        adjustmentData
      );

      if (itemCondition === 'Repairable' && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
      showToast(editItem ? 'Product updated successfully' : 'Product added to stock', 'success');
      if (itemCondition === 'Repairable') {
        setTimeout(() => {
          showToast(`Repairable Reminder Active: "${formattedTitle}" — hourly reminder enabled!`, 'warning');
        }, 450);
      }
      if (singleMissing.length > 0) {
        setTimeout(() => {
          showToast(`Missing fields notice: ${singleMissing.join(', ')}`, 'warning');
        }, 350);
      }
      if (!editItem) {
        try {
          localStorage.setItem(LAST_SELECTED_CAT_KEY, category);
        } catch {
          // ignore
        }
        resetDraft();
      }
      onClose();
    }
  };

  const handleExplicitCancel = () => {
    if (!editItem) {
      resetDraft();
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 glass-modal-backdrop">
      <div className="glass-modal-panel animate-modal-pop rounded-3xl max-w-2xl lg:max-w-3xl w-full max-h-[86dvh] sm:max-h-[88dvh] flex flex-col overflow-hidden relative">
        {/* Subtle Ambient Liquid Glows */}
        <div className="pointer-events-none absolute -top-16 -right-12 w-52 h-52 rounded-full opacity-55" style={{ background: 'radial-gradient(circle, rgba(56,189,248,0.18) 0%, transparent 70%)' }} aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-16 -left-12 w-52 h-52 rounded-full opacity-45" style={{ background: 'radial-gradient(circle, rgba(167,139,250,0.16) 0%, transparent 70%)' }} aria-hidden="true" />

        {/* Frosted Fluid Liquid Header */}
        <div className="ios-liquid-header relative z-10 flex items-center justify-between gap-2.5 px-3.5 py-2.5 sm:px-5 sm:py-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shadow-sm shrink-0 text-white ${
              isUsedCategoryName(category)
                ? 'bg-gradient-to-br from-purple-600 to-indigo-600'
                : isMobile
                ? 'bg-gradient-to-br from-blue-600 to-cyan-500'
                : 'bg-gradient-to-br from-emerald-600 to-teal-500'
            }`}>
              {isMobile ? <Smartphone className="w-4.5 h-4.5" /> : <Package className="w-4.5 h-4.5" />}
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-slate-900 text-xs sm:text-sm leading-tight truncate">
                {editItem
                  ? `Edit ${category || 'Product'}`
                  : isUsedCategoryName(category)
                  ? 'Used Mobile Purchase & Stock'
                  : isAndroid
                  ? 'Add Android Mobile'
                  : isKeypad
                  ? 'Add Keypad Phone'
                  : 'Add Product to Inventory'}
              </h3>
              <p className="text-[10.5px] text-slate-500 font-medium truncate">
                {showVariantMode
                  ? isKeypad
                    ? 'Color variants with dedicated 1-box IMEI tracking'
                    : 'Multi-variant RAM/ROM & dedicated IMEI entry'
                  : 'Single SKU pricing, barcode & stock control'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-800 rounded-full ios-liquid-chip cursor-pointer shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          id="stock-modal-form"
          onSubmit={handleSubmit}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
              e.preventDefault();
            }
          }}
          className="relative z-10 flex-1 min-h-0 overflow-y-auto px-3 py-2.5 sm:px-5 sm:py-3.5 space-y-3 text-xs"
        >
          {/* Fluid Liquid Top Identity Card: Photo + Model Name + Category (No overlap on any width!) */}
          <div className="ios-liquid-surface p-3 rounded-2xl space-y-2.5">
            <div className="flex flex-col md:flex-row md:items-end gap-2.5">
              {/* Auto-sized Photo Picker (shrink-0 so Upload & Cam never collide with Name box) */}
              <div className="flex items-center gap-2.5 shrink-0">
                {image ? (
                  <div className="relative w-11 h-11 rounded-xl border border-white/90 overflow-hidden bg-white shrink-0 shadow-xs">
                    <img src={image} alt="Preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="absolute top-0 right-0 bg-rose-600 text-white rounded-bl-lg p-0.5 hover:bg-rose-700 cursor-pointer"
                      title="Remove Photo"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ) : (
                  <div className="w-11 h-11 rounded-xl border border-dashed border-slate-300/90 bg-white/80 flex items-center justify-center text-slate-400 shrink-0">
                    <ImageIcon className="w-4.5 h-4.5 text-slate-300" />
                  </div>
                )}

                <div className="shrink-0">
                  <span className="block font-bold text-slate-600 text-[10px] mb-1">Photo</span>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageFileChange}
                    accept="image/png, image/jpeg, image/jpg, image/webp"
                    className="hidden"
                    id="stock-image-file"
                  />
                  <div className="flex items-center gap-1.5">
                    <label
                      htmlFor="stock-image-file"
                      className="inline-flex items-center gap-1 h-8 px-2.5 ios-liquid-chip hover:bg-white text-slate-700 font-bold rounded-xl text-[11px] cursor-pointer transition whitespace-nowrap"
                    >
                      <Upload className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>{image ? 'Edit' : 'Upload'}</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsCameraOpen(true)}
                      className="inline-flex items-center gap-1 h-8 px-2.5 bg-emerald-50/90 hover:bg-emerald-100 text-emerald-700 font-bold rounded-xl text-[11px] cursor-pointer transition border border-emerald-200/80 whitespace-nowrap"
                    >
                      <Camera className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Cam</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Model Name (flex-1 min-w-0 ensures clean spacing) */}
              <div className="flex-1 min-w-0">
                <label className="block font-bold text-slate-700 mb-1 text-[10.5px]">
                  {isMobile ? 'Mobile Model Name *' : 'Product Title / Name *'}
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={
                    isMobile
                      ? 'e.g. Samsung Galaxy A15, Infinix Note 40'
                      : 'e.g. 20W Fast Charger Type-C'
                  }
                  className="compact-mobile-input w-full bg-white/95 border border-slate-200/90 rounded-xl px-3 h-9 text-xs font-semibold focus:outline-none focus:border-blue-600 shadow-2xs"
                />
              </div>

              {/* Category selector + Inline category creation & rename */}
              <div className="w-full md:w-52 shrink-0">
                <div className="flex items-center justify-between mb-0.5 gap-1">
                  <label className="font-bold text-slate-700 text-[10px] sm:text-[11px]">Category</label>
                  {!isCreatingCategory && !isEditingCategory ? (
                    <div className="flex items-center gap-2">
                      {onRenameCategory && category && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditCategoryName(category);
                            setIsEditingCategory(true);
                          }}
                          className="text-purple-600 hover:text-purple-700 font-bold text-[10px] flex items-center gap-0.5 cursor-pointer"
                          title="Rename selected category"
                        >
                          <Edit2 className="w-2.5 h-2.5" /> Edit
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsCreatingCategory(true)}
                        className="text-blue-600 hover:text-blue-700 font-bold text-[10px] flex items-center gap-0.5 cursor-pointer"
                      >
                        <Plus className="w-2.5 h-2.5" /> New
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreatingCategory(false);
                        setIsEditingCategory(false);
                      }}
                      className="text-slate-400 hover:text-slate-600 text-[10px] cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                </div>

                {isCreatingCategory ? (
                  <div className="flex items-center gap-1 bg-blue-50/80 border border-blue-200 rounded-lg p-0.5 h-9">
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={e => setNewCategoryName(e.target.value)}
                      placeholder="New category..."
                      className="compact-mobile-input flex-1 min-w-0 bg-white border border-blue-300 rounded-md px-2 h-7.5 text-xs font-medium focus:outline-none"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSaveNewCategory(e as any);
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleSaveNewCategory}
                      className="px-2.5 h-7.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md text-[10px] transition cursor-pointer shrink-0"
                    >
                      Save
                    </button>
                  </div>
                ) : isEditingCategory ? (
                  <div className="flex items-center gap-1 bg-purple-50/80 border border-purple-200 rounded-lg p-0.5 h-9">
                    <input
                      type="text"
                      value={editCategoryName}
                      onChange={e => setEditCategoryName(e.target.value)}
                      placeholder="Edit category..."
                      className="compact-mobile-input flex-1 min-w-0 bg-white border border-purple-300 rounded-md px-2 h-7.5 text-xs font-medium focus:outline-none"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          handleSaveEditedCategory(e);
                        } else if (e.key === 'Escape') {
                          setIsEditingCategory(false);
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleSaveEditedCategory}
                      className="px-2.5 h-7.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-md text-[10px] transition cursor-pointer shrink-0"
                    >
                      Update
                    </button>
                  </div>
                ) : (
                  (() => {
                    const modalCategories =
                      category && !categories.includes(category)
                        ? [category, ...categories]
                        : categories;
                    return (
                      <select
                        value={category}
                        onChange={e => handleSelectCategory(e.target.value)}
                        className="compact-mobile-input w-full bg-white/95 border border-slate-200/90 rounded-xl px-2.5 h-9 text-xs font-semibold focus:outline-none focus:border-blue-600 shadow-2xs"
                      >
                        {modalCategories.map(c => (
                          <option key={c} value={c}>
                            {c} {isMobileCategory(c) ? '(Mobile)' : ''}
                          </option>
                        ))}
                      </select>
                    );
                  })()
                )}
              </div>
            </div>

            {/* Purchased From / Seller Info (shown for Used Categories) */}
            {isUsedCategoryName(category) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2.5 border-t border-slate-200/70">
                <div>
                  <label className="flex items-center gap-1 font-bold text-slate-700 mb-1 text-[10px]">
                    <User className="w-3 h-3 text-purple-600" /> Purchased From (Seller / Party Name)
                  </label>
                  <PhoneContactInput
                    type="text"
                    value={purchasedFrom}
                    onChange={setPurchasedFrom}
                    onSelectContact={c => {
                      if (c.name) setPurchasedFrom(c.name);
                      if (c.phone) setPurchasedPhone(c.phone);
                    }}
                    contacts={mergedSellerContacts}
                    placeholder="e.g. Ali Raza / Walk-in Seller"
                    accent="purple"
                    showContactPickerButton={false}
                    openOnFocus={false}
                    minCharsToOpen={1}
                    inputClassName="compact-mobile-input w-full bg-white/95 border border-purple-200 rounded-xl px-2.5 h-8.5 text-xs font-semibold focus:outline-none focus:border-purple-600"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1 font-bold text-slate-700 mb-1 text-[10px]">
                    <Smartphone className="w-3 h-3 text-purple-600" /> Seller Phone / CNIC Note
                  </label>
                  <PhoneContactInput
                    type="tel"
                    value={purchasedPhone}
                    onChange={setPurchasedPhone}
                    onSelectContact={c => {
                      if (c.phone) setPurchasedPhone(c.phone);
                      if (c.name) setPurchasedFrom(c.name);
                    }}
                    contacts={mergedSellerContacts}
                    placeholder="e.g. 0300-1234567"
                    accent="purple"
                    inputClassName="compact-mobile-input w-full bg-white/95 border border-purple-200 rounded-xl px-2.5 h-8.5 text-xs font-semibold tabular-nums focus:outline-none focus:border-purple-600"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ========================================================= */}
          {/* MOBILE, USED & KEYPAD MULTI-VARIANT / COLOR SYSTEM         */}
          {/* ========================================================= */}
          {showVariantMode ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Layers className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span className="font-bold text-slate-900 text-xs truncate">
                    {isKeypad ? `Color Variants (${variants.length})` : `Mobile Variants (${variants.length})`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleAddVariant}
                  className="inline-flex items-center gap-1 h-7.5 px-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] rounded-lg shadow-2xs transition cursor-pointer shrink-0 whitespace-nowrap"
                >
                  <Plus className="w-3 h-3" />
                  <span>{isKeypad ? 'Add Color Variant' : 'Add Variant'}</span>
                </button>
              </div>

              {/* Variant Cards */}
              <div className="space-y-2.5">
                {variants.map((v, vIdx) => {
                  const currentQty = Math.max(1, Number(v.qty) || 1);
                  const effCost = v.costPrice !== '' && v.costPrice !== undefined ? Number(v.costPrice) : 0;
                  const effSale = v.salePrice !== '' && v.salePrice !== undefined ? Number(v.salePrice) : 0;

                  const marginVal = effSale > 0 && effCost > 0 ? effSale - effCost : 0;
                  const marginPct = marginVal > 0 && effCost > 0 ? Math.round((marginVal / effCost) * 100) : 0;

                  return (
                    <div
                      key={v.id || vIdx}
                      className="animate-scale-in ios-liquid-tile rounded-2xl p-2.5 sm:p-3 space-y-2.5 hover:border-blue-300 transition"
                    >
                      {/* Compact Variant Header + Inline Margin Badge */}
                      <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 gap-1.5">
                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                          <span className="w-5 h-5 rounded-md bg-blue-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0">
                            #{vIdx + 1}
                          </span>
                          <span className="font-extrabold text-slate-800 text-[11px] sm:text-xs truncate">
                            {isKeypad
                              ? `Color #${vIdx + 1}: ${v.color?.trim() || 'Specify Color'}`
                              : `${v.ram || 'RAM'} / ${v.storage || 'ROM'}${v.color ? ` • ${v.color}` : ''}`}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-slate-100 text-slate-600 tabular-nums shrink-0">
                            {currentQty} {currentQty === 1 ? 'Unit' : 'Units'}
                          </span>
                          {canSeeProfitSummary && marginVal > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-0.5 tabular-nums shrink-0">
                              <TrendingUp className="w-2.5 h-2.5 text-emerald-600" />
                              +{currency} {marginVal.toLocaleString()} ({marginPct}%)
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleDuplicateVariant(vIdx)}
                            className="text-slate-600 hover:text-blue-600 h-7 px-2 rounded-md bg-slate-50 hover:bg-slate-100 border border-slate-200/80 text-[10px] font-semibold flex items-center gap-1 transition cursor-pointer"
                            title="Duplicate this variant"
                          >
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </button>
                          {variants.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveVariant(vIdx)}
                              className="text-rose-500 hover:text-rose-600 w-7 h-7 flex items-center justify-center rounded-md bg-rose-50/70 hover:bg-rose-100 border border-rose-200/70 transition cursor-pointer"
                              title="Delete variant"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Specs Row: Compact RAM, Storage & Color */}
                      {isKeypad ? (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 bg-purple-50/60 p-2 rounded-lg border border-purple-200/80">
                          <label className="font-bold text-purple-900 flex items-center gap-1 text-[10px] sm:text-[11px] shrink-0">
                            <Palette className="w-3.5 h-3.5 text-purple-600" /> Phone Color
                          </label>
                          <input
                            type="text"
                            value={v.color || ''}
                            onChange={e => handleUpdateVariantField(vIdx, 'color', e.target.value)}
                            placeholder="e.g. Black, Blue, White, Gold, Red"
                            className="compact-mobile-input flex-1 bg-white border border-purple-300 rounded-lg px-2.5 h-8.5 text-xs font-bold text-purple-950 focus:outline-none focus:border-purple-600"
                          />
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start">
                          {/* RAM Selector + inline Custom box */}
                          <div className="sm:col-span-5 space-y-1">
                            <div className="flex items-center justify-between gap-1">
                              <label className="font-bold text-slate-700 flex items-center gap-1 text-[10px]">
                                <Cpu className="w-3 h-3 text-blue-600" /> RAM
                              </label>
                              <input
                                type="text"
                                value={v.ram}
                                onChange={e => handleUpdateVariantField(vIdx, 'ram', e.target.value)}
                                placeholder="Custom"
                                className="compact-mobile-input w-20 bg-slate-50 border border-slate-200 rounded px-1.5 h-6.5 text-[11px] font-semibold focus:outline-none focus:border-blue-600"
                              />
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {RAM_OPTIONS.map(ramOption => (
                                <button
                                  key={ramOption}
                                  type="button"
                                  onClick={() => handleUpdateVariantField(vIdx, 'ram', ramOption)}
                                  className={`px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer ${
                                    v.ram === ramOption
                                      ? 'bg-blue-600 text-white shadow-2xs'
                                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                  }`}
                                >
                                  {ramOption}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Storage Selector + inline Custom box */}
                          <div className="sm:col-span-4 space-y-1">
                            <div className="flex items-center justify-between gap-1">
                              <label className="font-bold text-slate-700 flex items-center gap-1 text-[10px]">
                                <HardDrive className="w-3 h-3 text-indigo-600" /> Storage
                              </label>
                              <input
                                type="text"
                                value={v.storage}
                                onChange={e => handleUpdateVariantField(vIdx, 'storage', e.target.value)}
                                placeholder="Custom"
                                className="compact-mobile-input w-20 bg-slate-50 border border-slate-200 rounded px-1.5 h-6.5 text-[11px] font-semibold focus:outline-none focus:border-indigo-600"
                              />
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {STORAGE_OPTIONS.map(storageOption => (
                                <button
                                  key={storageOption}
                                  type="button"
                                  onClick={() =>
                                    handleUpdateVariantField(vIdx, 'storage', storageOption)
                                  }
                                  className={`px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer ${
                                    v.storage === storageOption
                                      ? 'bg-indigo-600 text-white shadow-2xs'
                                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                  }`}
                                >
                                  {storageOption}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Color / Edition */}
                          <div className="sm:col-span-3 space-y-1">
                            <label className="font-bold text-slate-700 flex items-center gap-1 text-[10px]">
                              <Palette className="w-3 h-3 text-purple-600" /> Color / Edition
                            </label>
                            <input
                              type="text"
                              value={v.color || ''}
                              onChange={e => handleUpdateVariantField(vIdx, 'color', e.target.value)}
                              placeholder="e.g. Black, Blue"
                              className="compact-mobile-input w-full bg-slate-50 border border-slate-200 rounded-lg px-2 h-8 text-xs font-semibold focus:outline-none focus:border-purple-600"
                            />
                          </div>
                        </div>
                      )}

                      {/* Compact Pricing & Quantity Row */}
                      <div className={`grid gap-1.5 sm:gap-2 bg-slate-50/80 p-2 rounded-lg border border-slate-200/70 items-center ${canSeeCostAndWholesale ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'}`}>
                        {canSeeCostAndWholesale && (
                          <div>
                            <label className="block font-bold text-slate-700 mb-0.5 text-[10px] truncate" title="Cost Price">
                              1. Cost ({currency})
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={v.costPrice}
                              onChange={e =>
                                handleUpdateVariantField(
                                  vIdx,
                                  'costPrice',
                                  e.target.value === '' ? '' : Number(e.target.value)
                                )
                              }
                              placeholder="Cost Price"
                              className="compact-mobile-input w-full rounded-lg px-2 h-8.5 text-xs tabular-nums font-bold focus:outline-none border bg-white border-slate-200 focus:border-blue-600 transition"
                            />
                          </div>
                        )}

                        {canSeeCostAndWholesale && (
                          <div>
                            <label className="block font-bold text-purple-900 mb-0.5 text-[10px] truncate" title="Wholesale Price">
                              2. Wholesale ({currency})
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={v.wholesalePrice !== undefined ? v.wholesalePrice : ''}
                              onChange={e =>
                                handleUpdateVariantField(
                                  vIdx,
                                  'wholesalePrice',
                                  e.target.value === '' ? '' : Number(e.target.value)
                                )
                              }
                              placeholder="Wholesale"
                              className="compact-mobile-input w-full rounded-lg px-2 h-8.5 text-xs tabular-nums font-bold focus:outline-none border bg-purple-50/70 border-purple-200 text-purple-950 focus:border-purple-600 transition"
                            />
                          </div>
                        )}

                        <div>
                          <label className="block font-bold text-slate-700 mb-0.5 text-[10px] truncate" title="Sale Price">
                            3. Sale ({currency})
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={v.salePrice}
                            onChange={e =>
                              handleUpdateVariantField(
                                vIdx,
                                'salePrice',
                                e.target.value === '' ? '' : Number(e.target.value)
                              )
                            }
                            placeholder="Sale Price"
                            className="compact-mobile-input w-full rounded-lg px-2 h-8.5 text-xs tabular-nums font-bold focus:outline-none border bg-white border-slate-200 focus:border-blue-600 transition"
                          />
                        </div>

                        <div>
                          <label className="block font-bold text-slate-700 mb-0.5 text-[10px] truncate" title="Quantity">
                            Qty (Units) *
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="100"
                            value={v.qty}
                            onChange={e =>
                              handleVariantQtyChange(
                                vIdx,
                                e.target.value === '' ? '' : Number(e.target.value)
                              )
                            }
                            placeholder="Qty"
                            className="compact-mobile-input allow-spinner w-full bg-white border border-blue-400 rounded-lg px-2 h-8.5 text-xs tabular-nums font-extrabold text-blue-700 focus:outline-none focus:border-blue-600"
                          />
                        </div>
                      </div>

                      {/* Condition Selector + Variant Note Input */}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start">
                        {/* Clickable Condition Selector */}
                        <div className="sm:col-span-5 relative bg-slate-50/70 px-2 py-1.5 rounded-lg border border-slate-200/70">
                          <label className="flex items-center gap-1 font-bold text-slate-700 mb-0.5 text-[10px]">
                            <ShieldCheck className="w-3 h-3 text-purple-600" />
                            Device Condition
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              setOpenConditionDropdown(
                                openConditionDropdown === `var-${vIdx}` ? null : `var-${vIdx}`
                              )
                            }
                            className={`w-full h-8 px-2.5 rounded-lg border text-xs font-bold flex items-center justify-between gap-1.5 cursor-pointer transition ${
                              v.condition
                                ? getConditionBadgeStyle(v.condition)
                                : 'bg-white border-slate-200 text-slate-500 hover:border-purple-400'
                            }`}
                          >
                            <span className="truncate flex items-center gap-1.5">
                              {v.condition === 'Repairable' && <Wrench className="w-3 h-3 shrink-0" />}
                              {v.condition || 'Select Condition...'}
                            </span>
                            <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${openConditionDropdown === `var-${vIdx}` ? 'rotate-180' : ''}`} />
                          </button>

                          {openConditionDropdown === `var-${vIdx}` && (
                            <div className="absolute left-0 right-0 top-full mt-1 z-40 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 space-y-1 max-h-56 overflow-y-auto animate-modal-pop">
                              <div className="grid grid-cols-3 gap-1">
                                {CONDITION_OPTIONS.slice(0, 6).map(cond => (
                                  <button
                                    key={cond}
                                    type="button"
                                    onClick={() => {
                                      handleUpdateVariantField(vIdx, 'condition', cond);
                                      setOpenConditionDropdown(null);
                                    }}
                                    className={`px-2 py-1.5 rounded-lg text-[11px] font-extrabold border text-center cursor-pointer transition ${
                                      v.condition === cond
                                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                        : getConditionBadgeStyle(cond) + ' hover:brightness-95'
                                    }`}
                                  >
                                    {cond}
                                  </button>
                                ))}
                              </div>
                              <div className="pt-1 border-t border-slate-100 space-y-1">
                                {CONDITION_OPTIONS.slice(6).map(cond => (
                                  <button
                                    key={cond}
                                    type="button"
                                    onClick={() => {
                                      handleUpdateVariantField(vIdx, 'condition', cond);
                                      setOpenConditionDropdown(null);
                                    }}
                                    className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-extrabold border text-left flex items-center justify-between cursor-pointer transition ${
                                      v.condition === cond
                                        ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                                        : getConditionBadgeStyle(cond) + ' hover:brightness-95'
                                    }`}
                                  >
                                    <span>{cond}</span>
                                    {cond === 'Repairable' && <Wrench className="w-3.5 h-3.5 shrink-0" />}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          {v.condition === 'Repairable' && (
                            <p className="text-[10px] font-bold text-rose-600 mt-1 flex items-center gap-1">
                              <Wrench className="w-3 h-3 shrink-0" /> Hourly repair notification active
                            </p>
                          )}
                        </div>

                        {/* Variant Note Input */}
                        <div className="sm:col-span-7 bg-slate-50/70 px-2 py-1.5 rounded-lg border border-slate-200/70">
                          <label className="flex items-center gap-1 font-bold text-slate-700 mb-0.5 text-[10px]">
                            <FileText className="w-3 h-3 text-blue-600" />
                            Variant #{vIdx + 1} Note (Optional)
                          </label>
                          <input
                            type="text"
                            value={v.note || ''}
                            onChange={e => handleUpdateVariantField(vIdx, 'note', e.target.value)}
                            placeholder="e.g. Box Pack, PTA Approved, Official Warranty, Condition note..."
                            className="compact-mobile-input w-full bg-white border border-slate-200 rounded-lg px-2.5 h-8 text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600"
                          />
                        </div>
                      </div>

                      {/* STRICT 1-IMEI-PER-BOX DYNAMIC GRID */}
                      <div className="p-2 bg-blue-50/60 border border-blue-200/80 rounded-lg space-y-1.5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 text-[10px] sm:text-[11px] flex items-center gap-1">
                            <Smartphone className="w-3 h-3 text-blue-600 shrink-0" />
                            IMEI Boxes — Variant #{vIdx + 1} ({v.imeis.length} {v.imeis.length === 1 ? 'Box' : 'Boxes'} for {v.qty === '' ? 0 : v.qty} units)
                          </span>
                          <span className="text-[10px] font-bold text-blue-700 px-1.5 py-0.5 rounded-md bg-blue-100/80 shrink-0">
                            1 Box = 1 IMEI
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5 max-h-36 sm:max-h-32 overflow-y-auto pr-0.5">
                          {v.imeis.map((imeiStr, imeiIdx) => {
                            const imeiErr = getVariantImeiError(imeiStr, vIdx);
                            return (
                              <div key={imeiIdx} className="flex flex-col">
                                <div
                                  className={`flex items-center gap-1 px-1.5 rounded-lg border transition h-8.5 ${
                                    imeiErr
                                      ? 'bg-rose-50/90 border-rose-400 ring-1 ring-rose-300'
                                      : 'bg-white border-slate-200 focus-within:border-blue-500'
                                  }`}
                                >
                                  <span
                                    className={`tabular-nums text-[10px] font-bold w-6 shrink-0 ${
                                      imeiErr ? 'text-rose-600' : 'text-slate-500'
                                    }`}
                                  >
                                    #{imeiIdx + 1}
                                  </span>
                                  <div className="relative flex-1 flex items-center min-w-0">
                                    <Hash
                                      className={`w-3 h-3 absolute left-1 top-1/2 -translate-y-1/2 ${
                                        imeiErr ? 'text-rose-500' : 'text-slate-400'
                                      }`}
                                    />
                                    <input
                                      id={`variant-imei-${vIdx}-${imeiIdx}`}
                                      type="text"
                                      maxLength={MAX_SINGLE_IMEI_LENGTH}
                                      value={imeiStr}
                                      onChange={e =>
                                        handleVariantImeiChange(vIdx, imeiIdx, e.target.value)
                                      }
                                      onKeyDown={e => handleVariantImeiKeyDown(e, vIdx, imeiIdx)}
                                      onPaste={e => handleVariantImeiPaste(e, vIdx, imeiIdx)}
                                      placeholder="1 IMEI (15 digits)"
                                      className="compact-mobile-input w-full pl-4.5 pr-8 py-1 bg-transparent text-[11px] tabular-nums font-medium focus:outline-none rounded"
                                      autoComplete="off"
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openBarcodeScanner(
                                          `Scan 1 IMEI for Variant #${vIdx + 1} Unit #${imeiIdx + 1}`,
                                          code => handleVariantImeiChange(vIdx, imeiIdx, code)
                                        )
                                      }
                                      className="absolute right-0 w-7 h-7 text-blue-600 hover:bg-blue-50 rounded cursor-pointer flex items-center justify-center"
                                      title="Camera Scan 1 IMEI"
                                    >
                                      <Camera className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                                {imeiErr && (
                                  <div className="flex items-center gap-1 text-[10px] font-semibold text-rose-600 mt-0.5 px-1">
                                    <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                                    <span className="truncate">{imeiErr}</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* ========================================================= */
            /* SINGLE PRODUCT MODE / NON-MOBILE / ACCESSORIES / EDIT     */
            /* ========================================================= */
            <div className="ios-liquid-surface rounded-2xl p-3 space-y-2.5">
              {/* If Keypad Phone or editing mobile phone, show Color input */}
              {(isKeypad || (editItem && isMobile)) && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 bg-white/80 p-2 rounded-xl border border-slate-200/80">
                  <label className="font-bold text-slate-700 text-[10px] sm:text-[11px] flex items-center gap-1 shrink-0">
                    <Palette className="w-3.5 h-3.5 text-purple-600" /> Phone Color
                  </label>
                  <input
                    type="text"
                    value={color}
                    onChange={e => setColor(e.target.value)}
                    placeholder="e.g. Black, Blue, White, Gold, Red"
                    className="compact-mobile-input flex-1 bg-white border border-slate-200 rounded-lg px-2.5 h-8.5 text-xs font-semibold focus:outline-none focus:border-blue-600"
                  />
                </div>
              )}

              {/* Pricing & Quantity Row */}
              <div className={`grid gap-1.5 sm:gap-2 ${canSeeCostAndWholesale ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'}`}>
                {canSeeCostAndWholesale && (
                  <div>
                    <label className="block font-bold text-slate-700 mb-0.5 text-[10px] sm:text-[11px] truncate" title="Cost Price">
                      1. Cost Price ({currency})
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={costPrice}
                      onChange={e => setCostPrice(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="Cost Price"
                      className="compact-mobile-input w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 h-9 text-xs tabular-nums font-semibold focus:outline-none focus:border-blue-600 focus:bg-white transition"
                    />
                  </div>
                )}

                {canSeeCostAndWholesale && (
                  <div>
                    <label className="block font-bold text-purple-900 mb-0.5 text-[10px] sm:text-[11px] truncate" title="Wholesale Price">
                      2. Wholesale ({currency})
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={wholesalePrice}
                      onChange={e => setWholesalePrice(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="Wholesale Rate"
                      className="compact-mobile-input w-full bg-purple-50/60 border border-purple-200 rounded-lg px-2.5 h-9 text-xs tabular-nums font-semibold text-purple-950 focus:outline-none focus:border-purple-600 focus:bg-white transition"
                    />
                  </div>
                )}

                <div>
                  <label className="block font-bold text-slate-700 mb-0.5 text-[10px] sm:text-[11px] truncate" title="Sale Price">
                    3. Sale Price ({currency})
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={salePrice}
                    onChange={e => setSalePrice(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="Sale Price"
                    className="compact-mobile-input w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 h-9 text-xs tabular-nums font-semibold focus:outline-none focus:border-blue-600 focus:bg-white transition"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-0.5 text-[10px] sm:text-[11px] truncate" title="Quantity">
                    Quantity (Units) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="100"
                    value={qty}
                    onChange={e =>
                      handleSingleQtyChange(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    placeholder="Qty"
                    className="compact-mobile-input allow-spinner w-full bg-slate-50 border border-blue-400 rounded-lg px-2.5 h-9 text-xs tabular-nums font-bold text-blue-700 focus:outline-none focus:border-blue-600 focus:bg-white transition"
                  />
                </div>
              </div>

              {/* Condition Selector + Product Note Input (Single Mode) */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start">
                {(isMobile || isUsedCategoryName(category)) && (
                  <div className="sm:col-span-5 relative bg-slate-50/70 px-2.5 py-1.5 rounded-xl border border-slate-200/70">
                    <label className="flex items-center gap-1 font-bold text-slate-700 mb-0.5 text-[10px]">
                      <ShieldCheck className="w-3 h-3 text-purple-600" />
                      Device Condition
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenConditionDropdown(
                          openConditionDropdown === 'single' ? null : 'single'
                        )
                      }
                      className={`w-full h-8.5 px-2.5 rounded-lg border text-xs font-bold flex items-center justify-between gap-1.5 cursor-pointer transition ${
                        itemCondition
                          ? getConditionBadgeStyle(itemCondition)
                          : 'bg-white border-slate-200 text-slate-500 hover:border-purple-400'
                      }`}
                    >
                      <span className="truncate flex items-center gap-1.5">
                        {itemCondition === 'Repairable' && <Wrench className="w-3 h-3 shrink-0" />}
                        {itemCondition || 'Select Condition...'}
                      </span>
                      <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${openConditionDropdown === 'single' ? 'rotate-180' : ''}`} />
                    </button>

                    {openConditionDropdown === 'single' && (
                      <div className="absolute left-0 right-0 top-full mt-1 z-40 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 space-y-1 max-h-56 overflow-y-auto animate-modal-pop">
                        <div className="grid grid-cols-3 gap-1">
                          {CONDITION_OPTIONS.slice(0, 6).map(cond => (
                            <button
                              key={cond}
                              type="button"
                              onClick={() => {
                                setItemCondition(cond);
                                setOpenConditionDropdown(null);
                              }}
                              className={`px-2 py-1.5 rounded-lg text-[11px] font-extrabold border text-center cursor-pointer transition ${
                                itemCondition === cond
                                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                  : getConditionBadgeStyle(cond) + ' hover:brightness-95'
                              }`}
                            >
                              {cond}
                            </button>
                          ))}
                        </div>
                        <div className="pt-1 border-t border-slate-100 space-y-1">
                          {CONDITION_OPTIONS.slice(6).map(cond => (
                            <button
                              key={cond}
                              type="button"
                              onClick={() => {
                                setItemCondition(cond);
                                setOpenConditionDropdown(null);
                              }}
                              className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-extrabold border text-left flex items-center justify-between cursor-pointer transition ${
                                itemCondition === cond
                                  ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                                  : getConditionBadgeStyle(cond) + ' hover:brightness-95'
                              }`}
                            >
                              <span>{cond}</span>
                              {cond === 'Repairable' && <Wrench className="w-3.5 h-3.5 shrink-0" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {itemCondition === 'Repairable' && (
                      <p className="text-[10px] font-bold text-rose-600 mt-1 flex items-center gap-1">
                        <Wrench className="w-3 h-3 shrink-0" /> Hourly repair notification active
                      </p>
                    )}
                  </div>
                )}

                <div className={`${(isMobile || isUsedCategoryName(category)) ? 'sm:col-span-7' : 'sm:col-span-12'} bg-slate-50/70 px-2.5 py-1.5 rounded-xl border border-slate-200/70`}>
                  <label className="flex items-center gap-1 font-bold text-slate-700 mb-0.5 text-[10px]">
                    <FileText className="w-3 h-3 text-blue-600" />
                    Product Note (Optional)
                  </label>
                  <input
                    type="text"
                    value={itemNote}
                    onChange={e => setItemNote(e.target.value)}
                    placeholder="e.g. Warranty details, supplier info, box condition..."
                    className="compact-mobile-input w-full bg-white border border-slate-200 rounded-lg px-2.5 h-8.5 text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              {/* If editing and stock quantity is modified, display structured Stock Adjustment audit selector */}
              {editItem && editItem.qty !== Number(qty) && (
                <div className="p-2.5 bg-amber-50/80 border border-amber-300/80 rounded-xl space-y-1.5 text-xs animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-900 flex items-center gap-1.5 text-[11px]">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      Stock Adjustment ({editItem.qty} → {Number(qty) || 0})
                    </span>
                    <span className={`tabular-nums font-bold px-2 py-0.5 rounded text-[10px] ${
                      Number(qty) > editItem.qty ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {Number(qty) > editItem.qty ? `+${Number(qty) - editItem.qty}` : `${Number(qty) - editItem.qty}`} Units
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <select
                      value={adjustmentReason}
                      onChange={e => setAdjustmentReason(e.target.value as StockAdjustmentReason)}
                      className="compact-mobile-input w-full bg-white border border-amber-300 rounded-lg px-2.5 h-8.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-amber-600"
                    >
                      <option value="Stock Correction">Stock Correction</option>
                      <option value="Damaged">Damaged</option>
                      <option value="Lost">Lost</option>
                      <option value="Manual Adjustment">Manual Adjustment</option>
                      <option value="Found Stock">Found Stock</option>
                      <option value="Other">Other</option>
                    </select>
                    <input
                      type="text"
                      value={adjustmentNotes}
                      onChange={e => setAdjustmentNotes(e.target.value)}
                      placeholder="Adjustment note (optional)"
                      className="compact-mobile-input w-full bg-white border border-amber-300 rounded-lg px-2.5 h-8.5 text-xs font-medium text-slate-800 focus:outline-none focus:border-amber-600"
                    />
                  </div>
                </div>
              )}

              {/* Mobile IMEI list (strict 1-IMEI-per-box) vs Non-Mobile Barcode */}
              {isMobile ? (
                <div className="p-2 bg-blue-50/60 border border-blue-200 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-bold text-slate-900 text-[10px] sm:text-[11px] flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      Mobile IMEI Boxes ({imeis.length} {imeis.length === 1 ? 'Unit' : 'Units'})
                    </span>
                    <span className="text-[10px] font-bold text-blue-700 px-1.5 py-0.5 rounded-md bg-blue-100/80">
                      1 Box = 1 IMEI
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5 max-h-40 overflow-y-auto pr-0.5">
                    {imeis.map((imeiVal, idx) => {
                      const singleErr = getSingleImeiError(imeiVal, idx);
                      return (
                        <div key={idx} className="space-y-0.5">
                          <div
                            className={`flex items-center gap-1 px-1.5 bg-white border rounded-lg h-8.5 ${
                              singleErr
                                ? 'border-rose-400 bg-rose-50/40'
                                : 'border-slate-200 focus-within:border-blue-500'
                            }`}
                          >
                            <span className="tabular-nums text-[10px] font-bold text-slate-500 w-6 shrink-0">
                              #{idx + 1}
                            </span>
                            <div className="relative flex-1 flex items-center min-w-0">
                              <Hash className="w-3 h-3 absolute left-1 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input
                                id={`single-imei-${idx}`}
                                type="text"
                                maxLength={MAX_SINGLE_IMEI_LENGTH}
                                value={imeiVal}
                                onChange={e => handleSingleImeiChange(idx, e.target.value)}
                                onKeyDown={e => handleSingleImeiKeyDown(e, idx)}
                                onPaste={e => handleSingleImeiPaste(e, idx)}
                                placeholder="1 IMEI (15 digits)"
                                className="compact-mobile-input w-full pl-4.5 pr-8 py-1 bg-transparent text-[11px] tabular-nums font-medium focus:outline-none rounded"
                                autoComplete="off"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  openBarcodeScanner(
                                    `Scan 1 IMEI for Device #${idx + 1}`,
                                    code => handleSingleImeiChange(idx, code)
                                  )
                                }
                                className="absolute right-0 w-7 h-7 text-blue-600 hover:bg-blue-50 rounded cursor-pointer flex items-center justify-center"
                                title="Camera Scan 1 IMEI"
                              >
                                <Camera className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          {singleErr && (
                            <p className="text-[10px] font-bold text-rose-600 px-1 flex items-center gap-1 leading-tight">
                              <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                              <span className="truncate">{singleErr}</span>
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="p-2 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <label className="font-bold text-slate-700 text-[10px] sm:text-[11px]">Barcode / Item Code</label>
                    <span className="text-[10px] text-slate-400">Used for quick POS scanning</span>
                  </div>
                  <div className="relative flex items-center">
                    <Barcode className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={barcode}
                      onChange={e => setBarcode(e.target.value)}
                      placeholder="Scan or type barcode..."
                      className="compact-mobile-input w-full pl-8 pr-20 h-9 bg-white border border-slate-200 rounded-lg text-xs tabular-nums focus:outline-none focus:border-blue-600"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openBarcodeScanner('Scan Product Barcode', code => setBarcode(code))
                      }
                      className="absolute right-1 h-7 px-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-[10px] font-extrabold flex items-center gap-1 cursor-pointer transition"
                    >
                      <Camera className="w-3 h-3" />
                      <span>Scan</span>
                    </button>
                  </div>
                </div>
              )}

            </div>
          )}
        </form>

        {/* Pinned Frosted Liquid Summary & Action Bar */}
        <div className="ios-liquid-dock relative z-10 px-3 py-2.5 sm:px-5 sm:py-3 shrink-0">
          {showVariantMode ? (
            <div className="bg-slate-900/95 text-white rounded-2xl px-3 py-2.5 sm:px-3.5 sm:py-2.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shadow-md border border-white/10">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
                <span className="font-bold text-amber-400 flex items-center gap-1 tabular-nums">
                  <Sparkles className="w-3.5 h-3.5" />
                  {totalVariantsCount} {totalVariantsCount === 1 ? 'Var' : 'Vars'} • {totalVariantsQty} Units
                </span>
                {canSeeCostAndWholesale && (
                  <span className="text-slate-300 tabular-nums">
                    Cost: <strong className="text-white">{currency} {totalVariantsCost.toLocaleString()}</strong>
                  </span>
                )}
                <span className="text-slate-300 tabular-nums">
                  Sale: <strong className="text-emerald-400">{currency} {totalVariantsSale.toLocaleString()}</strong>
                </span>
                {canSeeProfitSummary && (
                  <span className="text-slate-300 tabular-nums">
                    Profit: <strong className="text-blue-400">+{currency} {totalVariantsProfit.toLocaleString()}</strong>
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleExplicitCancel}
                  className="h-9 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition cursor-pointer flex items-center justify-center"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmit()}
                  className="h-9 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md shadow-blue-500/25 transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    {editItem
                      ? 'Save Changes'
                      : `Add ${variants.length > 1 ? `${variants.length} Vars` : 'Mobile'}`}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
              <div className="text-[10px] sm:text-[11px] text-slate-500 hidden sm:block font-medium">
                All changes sync automatically with activity logging
              </div>
              <div className="grid grid-cols-2 sm:flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExplicitCancel}
                  className="h-9 px-4 rounded-xl ios-liquid-chip text-slate-700 font-semibold text-xs transition cursor-pointer flex items-center justify-center"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmit()}
                  className="h-9 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs shadow-md shadow-blue-500/25 transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{editItem ? 'Save Changes' : 'Add to Inventory'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

      {/* Live Camera Snapshot Modal */}
      <CameraCaptureModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        title="Capture Product Photo"
        onCapture={dataUrl => {
          setImage(dataUrl);
          showToast('Product photo captured with camera!', 'success');
        }}
      />

      {/* Live Camera Barcode & IMEI Scanner Modal */}
      <BarcodeScannerModal
        isOpen={barcodeScannerOpen}
        onClose={() => {
          setBarcodeScannerOpen(false);
          setBarcodeScanCallback(null);
        }}
        title={barcodeScanTitle}
        onScan={code => {
          if (barcodeScanCallback) {
            barcodeScanCallback(code);
            showToast(`Scanned Code: ${code}`, 'success');
          }
        }}
      />
    </>
  );
};
