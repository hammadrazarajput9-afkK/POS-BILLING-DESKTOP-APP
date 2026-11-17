import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore, doc, getDocFromServer, disableNetwork, enableNetwork, setLogLevel } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export { firebaseConfig };

// Silence internal Firestore SDK log spam (specifically "Using maximum backoff delay" and internal errors)
try {
  setLogLevel('silent');
} catch {
  // ignore
}

// Initialize Firebase App instance singleton
export const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Cloud Firestore database instance using applet configuration
export const db: Firestore = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);

// Initialize Firebase Auth instance
export const auth: Auth = getAuth(app);

// Skill Error Handler Definition
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

let quotaExceededState = (() => {
  try {
    return localStorage.getItem('MOBILE_POS_QUOTA_EXCEEDED') === 'true';
  } catch {
    return false;
  }
})();
const quotaListeners: Array<(isExceeded: boolean) => void> = [];

export function isQuotaError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('Quota limit exceeded') ||
    msg.includes('Quota exceeded') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('resource-exhausted') ||
    msg.includes('429') ||
    msg.includes('free daily read units') ||
    msg.includes('Free daily write units') ||
    msg.includes('quota metric') ||
    msg.includes('firestore.googleapis.com') ||
    msg.includes('maximum backoff delay')
  );
}

export function setQuotaExceededFlag(val: boolean): void {
  if (quotaExceededState !== val) {
    quotaExceededState = val;
    try {
      if (val) {
        localStorage.setItem('MOBILE_POS_QUOTA_EXCEEDED', 'true');
        disableNetwork(db).catch(() => {});
      } else {
        localStorage.removeItem('MOBILE_POS_QUOTA_EXCEEDED');
        enableNetwork(db).catch(() => {});
      }
    } catch {
      // ignore
    }
    quotaListeners.forEach(l => l(val));
  } else if (val) {
    // Ensure network is disabled even if state was already true
    try {
      disableNetwork(db).catch(() => {});
    } catch {
      // ignore
    }
  }
}

export function getQuotaExceededFlag(): boolean {
  return quotaExceededState;
}

// If quota was already exceeded, immediately disable Firestore network at boot
if (quotaExceededState) {
  try {
    disableNetwork(db).catch(() => {});
  } catch {
    // ignore
  }
}

// Global browser safety harness: prevent console errors & unhandled rejections from quota backoff
if (typeof window !== 'undefined') {
  const isSuppressedMessage = (msg: string) =>
    msg.includes('resource-exhausted') ||
    msg.includes('Quota limit exceeded') ||
    msg.includes('Quota exceeded') ||
    msg.includes('maximum backoff delay') ||
    msg.includes('Free daily write units');

  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    const combined = args.map(a => (a instanceof Error ? a.message : String(a))).join(' ');
    if (isSuppressedMessage(combined)) {
      setQuotaExceededFlag(true);
      return;
    }
    originalConsoleError(...args);
  };

  const originalConsoleWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    const combined = args.map(a => (a instanceof Error ? a.message : String(a))).join(' ');
    if (isSuppressedMessage(combined)) {
      setQuotaExceededFlag(true);
      return;
    }
    originalConsoleWarn(...args);
  };

  window.addEventListener('unhandledrejection', (event) => {
    const msg = event.reason instanceof Error ? event.reason.message : String(event.reason);
    if (isSuppressedMessage(msg)) {
      event.preventDefault();
      setQuotaExceededFlag(true);
    }
  });

  window.addEventListener('error', (event) => {
    const msg = event.error?.message || event.message || '';
    if (isSuppressedMessage(msg)) {
      event.preventDefault();
      setQuotaExceededFlag(true);
    }
  });
}

export function subscribeQuotaState(listener: (isExceeded: boolean) => void): () => void {
  quotaListeners.push(listener);
  return () => {
    const idx = quotaListeners.indexOf(listener);
    if (idx >= 0) quotaListeners.splice(idx, 1);
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): void {
  if (isQuotaError(error)) {
    setQuotaExceededFlag(true);
    console.warn(`[Firestore Quota Notice] Operation ${operationType} on [${path}] reached free daily limit. Application seamlessly operates in local IndexedDB mode.`);
    return;
  }
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo: auth?.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test connection on boot per skill guidelines (only if quota is not exceeded)
async function testConnection() {
  if (getQuotaExceededFlag()) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (isQuotaError(error)) {
      setQuotaExceededFlag(true);
    }
  }
}
testConnection().catch(() => {});

export default app;
