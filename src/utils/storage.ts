import {
  AppData,
  OnlineAccount,
  ShopSettings,
  InventoryItem,
  SaleRecord,
  KhataCustomer,
  ExpenseItem,
  ActivityLog,
  SupplierPurchase,
  SalesReturnRecord,
  PurchaseLedgerEntry,
  ImeiRecord,
  StockAdjustment,
  UserAccount,
  TabPreferences,
  UserRole,
  PaymentMethod,
  DailyClosingRecord,
} from '../types';
import { db, handleFirestoreError, OperationType, isQuotaError, setQuotaExceededFlag } from './firebase';
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  writeBatch,
  query,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore';
import { generateEntityId } from './id';
import { openDB, IDBPDatabase } from 'idb';

/**
 * Hierarchical Multi-Tenant Store Configuration:
 * - Master Store Collection: 'stores'
 * - Store Document: /stores/{adminStoreId}
 * - Isolated Sub-collections:
 *     /stores/{adminStoreId}/sales/{invNo}
 *     /stores/{adminStoreId}/inventory/{itemId}
 *     /stores/{adminStoreId}/khata/{customerId}
 *     /stores/{adminStoreId}/expenses/{expenseId}
 *     /stores/{adminStoreId}/activities/{activityId}
 *     /stores/{adminStoreId}/users/{userId}
 * - Global User Registry for cross-device authentication:
 *     /users/{userId}
 */
export const STORES_COLLECTION = 'stores';
export const LEGACY_FIRESTORE_COLLECTION = 'pos_data';
export const DEFAULT_STORE_ID = 'main_store';

// Aliases for backwards compatibility
export const FIRESTORE_COLLECTION = STORES_COLLECTION;
export const FIRESTORE_DOCUMENT_ID = DEFAULT_STORE_ID;

export const SUB_COLLECTIONS = {
  SALES: 'sales',
  INVENTORY: 'inventory',
  KHATA: 'khata',
  EXPENSES: 'expenses',
  ACTIVITIES: 'activities',
  USERS: 'users',
  PURCHASES: 'purchases',
  DAILY_CLOSINGS: 'daily_closings',
  SALES_RETURNS: 'sales_returns',
  STOCK_ADJUSTMENTS: 'stock_adjustments',
  PURCHASES_LEDGER: 'purchases_ledger',
  IMEI_RECORDS: 'imei_records',
} as const;

// Legacy storage keys
export const STORAGE_KEY = 'MOBILE_POS_PRO_DATA_V10';
export const LEGACY_STORAGE_KEYS = [
  'MOBILE_POS_PRO_DATA_V9',
  'MOBILE_POS_PRO_DATA_V8',
  'MOBILE_POS_PRO_DATA_V7',
  'MOBILE_POS_PRO_DATA_V6',
  'MOBILE_POS_PRO_DATA_V5',
];

// Active runtime store context
let currentActiveStoreId: string = DEFAULT_STORE_ID;

export function setActiveStoreId(storeId?: string | null): void {
  if (storeId && storeId.trim()) {
    currentActiveStoreId = storeId.trim();
  }
}

export function getActiveStoreId(): string {
  return currentActiveStoreId;
}

// Partitioned LocalStorage key per store to ensure 100% zero data leakage between admins on the same browser
export function getLocalStorageKey(storeId?: string): string {
  const sid = storeId || currentActiveStoreId || DEFAULT_STORE_ID;
  return `MOBILE_POS_STORE_${sid}_V10`;
}

// Session persistence for active logged-in user and store
export const SESSION_STORAGE_KEY = 'MOBILE_POS_ACTIVE_USER_SESSION';

export function saveCurrentSession(user?: UserAccount | null): void {
  try {
    if (user) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
      // Keep active store unified to DEFAULT_STORE_ID so writes and real-time listeners always share the same store path
      setActiveStoreId(DEFAULT_STORE_ID);
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch (e) {
    console.warn('Session save warning:', e);
  }
}

export function getSavedSessionUser(): UserAccount | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.id && parsed.email) {
      return parsed as UserAccount;
    }
  } catch {
    // ignore
  }
  return null;
}

export function clearCurrentSession(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export const defaultSettings: ShopSettings = {
  shopName: 'FMZ Friends Mobile Zone',
  tagline: 'Smart Mobile Sales & Inventory Management',
  address: 'Main Commercial Market, Suite #12',
  phone: '0300-0000000',
  currency: 'Rs.',
  receiptFooter: 'Thank you for your business! Warranty claims require original receipt and undamaged warranty sticker.',
  theme: 'blue-white',
  shopLogo: '/assets/aistudio/Gemini_Generated_Image_5gj5px5gj5px5gj5_cc4a2a95.png',
  invoiceLogo: '/assets/aistudio/Gemini_Generated_Image_5gj5px5gj5px5gj5_cc4a2a95.png',
  loginPageName: 'FMZ Friends Mobile Zone',
  loginPageLogo: '/assets/aistudio/Gemini_Generated_Image_5gj5px5gj5px5gj5_cc4a2a95.png',
};

export const defaultCategories: string[] = ['Android Phone', 'Keypad Phone'];

export function cleanCategories(rawCategories: unknown): string[] {
  const oldDefaults = new Set(['android mobile', 'accessories', 'chargers & cables', 'audio & airpods', 'repair parts']);
  const list = Array.isArray(rawCategories) ? rawCategories.map(c => String(c).trim()).filter(Boolean) : [];
  const filtered = list.filter(c => !oldDefaults.has(c.toLowerCase()));
  if (!filtered.some(c => c.toLowerCase() === 'android phone' || c.toLowerCase() === 'android mobile')) {
    filtered.unshift('Android Phone');
  }
  if (!filtered.some(c => c.toLowerCase() === 'keypad phone')) {
    filtered.push('Keypad Phone');
  }
  return filtered.map(c => (c.toLowerCase() === 'android mobile' ? 'Android Phone' : c));
}

export const defaultExpenseCategories: string[] = [
  'Shop Rent',
  'Electricity & Utility Bills',
  'Staff Salaries & Wages',
  'Refreshments & Tea',
  'Cargo & Freight Charges',
  'Packaging & Stationery',
  'Shop Maintenance & Repairs',
  'Marketing & Advertising',
  'Miscellaneous & Taxes',
];

export const defaultOnlineAccounts: OnlineAccount[] = [
  { id: 'OA-1', name: 'Digital Wallet 1', accountNumber: '0300-0000000', accountTitle: 'Main Account', bankType: 'JazzCash' },
  { id: 'OA-2', name: 'Digital Wallet 2', accountNumber: '0345-0000000', accountTitle: 'Business Account', bankType: 'Easypaisa' },
  { id: 'OA-3', name: 'Commercial Bank', accountNumber: '0000-0000000000', accountTitle: 'Shop Current Account', bankType: 'Meezan Bank' },
];

export const CURRENT_BACKUP_VERSION = 2;

export const initialCleanData: AppData = {
  backupVersion: CURRENT_BACKUP_VERSION,
  lastModified: new Date().toISOString(),
  inventory: [],
  khata: [],
  expenses: [],
  sales: [],
  salesReturns: [],
  purchasesLedger: [],
  supplierPurchases: [],
  settings: defaultSettings,
  categories: [],
  expenseCategories: defaultExpenseCategories,
  activities: [],
  onlineAccounts: defaultOnlineAccounts,
  dailyClosings: [],
  imeiRecords: [],
  stockAdjustments: [],
  tabPreferences: {},
  currentRole: 'admin',
  users: [],
  currentUser: undefined,
};

export const sampleSeedData: AppData = initialCleanData;

export interface BackupValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
  data?: AppData;
  summary?: {
    inventoryCount: number;
    salesCount: number;
    khataCount: number;
    expensesCount: number;
    purchasesCount: number;
    returnsCount: number;
    backupVersion: number;
  };
}

/**
 * Validates a JSON backup object before restore with strict TypeScript typing.
 */
