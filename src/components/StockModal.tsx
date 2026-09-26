import React, { useState, useEffect, useRef } from 'react';
import { InventoryItem } from '../types';
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
  RotateCcw
} from 'lucide-react';
import { useToast } from './Toast';
import { useFormDraft } from '../hooks/useFormDraft';

interface StockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: Omit<InventoryItem, 'id' | 'createdAt'>, existingId?: string) => void;
  editItem?: InventoryItem | null;
  currency: string;
  categories: string[];
  onAddCategory: (categoryName: string) => void;
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
}

const initialStockDraft: StockDraftState = {
  name: '',
  category: 'Android Mobile',
  image: '',
  barcode: '',
  costPrice: '',
  salePrice: '',
  qty: 1,
  imeis: [''],
};

export const isMobileCategory = (cat: string): boolean => {
  const c = cat.toLowerCase().trim();
  return (
    c === 'android mobile' ||
    c === 'keypad mobile' ||
    c.includes('mobile') ||
    c.includes('phone')
  );
};

export const StockModal: React.FC<StockModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editItem,
  currency,
  categories,
  onAddCategory,
}) => {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imeiInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [draftData, setDraftData, resetDraft, hasActiveDraft] = useFormDraft<StockDraftState>(
    'stock_add_modal_form',
    initialStockDraft
  );

  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>('Android Mobile');
  const [image, setImage] = useState<string>('');
  const [barcode, setBarcode] = useState('');
  const [costPrice, setCostPrice] = useState<number | ''>('');
  const [salePrice, setSalePrice] = useState<number | ''>('');
  const [qty, setQty] = useState<number | ''>(1);
  const [imeis, setImeis] = useState<string[]>(['']);

  // Inline custom category creation state
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  useEffect(() => {
    if (editItem) {
      setName(editItem.name);
      setCategory(editItem.category || 'Android Mobile');
      setImage(editItem.image || '');
      setBarcode(editItem.barcode || '');
      setCostPrice(editItem.costPrice);
      setSalePrice(editItem.salePrice);
      setQty(editItem.qty);

      // Handle IMEIs
      if (editItem.imeis && editItem.imeis.length > 0) {
        setImeis(editItem.imeis);
      } else if (editItem.imei) {
        const split = editItem.imei.split(',').map(s => s.trim()).filter(Boolean);
        setImeis(split.length > 0 ? split : [editItem.imei]);
      } else {
        const q = Math.max(1, editItem.qty || 1);
        setImeis(Array(q).fill(''));
      }
    } else {
      // Restore from persistent draft if available
      setName(draftData.name || '');
      setCategory(draftData.category || categories[0] || 'Android Mobile');
      setImage(draftData.image || '');
      setBarcode(draftData.barcode || '');
      setCostPrice(draftData.costPrice !== undefined ? draftData.costPrice : '');
      setSalePrice(draftData.salePrice !== undefined ? draftData.salePrice : '');
      setQty(draftData.qty !== undefined ? draftData.qty : 1);
      setImeis(draftData.imeis && draftData.imeis.length > 0 ? draftData.imeis : ['']);
    }
    setIsCreatingCategory(false);
    setNewCategoryName('');
  }, [editItem, isOpen, categories, draftData]);

  // Sync back to draft if adding new item
  const updateField = (field: keyof StockDraftState, val: any) => {
    if (!editItem) {
      setDraftData(prev => ({ ...prev, [field]: val }));
    }
  };

  // Synchronize imeis array with quantity when category is a mobile category
  const handleQtyChange = (val: number | '') => {
    setQty(val);
    if (val !== '' && isMobileCategory(category)) {
      const targetCount = Math.max(1, Math.min(100, Math.floor(Number(val))));
      setImeis(prev => {
        const next = [...prev];
        while (next.length < targetCount) next.push('');
        return next.slice(0, targetCount);
      });
    }
  };

  const handleImeiChange = (index: number, value: string) => {
    setImeis(prev => {
      const copy = [...prev];
      copy[index] = value;
      return copy;
    });
  };

  // Image upload handler
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
        showToast('Product image uploaded', 'info');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setImage('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Custom category creation
  const handleSaveNewCategory = (e: React.MouseEvent) => {
    e.preventDefault();
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      showToast('Please enter category name', 'warning');
      return;
    }

    if (categories.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      showToast('Category already exists', 'info');
      setCategory(trimmed);
      setIsCreatingCategory(false);
      setNewCategoryName('');
      return;
    }

    onAddCategory(trimmed);
    setCategory(trimmed);
    setIsCreatingCategory(false);
    setNewCategoryName('');
    showToast(`Category "${trimmed}" created!`, 'success');
  };

  if (!isOpen) return null;

  const isMobile = isMobileCategory(category);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim()) {
      showToast('Product name is required', 'warning');
      return;
    }

    const cost = Number(costPrice) || 0;
    const sale = Number(salePrice) || 0;
    const quantity = Number(qty) || 0;

    if (sale < 0 || cost < 0 || quantity < 0) {
      showToast('Prices and quantity cannot be negative', 'error');
      return;
    }

    // Process IMEIs for mobile categories
    let finalImeis: string[] | undefined = undefined;
    let finalImeiStr: string | undefined = undefined;

    if (isMobile) {
      const cleaned = imeis.map(i => i.trim()).filter(Boolean);
      finalImeis = cleaned.length > 0 ? cleaned : undefined;
      finalImeiStr = cleaned.length > 0 ? cleaned.join(', ') : undefined;
    }

    onSave(
      {
        name: name.trim(),
        category,
        image: image || undefined,
        imei: finalImeiStr,
        imeis: finalImeis,
        barcode: !isMobile ? barcode.trim() || undefined : undefined,
        costPrice: cost,
        salePrice: sale,
        qty: quantity,
      },
      editItem ? editItem.id : undefined
    );

    showToast(editItem ? 'Product updated successfully' : 'Product added to stock', 'success');
    if (!editItem) {
      resetDraft();
    }
    onClose();
  };

  const handleExplicitCancel = () => {
    if (!editItem) {
      resetDraft();
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 border border-slate-100 animate-in fade-in zoom-in-95 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold shadow-2xs">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">
                {editItem ? 'Edit Product & Stock' : 'Add New Inventory Product'}
              </h3>
              <p className="text-[11px] text-slate-400">
                Register mobile devices with multi-IMEI tracking or retail accessories
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          onKeyDown={e => {
            // Prevent accidental submit when barcode scanner or user presses Enter in input fields
            if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') {
              e.preventDefault();
            }
          }}
          className="space-y-4 text-xs"
        >
          {/* Image Upload Box */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
              <span>Product Picture (Optional)</span>
              {image && (
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="text-rose-600 hover:text-rose-700 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" /> Remove Picture
                </button>
              )}
            </label>

            <div className="flex items-center gap-3">
              {image ? (
                <div className="relative w-16 h-16 rounded-xl border border-slate-200 overflow-hidden bg-slate-50 shrink-0 shadow-2xs">
                  <img src={image} alt="Preview" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-slate-400 shrink-0">
                  <ImageIcon className="w-6 h-6" />
                </div>
              )}

              <div className="flex-1">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageFileChange}
                  accept="image/png, image/jpeg, image/jpg, image/webp"
                  className="hidden"
                  id="product-image-upload"
                />
                <label
                  htmlFor="product-image-upload"
                  className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs cursor-pointer transition border border-slate-200/80"
                >
                  <Upload className="w-3.5 h-3.5 text-blue-600" />
                  {image ? 'Change Photo' : 'Upload Product Photo'}
                </label>
                <p className="text-[10px] text-slate-400 mt-1">
                  Supports JPG, PNG, WEBP (Max 3MB). Displayed on POS cards & inventory.
                </p>
              </div>
            </div>
          </div>

          {/* Product Title */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Product Title / Model Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Product Title / Model Name"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-medium focus:outline-none focus:border-blue-600 focus:bg-white transition"
            />
          </div>

          {/* Category Dropdown + Custom Category Creator */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-slate-700">Category</label>
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
              <div className="flex items-center gap-2 p-2 bg-blue-50/70 border border-blue-200 rounded-xl animate-in fade-in">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  placeholder="Category Name"
                  className="flex-1 bg-white border border-blue-300 rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none"
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
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs transition cursor-pointer flex items-center gap-1"
                >
                  <Check className="w-3 h-3" /> Save
                </button>
              </div>
            ) : (
              <select
                value={category}
                onChange={e => {
                  const val = e.target.value;
                  setCategory(val);
                  if (isMobileCategory(val)) {
                    const count = Math.max(1, Math.min(100, Math.floor(Number(qty) || 1)));
                    setImeis(prev => {
                      const next = [...prev];
                      while (next.length < count) next.push('');
                      return next.slice(0, count);
                    });
                  }
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:outline-none focus:border-blue-600"
              >
                {categories.map(c => (
                  <option key={c} value={c}>
                    {c} {isMobileCategory(c) ? '📱 (Mobile Phone)' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Pricing & Quantity Row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Cost Price ({currency})
              </label>
              <input
                type="number"
                required
                min="0"
                value={costPrice}
                onChange={e => setCostPrice(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono tabular-nums font-semibold focus:outline-none focus:border-blue-600 focus:bg-white transition"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Sale Price ({currency})
              </label>
              <input
                type="number"
                required
                min="0"
                value={salePrice}
                onChange={e => setSalePrice(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono tabular-nums font-semibold focus:outline-none focus:border-blue-600 focus:bg-white transition"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Quantity</label>
              <input
                type="number"
                required
                min="1"
                max="100"
                value={qty}
                onChange={e => handleQtyChange(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="1"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono tabular-nums font-semibold focus:outline-none focus:border-blue-600 focus:bg-white transition"
              />
            </div>
          </div>

          {/* CONDITIONAL SECTION: Mobile IMEI list vs Non-Mobile Barcode */}
          {isMobile ? (
            /* DYNAMIC IMEI INPUTS: Exactly matching the Quantity specified! */
            <div className="p-3.5 bg-blue-50/50 border border-blue-100 rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-blue-600" />
                  Mobile IMEI Registration ({imeis.length} {imeis.length === 1 ? 'Unit' : 'Units'})
                </span>
                <span className="text-[10px] font-semibold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-full">
                  1 IMEI per device
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Quantity is set to {qty}. Each device has its dedicated IMEI field below:
              </p>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {imeis.map((imeiVal, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-bold text-slate-600 w-16 shrink-0">
                      IMEI #{idx + 1}:
                    </span>
                    <div className="relative flex-1">
                      <Hash className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        ref={el => {
                          imeiInputRefs.current[idx] = el;
                        }}
                        type="text"
                        value={imeiVal}
                        onChange={e => handleImeiChange(idx, e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            // If barcode scanner sends Enter, advance to next IMEI box without submitting
                            if (idx + 1 < imeis.length && imeiInputRefs.current[idx + 1]) {
                              imeiInputRefs.current[idx + 1]?.focus();
                            }
                          }
                        }}
                        placeholder={`Device #${idx + 1} IMEI`}
                        className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:border-blue-600 transition"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* NON-MOBILE CATEGORY: ONLY BARCODE FIELD (No IMEI boxes) */
            <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-1.5">
              <label className="block font-semibold text-slate-700">Barcode / Item Code</label>
              <div className="relative">
                <Barcode className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={barcode}
                  onChange={e => setBarcode(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                    }
                  }}
                  placeholder="Barcode / Code"
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:border-blue-600 transition"
                />
              </div>
              <p className="text-[10px] text-slate-400">
                Non-mobile items use barcode for rapid checkout scanning.
              </p>
            </div>
          )}

          {/* Quick margin estimation preview */}
          {Number(salePrice) > 0 && Number(costPrice) > 0 && (
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-[11px] text-slate-600">
              <span>Estimated Margin / Unit:</span>
              <span className="font-semibold text-emerald-600 font-mono tabular-nums">
                +{currency} {(Number(salePrice) - Number(costPrice)).toLocaleString()} (
                {Math.round(((Number(salePrice) - Number(costPrice)) / Number(costPrice)) * 100)}%)
              </span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={handleExplicitCancel}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium text-xs transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSubmit()}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition cursor-pointer"
            >
              {editItem ? 'Save Changes' : 'Add to Inventory'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
