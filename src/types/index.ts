export type ItemCategory = string;
export type ItemStatus = 'ACTIVE' | 'ARCHIVED';

export interface InventoryItem {
  id: string;
  name: string;
  category: ItemCategory;
  image?: string;
  imei?: string;
  imeis?: string[];
  barcode?: string;
  costPrice: number;
  salePrice: number;
  wholesalePrice?: number;
  boxSize?: number; // Carton/Box quantity (default 10 or 20)
  qty: number;
  createdAt: string;
  status?: ItemStatus;
  ram?: string;
  storage?: string;
  color?: string;
  note?: string;
  variants?: MobileVariant[];
  updatedAt?: string;
}

export type ImeiStatus = 'AVAILABLE' | 'SOLD' | 'RETURNED';

export interface ImeiRecord {
  id: string;
  imei: string;
  productId: string;
  productName: string;
  category?: string;
  status: ImeiStatus;
  invoiceNo?: string;
  soldDate?: string;
  customerName?: string;
  customerPhone?: string;
  purchaseBillNo?: string;
  purchaseParty?: string;
  createdAt: string;
  updatedAt: string;
}

export type StockAdjustmentReason =
  | 'Damaged'
  | 'Lost'
  | 'Stock Correction'
  | 'Manual Adjustment'
  | 'Found Stock'
  | 'Other';

export interface StockAdjustment {
  id: string;
  productId: string;
  productName: string;
  previousQty: number;
  newQty: number;
  difference: number;
  reason: StockAdjustmentReason | string;
  notes?: string;
  adjustedAt: string;
  adjustedBy: string;
  updatedAt?: string;
}

export interface MobileVariant {
  id: string;
  ram: string;
  storage: string;
  color?: string;
  costPrice: number | '';
  salePrice: number | '';
  wholesalePrice?: number | '';
  autoCostPrice?: boolean;
  autoSalePrice?: boolean;
  autoWholesalePrice?: boolean;
  qty: number | '';
  imeis: string[];
  note?: string;
}

export interface KhataTransaction {
  id: string;
  date: string;
  type: 'credit' | 'payment' | 'debit';
  amount: number;
  paymentMethod?: string; // 'Cash' | 'Bank' | 'JazzCash' | 'Easypaisa' | 'Card' | 'Other'
  accountId?: string;
  note?: string;
  receiptImage?: string;
  returnNo?: string;
  originalInvNo?: string;
  returnReason?: string;
  returnedItemsSummary?: Array<{
    name: string;
    variantLabel?: string;
    qty: number;
    imeis?: string[];
    reason: string;
    refundAmount: number;
  }>;
}

export interface KhataCustomer {
  id: string;
  name: string;
  phone: string;
  phone2?: string;
  address?: string;
  lat?: number;
  lng?: number;
  placeId?: string;
  mapUrl?: string;
  image?: string;
  customerType?: 'retail' | 'retailer' | 'wholesaler';
  shopName?: string;
  city?: string;
  ntnNumber?: string;
  cnic?: string;
  creditLimit?: number;
  dueDate?: string;
  guarantorName?: string;
  guarantorPhone?: string;
  notes?: string;
  balance: number;
  lastUpdated: string;
  updatedAt?: string;
  deletedTxIds?: string[];
  history: KhataTransaction[];
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  title: string;
  details: string;
  category: 'Sale' | 'Inventory' | 'Khata' | 'Expense' | 'Category' | 'Settings' | 'Purchase' | 'Closing' | 'Security';
  type?: 'create' | 'update' | 'delete' | 'sale' | 'payment' | 'reversal' | 'return' | 'restore';
  user?: string;
  userRole?: UserRole;
  relatedRecordId?: string;
  beforeValue?: string;
  afterValue?: string;
  updatedAt?: string;
}

export type ExpenseCategory = string;

export interface ExpenseItem {
  id: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  image?: string;
  paymentMethod?: string;
  accountId?: string;
  updatedAt?: string;
}

export interface OnlineAccount {
  id: string;
  name: string;
  accountNumber?: string;
  accountTitle?: string;
  bankType?: string;
  showInPos?: boolean;
  updatedAt?: string;
}

