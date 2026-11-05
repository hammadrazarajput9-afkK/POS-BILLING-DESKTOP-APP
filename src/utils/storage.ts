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
import { db, handleFirestoreError, OperationType } from './firebase';
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
} from 'firebase/firestore';
import { generateEntityId } from './id';

export const STORAGE_KEY = 'MOBILE_POS_PRO_DATA_V6';
export const LEGACY_STORAGE_KEYS = [
  'MOBILE_POS_PRO_DATA_V5',
  'MOBILE_POS_PRO_DATA_V4',
  'MOBILE_POS_PRO_DATA_V3',
  'MOBILE_POS_PRO_DATA_V2',
];

export const FIRESTORE_COLLECTION = 'pos_data';
export const FIRESTORE_DOCUMENT_ID = 'main_store';

// Sub-collections to avoid Firestore 1MB document limit
export const SUB_COLLECTIONS = {
  SALES: 'sales',
  INVENTORY: 'inventory',
  KHATA: 'khata',
  EXPENSES: 'expenses',
  ACTIVITIES: 'activities',
} as const;

export const defaultSettings: ShopSettings = {
  shopName: 'FMZ Friends Mobile Zone',
  tagline: 'Smart Mobile Sales & Inventory Management',
  address: 'Main Commercial Market, Suite #12',
  phone: '0300-0000000',
  currency: 'Rs.',
  receiptFooter: 'Thank you for your business! Warranty claims require original receipt and undamaged warranty sticker.',
  theme: 'blue-white',
  shopLogo: '/assets/aistudio/Gemini_Generated_Image_5gj5px5gj5px5gj5_c9c27f7d.jpg',
  invoiceLogo: '/assets/aistudio/Gemini_Generated_Image_5gj5px5gj5px5gj5_c9c27f7d.jpg',
  loginPageName: 'FMZ Friends Mobile Zone',
  loginPageLogo: '/assets/aistudio/Gemini_Generated_Image_5gj5px5gj5px5gj5_c9c27f7d.jpg',
};

export const defaultCategories: string[] = [
  'Mobile Phones (New)',
  'Used / Refurbished Phones',
  'Keypad & Feature Phones',
  'Chargers & Adapters',
  'Data Cables & Converters',
  'Earphones & TWS Audio',
  'Power Banks & Batteries',
  'Cases & Screen Protectors',
  'Spare Parts & Display Panels',
  'Accessories & Gadgets',
];

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
  categories: defaultCategories,
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
 * Refactored Firestore Architecture (Sub-collections):
 * 1. Root Document: pos_data/main_store holds configuration and metadata
 * 2. Sub-collections:
 *    - pos_data/main_store/sales/{invNo}
 *    - pos_data/main_store/inventory/{id}
 *    - pos_data/main_store/khata/{id}
 *    - pos_data/main_store/expenses/{id}
 *    - pos_data/main_store/activities/{id}
 */

/**
 * Saves a sale atomically using Firestore writeBatch:
 * - Writes Sale to `pos_data/main_store/sales/{invNo}`
 * - Updates affected inventory items in `pos_data/main_store/inventory/{itemId}`
 * - Updates customer balance in `pos_data/main_store/khata/{customerId}` if credit sale
 * - Records activity in `pos_data/main_store/activities/{actId}`
 * - Updates root metadata
 */
export async function saveSaleAtomic(params: {
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
}): Promise<void> {
  const { sale, inventoryUpdates, khataUpdate, activity } = params;

  try {
    const batch = writeBatch(db);

    // 1. Write sale document
    const saleDocRef = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT_ID, SUB_COLLECTIONS.SALES, sale.invNo);
    batch.set(saleDocRef, sanitizeForFirestore(sale) as Record<string, unknown>);

    // 2. Atomic update to inventory subcollection
    for (const invUpdate of inventoryUpdates) {
      const invDocRef = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT_ID, SUB_COLLECTIONS.INVENTORY, invUpdate.id);
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
      const khataDocRef = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT_ID, SUB_COLLECTIONS.KHATA, khataUpdate.customerId);
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
      const actDocRef = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT_ID, SUB_COLLECTIONS.ACTIVITIES, activity.id);
      batch.set(actDocRef, sanitizeForFirestore(activity) as Record<string, unknown>);
    }

    // 5. Update root document timestamp
    const rootDocRef = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT_ID);
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
    console.error('Failed to commit atomic sale in Firestore:', err);
    throw err;
  }
}

/**
 * Deletes a sale document from `pos_data/main_store/sales/{invNo}`
 */
export async function deleteSaleFromFirestore(invNo: string): Promise<void> {
  try {
    const saleDocRef = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT_ID, SUB_COLLECTIONS.SALES, invNo);
    await deleteDoc(saleDocRef);
  } catch (err) {
    console.warn('Failed to delete sale from Firestore:', err);
  }
}

