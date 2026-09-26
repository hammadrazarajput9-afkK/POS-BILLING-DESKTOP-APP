import React from 'react';
import {
  Menu,
  Plus,
  ShoppingCart,
  Settings,
  Activity,
  Sliders,
  Barcode
} from 'lucide-react';
import { ShopSettings } from '../types';
import { OnlineStatusBadge } from './OnlineStatusBadge';

interface HeaderProps {
  activeTab: string;
  isMenuOpen: boolean;
  onToggleMenu: () => void;
  onSwitchTab: (tab: string) => void;
  onOpenModal: (modal: 'stock' | 'khata' | 'expense') => void;
  onOpenSettings: () => void;
  onOpenTabSettings?: () => void;
  settings?: ShopSettings;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  isMenuOpen,
  onToggleMenu,
  onSwitchTab,
  onOpenModal,
  onOpenSettings,
  onOpenTabSettings,
  settings,
}) => {
  const titles: Record<string, { title: string; subtitle: string }> = {
    dashboard: { title: 'Dashboard Overview', subtitle: 'Live business metrics & real-time cash drawer' },
    pos: { title: 'POS & Billing Terminal', subtitle: 'Search products, build cart, print bills' },
    inventory: { title: 'Inventory Master', subtitle: 'Manage phone devices, IMEI tracking, and retail stock' },
    purchases: { title: 'Supplier Purchases & Stock Inward', subtitle: 'Record stock received from parties and suppliers' },
    barcode: { title: 'Barcode Label Generator', subtitle: 'Generate and print custom 1D Code128 barcodes' },
    khata: { title: 'Customer Credit & Ledger', subtitle: 'Track customer balances, phone numbers, and payment records' },
    expenses: { title: 'Daily Expense', subtitle: 'Record shop rent, refreshment, utilities and operational costs' },
    dailyClosing: { title: 'Daily Closing', subtitle: 'Physical cash notes tally, digital accounts balance & WhatsApp export' },
    reports: { title: 'Financial Reports', subtitle: 'Business performance, sales analytics, and profit summary' },
    activity: { title: 'Activity Center', subtitle: 'Rolling 24-hour audit log (resets automatically)' },
  };

  const current = titles[activeTab] || { title: 'Dashboard', subtitle: '' };
  const logoSrc = settings?.shopLogo || settings?.logo;

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-5 flex items-center justify-between z-10 shrink-0">
      <div className="flex items-center gap-3">
        {/* Toggle Menu Button */}
        <button
          type="button"
          onClick={onToggleMenu}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition text-xs font-bold cursor-pointer border shadow-2xs ${
            isMenuOpen
              ? 'bg-blue-50 text-blue-700 border-blue-200'
              : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
          }`}
          title={isMenuOpen ? 'Hide Menu' : 'Open Menu'}
        >
          <Menu className="w-4 h-4 text-blue-600" />
          <span className="font-extrabold tracking-wide">Menu</span>
        </button>

        {logoSrc && (
          <img
            src={logoSrc}
            alt="Logo"
            className="w-8 h-8 rounded-lg object-contain bg-white border border-slate-200 p-0.5 hidden sm:block shadow-2xs"
          />
        )}

        <div>
          <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight leading-tight">
            {current.title}
          </h2>
          <p className="text-[11px] text-slate-400 hidden sm:block leading-none">
            {current.subtitle}
          </p>
        </div>
      </div>

      {/* Quick Action Header Shortcuts */}
      <div className="flex items-center gap-2">
        {/* Global Online/Offline Status Indicator Pill */}
        <OnlineStatusBadge />

        <button
          type="button"
          onClick={() => onSwitchTab('barcode')}
          className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold text-xs shadow-2xs transition cursor-pointer"
        >
          <Barcode className="w-3.5 h-3.5 text-blue-600" />
          <span>Barcodes</span>
        </button>

        <button
          type="button"
          onClick={() => onSwitchTab('pos')}
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          <span>New Sale</span>
        </button>

        <button
          type="button"
          onClick={() => onOpenModal('expense')}
          className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/80 font-bold text-xs shadow-xs transition cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 text-rose-600" />
          <span>Add Expense</span>
        </button>

        {onOpenTabSettings && (
          <button
            type="button"
            onClick={onOpenTabSettings}
            className="p-2 text-slate-500 hover:text-blue-600 rounded-xl hover:bg-slate-100 transition cursor-pointer border border-slate-200/70"
            title="Tab Customization Settings"
          >
            <Sliders className="w-4 h-4" />
          </button>
        )}

        <button
          type="button"
          onClick={() => onSwitchTab('activity')}
          className={`p-2 rounded-xl transition cursor-pointer ${
            activeTab === 'activity'
              ? 'bg-blue-50 text-blue-600'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
          }`}
          title="Activity Center"
        >
          <Activity className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className="p-2 text-slate-500 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition cursor-pointer"
          title="Shop Profile & Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
