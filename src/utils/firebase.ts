import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore, doc, getDocFromServer } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export { firebaseConfig };

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

let quotaExceededState = false;
const quotaListeners: Array<(isExceeded: boolean) => void> = [];

export function isQuotaError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('Quota limit exceeded') ||
    msg.includes('Quota exceeded') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('free daily read units') ||
    msg.includes('quota metric') ||
    msg.includes('firestore.googleapis.com')
  );
}

export function setQuotaExceededFlag(val: boolean): void {
  if (quotaExceededState !== val) {
    quotaExceededState = val;
    quotaListeners.forEach(l => l(val));
  }
}

export function getQuotaExceededFlag(): boolean {
  return quotaExceededState;
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

// Test connection on boot per skill guidelines
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (isQuotaError(error)) {
      setQuotaExceededFlag(true);
    }
  }
}
testConnection();

export default app;