export function validateBackupData(parsed: unknown): BackupValidationResult {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      valid: false,
      error: 'Backup file does not contain a valid JSON object structure.',
    };
  }

  const raw = parsed as Record<string, unknown>;
  const warnings: string[] = [];

  const version = typeof raw.backupVersion === 'number' ? raw.backupVersion : 1;
  if (version > CURRENT_BACKUP_VERSION) {
    return {
      valid: false,
      error: `Incompatible backup version (${version}). This version of MobilePOS supports backup versions up to ${CURRENT_BACKUP_VERSION}. Please update the application.`,
    };
  }

  const rawInventory = Array.isArray(raw.inventory) ? (raw.inventory as Record<string, unknown>[]) : [];
  const rawSales = Array.isArray(raw.sales) ? (raw.sales as Record<string, unknown>[]) : [];
  const rawKhata = Array.isArray(raw.khata) ? (raw.khata as Record<string, unknown>[]) : [];
  const rawSettings = raw.settings && typeof raw.settings === 'object' ? (raw.settings as Partial<ShopSettings>) : {};

  const mergedSettings: ShopSettings = {
    ...defaultSettings,
    ...rawSettings,
    shopName: rawSettings.shopName || defaultSettings.shopName,
    currency: rawSettings.currency || defaultSettings.currency,
  };

  const sanitizedData: AppData = {
    backupVersion: CURRENT_BACKUP_VERSION,
    lastModified: typeof raw.lastModified === 'string' ? raw.lastModified : new Date().toISOString(),
    inventory: rawInventory.map((item, idx) => ({
      id: typeof item.id === 'string' ? item.id : generateEntityId('STK'),
      name: String(item.name || 'Unnamed Product'),
      category: String(item.category || defaultCategories[0]),
      costPrice: Number(item.costPrice) || 0,
      salePrice: Number(item.salePrice) || 0,
      qty: Number(item.qty) || 0,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date(Date.now() + idx).toISOString(),
      barcode: typeof item.barcode === 'string' ? item.barcode : undefined,
      imei: typeof item.imei === 'string' ? item.imei : undefined,
      imeis: Array.isArray(item.imeis) ? (item.imeis.filter(i => typeof i === 'string') as string[]) : undefined,
      status: item.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
      image: typeof item.image === 'string' ? item.image : undefined,
      ram: typeof item.ram === 'string' ? item.ram : undefined,
      storage: typeof item.storage === 'string' ? item.storage : undefined,
      color: typeof item.color === 'string' ? item.color : undefined,
      variants: Array.isArray(item.variants) ? (item.variants as any) : undefined,
    })),
    khata: rawKhata.map((cust) => ({
      id: typeof cust.id === 'string' ? cust.id : generateEntityId('KHT'),
      name: String(cust.name || 'Unnamed Customer'),
      phone: String(cust.phone || ''),
      phone2: typeof cust.phone2 === 'string' ? cust.phone2 : undefined,
      address: typeof cust.address === 'string' ? cust.address : undefined,
      image: typeof cust.image === 'string' ? cust.image : undefined,
      balance: Number(cust.balance) || 0,
      lastUpdated: typeof cust.lastUpdated === 'string' ? cust.lastUpdated : new Date().toISOString(),
      history: Array.isArray(cust.history) ? cust.history : [],
    })),
    expenses: (Array.isArray(raw.expenses) ? (raw.expenses as Record<string, unknown>[]) : []).map((exp) => ({
      id: typeof exp.id === 'string' ? exp.id : generateEntityId('EXP'),
      description: String(exp.description || 'Expense'),
      category: String(exp.category || defaultExpenseCategories[0]),
      amount: Number(exp.amount) || 0,
      date: typeof exp.date === 'string' ? exp.date : new Date().toISOString(),
      paymentMethod: typeof exp.paymentMethod === 'string' ? exp.paymentMethod : 'Cash',
      image: typeof exp.image === 'string' ? exp.image : undefined,
      accountId: typeof exp.accountId === 'string' ? exp.accountId : undefined,
    })),
    sales: rawSales.map((s) => ({
      invNo: String(s.invNo || generateEntityId('INV')),
      custName: String(s.custName || 'Walk-in Customer'),
      custPhone: typeof s.custPhone === 'string' ? s.custPhone : undefined,
      invoiceType: s.invoiceType === 'credit' ? 'credit' : 'cash',
      amountPaid: typeof s.amountPaid === 'number' ? s.amountPaid : undefined,
      amountDue: typeof s.amountDue === 'number' ? s.amountDue : undefined,
      khataCustomerId: typeof s.khataCustomerId === 'string' ? s.khataCustomerId : undefined,
      items: Array.isArray(s.items) ? s.items : [],
      subtotal: Number(s.subtotal) || 0,
      discount: Number(s.discount) || 0,
      grandTotal: Number(s.grandTotal) || 0,
      totalCost: Number(s.totalCost) || 0,
      netProfit: Number(s.netProfit) || 0,
      paymentMethod: (typeof s.paymentMethod === 'string' ? (s.paymentMethod as PaymentMethod) : 'Cash'),
      accountId: typeof s.accountId === 'string' ? s.accountId : undefined,
      date: typeof s.date === 'string' ? s.date : new Date().toISOString(),
      returnStatus: s.returnStatus === 'FULL' || s.returnStatus === 'PARTIAL' ? s.returnStatus : 'NONE',
      totalRefunded: typeof s.totalRefunded === 'number' ? s.totalRefunded : 0,
      status: s.status === 'CANCELLED' ? 'CANCELLED' : 'COMPLETED',
      notes: typeof s.notes === 'string' ? s.notes : undefined,
    })),
    salesReturns: Array.isArray(raw.salesReturns) ? (raw.salesReturns as SalesReturnRecord[]) : [],
    purchasesLedger: Array.isArray(raw.purchasesLedger) ? (raw.purchasesLedger as PurchaseLedgerEntry[]) : [],
    supplierPurchases: Array.isArray(raw.supplierPurchases) ? (raw.supplierPurchases as SupplierPurchase[]) : [],
    settings: mergedSettings,
    categories: cleanCategories(raw.categories),
    expenseCategories: Array.isArray(raw.expenseCategories) ? (raw.expenseCategories as string[]) : defaultExpenseCategories,
    activities: Array.isArray(raw.activities) ? (raw.activities as ActivityLog[]) : [],
    dailyClosings: Array.isArray(raw.dailyClosings) ? raw.dailyClosings : [],
    onlineAccounts: Array.isArray(raw.onlineAccounts) ? (raw.onlineAccounts as OnlineAccount[]) : defaultOnlineAccounts,
    imeiRecords: Array.isArray(raw.imeiRecords) ? (raw.imeiRecords as ImeiRecord[]) : [],
    stockAdjustments: Array.isArray(raw.stockAdjustments) ? (raw.stockAdjustments as StockAdjustment[]) : [],
    tabPreferences: raw.tabPreferences && typeof raw.tabPreferences === 'object' ? (raw.tabPreferences as TabPreferences) : {},
    currentRole: raw.currentRole === 'salesman' ? 'salesman' : 'admin',
    users: Array.isArray(raw.users) ? (raw.users as UserAccount[]) : [],
    currentUser: raw.currentUser && typeof raw.currentUser === 'object' ? (raw.currentUser as UserAccount) : undefined,
  };

  return {
    valid: true,
    warnings: warnings.length > 0 ? warnings : undefined,
    data: sanitizedData,
    summary: {
      inventoryCount: sanitizedData.inventory.length,
      salesCount: sanitizedData.sales.length,
      khataCount: sanitizedData.khata.length,
      expensesCount: sanitizedData.expenses.length,
      purchasesCount: (sanitizedData.supplierPurchases || []).length,
      returnsCount: (sanitizedData.salesReturns || []).length,
      backupVersion: version,
    },
  };
}

/**
 * Sanitizes object to be safely stored in Firestore (replaces undefined with null or removes undefined keys).
 */
export function sanitizeForFirestore<T>(obj: T): unknown {
  if (obj === undefined) return null;
  if (obj === null) return null;
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForFirestore(item));
  }
  if (typeof obj === 'object') {
    const res: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      const val = (obj as Record<string, unknown>)[key];
      if (val !== undefined) {
        res[key] = sanitizeForFirestore(val);
      }
    }
    return res;
  }
  return obj;
}

/**
 * Resolves the active store document reference.
 */
function getStoreDocRef(storeId?: string) {
  const sid = storeId || currentActiveStoreId || DEFAULT_STORE_ID;
  return doc(db, STORES_COLLECTION, sid);
}

/**
 * Saves a sale atomically using Firestore writeBatch inside the isolated store:
 * - Writes Sale to `/stores/{storeId}/sales/{invNo}`
 * - Updates affected inventory items in `/stores/{storeId}/inventory/{itemId}`
 * - Updates customer balance in `/stores/{storeId}/khata/{customerId}` if credit sale
 * - Records activity in `/stores/{storeId}/activities/{actId}`
 * - Updates store root metadata
 */
export async function saveSaleAtomic(
  params: {
    sale: SaleRecord;
    inventoryUpdates: Array<{
      id: string;
      newQty: number;
      remainingImeis?: string[];
    }>;
    khataUpdate?: {
      customerId: string;
      newBalance: number;
      transaction: {
        id: string;
        date: string;
        type: 'credit' | 'payment' | 'debit';
        amount: number;
        note?: string;
      };
    };
    activity?: ActivityLog;
  },
  targetStoreId?: string
): Promise<void> {
  const storeId = targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID;
  const { sale, inventoryUpdates, khataUpdate, activity } = params;

  try {
    const batch = writeBatch(db);

    // 1. Write sale document into isolated store
    const saleDocRef = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.SALES, sale.invNo);
    batch.set(saleDocRef, sanitizeForFirestore(sale) as Record<string, unknown>);

    // 2. Atomic update to inventory subcollection
    for (const invUpdate of inventoryUpdates) {
      const invDocRef = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.INVENTORY, invUpdate.id);
      const updateData: Record<string, unknown> = {
        qty: invUpdate.newQty,
      };
      if (invUpdate.remainingImeis) {
        updateData.imeis = invUpdate.remainingImeis;
        updateData.imei = invUpdate.remainingImeis.join(', ');
      }
      batch.set(invDocRef, sanitizeForFirestore(updateData) as Record<string, unknown>, { merge: true });
    }

    // 3. Atomic update to Khata customer if credit sale
    if (khataUpdate) {
      const khataDocRef = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.KHATA, khataUpdate.customerId);
      const custSnap = await getDoc(khataDocRef);
      if (custSnap.exists()) {
        const currentData = custSnap.data() as KhataCustomer;
        const currentHistory = Array.isArray(currentData.history) ? currentData.history : [];
        batch.set(
          khataDocRef,
          sanitizeForFirestore({
            balance: khataUpdate.newBalance,
            lastUpdated: new Date().toISOString(),
            history: [khataUpdate.transaction, ...currentHistory],
          }) as Record<string, unknown>,
          { merge: true }
        );
      }
    }

    // 4. Activity logging
    if (activity) {
      const actDocRef = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.ACTIVITIES, activity.id);
      batch.set(actDocRef, sanitizeForFirestore(activity) as Record<string, unknown>);
    }

    // 5. Update store root document timestamp
    const rootDocRef = doc(db, STORES_COLLECTION, storeId);
    batch.set(
      rootDocRef,
      {
        lastModified: new Date().toISOString(),
        backupVersion: CURRENT_BACKUP_VERSION,
      },
      { merge: true }
    );

    await batch.commit();
  } catch (err) {
    console.error(`Failed to commit atomic sale in Firestore for store [${storeId}]:`, err);
    throw err;
  }
}

/**
 * Deletes a sale document from `/stores/{storeId}/sales/{invNo}`
 */
export async function deleteSaleFromFirestore(invNo: string, targetStoreId?: string): Promise<void> {
  const storeId = targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID;
  try {
    const saleDocRef = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.SALES, invNo);
    await deleteDoc(saleDocRef);
  } catch (err) {
    console.warn(`Failed to delete sale [${invNo}] from store [${storeId}]:`, err);
  }
}

/**
 * Updates a sale document in `/stores/{storeId}/sales/{invNo}`
 */
export async function updateSaleInFirestore(sale: SaleRecord, targetStoreId?: string): Promise<void> {
  const storeId = targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID;
  try {
    const saleDocRef = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.SALES, sale.invNo);
    await setDoc(saleDocRef, sanitizeForFirestore(sale) as Record<string, unknown>, { merge: true });
  } catch (err) {
    console.warn(`Failed to update sale [${sale.invNo}] in store [${storeId}]:`, err);
  }
}

/**
 * Saves a single inventory item to `/stores/{storeId}/inventory/{id}`
 */
export async function saveInventoryItemToFirestore(item: InventoryItem, targetStoreId?: string): Promise<void> {
  const storeId = targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID;
  try {
    const itemDocRef = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.INVENTORY, item.id);
    await setDoc(itemDocRef, sanitizeForFirestore(item) as Record<string, unknown>, { merge: true });
  } catch (err) {
    console.warn(`Failed to save inventory item [${item.id}] to store [${storeId}]:`, err);
  }
}

/**
 * Deletes an inventory item from `/stores/{storeId}/inventory/{id}`
 */
export async function deleteInventoryItemFromFirestore(id: string, targetStoreId?: string): Promise<void> {
  const storeId = targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID;
  try {
    const itemDocRef = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.INVENTORY, id);
    await deleteDoc(itemDocRef);
  } catch (err) {
    console.warn(`Failed to delete inventory item [${id}] from store [${storeId}]:`, err);
  }
}

/**
 * Saves a single Khata customer to `/stores/{storeId}/khata/{id}`
 */
export async function saveKhataCustomerToFirestore(customer: KhataCustomer, targetStoreId?: string): Promise<void> {
  const storeId = targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID;
  try {
    const custDocRef = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.KHATA, customer.id);
    await setDoc(custDocRef, sanitizeForFirestore(customer) as Record<string, unknown>, { merge: true });
  } catch (err) {
    console.warn(`Failed to save Khata customer [${customer.id}] to store [${storeId}]:`, err);
  }
}

/**
 * Deletes a Khata customer from `/stores/{storeId}/khata/{id}`
 */
export async function deleteKhataCustomerFromFirestore(id: string, targetStoreId?: string): Promise<void> {
  const storeId = targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID;
  try {
    const custDocRef = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.KHATA, id);
    await deleteDoc(custDocRef);
  } catch (err) {
    console.warn(`Failed to delete Khata customer [${id}] from store [${storeId}]:`, err);
  }
}

/**
 * Saves an expense item to `/stores/{storeId}/expenses/{id}`
 */
export async function saveExpenseItemToFirestore(expense: ExpenseItem, targetStoreId?: string): Promise<void> {
  const storeId = targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID;
  try {
    const expDocRef = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.EXPENSES, expense.id);
    await setDoc(expDocRef, sanitizeForFirestore(expense) as Record<string, unknown>, { merge: true });
  } catch (err) {
    console.warn(`Failed to save expense item [${expense.id}] to store [${storeId}]:`, err);
  }
}