export interface DailyClosingRecord {
  id: string;
  date: string;
  time: string;
  createdAt?: string;
  openingCash?: number;
  openingOnlineBalances?: {
    accountId: string;
    accountName: string;
    balance: number;
  }[];
  openingTotalOnline?: number;
  openingGrandTotal?: number;
  denominations: Record<string, number>;
  coins: number;
  totalCash: number;
  onlineBalances: {
    accountId: string;
    accountName: string;
    balance: number;
  }[];
  totalOnline: number;
  grandTotal: number;
  expectedCash?: number;
  expectedOnlineBalances?: {
    accountId: string;
    accountName: string;
    balance: number;
  }[];
  expectedOnlineTotal?: number;
  expectedGrandTotal?: number;
  difference?: number;
  onlineDifference?: number;
  totalDifference?: number;
  closedBy?: string;
  notes?: string;
  status?: 'closed' | 'reopened';
  updatedAt?: string;
}

export interface TabPreferences {
  [tabId: string]: Record<string, unknown>;
}

export interface CartItem extends InventoryItem {
  cartQty: number;
  selectedImeis?: string[];
  selectedVariantId?: string;
  selectedVariantLabel?: string;
}

export type PaymentMethod =
  | 'Cash'
  | 'JazzCash'
  | 'Easypaisa'
  | 'Bank'
  | 'Card'
  | 'Load'
  | 'Digital Wallet'
  | 'Credit Adjustment'
  | 'Other'
  | (string & {});

export type InvoiceType = 'cash' | 'credit';

export interface SaleItem {
  id: string;
  name: string;
  category: ItemCategory;
  imei?: string;
  imeis?: string[];
  salePrice: number;
  wholesalePrice?: number;
  isWholesale?: boolean;
  boxCount?: number;
  costPrice: number;
  qty: number;
  returnedQty?: number;
  returnedImeis?: string[];
  returnReason?: string;
  returnedAt?: string;
  barcode?: string;
  variantId?: string;
  variantLabel?: string;
}

export interface SaleRecord {
  invNo: string;
  custName: string;
  custPhone?: string;
  invoiceType?: InvoiceType;
  saleMode?: 'retail' | 'wholesale';
  retailerShopName?: string;
  retailerCity?: string;
  retailerNtn?: string;
  wholesaleSavings?: number;
  amountPaid?: number;
  amountDue?: number;
  khataCustomerId?: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  grandTotal: number;
  totalCost: number;
  netProfit: number;
  paymentMethod: PaymentMethod;
  accountId?: string;
  date: string;
  returnStatus?: 'NONE' | 'PARTIAL' | 'FULL';
  totalRefunded?: number;
  status?: 'COMPLETED' | 'CANCELLED';
  notes?: string;
  updatedAt?: string;
}

export interface SalesReturnItem {
  itemId: string;
  productId: string;
  name: string;
  category: ItemCategory;
  qty: number;
  costPrice: number;
  salePrice: number;
  refundAmount: number;
  imei?: string;
  imeis?: string[];
  variantId?: string;
  variantLabel?: string;
  returnReason: string;
}

export interface SalesReturnRecord {
  id: string;
  returnNo: string;
  originalInvNo: string;
  customerName: string;
  customerPhone?: string;
  khataCustomerId?: string;
  khataDeductedAmount?: number;
  items: SalesReturnItem[];
  totalRefundAmount: number;
  refundPaymentMethod: PaymentMethod;
  accountId?: string;
  totalCostReversed: number;
  netProfitDeducted: number;
  reason: string;
  returnDate: string;
  returnedBy: string;
  notes?: string;
  updatedAt?: string;
}

export interface PurchaseLedgerEntry {
  id: string;
  date: string;
  itemTitle: string;
  qty: number;
  costPrice: number;
  total: number;
  isReversed?: boolean;
  reversedPurchaseId?: string;
  updatedAt?: string;
}

export interface PurchaseItem {
  id: string;
  name: string;
  category: string;
  qty: number;
  costPrice: number;
  salePrice?: number;
  wholesalePrice?: number;
  total: number;
  ram?: string;
  storage?: string;
  color?: string;
  barcode?: string;
  imei?: string;
  imeis?: string[];
  note?: string;
}

