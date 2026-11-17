import { initializeApp, getApps, getApp, FirebaseApp, setLogLevel, onLog } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  Firestore,
  doc,
  getDocFromServer,
  enableNetwork,
} from 'firebase/firestore';
import {
  getAuth,
  Auth,
  User,
  signInAnonymously,
  onAuthStateChanged,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export { firebaseConfig };

// Initialize Firebase App instance singleton
export const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Cloud Firestore with multi-tab persistent offline cache
export const db: Firestore = initializeFirestore(
  app,
  {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  },
  (firebaseConfig as any).firestoreDatabaseId
);

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

const QUOTA_STORAGE_KEY = 'MOBILE_POS_QUOTA_EXCEEDED_AT';
const LEGACY_QUOTA_KEY = 'MOBILE_POS_QUOTA_EXCEEDED';
const QUOTA_RESET_MS = 60 * 60 * 1000; // 1 hour

let quotaExceededAt: number | null = null;
const quotaListeners: Array<(isExceeded: boolean) => void> = [];

let lastCloudErrorMessage: string | null = null;
const cloudErrorListeners: Array<(err: string | null) => void> = [];

export function getLastCloudError(): string | null {
  return lastCloudErrorMessage;
}

export function setLastCloudError(msg: string | null): void {
  if (lastCloudErrorMessage !== msg) {
    lastCloudErrorMessage = msg;
    cloudErrorListeners.forEach(l => l(msg));
  }
}

export function subscribeCloudError(listener: (err: string | null) => void): () => void {
  cloudErrorListeners.push(listener);
  return () => {
    const idx = cloudErrorListeners.indexOf(listener);
    if (idx >= 0) cloudErrorListeners.splice(idx, 1);
  };
}

// Narrow quota error check to genuine Firestore resource-exhausted / quota errors only
export function isQuotaError(error: unknown): boolean {
  if (!error) return false;
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';
  const msg = error instanceof Error ? error.message : String(error);
  return (
    code === 'resource-exhausted' ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('Quota limit exceeded') ||
    msg.includes('Quota exceeded') ||
    msg.includes('Daily Firestore free write quota exceeded') ||
    msg.includes('code=resource-exhausted')
  );
}

function clearQuotaStorage(): void {
  quotaExceededAt = null;
  try {
    localStorage.removeItem(QUOTA_STORAGE_KEY);
    localStorage.removeItem(LEGACY_QUOTA_KEY);
  } catch {
    // ignore
  }
}

export function setQuotaExceededFlag(val: boolean): void {
  const prevActive = getQuotaExceededFlag();
  if (val) {
    const now = Date.now();
    quotaExceededAt = now;
    try {
      localStorage.setItem(QUOTA_STORAGE_KEY, String(now));
    } catch {
      // ignore
    }
    setLastCloudError(
      'Daily Firestore free write quota exceeded for today. Changes are safely saved locally and will auto-sync after quota reset (midnight PT).'
    );
    if (!prevActive) {
      quotaListeners.forEach(l => l(true));
    }
  } else {
    clearQuotaStorage();
    enableNetwork(db).catch(() => {});
    if (prevActive) {
      quotaListeners.forEach(l => l(false));
    }
  }
}

export function getQuotaExceededFlag(): boolean {
  if (quotaExceededAt !== null) {
    if (Date.now() - quotaExceededAt >= QUOTA_RESET_MS) {
      // Auto-reset after 1 hour
      clearQuotaStorage();
      enableNetwork(db).catch(() => {});
      quotaListeners.forEach(l => l(false));
      return false;
    }
    return true;
  }

  try {
    const stored = localStorage.getItem(QUOTA_STORAGE_KEY);
    if (stored) {
      const ts = Number(stored);
      if (Number.isFinite(ts) && Date.now() - ts < QUOTA_RESET_MS) {
        quotaExceededAt = ts;
        return true;
      }
      clearQuotaStorage();
    }
  } catch {
    // ignore
  }
  return false;
}

// Reset quota flag on app start and ensure Firestore network is enabled
clearQuotaStorage();
enableNetwork(db).catch(() => {});

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    setQuotaExceededFlag(false);
    enableNetwork(db).catch(() => {});
  });
}

export function subscribeQuotaState(listener: (isExceeded: boolean) => void): () => void {
  quotaListeners.push(listener);
  return () => {
    const idx = quotaListeners.indexOf(listener);
    if (idx >= 0) quotaListeners.splice(idx, 1);
  };
}

let anonAuthPromise: Promise<User | null> | null = null;

/**
 * Ensures Firebase Anonymous Authentication is signed in silently at app start
 * so Firestore security rules (`request.auth != null`) succeed without breaking
 * the custom shop PIN/email/2FA login flow.
 */
export async function ensureAnonymousAuth(): Promise<User | null> {
  if (auth.currentUser) {
    return auth.currentUser;
  }
  if (anonAuthPromise) {
    return anonAuthPromise;
  }

  anonAuthPromise = (async () => {
    try {
      // Wait briefly for Firebase Auth persistence to hydrate currentUser if already signed in
      const existing = await new Promise<User | null>((resolve) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            unsub();
            resolve(auth.currentUser);
          }
        }, 1200);
        const unsub = onAuthStateChanged(
          auth,
          (user) => {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              unsub();
              resolve(user);
            }
          },
          () => {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              unsub();
              resolve(null);
            }
          }
        );
      });

      if (existing) {
        return existing;
      }

      const cred = await signInAnonymously(auth);
      return cred.user;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('operation-not-allowed') || msg.includes('admin-restricted-operation')) {
        setLastCloudError(
          'Firebase Anonymous Auth is not enabled. Please enable Anonymous Sign-in in Firebase Console → Authentication.'
        );
      } else if (typeof navigator === 'undefined' || navigator.onLine) {
        setLastCloudError(`Firebase Auth error: ${msg}`);
      }
      console.warn('Silent Anonymous Auth notice:', err);
      return null;
    } finally {
      anonAuthPromise = null;
    }
  })();

  return anonAuthPromise;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): void {
  if (isQuotaError(error)) {
    setQuotaExceededFlag(true);
    console.warn(
      `[Firestore Quota Notice] Operation ${operationType} on [${path}] reached daily limit. Pending writes queued locally.`
    );
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  setLastCloudError(`Firestore ${operationType} failed on [${path || 'unknown'}]: ${message}`);

  const errInfo: FirestoreErrorInfo = {
    error: message,
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo:
        auth?.currentUser?.providerData?.map(provider => ({
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

// Route Firebase SDK logs via official onLog handler so benign sub-second
// multi-tab IndexedDB lease clock-skew notices do not trigger false runtime errors,
// while preserving full console visibility for all real Firestore/Auth errors & warnings.
setLogLevel('silent');
onLog(
  (log) => {
    const now = new Date().toISOString();
    if (log.message.includes('Detected an update time that is in the future')) {
      console.debug(`[${now}]  ${log.type}:`, ...log.args);
      return;
    }
    if (log.level === 'warn') {
      console.warn(`[${now}]  ${log.type}:`, ...log.args);
      return;
    }
    if (log.level === 'error') {
      console.error(`[${now}]  ${log.type}:`, ...log.args);
      if (isQuotaError(log.message)) {
        setQuotaExceededFlag(true);
      }
    }
  },
  { level: 'warn' }
);

// Sign in silently and test connection on boot per skill guidelines
async function testConnection() {
  await ensureAnonymousAuth();
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
