import React, { useState, useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Sparkles, RefreshCw, X, Download, Monitor, CheckCircle, Wifi, WifiOff } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAUpdateBanner: React.FC = () => {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [showInstallHelp, setShowInstallHelp] = useState(false);

  // Auto-Update registration hook from vite-plugin-pwa
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // Check for updates periodically every 20 minutes when connected
      if (r) {
        setInterval(() => {
          r.update().catch(() => {});
        }, 20 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.warn('SW registration error:', error);
    },
  });

  const { canInstall, isInstalled, installApp, isIOS } = usePWAInstall();

  // Network online/offline status monitoring
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleUpdate = () => {
    updateServiceWorker(true);
  };

  return (
    <>
      {/* 1. NEW VERSION / AUTO-UPDATE ALERT BANNER */}
      {needRefresh && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 w-11/12 max-w-xl bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white rounded-2xl p-3.5 shadow-2xl border border-blue-400/30 animate-in slide-in-from-top duration-300">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/20">
                <Sparkles className="w-5 h-5 text-amber-300 animate-spin" style={{ animationDuration: '6s' }} />
              </div>
              <div className="min-w-0">
                <h4 className="font-extrabold text-sm leading-tight flex items-center gap-1.5">
                  <span>New Software Update Available!</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-400 text-slate-900">
                    Live
                  </span>
                </h4>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleUpdate}
                className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs rounded-xl shadow-md transition cursor-pointer flex items-center gap-1.5 active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reload / Update</span>
              </button>
              <button
                type="button"
                onClick={() => setNeedRefresh(false)}
                className="p-1.5 text-blue-200 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. OFFLINE READY TOAST (Shown once when full offline assets are cached) */}
      {offlineReady && (
        <div className="fixed bottom-20 right-4 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-2xl shadow-xl border border-slate-700/80 flex items-center gap-2.5 text-xs animate-in fade-in duration-300">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>App is 100% ready for offline use.</span>
          <button
            type="button"
            onClick={() => setOfflineReady(false)}
            className="text-slate-400 hover:text-white ml-2 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 3. DESKTOP INSTALL PROMPT BANNER (Only shows when not yet installed as standalone app) */}
      {!isInstalled && canInstall && (
        <div className="hidden lg:flex fixed bottom-4 right-4 z-40 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl p-3 shadow-xl items-center gap-3 max-w-sm animate-in slide-in-from-bottom">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Monitor className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-slate-900 leading-tight">Install Desktop App</p>
          </div>
          <button
            type="button"
            onClick={installApp}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1 shadow-sm shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Install</span>
          </button>
        </div>
      )}
    </>
  );
};
