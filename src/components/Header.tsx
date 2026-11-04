import React from 'react';
import {
  Menu,
  Plus,
  ShoppingCart,
  Settings,
  Activity,
  Sliders,
  Barcode,
  Moon,
  Sun,
  Shield,
  User,
  LogOut,
  Download
} from 'lucide-react';
import { ShopSettings, UserRole, UserAccount } from '../types';
import { OnlineStatusBadge } from './OnlineStatusBadge';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface HeaderProps {
  activeTab: string;
  isMenuOpen: boolean;
  onToggleMenu: () => void;
  onSwitchTab: (tab: string) => void;
  onOpenModal: (modal: 'stock' | 'khata' | 'expense') => void;
  onOpenSettings: () => void;
  onOpenTabSettings?: () => void;
  settings?: ShopSettings;
  onToggleTheme?: () => void;
  currentRole?: UserRole;
  currentUser?: UserAccount;
  onLogout?: () => void;
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
  onToggleTheme,
  currentRole = 'admin',
  currentUser,
  onLogout,
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
  const { canInstall, isInstalled, installApp } = usePWAInstall();

  return (
    <header className="h-14 sm:h-16 bg-white border-b border-slate-200 px-2.5 sm:px-5 flex items-center justify-between z-10 shrink-0 max-w-full overflow-hidden">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        {/* Toggle Menu Button */}
        <button
          type="button"
          onClick={onToggleMenu}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition text-xs font-bold cursor-pointer border shadow-2xs shrink-0 ${
            isMenuOpen
              ? 'bg-blue-50 text-blue-700 border-blue-200'
              : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
          }`}
          title={isMenuOpen ? 'Hide Menu' : 'Open Menu'}
        >
          <Menu className="w-4 h-4 text-blue-600" />
          <span className="font-extrabold tracking-wide hidden sm:inline">Menu</span>
        </button>

        {logoSrc ? (
          <div className="w-8 h-8 sm:w-11 sm:h-11 rounded-full overflow-hidden bg-white border-2 border-slate-200 p-0.5 shadow-xs shrink-0 flex items-center justify-center">
            <img
              src={logoSrc}
              alt="Logo"
              className="w-full h-full rounded-full object-cover"
            />
          </div>
        ) : null}

        <div className="min-w-0 flex-1">
          <h2 className="text-xs sm:text-base md:text-lg font-extrabold text-slate-900 tracking-tight leading-tight truncate">
            {current.title}
          </h2>
          <p className="text-[11px] text-slate-400 hidden sm:block leading-none truncate">
            {current.subtitle}
          </p>
        </div>
      </div>

      {/* Quick Action Header Shortcuts */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {/* Logged in User Badge & Logout Button */}
        {currentUser && (
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 sm:p-1 rounded-xl border border-slate-200 shadow-2xs">
            <div className="px-1.5 sm:px-2.5 py-0.5 sm:py-1 text-slate-800 text-[10px] sm:text-[11px] font-extrabold flex items-center gap-1">
              {currentUser.role === 'admin' ? (
                <Shield className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-600" />
              ) : (
                <User className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-600" />
              )}
              <span className="hidden md:inline font-black">{currentUser.name}</span>
              <span className={`px-1 rounded text-[8px] sm:text-[9px] font-black uppercase tracking-wider ${
                currentUser.role === 'admin' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
              }`}>
                {currentUser.role}
              </span>
            </div>
            
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-white/80 transition cursor-pointer"
                title="Logout Securely"
              >
                <LogOut className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Global Online/Offline Status Indicator Pill */}
        <div className="hidden xs:block sm:block">
          <OnlineStatusBadge />
        </div>

        {/* Desktop / Mobile PWA One-Click Install Button */}
        {canInstall && !isInstalled && (
          <button
            type="button"
            onClick={installApp}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-xs shadow-xs transition cursor-pointer active:scale-95"
            title="Install Desktop Application on PC / Mac"
          >
            <Download className="w-3.5 h-3.5 text-white animate-bounce" />
            <span className="hidden sm:inline">Install App</span>
          </button>
        )}

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

        {onOpenTabSettings && currentRole === 'admin' && (
          <button
            type="button"
            onClick={onOpenTabSettings}
            className="p-2 text-slate-500 hover:text-blue-600 rounded-xl hover:bg-slate-100 transition cursor-pointer border border-slate-200/70"
            title="Tab Customization Settings"
          >
            <Sliders className="w-4 h-4" />
          </button>
        )}

        {currentRole === 'admin' && (
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
        )}

        {onToggleTheme && (
          <button
            type="button"
            onClick={onToggleTheme}
            className="p-2 text-slate-500 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition cursor-pointer"
            title="Toggle Dark / Light Theme"
          >
            {settings?.theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-500" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600" />
            )}
          </button>
        )}

        {currentRole === 'admin' && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="p-2 text-slate-500 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition cursor-pointer"
            title="Shop Profile & Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
};
