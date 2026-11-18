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
  DeletedTombstone,
  DeletedIdsMap,
  SyncCollectionKey,
  PendingWriteOp,
  DailyBackupSnapshot,
  MobileVariant,
} from '../types';
import {
  db,
  handleFirestoreError,
  OperationType,
  isQuotaError,
  setQuotaExceededFlag,
  getQuotaExceededFlag,
  ensureAnonymousAuth,
  subscribeQuotaState,
  subscribeCloudError,
  getLastCloudError,
  getLastCloudErrorAt,
  setLastCloudError,
  recordCloudWrite,
  recordCloudRead,
  getDailyCloudUsage,
  DailyCloudUsage,
} from './firebase';
import {
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  getDocsFromServer,
  writeBatch,
  query,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore';
import { generateEntityId } from './id';
import { openDB, IDBPDatabase } from 'idb';

export const STORES_COLLECTION = 'stores';
export const LEGACY_FIRESTORE_COLLECTION = 'pos_data';
export const DEFAULT_STORE_ID = 'main_store';

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

export const STORAGE_KEY = 'MOBILE_POS_PRO_DATA_V10';
export const LEGACY_STORAGE_KEYS = [
  'MOBILE_POS_PRO_DATA_V9',
  'MOBILE_POS_PRO_DATA_V8',
  'MOBILE_POS_PRO_DATA_V7',
  'MOBILE_POS_PRO_DATA_V6',
  'MOBILE_POS_PRO_DATA_V5',
];

const TOMBSTONE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const MAX_DAILY_BACKUPS = 7;

let currentActiveStoreId: string = DEFAULT_STORE_ID;

export function setActiveStoreId(storeId?: string | null): void {
  if (storeId && storeId.trim()) {
    currentActiveStoreId = storeId.trim();
  }
}

export function getActiveStoreId(): string {
  return currentActiveStoreId;
}

export function getLocalStorageKey(storeId?: string): string {
  const sid = storeId || currentActiveStoreId || DEFAULT_STORE_ID;
  return `MOBILE_POS_STORE_${sid}_V10`;
}

export const SESSION_STORAGE_KEY = 'MOBILE_POS_ACTIVE_USER_SESSION';

export function saveCurrentSession(user?: UserAccount | null): void {
  try {
    if (user) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
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

export function normalizeCategoriesList(rawCategories: unknown): string[] {
  if (!Array.isArray(rawCategories)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of rawCategories) {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

export function cleanCategories(rawCategories: unknown): string[] {
  if (!Array.isArray(rawCategories)) {
    return [...defaultCategories];
  }
  return normalizeCategoriesList(rawCategories);
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
  deletedIds: {},
  deletedInventoryIds: [],
};

export const sampleSeedData: AppData = initialCleanData;

// ==================== TOMBSTONE HELPERS ====================

const ALL_TOMBSTONE_KEYS: SyncCollectionKey[] = [
  'sales',
  'inventory',
  'khata',
  'expenses',
  'supplierPurchases',
  'purchasesLedger',
  'imeiRecords',
  'salesReturns',
  'stockAdjustments',
  'dailyClosings',
  'activities',
];

function parseTimeMs(val?: string): number {
  if (!val) return 0;
  const t = Date.parse(val);
  return Number.isFinite(t) ? t : 0;
}

export function pruneTombstones(list?: DeletedTombstone[]): DeletedTombstone[] {
  if (!Array.isArray(list) || list.length === 0) return [];
  const cutoff = Date.now() - TOMBSTONE_RETENTION_MS;
  const map = new Map<string, string>();
  for (const entry of list) {
    if (!entry || typeof entry.id !== 'string' || !entry.id.trim()) continue;
    const ts = parseTimeMs(entry.deletedAt);
    if (ts > 0 && ts < cutoff) continue; // prune > 90 days
    const existing = map.get(entry.id);
    const deletedAt = entry.deletedAt || new Date().toISOString();
    if (!existing || parseTimeMs(deletedAt) >= parseTimeMs(existing)) {
      map.set(entry.id, deletedAt);
    }
  }
  return Array.from(map.entries()).map(([id, deletedAt]) => ({ id, deletedAt }));
}

export function normalizeDeletedIds(
  source?: Partial<AppData> | null
): DeletedIdsMap {
  const base: DeletedIdsMap = {};
  const raw = source?.deletedIds || {};
  for (const key of ALL_TOMBSTONE_KEYS) {
    const arr = Array.isArray(raw[key]) ? raw[key] : [];
    const pruned = pruneTombstones(arr);
    if (pruned.length > 0) {
      base[key] = pruned;
    }
  }

  // Normalize legacy string arrays into tombstones
  const legacyMappings: Array<{ legacy?: string[]; target: SyncCollectionKey }> = [
    { legacy: source?.deletedInventoryIds, target: 'inventory' },
    { legacy: source?.deletedSalesIds, target: 'sales' },
    { legacy: source?.deletedKhataIds, target: 'khata' },
    { legacy: source?.deletedExpensesIds, target: 'expenses' },
    { legacy: source?.deletedPurchasesIds, target: 'supplierPurchases' },
  ];

  const fallbackLegacyDeletedAt =
    source?.lastModified && parseTimeMs(source.lastModified) > 0
      ? source.lastModified
      : new Date().toISOString();

  for (const { legacy, target } of legacyMappings) {
    if (!Array.isArray(legacy) || legacy.length === 0) continue;
    const existing = base[target] || [];
    const map = new Map(existing.map(t => [t.id, t.deletedAt]));
    for (const id of legacy) {
      if (typeof id === 'string' && id.trim() && !map.has(id)) {
        map.set(id, fallbackLegacyDeletedAt);
      }
    }
    const merged = pruneTombstones(
      Array.from(map.entries()).map(([id, deletedAt]) => ({ id, deletedAt }))
    );
    if (merged.length > 0) {
      base[target] = merged;
    }
  }

  return base;
}

export function mergeDeletedIds(
  localData?: Partial<AppData> | null,
  remoteData?: Partial<AppData> | null
): { deletedIds: DeletedIdsMap; deletedInventoryIds: string[] } {
  const normLocal = normalizeDeletedIds(localData);
  const normRemote = normalizeDeletedIds(remoteData);
  const result: DeletedIdsMap = {};

  for (const key of ALL_TOMBSTONE_KEYS) {
    const combined = [...(normLocal[key] || []), ...(normRemote[key] || [])];
    const pruned = pruneTombstones(combined);
    if (pruned.length > 0) {
      result[key] = pruned;
    }
  }

  return {
    deletedIds: result,
    deletedInventoryIds: (result.inventory || []).map(t => t.id),
  };
}

export function addTombstonesToMap(
  current: DeletedIdsMap | undefined,
  collectionKey: SyncCollectionKey,
  ids: string[],
  legacyInventoryIds?: string[]
): { deletedIds: DeletedIdsMap; deletedInventoryIds: string[] } {
  const normalized = normalizeDeletedIds({
    deletedIds: current,
    deletedInventoryIds: legacyInventoryIds,
  });
  const now = new Date().toISOString();
  const existingList = normalized[collectionKey] || [];
  const map = new Map(existingList.map(t => [t.id, t.deletedAt]));
  for (const id of ids) {
    if (id && id.trim()) {
      map.set(id.trim(), now);
    }
  }
  normalized[collectionKey] = pruneTombstones(
    Array.from(map.entries()).map(([id, deletedAt]) => ({ id, deletedAt }))
  );

  return {
    deletedIds: normalized,
    deletedInventoryIds: (normalized.inventory || []).map(t => t.id),
  };
}

export function removeTombstoneFromMap(
  current: DeletedIdsMap | undefined,
  collectionKey: SyncCollectionKey,
  id: string,
  legacyInventoryIds?: string[]
): { deletedIds: DeletedIdsMap; deletedInventoryIds: string[] } {
  const normalized = normalizeDeletedIds({
    deletedIds: current,
    deletedInventoryIds: legacyInventoryIds,
  });
  if (normalized[collectionKey]) {
    normalized[collectionKey] = normalized[collectionKey]!.filter(t => t.id !== id);
  }
  return {
    deletedIds: normalized,
    deletedInventoryIds: (normalized.inventory || []).map(t => t.id),
  };
}

export function isItemTombstoned(
  id: string | undefined,
  itemUpdatedAt: string | undefined,
  tombstones?: DeletedTombstone[]
): boolean {
  if (!id || !Array.isArray(tombstones) || tombstones.length === 0) return false;
  const match = tombstones.find(t => t.id === id);
  if (!match) return false;
  const itemMs = parseTimeMs(itemUpdatedAt);
  const delMs = parseTimeMs(match.deletedAt);
  // Only resurrect if item was explicitly updated/re-created strictly AFTER deletion
  if (itemMs > 0 && delMs > 0 && itemMs > delMs) {
    return false;
  }
  return true;
}

// ==================== JSON DOWNLOAD & AUTOMATIC BACKUPS ====================

export function downloadJsonBackup(data: AppData, filenamePrefix = 'mobile_pos_pro_backup_'): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  try {
    const exportPayload: AppData = {
      ...data,
      backupVersion: CURRENT_BACKUP_VERSION,
      lastModified: new Date().toISOString(),
    };
    const jsonStr = JSON.stringify(exportPayload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `${filenamePrefix}${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    console.warn('Automatic JSON backup download notice:', err);
  }
}

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

  const normalizedTombstones = normalizeDeletedIds(raw as Partial<AppData>);

  const sanitizedData: AppData = {
    backupVersion: CURRENT_BACKUP_VERSION,
    lastModified: typeof raw.lastModified === 'string' ? raw.lastModified : new Date().toISOString(),
    migrationDone: typeof raw.migrationDone === 'boolean' ? raw.migrationDone : undefined,
    settingsUpdatedAt: typeof raw.settingsUpdatedAt === 'string' ? raw.settingsUpdatedAt : undefined,
    categoriesUpdatedAt: typeof raw.categoriesUpdatedAt === 'string' ? raw.categoriesUpdatedAt : undefined,
    expenseCategoriesUpdatedAt: typeof raw.expenseCategoriesUpdatedAt === 'string' ? raw.expenseCategoriesUpdatedAt : undefined,
    onlineAccountsUpdatedAt: typeof raw.onlineAccountsUpdatedAt === 'string' ? raw.onlineAccountsUpdatedAt : undefined,
    tabPreferencesUpdatedAt: typeof raw.tabPreferencesUpdatedAt === 'string' ? raw.tabPreferencesUpdatedAt : undefined,
    usersUpdatedAt: typeof raw.usersUpdatedAt === 'string' ? raw.usersUpdatedAt : undefined,
    inventory: rawInventory.map((item, idx) => ({
      id: typeof item.id === 'string' ? item.id : generateEntityId('STK'),
      name: String(item.name || 'Unnamed Product'),
      category: String(item.category || defaultCategories[0]),
      costPrice: Number(item.costPrice) || 0,
      salePrice: Number(item.salePrice) || 0,
      wholesalePrice: typeof item.wholesalePrice === 'number' ? item.wholesalePrice : undefined,
      boxSize: typeof item.boxSize === 'number' ? item.boxSize : undefined,
      qty: Number(item.qty) || 0,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date(Date.now() + idx).toISOString(),
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : undefined,
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
      lat: typeof cust.lat === 'number' ? cust.lat : undefined,
      lng: typeof cust.lng === 'number' ? cust.lng : undefined,
      placeId: typeof cust.placeId === 'string' ? cust.placeId : undefined,
      mapUrl: typeof cust.mapUrl === 'string' ? cust.mapUrl : undefined,
      image: typeof cust.image === 'string' ? cust.image : undefined,
      customerType: cust.customerType as KhataCustomer['customerType'],
      shopName: typeof cust.shopName === 'string' ? cust.shopName : undefined,
      city: typeof cust.city === 'string' ? cust.city : undefined,
      ntnNumber: typeof cust.ntnNumber === 'string' ? cust.ntnNumber : undefined,
      cnic: typeof cust.cnic === 'string' ? cust.cnic : undefined,
      creditLimit: typeof cust.creditLimit === 'number' ? cust.creditLimit : undefined,
      dueDate: typeof cust.dueDate === 'string' ? cust.dueDate : undefined,
      guarantorName: typeof cust.guarantorName === 'string' ? cust.guarantorName : undefined,
      guarantorPhone: typeof cust.guarantorPhone === 'string' ? cust.guarantorPhone : undefined,
      notes: typeof cust.notes === 'string' ? cust.notes : undefined,
      balance: Number(cust.balance) || 0,
      lastUpdated: typeof cust.lastUpdated === 'string' ? cust.lastUpdated : new Date().toISOString(),
      updatedAt: typeof cust.updatedAt === 'string' ? cust.updatedAt : undefined,
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
      updatedAt: typeof exp.updatedAt === 'string' ? exp.updatedAt : undefined,
    })),
    sales: rawSales.map((s) => ({
      invNo: String(s.invNo || generateEntityId('INV')),
      custName: String(s.custName || 'Walk-in Customer'),
      custPhone: typeof s.custPhone === 'string' ? s.custPhone : undefined,
      invoiceType: s.invoiceType === 'credit' ? 'credit' : 'cash',
      saleMode: s.saleMode === 'wholesale' ? 'wholesale' : s.saleMode === 'retail' ? 'retail' : undefined,
      retailerShopName: typeof s.retailerShopName === 'string' ? s.retailerShopName : undefined,
      retailerCity: typeof s.retailerCity === 'string' ? s.retailerCity : undefined,
      retailerNtn: typeof s.retailerNtn === 'string' ? s.retailerNtn : undefined,
      wholesaleSavings: typeof s.wholesaleSavings === 'number' ? s.wholesaleSavings : undefined,
      amountPaid: typeof s.amountPaid === 'number' ? s.amountPaid : undefined,
      amountDue: typeof s.amountDue === 'number' ? s.amountDue : undefined,
      khataCustomerId: typeof s.khataCustomerId === 'string' ? s.khataCustomerId : undefined,
      items: Array.isArray(s.items) ? s.items : [],
      subtotal: Number(s.subtotal) || 0,
      discount: Number(s.discount) || 0,
      grandTotal: Number(s.grandTotal) || 0,
      totalCost: Number(s.totalCost) || 0,
      netProfit: Number(s.netProfit) || 0,
      paymentMethod: typeof s.paymentMethod === 'string' ? (s.paymentMethod as PaymentMethod) : 'Cash',
      accountId: typeof s.accountId === 'string' ? s.accountId : undefined,
      date: typeof s.date === 'string' ? s.date : new Date().toISOString(),
      returnStatus: s.returnStatus === 'FULL' || s.returnStatus === 'PARTIAL' ? s.returnStatus : 'NONE',
      totalRefunded: typeof s.totalRefunded === 'number' ? s.totalRefunded : 0,
      status: s.status === 'CANCELLED' ? 'CANCELLED' : 'COMPLETED',
      notes: typeof s.notes === 'string' ? s.notes : undefined,
      updatedAt: typeof s.updatedAt === 'string' ? s.updatedAt : undefined,
    })),
    salesReturns: Array.isArray(raw.salesReturns) ? (raw.salesReturns as SalesReturnRecord[]) : [],
    purchasesLedger: Array.isArray(raw.purchasesLedger) ? (raw.purchasesLedger as PurchaseLedgerEntry[]) : [],
    supplierPurchases: Array.isArray(raw.supplierPurchases) ? (raw.supplierPurchases as SupplierPurchase[]) : [],
    settings: mergedSettings,
    categories: Array.isArray(raw.categories) ? normalizeCategoriesList(raw.categories) : defaultCategories,
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
    deletedIds: normalizedTombstones,
    deletedInventoryIds: (normalizedTombstones.inventory || []).map(t => t.id),
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

export function toValidFirestoreDocId(rawId: string | undefined, fallbackPrefix = 'DOC'): string {
  const cleaned = String(rawId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!cleaned) {
    return generateEntityId(fallbackPrefix);
  }
  return cleaned.slice(0, 128);
}

// ==================== INDEXEDDB + PENDING WRITES QUEUE + DAILY BACKUPS ====================

const IDB_NAME = 'FMZ_POS_LOCAL_DATABASE';
const IDB_STORE_NAME = 'store_data';
const IDB_PENDING_WRITES_STORE = 'pending_writes';
const IDB_BACKUPS_STORE = 'backups';
const IDB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getIDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(IDB_NAME, IDB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(IDB_STORE_NAME)) {
          database.createObjectStore(IDB_STORE_NAME, { keyPath: 'storeId' });
        }
        if (!database.objectStoreNames.contains(IDB_PENDING_WRITES_STORE)) {
          database.createObjectStore(IDB_PENDING_WRITES_STORE, { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains(IDB_BACKUPS_STORE)) {
          database.createObjectStore(IDB_BACKUPS_STORE, { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export type OfflineReasonCode =
  | 'online'
  | 'no_internet'
  | 'quota_exceeded'
  | 'auth_blocked'
  | 'cloud_error';

export interface SyncStatusSnapshot {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  pendingOps: PendingWriteOp[];
  lastError: string | null;
  lastErrorAt: string | null;
  isQuotaExceeded: boolean;
  offlineReason: OfflineReasonCode;
  dailyUsage: DailyCloudUsage;
  lastLocalSaveAt: string | null;
}

const syncStatusListeners: Array<(snap: SyncStatusSnapshot) => void> = [];
let currentPendingOps: PendingWriteOp[] = [];
let isQueueFlushing = false;
let lastLocalSaveAt: string | null = null;

export function getSyncStatusSnapshot(): SyncStatusSnapshot {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const isQuotaExceeded = getQuotaExceededFlag();
  const lastError = getLastCloudError();
  const queuedNonOfflineError = currentPendingOps.find(
    op => op.lastError && !op.lastError.startsWith('Device offline')
  )?.lastError;
  const effectiveError = lastError || queuedNonOfflineError || null;

  let offlineReason: OfflineReasonCode = 'online';
  if (!isOnline) {
    offlineReason = 'no_internet';
  } else if (isQuotaExceeded) {
    offlineReason = 'quota_exceeded';
  } else if (
    effectiveError &&
    (effectiveError.includes('Anonymous Auth') ||
      effectiveError.includes('operation-not-allowed') ||
      effectiveError.includes('admin-restricted-operation'))
  ) {
    offlineReason = 'auth_blocked';
  } else if (effectiveError) {
    offlineReason = 'cloud_error';
  }

  return {
    isOnline,
    isSyncing: isQueueFlushing,
    pendingCount: currentPendingOps.length,
    pendingOps: currentPendingOps,
    lastError,
    lastErrorAt: getLastCloudErrorAt(),
    isQuotaExceeded,
    offlineReason,
    dailyUsage: getDailyCloudUsage(),
    lastLocalSaveAt,
  };
}

function notifySyncStatusListeners(): void {
  const snap = getSyncStatusSnapshot();
  syncStatusListeners.forEach(l => l(snap));
}

export function subscribeSyncStatus(listener: (snap: SyncStatusSnapshot) => void): () => void {
  syncStatusListeners.push(listener);
  listener(getSyncStatusSnapshot());
  return () => {
    const idx = syncStatusListeners.indexOf(listener);
    if (idx >= 0) syncStatusListeners.splice(idx, 1);
  };
}

export async function getPendingWrites(): Promise<PendingWriteOp[]> {
  try {
    const idb = await getIDB();
    const all = (await idb.getAll(IDB_PENDING_WRITES_STORE)) as PendingWriteOp[];
    all.sort((a, b) => parseTimeMs(a.createdAt) - parseTimeMs(b.createdAt));
    currentPendingOps = all;
    return all;
  } catch {
    return currentPendingOps;
  }
}

export async function enqueuePendingWrite(params: {
  op: 'set' | 'delete';
  path: string;
  data?: Record<string, unknown>;
  merge?: boolean;
  lastError?: string;
}): Promise<void> {
  try {
    const idb = await getIDB();
    const all = (await idb.getAll(IDB_PENDING_WRITES_STORE)) as PendingWriteOp[];
    const existingForPath = all.find(p => p.path === params.path);
    const now = new Date().toISOString();

    if (existingForPath) {
      if (params.op === 'delete') {
        await idb.put(IDB_PENDING_WRITES_STORE, {
          ...existingForPath,
          op: 'delete',
          data: undefined,
          merge: undefined,
          createdAt: now,
          lastError: params.lastError || existingForPath.lastError,
        });
      } else if (existingForPath.op === 'set' && params.merge !== false && existingForPath.data && params.data) {
        // Merge root or partial updates cleanly
        await idb.put(IDB_PENDING_WRITES_STORE, {
          ...existingForPath,
          op: 'set',
          data: { ...existingForPath.data, ...params.data },
          merge: true,
          lastError: params.lastError || existingForPath.lastError,
        });
      } else {
        await idb.put(IDB_PENDING_WRITES_STORE, {
          ...existingForPath,
          op: 'set',
          data: params.data,
          merge: params.merge,
          createdAt: now,
          lastError: params.lastError || existingForPath.lastError,
        });
      }
    } else {
      const newOp: PendingWriteOp = {
        id: generateEntityId('PW'),
        op: params.op,
        path: params.path,
        data: params.data,
        merge: params.merge,
        createdAt: now,
        retryCount: 0,
        lastError: params.lastError,
      };
      await idb.put(IDB_PENDING_WRITES_STORE, newOp);
    }

    await getPendingWrites();
    notifySyncStatusListeners();
  } catch (err) {
    console.warn('Failed to enqueue pending write in IndexedDB:', err);
  }
}

async function awaitWriteWithQuotaAndTimeout(
  writePromise: Promise<void>,
  timeoutMs = 10000
): Promise<void> {
  if (getQuotaExceededFlag()) {
    throw new Error(
      'Daily Firestore free write quota exceeded. Changes are safely saved locally and will auto-retry after quota reset.'
    );
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  let rejectRace: ((err: Error) => void) | null = null;

  const racePromise = new Promise<never>((_, reject) => {
    rejectRace = reject;
  });

  const unsubQuota = subscribeQuotaState((exceeded) => {
    if (exceeded && rejectRace) {
      rejectRace(
        new Error(
          'Daily Firestore free write quota exceeded. Changes are safely saved locally and will auto-retry after quota reset.'
        )
      );
    }
  });

  timer = setTimeout(() => {
    if (rejectRace) {
      rejectRace(
        new Error(
          'Cloud write timed out (network or Firestore backoff) — saved locally and queued for auto-retry.'
        )
      );
    }
  }, timeoutMs);

  try {
    await Promise.race([writePromise, racePromise]);
  } finally {
    clearTimeout(timer);
    unsubQuota();
  }
}

async function executeDocWriteOrQueue(params: {
  op: 'set' | 'delete';
  path: string;
  data?: Record<string, unknown>;
  merge?: boolean;
}): Promise<void> {
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  if (isOffline || getQuotaExceededFlag()) {
    await enqueuePendingWrite({
      ...params,
      lastError: isOffline
        ? 'Device offline — queued locally'
        : 'Daily cloud write quota exceeded — saved locally for auto-retry',
    });
    return;
  }

  try {
    const user = await ensureAnonymousAuth();
    if (!user) {
      await enqueuePendingWrite({
        ...params,
        lastError: getLastCloudError() || 'Firebase Auth unavailable — queued locally',
      });
      return;
    }

    const segments = params.path.split('/').filter(Boolean);
    const ref = doc(db, ...(segments as [string, ...string[]]));

    if (params.op === 'delete') {
      await awaitWriteWithQuotaAndTimeout(deleteDoc(ref));
    } else {
      const payload = sanitizeForFirestore(params.data || {}) as Record<string, unknown>;
      const writeOp =
        params.merge === false ? setDoc(ref, payload) : setDoc(ref, payload, { merge: true });
      await awaitWriteWithQuotaAndTimeout(writeOp);
    }
    recordCloudWrite(1);
    setLastCloudError(null);
    notifySyncStatusListeners();
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (isQuotaError(err)) {
      setQuotaExceededFlag(true);
    } else {
      setLastCloudError(`Cloud sync error (${params.path}): ${errMsg}`);
    }
    await enqueuePendingWrite({
      ...params,
      lastError: errMsg,
    });
  }
}

export async function processPendingWritesQueue(): Promise<{ processed: number; failed: number }> {
  if (isQueueFlushing) return { processed: 0, failed: 0 };
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    notifySyncStatusListeners();
    return { processed: 0, failed: 0 };
  }
  if (getQuotaExceededFlag()) {
    notifySyncStatusListeners();
    return { processed: 0, failed: 0 };
  }

  isQueueFlushing = true;
  notifySyncStatusListeners();

  let processed = 0;
  let failed = 0;

  try {
    const ops = await getPendingWrites();
    if (ops.length === 0) {
      return { processed: 0, failed: 0 };
    }

    const user = await ensureAnonymousAuth();
    if (!user) {
      const authErr =
        getLastCloudError() ||
        'Firebase Anonymous Auth is not enabled. Please enable Anonymous Sign-in in Firebase Console → Authentication.';
      setLastCloudError(authErr);
      return { processed: 0, failed: ops.length };
    }

    const idb = await getIDB();
    for (const op of ops) {
      if (getQuotaExceededFlag() || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        if (op.lastError?.includes('Anonymous Auth')) {
          await idb.put(IDB_PENDING_WRITES_STORE, {
            ...op,
            lastError:
              getQuotaExceededFlag()
                ? 'Daily Firestore free write quota exceeded — saved locally, auto-retries after reset'
                : 'Device offline — queued locally',
          });
        }
        continue;
      }
      try {
        const segments = op.path.split('/').filter(Boolean);
        const ref = doc(db, ...(segments as [string, ...string[]]));
        if (op.op === 'delete') {
          await awaitWriteWithQuotaAndTimeout(deleteDoc(ref));
        } else {
          const payload = sanitizeForFirestore(op.data || {}) as Record<string, unknown>;
          const writeOp =
            op.merge === false ? setDoc(ref, payload) : setDoc(ref, payload, { merge: true });
          await awaitWriteWithQuotaAndTimeout(writeOp);
        }
        await idb.delete(IDB_PENDING_WRITES_STORE, op.id);
        recordCloudWrite(1);
        processed++;
      } catch (err) {
        failed++;
        const errMsg = err instanceof Error ? err.message : String(err);
        await idb.put(IDB_PENDING_WRITES_STORE, {
          ...op,
          retryCount: (op.retryCount || 0) + 1,
          lastError: errMsg,
        });
        if (isQuotaError(err)) {
          setQuotaExceededFlag(true);
        } else {
          setLastCloudError(`Cloud sync error (${op.path}): ${errMsg}`);
        }
      }
    }

    if (processed > 0 && failed === 0) {
      setLastCloudError(null);
    }
    await getPendingWrites();
  } finally {
    isQueueFlushing = false;
    notifySyncStatusListeners();
  }

  return { processed, failed };
}

let syncEngineStarted = false;
export function startSyncBackgroundLoop(): void {
  if (syncEngineStarted || typeof window === 'undefined') return;
  syncEngineStarted = true;

  getPendingWrites().then(() => {
    notifySyncStatusListeners();
    processPendingWritesQueue().catch(() => {});
  });

  setInterval(() => {
    if (navigator.onLine && !getQuotaExceededFlag()) {
      processPendingWritesQueue().catch(() => {});
    }
  }, 30_000);

  window.addEventListener('online', () => {
    setLastCloudError(null);
    notifySyncStatusListeners();
    processPendingWritesQueue().catch(() => {});
  });

  window.addEventListener('offline', () => {
    notifySyncStatusListeners();
  });

  subscribeQuotaState(() => notifySyncStatusListeners());
  subscribeCloudError(() => notifySyncStatusListeners());
}

// ==================== AUTOMATIC 7-DAY BACKUPS IN IDB ====================

let lastBackupSavedStamp = 0;

export async function saveDailyAutomaticBackup(storeId: string, data: AppData, force = false): Promise<void> {
  try {
    const hasMeaningfulData =
      (data.inventory?.length || 0) > 0 ||
      (data.sales?.length || 0) > 0 ||
      (data.khata?.length || 0) > 0 ||
      (data.expenses?.length || 0) > 0 ||
      (data.supplierPurchases?.length || 0) > 0;
    if (!hasMeaningfulData) return;

    const nowMs = Date.now();
    if (!force && nowMs - lastBackupSavedStamp < 5 * 60 * 1000) {
      return; // throttle frequent updates
    }
    lastBackupSavedStamp = nowMs;

    const today = new Date().toISOString().slice(0, 10);
    const id = `${storeId}_${today}`;
    const idb = await getIDB();

    const snapshot: DailyBackupSnapshot = {
      id,
      storeId,
      date: today,
      createdAt: new Date().toISOString(),
      data: {
        ...data,
        backupVersion: CURRENT_BACKUP_VERSION,
        lastModified: data.lastModified || new Date().toISOString(),
      },
    };
    await idb.put(IDB_BACKUPS_STORE, snapshot);

    // Keep only the latest 7 daily backups for this store
    const allBackups = (await idb.getAll(IDB_BACKUPS_STORE)) as DailyBackupSnapshot[];
    const storeBackups = allBackups
      .filter(b => b.storeId === storeId)
      .sort((a, b) => b.date.localeCompare(a.date));
    if (storeBackups.length > MAX_DAILY_BACKUPS) {
      const toDelete = storeBackups.slice(MAX_DAILY_BACKUPS);
      for (const old of toDelete) {
        await idb.delete(IDB_BACKUPS_STORE, old.id);
      }
    }
  } catch (err) {
    console.warn('Automatic daily backup notice:', err);
  }
}

export async function listAutomaticBackups(storeId?: string): Promise<DailyBackupSnapshot[]> {
  const sid = storeId || currentActiveStoreId || DEFAULT_STORE_ID;
  try {
    const idb = await getIDB();
    const allBackups = (await idb.getAll(IDB_BACKUPS_STORE)) as DailyBackupSnapshot[];
    return allBackups
      .filter(b => b.storeId === sid)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, MAX_DAILY_BACKUPS);
  } catch (err) {
    console.warn('List automatic backups notice:', err);
    return [];
  }
}

// ==================== FIRESTORE CRUD WITH PENDING-WRITES QUEUE ====================

export async function saveSaleAtomic(
  params: {
    sale: SaleRecord;
    inventoryUpdates: Array<{
      id: string;
      newQty: number;
      remainingImeis?: string[];
      variants?: MobileVariant[];
      updatedAt?: string;
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
  const storeId = toValidFirestoreDocId(targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID, 'STR');
  const { sale, inventoryUpdates, khataUpdate, activity } = params;
  const now = new Date().toISOString();
  const saleWithTs: SaleRecord = { ...sale, updatedAt: sale.updatedAt || now };
  const saleDocId = toValidFirestoreDocId(sale.invNo, 'INV');

  const buildInvUpdatePayload = (invUpdate: {
    id: string;
    newQty: number;
    remainingImeis?: string[];
    variants?: MobileVariant[];
    updatedAt?: string;
  }): Record<string, unknown> => {
    const updateData: Record<string, unknown> = {
      qty: invUpdate.newQty,
      updatedAt: invUpdate.updatedAt || now,
    };
    if (invUpdate.remainingImeis !== undefined) {
      updateData.imeis = invUpdate.remainingImeis;
      updateData.imei = invUpdate.remainingImeis.length > 0 ? invUpdate.remainingImeis.join(', ') : null;
    }
    if (invUpdate.variants !== undefined) {
      updateData.variants = invUpdate.variants;
    }
    return updateData;
  };

  const enqueueIndividualOps = async (reason?: string) => {
    await enqueuePendingWrite({
      op: 'set',
      path: `${STORES_COLLECTION}/${storeId}/${SUB_COLLECTIONS.SALES}/${saleDocId}`,
      data: sanitizeForFirestore(saleWithTs) as Record<string, unknown>,
      merge: true,
      lastError: reason,
    });
    for (const invUpdate of inventoryUpdates) {
      const invId = toValidFirestoreDocId(invUpdate.id, 'STK');
      const updateData = buildInvUpdatePayload(invUpdate);
      await enqueuePendingWrite({
        op: 'set',
        path: `${STORES_COLLECTION}/${storeId}/${SUB_COLLECTIONS.INVENTORY}/${invId}`,
        data: sanitizeForFirestore(updateData) as Record<string, unknown>,
        merge: true,
        lastError: reason,
      });
    }
    if (khataUpdate) {
      const kId = toValidFirestoreDocId(khataUpdate.customerId, 'KHT');
      await enqueuePendingWrite({
        op: 'set',
        path: `${STORES_COLLECTION}/${storeId}/${SUB_COLLECTIONS.KHATA}/${kId}`,
        data: sanitizeForFirestore({
          balance: khataUpdate.newBalance,
          lastUpdated: now,
          updatedAt: now,
        }) as Record<string, unknown>,
        merge: true,
        lastError: reason,
      });
    }
    if (activity) {
      const actId = toValidFirestoreDocId(activity.id, 'ACT');
      await enqueuePendingWrite({
        op: 'set',
        path: `${STORES_COLLECTION}/${storeId}/${SUB_COLLECTIONS.ACTIVITIES}/${actId}`,
        data: sanitizeForFirestore(activity) as Record<string, unknown>,
        merge: true,
        lastError: reason,
      });
    }
  };

  if ((typeof navigator !== 'undefined' && !navigator.onLine) || getQuotaExceededFlag()) {
    await enqueueIndividualOps('Offline or quota cooldown');
    return;
  }

  try {
    const user = await ensureAnonymousAuth();
    if (!user) {
      await enqueueIndividualOps(getLastCloudError() || 'Firebase Auth unavailable');
      return;
    }

    const batch = writeBatch(db);

    const saleDocRef = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.SALES, saleDocId);
    batch.set(saleDocRef, sanitizeForFirestore(saleWithTs) as Record<string, unknown>, { merge: true });

    for (const invUpdate of inventoryUpdates) {
      const invDocRef = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.INVENTORY, toValidFirestoreDocId(invUpdate.id, 'STK'));
      const updateData = buildInvUpdatePayload(invUpdate);
      batch.set(invDocRef, sanitizeForFirestore(updateData) as Record<string, unknown>, { merge: true });
    }

    if (khataUpdate) {
      const khataDocRef = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.KHATA, toValidFirestoreDocId(khataUpdate.customerId, 'KHT'));
      const custSnap = await getDoc(khataDocRef);
      if (custSnap.exists()) {
        const currentData = custSnap.data() as KhataCustomer;
        const currentHistory = Array.isArray(currentData.history) ? currentData.history : [];
        batch.set(
          khataDocRef,
          sanitizeForFirestore({
            balance: khataUpdate.newBalance,
            lastUpdated: now,
            updatedAt: now,
            history: [khataUpdate.transaction, ...currentHistory],
          }) as Record<string, unknown>,
          { merge: true }
        );
      }
    }

    if (activity) {
      const actDocRef = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.ACTIVITIES, toValidFirestoreDocId(activity.id, 'ACT'));
      batch.set(actDocRef, sanitizeForFirestore(activity) as Record<string, unknown>);
    }

    const rootDocRef = doc(db, STORES_COLLECTION, storeId);
    batch.set(
      rootDocRef,
      {
        lastModified: now,
        backupVersion: CURRENT_BACKUP_VERSION,
      },
      { merge: true }
    );

    await awaitWriteWithQuotaAndTimeout(batch.commit());
    recordCloudWrite(2 + inventoryUpdates.length + (khataUpdate ? 1 : 0) + (activity ? 1 : 0));
    setLastCloudError(null);
    notifySyncStatusListeners();
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (isQuotaError(err)) {
      setQuotaExceededFlag(true);
    } else {
      setLastCloudError(`Atomic sale sync failed: ${errMsg}`);
    }
    await enqueueIndividualOps(errMsg);
  }
}

export async function deleteSaleFromFirestore(invNo: string, targetStoreId?: string): Promise<void> {
  const storeId = toValidFirestoreDocId(targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID, 'STR');
  const docId = toValidFirestoreDocId(invNo, 'INV');
  await executeDocWriteOrQueue({
    op: 'delete',
    path: `${STORES_COLLECTION}/${storeId}/${SUB_COLLECTIONS.SALES}/${docId}`,
  });
}

export async function updateSaleInFirestore(sale: SaleRecord, targetStoreId?: string): Promise<void> {
  const storeId = toValidFirestoreDocId(targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID, 'STR');
  const docId = toValidFirestoreDocId(sale.invNo, 'INV');
  const payload = { ...sale, updatedAt: sale.updatedAt || new Date().toISOString() };
  await executeDocWriteOrQueue({
    op: 'set',
    path: `${STORES_COLLECTION}/${storeId}/${SUB_COLLECTIONS.SALES}/${docId}`,
    data: payload as unknown as Record<string, unknown>,
    merge: true,
  });
}

export async function saveInventoryItemToFirestore(item: InventoryItem, targetStoreId?: string): Promise<void> {
  const storeId = toValidFirestoreDocId(targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID, 'STR');
  const docId = toValidFirestoreDocId(item.id, 'STK');
  const payload = { ...item, updatedAt: item.updatedAt || new Date().toISOString() };
  await executeDocWriteOrQueue({
    op: 'set',
    path: `${STORES_COLLECTION}/${storeId}/${SUB_COLLECTIONS.INVENTORY}/${docId}`,
    data: payload as unknown as Record<string, unknown>,
    merge: true,
  });
}

export async function deleteInventoryItemFromFirestore(id: string, targetStoreId?: string): Promise<void> {
  const storeId = toValidFirestoreDocId(targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID, 'STR');
  const docId = toValidFirestoreDocId(id, 'STK');
  await executeDocWriteOrQueue({
    op: 'delete',
    path: `${STORES_COLLECTION}/${storeId}/${SUB_COLLECTIONS.INVENTORY}/${docId}`,
  });
}

export async function saveKhataCustomerToFirestore(customer: KhataCustomer, targetStoreId?: string): Promise<void> {
  const storeId = toValidFirestoreDocId(targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID, 'STR');
  const docId = toValidFirestoreDocId(customer.id, 'KHT');
  const payload = { ...customer, updatedAt: customer.updatedAt || customer.lastUpdated || new Date().toISOString() };
  await executeDocWriteOrQueue({
    op: 'set',
    path: `${STORES_COLLECTION}/${storeId}/${SUB_COLLECTIONS.KHATA}/${docId}`,
    data: payload as unknown as Record<string, unknown>,
    merge: true,
  });
}

export async function deleteKhataCustomerFromFirestore(id: string, targetStoreId?: string): Promise<void> {
  const storeId = toValidFirestoreDocId(targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID, 'STR');
  const docId = toValidFirestoreDocId(id, 'KHT');
  await executeDocWriteOrQueue({
    op: 'delete',
    path: `${STORES_COLLECTION}/${storeId}/${SUB_COLLECTIONS.KHATA}/${docId}`,
  });
}

export async function saveExpenseItemToFirestore(expense: ExpenseItem, targetStoreId?: string): Promise<void> {
  const storeId = toValidFirestoreDocId(targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID, 'STR');
  const docId = toValidFirestoreDocId(expense.id, 'EXP');
  const payload = { ...expense, updatedAt: expense.updatedAt || new Date().toISOString() };
  await executeDocWriteOrQueue({
    op: 'set',
    path: `${STORES_COLLECTION}/${storeId}/${SUB_COLLECTIONS.EXPENSES}/${docId}`,
    data: payload as unknown as Record<string, unknown>,
    merge: true,
  });
}

export async function deleteExpenseItemFromFirestore(id: string, targetStoreId?: string): Promise<void> {
  const storeId = toValidFirestoreDocId(targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID, 'STR');
  const docId = toValidFirestoreDocId(id, 'EXP');
  await executeDocWriteOrQueue({
    op: 'delete',
    path: `${STORES_COLLECTION}/${storeId}/${SUB_COLLECTIONS.EXPENSES}/${docId}`,
  });
}

export async function saveActivityLogToFirestore(activity: ActivityLog, targetStoreId?: string): Promise<void> {
  const storeId = toValidFirestoreDocId(targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID, 'STR');
  const docId = toValidFirestoreDocId(activity.id, 'ACT');
  const payload = { ...activity, updatedAt: activity.updatedAt || activity.timestamp || new Date().toISOString() };
  await executeDocWriteOrQueue({
    op: 'set',
    path: `${STORES_COLLECTION}/${storeId}/${SUB_COLLECTIONS.ACTIVITIES}/${docId}`,
    data: payload as unknown as Record<string, unknown>,
    merge: true,
  });
}

export async function clearActivitiesFromFirestore(activityIds: string[], targetStoreId?: string): Promise<void> {
  if (!activityIds || activityIds.length === 0) return;
  const storeId = toValidFirestoreDocId(targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID, 'STR');

  const enqueueAll = async (reason?: string) => {
    for (const id of activityIds) {
      if (!id || !id.trim()) continue;
      const docId = toValidFirestoreDocId(id, 'ACT');
      await enqueuePendingWrite({
        op: 'delete',
        path: `${STORES_COLLECTION}/${storeId}/${SUB_COLLECTIONS.ACTIVITIES}/${docId}`,
        lastError: reason,
      });
    }
  };

  if ((typeof navigator !== 'undefined' && !navigator.onLine) || getQuotaExceededFlag()) {
    await enqueueAll('Offline or quota cooldown');
    return;
  }

  try {
    const user = await ensureAnonymousAuth();
    if (!user) {
      await enqueueAll(getLastCloudError() || 'Firebase Auth unavailable');
      return;
    }

    const chunks = chunkArray(activityIds.filter(id => Boolean(id && id.trim())), 450);
    for (const chunk of chunks) {
      const batch = writeBatch(db);
      for (const id of chunk) {
        const docId = toValidFirestoreDocId(id, 'ACT');
        const ref = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.ACTIVITIES, docId);
        batch.delete(ref);
      }
      await awaitWriteWithQuotaAndTimeout(batch.commit());
      recordCloudWrite(chunk.length);
    }
    setLastCloudError(null);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isQuotaError(err)) setQuotaExceededFlag(true);
    else setLastCloudError(`Clear activities failed: ${msg}`);
    await enqueueAll(msg);
  }
}

export async function savePurchaseToFirestore(purchase: SupplierPurchase, targetStoreId?: string): Promise<void> {
  const storeId = toValidFirestoreDocId(targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID, 'STR');
  const docId = toValidFirestoreDocId(purchase.id || purchase.billNo, 'PUR');
  const payload = { ...purchase, updatedAt: purchase.updatedAt || new Date().toISOString() };
  await executeDocWriteOrQueue({
    op: 'set',
    path: `${STORES_COLLECTION}/${storeId}/${SUB_COLLECTIONS.PURCHASES}/${docId}`,
    data: payload as unknown as Record<string, unknown>,
    merge: true,
  });
}

export async function deletePurchaseFromFirestore(id: string, targetStoreId?: string): Promise<void> {
  const storeId = toValidFirestoreDocId(targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID, 'STR');
  const docId = toValidFirestoreDocId(id, 'PUR');
  await executeDocWriteOrQueue({
    op: 'delete',
    path: `${STORES_COLLECTION}/${storeId}/${SUB_COLLECTIONS.PURCHASES}/${docId}`,
  });
}

export async function saveDailyClosingToFirestore(record: DailyClosingRecord, targetStoreId?: string): Promise<void> {
  const storeId = toValidFirestoreDocId(targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID, 'STR');
  const docId = toValidFirestoreDocId(record.id || record.date, 'DCL');
  const payload = { ...record, updatedAt: record.updatedAt || new Date().toISOString() };
  await executeDocWriteOrQueue({
    op: 'set',
    path: `${STORES_COLLECTION}/${storeId}/${SUB_COLLECTIONS.DAILY_CLOSINGS}/${docId}`,
    data: payload as unknown as Record<string, unknown>,
    merge: true,
  });
}

export async function deleteDailyClosingFromFirestore(id: string, targetStoreId?: string): Promise<void> {
  const storeId = toValidFirestoreDocId(targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID, 'STR');
  const docId = toValidFirestoreDocId(id, 'DCL');
  await executeDocWriteOrQueue({
    op: 'delete',
    path: `${STORES_COLLECTION}/${storeId}/${SUB_COLLECTIONS.DAILY_CLOSINGS}/${docId}`,
  });
}

export async function saveStockAdjustmentToFirestore(adj: StockAdjustment, targetStoreId?: string): Promise<void> {
  const storeId = toValidFirestoreDocId(targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID, 'STR');
  const docId = toValidFirestoreDocId(adj.id, 'ADJ');
  const payload = { ...adj, updatedAt: adj.updatedAt || adj.adjustedAt || new Date().toISOString() };
  await executeDocWriteOrQueue({
    op: 'set',
    path: `${STORES_COLLECTION}/${storeId}/${SUB_COLLECTIONS.STOCK_ADJUSTMENTS}/${docId}`,
    data: payload as unknown as Record<string, unknown>,
    merge: true,
  });
}

export async function saveSalesReturnToFirestore(ret: SalesReturnRecord, targetStoreId?: string): Promise<void> {
  const storeId = toValidFirestoreDocId(targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID, 'STR');
  const docId = toValidFirestoreDocId(ret.id || ret.returnNo, 'RET');
  const payload = { ...ret, updatedAt: ret.updatedAt || ret.returnDate || new Date().toISOString() };
  await executeDocWriteOrQueue({
    op: 'set',
    path: `${STORES_COLLECTION}/${storeId}/${SUB_COLLECTIONS.SALES_RETURNS}/${docId}`,
    data: payload as unknown as Record<string, unknown>,
    merge: true,
  });
}

export async function savePurchasesLedgerBatchToFirestore(
  entries: PurchaseLedgerEntry[],
  targetStoreId?: string
): Promise<void> {
  if (!entries || entries.length === 0) return;
  const storeId = toValidFirestoreDocId(targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID, 'STR');
  const now = new Date().toISOString();

  if ((typeof navigator !== 'undefined' && !navigator.onLine) || getQuotaExceededFlag()) {
    for (const entry of entries) {
      const docId = toValidFirestoreDocId(entry.id, 'PL');
      await enqueuePendingWrite({
        op: 'set',
        path: `${STORES_COLLECTION}/${storeId}/${SUB_COLLECTIONS.PURCHASES_LEDGER}/${docId}`,
        data: { ...entry, updatedAt: entry.updatedAt || now } as unknown as Record<string, unknown>,
        merge: true,
      });
    }
    return;
  }

  try {
    const user = await ensureAnonymousAuth();
    if (!user) {
      for (const entry of entries) {
        const docId = toValidFirestoreDocId(entry.id, 'PL');
        await enqueuePendingWrite({
          op: 'set',
          path: `${STORES_COLLECTION}/${storeId}/${SUB_COLLECTIONS.PURCHASES_LEDGER}/${docId}`,
          data: { ...entry, updatedAt: entry.updatedAt || now } as unknown as Record<string, unknown>,
          merge: true,
        });
      }
      return;
    }

    const chunks = chunkArray(entries, 450);
    for (const chunk of chunks) {
      const batch = writeBatch(db);
      for (const entry of chunk) {
        const docId = toValidFirestoreDocId(entry.id, 'PL');
        const ref = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.PURCHASES_LEDGER, docId);
        batch.set(ref, sanitizeForFirestore({ ...entry, updatedAt: entry.updatedAt || now }) as Record<string, unknown>, { merge: true });
      }
      await awaitWriteWithQuotaAndTimeout(batch.commit());
      recordCloudWrite(chunk.length);
    }
    setLastCloudError(null);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isQuotaError(err)) setQuotaExceededFlag(true);
    else setLastCloudError(`Purchases ledger batch sync failed: ${msg}`);
    for (const entry of entries) {
      const docId = toValidFirestoreDocId(entry.id, 'PL');
      await enqueuePendingWrite({
        op: 'set',
        path: `${STORES_COLLECTION}/${storeId}/${SUB_COLLECTIONS.PURCHASES_LEDGER}/${docId}`,
        data: { ...entry, updatedAt: entry.updatedAt || now } as unknown as Record<string, unknown>,
        merge: true,
        lastError: msg,
      });
    }
  }
}

export async function saveImeiRecordsBatchToFirestore(
  records: ImeiRecord[],
  targetStoreId?: string
): Promise<void> {
  if (!records || records.length === 0) return;
  const storeId = toValidFirestoreDocId(targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID, 'STR');
  const now = new Date().toISOString();

  if ((typeof navigator !== 'undefined' && !navigator.onLine) || getQuotaExceededFlag()) {
    for (const rec of records) {
      const docId = toValidFirestoreDocId(rec.id || rec.imei, 'IMEI');
      await enqueuePendingWrite({
        op: 'set',
        path: `${STORES_COLLECTION}/${storeId}/${SUB_COLLECTIONS.IMEI_RECORDS}/${docId}`,
        data: { ...rec, updatedAt: rec.updatedAt || now } as unknown as Record<string, unknown>,
        merge: true,
      });
    }
    return;
  }

  try {
    const user = await ensureAnonymousAuth();
    if (!user) {
      for (const rec of records) {
        const docId = toValidFirestoreDocId(rec.id || rec.imei, 'IMEI');
        await enqueuePendingWrite({
          op: 'set',
          path: `${STORES_COLLECTION}/${storeId}/${SUB_COLLECTIONS.IMEI_RECORDS}/${docId}`,
          data: { ...rec, updatedAt: rec.updatedAt || now } as unknown as Record<string, unknown>,
          merge: true,
        });
      }
      return;
    }

    const chunks = chunkArray(records, 450);
    for (const chunk of chunks) {
      const batch = writeBatch(db);
      for (const rec of chunk) {
        const docId = toValidFirestoreDocId(rec.id || rec.imei, 'IMEI');
        const ref = doc(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.IMEI_RECORDS, docId);
        batch.set(ref, sanitizeForFirestore({ ...rec, updatedAt: rec.updatedAt || now }) as Record<string, unknown>, { merge: true });
      }
      await awaitWriteWithQuotaAndTimeout(batch.commit());
      recordCloudWrite(chunk.length);
    }
    setLastCloudError(null);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isQuotaError(err)) setQuotaExceededFlag(true);
    else setLastCloudError(`IMEI batch sync failed: ${msg}`);
    for (const rec of records) {
      const docId = toValidFirestoreDocId(rec.id || rec.imei, 'IMEI');
      await enqueuePendingWrite({
        op: 'set',
        path: `${STORES_COLLECTION}/${storeId}/${SUB_COLLECTIONS.IMEI_RECORDS}/${docId}`,
        data: { ...rec, updatedAt: rec.updatedAt || now } as unknown as Record<string, unknown>,
        merge: true,
        lastError: msg,
      });
    }
  }
}

/**
 * Saves root configuration, settings, tombstones, and config timestamps ONLY to `/stores/{storeId}`.
 * Sub-collections are strictly single source of truth — NO record arrays are saved to the root doc.
 */
export async function saveRootConfigToFirestore(data: Partial<AppData>, targetStoreId?: string): Promise<void> {
  const storeId = toValidFirestoreDocId(targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID, 'STR');
  const now = new Date().toISOString();
  const configToSave: Record<string, unknown> = {
    backupVersion: CURRENT_BACKUP_VERSION,
    lastModified: now,
    storeId,
  };

  if (data.migrationDone !== undefined) configToSave.migrationDone = data.migrationDone;
  if (data.settings !== undefined) {
    configToSave.settings = data.settings;
    configToSave.settingsUpdatedAt = data.settingsUpdatedAt || now;
  } else if (data.settingsUpdatedAt !== undefined) {
    configToSave.settingsUpdatedAt = data.settingsUpdatedAt;
  }

  if (data.categories !== undefined) {
    configToSave.categories = data.categories;
    configToSave.categoriesUpdatedAt = data.categoriesUpdatedAt || now;
  } else if (data.categoriesUpdatedAt !== undefined) {
    configToSave.categoriesUpdatedAt = data.categoriesUpdatedAt;
  }

  if (data.expenseCategories !== undefined) {
    configToSave.expenseCategories = data.expenseCategories;
    configToSave.expenseCategoriesUpdatedAt = data.expenseCategoriesUpdatedAt || now;
  } else if (data.expenseCategoriesUpdatedAt !== undefined) {
    configToSave.expenseCategoriesUpdatedAt = data.expenseCategoriesUpdatedAt;
  }

  if (data.onlineAccounts !== undefined) {
    configToSave.onlineAccounts = data.onlineAccounts;
    configToSave.onlineAccountsUpdatedAt = data.onlineAccountsUpdatedAt || now;
  } else if (data.onlineAccountsUpdatedAt !== undefined) {
    configToSave.onlineAccountsUpdatedAt = data.onlineAccountsUpdatedAt;
  }

  if (data.tabPreferences !== undefined) {
    configToSave.tabPreferences = data.tabPreferences;
    configToSave.tabPreferencesUpdatedAt = data.tabPreferencesUpdatedAt || now;
  } else if (data.tabPreferencesUpdatedAt !== undefined) {
    configToSave.tabPreferencesUpdatedAt = data.tabPreferencesUpdatedAt;
  }

  if (data.users !== undefined && data.users.length > 0) {
    configToSave.users = data.users;
    configToSave.usersUpdatedAt = data.usersUpdatedAt || now;
  } else if (data.usersUpdatedAt !== undefined) {
    configToSave.usersUpdatedAt = data.usersUpdatedAt;
  }

  if (data.deletedIds !== undefined) {
    const pruned = normalizeDeletedIds({ deletedIds: data.deletedIds, deletedInventoryIds: data.deletedInventoryIds });
    configToSave.deletedIds = pruned;
    configToSave.deletedInventoryIds = (pruned.inventory || []).map(t => t.id);
  } else if (data.deletedInventoryIds !== undefined) {
    configToSave.deletedInventoryIds = data.deletedInventoryIds;
  }

  if (data.currentRole !== undefined) configToSave.currentRole = data.currentRole;

  await executeDocWriteOrQueue({
    op: 'set',
    path: `${STORES_COLLECTION}/${storeId}`,
    data: configToSave,
    merge: true,
  });
}

// ==================== INCREMENTAL REAL-TIME LISTENERS ====================

export interface CollectionDeltaEvent {
  collection: SyncCollectionKey;
  upserts: Array<{ docId: string; item: Record<string, unknown> }>;
  removals: string[];
}

export function subscribeToStoreRootConfig(
  targetStoreId: string,
  onUpdate: (updatedRoot: Partial<AppData>) => void
): () => void {
  const storeId = toValidFirestoreDocId(targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID, 'STR');
  const rootDocRef = doc(db, STORES_COLLECTION, storeId);
  let active = true;
  let unsub: (() => void) | null = null;

  ensureAnonymousAuth().then((user) => {
    if (!active || !user) return;
    unsub = onSnapshot(
      rootDocRef,
      (docSnap) => {
        if (docSnap.metadata.hasPendingWrites) return;
        if (!docSnap.exists()) return;

        const rootData = docSnap.data() as Record<string, unknown>;
        const patch: Partial<AppData> = {
          lastModified: typeof rootData.lastModified === 'string' ? rootData.lastModified : undefined,
          migrationDone: typeof rootData.migrationDone === 'boolean' ? rootData.migrationDone : undefined,
          settingsUpdatedAt: typeof rootData.settingsUpdatedAt === 'string' ? rootData.settingsUpdatedAt : undefined,
          categoriesUpdatedAt: typeof rootData.categoriesUpdatedAt === 'string' ? rootData.categoriesUpdatedAt : undefined,
          expenseCategoriesUpdatedAt: typeof rootData.expenseCategoriesUpdatedAt === 'string' ? rootData.expenseCategoriesUpdatedAt : undefined,
          onlineAccountsUpdatedAt: typeof rootData.onlineAccountsUpdatedAt === 'string' ? rootData.onlineAccountsUpdatedAt : undefined,
          tabPreferencesUpdatedAt: typeof rootData.tabPreferencesUpdatedAt === 'string' ? rootData.tabPreferencesUpdatedAt : undefined,
          usersUpdatedAt: typeof rootData.usersUpdatedAt === 'string' ? rootData.usersUpdatedAt : undefined,
        };

        if (rootData.settings !== undefined) patch.settings = rootData.settings as ShopSettings;
        if (rootData.categories !== undefined) {
          patch.categories = Array.isArray(rootData.categories)
            ? normalizeCategoriesList(rootData.categories)
            : [];
        }
        if (rootData.expenseCategories !== undefined) patch.expenseCategories = rootData.expenseCategories as string[];
        if (rootData.onlineAccounts !== undefined) patch.onlineAccounts = rootData.onlineAccounts as OnlineAccount[];
        if (rootData.tabPreferences !== undefined) patch.tabPreferences = rootData.tabPreferences as TabPreferences;
        if (rootData.users !== undefined) patch.users = rootData.users as UserAccount[];
        if (rootData.deletedIds !== undefined || rootData.deletedInventoryIds !== undefined) {
          const norm = normalizeDeletedIds(rootData as Partial<AppData>);
          patch.deletedIds = norm;
          patch.deletedInventoryIds = (norm.inventory || []).map(t => t.id);
        }

        onUpdate(patch);
      },
      (err) => {
        if (isQuotaError(err)) setQuotaExceededFlag(true);
        else setLastCloudError(`Root config listener error: ${err.message}`);
        console.warn(`Real-time root config subscription warning for store [${storeId}]:`, err);
      }
    );
  });

  return () => {
    active = false;
    if (unsub) unsub();
  };
}

export function subscribeToStoreFullData(
  targetStoreId: string,
  callbacks: {
    onRootConfig: (patch: Partial<AppData>) => void;
    onCollectionDelta: (delta: CollectionDeltaEvent) => void;
  }
): () => void {
  const storeId = toValidFirestoreDocId(targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID, 'STR');
  const unsubs: (() => void)[] = [];
  let active = true;

  // 1. Root Config & Tombstones Listener
  unsubs.push(subscribeToStoreRootConfig(storeId, callbacks.onRootConfig));

  // 2. Sub-collections incremental listeners using snapshot.docChanges() (NO `if (!snapshot.empty)`)
  const subCollectionSpecs: Array<{ subCol: string; key: SyncCollectionKey }> = [
    { subCol: SUB_COLLECTIONS.INVENTORY, key: 'inventory' },
    { subCol: SUB_COLLECTIONS.SALES, key: 'sales' },
    { subCol: SUB_COLLECTIONS.KHATA, key: 'khata' },
    { subCol: SUB_COLLECTIONS.EXPENSES, key: 'expenses' },
    { subCol: SUB_COLLECTIONS.PURCHASES, key: 'supplierPurchases' },
    { subCol: SUB_COLLECTIONS.DAILY_CLOSINGS, key: 'dailyClosings' },
    { subCol: SUB_COLLECTIONS.SALES_RETURNS, key: 'salesReturns' },
    { subCol: SUB_COLLECTIONS.STOCK_ADJUSTMENTS, key: 'stockAdjustments' },
    { subCol: SUB_COLLECTIONS.PURCHASES_LEDGER, key: 'purchasesLedger' },
    { subCol: SUB_COLLECTIONS.IMEI_RECORDS, key: 'imeiRecords' },
    { subCol: SUB_COLLECTIONS.ACTIVITIES, key: 'activities' },
  ];

  ensureAnonymousAuth().then((user) => {
    if (!active || !user) return;

    for (const { subCol, key } of subCollectionSpecs) {
      try {
        const colRef = collection(db, STORES_COLLECTION, storeId, subCol);
        const qRef =
          key === 'activities'
            ? query(colRef, orderBy('timestamp', 'desc'), limit(200))
            : colRef;

        const unsub = onSnapshot(
          qRef,
          (snapshot) => {
            if (snapshot.metadata.hasPendingWrites) return;

            const upserts: Array<{ docId: string; item: Record<string, unknown> }> = [];
            const removals: string[] = [];

            snapshot.docChanges().forEach((change) => {
              if (change.doc.metadata.hasPendingWrites) return;
              if (change.type === 'added' || change.type === 'modified') {
                upserts.push({
                  docId: change.doc.id,
                  item: change.doc.data() as Record<string, unknown>,
                });
              } else if (change.type === 'removed') {
                removals.push(change.doc.id);
              }
            });

            if (upserts.length > 0 || removals.length > 0) {
              recordCloudRead(upserts.length);
              callbacks.onCollectionDelta({
                collection: key,
                upserts,
                removals,
              });
            }
          },
          (err) => {
            if (isQuotaError(err)) setQuotaExceededFlag(true);
            else setLastCloudError(`Listener error (${subCol}): ${err.message}`);
            console.warn(`${subCol} real-time sync notice [${storeId}]:`, err);
          }
        );

        unsubs.push(unsub);
      } catch (err) {
        console.warn(`${subCol} listener initialization error [${storeId}]:`, err);
      }
    }
  });

  return () => {
    active = false;
    unsubs.forEach(unsub => {
      try {
        unsub();
      } catch {
        // ignore
      }
    });
  };
}

// ==================== USER ACCOUNTS PERSISTENCE ====================

export async function saveUserToFirestore(user: UserAccount, targetStoreId?: string): Promise<void> {
  const effectiveStoreId = toValidFirestoreDocId(
    targetStoreId || currentActiveStoreId || user.storeId || DEFAULT_STORE_ID,
    'STR'
  );
  const userDocId = toValidFirestoreDocId(user.id, 'USR');
  const userWithStore: UserAccount = {
    ...user,
    storeId: effectiveStoreId,
  };

  await executeDocWriteOrQueue({
    op: 'set',
    path: `users/${userDocId}`,
    data: userWithStore as unknown as Record<string, unknown>,
    merge: true,
  });

  await executeDocWriteOrQueue({
    op: 'set',
    path: `${STORES_COLLECTION}/${effectiveStoreId}/${SUB_COLLECTIONS.USERS}/${userDocId}`,
    data: userWithStore as unknown as Record<string, unknown>,
    merge: true,
  });

  // Also update root doc users array cleanly if root doc exists
  try {
    const authUser = await ensureAnonymousAuth();
    if (authUser && !getQuotaExceededFlag()) {
      const rootDocRef = doc(db, STORES_COLLECTION, effectiveStoreId);
      const rootSnap = await getDoc(rootDocRef);
      if (rootSnap.exists()) {
        const curUsers = (rootSnap.data()?.users as UserAccount[]) || [];
        const idx = curUsers.findIndex(u => u.id === userWithStore.id);
        const updated =
          idx >= 0
            ? curUsers.map(u => (u.id === userWithStore.id ? userWithStore : u))
            : [...curUsers, userWithStore];
        await saveRootConfigToFirestore(
          { users: updated, usersUpdatedAt: new Date().toISOString() },
          effectiveStoreId
        );
      }
    }
  } catch (err) {
    console.warn('Root user list sync warning:', err);
  }
}

export async function deleteUserFromFirestore(userId: string, targetStoreId?: string): Promise<void> {
  const storeId = toValidFirestoreDocId(targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID, 'STR');
  const userDocId = toValidFirestoreDocId(userId, 'USR');

  await executeDocWriteOrQueue({
    op: 'delete',
    path: `users/${userDocId}`,
  });

  const storeIdsToCheck = Array.from(
    new Set([storeId, currentActiveStoreId, DEFAULT_STORE_ID])
  ).filter(Boolean);

  for (const sid of storeIdsToCheck) {
    const safeSid = toValidFirestoreDocId(sid, 'STR');
    await executeDocWriteOrQueue({
      op: 'delete',
      path: `${STORES_COLLECTION}/${safeSid}/${SUB_COLLECTIONS.USERS}/${userDocId}`,
    });

    try {
      const rootDocRef = doc(db, STORES_COLLECTION, safeSid);
      const rootSnap = await getDoc(rootDocRef).catch(() => null);
      if (rootSnap && rootSnap.exists()) {
        const curUsers = (rootSnap.data()?.users as UserAccount[]) || [];
        const updated = curUsers.filter(u => u.id !== userId);
        await saveRootConfigToFirestore(
          { users: updated, usersUpdatedAt: new Date().toISOString() },
          safeSid
        );
      }
    } catch {
      // ignore
    }
  }
}

export async function fetchLiveUsersFromFirestore(): Promise<UserAccount[]> {
  if (getQuotaExceededFlag()) return [];
  try {
    const authUser = await ensureAnonymousAuth();
    if (!authUser) return [];

    const usersMap = new Map<string, UserAccount>();
    const sid = toValidFirestoreDocId(currentActiveStoreId || DEFAULT_STORE_ID, 'STR');

    const [globalSnap, storeUsersSnap, rootSnap] = await Promise.all([
      getDocs(collection(db, 'users')).catch(() => null),
      getDocs(collection(db, STORES_COLLECTION, sid, SUB_COLLECTIONS.USERS)).catch(() => null),
      getDoc(doc(db, STORES_COLLECTION, sid)).catch(() => null),
    ]);

    if (globalSnap) {
      globalSnap.forEach(d => {
        const u = d.data() as UserAccount;
        if (u && u.id) {
          if (!u.storeId) u.storeId = u.role === 'admin' ? u.id : DEFAULT_STORE_ID;
          usersMap.set(u.id, u);
        }
      });
    }

    if (storeUsersSnap) {
      storeUsersSnap.forEach(d => {
        const u = d.data() as UserAccount;
        if (u && u.id && !usersMap.has(u.id)) {
          if (!u.storeId) u.storeId = sid;
          usersMap.set(u.id, u);
        }
      });
    }

    if (rootSnap && rootSnap.exists()) {
      const rootUsers = (rootSnap.data()?.users as UserAccount[]) || [];
      rootUsers.forEach(u => {
        if (u && u.id && !usersMap.has(u.id)) {
          if (!u.storeId) u.storeId = sid;
          usersMap.set(u.id, u);
        }
      });
    }

    const deduplicatedMap = new Map<string, UserAccount>();
    const seenAdminEmails = new Set<string>();
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

// ==================== BULK WRITE (EXPLICIT RESTORE / CLEAR ONLY) ====================

export async function saveAppDataToFirestore(data: AppData, targetStoreId?: string): Promise<void> {
  if (getQuotaExceededFlag()) {
    throw new Error('Quota exceeded cooldown active');
  }
  const user = await ensureAnonymousAuth();
  if (!user) {
    throw new Error(getLastCloudError() || 'Firebase Anonymous Auth unavailable');
  }

  const storeId = toValidFirestoreDocId(targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID, 'STR');

  try {
    await saveRootConfigToFirestore(data, storeId);

    const writeSubCollection = async <T>(
      subCol: string,
      items: T[],
      idFn: (item: T) => string,
      prefix: string
    ) => {
      const chunks = chunkArray(items || [], 450);
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        for (const item of chunk) {
          const ref = doc(db, STORES_COLLECTION, storeId, subCol, toValidFirestoreDocId(idFn(item), prefix));
          batch.set(ref, sanitizeForFirestore(item) as Record<string, unknown>, { merge: true });
        }
        await batch.commit();
      }
    };

    await writeSubCollection(SUB_COLLECTIONS.INVENTORY, data.inventory || [], i => i.id, 'STK');
    await writeSubCollection(SUB_COLLECTIONS.SALES, data.sales || [], s => s.invNo, 'INV');
    await writeSubCollection(SUB_COLLECTIONS.KHATA, data.khata || [], k => k.id, 'KHT');
    await writeSubCollection(SUB_COLLECTIONS.EXPENSES, data.expenses || [], e => e.id, 'EXP');
    await writeSubCollection(SUB_COLLECTIONS.ACTIVITIES, (data.activities || []).slice(0, 200), a => a.id, 'ACT');
    await writeSubCollection(SUB_COLLECTIONS.PURCHASES, data.supplierPurchases || [], p => p.id || p.billNo, 'PUR');
    await writeSubCollection(SUB_COLLECTIONS.DAILY_CLOSINGS, data.dailyClosings || [], d => d.id || d.date, 'DCL');
    await writeSubCollection(SUB_COLLECTIONS.SALES_RETURNS, data.salesReturns || [], r => r.id || r.returnNo, 'RET');
    await writeSubCollection(SUB_COLLECTIONS.STOCK_ADJUSTMENTS, data.stockAdjustments || [], a => a.id, 'ADJ');
    await writeSubCollection(SUB_COLLECTIONS.PURCHASES_LEDGER, data.purchasesLedger || [], l => l.id, 'PL');
    await writeSubCollection(SUB_COLLECTIONS.IMEI_RECORDS, data.imeiRecords || [], r => r.id || r.imei, 'IMEI');
  } catch (error) {
    console.warn(`Firebase Firestore save notice for store [${storeId}]:`, error);
    if (isQuotaError(error)) {
      setQuotaExceededFlag(true);
      return;
    }
    if (
      error instanceof Error &&
      (error.message.includes('permission') || (error as { code?: string }).code === 'permission-denied')
    ) {
      handleFirestoreError(error, OperationType.WRITE, `${STORES_COLLECTION}/${storeId}`);
    }
    throw error;
  }
}

// ==================== SINGLE SOURCE OF TRUTH LOAD FROM FIRESTORE ====================

export interface CloudLoadResult {
  data: AppData | null;
  fromServer: boolean;
}

export async function loadAppDataFromFirestoreWithMeta(targetStoreId?: string): Promise<CloudLoadResult> {
  if (getQuotaExceededFlag()) return { data: null, fromServer: false };
  const storeId = toValidFirestoreDocId(targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID, 'STR');

  try {
    const authUser = await ensureAnonymousAuth();
    if (!authUser) return { data: null, fromServer: false };

    const rootDocRef = doc(db, STORES_COLLECTION, storeId);
    let fromServer = false;
    let rootDocSnap: any;
    try {
      rootDocSnap = await getDocFromServer(rootDocRef);
      fromServer = true;
    } catch (srvErr: any) {
      const code = srvErr?.code || '';
      if (code === 'permission-denied' || isQuotaError(srvErr)) {
        throw srvErr;
      }
      rootDocSnap = await getDoc(rootDocRef);
      fromServer = Boolean(rootDocSnap && rootDocSnap.metadata && !rootDocSnap.metadata.fromCache);
    }

    if (!rootDocSnap.exists()) {
      return { data: null, fromServer };
    }

    const rootData = rootDocSnap.data() as Record<string, unknown>;
    const normalizedDeleted = normalizeDeletedIds(rootData as Partial<AppData>);

    const emptySnap = { docs: [], forEach: () => {} } as any;
    const fetchSubSnap = async (qOrRef: any, allowEmptyFallback = false) => {
      try {
        const snap = await getDocsFromServer(qOrRef);
        return snap;
      } catch (err: any) {
        const code = err?.code || '';
        if (code === 'permission-denied' || isQuotaError(err)) {
          throw err;
        }
        fromServer = false;
        try {
          return await getDocs(qOrRef);
        } catch {
          return allowEmptyFallback ? emptySnap : null;
        }
      }
    };

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
      fetchSubSnap(collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.SALES)),
      fetchSubSnap(collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.INVENTORY)),
      fetchSubSnap(collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.KHATA)),
      fetchSubSnap(collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.EXPENSES)),
      fetchSubSnap(
        query(
          collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.ACTIVITIES),
          orderBy('timestamp', 'desc'),
          limit(200)
        )
      ).catch(() => fetchSubSnap(collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.ACTIVITIES), true)),
      fetchSubSnap(collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.USERS), true),
      fetchSubSnap(collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.PURCHASES), true),
      fetchSubSnap(collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.DAILY_CLOSINGS), true),
      fetchSubSnap(collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.SALES_RETURNS), true),
      fetchSubSnap(collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.STOCK_ADJUSTMENTS), true),
      fetchSubSnap(collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.PURCHASES_LEDGER), true),
      fetchSubSnap(collection(db, STORES_COLLECTION, storeId, SUB_COLLECTIONS.IMEI_RECORDS), true),
    ]);

    const readSubCollection = <T>(
      snap: any,
      key: SyncCollectionKey,
      idFn: (item: T) => string | undefined,
      timeFn: (item: T) => string | undefined
    ): T[] => {
      const tombstones = normalizedDeleted[key] || [];
      const arr: T[] = [];
      if (snap && typeof snap.forEach === 'function') {
        let count = 0;
        snap.forEach((docSnap: any) => {
          count++;
          const item = docSnap.data() as T;
          const id = idFn(item) || docSnap.id;
          if (!isItemTombstoned(id, timeFn(item), tombstones)) {
            arr.push(item);
          }
        });
        if (count > 0) recordCloudRead(count);
      }
      return arr;
    };

    const sales = readSubCollection<SaleRecord>(salesSnap, 'sales', s => s.invNo, s => s.updatedAt || s.date)
      .sort((a, b) => parseTimeMs(b.date) - parseTimeMs(a.date));

    const inventory = readSubCollection<InventoryItem>(invSnap, 'inventory', i => i.id, i => i.updatedAt || i.createdAt);

    const khata = readSubCollection<KhataCustomer>(khataSnap, 'khata', k => k.id, k => k.updatedAt || k.lastUpdated);

    const expenses = readSubCollection<ExpenseItem>(expSnap, 'expenses', e => e.id, e => e.updatedAt || e.date)
      .sort((a, b) => parseTimeMs(b.date) - parseTimeMs(a.date));

    const activities = readSubCollection<ActivityLog>(actSnap, 'activities', a => a.id, a => a.updatedAt || a.timestamp);

    const supplierPurchases = readSubCollection<SupplierPurchase>(
      purSnap,
      'supplierPurchases',
      p => p.id || p.billNo,
      p => p.updatedAt || p.reversedAt || p.date
    ).sort((a, b) => parseTimeMs(b.date) - parseTimeMs(a.date));

    const dailyClosings = readSubCollection<DailyClosingRecord>(
      closingSnap,
      'dailyClosings',
      d => d.id || d.date,
      d => d.updatedAt || d.createdAt || d.date
    ).sort((a, b) => parseTimeMs(b.date) - parseTimeMs(a.date));

    const salesReturns = readSubCollection<SalesReturnRecord>(
      returnsSnap,
      'salesReturns',
      r => r.returnNo || r.id,
      r => r.updatedAt || r.returnDate
    ).sort((a, b) => parseTimeMs(b.returnDate) - parseTimeMs(a.returnDate));

    const stockAdjustments = readSubCollection<StockAdjustment>(
      adjSnap,
      'stockAdjustments',
      a => a.id,
      a => a.updatedAt || a.adjustedAt
    ).sort((a, b) => parseTimeMs(b.adjustedAt) - parseTimeMs(a.adjustedAt));

    const purchasesLedger = readSubCollection<PurchaseLedgerEntry>(
      ledgerSnap,
      'purchasesLedger',
      l => l.id,
      l => l.updatedAt || l.date
    ).sort((a, b) => parseTimeMs(b.date) - parseTimeMs(a.date));

    const imeiRecords = readSubCollection<ImeiRecord>(
      imeiSnap,
      'imeiRecords',
      r => r.id || r.imei,
      r => r.updatedAt || r.createdAt
    );

    const subUsers: UserAccount[] = [];
    if (usersSnap && usersSnap.docs) {
      usersSnap.forEach((docSnap: any) => subUsers.push(docSnap.data() as UserAccount));
    }
    const rootUsers = (rootData.users as UserAccount[]) || [];
    const usersMap = new Map<string, UserAccount>();
    rootUsers.forEach(u => u && u.id && usersMap.set(u.id, u));
    subUsers.forEach(u => u && u.id && usersMap.set(u.id, u));

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

    const assembledData: AppData = {
      backupVersion: CURRENT_BACKUP_VERSION,
      lastModified: typeof rootData.lastModified === 'string' ? rootData.lastModified : undefined,
      migrationDone: Boolean(rootData.migrationDone),
      settingsUpdatedAt: typeof rootData.settingsUpdatedAt === 'string' ? rootData.settingsUpdatedAt : undefined,
      categoriesUpdatedAt: typeof rootData.categoriesUpdatedAt === 'string' ? rootData.categoriesUpdatedAt : undefined,
      expenseCategoriesUpdatedAt: typeof rootData.expenseCategoriesUpdatedAt === 'string' ? rootData.expenseCategoriesUpdatedAt : undefined,
      onlineAccountsUpdatedAt: typeof rootData.onlineAccountsUpdatedAt === 'string' ? rootData.onlineAccountsUpdatedAt : undefined,
      tabPreferencesUpdatedAt: typeof rootData.tabPreferencesUpdatedAt === 'string' ? rootData.tabPreferencesUpdatedAt : undefined,
      usersUpdatedAt: typeof rootData.usersUpdatedAt === 'string' ? rootData.usersUpdatedAt : undefined,
      settings: (rootData.settings as ShopSettings) || defaultSettings,
      categories: Array.isArray(rootData.categories) ? normalizeCategoriesList(rootData.categories) : defaultCategories,
      expenseCategories: Array.isArray(rootData.expenseCategories) ? (rootData.expenseCategories as string[]) : defaultExpenseCategories,
      onlineAccounts: Array.isArray(rootData.onlineAccounts) ? (rootData.onlineAccounts as OnlineAccount[]) : defaultOnlineAccounts,
      tabPreferences: (rootData.tabPreferences as TabPreferences) || {},
      users: Array.from(deduplicatedUsersMap.values()),
      currentRole: (rootData.currentRole as UserRole) || 'admin',
      currentUser: (rootData.currentUser as UserAccount) || undefined,
      deletedIds: normalizedDeleted,
      deletedInventoryIds: (normalizedDeleted.inventory || []).map(t => t.id),
      dailyClosings,
      imeiRecords,
      stockAdjustments,
      purchasesLedger,
      supplierPurchases,
      salesReturns,
      inventory,
      sales,
      khata,
      expenses,
      activities,
    };

    if (currentPendingOps.length === 0) {
      setLastCloudError(null);
    }
    return { data: assembledData, fromServer };
  } catch (error) {
    console.warn(`Firebase Firestore load notice for store [${storeId}]:`, error);
    if (isQuotaError(error)) {
      setQuotaExceededFlag(true);
      return { data: null, fromServer: false };
    }
    const errMsg = error instanceof Error ? error.message : String(error);
    setLastCloudError(`Cloud load failed: ${errMsg}`);
    if (
      error instanceof Error &&
      (error.message.includes('permission') || (error as { code?: string }).code === 'permission-denied')
    ) {
      handleFirestoreError(error, OperationType.GET, `${STORES_COLLECTION}/${storeId}`);
    }
    return { data: null, fromServer: false };
  }
}

export async function loadAppDataFromFirestore(targetStoreId?: string): Promise<AppData | null> {
  const res = await loadAppDataFromFirestoreWithMeta(targetStoreId);
  return res.data;
}

async function loadAppDataFromLegacyFirestore(): Promise<Partial<AppData> | null> {
  if (getQuotaExceededFlag()) return null;
  try {
    const authUser = await ensureAnonymousAuth();
    if (!authUser) return null;

    const rootDocRef = doc(db, LEGACY_FIRESTORE_COLLECTION, DEFAULT_STORE_ID);
    const rootDocSnap = await getDoc(rootDocRef);
    if (!rootDocSnap.exists()) return null;
    const rootData = rootDocSnap.data() as Record<string, unknown>;

    const [
      salesSnap,
      invSnap,
      khataSnap,
      expSnap,
      actSnap,
      usersSnap,
      purSnap,
      ledgerSnap,
      imeiSnap,
    ] = await Promise.all([
      getDocs(collection(db, LEGACY_FIRESTORE_COLLECTION, DEFAULT_STORE_ID, SUB_COLLECTIONS.SALES)).catch(() => null),
      getDocs(collection(db, LEGACY_FIRESTORE_COLLECTION, DEFAULT_STORE_ID, SUB_COLLECTIONS.INVENTORY)).catch(() => null),
      getDocs(collection(db, LEGACY_FIRESTORE_COLLECTION, DEFAULT_STORE_ID, SUB_COLLECTIONS.KHATA)).catch(() => null),
      getDocs(collection(db, LEGACY_FIRESTORE_COLLECTION, DEFAULT_STORE_ID, SUB_COLLECTIONS.EXPENSES)).catch(() => null),
      getDocs(collection(db, LEGACY_FIRESTORE_COLLECTION, DEFAULT_STORE_ID, SUB_COLLECTIONS.ACTIVITIES)).catch(() => null),
      getDocs(collection(db, LEGACY_FIRESTORE_COLLECTION, DEFAULT_STORE_ID, SUB_COLLECTIONS.USERS)).catch(() => null),
      getDocs(collection(db, LEGACY_FIRESTORE_COLLECTION, DEFAULT_STORE_ID, SUB_COLLECTIONS.PURCHASES)).catch(() => null),
      getDocs(collection(db, LEGACY_FIRESTORE_COLLECTION, DEFAULT_STORE_ID, SUB_COLLECTIONS.PURCHASES_LEDGER)).catch(() => null),
      getDocs(collection(db, LEGACY_FIRESTORE_COLLECTION, DEFAULT_STORE_ID, SUB_COLLECTIONS.IMEI_RECORDS)).catch(() => null),
    ]);

    const readSnap = <T>(snap: any, fallbackArr: T[] = []): T[] => {
      const list: T[] = [...(Array.isArray(fallbackArr) ? fallbackArr : [])];
      if (snap && typeof snap.forEach === 'function') {
        snap.forEach((d: any) => list.push(d.data()));
      }
      return list;
    };

    return {
      settings: (rootData.settings as ShopSettings) || undefined,
      categories: Array.isArray(rootData.categories) ? cleanCategories(rootData.categories) : undefined,
      expenseCategories: Array.isArray(rootData.expenseCategories) ? (rootData.expenseCategories as string[]) : undefined,
      onlineAccounts: Array.isArray(rootData.onlineAccounts) ? (rootData.onlineAccounts as OnlineAccount[]) : undefined,
      dailyClosings: (rootData.dailyClosings as DailyClosingRecord[]) || [],
      imeiRecords: readSnap<ImeiRecord>(imeiSnap, (rootData.imeiRecords as ImeiRecord[]) || []),
      stockAdjustments: (rootData.stockAdjustments as StockAdjustment[]) || [],
      purchasesLedger: readSnap<PurchaseLedgerEntry>(ledgerSnap, (rootData.purchasesLedger as PurchaseLedgerEntry[]) || []),
      supplierPurchases: readSnap<SupplierPurchase>(purSnap, (rootData.supplierPurchases as SupplierPurchase[]) || []),
      salesReturns: (rootData.salesReturns as SalesReturnRecord[]) || [],
      users: readSnap<UserAccount>(usersSnap, (rootData.users as UserAccount[]) || []),
      inventory: readSnap<InventoryItem>(invSnap, (rootData.inventory as InventoryItem[]) || []),
      sales: readSnap<SaleRecord>(salesSnap, (rootData.sales as SaleRecord[]) || []),
      khata: readSnap<KhataCustomer>(khataSnap, (rootData.khata as KhataCustomer[]) || []),
      expenses: readSnap<ExpenseItem>(expSnap, (rootData.expenses as ExpenseItem[]) || []),
      activities: readSnap<ActivityLog>(actSnap, (rootData.activities as ActivityLog[]) || []),
      deletedIds: normalizeDeletedIds(rootData as Partial<AppData>),
    };
  } catch {
    return null;
  }
}

/**
 * ONE-TIME migration:
 * 1) Automatically downloads a JSON backup of all current local data first.
 * 2) Reads old arrays on root doc `/stores/{storeId}` and legacy `/pos_data/main_store`.
 * 3) Copies missing records into sub-collections (respecting tombstones).
 * 4) Sets `migrationDone: true` on `/stores/{storeId}`.
 */
export async function runOneTimeSubcollectionMigration(
  currentLocalData: AppData,
  remoteData: AppData | null,
  targetStoreId?: string
): Promise<AppData | null> {
  if (getQuotaExceededFlag() || (typeof navigator !== 'undefined' && !navigator.onLine)) return null;
  const storeId = toValidFirestoreDocId(targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID, 'STR');

  try {
    const authUser = await ensureAnonymousAuth();
    if (!authUser) return null;

    const rootDocRef = doc(db, STORES_COLLECTION, storeId);
    const rootSnap = await getDoc(rootDocRef);
    const rootData = rootSnap.exists() ? (rootSnap.data() as Record<string, unknown>) : null;
    if (rootData?.migrationDone === true) {
      return null;
    }

    const oldRootArrays: Partial<AppData> = rootData
      ? {
          inventory: Array.isArray(rootData.inventory) ? (rootData.inventory as InventoryItem[]) : [],
          sales: Array.isArray(rootData.sales) ? (rootData.sales as SaleRecord[]) : [],
          khata: Array.isArray(rootData.khata) ? (rootData.khata as KhataCustomer[]) : [],
          expenses: Array.isArray(rootData.expenses) ? (rootData.expenses as ExpenseItem[]) : [],
          supplierPurchases: Array.isArray(rootData.supplierPurchases) ? (rootData.supplierPurchases as SupplierPurchase[]) : [],
          purchasesLedger: Array.isArray(rootData.purchasesLedger) ? (rootData.purchasesLedger as PurchaseLedgerEntry[]) : [],
          imeiRecords: Array.isArray(rootData.imeiRecords) ? (rootData.imeiRecords as ImeiRecord[]) : [],
          salesReturns: Array.isArray(rootData.salesReturns) ? (rootData.salesReturns as SalesReturnRecord[]) : [],
          stockAdjustments: Array.isArray(rootData.stockAdjustments) ? (rootData.stockAdjustments as StockAdjustment[]) : [],
          dailyClosings: Array.isArray(rootData.dailyClosings) ? (rootData.dailyClosings as DailyClosingRecord[]) : [],
          activities: Array.isArray(rootData.activities) ? (rootData.activities as ActivityLog[]) : [],
        }
      : {};

    const legacyData = await loadAppDataFromLegacyFirestore();

    const hasOldDataToMigrate =
      Object.values(oldRootArrays).some(arr => Array.isArray(arr) && arr.length > 0) ||
      Boolean(
        legacyData &&
          ((legacyData.inventory?.length || 0) > 0 ||
            (legacyData.sales?.length || 0) > 0 ||
            (legacyData.khata?.length || 0) > 0 ||
            (legacyData.expenses?.length || 0) > 0 ||
            (legacyData.supplierPurchases?.length || 0) > 0)
      );

    if (!hasOldDataToMigrate) {
      if (rootSnap.exists()) {
        await awaitWriteWithQuotaAndTimeout(setDoc(rootDocRef, { migrationDone: true }, { merge: true }));
        recordCloudWrite(1);
      }
      return null;
    }

    // (a) Download JSON backup of current local data AT MOST ONCE before migration if non-empty
    const preMigrationBackupKey = `MOBILE_POS_PRE_MIGRATION_BACKUP_DONE_${storeId}`;
    let alreadyDownloadedPreMigration = false;
    try {
      alreadyDownloadedPreMigration = Boolean(localStorage.getItem(preMigrationBackupKey));
    } catch {
      alreadyDownloadedPreMigration = false;
    }

    const hasLocalRecords =
      (currentLocalData.inventory?.length || 0) > 0 ||
      (currentLocalData.sales?.length || 0) > 0 ||
      (currentLocalData.khata?.length || 0) > 0 ||
      (currentLocalData.expenses?.length || 0) > 0 ||
      (currentLocalData.supplierPurchases?.length || 0) > 0;
    if (hasLocalRecords && !alreadyDownloadedPreMigration) {
      try {
        localStorage.setItem(preMigrationBackupKey, new Date().toISOString());
      } catch {
        // ignore
      }
      downloadJsonBackup(currentLocalData, 'pre_migration_backup_');
    }

    // Merge old arrays & legacy into current data while strictly respecting tombstones
    let baseData = remoteData ? mergeAppData(currentLocalData, remoteData) : currentLocalData;
    const mergedTombstones = mergeDeletedIds(baseData, legacyData || undefined);

    const copyMissing = async <T>(
      candidates: T[],
      existing: T[],
      subCol: string,
      key: SyncCollectionKey,
      idFn: (item: T) => string | undefined,
      timeFn: (item: T) => string | undefined,
      prefix: string
    ): Promise<T[]> => {
      const existingIds = new Set(existing.map(x => idFn(x)).filter(Boolean) as string[]);
      const tombstones = mergedTombstones.deletedIds[key] || [];
      const missing: T[] = [];
      for (const item of candidates) {
        const id = idFn(item);
        if (!id || existingIds.has(id)) continue;
        if (isItemTombstoned(id, timeFn(item), tombstones)) continue;
        existingIds.add(id);
        missing.push(item);
      }
      if (missing.length > 0) {
        const chunks = chunkArray(missing, 450);
        for (const chunk of chunks) {
          const batch = writeBatch(db);
          for (const item of chunk) {
            const ref = doc(db, STORES_COLLECTION, storeId, subCol, toValidFirestoreDocId(idFn(item), prefix));
            batch.set(ref, sanitizeForFirestore(item) as Record<string, unknown>, { merge: true });
          }
          await awaitWriteWithQuotaAndTimeout(batch.commit());
          recordCloudWrite(chunk.length);
        }
      }
      return [...existing, ...missing];
    };

    const nextInv = await copyMissing(
      [...(oldRootArrays.inventory || []), ...(legacyData?.inventory || [])],
      baseData.inventory || [],
      SUB_COLLECTIONS.INVENTORY,
      'inventory',
      i => i.id,
      i => i.updatedAt || i.createdAt,
      'STK'
    );
    const nextSales = await copyMissing(
      [...(oldRootArrays.sales || []), ...(legacyData?.sales || [])],
      baseData.sales || [],
      SUB_COLLECTIONS.SALES,
      'sales',
      s => s.invNo,
      s => s.updatedAt || s.date,
      'INV'
    );
    const nextKhata = await copyMissing(
      [...(oldRootArrays.khata || []), ...(legacyData?.khata || [])],
      baseData.khata || [],
      SUB_COLLECTIONS.KHATA,
      'khata',
      k => k.id,
      k => k.updatedAt || k.lastUpdated,
      'KHT'
    );
    const nextExpenses = await copyMissing(
      [...(oldRootArrays.expenses || []), ...(legacyData?.expenses || [])],
      baseData.expenses || [],
      SUB_COLLECTIONS.EXPENSES,
      'expenses',
      e => e.id,
      e => e.updatedAt || e.date,
      'EXP'
    );
    const nextPurchases = await copyMissing(
      [...(oldRootArrays.supplierPurchases || []), ...(legacyData?.supplierPurchases || [])],
      baseData.supplierPurchases || [],
      SUB_COLLECTIONS.PURCHASES,
      'supplierPurchases',
      p => p.id || p.billNo,
      p => p.updatedAt || p.reversedAt || p.date,
      'PUR'
    );
    const nextClosings = await copyMissing(
      [...(oldRootArrays.dailyClosings || []), ...(legacyData?.dailyClosings || [])],
      baseData.dailyClosings || [],
      SUB_COLLECTIONS.DAILY_CLOSINGS,
      'dailyClosings',
      d => d.id || d.date,
      d => d.updatedAt || d.createdAt || d.date,
      'DCL'
    );
    const nextReturns = await copyMissing(
      [...(oldRootArrays.salesReturns || []), ...(legacyData?.salesReturns || [])],
      baseData.salesReturns || [],
      SUB_COLLECTIONS.SALES_RETURNS,
      'salesReturns',
      r => r.id || r.returnNo,
      r => r.updatedAt || r.returnDate,
      'RET'
    );
    const nextAdj = await copyMissing(
      [...(oldRootArrays.stockAdjustments || []), ...(legacyData?.stockAdjustments || [])],
      baseData.stockAdjustments || [],
      SUB_COLLECTIONS.STOCK_ADJUSTMENTS,
      'stockAdjustments',
      a => a.id,
      a => a.updatedAt || a.adjustedAt,
      'ADJ'
    );
    const nextLedger = await copyMissing(
      [...(oldRootArrays.purchasesLedger || []), ...(legacyData?.purchasesLedger || [])],
      baseData.purchasesLedger || [],
      SUB_COLLECTIONS.PURCHASES_LEDGER,
      'purchasesLedger',
      l => l.id,
      l => l.updatedAt || l.date,
      'PL'
    );
    const nextImei = await copyMissing(
      [...(oldRootArrays.imeiRecords || []), ...(legacyData?.imeiRecords || [])],
      baseData.imeiRecords || [],
      SUB_COLLECTIONS.IMEI_RECORDS,
      'imeiRecords',
      r => r.id || r.imei,
      r => r.updatedAt || r.createdAt,
      'IMEI'
    );

    await awaitWriteWithQuotaAndTimeout(setDoc(rootDocRef, { migrationDone: true }, { merge: true }));
    recordCloudWrite(1);

    return {
      ...baseData,
      migrationDone: true,
      deletedIds: mergedTombstones.deletedIds,
      deletedInventoryIds: mergedTombstones.deletedInventoryIds,
      inventory: nextInv,
      sales: nextSales,
      khata: nextKhata,
      expenses: nextExpenses,
      supplierPurchases: nextPurchases,
      dailyClosings: nextClosings,
      salesReturns: nextReturns,
      stockAdjustments: nextAdj,
      purchasesLedger: nextLedger,
      imeiRecords: nextImei,
    };
  } catch (err) {
    console.warn('One-time subcollection migration notice:', err);
    return null;
  }
}

// ==================== LOCAL STORAGE & INDEXEDDB ====================

export function loadStoredData(targetStoreId?: string): AppData {
  try {
    const key = getLocalStorageKey(targetStoreId);
    const raw = localStorage.getItem(key);

    if (raw) {
      const parsed = JSON.parse(raw);
      const validation = validateBackupData(parsed);
      if (validation.valid && validation.data) {
        return validation.data;
      }
    }

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

export async function saveToIndexedDB(storeId: string, data: AppData): Promise<void> {
  try {
    const idb = await getIDB();
    const now = new Date().toISOString();
    await idb.put(IDB_STORE_NAME, { storeId, data, updatedAt: now });
    lastLocalSaveAt = now;
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

function safeSetLocalStorage(key: string, data: AppData): void {
  try {
    const sanitized = stripLargePayloadForLocalStorage(data);
    localStorage.setItem(key, JSON.stringify(sanitized));
    lastLocalSaveAt = new Date().toISOString();
  } catch {
    try {
      const lightweight: AppData = {
        ...stripLargePayloadForLocalStorage(data),
        sales: (data.sales || []).slice(0, 100),
        activities: (data.activities || []).slice(0, 50),
      };
      localStorage.setItem(key, JSON.stringify(lightweight));
    } catch {
      try {
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
        // full data remains intact in IndexedDB
      }
    }
  }
}

export function saveStoredData(data: AppData, targetStoreId?: string): void {
  const storeId = targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID;
  const dataWithMeta: AppData = {
    ...data,
    backupVersion: CURRENT_BACKUP_VERSION,
    lastModified: data.lastModified || new Date().toISOString(),
  };

  const key = getLocalStorageKey(storeId);
  safeSetLocalStorage(key, dataWithMeta);

  saveToIndexedDB(storeId, dataWithMeta).catch(err => {
    console.warn(`IndexedDB save error for store [${storeId}]:`, err);
  });

  saveDailyAutomaticBackup(storeId, dataWithMeta).catch(() => {});
}

// ==================== MERGE ENGINE WITH TOMBSTONES & FIELD TIMESTAMPS ====================

export function mergeAppData(local: AppData, remote: Partial<AppData>): AppData {
  const localSnapTime = parseTimeMs(local.lastModified);
  const remoteSnapTime = parseTimeMs(remote.lastModified);
  // If remote lacks timestamp (0) or local is newer/equal, prefer local when ambiguous
  const preferLocalWhenAmbiguous =
    remoteSnapTime === 0 || (localSnapTime > 0 && localSnapTime >= remoteSnapTime);

  const shouldPreferLocalGroup = (localGroupTs?: string, remoteGroupTs?: string): boolean => {
    const lTs = parseTimeMs(localGroupTs);
    const rTs = parseTimeMs(remoteGroupTs);
    if (lTs > 0 && rTs === 0) return true;
    if (rTs > 0 && lTs === 0) return false;
    if (lTs > 0 && rTs > 0) return lTs >= rTs;
    return preferLocalWhenAmbiguous;
  };

  const { deletedIds: mergedDeletedIds, deletedInventoryIds } = mergeDeletedIds(local, remote);

  const filterTombstoned = <T>(
    items: T[],
    key: SyncCollectionKey,
    idFn: (x: T) => string | undefined,
    timeFn: (x: T) => string | undefined
  ): T[] => {
    const tombstones = mergedDeletedIds[key] || [];
    if (tombstones.length === 0) return items;
    return items.filter(item => !isItemTombstoned(idFn(item), timeFn(item), tombstones));
  };

  const pickByTime = <T>(
    ex: T,
    inc: T,
    getTimeStr: (x: T) => string | undefined
  ): { winner: T; loser: T } => {
    const exTime = parseTimeMs(getTimeStr(ex));
    const incTime = parseTimeMs(getTimeStr(inc));
    if (exTime > incTime) return { winner: ex, loser: inc };
    if (incTime > exTime) return { winner: inc, loser: ex };
    return preferLocalWhenAmbiguous ? { winner: ex, loser: inc } : { winner: inc, loser: ex };
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

  const mergeCollection = <T>(
    key: SyncCollectionKey,
    localArr: T[] | undefined,
    remoteArr: T[] | undefined,
    idFn: (x: T) => string | undefined,
    timeFn: (x: T) => string | undefined,
    customResolve?: (ex: T, inc: T) => T
  ): T[] => {
    const base =
      remoteArr !== undefined
        ? mergeByField(
            localArr || [],
            remoteArr,
            idFn,
            customResolve || ((ex, inc) => pickByTime(ex, inc, timeFn).winner)
          )
        : localArr || [];
    return filterTombstoned(base, key, idFn, timeFn);
  };

  const localWinsSettings = shouldPreferLocalGroup(local.settingsUpdatedAt, remote.settingsUpdatedAt);
  const mergedSettings = remote.settings
    ? localWinsSettings
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

  const localWinsCategories = shouldPreferLocalGroup(local.categoriesUpdatedAt, remote.categoriesUpdatedAt);
  const mergedCategories =
    remote.categories !== undefined
      ? localWinsCategories
        ? normalizeCategoriesList(local.categories || [])
        : normalizeCategoriesList(remote.categories || [])
      : normalizeCategoriesList(local.categories || []);

  const localWinsExpCategories = shouldPreferLocalGroup(
    local.expenseCategoriesUpdatedAt,
    remote.expenseCategoriesUpdatedAt
  );
  const mergedExpCategories =
    remote.expenseCategories !== undefined
      ? localWinsExpCategories
        ? local.expenseCategories || []
        : remote.expenseCategories
      : local.expenseCategories || defaultExpenseCategories;

  const localWinsOnlineAccounts = shouldPreferLocalGroup(
    local.onlineAccountsUpdatedAt,
    remote.onlineAccountsUpdatedAt
  );
  const mergedOnlineAccounts =
    remote.onlineAccounts !== undefined
      ? localWinsOnlineAccounts
        ? local.onlineAccounts || []
        : remote.onlineAccounts
      : local.onlineAccounts || defaultOnlineAccounts;

  const localWinsTabPrefs = shouldPreferLocalGroup(local.tabPreferencesUpdatedAt, remote.tabPreferencesUpdatedAt);
  const mergedTabPreferences =
    remote.tabPreferences !== undefined
      ? localWinsTabPrefs
        ? { ...(remote.tabPreferences || {}), ...(local.tabPreferences || {}) }
        : { ...(local.tabPreferences || {}), ...(remote.tabPreferences || {}) }
      : local.tabPreferences || {};

  const localWinsUsers = shouldPreferLocalGroup(local.usersUpdatedAt, remote.usersUpdatedAt);
  const mergedUsers =
    remote.users !== undefined
      ? localWinsUsers
        ? local.users || []
        : remote.users
      : local.users || [];

  const maxIso = (a?: string, b?: string): string | undefined => {
    const tA = parseTimeMs(a);
    const tB = parseTimeMs(b);
    if (tA === 0 && tB === 0) return undefined;
    return tA >= tB ? a : b;
  };

  return {
    ...local,
    ...remote,
    backupVersion: CURRENT_BACKUP_VERSION,
    lastModified: maxIso(local.lastModified, remote.lastModified) || new Date().toISOString(),
    migrationDone: local.migrationDone || remote.migrationDone,
    settingsUpdatedAt: maxIso(local.settingsUpdatedAt, remote.settingsUpdatedAt),
    categoriesUpdatedAt: maxIso(local.categoriesUpdatedAt, remote.categoriesUpdatedAt),
    expenseCategoriesUpdatedAt: maxIso(local.expenseCategoriesUpdatedAt, remote.expenseCategoriesUpdatedAt),
    onlineAccountsUpdatedAt: maxIso(local.onlineAccountsUpdatedAt, remote.onlineAccountsUpdatedAt),
    tabPreferencesUpdatedAt: maxIso(local.tabPreferencesUpdatedAt, remote.tabPreferencesUpdatedAt),
    usersUpdatedAt: maxIso(local.usersUpdatedAt, remote.usersUpdatedAt),
    settings: mergedSettings,
    categories: mergedCategories,
    expenseCategories: mergedExpCategories,
    onlineAccounts: mergedOnlineAccounts,
    tabPreferences: mergedTabPreferences,
    users: mergedUsers,
    deletedIds: mergedDeletedIds,
    deletedInventoryIds,
    inventory: mergeCollection<InventoryItem>(
      'inventory',
      local.inventory,
      remote.inventory,
      i => i.id,
      i => i.updatedAt || i.createdAt,
      (ex, inc) => {
        const { winner, loser } = pickByTime(ex, inc, x => x.updatedAt || x.createdAt);
        return {
          ...loser,
          ...winner,
          image: winner.image || loser.image,
        };
      }
    ),
    sales: mergeCollection<SaleRecord>(
      'sales',
      local.sales,
      remote.sales,
      s => s.invNo,
      s => s.updatedAt || s.date
    ),
    khata: mergeCollection<KhataCustomer>(
      'khata',
      local.khata,
      remote.khata,
      k => k.id,
      k => k.updatedAt || k.lastUpdated,
      (ex, inc) => {
        const { winner, loser } = pickByTime(ex, inc, x => x.updatedAt || x.lastUpdated);
        const mergedDeletedTxIds = Array.from(
          new Set([...(winner.deletedTxIds || []), ...(loser.deletedTxIds || [])])
        );
        const deletedTxSet = new Set(mergedDeletedTxIds);
        const filteredHistory = (winner.history || []).filter(tx => !deletedTxSet.has(tx.id));
        return {
          ...loser,
          ...winner,
          image: winner.image || loser.image,
          deletedTxIds: mergedDeletedTxIds.length > 0 ? mergedDeletedTxIds : undefined,
          history: filteredHistory,
        };
      }
    ),
    expenses: mergeCollection<ExpenseItem>(
      'expenses',
      local.expenses,
      remote.expenses,
      e => e.id,
      e => e.updatedAt || e.date,
      (ex, inc) => {
        const { winner, loser } = pickByTime(ex, inc, x => x.updatedAt || x.date);
        return {
          ...loser,
          ...winner,
          image: winner.image || loser.image,
        };
      }
    ),
    supplierPurchases: mergeCollection<SupplierPurchase>(
      'supplierPurchases',
      local.supplierPurchases,
      remote.supplierPurchases,
      p => p.id || p.billNo,
      p => p.updatedAt || p.reversedAt || p.date,
      (ex, inc) => {
        const { winner, loser } = pickByTime(ex, inc, x => x.updatedAt || x.reversedAt || x.date);
        return {
          ...loser,
          ...winner,
          invoiceImage: winner.invoiceImage || loser.invoiceImage,
        };
      }
    ),
    imeiRecords: mergeCollection<ImeiRecord>(
      'imeiRecords',
      local.imeiRecords,
      remote.imeiRecords,
      r => r.id || r.imei,
      r => r.updatedAt || r.createdAt
    ),
    purchasesLedger: mergeCollection<PurchaseLedgerEntry>(
      'purchasesLedger',
      local.purchasesLedger,
      remote.purchasesLedger,
      l => l.id,
      l => l.updatedAt || l.date
    ),
    salesReturns: mergeCollection<SalesReturnRecord>(
      'salesReturns',
      local.salesReturns,
      remote.salesReturns,
      r => r.returnNo || r.id,
      r => r.updatedAt || r.returnDate
    ),
    stockAdjustments: mergeCollection<StockAdjustment>(
      'stockAdjustments',
      local.stockAdjustments,
      remote.stockAdjustments,
      a => a.id,
      a => a.updatedAt || a.adjustedAt
    ),
    dailyClosings: mergeCollection<DailyClosingRecord>(
      'dailyClosings',
      local.dailyClosings,
      remote.dailyClosings,
      d => d.id || d.date,
      d => d.updatedAt || d.createdAt || d.date
    ),
    activities: mergeCollection<ActivityLog>(
      'activities',
      local.activities,
      remote.activities,
      act => act.id,
      act => act.updatedAt || act.timestamp
    ),
  };
}

// ==================== MANUAL RECOVERY UTILITY (RESPECTS TOMBSTONES) ====================

/**
 * Manual-only recovery utility invoked when user explicitly clicks "Recover missing data".
 * Respects `deletedIds` tombstones strictly so deleted records are NEVER resurrected.
 */
export async function recoverAllMissingStoreData(
  currentData: AppData,
  targetStoreId?: string
): Promise<{ mergedData: AppData; recoveredPurchasesCount: number; totalRecoveredCount: number }> {
  const storeId = targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID;
  const initialCount =
    (currentData.supplierPurchases?.length || 0) +
    (currentData.inventory?.length || 0) +
    (currentData.sales?.length || 0) +
    (currentData.khata?.length || 0) +
    (currentData.expenses?.length || 0);
  const initialPurchaseCount = (currentData.supplierPurchases || []).length;

  let accumulatedData: AppData = { ...currentData };

  // 1. Scan localStorage partitions
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
        // ignore
      }
    }
  } catch {
    // ignore
  }

  // 2. Scan IndexedDB across store keys
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

  // 3. Scan Firestore stores/{sid} + legacy pos_data (respecting tombstones via mergeAppData)
  if (!getQuotaExceededFlag()) {
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

    try {
      const legacyStore = await loadAppDataFromLegacyFirestore();
      if (legacyStore) {
        accumulatedData = mergeAppData(accumulatedData, legacyStore);
      }
    } catch {
      // ignore
    }
  }

  const finalPurchaseCount = (accumulatedData.supplierPurchases || []).length;
  const recoveredPurchasesCount = Math.max(0, finalPurchaseCount - initialPurchaseCount);
  const finalCount =
    (accumulatedData.supplierPurchases?.length || 0) +
    (accumulatedData.inventory?.length || 0) +
    (accumulatedData.sales?.length || 0) +
    (accumulatedData.khata?.length || 0) +
    (accumulatedData.expenses?.length || 0);
  const totalRecoveredCount = Math.max(0, finalCount - initialCount);

  await saveToIndexedDB(storeId, accumulatedData);
  safeSetLocalStorage(getLocalStorageKey(storeId), accumulatedData);

  if (totalRecoveredCount > 0 && !getQuotaExceededFlag()) {
    for (const pur of accumulatedData.supplierPurchases || []) {
      savePurchaseToFirestore(pur, storeId).catch(() => {});
    }
    savePurchasesLedgerBatchToFirestore(accumulatedData.purchasesLedger || [], storeId).catch(() => {});
    saveImeiRecordsBatchToFirestore(accumulatedData.imeiRecords || [], storeId).catch(() => {});
  }

  return {
    mergedData: accumulatedData,
    recoveredPurchasesCount,
    totalRecoveredCount,
  };
}

/**
 * Authoritative reconciliation when the offline pending-writes queue is empty
 * and live server data was loaded cleanly. Keeps cloud deletions & categories
 * exact across all devices while preserving locally cached media blobs if missing.
 */
export function reconcileWithAuthoritativeCloud(localFallback: AppData, cloudData: AppData): AppData {
  const { deletedIds, deletedInventoryIds } = mergeDeletedIds(localFallback, cloudData);

  const localInvImgById = new Map((localFallback.inventory || []).map(i => [i.id, i.image]));
  const localExpImgById = new Map((localFallback.expenses || []).map(e => [e.id, e.image]));
  const localKhataImgById = new Map((localFallback.khata || []).map(k => [k.id, k.image]));
  const localPurImgById = new Map(
    (localFallback.supplierPurchases || []).map(p => [p.id || p.billNo, p.invoiceImage])
  );

  return {
    ...cloudData,
    backupVersion: CURRENT_BACKUP_VERSION,
    migrationDone: cloudData.migrationDone || localFallback.migrationDone,
    currentUser: localFallback.currentUser || cloudData.currentUser,
    currentRole: localFallback.currentRole || cloudData.currentRole || 'admin',
    settings: {
      ...cloudData.settings,
      logo: cloudData.settings?.logo || localFallback.settings?.logo,
      shopLogo: cloudData.settings?.shopLogo || localFallback.settings?.shopLogo,
      invoiceLogo: cloudData.settings?.invoiceLogo || localFallback.settings?.invoiceLogo,
      loginPageLogo: cloudData.settings?.loginPageLogo || localFallback.settings?.loginPageLogo,
    },
    deletedIds,
    deletedInventoryIds,
    inventory: (cloudData.inventory || []).map(item => ({
      ...item,
      image: item.image || localInvImgById.get(item.id),
    })),
    expenses: (cloudData.expenses || []).map(exp => ({
      ...exp,
      image: exp.image || localExpImgById.get(exp.id),
    })),
    khata: (cloudData.khata || []).map(cust => ({
      ...cust,
      image: cust.image || localKhataImgById.get(cust.id),
    })),
    supplierPurchases: (cloudData.supplierPurchases || []).map(pur => ({
      ...pur,
      invoiceImage: pur.invoiceImage || localPurImgById.get(pur.id || pur.billNo),
    })),
  };
}

// ==================== STARTUP INITIALIZATION ====================

/**
 * Exact startup order:
 * 1) Load IndexedDB / localStorage -> show UI immediately
 * 2) Start pending-writes queue retry engine (uploads ONLY pending local writes)
 * 3) Fetch Firestore -> reconcile authoritatively if no pending local writes, else merge with tombstones
 * 4) If root doc exists and !migrationDone, run one-time migration cleanly.
 */
export async function migrateAndInitializeData(
  onDataLoaded: (data: AppData) => void,
  targetStoreId?: string,
  options?: { currentState?: AppData }
): Promise<void> {
  const storeId = targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID;
  setActiveStoreId(storeId);
  startSyncBackgroundLoop();

  try {
    let currentBestData: AppData;

    if (options?.currentState) {
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
      // 1. Immediate render from localStorage mirror
      const localData = loadStoredData(storeId);
      currentBestData = localData;
      onDataLoaded(localData);

      // 2. Load IndexedDB -> merge with tombstones -> show UI immediately
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

    // Save today's automatic daily safety backup in IndexedDB
    saveDailyAutomaticBackup(storeId, currentBestData).catch(() => {});

    // Flush any pending writes queued while offline before reconciling with server
    await processPendingWritesQueue().catch(() => {});
    const remainingPendingOps = await getPendingWrites();

    // 3. Fetch live Firestore -> reconcile authoritatively when queue is empty and response is from server
    const { data: remoteData, fromServer } = await loadAppDataFromFirestoreWithMeta(storeId);

    if (remoteData) {
      let mergedData =
        remainingPendingOps.length === 0 && fromServer
          ? reconcileWithAuthoritativeCloud(currentBestData, remoteData)
          : mergeAppData(currentBestData, remoteData);

      // 4. One-time subcollection migration if needed (skip while quota cooldown is active)
      if (!remoteData.migrationDone && !getQuotaExceededFlag()) {
        const migrated = await runOneTimeSubcollectionMigration(mergedData, remoteData, storeId);
        if (migrated) {
          mergedData = migrated;
        }
      }

      await saveToIndexedDB(storeId, mergedData);
      safeSetLocalStorage(getLocalStorageKey(storeId), mergedData);
      onDataLoaded(mergedData);
    } else {
      onDataLoaded(currentBestData);
    }
  } catch (err) {
    console.error(`Error initializing store [${storeId}]:`, err);
    onDataLoaded(options?.currentState || loadStoredData(storeId));
  }
}

export const initializeIndexedDB = migrateAndInitializeData;

/**
 * Resets all stored data cleanly for the active store.
 * Automatically downloads a JSON backup of current data first so nothing can be lost by mistake.
 */
export async function clearAllStoredData(targetStoreId?: string, currentData?: AppData): Promise<AppData> {
  const storeId = targetStoreId || currentActiveStoreId || DEFAULT_STORE_ID;

  // Automatically download a JSON backup before destructive clear
  const dataToBackup = currentData || (await loadFromIndexedDB(storeId)) || loadStoredData(storeId);
  if (
    dataToBackup &&
    ((dataToBackup.inventory?.length || 0) > 0 ||
      (dataToBackup.sales?.length || 0) > 0 ||
      (dataToBackup.khata?.length || 0) > 0 ||
      (dataToBackup.expenses?.length || 0) > 0 ||
      (dataToBackup.supplierPurchases?.length || 0) > 0)
  ) {
    downloadJsonBackup(dataToBackup, 'safety_backup_before_clear_');
  }

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

  const now = new Date().toISOString();
  const clean: AppData = {
    ...initialCleanData,
    lastModified: now,
    settingsUpdatedAt: now,
    categoriesUpdatedAt: now,
    expenseCategoriesUpdatedAt: now,
    onlineAccountsUpdatedAt: now,
    tabPreferencesUpdatedAt: now,
    migrationDone: true,
  };

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
