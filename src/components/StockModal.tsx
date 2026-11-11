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
  AlertTriangle
} from 'lucide-react';
import { useToast } from './Toast';
import { useFormDraft } from '../hooks/useFormDraft';
import { CameraCaptureModal } from './CameraCaptureModal';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { validateImeis, extractItemImeis } from '../utils/imeiManager';

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
  onStockAdjustment?: (
    adjustment: Omit<StockAdjustment, 'id' | 'adjustedAt'>
  ) => void;
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
  variants: MobileVariant[];
}

const RAM_OPTIONS = ['3GB', '4GB', '6GB', '8GB', '12GB', '16GB', '24GB'];
const STORAGE_OPTIONS = ['32GB', '64GB', '128GB', '256GB', '512GB', '1TB'];

const createDefaultVariant = (id: string, ram = '4GB', storage = '64GB'): MobileVariant => ({
  id,
  ram,
  storage,
  color: '',
  costPrice: '',
  wholesalePrice: '',
  salePrice: '',
  qty: 1,
  imeis: [''],
});

const initialStockDraft: StockDraftState = {
  name: '',
  category: 'Android Mobile',
  image: '',
  barcode: '',
  costPrice: '',
  salePrice: '',
  qty: 1,
  imeis: [''],
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
  // Exclude non-phone categories
  if (
    c.includes('keypad') ||
    c.includes('feature') ||
    c.includes('button') ||
    c.includes('accessory') ||
    c.includes('accessories') ||
    c.includes('charger') ||
    c.includes('cable') ||
    c.includes('audio') ||
    c.includes('airpod') ||
    c.includes('headphone') ||
    c.includes('repair') ||
    c.includes('part') ||
    c.includes('cover') ||
    c.includes('case') ||
    c.includes('glass') ||
    c.includes('protector')
  ) {
    return false;
  }
  return c.includes('android') || c.includes('smartphone') || (c.includes('smart') && c.includes('mobile'));
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
  onStockAdjustment,
}) => {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const [qty, setQty] = useState<number | ''>(1);
  const [color, setColor] = useState('');
  const [imeis, setImeis] = useState<string[]>(['']);

  // Stock Adjustment state for edit quantity changes
  const [adjustmentReason, setAdjustmentReason] = useState<StockAdjustmentReason>('Stock Correction');
  const [adjustmentNotes, setAdjustmentNotes] = useState('');

  // Multi-variant list for Android Mobile & mobile categories
  const [variants, setVariants] = useState<MobileVariant[]>([
    createDefaultVariant('var-1', '4GB', '64GB'),
  ]);

  // Category creation inline state
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

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
        setCategory(editItem.category || (categories[0] || ''));
        setImage(editItem.image || '');
        setBarcode(editItem.barcode || '');
        setCostPrice(editItem.costPrice);
        setSalePrice(editItem.salePrice);
        setWholesalePrice(editItem.wholesalePrice !== undefined ? editItem.wholesalePrice : '');
        setBoxSize(editItem.boxSize !== undefined ? editItem.boxSize : 10);
        setQty(editItem.qty);
        setColor(editItem.color || '');

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

        if (editItem.variants && editItem.variants.length > 0) {
          setVariants(editItem.variants.map(v => ({
            ...v,
            imeis: v.imeis && v.imeis.length > 0 ? [...v.imeis] : Array(Math.max(1, Number(v.qty) || 1)).fill(''),
          })));
        } else if (isMobileCategory(editItem.category)) {
          // If mobile category without variants, seed the current item as Variant #1
          const parenMatch = editItem.name.match(/\(([^)]+)\)/);
          const parenColor = parenMatch ? parenMatch[1].trim() : '';
          setVariants([{
            id: 'var-1',
            ram: editItem.ram || (isKeypadCategory(editItem.category) ? '' : '6GB'),
            storage: editItem.storage || (isKeypadCategory(editItem.category) ? '' : '128GB'),
            color: editItem.color || parenColor || '',
            costPrice: editItem.costPrice,
            wholesalePrice: editItem.wholesalePrice !== undefined ? editItem.wholesalePrice : '',
            salePrice: editItem.salePrice,
            qty: editItem.qty || 1,
            imeis: existingImeis.length > 0 ? existingImeis : [''],
          }]);
        }
      } else {
        isEditingRef.current = false;
        // Pre-select last chosen category so adding multiple items in the same category is sticky & fast
        const lastCategory = getLastSelectedCategory(categories);
        setName(draftData.name || '');
        setCategory(lastCategory);
        setImage(draftData.image || '');
        setBarcode(draftData.barcode || '');
        setCostPrice(draftData.costPrice !== undefined ? draftData.costPrice : '');
        setSalePrice(draftData.salePrice !== undefined ? draftData.salePrice : '');
        setWholesalePrice('');
        setBoxSize(10);
        setQty(draftData.qty !== undefined ? draftData.qty : 1);
        setColor('');
        setImeis(draftData.imeis && draftData.imeis.length > 0 ? [...draftData.imeis] : ['']);

        if (draftData.variants && draftData.variants.length > 0 && isAndroidCategory(lastCategory)) {
          setVariants(draftData.variants.map(v => ({ ...v, imeis: [...(v.imeis || [''])] })));
        } else {
          const isAndroidLast = isAndroidCategory(lastCategory);
          setVariants([createDefaultVariant('var-1', isAndroidLast ? '6GB' : '', isAndroidLast ? '128GB' : '')]);
        }
      }
      setIsCreatingCategory(false);
      setNewCategoryName('');
    }
    prevIsOpenRef.current = isOpen;
    prevEditItemRef.current = editItem;
  }, [isOpen, editItem, categories]);

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
        variants,
      });
    }, 400);

    return () => {
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current);
      }
    };
  }, [name, category, image, barcode, costPrice, salePrice, qty, imeis, variants, editItem, isOpen, setDraftData]);

  const isAndroid = isAndroidCategory(category);
  const isKeypad = isKeypadCategory(category);
  const isMobile = isMobileCategory(category);

  useEffect(() => {
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
    const soldMap = new Map<string, string>(); // lowercase imei -> invoice #
    const returnsMap = new Map<string, string>(); // lowercase imei -> return #

    for (const item of inventory) {
      if (editItem && item.id === editItem.id) continue;
      if (item.status === 'ARCHIVED') continue;
      const itemImeis = extractItemImeis(item);
      for (const im of itemImeis) {
        invMap.set(im.toLowerCase(), item.name);
      }
    }

    for (const rec of imeiRecords) {
      if (rec.status === 'SOLD') {
        soldMap.set(rec.imei.toLowerCase(), rec.invoiceNo || 'Sold Record');
      }
    }

    for (const s of sales) {
      for (const item of s.items) {
        const itemImeis = extractItemImeis(item);
        for (const im of itemImeis) {
          if (!soldMap.has(im.toLowerCase())) {
            soldMap.set(im.toLowerCase(), s.invNo);
          }
        }
      }
    }

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

    const newVar: MobileVariant = {
      id: 'var-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5),
      ram: nextRam,
      storage: nextStorage,
      color: '',
      costPrice: lastVar?.costPrice !== undefined ? lastVar.costPrice : '',
      wholesalePrice: lastVar?.wholesalePrice !== undefined ? lastVar.wholesalePrice : '',
      salePrice: lastVar?.salePrice !== undefined ? lastVar.salePrice : '',
      qty: 1,
      imeis: [''],
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
      costPrice: source.costPrice,
      wholesalePrice: source.wholesalePrice,
      salePrice: source.salePrice,
      qty: newQty,
      imeis: Array(newQty).fill(''),
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
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };
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

  const handleVariantImeiChange = (variantIdx: number, imeiIdx: number, rawValue: string) => {
    // Sanitize any carriage return/newline injected by barcode scanner
    const value = rawValue.replace(/[\r\n\t]/g, '').trimStart();
    setVariants(prev => {
      const copy = [...prev];
      const target = { ...copy[variantIdx] };
      const imeisCopy = [...(target.imeis || [])];
      imeisCopy[imeiIdx] = value;
      target.imeis = imeisCopy;
      copy[variantIdx] = target;
      return copy;
    });
  };

  const handleVariantImeiKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    variantIdx: number,
    imeiIdx: number
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();

      const currentVal = variants[variantIdx]?.imeis?.[imeiIdx]?.trim();
      if (currentVal) {
        showToast(`IMEI #${imeiIdx + 1} scanned!`, 'info');
      }

      // Try focusing next IMEI in the same variant
      const nextSameVariant = document.getElementById(`variant-imei-${variantIdx}-${imeiIdx + 1}`);
      if (nextSameVariant) {
        nextSameVariant.focus();
        return;
      }

      // Try focusing first IMEI in the next variant
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

    // Check if multiple IMEIs are in pasted text (split by newlines, commas, or spaces)
    const tokens = pasted
      .split(/[\r\n,]+/)
      .map(t => t.trim())
      .filter(Boolean);

    if (tokens.length > 1) {
      e.preventDefault();
      setVariants(prev => {
        const copy = [...prev];
        const target = { ...copy[variantIdx] };
        const imeisCopy = [...(target.imeis || [])];

        for (let i = 0; i < tokens.length; i++) {
          const targetIndex = imeiIdx + i;
          if (targetIndex < imeisCopy.length) {
            imeisCopy[targetIndex] = tokens[i].replace(/[^0-9a-zA-Z]/g, '');
          }
        }

        target.imeis = imeisCopy;
        copy[variantIdx] = target;
        return copy;
      });
      showToast(`${tokens.length} IMEIs populated from scan/paste!`, 'success');
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
    const value = rawValue.replace(/[\r\n\t]/g, '').trimStart();
    setImeis(prev => {
      const copy = [...prev];
      copy[index] = value;
      return copy;
    });
  };

  const handleSingleImeiKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    index: number
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();

      const currentVal = imeis[index]?.trim();
      if (currentVal) {
        showToast(`Device #${index + 1} IMEI scanned!`, 'info');
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

    const tokens = pasted
      .split(/[\r\n,]+/)
      .map(t => t.trim())
      .filter(Boolean);

    if (tokens.length > 1) {
      e.preventDefault();
      setImeis(prev => {
        const copy = [...prev];
        for (let i = 0; i < tokens.length; i++) {
          const targetIndex = index + i;
          if (targetIndex < copy.length) {
            copy[targetIndex] = tokens[i].replace(/[^0-9a-zA-Z]/g, '');
          }
        }
        return copy;
      });
      showToast(`${tokens.length} IMEIs populated from scan/paste!`, 'success');
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

  // Totals calculations for mobile variants
  const totalVariantsCount = variants.length;
  const totalVariantsQty = variants.reduce((acc, v) => acc + (Number(v.qty) || 0), 0);
  const totalVariantsCost = variants.reduce(
    (acc, v) => acc + (Number(v.costPrice) || 0) * (Number(v.qty) || 0),
    0
  );
  const totalVariantsSale = variants.reduce(
    (acc, v) => acc + (Number(v.salePrice) || 0) * (Number(v.qty) || 0),
    0
  );
  const totalVariantsProfit = totalVariantsSale - totalVariantsCost;

  // Submit Handler
  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim()) {
      showToast('Product Title / Model Name is required (e.g. Samsung Galaxy A15)', 'warning');
      return;
    }

    // UNIFIED MULTI-VARIANT FLOW FOR ANDROID & KEYPAD (Single unified product with variants array)
    if (isAndroid || isKeypad) {
      if (variants.length === 0) {
        showToast('Please add at least one mobile variant', 'warning');
        return;
      }

      // 1. Synchronize every variant's imeis array exactly with its quantity
      const synchronizedVariants = variants.map(v => {
        const qty = Math.max(1, Number(v.qty) || 1);
        const curImeis = v.imeis || [];
        const nextImeis = [...curImeis];
        while (nextImeis.length < qty) nextImeis.push('');
        return {
          ...v,
          qty,
          imeis: nextImeis.slice(0, qty),
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
        const quantity = Math.max(1, Number(v.qty) || 1);

        if (cost < 0 || sale < 0 || quantity < 1) {
          showToast(`Variant #${i + 1} has invalid price or quantity`, 'error');
          return;
        }
      }

      const totalQuantity = synchronizedVariants.reduce((sum, v) => sum + (Number(v.qty) || 0), 0);
      const primaryCost = Number(synchronizedVariants[0]?.costPrice) || 0;
      const primarySale = Number(synchronizedVariants[0]?.salePrice) || 0;
      const primaryWholesale = synchronizedVariants[0]?.wholesalePrice !== '' && synchronizedVariants[0]?.wholesalePrice !== undefined
        ? Number(synchronizedVariants[0]?.wholesalePrice)
        : Math.round(primarySale * 0.9);

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
          adjustedBy: 'Admin',
        });
      }

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
        variants: synchronizedVariants,
      };

      onSave(singleProduct, editItem ? editItem.id : undefined, adjustmentData);
      showToast(
        editItem
          ? `Product "${singleProduct.name}" updated with ${synchronizedVariants.length} variants!`
          : `Product "${singleProduct.name}" added with ${synchronizedVariants.length} variants!`,
        'success'
      );
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
      const cost = Number(costPrice) || 0;
      const sale = Number(salePrice) || 0;
      const wholesale = wholesalePrice !== '' ? Number(wholesalePrice) : Math.round(sale * 0.9);
      const quantity = Number(qty) || 0;

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
          inventory,
          imeiRecords,
          sales,
        });

        if (!validation.valid) {
          showToast(validation.error || 'Invalid IMEI entry', 'error');
          return;
        }

        finalImeis = cleaned.length > 0 ? cleaned : undefined;
        finalImeiStr = cleaned.length > 0 ? cleaned.join(', ') : undefined;
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
          adjustedBy: 'Admin',
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
          color: color.trim() || undefined,
          status: editItem?.status || 'ACTIVE',
        },
        editItem ? editItem.id : undefined,
        adjustmentData
      );

      showToast(editItem ? 'Product updated successfully' : 'Product added to stock', 'success');
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-w-full overflow-x-hidden p-3.5 sm:p-6 shadow-2xl space-y-4 border border-slate-100 animate-in fade-in zoom-in-95 max-h-[94dvh] lg:max-h-[94vh] overflow-y-auto flex flex-col my-auto">
        {/* Header */}
        <div className="flex items-start sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold shadow-2xs shrink-0">
              {isMobile ? <Smartphone className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" /> : <Package className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-extrabold text-slate-900 text-xs sm:text-base leading-tight truncate">
                  {editItem
                    ? 'Edit Product'
                    : isAndroid
                    ? 'Add Android Mobile (Variants)'
                    : isKeypad
                    ? 'Add Keypad Phone (IMEI & Color)'
                    : 'Add New Product to Inventory'}
                </h3>
                {isAndroid && !editItem && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 flex items-center gap-1 shrink-0">
                    <Sparkles className="w-3 h-3" /> Multi-Variant
                  </span>
                )}
                {isKeypad && !editItem && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 flex items-center gap-1 shrink-0">
                    📱 Keypad / Feature
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer shrink-0 ml-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
              e.preventDefault();
            }
          }}
          className="space-y-4 text-xs"
        >
          {/* Top Section: Photo + Base Model + Category */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80">
            {/* Product Image / Camera Snapshot */}
            <div className="sm:col-span-4 flex items-center gap-3">
              {image ? (
                <div className="relative w-16 h-16 rounded-xl border border-slate-200 overflow-hidden bg-white shrink-0 shadow-2xs">
                  <img src={image} alt="Preview" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="absolute top-0.5 right-0.5 bg-rose-600 text-white rounded-full p-0.5 hover:bg-rose-700 cursor-pointer"
                    title="Remove Photo"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="w-16 h-16 rounded-xl border border-dashed border-slate-300 bg-white flex items-center justify-center text-slate-400 shrink-0">
                  <ImageIcon className="w-6 h-6 text-slate-300" />
                </div>
              )}

              <div className="flex-1 space-y-1">
                <span className="block font-bold text-slate-700 text-[11px]">Product Photo</span>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageFileChange}
                  accept="image/png, image/jpeg, image/jpg, image/webp"
                  className="hidden"
                  id="stock-image-file"
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  <label
                    htmlFor="stock-image-file"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-lg text-[11px] cursor-pointer transition border border-slate-200 shadow-2xs"
                  >
                    <Upload className="w-3 h-3 text-blue-600" />
                    <span>{image ? 'Change' : 'Upload'}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsCameraOpen(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold rounded-lg text-[11px] cursor-pointer transition border border-emerald-200 shadow-2xs"
                  >
                    <Camera className="w-3 h-3 text-emerald-600" />
                    <span>Camera</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Model Name & Category */}
            <div className="sm:col-span-8 space-y-2.5">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isMobile ? 'Mobile Model Name / Base Title *' : 'Product Title / Name *'}
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={
                    isMobile
                      ? 'e.g. Samsung Galaxy A15, Infinix Note 40, Redmi Note 13'
                      : 'e.g. 20W Fast Charger Type-C, Handsfree PureBass'
                  }
                  className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-blue-600 shadow-2xs min-h-[44px]"
                />
              </div>

              {/* Category selector + Inline category creation */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">Category</label>
                  {!isCreatingCategory ? (
                    <button
                      type="button"
                      onClick={() => setIsCreatingCategory(true)}
                      className="text-blue-600 hover:text-blue-700 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> Create Category
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsCreatingCategory(false)}
                      className="text-slate-400 hover:text-slate-600 text-[11px] cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                </div>

                {isCreatingCategory ? (
                  <div className="flex items-center gap-2 p-1.5 bg-blue-50/80 border border-blue-200 rounded-xl">
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={e => setNewCategoryName(e.target.value)}
                      placeholder="Enter new category name..."
                      className="flex-1 bg-white border border-blue-300 rounded-lg px-2.5 py-1.5 text-xs font-medium focus:outline-none"
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
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs transition cursor-pointer flex items-center gap-1 shrink-0 shadow-2xs"
                    >
                      <Check className="w-3 h-3" /> Save
                    </button>
                  </div>
                ) : (
                  <select
                    value={category}
                    onChange={e => handleSelectCategory(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-blue-600 shadow-2xs min-h-[44px]"
                  >
                    {categories.map(c => (
                      <option key={c} value={c}>
                        {c} {isMobileCategory(c) ? '📱 (Mobile Phone)' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>

          {/* ========================================================= */}
          {/* MOBILE & KEYPAD MULTI-VARIANT / COLOR SYSTEM               */}
          {/* ========================================================= */}
          {(isAndroid || isKeypad) ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-600" />
                  <span className="font-bold text-slate-900 text-xs sm:text-sm">
                    {isKeypad ? `Color Variants (${variants.length})` : `Mobile Variants (${variants.length})`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleAddVariant}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isKeypad ? 'Add Color Variant' : 'Add Variant'}</span>
                </button>
              </div>

              {/* Variant Cards */}
              <div className="space-y-3.5">
                {variants.map((v, vIdx) => {
                  const currentQty = Math.max(1, Number(v.qty) || 1);
                  const marginVal =
                    Number(v.salePrice) > 0 && Number(v.costPrice) > 0
                      ? Number(v.salePrice) - Number(v.costPrice)
                      : 0;
                  const marginPct =
                    marginVal > 0 && Number(v.costPrice) > 0
                      ? Math.round((marginVal / Number(v.costPrice)) * 100)
                      : 0;

                  return (
                    <div
                      key={v.id || vIdx}
                      className="bg-white border-2 border-slate-200/90 rounded-2xl p-4 space-y-3 shadow-xs hover:border-blue-300 transition"
                    >
                      {/* Variant Card Header */}
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
                            #{vIdx + 1}
                          </span>
                          <span className="font-extrabold text-slate-800 text-xs sm:text-sm">
                            {isKeypad
                              ? `Color Variant #${vIdx + 1}: ${v.color?.trim() || 'Specify Color'}`
                              : `Variant ${vIdx + 1}: ${v.ram || 'RAM'} / ${v.storage || 'ROM'} ${v.color ? `- ${v.color}` : ''}`}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-slate-100 text-slate-600">
                            {currentQty} {currentQty === 1 ? 'Unit' : 'Units'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleDuplicateVariant(vIdx)}
                            className="text-slate-500 hover:text-blue-600 p-1.5 rounded-lg hover:bg-slate-100 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                            title="Duplicate this variant"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Duplicate</span>
                          </button>
                          {variants.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveVariant(vIdx)}
                              className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                              title="Delete variant"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Specs Row: RAM & Storage for Android OR Color for Keypad */}
                      {isKeypad ? (
                        <div className="space-y-1.5 bg-purple-50/60 p-3 rounded-xl border border-purple-200/80">
                          <label className="font-bold text-purple-900 flex items-center gap-1 text-xs">
                            <Palette className="w-4 h-4 text-purple-600" /> Phone Color *
                          </label>
                          <input
                            type="text"
                            required
                            value={v.color || ''}
                            onChange={e => handleUpdateVariantField(vIdx, 'color', e.target.value)}
                            placeholder="e.g. Black, Blue, White, Gold, Red"
                            className="w-full bg-white border border-purple-300 rounded-lg px-3 py-2 text-xs font-bold text-purple-950 focus:outline-none focus:border-purple-600 shadow-2xs min-h-[44px]"
                          />
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                          {/* RAM Selector */}
                          <div className="sm:col-span-5 space-y-1.5">
                            <label className="font-bold text-slate-700 flex items-center gap-1 text-[11px]">
                              <Cpu className="w-3.5 h-3.5 text-blue-600" /> RAM Memory
                            </label>
                            <div className="flex flex-wrap gap-1">
                              {RAM_OPTIONS.map(ramOption => (
                                <button
                                  key={ramOption}
                                  type="button"
                                  onClick={() => handleUpdateVariantField(vIdx, 'ram', ramOption)}
                                  className={`px-2 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                                    v.ram === ramOption
                                      ? 'bg-blue-600 text-white shadow-2xs'
                                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                  }`}
                                >
                                  {ramOption}
                                </button>
                              ))}
                            </div>
                            <input
                              type="text"
                              value={v.ram}
                              onChange={e => handleUpdateVariantField(vIdx, 'ram', e.target.value)}
                              placeholder="Custom RAM (e.g. 8GB)"
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-[11px] font-semibold focus:outline-none focus:border-blue-600"
                            />
                          </div>

                          {/* Storage Selector */}
                          <div className="sm:col-span-4 space-y-1.5">
                            <label className="font-bold text-slate-700 flex items-center gap-1 text-[11px]">
                              <HardDrive className="w-3.5 h-3.5 text-indigo-600" /> Storage (ROM)
                            </label>
                            <div className="flex flex-wrap gap-1">
                              {STORAGE_OPTIONS.map(storageOption => (
                                <button
                                  key={storageOption}
                                  type="button"
                                  onClick={() =>
                                    handleUpdateVariantField(vIdx, 'storage', storageOption)
                                  }
                                  className={`px-2 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                                    v.storage === storageOption
                                      ? 'bg-indigo-600 text-white shadow-2xs'
                                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                  }`}
                                >
                                  {storageOption}
                                </button>
                              ))}
                            </div>
                            <input
                              type="text"
                              value={v.storage}
                              onChange={e => handleUpdateVariantField(vIdx, 'storage', e.target.value)}
                              placeholder="Custom ROM (e.g. 128GB)"
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-[11px] font-semibold focus:outline-none focus:border-indigo-600"
                            />
                          </div>

                          {/* Color / Edition */}
                          <div className="sm:col-span-3 space-y-1.5">
                            <label className="font-bold text-slate-700 flex items-center gap-1 text-[11px]">
                              <Palette className="w-3.5 h-3.5 text-purple-600" /> Color / Edition
                            </label>
                            <input
                              type="text"
                              value={v.color || ''}
                              onChange={e => handleUpdateVariantField(vIdx, 'color', e.target.value)}
                              placeholder="e.g. Black, Blue"
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold focus:outline-none focus:border-purple-600"
                            />
                          </div>
                        </div>
                      )}

                      {/* Pricing & Quantity Row */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5 bg-slate-50/80 p-2.5 sm:p-3 rounded-xl border border-slate-200/70 items-center">
                        <div>
                          <label className="block font-bold text-slate-700 mb-1 text-[10px] sm:text-[11px] truncate" title="Cost Price">
                            1. Cost ({currency}) *
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
                            className="w-full bg-white border border-slate-200 rounded-lg px-2 sm:px-2.5 py-2 text-xs font-mono font-bold focus:outline-none focus:border-blue-600 min-h-[44px]"
                          />
                        </div>

                        <div>
                          <label className="block font-bold text-purple-900 mb-1 text-[10px] sm:text-[11px] truncate" title="Wholesale Price">
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
                            className="w-full bg-purple-50/70 border border-purple-200 rounded-lg px-2 sm:px-2.5 py-2 text-xs font-mono font-bold text-purple-950 focus:outline-none focus:border-purple-600 min-h-[44px]"
                          />
                        </div>

                        <div>
                          <label className="block font-bold text-slate-700 mb-1 text-[10px] sm:text-[11px] truncate" title="Sale Price">
                            3. Sale ({currency}) *
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
                            className="w-full bg-white border border-slate-200 rounded-lg px-2 sm:px-2.5 py-2 text-xs font-mono font-bold focus:outline-none focus:border-blue-600 min-h-[44px]"
                          />
                        </div>

                        <div>
                          <label className="block font-bold text-slate-700 mb-1 text-[10px] sm:text-[11px] truncate" title="Quantity">
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
                            placeholder="1"
                            className="w-full bg-white border border-blue-400 rounded-lg px-2 sm:px-2.5 py-2 text-xs font-mono font-extrabold text-blue-700 focus:outline-none focus:border-blue-600 min-h-[44px]"
                          />
                        </div>
                      </div>

                      {/* Margin badge if both prices set */}
                      {marginVal > 0 && (
                        <div className="flex items-center gap-2 text-[11px] text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200/80 font-medium">
                          <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                          <span>
                            Estimated Margin: <strong>{currency} {marginVal.toLocaleString()}</strong> ({marginPct}%) per unit
                          </span>
                        </div>
                      )}

                      {/* DYNAMIC IMEI BOXES: Exactly matches the Quantity entered for this variant! */}
                      <div className="p-3 bg-blue-50/60 border border-blue-200/80 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 text-[11px] flex items-center gap-1.5">
                            <Smartphone className="w-3.5 h-3.5 text-blue-600" />
                            IMEI Numbers for Variant #{vIdx + 1} ({v.imeis.length} {v.imeis.length === 1 ? 'Box' : 'Boxes'} for {v.qty || 1} units)
                          </span>
                          <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                            1 IMEI per phone
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                          {v.imeis.map((imeiStr, imeiIdx) => {
                            const imeiErr = getVariantImeiError(imeiStr, vIdx);
                            return (
                              <div key={imeiIdx} className="flex flex-col">
                                <div
                                  className={`flex items-center gap-1.5 p-1.5 rounded-xl border transition min-h-[44px] ${
                                    imeiErr
                                      ? 'bg-rose-50/90 border-rose-400 ring-1 ring-rose-300'
                                      : 'bg-white border-slate-200'
                                  }`}
                                >
                                  <span
                                    className={`font-mono text-[10px] font-bold w-14 shrink-0 ${
                                      imeiErr ? 'text-rose-600' : 'text-slate-500'
                                    }`}
                                  >
                                    IMEI #{imeiIdx + 1}:
                                  </span>
                                  <div className="relative flex-1 flex items-center min-h-[40px]">
                                    <Hash
                                      className={`w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 ${
                                        imeiErr ? 'text-rose-500' : 'text-slate-400'
                                      }`}
                                    />
                                    <input
                                      id={`variant-imei-${vIdx}-${imeiIdx}`}
                                      type="text"
                                      value={imeiStr}
                                      onChange={e =>
                                        handleVariantImeiChange(vIdx, imeiIdx, e.target.value)
                                      }
                                      onKeyDown={e => handleVariantImeiKeyDown(e, vIdx, imeiIdx)}
                                      onPaste={e => handleVariantImeiPaste(e, vIdx, imeiIdx)}
                                      placeholder={`Unit #${imeiIdx + 1} IMEI`}
                                      className="w-full pl-6 pr-10 py-2 bg-transparent text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 rounded min-h-[40px]"
                                      autoComplete="off"
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openBarcodeScanner(
                                          `Scan IMEI for Variant #${vIdx + 1} Unit #${imeiIdx + 1}`,
                                          code => handleVariantImeiChange(vIdx, imeiIdx, code)
                                        )
                                      }
                                      className="absolute right-0.5 p-2 text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center"
                                      title="Camera Scan IMEI"
                                    >
                                      <Camera className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                                {imeiErr && (
                                  <div className="flex items-center gap-1 text-[10px] font-semibold text-rose-600 mt-1 px-1">
                                    <AlertTriangle className="w-3 h-3 shrink-0" />
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

              {/* Add Variant Button */}
              <button
                type="button"
                onClick={handleAddVariant}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-dashed border-slate-300 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4 text-blue-600" />
                <span>+ Add Another Mobile Variant (Different RAM / ROM / Color)</span>
              </button>

              {/* Multi-Variant Financial Summary Card */}
              <div className="p-3.5 bg-slate-900 text-white rounded-2xl space-y-2 shadow-sm">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300 border-b border-slate-800 pb-2">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Overall Batch Summary
                  </span>
                  <span className="text-amber-400 font-mono">
                    {totalVariantsCount} {totalVariantsCount === 1 ? 'Variant' : 'Variants'} | {totalVariantsQty} Total Units
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-slate-800/80 p-2 rounded-xl">
                    <span className="text-[10px] text-slate-400 block">Total Investment</span>
                    <span className="font-mono font-bold text-white text-xs sm:text-sm">
                      {currency} {totalVariantsCost.toLocaleString()}
                    </span>
                  </div>
                  <div className="bg-slate-800/80 p-2 rounded-xl">
                    <span className="text-[10px] text-slate-400 block">Total Expected Sale</span>
                    <span className="font-mono font-bold text-emerald-400 text-xs sm:text-sm">
                      {currency} {totalVariantsSale.toLocaleString()}
                    </span>
                  </div>
                  <div className="bg-slate-800/80 p-2 rounded-xl">
                    <span className="text-[10px] text-slate-400 block">Projected Profit</span>
                    <span className="font-mono font-bold text-blue-400 text-xs sm:text-sm">
                      +{currency} {totalVariantsProfit.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ========================================================= */
            /* SINGLE PRODUCT MODE / KEYPAD PHONE / ACCESSORIES / EDIT   */
            /* ========================================================= */
            <div className="space-y-4">
              {/* If Keypad Phone or editing mobile phone, show Color input */}
              {(isKeypad || (editItem && isMobile)) && (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <label className="block font-bold text-slate-700 mb-1 text-[11px] flex items-center gap-1">
                    <Palette className="w-3.5 h-3.5 text-purple-600" /> Phone Color
                  </label>
                  <input
                    type="text"
                    value={color}
                    onChange={e => setColor(e.target.value)}
                    placeholder="e.g. Black, Blue, White, Gold, Red"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold focus:outline-none focus:border-blue-600 min-h-[44px]"
                  />
                </div>
              )}

              {/* Pricing & Quantity Row: 1. Cost Price -> 2. Wholesale Price -> 3. Sale Price -> Quantity */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                {/* 1. Cost Price */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1 text-[10px] sm:text-xs truncate" title="Cost Price">
                    1. Cost Price ({currency}) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={costPrice}
                    onChange={e => setCostPrice(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="Cost Price"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 sm:px-3 py-2 text-xs font-mono font-semibold focus:outline-none focus:border-blue-600 focus:bg-white transition min-h-[44px]"
                  />
                </div>

                {/* 2. Wholesale Price */}
                <div>
                  <label className="block font-bold text-purple-900 mb-1 text-[10px] sm:text-xs truncate" title="Wholesale Price">
                    2. Wholesale ({currency})
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={wholesalePrice}
                    onChange={e => setWholesalePrice(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="Wholesale Rate"
                    className="w-full bg-purple-50/60 border border-purple-200 rounded-xl px-2.5 sm:px-3 py-2 text-xs font-mono font-semibold text-purple-950 focus:outline-none focus:border-purple-600 focus:bg-white transition min-h-[44px]"
                  />
                </div>

                {/* 3. Sale Price */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1 text-[10px] sm:text-xs truncate" title="Sale Price">
                    3. Sale Price ({currency}) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={salePrice}
                    onChange={e => setSalePrice(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="Sale Price"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 sm:px-3 py-2 text-xs font-mono font-semibold focus:outline-none focus:border-blue-600 focus:bg-white transition min-h-[44px]"
                  />
                </div>

                {/* 4. Quantity */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1 text-[10px] sm:text-xs truncate" title="Quantity">
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
                    placeholder="1"
                    className="w-full bg-slate-50 border border-blue-400 rounded-xl px-2.5 sm:px-3 py-2 text-xs font-mono font-bold text-blue-700 focus:outline-none focus:border-blue-600 focus:bg-white transition min-h-[44px]"
                  />
                </div>
              </div>

              {/* If editing and stock quantity is modified, display structured Stock Adjustment audit selector */}
              {editItem && editItem.qty !== Number(qty) && (
                <div className="p-3 bg-amber-50/80 border border-amber-300/80 rounded-2xl space-y-2 text-xs animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-900 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      Stock Adjustment Audit Log (Audit Trail)
                    </span>
                    <span className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                      Number(qty) > editItem.qty ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {Number(qty) > editItem.qty ? `+${Number(qty) - editItem.qty}` : `${Number(qty) - editItem.qty}`} Units
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-800/80">
                    Previous Stock: <strong>{editItem.qty}</strong> $\rightarrow$ New Stock: <strong>{Number(qty) || 0}</strong>. Please select the reason for this manual stock quantity change:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-amber-900 uppercase mb-1">
                        Adjustment Reason *
                      </label>
                      <select
                        value={adjustmentReason}
                        onChange={e => setAdjustmentReason(e.target.value as StockAdjustmentReason)}
                        className="w-full bg-white border border-amber-300 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-amber-600"
                      >
                        <option value="Stock Correction">Stock Correction</option>
                        <option value="Damaged">Damaged</option>
                        <option value="Lost">Lost</option>
                        <option value="Manual Adjustment">Manual Adjustment</option>
                        <option value="Found Stock">Found Stock</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-amber-900 uppercase mb-1">
                        Adjustment Note (Optional)
                      </label>
                      <input
                        type="text"
                        value={adjustmentNotes}
                        onChange={e => setAdjustmentNotes(e.target.value)}
                        placeholder="e.g. Physical inventory count verified"
                        className="w-full bg-white border border-amber-300 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:border-amber-600"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Mobile IMEI list vs Non-Mobile Barcode */}
              {isMobile ? (
                <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                      <Smartphone className="w-4 h-4 text-blue-600" />
                      Mobile IMEI Registration ({imeis.length} {imeis.length === 1 ? 'Unit' : 'Units'})
                    </span>
                    <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                      1 IMEI per device
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Quantity is {qty}. Each device has its dedicated IMEI field below:
                  </p>

                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {imeis.map((imeiVal, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-bold text-slate-600 w-16 shrink-0">
                          IMEI #{idx + 1}:
                        </span>
                        <div className="relative flex-1 flex items-center">
                          <Hash className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            id={`single-imei-${idx}`}
                            type="text"
                            value={imeiVal}
                            onChange={e => handleSingleImeiChange(idx, e.target.value)}
                            onKeyDown={e => handleSingleImeiKeyDown(e, idx)}
                            onPaste={e => handleSingleImeiPaste(e, idx)}
                            placeholder={`Device #${idx + 1} IMEI`}
                            className="w-full pl-8 pr-12 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500 transition min-h-[42px]"
                            autoComplete="off"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              openBarcodeScanner(
                                `Scan IMEI for Device #${idx + 1}`,
                                code => handleSingleImeiChange(idx, code)
                              )
                            }
                            className="absolute right-1.5 p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer"
                            title="Camera Scan IMEI"
                          >
                            <Camera className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-1.5">
                  <label className="block font-bold text-slate-700 text-xs">Barcode / Item Code</label>
                  <div className="relative flex items-center">
                    <Barcode className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={barcode}
                      onChange={e => setBarcode(e.target.value)}
                      placeholder="Scan or type barcode..."
                      className="w-full pl-8 pr-20 sm:pr-24 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:border-blue-600 min-h-[44px]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openBarcodeScanner('Scan Product Barcode', code => setBarcode(code))
                      }
                      className="absolute right-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-extrabold flex items-center gap-1 cursor-pointer transition min-h-[34px]"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>Scan</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Non-mobile items use barcode for rapid checkout scanning.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons Footer */}
          <div className="pt-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-slate-100">
            <div className="text-[11px] text-slate-400">
              {isMobile && !editItem
                ? `Will save ${variants.length} variant ${variants.length === 1 ? 'item' : 'items'} to stock`
                : 'All fields saved with automatic activity logging'}
            </div>
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleExplicitCancel}
                className="w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium text-xs transition cursor-pointer text-center"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSubmit()}
                className="w-full sm:w-auto px-5 py-2.5 sm:py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>
                  {editItem
                    ? 'Save Changes'
                    : isMobile
                    ? `Add ${variants.length > 1 ? `${variants.length} Variants` : 'Mobile'} to Stock`
                    : 'Add to Inventory'}
                </span>
              </button>
            </div>
          </div>
        </form>
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
    </div>
  );
};
