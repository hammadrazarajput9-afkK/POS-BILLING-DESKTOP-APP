import React, { useState, useEffect, useRef, useMemo } from 'react';
import JsBarcode from 'jsbarcode';
import { InventoryItem, ShopSettings } from '../types';
import {
  Barcode,
  Printer,
  Copy,
  Check,
  RefreshCw,
  Search,
  Sliders,
  Sparkles,
  Download,
  Tag,
  Layers,
  Plus,
  Minus,
  CheckSquare,
  Square,
  FileText,
  Trash2
} from 'lucide-react';
import { useToast } from './Toast';

interface BarcodeGeneratorProps {
  inventory: InventoryItem[];
  settings: ShopSettings;
}

const BarcodeGeneratorComponent: React.FC<BarcodeGeneratorProps> = ({
  inventory,
  settings,
}) => {
  const { showToast } = useToast();

  // Mode: Single product repeated OR Multi-Product A4 Batch sheet
  const [printMode, setPrintMode] = useState<'batch' | 'single'>('batch');

  // Single Product custom input state
  const [productTitle, setProductTitle] = useState('Samsung Galaxy A15');
  const [barcodeValue, setBarcodeValue] = useState('890123456781');
  const [sellingPrice, setSellingPrice] = useState<number | ''>(42000);
  const [customSubtitle, setCustomSubtitle] = useState('Black • 6GB/128GB');
  const [labelQuantity, setLabelQuantity] = useState<number>(12);
  const [sheetColumns, setSheetColumns] = useState<number>(3); // 2, 3, or 4 columns
  const [labelSize, setLabelSize] = useState<'standard' | 'compact' | 'jewelry'>('compact');

  // Multi-Product Custom Items State (Persisted to localStorage)
  interface CustomBatchItem {
    id: string;
    title: string;
    subtitle: string;
    price: number | '';
    barcode: string;
    count: number;
  }

  const BARCODE_ITEMS_STORAGE_KEY = 'pos_barcode_generator_custom_items_v2';

  const [customBatchItems, setCustomBatchItems] = useState<CustomBatchItem[]>(() => {
    try {
      const saved = localStorage.getItem(BARCODE_ITEMS_STORAGE_KEY);
      if (saved !== null) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to load saved barcode batch items:', e);
    }
    return [
      {
        id: 'c-1',
        title: 'Samsung Galaxy A15',
        subtitle: 'Black • 6GB/128GB',
        price: 42000,
        barcode: '890123456781',
        count: 4,
      },
      {
        id: 'c-2',
        title: '25W Fast Charger Type-C',
        subtitle: 'White • Adapter',
        price: 1500,
        barcode: '890123456782',
        count: 6,
      },
      {
        id: 'c-3',
        title: 'TWS Wireless Earbuds',
        subtitle: 'Matte Black • PureBass',
        price: 2800,
        barcode: '890123456783',
        count: 4,
      },
    ];
  });

  // Sync customBatchItems to localStorage on every change
  useEffect(() => {
    try {
      localStorage.setItem(BARCODE_ITEMS_STORAGE_KEY, JSON.stringify(customBatchItems));
    } catch (e) {
      console.warn('Failed to persist barcode batch items:', e);
    }
  }, [customBatchItems]);

  // Display toggles
  const [showShopName, setShowShopName] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [showTitle, setShowTitle] = useState(true);
  const [showCodeText, setShowCodeText] = useState(true);

  // SVG ref for single preview
  const singleSvgRef = useRef<SVGSVGElement | null>(null);

  // Compute full list of printable label items for the A4 sheet
  const printableItemsList = useMemo(() => {
    if (printMode === 'single') {
      const pr = typeof sellingPrice === 'number' ? sellingPrice : 0;
      return Array.from({ length: Math.max(1, labelQuantity) }).map(() => ({
        id: 'single',
        title: productTitle || 'Custom Product',
        subtitle: customSubtitle,
        barcode: barcodeValue || '000000000000',
        price: pr,
      }));
    }

    // Batch mode: expand each custom product by its copy count
    const list: Array<{
      id: string;
      title: string;
      subtitle: string;
      barcode: string;
      price: number;
    }> = [];

    customBatchItems.forEach(item => {
      const copies = Math.max(0, Number(item.count) || 0);
      const pr = typeof item.price === 'number' ? item.price : 0;
      for (let i = 0; i < copies; i++) {
        list.push({
          id: item.id,
          title: item.title || 'Product Label',
          subtitle: item.subtitle,
          barcode: item.barcode || '000000000000',
          price: pr,
        });
      }
    });

    return list;
  }, [printMode, labelQuantity, productTitle, customSubtitle, barcodeValue, sellingPrice, customBatchItems]);

  const handleAddCustomBatchItem = () => {
    const randomCode = Math.floor(100000000000 + Math.random() * 900000000000).toString();
    const newItem: CustomBatchItem = {
      id: 'c-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5),
      title: '',
      subtitle: '',
      price: '',
      barcode: randomCode,
      count: 3,
    };
    setCustomBatchItems(prev => [...prev, newItem]);
    showToast('New product row added for barcode printing', 'info');
  };

  const handleUpdateBatchItem = (id: string, field: keyof CustomBatchItem, val: any) => {
    setCustomBatchItems(prev =>
      prev.map(item => (item.id === id ? { ...item, [field]: val } : item))
    );
  };

  const handleRemoveBatchItem = (id: string) => {
    const itemToRemove = customBatchItems.find(i => i.id === id);
    setCustomBatchItems(prev => prev.filter(item => item.id !== id));
    if (itemToRemove) {
      showToast(`Deleted barcode row: "${itemToRemove.title || 'Product'}"`, 'info');
    }
  };

  const handleClearAllBatchItems = () => {
    setCustomBatchItems([]);
    showToast('All barcode demo items deleted permanently!', 'info');
  };

  const handleImportInventoryToBarcodeBatch = () => {
    const activeInventory = inventory.filter(i => i.status !== 'ARCHIVED' && i.qty > 0);
    if (activeInventory.length === 0) {
      showToast('No active in-stock inventory items found to import', 'warning');
      return;
    }

    const imported: CustomBatchItem[] = activeInventory.map(item => {
      const imeiStr = item.imeis && item.imeis.length > 0 ? item.imeis[0] : item.imei || '';
      const barcodeCode = item.barcode || imeiStr || Math.floor(100000000000 + Math.random() * 900000000000).toString();
      const specs: string[] = [];
      if (item.color) specs.push(item.color);
      if (item.ram && item.storage) specs.push(`${item.ram}/${item.storage}`);
      else if (item.ram) specs.push(item.ram);
      else if (item.storage) specs.push(item.storage);

      return {
        id: 'inv-' + item.id,
        title: item.name,
        subtitle: specs.length > 0 ? specs.join(' • ') : item.category,
        price: item.salePrice,
        barcode: barcodeCode,
        count: Math.min(20, Math.max(1, item.qty)),
      };
    });

    setCustomBatchItems(imported);
    showToast(`Imported ${imported.length} active inventory products into barcode sheet!`, 'success');
  };

  const handleGenerateBarcodeForItem = (id: string) => {
    const randomCode = Math.floor(100000000000 + Math.random() * 900000000000).toString();
    handleUpdateBatchItem(id, 'barcode', randomCode);
    showToast('New unique barcode code generated', 'success');
  };

  // Generate random Code128 / EAN13 barcode for single product
  const handleGenerateRandomBarcode = () => {
    const random12 = Math.floor(100000000000 + Math.random() * 900000000000).toString();
    setBarcodeValue(random12);
    showToast('New unique barcode code generated', 'success');
  };

  // Re-render single preview barcode
  useEffect(() => {
    if (singleSvgRef.current && barcodeValue.trim()) {
      try {
        JsBarcode(singleSvgRef.current, barcodeValue.trim(), {
          format: 'CODE128',
          lineColor: '#0f172a',
          width: labelSize === 'compact' ? 1.4 : labelSize === 'jewelry' ? 1.0 : 1.8,
          height: labelSize === 'compact' ? 36 : labelSize === 'jewelry' ? 24 : 48,
          displayValue: showCodeText,
          fontSize: 11,
          font: 'monospace',
          margin: 4,
          background: 'transparent',
        });
      } catch (err) {
        console.warn('Barcode generation warning:', err);
      }
    }
  }, [barcodeValue, labelSize, showCodeText]);

  // Handle printing
  const handlePrint = () => {
    window.print();
  };

  // Handle PNG Download
  const handleDownloadSVG = () => {
    if (!singleSvgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(singleSvgRef.current);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    const downloadLink = document.createElement('a');
    downloadLink.href = svgUrl;
    downloadLink.download = `barcode_${barcodeValue || 'label'}.svg`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(svgUrl);
    showToast('Barcode SVG label downloaded', 'success');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Printable Area - Hidden on screen, shown in @media print */}
      <div id="barcode-print-sheet" className="hidden print:block print:w-full">
        <style
          dangerouslySetInnerHTML={{
            __html: `
              @media print {
                @page {
                  size: A4 portrait;
                  margin: 7mm 5mm;
                }
                body {
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
                .barcode-sticker-card {
                  break-inside: avoid !important;
                  page-break-inside: avoid !important;
                }
              }
            `,
          }}
        />
        <div
          className="grid gap-2 print:gap-2.5"
          style={{
            gridTemplateColumns: `repeat(${sheetColumns}, minmax(0, 1fr))`,
          }}
        >
          {printableItemsList.map((item, index) => (
            <div
              key={index}
              className="barcode-sticker-card border border-dashed border-slate-400 p-2 rounded flex flex-col items-center justify-between text-center bg-white text-slate-900"
              style={{
                minHeight: labelSize === 'jewelry' ? '28mm' : labelSize === 'compact' ? '33mm' : '44mm',
                maxHeight: '52mm',
              }}
            >
              {showShopName && (
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-900 border-b border-slate-300 w-full pb-0.5 mb-1 truncate">
                  {settings.shopName}
                </div>
              )}

              {showTitle && (
                <div className="text-[11px] font-bold text-slate-900 leading-tight line-clamp-1 w-full px-1">
                  {item.title}
                </div>
              )}

              {item.subtitle && (
                <div className="text-[9px] text-slate-600 line-clamp-1">
                  {item.subtitle}
                </div>
              )}

              {/* Barcode Render Item */}
              <div className="my-1 flex items-center justify-center">
                <BarcodeLabelItem
                  code={item.barcode}
                  size={labelSize}
                  showText={showCodeText}
                />
              </div>

              {showPrice && (
                <div className="text-[12px] font-black text-slate-950 mt-0.5 border-t border-slate-300 w-full pt-0.5 font-mono">
                  {settings.currency} {item.price.toLocaleString()}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Screen View */}
      <div className="print:hidden space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
              <span className="p-2 bg-blue-600 text-white rounded-xl shadow-md shadow-blue-500/20">
                <Barcode className="w-5 h-5" />
              </span>
              Barcode Label Generator & Multi-Item A4 Sheet
            </h2>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            {printMode === 'single' && (
              <button
                type="button"
                onClick={handleDownloadSVG}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold rounded-xl transition cursor-pointer shadow-2xs"
              >
                <Download className="w-4 h-4 text-slate-600" />
                Download SVG
              </button>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-xl shadow-lg shadow-blue-600/25 transition cursor-pointer active:scale-95"
            >
              <Printer className="w-4 h-4" />
              Print A4 Sheet ({printableItemsList.length} Stickers)
            </button>
          </div>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="bg-slate-100 p-1.5 rounded-2xl flex items-center gap-2 max-w-md">
          <button
            type="button"
            onClick={() => setPrintMode('batch')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
              printMode === 'batch'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Multi-Item A4 Sheet ({printableItemsList.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setPrintMode('single')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
              printMode === 'single'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Barcode className="w-4 h-4" />
            <span>Single Product Repeats</span>
          </button>
        </div>

        {/* Main Content Layout: Configuration Panel vs Live Preview */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Controls Column (7 cols) */}
          <div className="lg:col-span-7 space-y-5">
            {/* Multi-Product Custom Builder Panel OR Single Item Custom Panel */}
            {printMode === 'batch' ? (
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-blue-600" />
                      Multi-Product Custom Barcode List ({customBatchItems.length} Products)
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleImportInventoryToBarcodeBatch}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-xl border border-emerald-200/80 transition cursor-pointer"
                      title="Import in-stock products from active inventory"
                    >
                      <Download className="w-3.5 h-3.5" /> Import Stock
                    </button>
                    <button
                      type="button"
                      onClick={handleAddCustomBatchItem}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Row
                    </button>
                    {customBatchItems.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearAllBatchItems}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs rounded-xl border border-rose-200/80 transition cursor-pointer"
                        title="Delete all demo / batch products permanently"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Clear All
                      </button>
                    )}
                  </div>
                </div>

                {/* Custom Products List */}
                {customBatchItems.length === 0 ? (
                  <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-300 space-y-2">
                    <Layers className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="font-bold text-slate-700 text-xs">No product barcodes in print sheet</p>
                    <div className="flex items-center justify-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={handleAddCustomBatchItem}
                        className="px-3 py-1.5 bg-blue-600 text-white font-bold text-xs rounded-xl hover:bg-blue-700 cursor-pointer"
                      >
                        + Add Custom Row
                      </button>
                      <button
                        type="button"
                        onClick={handleImportInventoryToBarcodeBatch}
                        className="px-3 py-1.5 bg-emerald-600 text-white font-bold text-xs rounded-xl hover:bg-emerald-700 cursor-pointer"
                      >
                        Import Inventory Stock
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                    {customBatchItems.map((item, idx) => (
                      <div
                        key={item.id}
                        className="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-2.5 hover:border-blue-300 transition"
                      >
                        <div className="flex items-center justify-between">
                          <span className="w-6 h-6 rounded-lg bg-blue-600 text-white font-mono font-bold text-xs flex items-center justify-center">
                            #{idx + 1}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-slate-600">Stickers to Print:</span>
                            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateBatchItem(item.id, 'count', Math.max(1, item.count - 1))
                                }
                                className="w-6 h-6 flex items-center justify-center rounded text-slate-600 hover:bg-slate-100 cursor-pointer"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="w-7 text-center font-mono font-bold text-xs text-blue-700">
                                {item.count}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateBatchItem(item.id, 'count', item.count + 1)
                                }
                                className="w-6 h-6 flex items-center justify-center rounded text-slate-600 hover:bg-slate-100 cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveBatchItem(item.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer ml-1"
                              title="Delete this row permanently"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                          <div className="sm:col-span-6">
                            <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                              Product Name / Title *
                            </label>
                            <input
                              type="text"
                              value={item.title}
                              onChange={e => handleUpdateBatchItem(item.id, 'title', e.target.value)}
                              placeholder="e.g. Samsung Galaxy A15, 20W Charger"
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-blue-500"
                            />
                          </div>

                          <div className="sm:col-span-6">
                            <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                              Color / Model / Subtitle
                            </label>
                            <input
                              type="text"
                              value={item.subtitle}
                              onChange={e => handleUpdateBatchItem(item.id, 'subtitle', e.target.value)}
                              placeholder="e.g. Black • 6GB/128GB, Type-C"
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-blue-500"
                            />
                          </div>

                          <div className="sm:col-span-5">
                            <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                              Price ({settings.currency})
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={item.price}
                              onChange={e =>
                                handleUpdateBatchItem(
                                  item.id,
                                  'price',
                                  e.target.value === '' ? '' : Number(e.target.value)
                                )
                              }
                              placeholder="0"
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-emerald-700 focus:outline-none focus:border-blue-500"
                            />
                          </div>

                          <div className="sm:col-span-7">
                            <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5 flex items-center justify-between">
                              <span>Barcode Value</span>
                              <button
                                type="button"
                                onClick={() => handleGenerateBarcodeForItem(item.id)}
                                className="text-[10px] text-blue-600 font-bold hover:underline cursor-pointer flex items-center gap-0.5"
                              >
                                <RefreshCw className="w-2.5 h-2.5" /> Auto Barcode
                              </button>
                            </label>
                            <input
                              type="text"
                              value={item.barcode}
                              onChange={e => handleUpdateBatchItem(item.id, 'barcode', e.target.value)}
                              placeholder="Barcode number / code"
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-blue-700 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAddCustomBatchItem}
                      className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 text-blue-600" /> + Add Product Row
                    </button>
                    <button
                      type="button"
                      onClick={handleImportInventoryToBarcodeBatch}
                      className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 border border-emerald-200 transition cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-600" /> Import Real Stock
                    </button>
                  </div>

                  <span className="font-semibold text-slate-600">
                    Total Stickers on Sheet: <strong className="text-blue-700 font-mono text-sm">{printableItemsList.length}</strong> (~{Math.ceil(printableItemsList.length / (sheetColumns * 8))} A4 Pages)
                  </span>
                </div>
              </div>
            ) : (
              /* Custom Single Product Mode */
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                    <Tag className="w-4 h-4 text-blue-600" />
                    Custom Single Product Barcode Details
                  </h3>
                </div>

                {/* Manual Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Product Name / Title *
                    </label>
                    <input
                      type="text"
                      value={productTitle}
                      onChange={e => setProductTitle(e.target.value)}
                      placeholder="e.g. Samsung Galaxy S24 Ultra, Fast Charger"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                      <span>Barcode / Code128 Value</span>
                      <button
                        type="button"
                        onClick={handleGenerateRandomBarcode}
                        className="text-blue-600 hover:text-blue-800 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" /> Auto Generate
                      </button>
                    </label>
                    <input
                      type="text"
                      value={barcodeValue}
                      onChange={e => setBarcodeValue(e.target.value)}
                      placeholder="e.g. 890123456789"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-blue-700 focus:outline-none focus:border-blue-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Selling Price ({settings.currency})
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={sellingPrice}
                      onChange={e => setSellingPrice(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="0"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-emerald-700 focus:outline-none focus:border-blue-500 focus:bg-white"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Custom Subtitle / Color / Model
                    </label>
                    <input
                      type="text"
                      value={customSubtitle}
                      onChange={e => setCustomSubtitle(e.target.value)}
                      placeholder="e.g. 256GB Titanium Gray, Black, Type-C"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500 focus:bg-white"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Number of Stickers / Copies to Print on Sheet
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={labelQuantity}
                      onChange={e => setLabelQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-blue-700 focus:outline-none focus:border-blue-500 focus:bg-white"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Layout & Printer Sheet Configuration */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-blue-600" />
                Sheet Layout & Printer Settings
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Label Sticker Size
                  </label>
                  <select
                    value={labelSize}
                    onChange={e => setLabelSize(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500"
                  >
                    <option value="standard">Standard (50mm x 35mm)</option>
                    <option value="compact">Compact (40mm x 25mm)</option>
                    <option value="jewelry">Small / Cable Tag (30mm x 20mm)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Print Copies (Quantity)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={labelQuantity}
                    onChange={e => setLabelQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-center focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Columns Per Sheet
                  </label>
                  <select
                    value={sheetColumns}
                    onChange={e => setSheetColumns(parseInt(e.target.value) || 3)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500"
                  >
                    <option value={2}>2 Columns (Thermal / Roll)</option>
                    <option value={3}>3 Columns (Standard A4 Sticker Sheet)</option>
                    <option value={4}>4 Columns (Dense A4 Sheet)</option>
                  </select>
                </div>
              </div>

              {/* Standard A4 Sticker Sheet Presets */}
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <span className="text-[11px] font-bold text-slate-700 block">
                  A4 Sticker Sheet Presets:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSheetColumns(3);
                      setLabelSize('compact');
                      showToast('Preset: 24 Labels/A4 Sheet (3 Cols × 8 Rows)', 'info');
                    }}
                    className={`p-2 rounded-xl border text-left transition cursor-pointer ${
                      sheetColumns === 3 && labelSize === 'compact'
                        ? 'border-blue-500 bg-blue-50/70 text-blue-900 font-bold ring-1 ring-blue-400'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="text-[11px] font-extrabold">24 / A4 Sheet</div>
                    <div className="text-[9px] text-slate-500">3 × 8 (Compact)</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSheetColumns(4);
                      setLabelSize('jewelry');
                      showToast('Preset: 40 Labels/A4 Sheet (4 Cols × 10 Rows)', 'info');
                    }}
                    className={`p-2 rounded-xl border text-left transition cursor-pointer ${
                      sheetColumns === 4 && labelSize === 'jewelry'
                        ? 'border-blue-500 bg-blue-50/70 text-blue-900 font-bold ring-1 ring-blue-400'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="text-[11px] font-extrabold">40 / A4 Sheet</div>
                    <div className="text-[9px] text-slate-500">4 × 10 (Mini Tag)</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSheetColumns(3);
                      setLabelSize('standard');
                      showToast('Preset: 21 Labels/A4 Sheet (3 Cols × 7 Rows)', 'info');
                    }}
                    className={`p-2 rounded-xl border text-left transition cursor-pointer ${
                      sheetColumns === 3 && labelSize === 'standard'
                        ? 'border-blue-500 bg-blue-50/70 text-blue-900 font-bold ring-1 ring-blue-400'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="text-[11px] font-extrabold">21 / A4 Sheet</div>
                    <div className="text-[9px] text-slate-500">3 × 7 (Standard)</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSheetColumns(2);
                      setLabelSize('standard');
                      showToast('Preset: 14 Labels/A4 Sheet (2 Cols × 7 Rows)', 'info');
                    }}
                    className={`p-2 rounded-xl border text-left transition cursor-pointer ${
                      sheetColumns === 2 && labelSize === 'standard'
                        ? 'border-blue-500 bg-blue-50/70 text-blue-900 font-bold ring-1 ring-blue-400'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="text-[11px] font-extrabold">14 / A4 Sheet</div>
                    <div className="text-[9px] text-slate-500">2 × 7 (Wide Tags)</div>
                  </button>
                </div>
              </div>

              {/* Visibility Toggles */}
              <div className="pt-2 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <label className="flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showShopName}
                    onChange={e => setShowShopName(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300"
                  />
                  <span>Shop Name</span>
                </label>

                <label className="flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showTitle}
                    onChange={e => setShowTitle(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300"
                  />
                  <span>Product Title</span>
                </label>

                <label className="flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showPrice}
                    onChange={e => setShowPrice(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300"
                  />
                  <span>Selling Price</span>
                </label>

                <label className="flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showCodeText}
                    onChange={e => setShowCodeText(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300"
                  />
                  <span>Barcode Text</span>
                </label>
              </div>
            </div>
          </div>

          {/* Live Preview Column (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  Live Sticker Tag Preview
                </h3>
                <span className="text-[10px] bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded-full">
                  1:1 Ratio
                </span>
              </div>

              {/* Tag Card Visualizer */}
              {printMode === 'batch' ? (
                <div className="space-y-3">
                  <div className="p-3 bg-slate-100 rounded-2xl border border-slate-200 max-h-96 overflow-y-auto">
                    <p className="text-[10px] font-bold uppercase text-slate-500 mb-2">
                      A4 Sheet Grid Preview ({printableItemsList.length} items on sheet):
                    </p>
                    <div
                      className="grid gap-2"
                      style={{ gridTemplateColumns: `repeat(${sheetColumns}, minmax(0, 1fr))` }}
                    >
                      {printableItemsList.slice(0, 12).map((item, idx) => (
                        <div
                          key={idx}
                          className="bg-white border border-slate-300 rounded-lg p-2 text-center flex flex-col items-center justify-between text-[10px] shadow-2xs"
                        >
                          {showShopName && (
                            <span className="font-extrabold text-[9px] uppercase tracking-wider text-slate-800 truncate w-full border-b border-slate-100 pb-0.5">
                              {settings.shopName}
                            </span>
                          )}
                          <span className="font-bold text-slate-900 truncate w-full mt-0.5">{item.title}</span>
                          <div className="my-1 w-full flex items-center justify-center">
                            <BarcodeLabelItem code={item.barcode} size={labelSize} showText={showCodeText} />
                          </div>
                          {showPrice && (
                            <span className="font-mono font-black text-slate-900 border-t border-slate-100 w-full pt-0.5">
                              {settings.currency} {item.price.toLocaleString()}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                    {printableItemsList.length > 12 && (
                      <p className="text-center text-[10px] font-bold text-slate-500 mt-2">
                        + {printableItemsList.length - 12} more items will print on this A4 sheet
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center p-6 bg-slate-100 rounded-2xl border border-slate-200">
                  <div className="bg-white border-2 border-slate-300 rounded-xl p-4 shadow-md max-w-xs w-full flex flex-col items-center justify-between text-center space-y-1">
                    {showShopName && (
                      <div className="text-[11px] font-black uppercase tracking-wider text-slate-900 border-b border-slate-200 w-full pb-1">
                        {settings.shopName}
                      </div>
                    )}

                    {showTitle && (
                      <div className="text-xs font-bold text-slate-900 leading-tight pt-1">
                        {productTitle}
                      </div>
                    )}

                    {customSubtitle && (
                      <div className="text-[10px] text-slate-500 font-medium">
                        {customSubtitle}
                      </div>
                    )}

                    {/* Single SVG Barcode */}
                    <div className="py-2 w-full flex items-center justify-center overflow-hidden">
                      <svg ref={singleSvgRef} className="max-w-full"></svg>
                    </div>

                    {showPrice && (
                      <div className="text-sm font-black text-slate-900 border-t border-slate-200 w-full pt-1 font-mono">
                        {settings.currency} {sellingPrice.toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Print Notice & Quick Sheet Preview */}
              <div className="text-xs text-slate-500 space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <p className="font-semibold text-slate-700">
                  Ready to print {printableItemsList.length} stickers in a {sheetColumns}-column A4 layout.
                </p>
                <p className="text-[11px] text-slate-500">
                  Fits on standard A4 adhesive sticker sheets (e.g. 24 or 30 labels/page) as well as continuous thermal label rolls.
                </p>
              </div>

              <button
                type="button"
                onClick={handlePrint}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/25 transition cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Print A4 Barcode Sheet Now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Internal Subcomponent for individual barcode rendering in the print sheet
const BarcodeLabelItem: React.FC<{
  code: string;
  size: 'standard' | 'compact' | 'jewelry';
  showText: boolean;
}> = ({ code, size, showText }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (svgRef.current && code) {
      try {
        JsBarcode(svgRef.current, code.trim(), {
          format: 'CODE128',
          lineColor: '#000000',
          width: size === 'compact' ? 1.3 : size === 'jewelry' ? 1.0 : 1.6,
          height: size === 'compact' ? 30 : size === 'jewelry' ? 22 : 40,
          displayValue: showText,
          fontSize: 10,
          font: 'monospace',
          margin: 2,
          background: 'transparent',
        });
      } catch (err) {
        console.warn('Barcode print error:', err);
      }
    }
  }, [code, size, showText]);

  return <svg ref={svgRef} className="max-w-full"></svg>;
};

export const BarcodeGenerator = React.memo(BarcodeGeneratorComponent);