/**
 * Deletes an expense item from `/stores/{storeId}/expenses/{id}`
 */
export async function deleteExpenseItemFromFirestore(id: string, targetStoreId?: string): Promise<void> {
  const storeId = targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID;
  try {
    const expDocRef = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.EXPENSES, id);
    await deleteDoc(expDocRef);
  } catch (err) {
    console.warn(`Failed to delete expense item [${id}] from store [${storeId}]:`, err);
  }
}

/**
 * Saves an activity log to `/stores/{storeId}/activities/{id}`
 */
export async function saveActivityLogToFirestore(activity: ActivityLog, targetStoreId?: string): Promise<void> {
  const storeId = targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID;
  try {
    const actDocRef = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.ACTIVITIES, toValidFirestoreDocId(activity.id, 'ACT'));
    await setDoc(actDocRef, sanitizeForFirestore(activity) as Record<string, unknown>);
  } catch (err) {
    if (isQuotaError(err)) {
      setQuotaExceededFlag(true);
      return;
    }
    console.warn(`Failed to save activity log [${activity.id}] to store [${storeId}]:`, err);
  }
}

/**
 * Ensures any document ID written to Firestore strictly complies with firestore.rules `isValidId` (`^[a-zA-Z0-9_-]{1,128}$`).
 */
export function toValidFirestoreDocId(rawId: string | undefined, fallbackPrefix = 'DOC'): string {
  const cleaned = String(rawId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!cleaned) {
    return generateEntityId(fallbackPrefix);
  }
  return cleaned.slice(0, 128);
}

/**
 * Saves a single supplier purchase bill to `/stores/{storeId}/purchases/{id}`
 */
export async function savePurchaseToFirestore(purchase: SupplierPurchase, targetStoreId?: string): Promise<void> {
  const storeId = toValidFirestoreDocId(targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID, 'STR');
  const docId = toValidFirestoreDocId(purchase.id || purchase.billNo, 'PUR');
  try {
    const purDocRef = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.PURCHASES, docId);
    await setDoc(purDocRef, sanitizeForFirestore(purchase) as Record<string, unknown>, { merge: true });
  } catch (err) {
    if (isQuotaError(err)) {
      setQuotaExceededFlag(true);
      return;
    }
    console.warn(`Failed to save supplier purchase [${docId}] to store [${storeId}]:`, err);
  }
}

/**
 * Saves a daily closing record to `/stores/{storeId}/daily_closings/{id}`
 */
export async function saveDailyClosingToFirestore(record: DailyClosingRecord, targetStoreId?: string): Promise<void> {
  const storeId = toValidFirestoreDocId(targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID, 'STR');
  const docId = toValidFirestoreDocId(record.id || record.date, 'DCL');
  try {
    const closingDocRef = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.DAILY_CLOSINGS, docId);
    await setDoc(closingDocRef, sanitizeForFirestore(record) as Record<string, unknown>, { merge: true });
  } catch (err) {
    if (isQuotaError(err)) {
      setQuotaExceededFlag(true);
      return;
    }
    console.warn(`Failed to save daily closing [${docId}] to store [${storeId}]:`, err);
  }
}

/**
 * Deletes a daily closing record from `/stores/{storeId}/daily_closings/{id}`
 */
export async function deleteDailyClosingFromFirestore(id: string, targetStoreId?: string): Promise<void> {
  const storeId = toValidFirestoreDocId(targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID, 'STR');
  const docId = toValidFirestoreDocId(id, 'DCL');
  try {
    const closingDocRef = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.DAILY_CLOSINGS, docId);
    await deleteDoc(closingDocRef);
  } catch (err) {
    if (isQuotaError(err)) {
      setQuotaExceededFlag(true);
      return;
    }
    console.warn(`Failed to delete daily closing [${docId}] from store [${storeId}]:`, err);
  }
}

/**
 * Saves a stock adjustment record to `/stores/{storeId}/stock_adjustments/{id}`
 */
export async function saveStockAdjustmentToFirestore(adj: StockAdjustment, targetStoreId?: string): Promise<void> {
  const storeId = toValidFirestoreDocId(targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID, 'STR');
  const docId = toValidFirestoreDocId(adj.id, 'ADJ');
  try {
    const adjDocRef = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.STOCK_ADJUSTMENTS, docId);
    await setDoc(adjDocRef, sanitizeForFirestore(adj) as Record<string, unknown>, { merge: true });
  } catch (err) {
    if (isQuotaError(err)) {
      setQuotaExceededFlag(true);
      return;
    }
    console.warn(`Failed to save stock adjustment [${docId}] to store [${storeId}]:`, err);
  }
}

/**
 * Saves a sales return record to `/stores/{storeId}/sales_returns/{id}`
 */
export async function saveSalesReturnToFirestore(ret: SalesReturnRecord, targetStoreId?: string): Promise<void> {
  const storeId = toValidFirestoreDocId(targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID, 'STR');
  const docId = toValidFirestoreDocId(ret.id || ret.returnNo, 'RET');
  try {
    const retDocRef = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.SALES_RETURNS, docId);
    await setDoc(retDocRef, sanitizeForFirestore(ret) as Record<string, unknown>, { merge: true });
  } catch (err) {
    if (isQuotaError(err)) {
      setQuotaExceededFlag(true);
      return;
    }
    console.warn(`Failed to save sales return [${docId}] to store [${storeId}]:`, err);
  }
}

/**
 * Saves a batch of purchase ledger entries to `/stores/{storeId}/purchases_ledger/{id}`
 */
export async function savePurchasesLedgerBatchToFirestore(
  entries: PurchaseLedgerEntry[],
  targetStoreId?: string
): Promise<void> {
  if (!entries || entries.length === 0) return;
  const storeId = toValidFirestoreDocId(targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID, 'STR');
  try {
    const chunks = chunkArray(entries, 450);
    for (const chunk of chunks) {
      const batch = writeBatch(db);
      for (const entry of chunk) {
        const docId = toValidFirestoreDocId(entry.id, 'PL');
        const ref = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.PURCHASES_LEDGER, docId);
        batch.set(ref, sanitizeForFirestore(entry) as Record<string, unknown>, { merge: true });
      }
      await batch.commit();
    }
  } catch (err) {
    if (isQuotaError(err)) {
      setQuotaExceededFlag(true);
      return;
    }
    console.warn(`Failed to batch-save purchases ledger to store [${storeId}]:`, err);
  }
}

/**
 * Saves a batch of IMEI tracking records to `/stores/{storeId}/imei_records/{id}`
 */
export async function saveImeiRecordsBatchToFirestore(
  records: ImeiRecord[],
  targetStoreId?: string
): Promise<void> {
  if (!records || records.length === 0) return;
  const storeId = toValidFirestoreDocId(targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID, 'STR');
  try {
    const chunks = chunkArray(records, 450);
    for (const chunk of chunks) {
      const batch = writeBatch(db);
      for (const rec of chunk) {
        const docId = toValidFirestoreDocId(rec.id || rec.imei, 'IMEI');
        const ref = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.IMEI_RECORDS, docId);
        batch.set(ref, sanitizeForFirestore(rec) as Record<string, unknown>, { merge: true });
      }
      await batch.commit();
    }
  } catch (err) {
    if (isQuotaError(err)) {
      setQuotaExceededFlag(true);
      return;
    }
    console.warn(`Failed to batch-save IMEI records to store [${storeId}]:`, err);
  }
}

/**
 * Saves root configuration and settings to `/stores/{storeId}`
 */
export async function saveRootConfigToFirestore(data: Partial<AppData>, targetStoreId?: string): Promise<void> {
  const storeId = targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID;
  try {
    const rootDocRef = doc(db, STORES_COLLECTION, storeId);
    const configToSave: Record<string, unknown> = {
      backupVersion: CURRENT_BACKUP_VERSION,
      lastModified: new Date().toISOString(),
      storeId,
    };

    if (data.settings !== undefined) configToSave.settings = data.settings;
    if (data.categories !== undefined) configToSave.categories = data.categories;
    if (data.expenseCategories !== undefined) configToSave.expenseCategories = data.expenseCategories;
    if (data.onlineAccounts !== undefined) configToSave.onlineAccounts = data.onlineAccounts;
    if (data.dailyClosings !== undefined) configToSave.dailyClosings = data.dailyClosings;
    if (data.imeiRecords !== undefined) configToSave.imeiRecords = data.imeiRecords;
    if (data.stockAdjustments !== undefined) configToSave.stockAdjustments = data.stockAdjustments;
    if (data.purchasesLedger !== undefined) configToSave.purchasesLedger = data.purchasesLedger;
    if (data.supplierPurchases !== undefined) configToSave.supplierPurchases = data.supplierPurchases;
    if (data.salesReturns !== undefined) configToSave.salesReturns = data.salesReturns;
    if (data.tabPreferences !== undefined) configToSave.tabPreferences = data.tabPreferences;
    if (data.currentRole !== undefined) configToSave.currentRole = data.currentRole;
    if (data.users !== undefined && data.users.length > 0) configToSave.users = data.users;

    await setDoc(rootDocRef, sanitizeForFirestore(configToSave) as Record<string, unknown>, { merge: true });
  } catch (err) {
    console.warn(`Failed to save root config for store [${storeId}]:`, err);
  }
}

/**
 * Real-time subscription to root store settings, categories, and config changes across devices.
 */
export function subscribeToStoreRootConfig(
  targetStoreId: string,
  onUpdate: (updatedRoot: Partial<AppData>) => void
): () => void {
  const storeId = targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID;
  const rootDocRef = doc(db, STORES_COLLECTION, storeId);

  return onSnapshot(
    rootDocRef,
    (docSnap) => {
      if (docSnap.exists()) {
        const rootData = docSnap.data() as Record<string, unknown>;
        const patch: Partial<AppData> = {};

        if (rootData.settings !== undefined) patch.settings = rootData.settings as ShopSettings;
        if (rootData.categories !== undefined) patch.categories = rootData.categories as string[];
        if (rootData.expenseCategories !== undefined) patch.expenseCategories = rootData.expenseCategories as string[];
        if (rootData.onlineAccounts !== undefined) patch.onlineAccounts = rootData.onlineAccounts as OnlineAccount[];
        if (rootData.dailyClosings !== undefined) patch.dailyClosings = rootData.dailyClosings as DailyClosingRecord[];
        if (rootData.imeiRecords !== undefined) patch.imeiRecords = rootData.imeiRecords as ImeiRecord[];
        if (rootData.stockAdjustments !== undefined) patch.stockAdjustments = rootData.stockAdjustments as StockAdjustment[];
        if (rootData.purchasesLedger !== undefined) patch.purchasesLedger = rootData.purchasesLedger as PurchaseLedgerEntry[];
        if (rootData.supplierPurchases !== undefined) patch.supplierPurchases = rootData.supplierPurchases as SupplierPurchase[];
        if (rootData.salesReturns !== undefined) patch.salesReturns = rootData.salesReturns as SalesReturnRecord[];
        if (rootData.tabPreferences !== undefined) patch.tabPreferences = rootData.tabPreferences as TabPreferences;
        if (rootData.users !== undefined) patch.users = rootData.users as UserAccount[];

        onUpdate(patch);
      }
    },
    (err) => {
      console.warn(`Real-time root config subscription warning for store [${storeId}]:`, err);
    }
  );
}