/**
 * Updates a sale document in `pos_data/main_store/sales/{invNo}`
 */
export async function updateSaleInFirestore(sale: SaleRecord): Promise<void> {
  try {
    const saleDocRef = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT_ID, SUB_COLLECTIONS.SALES, sale.invNo);
    await setDoc(saleDocRef, sanitizeForFirestore(sale) as Record<string, unknown>, { merge: true });
  } catch (err) {
    console.warn('Failed to update sale in Firestore:', err);
  }
}

/**
 * Saves a single inventory item to `pos_data/main_store/inventory/{id}`
 */
export async function saveInventoryItemToFirestore(item: InventoryItem): Promise<void> {
  try {
    const itemDocRef = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT_ID, SUB_COLLECTIONS.INVENTORY, item.id);
    await setDoc(itemDocRef, sanitizeForFirestore(item) as Record<string, unknown>, { merge: true });
  } catch (err) {
    console.warn('Failed to save inventory item to Firestore:', err);
  }
}

/**
 * Deletes an inventory item from `pos_data/main_store/inventory/{id}`
 */
export async function deleteInventoryItemFromFirestore(id: string): Promise<void> {
  try {
    const itemDocRef = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT_ID, SUB_COLLECTIONS.INVENTORY, id);
    await deleteDoc(itemDocRef);
  } catch (err) {
    console.warn('Failed to delete inventory item from Firestore:', err);
  }
}

/**
 * Saves a single Khata customer to `pos_data/main_store/khata/{id}`
 */
export async function saveKhataCustomerToFirestore(customer: KhataCustomer): Promise<void> {
  try {
    const custDocRef = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT_ID, SUB_COLLECTIONS.KHATA, customer.id);
    await setDoc(custDocRef, sanitizeForFirestore(customer) as Record<string, unknown>, { merge: true });
  } catch (err) {
    console.warn('Failed to save Khata customer to Firestore:', err);
  }
}

/**
 * Deletes a Khata customer from `pos_data/main_store/khata/{id}`
 */
export async function deleteKhataCustomerFromFirestore(id: string): Promise<void> {
  try {
    const custDocRef = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT_ID, SUB_COLLECTIONS.KHATA, id);
    await deleteDoc(custDocRef);
  } catch (err) {
    console.warn('Failed to delete Khata customer from Firestore:', err);
  }
}

/**
 * Saves an expense item to `pos_data/main_store/expenses/{id}`
 */
export async function saveExpenseItemToFirestore(expense: ExpenseItem): Promise<void> {
  try {
    const expDocRef = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT_ID, SUB_COLLECTIONS.EXPENSES, expense.id);
    await setDoc(expDocRef, sanitizeForFirestore(expense) as Record<string, unknown>, { merge: true });
  } catch (err) {
    console.warn('Failed to save expense item to Firestore:', err);
  }
}

/**
 * Deletes an expense item from `pos_data/main_store/expenses/{id}`
 */
export async function deleteExpenseItemFromFirestore(id: string): Promise<void> {
  try {
    const expDocRef = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT_ID, SUB_COLLECTIONS.EXPENSES, id);
    await deleteDoc(expDocRef);
  } catch (err) {
    console.warn('Failed to delete expense item from Firestore:', err);
  }
}

/**
 * Saves an activity log to `pos_data/main_store/activities/{id}`
 */
export async function saveActivityLogToFirestore(activity: ActivityLog): Promise<void> {
  try {
    const actDocRef = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT_ID, SUB_COLLECTIONS.ACTIVITIES, activity.id);
    await setDoc(actDocRef, sanitizeForFirestore(activity) as Record<string, unknown>);
  } catch (err) {
    console.warn('Failed to save activity log to Firestore:', err);
  }
}

/**
 * Saves root configuration and settings to `pos_data/main_store`
 */
export async function saveRootConfigToFirestore(data: Partial<AppData>): Promise<void> {
  try {
    const rootDocRef = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT_ID);
    const configToSave: Record<string, unknown> = {
      backupVersion: CURRENT_BACKUP_VERSION,
      lastModified: new Date().toISOString(),
      settings: data.settings || defaultSettings,
      categories: data.categories || defaultCategories,
      expenseCategories: data.expenseCategories || defaultExpenseCategories,
      onlineAccounts: data.onlineAccounts || defaultOnlineAccounts,
      dailyClosings: data.dailyClosings || [],
      imeiRecords: data.imeiRecords || [],
      stockAdjustments: data.stockAdjustments || [],
      purchasesLedger: data.purchasesLedger || [],
      supplierPurchases: data.supplierPurchases || [],
      salesReturns: data.salesReturns || [],
      tabPreferences: data.tabPreferences || {},
      users: data.users || [],
      currentRole: data.currentRole || 'admin',
    };
    await setDoc(rootDocRef, sanitizeForFirestore(configToSave) as Record<string, unknown>, { merge: true });
  } catch (err) {
    console.warn('Failed to save root config to Firestore:', err);
  }
}

