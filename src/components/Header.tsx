import React, { useState } from 'react';
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
  Download,
  Smartphone,
  ChevronDown,
} from 'lucide-react';
import { AppData, ShopSettings, UserRole, UserAccount } from '../types';
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
  onRefreshData?: () => void;
  appData?: AppData;
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
  onRefreshData,
  appData,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const titles: Record<string, { title: string; shortTitle: string; subtitle: string }> = {
    dashboard: { title: 'Dashboard Overview', shortTitle: 'Dashboard', subtitle: 'Live business metrics & real-time cash drawer' },
    pos: { title: 'POS & Billing Terminal', shortTitle: 'POS Billing', subtitle: 'Search products, build cart, print bills' },
    inventory: { title: 'Inventory Master', shortTitle: 'Inventory', subtitle: 'Manage phone devices, IMEI tracking, and retail stock' },
    purchases:
      currentRole === 'salesman'
        ? { title: 'Stock Inward', shortTitle: 'Stock Inward', subtitle: 'Record inward stock and party names' }
        : { title: 'Supplier Purchases & Stock Inward', shortTitle: 'Purchases', subtitle: 'Record stock received from parties and suppliers' },
    barcode: { title: 'Barcode Label Generator', shortTitle: 'Barcodes', subtitle: 'Generate and print custom 1D Code128 barcodes' },
    khata: { title: 'Customer Credit & Ledger', shortTitle: 'Khata Ledger', subtitle: 'Track customer balances, phone numbers, and payment records' },
    expenses: { title: 'Daily Expense', shortTitle: 'Expenses', subtitle: 'Record shop rent, refreshment, utilities and operational costs' },
    dailyClosing: { title: 'Daily Closing', shortTitle: 'Daily Closing', subtitle: 'Physical cash notes tally, digital accounts balance & WhatsApp export' },
    reports: { title: 'Financial Reports', shortTitle: 'Reports', subtitle: 'Business performance, sales analytics, and profit summary' },
    activity: { title: 'Activity Center', shortTitle: 'Activity', subtitle: 'Rolling 24-hour audit log (resets automatically)' },
  };

  const current = titles[activeTab] || { title: 'Dashboard', shortTitle: 'Dashboard', subtitle: '' };
  const logoSrc = settings?.shopLogo || settings?.logo;
  const shopDisplayName = settings?.shopName?.trim() || 'FMZ Mobile Zone';
  const { canInstall, isInstalled, installApp } = usePWAInstall();

  const closeAndRun = (fn?: () => void) => {
    setMobileMenuOpen(false);
    if (fn) fn();
  };

  return (
    <header className="app-header min-h-[3.75rem] sm:h-16 bg-white border-b border-slate-200/90 px-2.5 pt-[calc(env(safe-area-inset-top,0px)+0.85rem)] pb-2.5 sm:py-0 sm:px-5 flex items-center justify-between gap-2 sm:gap-4 z-20 shrink-0 max-w-full transition-colors duration-200">
      {/* Left Zone: Menu Toggle + Shop Logo + Shop Name & Active Page */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        <button
          type="button"
          onClick={onToggleMenu}
          className={`w-9 h-9 sm:w-auto sm:h-9 sm:px-3 rounded-xl transition text-xs font-bold cursor-pointer border shadow-2xs shrink-0 flex items-center justify-center gap-1.5 ${
            isMenuOpen
              ? 'bg-blue-50 text-blue-700 border-blue-200'
              : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
          }`}
          title={isMenuOpen ? 'Hide Menu' : 'Open Menu'}
        >
          <Menu className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="font-extrabold tracking-wide hidden sm:inline">Menu</span>
        </button>

        {/* Shop Logo (Pure circle, no extra border) */}
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden shrink-0 flex items-center justify-center">
          {logoSrc && !logoError ? (
            <img
              src={logoSrc}
              alt={shopDisplayName}
              onError={() => setLogoError(true)}
              className="w-full h-full object-cover rounded-full"
            />
          ) : (
            <div className="w-full h-full brand-badge bg-blue-600 text-white rounded-full flex items-center justify-center">
              <Smartphone className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          )}
        </div>

        {/* Shop Name + Active Section Title */}
        <div className="min-w-0 flex-1">
          {/* Mobile: Show Shop Name + Active Section clearly */}
          <div className="sm:hidden min-w-0">
            <h2 className="text-[13px] font-black text-slate-900 tracking-tight leading-tight truncate">
              {shopDisplayName}
            </h2>
            <p className="text-[10px] font-bold text-blue-600 leading-tight truncate">
              {current.shortTitle}
            </p>
          </div>
          {/* Desktop / Tablet: Show Section Title + Shop Name / Subtitle */}
          <div className="hidden sm:block min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-base md:text-lg font-extrabold text-slate-900 tracking-tight leading-tight truncate">
                {current.title}
              </h2>
              <span className="text-slate-300 hidden md:inline">•</span>
              <span className="text-xs font-bold text-blue-600 truncate hidden md:inline">
                {shopDisplayName}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-none truncate mt-0.5">
              {current.subtitle}
            </p>
          </div>
        </div>
      </div>

      {/* Right Zone: Mobile Compact Controls (< md) + Full Desktop Toolbar (md+) */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Online/Offline Sync Status */}
        <OnlineStatusBadge onRefreshData={onRefreshData} appData={appData} />

        {/* Install App (Desktop / Mobile when prompt ready) */}
        {canInstall && !isInstalled && (
          <button
            type="button"
            onClick={installApp}
            className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-xs shadow-xs transition cursor-pointer active:scale-95 shrink-0"
            title="Install Desktop Application"
          >
            <Download className="w-3.5 h-3.5 text-white" />
            <span>Install App</span>
          </button>
        )}

        {/* Quick Sale (sm+) */}
        <button
          type="button"
          onClick={() => onSwitchTab('pos')}
          className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition cursor-pointer shrink-0"
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          <span>New Sale</span>
        </button>

        {/* Desktop-only Quick Shortcuts */}
        <button
          type="button"
          onClick={() => onSwitchTab('barcode')}
          className="hidden xl:inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold text-xs shadow-2xs transition cursor-pointer shrink-0"
        >
          <Barcode className="w-3.5 h-3.5 text-blue-600" />
          <span>Barcodes</span>
        </button>

        <button
          type="button"
          onClick={() => onOpenModal('expense')}
          className="hidden lg:inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/80 font-bold text-xs shadow-xs transition cursor-pointer shrink-0"
        >
          <Plus className="w-3.5 h-3.5 text-rose-600" />
          <span>Add Expense</span>
        </button>

        {/* Desktop Admin Icons */}
        <div className="hidden md:flex items-center gap-1">
          {onOpenTabSettings && currentRole === 'admin' && (
            <button
              type="button"
              onClick={onOpenTabSettings}
              className="w-9 h-9 flex items-center justify-center text-slate-500 hover:text-blue-600 rounded-xl hover:bg-slate-100 transition cursor-pointer border border-slate-200/70"
              title="Tab Customization Settings"
            >
              <Sliders className="w-4 h-4" />
            </button>
          )}

          {currentRole === 'admin' && (
            <button
              type="button"
              onClick={() => onSwitchTab('activity')}
              className={`w-9 h-9 flex items-center justify-center rounded-xl transition cursor-pointer ${
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
              className="group w-9 h-9 flex items-center justify-center text-slate-500 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition cursor-pointer"
              title="Toggle Dark / Light Theme"
            >
              {settings?.theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-500 group-hover:rotate-45 transition-transform duration-300" />
              ) : (
                <Moon className="w-4 h-4 text-slate-600 group-hover:-rotate-12 transition-transform duration-300" />
              )}
            </button>
          )}

          {currentRole === 'admin' && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="w-9 h-9 flex items-center justify-center text-slate-500 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition cursor-pointer"
              title="Shop Profile & Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}

          {currentUser && (
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-2xs ml-1">
              <div className="px-2 py-0.5 text-slate-800 text-[11px] font-extrabold flex items-center gap-1.5">
                {currentUser.role === 'admin' ? (
                  <Shield className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                ) : (
                  <User className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                )}
                <span className="font-black max-w-[90px] truncate">{currentUser.name}</span>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                  currentUser.role === 'admin' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  {currentUser.role}
                </span>
              </div>
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-white/80 transition cursor-pointer"
                  title="Logout Securely"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Mobile Quick Controls (< md): Keeps header clean so Logo, Shop Name & buttons never crush */}
        <div className="flex md:hidden items-center gap-1 shrink-0">
          {onToggleTheme && (
            <button
              type="button"
              onClick={onToggleTheme}
              className="w-8 h-8 flex items-center justify-center text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition cursor-pointer shrink-0"
              title="Toggle Theme"
            >
              {settings?.theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-500" />
              ) : (
                <Moon className="w-4 h-4 text-slate-600" />
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => setMobileMenuOpen(prev => !prev)}
            className={`h-8 px-2 flex items-center gap-1 rounded-lg border text-[11px] font-extrabold transition cursor-pointer shrink-0 ${
              mobileMenuOpen
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
            }`}
            title="Account & Quick Options"
          >
            {currentRole === 'admin' ? (
              <Shield className={`w-3.5 h-3.5 ${mobileMenuOpen ? 'text-white' : 'text-blue-600'}`} />
            ) : (
              <User className={`w-3.5 h-3.5 ${mobileMenuOpen ? 'text-white' : 'text-amber-600'}`} />
            )}
            <ChevronDown className={`w-3 h-3 transition-transform ${mobileMenuOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mobile Account & Quick Tools Popover */}
      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-[1px] md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="app-mobile-popover fixed top-[calc(env(safe-area-inset-top,0px)+4.5rem)] right-2.5 z-50 w-60 bg-white border border-slate-200 rounded-2xl shadow-2xl p-2 space-y-1 md:hidden animate-in fade-in zoom-in-95 duration-150">
            {currentUser && (
              <div className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200/70 flex items-center justify-between gap-2 mb-1">
                <div className="min-w-0">
                  <p className="text-xs font-black text-slate-900 truncate">{currentUser.name}</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase">{currentUser.role}</p>
                </div>
                {onLogout && (
                  <button
                    type="button"
                    onClick={() => closeAndRun(onLogout)}
                    className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-[10px] font-extrabold flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <LogOut className="w-3 h-3" />
                    <span>Logout</span>
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => closeAndRun(() => onSwitchTab('pos'))}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-blue-700 bg-blue-50/70 hover:bg-blue-100 transition cursor-pointer"
            >
              <ShoppingCart className="w-4 h-4 text-blue-600" />
              <span>New Sale (POS)</span>
            </button>

            <button
              type="button"
              onClick={() => closeAndRun(() => onOpenModal('expense'))}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-700 hover:bg-rose-50 transition cursor-pointer"
            >
              <Plus className="w-4 h-4 text-rose-600" />
              <span>Add Expense</span>
            </button>

            <button
              type="button"
              onClick={() => closeAndRun(() => onSwitchTab('barcode'))}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >
              <Barcode className="w-4 h-4 text-blue-600" />
              <span>Barcode Generator</span>
            </button>

            {canInstall && !isInstalled && (
              <button
                type="button"
                onClick={() => closeAndRun(installApp)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100 transition cursor-pointer"
              >
                <Download className="w-4 h-4 text-indigo-600" />
                <span>Install App</span>
              </button>
            )}

            {currentRole === 'admin' && (
              <>
                <div className="border-t border-slate-100 my-1" />
                {onOpenTabSettings && (
                  <button
                    type="button"
                    onClick={() => closeAndRun(onOpenTabSettings)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                  >
                    <Sliders className="w-4 h-4 text-slate-500" />
                    <span>Tab Settings</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => closeAndRun(() => onSwitchTab('activity'))}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                >
                  <Activity className="w-4 h-4 text-slate-500" />
                  <span>Activity Center</span>
                </button>
                <button
                  type="button"
                  onClick={() => closeAndRun(onOpenSettings)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                >
                  <Settings className="w-4 h-4 text-slate-500" />
                  <span>Shop Profile &amp; Settings</span>
                </button>
              </>
            )}
          </div>
        </>
      )}
    </header>
  );
};

