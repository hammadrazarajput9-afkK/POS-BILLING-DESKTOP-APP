import { openDB, IDBPDatabase } from 'idb';
import { AppData, ActivityLog, ExpenseItem, InventoryItem, KhataCustomer, SaleRecord, SupplierPurchase } from '../types';

const DB_NAME = 'MobilePOS_IndexedDB';
const DB_VERSION = 2;

export interface MediaRecord {
  id: string;
  dataUrl: string;
  type: string;
  createdAt: string;
}

export interface DraftRecord {
  key: string;
  data: any;
  updatedAt: string;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, transaction) {
        if (!db.objectStoreNames.contains('app_data')) {
          db.createObjectStore('app_data');
        }
        if (!db.objectStoreNames.contains('drafts')) {
          db.createObjectStore('drafts', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('media')) {
          db.createObjectStore('media', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Save complete application state to IndexedDB asynchronously
 */
export async function saveAppDataToDB(data: AppData): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction('app_data', 'readwrite');
    const store = tx.objectStore('app_data');
    await store.put(data, 'main_app_data');
    await tx.done;
  } catch (error) {
    console.error('Failed to save AppData to IndexedDB:', error);
  }
}

/**
 * Load complete application state from IndexedDB
 */
export async function loadAppDataFromDB(): Promise<AppData | null> {
  try {
    const db = await getDB();
    const data = await db.get('app_data', 'main_app_data');
    return data || null;
  } catch (error) {
    console.error('Failed to load AppData from IndexedDB:', error);
    return null;
  }
}

/**
 * Store large base64 image (photos, receipts, supplier bills) into IndexedDB
 */
export async function saveMediaToDB(id: string, dataUrl: string, type: string = 'image/jpeg'): Promise<void> {
  try {
    const db = await getDB();
    await db.put('media', {
      id,
      dataUrl,
      type,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`Failed to store media [${id}] in IndexedDB:`, error);
  }
}

/**
 * Retrieve base64 image from IndexedDB
 */
export async function getMediaFromDB(id: string): Promise<string | null> {
  try {
    const db = await getDB();
    const record = await db.get('media', id);
    return record?.dataUrl || null;
  } catch (error) {
    console.error(`Failed to retrieve media [${id}] from IndexedDB:`, error);
    return null;
  }
}

/**
 * Save in-progress form draft to IndexedDB
 */
export async function saveDraftToDB(key: string, data: any): Promise<void> {
  try {
    const db = await getDB();
    await db.put('drafts', {
      key,
      data,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`Failed to save draft [${key}] in IndexedDB:`, error);
  }
}

/**
 * Retrieve form draft from IndexedDB
 */
export async function getDraftFromDB<T = any>(key: string): Promise<T | null> {
  try {
    const db = await getDB();
    const record = await db.get('drafts', key);
    return record ? (record.data as T) : null;
  } catch (error) {
    console.error(`Failed to retrieve draft [${key}] from IndexedDB:`, error);
    return null;
  }
}

/**
 * Clear form draft from IndexedDB
 */
export async function clearDraftFromDB(key: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('drafts', key);
  } catch (error) {
    console.error(`Failed to clear draft [${key}] from IndexedDB:`, error);
  }
}
