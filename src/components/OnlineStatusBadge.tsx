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
  HardDrive,
  Gauge,
} from 'lucide-react';
import { AppData } from '../types';
import {
  subscribeSyncStatus,
  getSyncStatusSnapshot,
  processPendingWritesQueue,
  downloadJsonBackup,
  loadStoredData,
  calculateStorageUsageStats,
  SyncStatusSnapshot,
} from '../utils/storage';
import {
  setQuotaExceededFlag,
  setLastCloudError,
  FIREBASE_FREE_DAILY_WRITES_LIMIT,
  FIREBASE_FREE_DAILY_READS_LIMIT,
  formatTimeUntilQuotaReset,
} from '../utils/firebase';

export interface OnlineStatusBadgeProps {
  onRefreshData?: () => void | Promise<void>;
  appData?: AppData;
}

function formatShortTime(iso?: string | null): string {
  if (!iso) return 'Just now';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

export const OnlineStatusBadge: React.FC<OnlineStatusBadgeProps> = ({
  onRefreshData,
  appData,
}) => {
  const [status, setStatus] = useState<SyncStatusSnapshot>(() => getSyncStatusSnapshot());
  const [detailsOpen, setDetailsOpen] = useState<boolean>(false);
  const [retrying, setRetrying] = useState<boolean>(false);
  const [deviceQuotaEstimate, setDeviceQuotaEstimate] = useState<{ usedMb: number; quotaMb: number } | null>(null);

  useEffect(() => {
    const unsub = subscribeSyncStatus((snap) => {
      setStatus(snap);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!detailsOpen) return;
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      navigator.storage
        .estimate()
        .then(est => {
          if (est.usage !== undefined && est.quota !== undefined) {
            setDeviceQuotaEstimate({
              usedMb: est.usage / (1024 * 1024),
              quotaMb: est.quota / (1024 * 1024),
            });
          }
        })
        .catch(() => {});
    }
  }, [detailsOpen]);

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

  const writesToday = status.dailyUsage?.writesToday || 0;
  const readsToday = status.dailyUsage?.readsToday || 0;
  const isServerQuotaFull = Boolean(status.isQuotaExceeded || status.dailyUsage?.serverQuotaFull);
  const writePct = isServerQuotaFull
    ? 100
    : Math.min(100, Math.round((writesToday / FIREBASE_FREE_DAILY_WRITES_LIMIT) * 100));
  const readPct = Math.min(100, Math.round((readsToday / FIREBASE_FREE_DAILY_READS_LIMIT) * 100));

  let badgeClasses =
    'bg-emerald-50 text-emerald-700 border-emerald-200/80 hover:bg-emerald-100';
  let dotClasses = 'bg-emerald-500';
  let labelText = 'Synced';

  if (isOffline) {
    badgeClasses = 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200';
    dotClasses = 'bg-slate-500';
    labelText = status.pendingCount > 0 ? `Offline (${status.pendingCount} pending)` : 'Offline';
  } else if (status.isQuotaExceeded) {
    badgeClasses = 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100';
    dotClasses = 'bg-rose-500';
    labelText = 'Quota Full (Local Safe)';
  } else if (hasCloudError) {
    badgeClasses = 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100';
    dotClasses = 'bg-rose-500';
    labelText = 'Cloud error – tap for details';
  } else if (isSyncingOrPending) {
    badgeClasses = 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100';
    dotClasses = 'bg-amber-500';
    labelText = `Syncing… (${status.pendingCount} pending)`;
  }

  let offlineReasonTitle = 'Cloud Sync Live';
  let offlineReasonDetail = 'Data is saving to both LocalStorage/IndexedDB and Cloud Firestore in real time.';
  if (status.offlineReason === 'no_internet') {
    offlineReasonTitle = 'Internet Disconnected (No Network)';
    offlineReasonDetail =
      'Aapke device ka internet (Wi-Fi / Data) band hai. Nayi entries LocalStorage aur IndexedDB mein save ho rahi hain aur internet aatay hi cloud par upload hongi.';
  } else if (status.offlineReason === 'quota_exceeded') {
    offlineReasonTitle = 'Firebase Free Daily Write Limit Full (RESOURCE_EXHAUSTED)';
    offlineReasonDetail =
      'Aaj ki Firebase Free Tier daily write limit (20,000 writes/day) server par poori ho chuki hai. Aapka data is waqt LocalStorage aur IndexedDB mein safe ho raha hai aur quota reset hotay hi auto-sync hoga.';
  } else if (status.offlineReason === 'auth_blocked') {
    offlineReasonTitle = 'Firebase Authentication Blocked';
    offlineReasonDetail =
      'Firebase Anonymous Auth sign-in block hui hai. LocalStorage aur IndexedDB backup active hai, lekin cloud sync ke liye Auth check karein.';
  } else if (status.offlineReason === 'cloud_error') {
    offlineReasonTitle = 'Cloud Connection / Sync Error';
    offlineReasonDetail =
      effectiveLastError ||
      'Firestore server write temporary fail hui. Changes LocalStorage/IndexedDB queue mein save hain aur auto-retry honge.';
  }

  const isCloudLive = !isOffline && !hasCloudError && status.pendingCount === 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setDetailsOpen(true)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition cursor-pointer active:scale-95 shadow-2xs ${badgeClasses}`}
        title="Tap for cloud sync status, quota usage, local vs online backup status, and pending writes queue"
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
                    Cloud Sync, Quota & Backup Status
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
              {/* Storage Mode: Local vs Online */}
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-700 block">
                    Local Backup (Device)
                  </span>
                  <span className="font-extrabold text-emerald-900 flex items-center gap-1.5 mt-0.5">
                    <HardDrive className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    IndexedDB + LocalStorage
                  </span>
                  <span className="text-[10px] text-emerald-700 block mt-0.5">
                    Active • Saved: {formatShortTime(status.lastLocalSaveAt)}
                  </span>
                </div>

                <div
                  className={`p-3 rounded-xl border ${
                    isCloudLive
                      ? 'bg-emerald-50/70 border-emerald-200'
                      : 'bg-amber-50/80 border-amber-200'
                  }`}
                >
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">
                    Online Cloud Backup
                  </span>
                  <span className="font-extrabold text-slate-900 flex items-center gap-1.5 mt-0.5">
                    {isCloudLive ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> Live Online
                      </>
                    ) : isOffline ? (
                      <>
                        <CloudOff className="w-3.5 h-3.5 text-slate-600 shrink-0" /> Offline (Local Only)
                      </>
                    ) : (
                      <>
                        <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" /> Paused (Local Only)
                      </>
                    )}
                  </span>
                  <span className="text-[10px] text-slate-600 block mt-0.5">
                    Internet: {status.isOnline ? 'Connected' : 'Disconnected'} • {status.pendingCount} pending
                  </span>
                </div>
              </div>

              {/* Daily Quota & Usage Meter */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-extrabold text-slate-800">
                    <Gauge className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Today&apos;s Firebase Quota ({status.dailyUsage?.pacificDate})</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                      isServerQuotaFull
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {isServerQuotaFull ? 'Limit Full Today' : 'Within Free Limit'}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div>
                    <div className="flex justify-between text-[11px] font-semibold text-slate-700">
                      <span>Writes (This device today)</span>
                      <span className="tabular-nums">
                        {writesToday.toLocaleString()} / {FIREBASE_FREE_DAILY_WRITES_LIMIT.toLocaleString()}
                        {isServerQuotaFull ? ' (Server Quota Full)' : ` (${writePct}%)`}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden mt-1">
                      <div
                        className={`h-full transition-all ${
                          isServerQuotaFull || writePct >= 85
                            ? 'bg-rose-500'
                            : writePct >= 50
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.max(writePct, isServerQuotaFull ? 100 : 2)}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] font-semibold text-slate-600">
                      <span>Reads (This device today)</span>
                      <span className="tabular-nums">
                        {readsToday.toLocaleString()} / {FIREBASE_FREE_DAILY_READS_LIMIT.toLocaleString()} ({readPct}%)
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-[10px] text-slate-500 leading-snug">
                  Free quota resets in <strong>{formatTimeUntilQuotaReset()}</strong>. Server quota is shared across all sessions/devices of this project.
                </p>
              </div>

              {/* Photo & Cloud Database Storage Space Card */}
              {(() => {
                const storageStats = calculateStorageUsageStats(appData || loadStoredData());
                const totalMb = storageStats.totalBytes / (1024 * 1024);
                const photoMb = storageStats.photoBytes / (1024 * 1024);
                const textMb = storageStats.textBytes / (1024 * 1024);
                const remainingMb = storageStats.remainingBytes / (1024 * 1024);
                const limitMb = storageStats.firestoreFreeLimitBytes / (1024 * 1024);
                const pct = Math.min(100, Math.max(0.5, storageStats.usedPercent));

                return (
                  <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-black uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                        <HardDrive className="w-3.5 h-3.5 text-indigo-600" />
                        Photos &amp; Free Cloud Storage
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-black tabular-nums">
                        {remainingMb >= 1024
                          ? `${(remainingMb / 1024).toFixed(2)} GB Free`
                          : `${remainingMb.toFixed(1)} MB Free`}
                      </span>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] font-bold text-slate-700">
                        <span>Total Used (Photos + Data)</span>
                        <span className="tabular-nums">
                          {totalMb.toFixed(2)} MB / {limitMb.toLocaleString()} MB ({storageStats.usedPercent.toFixed(2)}%)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-white border border-indigo-200/80 rounded-full overflow-hidden mt-1">
                        <div
                          className={`h-full transition-all ${
                            pct >= 85 ? 'bg-rose-500' : pct >= 60 ? 'bg-amber-500' : 'bg-indigo-600'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 text-[10px] pt-0.5">
                      <div className="bg-white rounded-lg p-1.5 border border-indigo-100">
                        <span className="text-slate-400 block font-semibold">Saved Photos</span>
                        <span className="font-extrabold text-slate-900 tabular-nums">
                          {storageStats.photoCount} ({photoMb.toFixed(2)} MB)
                        </span>
                      </div>
                      <div className="bg-white rounded-lg p-1.5 border border-indigo-100">
                        <span className="text-slate-400 block font-semibold">Text &amp; Bills</span>
                        <span className="font-extrabold text-slate-900 tabular-nums">
                          {textMb.toFixed(2)} MB
                        </span>
                      </div>
                      <div className="bg-white rounded-lg p-1.5 border border-indigo-100">
                        <span className="text-slate-400 block font-semibold">More Photos Left</span>
                        <span className="font-extrabold text-emerald-700 tabular-nums">
                          ~{storageStats.estimatedRemainingPhotos.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {deviceQuotaEstimate && (
                      <p className="text-[10px] text-indigo-800/80 font-medium">
                        Device Offline Cache: {deviceQuotaEstimate.usedMb.toFixed(2)} MB used of{' '}
                        {deviceQuotaEstimate.quotaMb >= 1024
                          ? `${(deviceQuotaEstimate.quotaMb / 1024).toFixed(1)} GB`
                          : `${deviceQuotaEstimate.quotaMb.toFixed(0)} MB`}{' '}
                        browser space
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Exact Why-Offline / Pause Reason */}
              {(status.offlineReason !== 'online' || hasCloudError) && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-extrabold text-rose-800">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>Why Cloud Backup Paused / Offline</span>
                    </div>
                    {(status.lastErrorAt || status.dailyUsage?.lastServerQuotaAt) && (
                      <span className="text-[10px] text-rose-700 font-semibold tabular-nums">
                        {formatShortTime(status.lastErrorAt || status.dailyUsage?.lastServerQuotaAt)}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-bold text-rose-900">{offlineReasonTitle}</p>
                  <p className="text-[11px] leading-relaxed text-rose-800">{offlineReasonDetail}</p>
                  {effectiveLastError && (
                    <p className="text-[10px] font-mono bg-white/70 border border-rose-200/70 rounded-lg p-2 break-words text-rose-800">
                      Detail: {effectiveLastError}
                    </p>
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
