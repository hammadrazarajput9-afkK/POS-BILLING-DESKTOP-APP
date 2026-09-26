import React, { useState, useEffect, useRef } from 'react';
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
  Tag
} from 'lucide-react';
import { useToast } from './Toast';

interface BarcodeGeneratorProps {
  inventory: InventoryItem[];
  settings: ShopSettings;
}

export const BarcodeGenerator: React.FC<BarcodeGeneratorProps> = ({
  inventory,
  settings,
}) => {
  const { showToast } = useToast();

  // Selection & Input state
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [productTitle, setProductTitle] = useState('Apple iPhone 15 Pro');
  const [barcodeValue, setBarcodeValue] = useState('890123456789');
  const [sellingPrice, setSellingPrice] = useState<number>(145000);
  const [customSubtitle, setCustomSubtitle] = useState('128GB • PTA Approved');
  const [labelQuantity, setLabelQuantity] = useState<number>(8);
  const [sheetColumns, setSheetColumns] = useState<number>(3); // 2, 3, or 4 columns
  const [labelSize, setLabelSize] = useState<'standard' | 'compact' | 'jewelry'>('standard');

  // Display toggles
  const [showShopName, setShowShopName] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [showTitle, setShowTitle] = useState(true);
  const [showCodeText, setShowCodeText] = useState(true);

  // SVG ref for preview
  const singleSvgRef = useRef<SVGSVGElement | null>(null);

  // When a product is selected from dropdown
  const handleProductSelect = (id: string) => {
    setSelectedProductId(id);
    const item = inventory.find(i => i.id === id);
    if (item) {
      setProductTitle(item.name);
      setSellingPrice(item.salePrice || 0);
      const code = item.barcode || item.imei || item.imeis?.[0] || 'PRD-' + item.id.replace(/[^0-9]/g, '').slice(-8);
      setBarcodeValue(code);
      setCustomSubtitle(item.category || '');
      showToast(`Loaded details for "${item.name}"`, 'info');
    }
  };

  // Generate random Code128 / EAN13 barcode
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
      <div id="barcode-print-sheet" className="hidden print:block print:w-full print:p-2">
        <div
          className={`grid gap-2 print:gap-3`}
          style={{
            gridTemplateColumns: `repeat(${sheetColumns}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: labelQuantity }).map((_, index) => (
            <div
              key={index}
              className="border border-dashed border-slate-400 p-2 rounded flex flex-col items-center justify-between text-center bg-white break-inside-avoid text-slate-900"
              style={{
                minHeight: labelSize === 'jewelry' ? '30mm' : labelSize === 'compact' ? '35mm' : '45mm',
                maxHeight: '55mm',
              }}
            >
              {showShopName && (
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-900 border-b border-slate-300 w-full pb-0.5 mb-1 truncate">
                  {settings.shopName}
                </div>
              )}

              {showTitle && (
                <div className="text-[11px] font-bold text-slate-900 leading-tight line-clamp-1 w-full px-1">
                  {productTitle}
                </div>
              )}

              {customSubtitle && (
                <div className="text-[9px] text-slate-600 line-clamp-1">
                  {customSubtitle}
                </div>
              )}

              {/* Barcode Render Item */}
              <div className="my-1 flex items-center justify-center">
                <BarcodeLabelItem
                  code={barcodeValue}
                  size={labelSize}
                  showText={showCodeText}
                />
              </div>

              {showPrice && (
                <div className="text-[12px] font-black text-slate-950 mt-0.5 border-t border-slate-300 w-full pt-0.5 font-mono">
                  {settings.currency} {sellingPrice.toLocaleString()}
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
              Barcode Label Generator & Printer
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Generate 1D Code128 barcode stickers for mobile phones, accessories, and print multi-column label sheets
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleDownloadSVG}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold rounded-xl transition cursor-pointer shadow-2xs"
            >
              <Download className="w-4 h-4 text-slate-600" />
              Download SVG
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-xl shadow-lg shadow-blue-600/25 transition cursor-pointer active:scale-95"
            >
              <Printer className="w-4 h-4" />
              Print Labels Sheet ({labelQuantity})
            </button>
          </div>
        </div>

        {/* Main Content Layout: Configuration Panel vs Live Preview */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Controls Column (7 cols) */}
          <div className="lg:col-span-7 space-y-5">
            {/* Quick Product Autocomplete */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-blue-600" />
                  Select Product from Inventory
                </h3>
                <span className="text-[10px] text-slate-400 font-semibold">
                  {inventory.length} products available
                </span>
              </div>

              <div>
                <select
                  value={selectedProductId}
                  onChange={e => handleProductSelect(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500 focus:bg-white transition cursor-pointer"
                >
                  <option value="">-- Choose existing product or enter manually below --</option>
                  {inventory.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({settings.currency} {item.salePrice}) {item.barcode ? `[Code: ${item.barcode}]` : item.imei ? `[IMEI: ${item.imei}]` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Manual Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2 border-t border-slate-100">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Product Title on Label
                  </label>
                  <input
                    type="text"
                    value={productTitle}
                    onChange={e => setProductTitle(e.target.value)}
                    placeholder="e.g. Samsung Galaxy S24 Ultra"
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
                    onChange={e => setSellingPrice(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-emerald-700 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Custom Subtitle / Variant / IMEI
                  </label>
                  <input
                    type="text"
                    value={customSubtitle}
                    onChange={e => setCustomSubtitle(e.target.value)}
                    placeholder="e.g. 256GB Titanium Gray • 1 Year Warranty"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>
              </div>
            </div>

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

              {/* Single Tag Card Visualizer */}
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

              {/* Print Notice & Quick Sheet Preview */}
              <div className="text-xs text-slate-500 space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <p className="font-semibold text-slate-700">
                  Ready to print {labelQuantity} stickers in a {sheetColumns}-column layout.
                </p>
                <p className="text-[11px] text-slate-500">
                  Tip: Supports standard barcode thermal sticker rolls (Xprinter, Zebra, TSC) and standard A4 adhesive paper sheets.
                </p>
              </div>

              <button
                type="button"
                onClick={handlePrint}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/25 transition cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Print Now (Standard or Thermal Printer)
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