/**
 * Saves complete AppData to Firestore using chunked write batches to populate sub-collections.
 * Ideal for manual backup restore or initial migration.
 */
export async function saveAppDataToFirestore(data: AppData): Promise<void> {
  try {
    // 1. Save root document
    await saveRootConfigToFirestore(data);

    // 2. Save Inventory in batches
    const inventoryChunks = chunkArray(data.inventory || [], 450);
    for (const chunk of inventoryChunks) {
      const batch = writeBatch(db);
      for (const item of chunk) {
        const itemRef = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT_ID, SUB_COLLECTIONS.INVENTORY, item.id);
        batch.set(itemRef, sanitizeForFirestore(item) as Record<string, unknown>);
      }
      await batch.commit();
    }

    // 3. Save Sales in batches
    const salesChunks = chunkArray(data.sales || [], 450);
    for (const chunk of salesChunks) {
      const batch = writeBatch(db);
      for (const sale of chunk) {
        const saleRef = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT_ID, SUB_COLLECTIONS.SALES, sale.invNo);
        batch.set(saleRef, sanitizeForFirestore(sale) as Record<string, unknown>);
      }
      await batch.commit();
    }

    // 4. Save Khata in batches
    const khataChunks = chunkArray(data.khata || [], 450);
    for (const chunk of khataChunks) {
      const batch = writeBatch(db);
      for (const cust of chunk) {
        const custRef = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT_ID, SUB_COLLECTIONS.KHATA, cust.id);
        batch.set(custRef, sanitizeForFirestore(cust) as Record<string, unknown>);
      }
      await batch.commit();
    }

    // 5. Save Expenses in batches
    const expenseChunks = chunkArray(data.expenses || [], 450);
    for (const chunk of expenseChunks) {
      const batch = writeBatch(db);
      for (const exp of chunk) {
        const expRef = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT_ID, SUB_COLLECTIONS.EXPENSES, exp.id);
        batch.set(expRef, sanitizeForFirestore(exp) as Record<string, unknown>);
      }
      await batch.commit();
    }

    // 6. Save Activities (recent 200)
    const recentActivities = (data.activities || []).slice(0, 200);
    if (recentActivities.length > 0) {
      const batch = writeBatch(db);
      for (const act of recentActivities) {
        const actRef = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT_ID, SUB_COLLECTIONS.ACTIVITIES, act.id);
        batch.set(actRef, sanitizeForFirestore(act) as Record<string, unknown>);
      }
      await batch.commit();
    }
  } catch (error) {
    console.error('Error saving data to Firebase Firestore sub-collections:', error);
    if (
      error instanceof Error &&
      (error.message.includes('permission') || (error as any).code === 'permission-denied')
    ) {
      handleFirestoreError(error, OperationType.WRITE, `${FIRESTORE_COLLECTION}/${FIRESTORE_DOCUMENT_ID}`);
    }
    throw error;
  }
}

/**
 * Loads POS application data from Firebase Firestore sub-collections architecture.
 * Automatically checks for legacy single-document data and migrates it seamlessly!
 */
