import React, { useState, useEffect } from 'react';
import { Cloud, CloudOff, AlertCircle, ExternalLink, RefreshCw } from 'lucide-react';
import { getQuotaExceededFlag, subscribeQuotaState } from '../utils/firebase';

export interface OnlineStatusBadgeProps {
  onRefreshData?: () => void;
}

export const OnlineStatusBadge: React.FC<OnlineStatusBadgeProps> = ({ onRefreshData }) => {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [isQuotaExceeded, setIsQuotaExceeded] = useState<boolean>(() => getQuotaExceededFlag());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubscribeQuota = subscribeQuotaState((exceeded) => {
      setIsQuotaExceeded(exceeded);
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribeQuota();
    };
  }, []);

  const handleTriggerSync = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRefreshData) {
      setIsSyncing(true);
      onRefreshData();
      setTimeout(() => setIsSyncing(false), 1200);
    }
  };

  const consoleLink =
    'https://console.firebase.google.com/project/gen-lang-client-0220210628/firestore/databases/ai-studio-61fe2539-4730-4793-b629-a517b8cd5fe3/data?openUpgradeDialog=true';

  if (isQuotaExceeded) {
    return (
      <a
        href={consoleLink}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 transition shadow-2xs cursor-pointer"
        title="Firebase daily free quota limit reached. App is running seamlessly in Local Database mode (IndexedDB). Click to open Firebase Console to upgrade or reset."
      >
        <span className="relative flex h-2 w-2">
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
        </span>
        <AlertCircle className="w-3.5 h-3.5 text-amber-600 hidden sm:inline" />
        <span className="hidden sm:inline">Local DB (Quota Limit)</span>
        <ExternalLink className="w-3 h-3 text-amber-700 hidden sm:inline" />
      </a>
    );
  }

  return (
    <div
      onClick={handleTriggerSync}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition cursor-pointer active:scale-95 ${
        isOnline
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80 shadow-2xs hover:bg-emerald-100'
          : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
      }`}
      title={
        onRefreshData
          ? 'Click to force sync & refresh data from Cloud Firestore'
          : isOnline
          ? 'Cloud Connected: Firebase Firestore Database is active & synchronized'
          : 'Offline Mode: Local cache active. Full POS functionality works without internet.'
      }
    >
      <span className="relative flex h-2 w-2">
        {isOnline && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        )}
        <span
          className={`relative inline-flex rounded-full h-2 w-2 ${
            isOnline ? 'bg-emerald-500' : 'bg-amber-500'
          }`}
        />
      </span>
      {isOnline ? (
        <Cloud className="w-3.5 h-3.5 text-emerald-600 hidden sm:inline" />
      ) : (
        <CloudOff className="w-3.5 h-3.5 text-amber-600 hidden sm:inline" />
      )}
      <span className="hidden sm:inline">{isOnline ? 'Cloud Database Active' : 'Offline Mode'}</span>

      {onRefreshData && (
        <button
          type="button"
          onClick={handleTriggerSync}
          className="ml-0.5 p-0.5 text-emerald-700 hover:text-emerald-900 rounded-full hover:bg-emerald-200/50 transition cursor-pointer"
          title="Sync Now"
        >
          <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin text-blue-600' : ''}`} />
        </button>
      )}
    </div>
  );
};

export default OnlineStatusBadge;
