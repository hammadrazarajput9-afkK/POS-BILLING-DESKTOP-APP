import React, { useState } from 'react';
import { X, Sliders, Check, RotateCcw, Sparkles } from 'lucide-react';
import { useToast } from './Toast';

interface TabSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: string;
  preferences: Record<string, any>;
  onSavePreferences: (tabId: string, prefs: Record<string, any>) => void;
}

export const TabSettingsModal: React.FC<TabSettingsModalProps> = ({
  isOpen,
  onClose,
  activeTab,
  preferences,
  onSavePreferences,
}) => {
  const { showToast } = useToast();
  const currentTabPrefs = preferences[activeTab] || {};
  const [localPrefs, setLocalPrefs] = useState<Record<string, any>>(currentTabPrefs);

  // Sync state when opening
  React.useEffect(() => {
    setLocalPrefs(preferences[activeTab] || {});
  }, [activeTab, isOpen, preferences]);

  if (!isOpen) return null;

  const tabTitles: Record<string, string> = {
    dashboard: 'Dashboard Display Settings',
    pos: 'POS & Billing Settings',
    inventory: 'Inventory & Stock Settings',
    khata: 'Customer Ledger Settings',
    expenses: 'Daily Expense Settings',
    dailyClosing: 'Daily Closing Settings',
    reports: 'Financial Reports Settings',
    activity: 'Activity Center Settings',
  };

  const updateSetting = (key: string, value: any) => {
    setLocalPrefs(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onSavePreferences(activeTab, localPrefs);
    showToast('Tab customization saved successfully!', 'success');
    onClose();
  };

  const handleReset = () => {
    setLocalPrefs({});
    onSavePreferences(activeTab, {});
    showToast('Settings restored to default', 'info');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-100">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                {tabTitles[activeTab] || 'Tab Settings'}
              </h3>
              <p className="text-[11px] text-slate-400">
                Customize appearance, alerts & calculation rules for this section
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Specific Options */}
        <div className="space-y-4 text-xs max-h-96 overflow-y-auto pr-1">
          {activeTab === 'dashboard' && (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <p className="font-bold text-slate-800">Net Cash in Hand Calculator</p>
                  <p className="text-[11px] text-slate-500">Auto-calculate cash in hand after all deductions</p>
                </div>
                <input
                  type="checkbox"
                  checked={localPrefs.showCashInHand !== false}
                  onChange={e => updateSetting('showCashInHand', e.target.checked)}
                  className="w-4 h-4 accent-blue-600 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <p className="font-bold text-slate-800">Financial Growth Chart</p>
                  <p className="text-[11px] text-slate-500">Show 7-day revenue & profit curve</p>
                </div>
                <input
                  type="checkbox"
                  checked={localPrefs.showChart !== false}
                  onChange={e => updateSetting('showChart', e.target.checked)}
                  className="w-4 h-4 accent-blue-600 cursor-pointer"
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <label className="font-bold text-slate-800 block">Default Time Period</label>
                <select
                  value={localPrefs.period || 'all'}
                  onChange={e => updateSetting('period', e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-semibold focus:outline-none focus:border-blue-600"
                >
                  <option value="all">All Time Records</option>
                  <option value="today">Today Only (Live Today)</option>
                  <option value="month">This Month</option>
                </select>
              </div>
            </div>
          )}

          {activeTab === 'expenses' && (
            <div className="space-y-3.5">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <label className="font-bold text-slate-800 block">Default Expense Category</label>
                <select
                  value={localPrefs.defaultCategory || 'Refreshment'}
                  onChange={e => updateSetting('defaultCategory', e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-semibold focus:outline-none focus:border-rose-600"
                >
                  <option value="Refreshment">Refreshment / Tea / Fruits</option>
                  <option value="Utilities">Utilities & Electricity</option>
                  <option value="Rent">Shop Rent</option>
                  <option value="Salaries">Staff Salaries</option>
                  <option value="Misc">Miscellaneous</option>
                </select>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <p className="font-bold text-slate-800">Show Expense Receipt Photos</p>
                  <p className="text-[11px] text-slate-500">Show picture thumbnails in the expense table</p>
                </div>
                <input
                  type="checkbox"
                  checked={localPrefs.showImages !== false}
                  onChange={e => updateSetting('showImages', e.target.checked)}
                  className="w-4 h-4 accent-rose-600 cursor-pointer"
                />
              </div>
            </div>
          )}

          {activeTab === 'inventory' && (
            <div className="space-y-3.5">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <label className="font-bold text-slate-800 block">Single Unit Alert Threshold</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={localPrefs.lowStockThreshold || 1}
                  onChange={e => updateSetting('lowStockThreshold', Number(e.target.value))}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-bold font-mono focus:outline-none focus:border-blue-600"
                />
                <p className="text-[10px] text-slate-400">Trigger alert when units remaining reaches this number</p>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <p className="font-bold text-slate-800">Show IMEIs in Table</p>
                  <p className="text-[11px] text-slate-500">Display serial numbers directly on rows</p>
                </div>
                <input
                  type="checkbox"
                  checked={localPrefs.showImeisInTable !== false}
                  onChange={e => updateSetting('showImeisInTable', e.target.checked)}
                  className="w-4 h-4 accent-blue-600 cursor-pointer"
                />
              </div>
            </div>
          )}

          {activeTab === 'pos' && (
            <div className="space-y-3.5">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <label className="font-bold text-slate-800 block">Default Checkout Payment Method</label>
                <select
                  value={localPrefs.defaultPaymentMethod || 'Cash'}
                  onChange={e => updateSetting('defaultPaymentMethod', e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-semibold focus:outline-none focus:border-blue-600"
                >
                  <option value="Cash">Cash In Hand</option>
                  <option value="JazzCash">JazzCash</option>
                  <option value="Easypaisa">Easypaisa</option>
                  <option value="Bank">Bank Transfer</option>
                </select>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <p className="font-bold text-slate-800">Auto Open Print Receipt</p>
                  <p className="text-[11px] text-slate-500">Open receipt modal instantly after checkout</p>
                </div>
                <input
                  type="checkbox"
                  checked={localPrefs.autoPrint !== false}
                  onChange={e => updateSetting('autoPrint', e.target.checked)}
                  className="w-4 h-4 accent-blue-600 cursor-pointer"
                />
              </div>
            </div>
          )}

          {activeTab === 'dailyClosing' && (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <p className="font-bold text-slate-800">Include Coins / Change in Total</p>
                  <p className="text-[11px] text-slate-500">Add loose coins amount to physical cash notes</p>
                </div>
                <input
                  type="checkbox"
                  checked={localPrefs.includeCoins !== false}
                  onChange={e => updateSetting('includeCoins', e.target.checked)}
                  className="w-4 h-4 accent-emerald-600 cursor-pointer"
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <label className="font-bold text-slate-800 block">Default WhatsApp Receiver Phone</label>
                <input
                  type="text"
                  placeholder="WhatsApp phone number"
                  value={localPrefs.whatsappPhone || ''}
                  onChange={e => updateSetting('whatsappPhone', e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-medium focus:outline-none focus:border-emerald-600"
                />
                <p className="text-[10px] text-slate-400">Owner's WhatsApp number for 1-click closing reports</p>
              </div>
            </div>
          )}

          {/* General default for other tabs */}
          {['khata', 'reports', 'activity'].includes(activeTab) && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <p className="font-bold text-slate-800">Display Preference</p>
              <p className="text-[11px] text-slate-500">
                Compact view and auto-refresh enabled for this module.
              </p>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="pt-3 flex items-center justify-between border-t border-slate-100">
          <button
            type="button"
            onClick={handleReset}
            className="text-slate-500 hover:text-slate-800 text-xs font-semibold flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset Defaults
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" /> Apply Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