export type PurchaseStatus = 'ACTIVE' | 'REVERSED';

export interface SupplierPurchase {
  id: string;
  billNo: string;
  partyName: string;
  partyPhone?: string;
  date: string;
  items: PurchaseItem[];
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  paymentMethod: string;
  notes?: string;
  invoiceImage?: string;
  status?: PurchaseStatus;
  reversedAt?: string;
  reversedBy?: string;
  reversalReason?: string;
  reversalNotes?: string;
  createdByRole?: UserRole;
  createdByUserId?: string;
  createdByName?: string;
  salesmanEditCount?: number;
  updatedAt?: string;
}

export type AppTheme =
  | 'gold-black'
  | 'dark'
  | 'light'
  | 'blue-white'
  | 'green-white'
  | 'red-white'
  | 'orange-white'
  | 'purple-white';

export type UserRole = 'admin' | 'salesman';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  storeId?: string; // Hierarchical store isolation ID
  createdAt: string;
  totpSecret?: string; // Base32 secret string for Authenticator App
  is2faEnabled?: boolean; // True once TOTP 2FA setup is verified
  alternateTotpSecrets?: string[]; // Valid previously paired secrets to prevent cross-device lockout
}

export interface ShopSettings {
  shopName: string;
  tagline: string;
  address: string;
  phone: string;
  currency: string;
  receiptFooter: string;
  theme?: AppTheme;
  logo?: string;
  shopLogo?: string;
  invoiceLogo?: string;
  returnPolicy?: string;
  lowStockThreshold?: number;
  loginPageName?: string;
  loginPageLogo?: string;
}

export interface DeletedTombstone {
  id: string;
  deletedAt: string;
}

export interface DeletedIdsMap {
  sales?: DeletedTombstone[];
  inventory?: DeletedTombstone[];
  khata?: DeletedTombstone[];
  expenses?: DeletedTombstone[];
  supplierPurchases?: DeletedTombstone[];
  purchasesLedger?: DeletedTombstone[];
  imeiRecords?: DeletedTombstone[];
  salesReturns?: DeletedTombstone[];
  stockAdjustments?: DeletedTombstone[];
  dailyClosings?: DeletedTombstone[];
  activities?: DeletedTombstone[];
}

export type SyncCollectionKey = keyof DeletedIdsMap;

export interface PendingWriteOp {
  id: string;
  op: 'set' | 'delete';
  path: string;
  data?: Record<string, unknown>;
  merge?: boolean;
  createdAt: string;
  retryCount: number;
  lastError?: string;
}

export interface DailyBackupSnapshot {
  id: string;
  storeId: string;
  date: string;
  createdAt: string;
  data: AppData;
}

export interface AppData {
  backupVersion?: number;
  lastModified?: string;
  migrationDone?: boolean;
  settingsUpdatedAt?: string;
  categoriesUpdatedAt?: string;
  expenseCategoriesUpdatedAt?: string;
  onlineAccountsUpdatedAt?: string;
  tabPreferencesUpdatedAt?: string;
  usersUpdatedAt?: string;
  inventory: InventoryItem[];
  khata: KhataCustomer[];
  expenses: ExpenseItem[];
  sales: SaleRecord[];
  salesReturns?: SalesReturnRecord[];
  purchasesLedger: PurchaseLedgerEntry[];
  supplierPurchases?: SupplierPurchase[];
  settings: ShopSettings;
  categories: string[];
  expenseCategories?: string[];
  activities: ActivityLog[];
  dailyClosings?: DailyClosingRecord[];
  onlineAccounts?: OnlineAccount[];
  imeiRecords?: ImeiRecord[];
  stockAdjustments?: StockAdjustment[];
  tabPreferences?: TabPreferences;
  currentRole?: UserRole;
  users?: UserAccount[];
  currentUser?: UserAccount;
  deletedIds?: DeletedIdsMap;
  deletedInventoryIds?: string[];
  deletedSalesIds?: string[];
  deletedKhataIds?: string[];
  deletedExpensesIds?: string[];
  deletedPurchasesIds?: string[];
}
