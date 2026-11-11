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
      const sid = user.storeId || user.id;
      setActiveStoreId(sid);
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

export const defaultCategories: string[] = ['Android Mobile', 'Keypad Phone', 'Accessories', 'Chargers & Cables', 'Audio & AirPods', 'Repair Parts'];

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
    categories: Array.isArray(raw.categories) && raw.categories.length > 0 ? (raw.categories as string[]) : defaultCategories,
    expenseCategories: Array.isArray(raw.expenseCategories) && raw.expenseCategories.length > 0 ? (raw.expenseCategories as string[]) : defaultExpenseCategories,
    activities: Array.isArray(raw.activities) ? (raw.activities as ActivityLog[]) : [],
    dailyClosings: Array.isArray(raw.dailyClosings) ? raw.dailyClosings : [],
    onlineAccounts: Array.isArray(raw.onlineAccounts) && raw.onlineAccounts.length > 0 ? (raw.onlineAccounts as OnlineAccount[]) : defaultOnlineAccounts,
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
    const actDocRef = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.ACTIVITIES, activity.id);
    await setDoc(actDocRef, sanitizeForFirestore(activity) as Record<string, unknown>);
  } catch (err) {
    console.warn(`Failed to save activity log [${activity.id}] to store [${storeId}]:`, err);
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

        if (rootData.settings) patch.settings = rootData.settings as ShopSettings;
        if (rootData.categories) patch.categories = rootData.categories as string[];
        if (rootData.expenseCategories) patch.expenseCategories = rootData.expenseCategories as string[];
        if (rootData.onlineAccounts) patch.onlineAccounts = rootData.onlineAccounts as OnlineAccount[];
        if (rootData.tabPreferences) patch.tabPreferences = rootData.tabPreferences as TabPreferences;
        if (rootData.users) patch.users = rootData.users as UserAccount[];

        onUpdate(patch);
      }
    },
    (err) => {
      console.warn(`Real-time root config subscription warning for store [${storeId}]:`, err);
    }
  );
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

    // 1. Global registry
    try {
      const globalSnap = await getDocs(collection(db, 'users'));
      globalSnap.forEach(d => {
        const u = d.data() as UserAccount;
        if (u && u.id) {
          // Normalize storeId if missing
          if (!u.storeId) {
            u.storeId = u.role === 'admin' ? u.id : DEFAULT_STORE_ID;
          }
          usersMap.set(u.id, u);
        }
      });
    } catch {
      // Continue to fallback checks
    }

    // 2. Check current store's users sub-collection
    try {
      const sid = currentActiveStoreId || DEFAULT_STORE_ID;
      const storeUsersSnap = await getDocs(collection(db, STORES_COLLECTION, sid, SUB_COLLECTIONS.USERS));
      storeUsersSnap.forEach(d => {
        const u = d.data() as UserAccount;
        if (u && u.id && !usersMap.has(u.id)) {
          if (!u.storeId) u.storeId = sid;
          usersMap.set(u.id, u);
        }
      });
    } catch {
      // ignore
    }

    // 3. Legacy compatibility fallback: /pos_data/main_store/users
    try {
      const legacySnap = await getDocs(collection(db, LEGACY_FIRESTORE_COLLECTION, DEFAULT_STORE_ID, SUB_COLLECTIONS.USERS));
      legacySnap.forEach(d => {
        const u = d.data() as UserAccount;
        if (u && u.id && !usersMap.has(u.id)) {
          if (!u.storeId) u.storeId = u.role === 'admin' ? u.id : DEFAULT_STORE_ID;
          usersMap.set(u.id, u);
        }
      });
      const legacyRootSnap = await getDoc(doc(db, LEGACY_FIRESTORE_COLLECTION, DEFAULT_STORE_ID));
      if (legacyRootSnap.exists()) {
        const legacyRootUsers = (legacyRootSnap.data()?.users as UserAccount[]) || [];
        legacyRootUsers.forEach(u => {
          if (u && u.id && !usersMap.has(u.id)) {
            if (!u.storeId) u.storeId = u.role === 'admin' ? u.id : DEFAULT_STORE_ID;
            usersMap.set(u.id, u);
          }
        });
      }
    } catch {
      // ignore
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
        const actRef = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.ACTIVITIES, act.id);
        batch.set(actRef, sanitizeForFirestore(act) as Record<string, unknown>);
      }
      await batch.commit();
    }
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
    const [salesSnap, invSnap, khataSnap, expSnap, actSnap, usersSnap] = await Promise.all([
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
      getDocs(collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.USERS)).catch(() => ({
        docs: [],
        forEach: () => {},
      } as any)),
    ]);

    const sales: SaleRecord[] = [];
    salesSnap.forEach(docSnap => sales.push(docSnap.data() as SaleRecord));

    if (sales.length === 0 && storeId !== DEFAULT_STORE_ID) {
      try {
        const mainSalesSnap = await getDocs(collection(db, STORES_COLLECTION, DEFAULT_STORE_ID, SUB_COLLECTIONS.SALES));
        mainSalesSnap.forEach(docSnap => sales.push(docSnap.data() as SaleRecord));
      } catch {
        // ignore
      }
    }

    const inventory: InventoryItem[] = [];
    invSnap.forEach(docSnap => inventory.push(docSnap.data() as InventoryItem));

    // Fallback migration: If this tenant store has 0 inventory items, check if main_store or legacy has products
    if (inventory.length === 0 && storeId !== DEFAULT_STORE_ID) {
      try {
        const mainStoreInvSnap = await getDocs(collection(db, STORES_COLLECTION, DEFAULT_STORE_ID, SUB_COLLECTIONS.INVENTORY));
        mainStoreInvSnap.forEach(docSnap => inventory.push(docSnap.data() as InventoryItem));

        if (inventory.length === 0) {
          const legacyInvSnap = await getDocs(collection(db, LEGACY_FIRESTORE_COLLECTION, DEFAULT_STORE_ID, SUB_COLLECTIONS.INVENTORY));
          legacyInvSnap.forEach(docSnap => inventory.push(docSnap.data() as InventoryItem));
        }

        // If we found fallback inventory, auto-save them into this store so they persist!
        if (inventory.length > 0) {
          console.info(`Auto-migrated ${inventory.length} products from main_store to active store [${storeId}]`);
          for (const item of inventory) {
            await saveInventoryItemToFirestore(item, storeId);
          }
        }
      } catch (fallbackErr) {
        console.warn('Fallback inventory check warning:', fallbackErr);
      }
    }

    const khata: KhataCustomer[] = [];
    khataSnap.forEach(docSnap => khata.push(docSnap.data() as KhataCustomer));

    const expenses: ExpenseItem[] = [];
    expSnap.forEach(docSnap => expenses.push(docSnap.data() as ExpenseItem));

    const activities: ActivityLog[] = [];
    actSnap.forEach(docSnap => activities.push(docSnap.data() as ActivityLog));

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
      categories: (rootData.categories as string[]) || defaultCategories,
      expenseCategories: (rootData.expenseCategories as string[]) || defaultExpenseCategories,
      onlineAccounts: (rootData.onlineAccounts as OnlineAccount[]) || defaultOnlineAccounts,
      dailyClosings: (rootData.dailyClosings as DailyClosingRecord[]) || [],
      imeiRecords: (rootData.imeiRecords as ImeiRecord[]) || [],
      stockAdjustments: (rootData.stockAdjustments as StockAdjustment[]) || [],
      purchasesLedger: (rootData.purchasesLedger as PurchaseLedgerEntry[]) || [],
      supplierPurchases: (rootData.supplierPurchases as SupplierPurchase[]) || [],
      salesReturns: (rootData.salesReturns as SalesReturnRecord[]) || [],
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
      categories: (rootData.categories as string[]) || defaultCategories,
      expenseCategories: (rootData.expenseCategories as string[]) || defaultExpenseCategories,
      onlineAccounts: (rootData.onlineAccounts as OnlineAccount[]) || defaultOnlineAccounts,
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
    inventory: (data.inventory || []).map(item => ({
      ...item,
      image: sanitizeImg(item.image),
    })),
    khata: (data.khata || []).map(c => ({
      ...c,
      image: sanitizeImg(c.image),
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
          ...initialCleanData,
          settings: data.settings,
          categories: data.categories,
          expenseCategories: data.expenseCategories,
          inventory: (data.inventory || []).map(i => ({ ...i, image: undefined })),
          khata: (data.khata || []).map(k => ({ ...k, image: undefined, history: [] })),
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

  // 3. Debounced save for store root config
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    saveRootConfigToFirestore(dataWithMeta, storeId).catch(err => {
      console.warn(`Firebase Firestore remote save warning for store [${storeId}]:`, err);
    });
  }, 400);
}