export async function loadAppDataFromFirestore(): Promise<AppData | null> {
  try {
    const rootDocRef = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT_ID);
    const rootDocSnap = await getDoc(rootDocRef);

    if (!rootDocSnap.exists()) {
      return null;
    }

    const rootData = rootDocSnap.data() as Record<string, unknown>;

    // Check if legacy monolithic structure exists on root doc, and auto-migrate if needed
    const hasLegacyMonolith =
      (Array.isArray(rootData.inventory) && rootData.inventory.length > 0) ||
      (Array.isArray(rootData.sales) && rootData.sales.length > 0) ||
      (Array.isArray(rootData.khata) && rootData.khata.length > 0);

    if (hasLegacyMonolith) {
      console.info('Legacy monolithic document detected. Auto-migrating to Firestore sub-collections...');
      const legacyValidation = validateBackupData(rootData);
      if (legacyValidation.valid && legacyValidation.data) {
        await saveAppDataToFirestore(legacyValidation.data);
        return legacyValidation.data;
      }
    }

    // Load sub-collections in parallel
    const [salesSnap, invSnap, khataSnap, expSnap, actSnap] = await Promise.all([
      getDocs(collection(db, FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT_ID, SUB_COLLECTIONS.SALES)),
      getDocs(collection(db, FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT_ID, SUB_COLLECTIONS.INVENTORY)),
      getDocs(collection(db, FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT_ID, SUB_COLLECTIONS.KHATA)),
      getDocs(collection(db, FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT_ID, SUB_COLLECTIONS.EXPENSES)),
      getDocs(
        query(
          collection(db, FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT_ID, SUB_COLLECTIONS.ACTIVITIES),
          orderBy('timestamp', 'desc'),
          limit(300)
        )
      ).catch(() => getDocs(collection(db, FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT_ID, SUB_COLLECTIONS.ACTIVITIES))),
    ]);

    const sales: SaleRecord[] = [];
    salesSnap.forEach(docSnap => sales.push(docSnap.data() as SaleRecord));

    const inventory: InventoryItem[] = [];
    invSnap.forEach(docSnap => inventory.push(docSnap.data() as InventoryItem));

    const khata: KhataCustomer[] = [];
    khataSnap.forEach(docSnap => khata.push(docSnap.data() as KhataCustomer));

    const expenses: ExpenseItem[] = [];
    expSnap.forEach(docSnap => expenses.push(docSnap.data() as ExpenseItem));

    const activities: ActivityLog[] = [];
    actSnap.forEach(docSnap => activities.push(docSnap.data() as ActivityLog));

    // Assemble unified AppData
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
      users: (rootData.users as UserAccount[]) || [],
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
    console.error('Error loading data from Firebase Firestore sub-collections:', error);
    if (
      error instanceof Error &&
      (error.message.includes('permission') || (error as any).code === 'permission-denied')
    ) {
      handleFirestoreError(error, OperationType.GET, `${FIRESTORE_COLLECTION}/${FIRESTORE_DOCUMENT_ID}`);
    }
    return null;
  }
}

/**
 * Loads data from localStorage with schema version migration.
 */
export function loadStoredData(): AppData {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);

    // If not found in current key, check previous legacy keys safely (safe migration without data wipe)
    if (!raw) {
      for (const legacyKey of LEGACY_STORAGE_KEYS) {
        const legacyVal = localStorage.getItem(legacyKey);
        if (legacyVal) {
          raw = legacyVal;
          break;
        }
      }
    }

    if (!raw) {
      return initialCleanData;
    }

    const parsed = JSON.parse(raw);
    const validation = validateBackupData(parsed);
    if (validation.valid && validation.data) {
      return validation.data;
    }
    return initialCleanData;
  } catch (error) {
    console.error('Failed to parse local stored data:', error);
    return initialCleanData;
  }
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Primary save routine: Updates local storage mirror and syncs subcollections.
 */
export function saveStoredData(data: AppData): void {
  const dataWithMeta: AppData = {
    ...data,
    backupVersion: CURRENT_BACKUP_VERSION,
    lastModified: new Date().toISOString(),
  };

  // 1. Fast local cache update
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataWithMeta));
  } catch (error) {
    console.warn('LocalStorage save failed:', error);
  }

  // 2. Debounced save for root config
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    saveRootConfigToFirestore(dataWithMeta).catch(err => {
      console.warn('Firebase Firestore remote save warning:', err);
    });
  }, 400);
}

/**
 * Safe Data Migration and Initialization Utility:
 * Replaces risky startup wipe routines. Safely migrates schemas and reconciles local & remote data.
 */
export async function migrateAndInitializeData(onDataLoaded: (data: AppData) => void): Promise<void> {
  try {
    const localData = loadStoredData();
    onDataLoaded(localData);

    const remoteData = await loadAppDataFromFirestore();

    if (remoteData) {
      // Remote data exists: update local cache and state safely
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteData));
      } catch (err) {
        console.warn('Failed to update local mirror from Firestore:', err);
      }
      onDataLoaded(remoteData);
    } else if (localData.inventory.length > 0 || localData.sales.length > 0 || localData.khata.length > 0) {
      // First time setting up Firestore from existing local data
      await saveAppDataToFirestore(localData);
      onDataLoaded(localData);
    } else {
      // Brand new store setup
      await saveAppDataToFirestore(initialCleanData);
      onDataLoaded(initialCleanData);
    }
  } catch (err) {
    console.error('Error in safe data migration/sync with Firestore:', err);
    onDataLoaded(loadStoredData());
  }
}

/**
 * Alias for backward compatibility if referenced elsewhere.
 */
export const initializeIndexedDB = migrateAndInitializeData;

/**
 * Resets all stored data cleanly without throwing uncaught errors.
 */
export async function clearAllStoredData(): Promise<AppData> {
  try {
    localStorage.removeItem(STORAGE_KEY);
    for (const key of LEGACY_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }

  const clean: AppData = { ...initialCleanData, lastModified: new Date().toISOString() };

  try {
    await saveAppDataToFirestore(clean);
  } catch (err) {
    console.warn('Firebase Firestore reset warning:', err);
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // ignore
  }

  return clean;
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    result.push(items.slice(i, i + chunkSize));
  }
  return result;
}