/**
 * Universal Real-Time Multi-Device Store Synchronization Listener.
 * Listens to root document AND sub-collections (Inventory, Sales, Khata, Expenses).
 */
export function subscribeToStoreFullData(
  targetStoreId: string,
  onUpdate: (patch: Partial<AppData>) => void
): () => void {
  const storeId = targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID;
  const unsubs: (() => void)[] = [];

  // 1. Root Config & Root Arrays Listener
  unsubs.push(subscribeToStoreRootConfig(storeId, onUpdate));

  // 2. Inventory Subcollection Real-time Listener
  try {
    const invColRef = collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.INVENTORY);
    unsubs.push(
      onSnapshot(
        invColRef,
        (snapshot) => {
          if (!snapshot.empty) {
            const items: InventoryItem[] = [];
            snapshot.forEach(d => items.push(d.data() as InventoryItem));
            onUpdate({ inventory: items });
          }
        },
        (err) => console.warn(`Inventory real-time sync notice [${storeId}]:`, err)
      )
    );
  } catch (err) {
    console.warn(`Inventory listener initialization error [${storeId}]:`, err);
  }

  // 3. Sales Subcollection Real-time Listener
  try {
    const salesColRef = collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.SALES);
    unsubs.push(
      onSnapshot(
        salesColRef,
        (snapshot) => {
          if (!snapshot.empty) {
            const sales: SaleRecord[] = [];
            snapshot.forEach(d => sales.push(d.data() as SaleRecord));
            sales.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            onUpdate({ sales });
          }
        },
        (err) => console.warn(`Sales real-time sync notice [${storeId}]:`, err)
      )
    );
  } catch (err) {
    console.warn(`Sales listener initialization error [${storeId}]:`, err);
  }

  // 4. Khata Subcollection Real-time Listener
  try {
    const khataColRef = collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.KHATA);
    unsubs.push(
      onSnapshot(
        khataColRef,
        (snapshot) => {
          if (!snapshot.empty) {
            const khata: KhataCustomer[] = [];
            snapshot.forEach(d => khata.push(d.data() as KhataCustomer));
            onUpdate({ khata });
          }
        },
        (err) => console.warn(`Khata real-time sync notice [${storeId}]:`, err)
      )
    );
  } catch (err) {
    console.warn(`Khata listener initialization error [${storeId}]:`, err);
  }

  // 5. Expenses Subcollection Real-time Listener
  try {
    const expColRef = collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.EXPENSES);
    unsubs.push(
      onSnapshot(
        expColRef,
        (snapshot) => {
          if (!snapshot.empty) {
            const expenses: ExpenseItem[] = [];
            snapshot.forEach(d => expenses.push(d.data() as ExpenseItem));
            expenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            onUpdate({ expenses });
          }
        },
        (err) => console.warn(`Expenses real-time sync notice [${storeId}]:`, err)
      )
    );
  } catch (err) {
    console.warn(`Expenses listener initialization error [${storeId}]:`, err);
  }

  // 6. Supplier Purchases Subcollection Real-time Listener
  try {
    const purColRef = collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.PURCHASES);
    unsubs.push(
      onSnapshot(
        purColRef,
        (snapshot) => {
          if (!snapshot.empty) {
            const supplierPurchases: SupplierPurchase[] = [];
            snapshot.forEach(d => supplierPurchases.push(d.data() as SupplierPurchase));
            supplierPurchases.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            onUpdate({ supplierPurchases });
          }
        },
        (err) => console.warn(`Purchases real-time sync notice [${storeId}]:`, err)
      )
    );
  } catch (err) {
    console.warn(`Purchases listener initialization error [${storeId}]:`, err);
  }

  // 7. Daily Closings Subcollection Real-time Listener
  try {
    const closingColRef = collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.DAILY_CLOSINGS);
    unsubs.push(
      onSnapshot(
        closingColRef,
        (snapshot) => {
          if (!snapshot.empty) {
            const dailyClosings: DailyClosingRecord[] = [];
            snapshot.forEach(d => dailyClosings.push(d.data() as DailyClosingRecord));
            dailyClosings.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            onUpdate({ dailyClosings });
          }
        },
        (err) => console.warn(`Daily closings real-time sync notice [${storeId}]:`, err)
      )
    );
  } catch (err) {
    console.warn(`Daily closings listener initialization error [${storeId}]:`, err);
  }

  // 8. Sales Returns Subcollection Real-time Listener
  try {
    const retColRef = collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.SALES_RETURNS);
    unsubs.push(
      onSnapshot(
        retColRef,
        (snapshot) => {
          if (!snapshot.empty) {
            const salesReturns: SalesReturnRecord[] = [];
            snapshot.forEach(d => salesReturns.push(d.data() as SalesReturnRecord));
            salesReturns.sort((a, b) => new Date(b.returnDate).getTime() - new Date(a.returnDate).getTime());
            onUpdate({ salesReturns });
          }
        },
        (err) => console.warn(`Sales returns real-time sync notice [${storeId}]:`, err)
      )
    );
  } catch (err) {
    console.warn(`Sales returns listener initialization error [${storeId}]:`, err);
  }

  // 9. Stock Adjustments Subcollection Real-time Listener
  try {
    const adjColRef = collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.STOCK_ADJUSTMENTS);
    unsubs.push(
      onSnapshot(
        adjColRef,
        (snapshot) => {
          if (!snapshot.empty) {
            const stockAdjustments: StockAdjustment[] = [];
            snapshot.forEach(d => stockAdjustments.push(d.data() as StockAdjustment));
            stockAdjustments.sort((a, b) => new Date(b.adjustedAt).getTime() - new Date(a.adjustedAt).getTime());
            onUpdate({ stockAdjustments });
          }
        },
        (err) => console.warn(`Stock adjustments real-time sync notice [${storeId}]:`, err)
      )
    );
  } catch (err) {
    console.warn(`Stock adjustments listener initialization error [${storeId}]:`, err);
  }

  // 10. Purchases Ledger Subcollection Real-time Listener
  try {
    const ledgerColRef = collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.PURCHASES_LEDGER);
    unsubs.push(
      onSnapshot(
        ledgerColRef,
        (snapshot) => {
          if (!snapshot.empty) {
            const purchasesLedger: PurchaseLedgerEntry[] = [];
            snapshot.forEach(d => purchasesLedger.push(d.data() as PurchaseLedgerEntry));
            purchasesLedger.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            onUpdate({ purchasesLedger });
          }
        },
        (err) => console.warn(`Purchases ledger real-time sync notice [${storeId}]:`, err)
      )
    );
  } catch (err) {
    console.warn(`Purchases ledger listener initialization error [${storeId}]:`, err);
  }

  // 11. IMEI Records Subcollection Real-time Listener
  try {
    const imeiColRef = collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.IMEI_RECORDS);
    unsubs.push(
      onSnapshot(
        imeiColRef,
        (snapshot) => {
          if (!snapshot.empty) {
            const imeiRecords: ImeiRecord[] = [];
            snapshot.forEach(d => imeiRecords.push(d.data() as ImeiRecord));
            onUpdate({ imeiRecords });
          }
        },
        (err) => console.warn(`IMEI records real-time sync notice [${storeId}]:`, err)
      )
    );
  } catch (err) {
    console.warn(`IMEI records listener initialization error [${storeId}]:`, err);
  }

  return () => {
    unsubs.forEach(unsub => {
      try {
        unsub();
      } catch {
        // ignore
      }
    });
  };
}

/**
 * Dual Persistence for User Accounts:
 * 1. Global registry at `/users/{user.id}` (enables instant multi-device login discovery)
 * 2. Store sub-collection at `/stores/{storeId}/users/{user.id}`
 * 3. Store root document `users` array
 */
export async function saveUserToFirestore(user: UserAccount, targetStoreId?: string): Promise<void> {
  const effectiveStoreId = user.storeId || targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID;
  const userWithStore: UserAccount = {
    ...user,
    storeId: effectiveStoreId,
  };

  try {
    // 1. Save to global authentication registry so ANY device can look up this account
    const globalUserDocRef = doc(db, 'users', userWithStore.id);
    await setDoc(globalUserDocRef, sanitizeForFirestore(userWithStore) as Record<string, unknown>, { merge: true });

    // 2. Save into the tenant store's users sub-collection
    const storeUserDocRef = doc(db, STORES_COLLECTION, effectiveStoreId, SUB_COLLECTIONS.USERS, userWithStore.id);
    await setDoc(storeUserDocRef, sanitizeForFirestore(userWithStore) as Record<string, unknown>, { merge: true });

    // 3. Update users list in store root document
    const rootDocRef = doc(db, STORES_COLLECTION, effectiveStoreId);
    const rootSnap = await getDoc(rootDocRef);
    if (rootSnap.exists()) {
      const curUsers = (rootSnap.data()?.users as UserAccount[]) || [];
      const idx = curUsers.findIndex(u => u.id === userWithStore.id);
      const updated = idx >= 0 ? curUsers.map(u => (u.id === userWithStore.id ? userWithStore : u)) : [...curUsers, userWithStore];
      await setDoc(rootDocRef, { users: sanitizeForFirestore(updated) }, { merge: true });
    }
  } catch (err) {
    console.warn('Failed to save user account to Firestore:', err);
  }
}

/**
 * Deletes an individual user document from global registry and store
 */
export async function deleteUserFromFirestore(userId: string, targetStoreId?: string): Promise<void> {
  const storeId = targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID;
  try {
    // 1. Delete from global registry
    const globalUserDocRef = doc(db, 'users', userId);
    await deleteDoc(globalUserDocRef).catch(() => {});

    // 2. Delete across all known store paths to avoid orphaned subcollection docs
    const storeIdsToCheck = Array.from(
      new Set([storeId, currentActiveStoreId, DEFAULT_STORE_ID, 'USR-ADM-1793988681742', 'USR-ADM-1793966178251'])
    ).filter(Boolean);

    for (const sid of storeIdsToCheck) {
      const storeUserDocRef = doc(db, STORES_COLLECTION, sid, SUB_COLLECTIONS.USERS, userId);
      await deleteDoc(storeUserDocRef).catch(() => {});

      // 3. Update store root doc users list
      const rootDocRef = doc(db, STORES_COLLECTION, sid);
      const rootSnap = await getDoc(rootDocRef).catch(() => null);
      if (rootSnap && rootSnap.exists()) {
        const curUsers = (rootSnap.data()?.users as UserAccount[]) || [];
        const updated = curUsers.filter(u => u.id !== userId);
        await setDoc(rootDocRef, { users: sanitizeForFirestore(updated) }, { merge: true }).catch(() => {});
      }
    }
  } catch (err) {
    console.warn(`Failed to delete user [${userId}] from Firestore:`, err);
  }
}

/**
 * Fetches all registered live user profiles from Firestore for multi-device authentication.
 * Searches global `/users` collection and checks legacy paths if needed.
 */
