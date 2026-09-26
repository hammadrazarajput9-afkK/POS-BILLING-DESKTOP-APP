import React, { useState } from 'react';
import { ShopSettings, AppData, AppTheme } from '../types';
import {
  X,
  Settings as SettingsIcon,
  Download,
  Upload,
  Store,
  Palette,
  Check,
  Camera,
  Trash2,
  ShieldCheck,
  FileText,
  AlertTriangle
} from 'lucide-react';
import { useToast } from './Toast';

export interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ShopSettings;
  onSaveSettings: (settings: ShopSettings) => void;
  fullData: AppData;
  onReplaceData: (data: AppData) => void;
}

const THEME_OPTIONS: { id: AppTheme; label: string; accent: string; border: string }[] = [
  { id: 'blue-white', label: 'Blue & White', accent: 'bg-blue-600', border: 'border-blue-500' },
  { id: 'green-white', label: 'Green & White', accent: 'bg-emerald-600', border: 'border-emerald-500' },
  { id: 'red-white', label: 'Red & White', accent: 'bg-rose-600', border: 'border-rose-500' },
  { id: 'orange-white', label: 'Orange & White', accent: 'bg-orange-600', border: 'border-orange-500' },
  { id: 'purple-white', label: 'Purple & White', accent: 'bg-purple-600', border: 'border-purple-500' },
  { id: 'light', label: 'Light Slate', accent: 'bg-slate-700', border: 'border-slate-500' },
];

