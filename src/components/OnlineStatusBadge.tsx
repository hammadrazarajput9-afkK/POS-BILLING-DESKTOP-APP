import React, { useState, useEffect } from 'react';
import { Cloud, CloudOff, AlertCircle, ExternalLink } from 'lucide-react';
import { getQuotaExceededFlag, subscribeQuotaState } from '../utils/firebase';

export const OnlineStatusBadge: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [isQuotaExceeded, setIsQuotaExceeded] = useState<boolean>(() => getQuotaExceededFlag());

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
        <span className="hidden sm:inline">Local DB (Daily Quota Reached)</span>
        <ExternalLink className="w-3 h-3 text-amber-700 hidden sm:inline" />
      </a>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${
        isOnline
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80 shadow-2xs'
          : 'bg-amber-50 text-amber-800 border-amber-300'
      }`}
      title={
        isOnline
          ? 'Cloud Connected: Firebase Firestore Database is active & synchronized'
          : 'Offline Mode: Local cache active. Full POS functionality works without internet and syncs when reconnected.'
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
    </div>
  );
};

export default OnlineStatusBadge;
