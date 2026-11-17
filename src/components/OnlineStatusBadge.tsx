import React, { useState, useEffect } from 'react';
import {
  Cloud,
  CloudOff,
  AlertCircle,
  RefreshCw,
  Download,
  X,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { AppData } from '../types';
import {
  subscribeSyncStatus,
  getSyncStatusSnapshot,
  processPendingWritesQueue,
  downloadJsonBackup,
  loadStoredData,
  SyncStatusSnapshot,
} from '../utils/storage';
import { setQuotaExceededFlag, setLastCloudError } from '../utils/firebase';

export interface OnlineStatusBadgeProps {
  onRefreshData?: () => void | Promise<void>;
  appData?: AppData;
}

export const OnlineStatusBadge: React.FC<OnlineStatusBadgeProps> = ({
  onRefreshData,
  appData,
}) => {
  const [status, setStatus] = useState<SyncStatusSnapshot>(() => getSyncStatusSnapshot());
  const [detailsOpen, setDetailsOpen] = useState<boolean>(false);
  const [retrying, setRetrying] = useState<boolean>(false);

  useEffect(() => {
    const unsub = subscribeSyncStatus((snap) => {
      setStatus(snap);
    });
    return () => unsub();
  }, []);

  const handleRetryNow = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      setQuotaExceededFlag(false);
      setLastCloudError(null);
      await processPendingWritesQueue();
      if (onRefreshData) {
        await Promise.resolve(onRefreshData());
      }
    } finally {
      setTimeout(() => setRetrying(false), 300);
    }
  };

  const handleDownloadBackup = () => {
    const targetData = appData || loadStoredData();
    downloadJsonBackup(targetData, 'mobile_pos_pro_backup_');
  };

  const queuedError = status.pendingOps.find(
    (op) => op.lastError && !op.lastError.startsWith('Device offline')
  )?.lastError;
  const effectiveLastError = status.lastError || queuedError || null;
  const hasCloudError = Boolean(effectiveLastError || status.isQuotaExceeded);
  const isOffline = !status.isOnline;
  const isSyncingOrPending = status.isSyncing || status.pendingCount > 0 || retrying;
  const isAnonymousAuthDisabled = Boolean(
    effectiveLastError &&
      (effectiveLastError.includes('Anonymous Auth') ||
        effectiveLastError.includes('operation-not-allowed') ||
        effectiveLastError.includes('admin-restricted-operation'))
  );

  let badgeClasses =
    'bg-emerald-50 text-emerald-700 border-emerald-200/80 hover:bg-emerald-100';
  let dotClasses = 'bg-emerald-500';
  let labelText = 'Synced';

  if (isOffline) {
    badgeClasses = 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200';
    dotClasses = 'bg-slate-500';
    labelText = status.pendingCount > 0 ? `Offline (${status.pendingCount} pending)` : 'Offline';
  } else if (hasCloudError) {
    badgeClasses = 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100';
    dotClasses = 'bg-rose-500';
    labelText = 'Cloud error – tap for details';
  } else if (isSyncingOrPending) {
    badgeClasses = 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100';
    dotClasses = 'bg-amber-500';
    labelText = `Syncing… (${status.pendingCount} pending)`;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setDetailsOpen(true)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition cursor-pointer active:scale-95 shadow-2xs ${badgeClasses}`}
        title="Tap for cloud sync status, pending writes queue, and backup options"
      >
        <span className="relative flex h-2 w-2 shrink-0">
          {!isOffline && !hasCloudError && (
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dotClasses}`}
            />
          )}
          <span className={`relative inline-flex rounded-full h-2 w-2 ${dotClasses}`} />
        </span>

        {isOffline ? (
          <CloudOff className="w-3.5 h-3.5 text-slate-600 shrink-0" />
        ) : hasCloudError ? (
          <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
        ) : isSyncingOrPending ? (
          <RefreshCw className="w-3.5 h-3.5 text-amber-600 animate-spin shrink-0" />
        ) : (
          <Cloud className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        )}

        <span className="hidden sm:inline whitespace-nowrap">{labelText}</span>
        {isSyncingOrPending && status.pendingCount > 0 && (
          <span className="sm:hidden text-[10px] font-black tabular-nums">
            {status.pendingCount}
          </span>
        )}
      </button>

      {detailsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
          onClick={() => setDetailsOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 border border-slate-100 my-auto max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`p-2 rounded-xl ${
                    hasCloudError
                      ? 'bg-rose-100 text-rose-700'
                      : isOffline
                      ? 'bg-slate-100 text-slate-700'
                      : isSyncingOrPending
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {isOffline ? (
                    <CloudOff className="w-5 h-5" />
                  ) : hasCloudError ? (
                    <AlertCircle className="w-5 h-5" />
                  ) : (
                    <Cloud className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm sm:text-base">
                    Cloud Sync & Offline Queue
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Status: <span className="font-bold text-slate-800">{labelText}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 overflow-y-auto pr-1 flex-1">
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    Internet Connection
                  </span>
                  <span className="font-extrabold text-slate-800 flex items-center gap-1.5 mt-0.5">
                    {status.isOnline ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Online
                      </>
                    ) : (
                      <>
                        <CloudOff className="w-3.5 h-3.5 text-slate-500" /> Offline
                      </>
                    )}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    Pending Queue
                  </span>
                  <span className="font-extrabold text-slate-800 tabular-nums flex items-center gap-1.5 mt-0.5">
                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                    {status.pendingCount} pending {status.pendingCount === 1 ? 'write' : 'writes'}
                  </span>
                </div>
              </div>

              {hasCloudError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 space-y-2">
                  <div className="flex items-center gap-1.5 font-extrabold text-rose-800">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>Last Cloud Error</span>
                  </div>
                  <p className="text-[11px] leading-relaxed break-words">
                    {effectiveLastError ||
                      'Firestore quota cooldown active. Changes remain safely saved locally and will auto-retry.'}
                  </p>
                  {status.isQuotaExceeded && !isAnonymousAuthDisabled && (
                    <div className="pt-2 border-t border-rose-200/80 text-[11px] text-rose-900 space-y-1">
                      <p className="font-bold">Why are writes waiting?</p>
                      <p className="text-rose-800">
                        Your Firebase Free Tier daily write limit is currently full for today. Your sales, inventory, and settings are safely stored locally on this device and will upload automatically once the daily quota resets (Midnight Pacific Time / 1:00 PM PKT). Use <strong>Download backup</strong> below to keep an extra copy.
                      </p>
                    </div>
                  )}
                  {isAnonymousAuthDisabled && (
                    <div className="pt-2 border-t border-rose-200/80 text-[11px] text-rose-900 space-y-1">
                      <p className="font-bold">How to fix in 10 seconds:</p>
                      <ol className="list-decimal list-inside space-y-0.5 text-rose-800">
                        <li>Open Firebase Console → Authentication → Sign-in method</li>
                        <li>Click <strong>Anonymous</strong>, toggle <strong>Enable</strong>, and click <strong>Save</strong></li>
                        <li>Return here and click <strong>Retry now</strong></li>
                      </ol>
                      <a
                        href="https://console.firebase.google.com/project/gen-lang-client-0220210628/authentication/providers"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block mt-1 font-bold text-blue-700 underline hover:text-blue-900"
                      >
                        Open Firebase Authentication Settings →
                      </a>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-600">
                    Pending Writes Queue ({status.pendingCount})
                  </h4>
                  <span className="text-[10px] text-slate-400">
                    Auto-retries every 30s & when online
                  </span>
                </div>

                {status.pendingOps.length === 0 ? (
                  <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2 font-semibold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>All local changes are synchronized to Cloud Firestore.</span>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {status.pendingOps.map((op) => (
                      <div
                        key={op.id}
                        className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] space-y-0.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                              op.op === 'delete'
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {op.op}
                          </span>
                          <span className="text-[10px] text-slate-400 tabular-nums">
                            Retries: {op.retryCount || 0}
                          </span>
                        </div>
                        <p className="font-mono text-[10px] text-slate-700 truncate" title={op.path}>
                          {op.path}
                        </p>
                        {op.lastError && (
                          <p className="text-[10px] text-rose-600 break-words leading-snug">
                            {op.lastError}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={handleDownloadBackup}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download backup</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDetailsOpen(false)}
                  className="px-3.5 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleRetryNow}
                  disabled={retrying || status.isSyncing}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-xs font-extrabold shadow-md shadow-blue-600/20 transition cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${retrying || status.isSyncing ? 'animate-spin' : ''}`} />
                  <span>Retry now</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default OnlineStatusBadge;