export async function fetchLiveUsersFromFirestore(): Promise<UserAccount[]> {
  try {
    const usersMap = new Map<string, UserAccount>();
    const sid = currentActiveStoreId || DEFAULT_STORE_ID;

    // Fetch all user registries in parallel to minimize login latency
    const [globalSnap, storeUsersSnap, legacySnap, legacyRootSnap] = await Promise.all([
      getDocs(collection(db, 'users')).catch(() => null),
      getDocs(collection(db, STORES_COLLECTION, sid, SUB_COLLECTIONS.USERS)).catch(() => null),
      getDocs(collection(db, LEGACY_FIRESTORE_COLLECTION, DEFAULT_STORE_ID, SUB_COLLECTIONS.USERS)).catch(() => null),
      getDoc(doc(db, LEGACY_FIRESTORE_COLLECTION, DEFAULT_STORE_ID)).catch(() => null),
    ]);

    // 1. Global registry
    if (globalSnap) {
      globalSnap.forEach(d => {
        const u = d.data() as UserAccount;
        if (u && u.id) {
          if (!u.storeId) {
            u.storeId = u.role === 'admin' ? u.id : DEFAULT_STORE_ID;
          }
          usersMap.set(u.id, u);
        }
      });
    }

    // 2. Store users sub-collection
    if (storeUsersSnap) {
      storeUsersSnap.forEach(d => {
        const u = d.data() as UserAccount;
        if (u && u.id && !usersMap.has(u.id)) {
          if (!u.storeId) u.storeId = sid;
          usersMap.set(u.id, u);
        }
      });
    }

    // 3. Legacy compatibility fallback
    if (legacySnap) {
      legacySnap.forEach(d => {
        const u = d.data() as UserAccount;
        if (u && u.id && !usersMap.has(u.id)) {
          if (!u.storeId) u.storeId = u.role === 'admin' ? u.id : DEFAULT_STORE_ID;
          usersMap.set(u.id, u);
        }
      });
    }
    if (legacyRootSnap && legacyRootSnap.exists()) {
      const legacyRootUsers = (legacyRootSnap.data()?.users as UserAccount[]) || [];
      legacyRootUsers.forEach(u => {
        if (u && u.id && !usersMap.has(u.id)) {
          if (!u.storeId) u.storeId = u.role === 'admin' ? u.id : DEFAULT_STORE_ID;
          usersMap.set(u.id, u);
        }
      });
    }

    // 4. Strict Deduplication: An admin email must only ever yield a single master record
    const deduplicatedMap = new Map<string, UserAccount>();
    const seenAdminEmails = new Set<string>();
    
    // Sort so admins with is2faEnabled are prioritized first
    const sorted = Array.from(usersMap.values()).sort((a, b) => {
      if (a.role === 'admin' && b.role === 'admin') {
        const aScore = (a.is2faEnabled ? 2 : 0) + (a.totpSecret ? 1 : 0);
        const bScore = (b.is2faEnabled ? 2 : 0) + (b.totpSecret ? 1 : 0);
        return bScore - aScore;
      }
      return 0;
    });

    for (const u of sorted) {
      if (!u || !u.id) continue;
      if (u.role === 'admin') {
        const em = (u.email || '').toLowerCase().trim();
        if (seenAdminEmails.has(em)) continue;
        seenAdminEmails.add(em);
      }
      deduplicatedMap.set(u.id, u);
    }

    return Array.from(deduplicatedMap.values());
  } catch (err) {
    console.warn('Failed to fetch live users from Firestore:', err);
    return [];
  }
}

/**
 * Saves complete AppData to Firestore under `/stores/{storeId}` using chunked write batches.
 */
export async function saveAppDataToFirestore(data: AppData, targetStoreId?: string): Promise<void> {
  const storeId = targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID;

  try {
    // 1. Save root document
    await saveRootConfigToFirestore(data, storeId);

    // 2. Save Inventory in batches
    const inventoryChunks = chunkArray(data.inventory || [], 450);
    for (const chunk of inventoryChunks) {
      const batch = writeBatch(db);
      for (const item of chunk) {
        const itemRef = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.INVENTORY, item.id);
        batch.set(itemRef, sanitizeForFirestore(item) as Record<string, unknown>);
      }
      await batch.commit();
    }

    // 3. Save Sales in batches
    const salesChunks = chunkArray(data.sales || [], 450);
    for (const chunk of salesChunks) {
      const batch = writeBatch(db);
      for (const sale of chunk) {
        const saleRef = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.SALES, sale.invNo);
        batch.set(saleRef, sanitizeForFirestore(sale) as Record<string, unknown>);
      }
      await batch.commit();
    }

    // 4. Save Khata in batches
    const khataChunks = chunkArray(data.khata || [], 450);
    for (const chunk of khataChunks) {
      const batch = writeBatch(db);
      for (const cust of chunk) {
        const custRef = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.KHATA, cust.id);
        batch.set(custRef, sanitizeForFirestore(cust) as Record<string, unknown>);
      }
      await batch.commit();
    }

    // 5. Save Expenses in batches
    const expenseChunks = chunkArray(data.expenses || [], 450);
    for (const chunk of expenseChunks) {
      const batch = writeBatch(db);
      for (const exp of chunk) {
        const expRef = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.EXPENSES, exp.id);
        batch.set(expRef, sanitizeForFirestore(exp) as Record<string, unknown>);
      }
      await batch.commit();
    }

    // 6. Save Activities (recent 200)
    const recentActivities = (data.activities || []).slice(0, 200);
    if (recentActivities.length > 0) {
      const batch = writeBatch(db);
      for (const act of recentActivities) {
        const actRef = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.ACTIVITIES, toValidFirestoreDocId(act.id, 'ACT'));
        batch.set(actRef, sanitizeForFirestore(act) as Record<string, unknown>);
      }
      await batch.commit();
    }

    // 7. Save Supplier Purchases in batches
    const purchaseChunks = chunkArray(data.supplierPurchases || [], 450);
    for (const chunk of purchaseChunks) {
      const batch = writeBatch(db);
      for (const pur of chunk) {
        const purRef = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.PURCHASES, toValidFirestoreDocId(pur.id || pur.billNo, 'PUR'));
        batch.set(purRef, sanitizeForFirestore(pur) as Record<string, unknown>, { merge: true });
      }
      await batch.commit();
    }

    // 8. Save Daily Closings, Sales Returns, Stock Adjustments, Purchases Ledger, and IMEI Records
    if (data.dailyClosings && data.dailyClosings.length > 0) {
      const closingChunks = chunkArray(data.dailyClosings, 450);
      for (const chunk of closingChunks) {
        const batch = writeBatch(db);
        for (const rec of chunk) {
          const ref = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.DAILY_CLOSINGS, toValidFirestoreDocId(rec.id || rec.date, 'DCL'));
          batch.set(ref, sanitizeForFirestore(rec) as Record<string, unknown>, { merge: true });
        }
        await batch.commit();
      }
    }

    if (data.salesReturns && data.salesReturns.length > 0) {
      const returnChunks = chunkArray(data.salesReturns, 450);
      for (const chunk of returnChunks) {
        const batch = writeBatch(db);
        for (const ret of chunk) {
          const ref = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.SALES_RETURNS, toValidFirestoreDocId(ret.id || ret.returnNo, 'RET'));
          batch.set(ref, sanitizeForFirestore(ret) as Record<string, unknown>, { merge: true });
        }
        await batch.commit();
      }
    }

    if (data.stockAdjustments && data.stockAdjustments.length > 0) {
      const adjChunks = chunkArray(data.stockAdjustments, 450);
      for (const chunk of adjChunks) {
        const batch = writeBatch(db);
        for (const adj of chunk) {
          const ref = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.STOCK_ADJUSTMENTS, toValidFirestoreDocId(adj.id, 'ADJ'));
          batch.set(ref, sanitizeForFirestore(adj) as Record<string, unknown>, { merge: true });
        }
        await batch.commit();
      }
    }

    await savePurchasesLedgerBatchToFirestore(data.purchasesLedger || [], storeId);
    await saveImeiRecordsBatchToFirestore(data.imeiRecords || [], storeId);
  } catch (error) {
    console.warn(`Firebase Firestore save notice for store [${storeId}]:`, error);
    if (isQuotaError(error)) {
      setQuotaExceededFlag(true);
      return;
    }
    if (
      error instanceof Error &&
      (error.message.includes('permission') || (error as any).code === 'permission-denied')
    ) {
      handleFirestoreError(error, OperationType.WRITE, `${STORES_COLLECTION}/${storeId}`);
    }
    throw error;
  }
}

/**
 * Loads isolated POS store data from Firebase Firestore.
 * Supports automatic fallback migration from legacy pos_data/main_store if the primary store is not yet initialized.
 */