/**
 * Safe Data Migration and Initialization Utility:
 * Reads from localStorage for instant render, IndexedDB for high-res images,
 * and reconciles with Firestore.
 */
export async function migrateAndInitializeData(
  onDataLoaded: (data: AppData) => void,
  targetStoreId?: string
): Promise<void> {
  const storeId = targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID;
  setActiveStoreId(storeId);

  try {
    // 1. Instant zero-latency render from synchronous localStorage mirror
    const localData = loadStoredData(storeId);
    onDataLoaded(localData);

    // 2. Fast rehydration from IndexedDB (contains full images and full records)
    let currentBestData = localData;
    try {
      const idbData = await loadFromIndexedDB(storeId);
      if (idbData && idbData.inventory && idbData.inventory.length > 0) {
        currentBestData = idbData;
        onDataLoaded(idbData);
      }
    } catch (idbErr) {
      console.warn('Initial IndexedDB rehydration warning:', idbErr);
    }

    // 3. Remote synchronization from Firebase Firestore
    const remoteData = await loadAppDataFromFirestore(storeId);

    if (remoteData) {
      // Ensure inventory is preserved if remote data inventory is empty but current has items
      if ((!remoteData.inventory || remoteData.inventory.length === 0) && currentBestData.inventory.length > 0) {
        remoteData.inventory = currentBestData.inventory;
      }
      
      // Update IndexedDB (full payload) and safe localStorage mirror
      await saveToIndexedDB(storeId, remoteData);
      safeSetLocalStorage(getLocalStorageKey(storeId), remoteData);

      onDataLoaded(remoteData);
    } else if (currentBestData.inventory.length > 0 || currentBestData.sales.length > 0 || currentBestData.khata.length > 0) {
      await saveAppDataToFirestore(currentBestData, storeId);
      await saveToIndexedDB(storeId, currentBestData);
      safeSetLocalStorage(getLocalStorageKey(storeId), currentBestData);
      onDataLoaded(currentBestData);
    } else {
      await saveAppDataToFirestore(initialCleanData, storeId);
      await saveToIndexedDB(storeId, initialCleanData);
      safeSetLocalStorage(getLocalStorageKey(storeId), initialCleanData);
      onDataLoaded(initialCleanData);
    }
  } catch (err) {
    console.error(`Error in safe data migration/sync with Firestore for store [${storeId}]:`, err);
    onDataLoaded(loadStoredData(storeId));
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
