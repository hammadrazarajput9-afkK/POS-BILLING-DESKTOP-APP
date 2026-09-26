import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

export const OnlineStatusBadge: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });

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

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${
        isOnline
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
          : 'bg-amber-50 text-amber-800 border-amber-300'
      }`}
      title={
        isOnline
          ? 'Connected: Local IndexedDB active and ready'
          : 'Offline Mode: Local database active. Full POS functionality works without internet.'
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
      <span className="hidden sm:inline">{isOnline ? 'Online' : 'Offline Mode'}</span>
    </div>
  );
};

export default OnlineStatusBadge;