export async function loadAppDataFromFirestore(targetStoreId?: string): Promise<AppData | null> {
  const storeId = targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID;

  try {
    let rootDocRef = doc(db, STORES_COLLECTION, storeId);
    let rootDocSnap = await getDoc(rootDocRef);

    // If store document does not exist yet, check if legacy pos_data/main_store exists for backward compatibility
    if (!rootDocSnap.exists()) {
      const legacyRef = doc(db, LEGACY_FIRESTORE_COLLECTION, DEFAULT_STORE_ID);
      const legacySnap = await getDoc(legacyRef);

      if (legacySnap.exists() && (storeId === DEFAULT_STORE_ID || storeId.startsWith('USR-ADM-'))) {
        console.info(`Migrating legacy store data from [${LEGACY_FIRESTORE_COLLECTION}/${DEFAULT_STORE_ID}] to [${STORES_COLLECTION}/${storeId}]...`);
        // Load legacy sub-collections and migrate
        const legacyData = await loadAppDataFromLegacyFirestore();
        if (legacyData) {
          await saveAppDataToFirestore(legacyData, storeId);
          return legacyData;
        }
      }

      return null;
    }

    const rootData = rootDocSnap.data() as Record<string, unknown>;

    // Load sub-collections for this isolated store in parallel
    const emptySnap = { docs: [], forEach: () => {} } as any;
    const [
      salesSnap,
      invSnap,
      khataSnap,
      expSnap,
      actSnap,
      usersSnap,
      purSnap,
      closingSnap,
      returnsSnap,
      adjSnap,
      ledgerSnap,
      imeiSnap,
    ] = await Promise.all([
      getDocs(collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.SALES)),
      getDocs(collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.INVENTORY)),
      getDocs(collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.KHATA)),
      getDocs(collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.EXPENSES)),
      getDocs(
        query(
          collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.ACTIVITIES),
          orderBy('timestamp', 'desc'),
          limit(300)
        )
      ).catch(() => getDocs(collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.ACTIVITIES))),
      getDocs(collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.USERS)).catch(() => emptySnap),
      getDocs(collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.PURCHASES)).catch(() => emptySnap),
      getDocs(collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.DAILY_CLOSINGS)).catch(() => emptySnap),
      getDocs(collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.SALES_RETURNS)).catch(() => emptySnap),
      getDocs(collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.STOCK_ADJUSTMENTS)).catch(() => emptySnap),
      getDocs(collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.PURCHASES_LEDGER)).catch(() => emptySnap),
      getDocs(collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.IMEI_RECORDS)).catch(() => emptySnap),
    ]);

    const sales: SaleRecord[] = [];
    salesSnap.forEach(docSnap => sales.push(docSnap.data() as SaleRecord));

    if (sales.length === 0) {
      const storesToCheck = ['USR-ADM-1793988681742', 'USR-ADM-1793966178251'];
      for (const altSid of storesToCheck) {
        if (sales.length > 0) break;
        try {
          const altSales = await getDocs(collection(db, STORES_COLLECTION, altSid, SUB_COLLECTIONS.SALES));
          altSales.forEach(docSnap => sales.push(docSnap.data() as SaleRecord));
        } catch {
          // ignore
        }
      }
    }

    const inventory: InventoryItem[] = [];
    invSnap.forEach(docSnap => inventory.push(docSnap.data() as InventoryItem));

    // Fallback migration: If main_store has 0 inventory items, check previous admin stores or legacy
    if (inventory.length === 0) {
      const storesToCheck = ['USR-ADM-1793988681742', 'USR-ADM-1793966178251'];
      for (const altSid of storesToCheck) {
        if (inventory.length > 0) break;
        try {
          const altSnap = await getDocs(collection(db, STORES_COLLECTION, altSid, SUB_COLLECTIONS.INVENTORY));
          altSnap.forEach(docSnap => inventory.push(docSnap.data() as InventoryItem));
        } catch {
          // ignore
        }
      }
      if (inventory.length === 0) {
        try {
          const legacyInvSnap = await getDocs(collection(db, LEGACY_FIRESTORE_COLLECTION, DEFAULT_STORE_ID, SUB_COLLECTIONS.INVENTORY));
          legacyInvSnap.forEach(docSnap => inventory.push(docSnap.data() as InventoryItem));
        } catch {
          // ignore
        }
      }
      // If found in fallback, migrate to main_store immediately
      if (inventory.length > 0 && storeId === DEFAULT_STORE_ID) {
        for (const item of inventory) {
          await saveInventoryItemToFirestore(item, DEFAULT_STORE_ID);
        }
      }
    }

    const khata: KhataCustomer[] = [];
    khataSnap.forEach(docSnap => khata.push(docSnap.data() as KhataCustomer));

    const expenses: ExpenseItem[] = [];
    expSnap.forEach(docSnap => expenses.push(docSnap.data() as ExpenseItem));

    const activities: ActivityLog[] = [];
    actSnap.forEach(docSnap => activities.push(docSnap.data() as ActivityLog));

    const mergeSubAndRoot = <T>(rootArr: T[] = [], snap: any, keyFn: (item: T) => string | undefined): T[] => {
      const map = new Map<string, T>();
      (Array.isArray(rootArr) ? rootArr : []).forEach(item => {
        const k = keyFn(item);
        if (k) map.set(k, item);
      });
      if (snap && typeof snap.forEach === 'function') {
        snap.forEach((docSnap: any) => {
          const item = docSnap.data() as T;
          const k = keyFn(item);
          if (k) map.set(k, item);
        });
      }
      return Array.from(map.values());
    };

    const supplierPurchases = mergeSubAndRoot(
      (rootData.supplierPurchases as SupplierPurchase[]) || [],
      purSnap,
      p => p.id || p.billNo
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const dailyClosings = mergeSubAndRoot(
      (rootData.dailyClosings as DailyClosingRecord[]) || [],
      closingSnap,
      d => d.id || d.date
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const salesReturns = mergeSubAndRoot(
      (rootData.salesReturns as SalesReturnRecord[]) || [],
      returnsSnap,
      r => r.returnNo || r.id
    ).sort((a, b) => new Date(b.returnDate).getTime() - new Date(a.returnDate).getTime());

    const stockAdjustments = mergeSubAndRoot(
      (rootData.stockAdjustments as StockAdjustment[]) || [],
      adjSnap,
      a => a.id
    ).sort((a, b) => new Date(b.adjustedAt).getTime() - new Date(a.adjustedAt).getTime());

    const purchasesLedger = mergeSubAndRoot(
      (rootData.purchasesLedger as PurchaseLedgerEntry[]) || [],
      ledgerSnap,
      l => l.id
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const imeiRecords = mergeSubAndRoot(
      (rootData.imeiRecords as ImeiRecord[]) || [],
      imeiSnap,
      r => r.id || r.imei
    );

    // Reconcile users for this store
    const subUsers: UserAccount[] = [];
    if (usersSnap && usersSnap.docs) {
      usersSnap.forEach((docSnap: any) => subUsers.push(docSnap.data() as UserAccount));
    }
    const rootUsers = (rootData.users as UserAccount[]) || [];
    const usersMap = new Map<string, UserAccount>();
    rootUsers.forEach(u => {
      if (u && u.id) usersMap.set(u.id, u);
    });
    subUsers.forEach(u => {
      if (u && u.id) usersMap.set(u.id, u);
    });
    // Deduplicate admin accounts by email so duplicate ghosts never appear
    const deduplicatedUsersMap = new Map<string, UserAccount>();
    const seenAdminEmails = new Set<string>();
    for (const u of usersMap.values()) {
      if (u.role === 'admin') {
        const em = (u.email || '').toLowerCase().trim();
        if (seenAdminEmails.has(em)) continue;
        seenAdminEmails.add(em);
      }
      deduplicatedUsersMap.set(u.id, u);
    }
    const assembledUsers = Array.from(deduplicatedUsersMap.values());

    const assembledData: AppData = {
      backupVersion: CURRENT_BACKUP_VERSION,
      lastModified: typeof rootData.lastModified === 'string' ? rootData.lastModified : new Date().toISOString(),
      settings: (rootData.settings as ShopSettings) || defaultSettings,
      categories: cleanCategories(rootData.categories),
      expenseCategories: Array.isArray(rootData.expenseCategories) ? (rootData.expenseCategories as string[]) : defaultExpenseCategories,
      onlineAccounts: Array.isArray(rootData.onlineAccounts) ? (rootData.onlineAccounts as OnlineAccount[]) : defaultOnlineAccounts,
      dailyClosings,
      imeiRecords,
      stockAdjustments,
      purchasesLedger,
      supplierPurchases,
      salesReturns,
      tabPreferences: (rootData.tabPreferences as TabPreferences) || {},
      users: assembledUsers,
      currentRole: (rootData.currentRole as UserRole) || 'admin',
      currentUser: (rootData.currentUser as UserAccount) || undefined,
      inventory,
      sales,
      khata,
      expenses,
      activities,
    };

    return assembledData;
  } catch (error) {
    console.warn(`Firebase Firestore load notice for store [${storeId}]:`, error);
    if (isQuotaError(error)) {
      setQuotaExceededFlag(true);
      return null;
    }
    if (
      error instanceof Error &&
      (error.message.includes('permission') || (error as any).code === 'permission-denied')
    ) {
      handleFirestoreError(error, OperationType.GET, `${STORES_COLLECTION}/${storeId}`);
    }
    return null;
  }
}

/**
 * Internal helper to read legacy pos_data/main_store for migration
 */
async function loadAppDataFromLegacyFirestore(): Promise<AppData | null> {
  try {
    const rootDocRef = doc(db, LEGACY_FIRESTORE_COLLECTION, DEFAULT_STORE_ID);
    const rootDocSnap = await getDoc(rootDocRef);
    if (!rootDocSnap.exists()) return null;
    const rootData = rootDocSnap.data() as Record<string, unknown>;

    const [salesSnap, invSnap, khataSnap, expSnap, actSnap, usersSnap] = await Promise.all([
      getDocs(collection(db, LEGACY_FIRESTORE_COLLECTION, DEFAULT_STORE_ID, SUB_COLLECTIONS.SALES)).catch(() => ({ docs: [], forEach: () => {} } as any)),
      getDocs(collection(db, LEGACY_FIRESTORE_COLLECTION, DEFAULT_STORE_ID, SUB_COLLECTIONS.INVENTORY)).catch(() => ({ docs: [], forEach: () => {} } as any)),
      getDocs(collection(db, LEGACY_FIRESTORE_COLLECTION, DEFAULT_STORE_ID, SUB_COLLECTIONS.KHATA)).catch(() => ({ docs: [], forEach: () => {} } as any)),
      getDocs(collection(db, LEGACY_FIRESTORE_COLLECTION, DEFAULT_STORE_ID, SUB_COLLECTIONS.EXPENSES)).catch(() => ({ docs: [], forEach: () => {} } as any)),
      getDocs(collection(db, LEGACY_FIRESTORE_COLLECTION, DEFAULT_STORE_ID, SUB_COLLECTIONS.ACTIVITIES)).catch(() => ({ docs: [], forEach: () => {} } as any)),
      getDocs(collection(db, LEGACY_FIRESTORE_COLLECTION, DEFAULT_STORE_ID, SUB_COLLECTIONS.USERS)).catch(() => ({ docs: [], forEach: () => {} } as any)),
    ]);

    const sales: SaleRecord[] = [];
    salesSnap.forEach((d: any) => sales.push(d.data()));

    const inventory: InventoryItem[] = [];
    invSnap.forEach((d: any) => inventory.push(d.data()));

    const khata: KhataCustomer[] = [];
    khataSnap.forEach((d: any) => khata.push(d.data()));

    const expenses: ExpenseItem[] = [];
    expSnap.forEach((d: any) => expenses.push(d.data()));

    const activities: ActivityLog[] = [];
    actSnap.forEach((d: any) => activities.push(d.data()));

    const users: UserAccount[] = [];
    usersSnap.forEach((d: any) => users.push(d.data()));
    const rootUsers = (rootData.users as UserAccount[]) || [];
    const usersMap = new Map<string, UserAccount>();
    rootUsers.forEach(u => u && u.id && usersMap.set(u.id, u));
    users.forEach(u => u && u.id && usersMap.set(u.id, u));

    return {
      backupVersion: CURRENT_BACKUP_VERSION,
      lastModified: new Date().toISOString(),
      settings: (rootData.settings as ShopSettings) || defaultSettings,
      categories: cleanCategories(rootData.categories),
      expenseCategories: Array.isArray(rootData.expenseCategories) ? (rootData.expenseCategories as string[]) : defaultExpenseCategories,
      onlineAccounts: Array.isArray(rootData.onlineAccounts) ? (rootData.onlineAccounts as OnlineAccount[]) : defaultOnlineAccounts,
      dailyClosings: (rootData.dailyClosings as DailyClosingRecord[]) || [],
      imeiRecords: (rootData.imeiRecords as ImeiRecord[]) || [],
      stockAdjustments: (rootData.stockAdjustments as StockAdjustment[]) || [],
      purchasesLedger: (rootData.purchasesLedger as PurchaseLedgerEntry[]) || [],
      supplierPurchases: (rootData.supplierPurchases as SupplierPurchase[]) || [],
      salesReturns: (rootData.salesReturns as SalesReturnRecord[]) || [],
      tabPreferences: (rootData.tabPreferences as TabPreferences) || {},
      users: Array.from(usersMap.values()),
      currentRole: 'admin',
      inventory,
      sales,
      khata,
      expenses,
      activities,
    };
  } catch {
    return null;
  }
}

/**
 * Helper to fetch fallback cached inventory across local keys
 */
function getFallbackLocalInventory(): InventoryItem[] {
  try {
    const mainKey = getLocalStorageKey(DEFAULT_STORE_ID);
    const mainRaw = localStorage.getItem(mainKey);
    if (mainRaw) {
      const parsed = JSON.parse(mainRaw);
      const validation = validateBackupData(parsed);
      if (validation.valid && validation.data && validation.data.inventory && validation.data.inventory.length > 0) {
        return validation.data.inventory;
      }
    }
    const legacyRaw = localStorage.getItem(STORAGE_KEY);
    if (legacyRaw) {
      const parsedLegacy = JSON.parse(legacyRaw);
      const validation = validateBackupData(parsedLegacy);
      if (validation.valid && validation.data && validation.data.inventory && validation.data.inventory.length > 0) {
        return validation.data.inventory;
      }
    }
  } catch {
    // ignore
  }
  return [];
}

/**
 * Loads data from isolated localStorage partition with schema version migration.
 */
export function loadStoredData(targetStoreId?: string): AppData {
  try {
    const key = getLocalStorageKey(targetStoreId);
    const raw = localStorage.getItem(key);

    if (raw) {
      const parsed = JSON.parse(raw);
      const validation = validateBackupData(parsed);
      if (validation.valid && validation.data) {
        if (validation.data.inventory && validation.data.inventory.length > 0) {
          return validation.data;
        }
        const fallbackInv = getFallbackLocalInventory();
        if (fallbackInv.length > 0) {
          return {
            ...validation.data,
            inventory: fallbackInv,
          };
        }
        return validation.data;
      }
    }

    // Check main store or legacy key fallback
    const mainKey = getLocalStorageKey(DEFAULT_STORE_ID);
    const mainRaw = localStorage.getItem(mainKey);
    if (mainRaw) {
      const parsedMain = JSON.parse(mainRaw);
      const validation = validateBackupData(parsedMain);
      if (validation.valid && validation.data) {
        return validation.data;
      }
    }

    const legacyRaw = localStorage.getItem(STORAGE_KEY);
    if (legacyRaw) {
      const parsedLegacy = JSON.parse(legacyRaw);
      const validation = validateBackupData(parsedLegacy);
      if (validation.valid && validation.data) {
        return validation.data;
      }
    }

    return initialCleanData;
  } catch (error) {
    console.error('Failed to parse local stored data:', error);
    return initialCleanData;
  }
}

const IDB_NAME = 'FMZ_POS_LOCAL_DATABASE';
const IDB_STORE_NAME = 'store_data';
const IDB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getIDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(IDB_NAME, IDB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(IDB_STORE_NAME)) {
          database.createObjectStore(IDB_STORE_NAME, { keyPath: 'storeId' });
        }
      },
    });
  }
  return dbPromise;
}