export const Settings: React.FC<SettingsProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  fullData,
  onReplaceData,
}) => {
  const { showToast } = useToast();

  const [formData, setFormData] = useState<ShopSettings>({
    ...settings,
    shopLogo: settings.shopLogo || settings.logo || '',
    theme: settings.theme || 'blue-white',
    returnPolicy: settings.returnPolicy || 'Items can only be returned within 3 days with original invoice.',
    lowStockThreshold: settings.lowStockThreshold !== undefined ? settings.lowStockThreshold : 2,
  });

  const [activeSubTab, setActiveSubTab] = useState<'profile' | 'branding' | 'backup'>('profile');

  if (!isOpen) return null;

  // Handle Logo Upload (Base64 conversion)
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showToast('Logo file size must be under 2MB', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = ev => {
      const result = ev.target?.result as string;
      setFormData(prev => ({
        ...prev,
        shopLogo: result,
        logo: result,
      }));
      showToast('Shop logo uploaded successfully', 'success');
    };
    reader.onerror = () => {
      showToast('Failed to load image file', 'error');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setFormData(prev => ({
      ...prev,
      shopLogo: '',
      logo: '',
    }));
    showToast('Shop logo removed', 'info');
  };

  const handleSelectTheme = (themeId: AppTheme) => {
    setFormData(prev => ({ ...prev, theme: themeId }));
    document.documentElement.setAttribute('data-theme', themeId);
    showToast(`Switched theme to "${themeId}"`, 'info');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(formData);
    document.documentElement.setAttribute('data-theme', formData.theme || 'blue-white');
    showToast('Shop settings updated successfully', 'success');
    onClose();
  };

  // Export JSON Database Backup
  const handleExportData = () => {
    const jsonStr = JSON.stringify(fullData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mobile_pos_pro_backup_${new Date().toISOString().substring(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Complete system backup exported successfully', 'success');
  };

  // Import JSON Database Backup
  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!parsed || !Array.isArray(parsed.inventory)) {
          showToast('Invalid backup file format: missing inventory array', 'error');
          return;
        }
        onReplaceData(parsed);
        if (parsed.settings?.theme) {
          document.documentElement.setAttribute('data-theme', parsed.settings.theme);
        }
        showToast('Database backup successfully restored!', 'success');
        onClose();
      } catch {
        showToast('Error parsing JSON backup file', 'error');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl space-y-5 border border-slate-100 my-auto animate-in fade-in zoom-in-95 max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600 text-white rounded-xl shadow-md shadow-blue-500/20">
              <SettingsIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-base">
                Shop Settings & Branding
              </h3>
              <p className="text-[11px] text-slate-400">
                Customize shop logo, receipts, currency, themes, and secure data backups
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Subtabs Selector */}
        <div className="flex gap-2 border-b border-slate-100 pb-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveSubTab('profile')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeSubTab === 'profile'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Store Profile & Logo
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('branding')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeSubTab === 'branding'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Themes & Print Layout
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('backup')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeSubTab === 'backup'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Data Backup & Restore
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="overflow-y-auto pr-1 flex-1">
          {activeSubTab === 'profile' && (
            <form onSubmit={handleSave} className="space-y-4">
              {/* Logo Upload Section */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
                <label className="block text-xs font-bold text-slate-800">
                  Shop Logo (Receipts & Application Header)
                </label>

                <div className="flex items-center gap-4">
                  {formData.shopLogo ? (
                    <div className="relative group w-16 h-16 rounded-xl border border-slate-300 bg-white p-1 flex items-center justify-center shadow-xs overflow-hidden">
                      <img
                        src={formData.shopLogo}
                        alt="Shop Logo"
                        className="w-full h-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition cursor-pointer"
                        title="Remove Logo"
                      >
                        <Trash2 className="w-5 h-5 text-rose-300" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-300 bg-white flex flex-col items-center justify-center text-slate-400">
                      <Store className="w-6 h-6" />
                      <span className="text-[9px] font-bold mt-0.5">No Logo</span>
                    </div>
                  )}

                  <div className="flex-1 space-y-1">
                    <label className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-blue-300 rounded-xl text-xs font-bold text-blue-600 hover:bg-blue-50/50 transition cursor-pointer shadow-2xs">
                      <Camera className="w-4 h-4" />
                      <span>{formData.shopLogo ? 'Change Shop Logo' : 'Upload Shop Logo'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                    </label>
                    <p className="text-[11px] text-slate-400">
                      PNG, JPG, or SVG up to 2MB. Appears on bills, receipts, and headers.
                    </p>
                  </div>
                </div>
              </div>

              {/* Shop Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Shop / Business Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.shopName}
                    onChange={e => setFormData({ ...formData, shopName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Tagline / Subtitle
                  </label>
                  <input
                    type="text"
                    value={formData.tagline}
                    onChange={e => setFormData({ ...formData, tagline: e.target.value })}
                    placeholder="e.g. Sales, Service & Accessories"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Shop Phone / WhatsApp *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Currency Symbol *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.currency}
                    onChange={e => setFormData({ ...formData, currency: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Complete Shop Address
                  </label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Default Low Stock Warning Threshold (Units)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={formData.lowStockThreshold}
                    onChange={e => setFormData({ ...formData, lowStockThreshold: parseInt(e.target.value) || 2 })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Products with inventory at or below this count will trigger amber/red reorder badges.
                  </p>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold shadow-lg shadow-blue-600/25 transition cursor-pointer"
                >
                  Save Store Profile
                </button>
              </div>
            </form>
          )}

          {activeSubTab === 'branding' && (
            <div className="space-y-5">
              {/* Theme Picker */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-slate-800 flex items-center gap-2">
                  <Palette className="w-4 h-4 text-blue-600" />
                  Color Theme Preset
                </label>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {THEME_OPTIONS.map(theme => (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => handleSelectTheme(theme.id)}
                      className={`p-3 rounded-xl border-2 flex items-center gap-2.5 transition cursor-pointer text-left ${
                        formData.theme === theme.id
                          ? `${theme.border} bg-slate-50 font-bold shadow-xs`
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full ${theme.accent} shadow-xs flex items-center justify-center text-white`}>
                        {formData.theme === theme.id && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <span className="text-xs text-slate-800">{theme.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Receipt Footer / Return Policy */}
              <div className="space-y-2 pt-3 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-800">
                  Return & Warranty Policy (Receipt Footer)
                </label>
                <textarea
                  rows={3}
                  value={formData.returnPolicy}
                  onChange={e => setFormData({ ...formData, returnPolicy: e.target.value })}
                  placeholder="e.g. 7 Days checking warranty. Original invoice required for any claims."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-800">
                  Receipt Bottom Tagline
                </label>
                <input
                  type="text"
                  value={formData.receiptFooter}
                  onChange={e => setFormData({ ...formData, receiptFooter: e.target.value })}
                  placeholder="Thank you for shopping with us!"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={e => handleSave(e as any)}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold shadow-lg shadow-blue-600/25 transition cursor-pointer"
                >
                  Save Theme & Layout
                </button>
              </div>
            </div>
          )}

          {activeSubTab === 'backup' && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-2xl flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-700 space-y-1">
                  <h4 className="font-bold text-slate-900">Offline Local Storage & Data Safety</h4>
                  <p>
                    All sales, inventory items, purchases, expenses, and customer khata ledgers are stored securely on your browser.
                    We recommend exporting regular JSON backups.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Export Backup */}
                <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center gap-2">
                    <Download className="w-5 h-5 text-emerald-600" />
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs">Export Backup</h4>
                      <p className="text-[10px] text-slate-400">Download database JSON file</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleExportData}
                    className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-md shadow-emerald-600/20"
                  >
                    Download JSON Backup
                  </button>
                </div>

                {/* Import / Restore Backup */}
                <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center gap-2">
                    <Upload className="w-5 h-5 text-blue-600" />
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs">Restore Backup</h4>
                      <p className="text-[10px] text-slate-400">Upload existing JSON file</p>
                    </div>
                  </div>

                  <label className="block w-full text-center py-2.5 px-4 bg-white border border-blue-300 text-blue-700 hover:bg-blue-50 text-xs font-bold rounded-xl transition cursor-pointer shadow-2xs">
                    <span>Select JSON File</span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportData}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 text-center pt-2">
                "Load Sample Data" and "Reset to Clean Slate" have been safely removed to prevent accidental data loss.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