export async function saveToIndexedDB(storeId: string, data: AppData): Promise<void> {
  try {
    const idb = await getIDB();
    await idb.put(IDB_STORE_NAME, { storeId, data, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.warn(`IndexedDB save error for store [${storeId}]:`, err);
  }
}

export async function loadFromIndexedDB(storeId: string): Promise<AppData | null> {
  try {
    const idb = await getIDB();
    const record = await idb.get(IDB_STORE_NAME, storeId);
    if (record && record.data) {
      const validation = validateBackupData(record.data);
      if (validation.valid && validation.data) {
        return validation.data;
      }
    }
  } catch (err) {
    console.warn(`IndexedDB load error for store [${storeId}]:`, err);
  }
  return null;
}

/**
 * Strips heavy base64 data URLs to guarantee the synchronous localStorage mirror
 * never exceeds the browser 5MB limit. Full images are safely preserved in IndexedDB and Firestore.
 */
function stripLargePayloadForLocalStorage(data: AppData): AppData {
  const sanitizeImg = (img?: string): string | undefined => {
    if (!img) return undefined;
    if (img.startsWith('data:') || img.length > 500) {
      return undefined;
    }
    return img;
  };

  return {
    ...data,
    settings: data.settings
      ? {
          ...data.settings,
          logo: sanitizeImg(data.settings.logo),
          shopLogo: sanitizeImg(data.settings.shopLogo),
          invoiceLogo: sanitizeImg(data.settings.invoiceLogo),
          loginPageLogo: sanitizeImg(data.settings.loginPageLogo),
        }
      : data.settings,
    inventory: (data.inventory || []).map(item => ({
      ...item,
      image: sanitizeImg(item.image),
    })),
    khata: (data.khata || []).map(c => ({
      ...c,
      image: sanitizeImg(c.image),
      history: (c.history || []).map(h => ({
        ...h,
        receiptImage: sanitizeImg(h.receiptImage),
      })),
    })),
    expenses: (data.expenses || []).map(e => ({
      ...e,
      image: sanitizeImg(e.image),
    })),
    supplierPurchases: (data.supplierPurchases || []).map(p => ({
      ...p,
      invoiceImage: sanitizeImg(p.invoiceImage),
    })),
  };
}

/**
 * Safely writes data to localStorage, handling QuotaExceededError transparently.
 */
function safeSetLocalStorage(key: string, data: AppData): void {
  try {
    const sanitized = stripLargePayloadForLocalStorage(data);
    localStorage.setItem(key, JSON.stringify(sanitized));
  } catch {
    try {
      // If still exceeding quota, prune historical records in the localStorage mirror
      // (Full history remains completely intact in IndexedDB and Firestore)
      const lightweight: AppData = {
        ...stripLargePayloadForLocalStorage(data),
        sales: (data.sales || []).slice(0, 100),
        activities: (data.activities || []).slice(0, 50),
      };
      localStorage.setItem(key, JSON.stringify(lightweight));
    } catch {
      try {
        // Clear legacy storage keys to free browser quota
        for (const legacyKey of LEGACY_STORAGE_KEYS) {
          localStorage.removeItem(legacyKey);
        }
        const minimal: AppData = {
          ...stripLargePayloadForLocalStorage(data),
          sales: (data.sales || []).slice(0, 40),
          activities: [],
        };
        localStorage.setItem(key, JSON.stringify(minimal));
      } catch {
        // Silently suppress quota error; full data is in IndexedDB
      }
    }
  }
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Primary save routine: Updates isolated local storage mirror, IndexedDB, and Firestore.
 */
export function saveStoredData(data: AppData, targetStoreId?: string): void {
  const storeId = targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID;
  const dataWithMeta: AppData = {
    ...data,
    backupVersion: CURRENT_BACKUP_VERSION,
    lastModified: new Date().toISOString(),
  };

  // 1. Safe local mirror update (quota-protected)
  const key = getLocalStorageKey(storeId);
  safeSetLocalStorage(key, dataWithMeta);

  // 2. Full offline persistence in IndexedDB (supports hundreds of MBs + images)
  saveToIndexedDB(storeId, dataWithMeta).catch(err => {
    console.warn(`IndexedDB save error for store [${storeId}]:`, err);
  });
}

export function mergeAppData(local: AppData, remote: Partial<AppData>): AppData {
  const localSnapTime = Date.parse(local.lastModified || '') || 0;
  const remoteSnapTime = Date.parse(remote.lastModified || '') || 0;
  const preferLocalWhenAmbiguous = localSnapTime > 0 && remoteSnapTime > 0 && localSnapTime > remoteSnapTime;

  const parseTime = (val?: string): number => {
    if (!val) return 0;
    const t = Date.parse(val);
    return Number.isFinite(t) ? t : 0;
  };

  const mergeByField = <T>(
    arr1: T[] = [],
    arr2: T[] = [],
    keyFn: (item: T) => string | undefined,
    preferMergeFn?: (existing: T, incoming: T) => T
  ): T[] => {
    const map = new Map<string, T>();
    (arr1 || []).forEach(item => {
      const k = keyFn(item);
      if (k) map.set(k, item);
    });
    (arr2 || []).forEach(item => {
      const k = keyFn(item);
      if (k) {
        const existing = map.get(k);
        map.set(k, existing && preferMergeFn ? preferMergeFn(existing, item) : item);
      }
    });
    return Array.from(map.values());
  };

  const pickByTime = <T>(
    ex: T,
    inc: T,
    getTimeStr: (x: T) => string | undefined
  ): { winner: T; loser: T } => {
    const exTime = parseTime(getTimeStr(ex));
    const incTime = parseTime(getTimeStr(inc));
    if (exTime > incTime) return { winner: ex, loser: inc };
    if (incTime > exTime) return { winner: inc, loser: ex };
    return preferLocalWhenAmbiguous ? { winner: ex, loser: inc } : { winner: inc, loser: ex };
  };

  const mergeStringArrays = (arr1: string[] = [], arr2: string[] = []): string[] => {
    return Array.from(new Set([...(arr1 || []), ...(arr2 || [])]));
  };

  const mergedSettings = remote.settings
    ? preferLocalWhenAmbiguous
      ? {
          ...remote.settings,
          ...local.settings,
          logo: local.settings?.logo || remote.settings?.logo,
          shopLogo: local.settings?.shopLogo || remote.settings?.shopLogo,
          invoiceLogo: local.settings?.invoiceLogo || remote.settings?.invoiceLogo,
          loginPageLogo: local.settings?.loginPageLogo || remote.settings?.loginPageLogo,
        }
      : {
          ...local.settings,
          ...remote.settings,
          logo: remote.settings?.logo || local.settings?.logo,
          shopLogo: remote.settings?.shopLogo || local.settings?.shopLogo,
          invoiceLogo: remote.settings?.invoiceLogo || local.settings?.invoiceLogo,
          loginPageLogo: remote.settings?.loginPageLogo || local.settings?.loginPageLogo,
        }
    : local.settings;

  return {
    ...local,
    ...remote,
    backupVersion: CURRENT_BACKUP_VERSION,
    lastModified:
      localSnapTime > remoteSnapTime
        ? local.lastModified || new Date().toISOString()
        : remote.lastModified || local.lastModified || new Date().toISOString(),
    settings: mergedSettings,
    users: remote.users !== undefined ? (preferLocalWhenAmbiguous && (local.users?.length || 0) >= (remote.users?.length || 0) ? local.users! : remote.users) : (local.users || []),
    inventory: remote.inventory !== undefined
      ? mergeByField(local.inventory, remote.inventory, i => i.id, (ex, inc) => {
          const { winner, loser } = pickByTime(ex, inc, x => x.createdAt);
          return {
            ...loser,
            ...winner,
            image: winner.image || loser.image,
          };
        })
      : (local.inventory || []),
    sales: remote.sales !== undefined
      ? mergeByField(local.sales, remote.sales, s => s.invNo, (ex, inc) => pickByTime(ex, inc, x => x.date).winner)
      : (local.sales || []),
    khata: remote.khata !== undefined
      ? mergeByField(local.khata, remote.khata, k => k.id, (ex, inc) => {
          const { winner, loser } = pickByTime(ex, inc, x => x.lastUpdated);
          return {
            ...loser,
            ...winner,
            image: winner.image || loser.image,
            history:
              (winner.history?.length || 0) >= (loser.history?.length || 0)
                ? winner.history
                : loser.history,
          };
        })
      : (local.khata || []),
    expenses: remote.expenses !== undefined
      ? mergeByField(local.expenses, remote.expenses, e => e.id, (ex, inc) => {
          const { winner, loser } = pickByTime(ex, inc, x => x.date);
          return {
            ...loser,
            ...winner,
            image: winner.image || loser.image,
          };
        })
      : (local.expenses || []),
    supplierPurchases: remote.supplierPurchases !== undefined
      ? mergeByField(local.supplierPurchases, remote.supplierPurchases, p => p.id || p.billNo, (ex, inc) => {
          const { winner, loser } = pickByTime(ex, inc, x => x.reversedAt || x.date);
          return {
            ...loser,
            ...winner,
            invoiceImage: winner.invoiceImage || loser.invoiceImage,
          };
        })
      : (local.supplierPurchases || []),
    imeiRecords: remote.imeiRecords !== undefined
      ? mergeByField(local.imeiRecords, remote.imeiRecords, r => r.id || r.imei, (ex, inc) =>
          pickByTime(ex, inc, x => x.updatedAt || x.createdAt).winner
        )
      : (local.imeiRecords || []),
    purchasesLedger: remote.purchasesLedger !== undefined
      ? mergeByField(local.purchasesLedger, remote.purchasesLedger, l => l.id, (ex, inc) =>
          pickByTime(ex, inc, x => x.date).winner
        )
      : (local.purchasesLedger || []),
    salesReturns: remote.salesReturns !== undefined
      ? mergeByField(local.salesReturns, remote.salesReturns, ret => ret.returnNo || ret.id, (ex, inc) =>
          pickByTime(ex, inc, x => x.returnDate).winner
        )
      : (local.salesReturns || []),
    stockAdjustments: remote.stockAdjustments !== undefined
      ? mergeByField(local.stockAdjustments, remote.stockAdjustments, a => a.id, (ex, inc) =>
          pickByTime(ex, inc, x => x.adjustedAt).winner
        )
      : (local.stockAdjustments || []),
    dailyClosings: remote.dailyClosings !== undefined
      ? mergeByField(local.dailyClosings, remote.dailyClosings, d => d.id || d.date, (ex, inc) =>
          pickByTime(ex, inc, x => x.createdAt || x.date).winner
        )
      : (local.dailyClosings || []),
    activities: remote.activities !== undefined
      ? mergeByField(local.activities, remote.activities, act => act.id)
      : (local.activities || []),
    categories: remote.categories !== undefined
      ? (preferLocalWhenAmbiguous && (local.categories?.length || 0) > 0 ? local.categories : mergeStringArrays(local.categories, remote.categories))
      : (local.categories || []),
    expenseCategories: remote.expenseCategories !== undefined
      ? (preferLocalWhenAmbiguous && (local.expenseCategories?.length || 0) > 0 ? local.expenseCategories : mergeStringArrays(local.expenseCategories, remote.expenseCategories))
      : (local.expenseCategories || defaultExpenseCategories),
  };
}

/**
 * Deep recovery utility that scans Firestore sub-collections, root docs, legacy collections,
 * IndexedDB, and all localStorage partitions to recover any missing Stock Inward / purchase / ledger / IMEI records.
 */
export async function recoverAllMissingStoreData(
  currentData: AppData,
  targetStoreId?: string
): Promise<{ mergedData: AppData; recoveredPurchasesCount: number }> {
  const storeId = targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID;
  const initialPurchaseCount = (currentData.supplierPurchases || []).length;
  let accumulatedData: AppData = { ...currentData };

  // 1. Scan all localStorage partitions (current store, default store, legacy keys)
  try {
    const candidateKeys = Array.from(
      new Set([
        getLocalStorageKey(storeId),
        getLocalStorageKey(DEFAULT_STORE_ID),
        STORAGE_KEY,
        ...LEGACY_STORAGE_KEYS,
      ])
    );
    for (const key of candidateKeys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        const validation = validateBackupData(parsed);
        if (validation.valid && validation.data) {
          accumulatedData = mergeAppData(accumulatedData, validation.data);
        }
      } catch {
        // ignore malformed local key
      }
    }
  } catch {
    // ignore localStorage read errors
  }

  // 2. Scan IndexedDB across storeId and known store keys
  const storeIdsToScan = Array.from(
    new Set([storeId, DEFAULT_STORE_ID, 'USR-ADM-1793988681742', 'USR-ADM-1793966178251'])
  ).filter(Boolean);

  for (const sid of storeIdsToScan) {
    try {
      const idbData = await loadFromIndexedDB(sid);
      if (idbData) {
        accumulatedData = mergeAppData(accumulatedData, idbData);
      }
    } catch {
      // ignore
    }
  }

  // 3. Scan Firestore stores/{sid} root + subcollections
  for (const sid of storeIdsToScan) {
    try {
      const remoteStore = await loadAppDataFromFirestore(sid);
      if (remoteStore) {
        accumulatedData = mergeAppData(accumulatedData, remoteStore);
      }
    } catch {
      // ignore
    }
  }

  // 4. Scan legacy pos_data/main_store collection
  try {
    const legacyStore = await loadAppDataFromLegacyFirestore();
    if (legacyStore) {
      accumulatedData = mergeAppData(accumulatedData, legacyStore);
    }
    const [legacyPurSnap, legacyLedgerSnap, legacyImeiSnap] = await Promise.all([
      getDocs(collection(db, LEGACY_FIRESTORE_COLLECTION, DEFAULT_STORE_ID, SUB_COLLECTIONS.PURCHASES)).catch(() => null),
      getDocs(collection(db, LEGACY_FIRESTORE_COLLECTION, DEFAULT_STORE_ID, SUB_COLLECTIONS.PURCHASES_LEDGER)).catch(() => null),
      getDocs(collection(db, LEGACY_FIRESTORE_COLLECTION, DEFAULT_STORE_ID, SUB_COLLECTIONS.IMEI_RECORDS)).catch(() => null),
    ]);
    const extraPatch: Partial<AppData> = {};
    if (legacyPurSnap && !legacyPurSnap.empty) {
      extraPatch.supplierPurchases = legacyPurSnap.docs.map(d => d.data() as SupplierPurchase);
    }
    if (legacyLedgerSnap && !legacyLedgerSnap.empty) {
      extraPatch.purchasesLedger = legacyLedgerSnap.docs.map(d => d.data() as PurchaseLedgerEntry);
    }
    if (legacyImeiSnap && !legacyImeiSnap.empty) {
      extraPatch.imeiRecords = legacyImeiSnap.docs.map(d => d.data() as ImeiRecord);
    }
    if (Object.keys(extraPatch).length > 0) {
      accumulatedData = mergeAppData(accumulatedData, extraPatch);
    }
  } catch {
    // ignore
  }

  const finalPurchaseCount = (accumulatedData.supplierPurchases || []).length;
  const recoveredPurchasesCount = Math.max(0, finalPurchaseCount - initialPurchaseCount);

  // Persist recovered dataset locally and sync back to primary store sub-collections
  await saveToIndexedDB(storeId, accumulatedData);
  safeSetLocalStorage(getLocalStorageKey(storeId), accumulatedData);

  if (recoveredPurchasesCount > 0) {
    for (const pur of accumulatedData.supplierPurchases || []) {
      savePurchaseToFirestore(pur, storeId).catch(() => {});
    }
    savePurchasesLedgerBatchToFirestore(accumulatedData.purchasesLedger || [], storeId).catch(() => {});
    saveImeiRecordsBatchToFirestore(accumulatedData.imeiRecords || [], storeId).catch(() => {});
    saveRootConfigToFirestore(
      {
        supplierPurchases: accumulatedData.supplierPurchases,
        purchasesLedger: accumulatedData.purchasesLedger,
        imeiRecords: accumulatedData.imeiRecords,
        dailyClosings: accumulatedData.dailyClosings,
        salesReturns: accumulatedData.salesReturns,
        stockAdjustments: accumulatedData.stockAdjustments,
      },
      storeId
    ).catch(() => {});
  }

  return {
    mergedData: accumulatedData,
    recoveredPurchasesCount,
  };
}

/**
 * Safe Data Migration and Initialization Utility:
 * Reads from localStorage for instant render, IndexedDB for high-res images,
 * and reconciles with Firestore.
 */
export async function migrateAndInitializeData(
  onDataLoaded: (data: AppData) => void,
  targetStoreId?: string,
  options?: { currentState?: AppData }
): Promise<void> {
  const storeId = targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID;
  setActiveStoreId(storeId);

  try {
    let currentBestData: AppData;

    if (options?.currentState) {
      // Already running session: start from live React state (never revert to stripped localStorage!)
      currentBestData = options.currentState;
      try {
        const idbData = await loadFromIndexedDB(storeId);
        if (idbData) {
          currentBestData = mergeAppData(idbData, currentBestData);
          onDataLoaded(currentBestData);
        }
      } catch (idbErr) {
        console.warn('Manual sync IndexedDB rehydration warning:', idbErr);
      }
    } else {
      // Cold boot: 1. Instant zero-latency render from localStorage mirror
      const localData = loadStoredData(storeId);
      currentBestData = localData;
      onDataLoaded(localData);

      // 2. Fast rehydration from IndexedDB (contains full images and full offline records)
      try {
        const idbData = await loadFromIndexedDB(storeId);
        if (idbData) {
          currentBestData = mergeAppData(localData, idbData);
          onDataLoaded(currentBestData);
        }
      } catch (idbErr) {
        console.warn('Initial IndexedDB rehydration warning:', idbErr);
      }
    }

    // 3. Reconcile any entries saved under the logged-in admin's USR-ADM-* storeId from prior sessions
    const sessionUser = getSavedSessionUser();
    if (sessionUser?.storeId && sessionUser.storeId !== storeId) {
      try {
        const shadowRemote = await loadAppDataFromFirestore(sessionUser.storeId);
        if (shadowRemote) {
          currentBestData = mergeAppData(currentBestData, shadowRemote);
        }
      } catch {
        // ignore shadow store read issues
      }
    }

    // 4. Remote synchronization from Firebase Firestore primary store
    const remoteData = await loadAppDataFromFirestore(storeId);

    if (remoteData) {
      const localTime = Date.parse(currentBestData.lastModified || '') || 0;
      const remoteTime = Date.parse(remoteData.lastModified || '') || 0;

      // Timestamp-aware merge preserves newer local edits & product images while pulling newer cloud entries
      const mergedData = mergeAppData(currentBestData, remoteData);

      // Update IndexedDB (full payload) and safe localStorage mirror
      await saveToIndexedDB(storeId, mergedData);
      safeSetLocalStorage(getLocalStorageKey(storeId), mergedData);

      onDataLoaded(mergedData);

      // If local/IDB or shadow admin store had newer/more records than primary cloud store, sync up to primary cloud store
      const localHadNewerOrExtra =
        localTime > remoteTime ||
        (mergedData.inventory?.length || 0) > (remoteData.inventory?.length || 0) ||
        (mergedData.sales?.length || 0) > (remoteData.sales?.length || 0) ||
        (mergedData.khata?.length || 0) > (remoteData.khata?.length || 0) ||
        (mergedData.expenses?.length || 0) > (remoteData.expenses?.length || 0) ||
        (mergedData.supplierPurchases?.length || 0) > (remoteData.supplierPurchases?.length || 0);

      if (localHadNewerOrExtra) {
        saveAppDataToFirestore(mergedData, storeId).catch(() => {});
      }
    } else {
      // If remote store data could not be reached, preserve current best local data
      onDataLoaded(currentBestData);
    }
  } catch (err) {
    console.error(`Error in safe data migration/sync with Firestore for store [${storeId}]:`, err);
    onDataLoaded(options?.currentState || loadStoredData(storeId));
  }
}

export const initializeIndexedDB = migrateAndInitializeData;

/**
 * Resets all stored data cleanly for the active store across localStorage, IndexedDB, and Firestore.
 */
export async function clearAllStoredData(targetStoreId?: string): Promise<AppData> {
  const storeId = targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID;

  try {
    localStorage.removeItem(getLocalStorageKey(storeId));
    if (storeId === DEFAULT_STORE_ID) {
      localStorage.removeItem(STORAGE_KEY);
      for (const key of LEGACY_STORAGE_KEYS) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // ignore
  }

  try {
    const idb = await getIDB();
    await idb.delete(IDB_STORE_NAME, storeId);
  } catch {
    // ignore
  }

  const clean: AppData = { ...initialCleanData, lastModified: new Date().toISOString() };

  try {
    await saveAppDataToFirestore(clean, storeId);
  } catch (err) {
    console.warn(`Firebase Firestore reset warning for store [${storeId}]:`, err);
  }

  await saveToIndexedDB(storeId, clean);
  safeSetLocalStorage(getLocalStorageKey(storeId), clean);

  return clean;
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    result.push(items.slice(i, i + chunkSize));
  }
  return result;
}
