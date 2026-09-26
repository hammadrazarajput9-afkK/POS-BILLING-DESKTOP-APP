export type ItemCategory = string;

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
  qty: number;
  createdAt: string;
}

export type RepairStatus = 'Pending' | 'In-Progress' | 'Ready' | 'Delivered';

export interface RepairTicket {
  id: string;
  ticketNo: string;
  custName: string;
  custPhone: string;
  device: string;
  problem: string;
  cost: number;
  advancePaid?: number;
  status: RepairStatus;
  date: string;
  technicianNotes?: string;
}

export interface KhataTransaction {
  id: string;
  date: string;
  type: 'credit' | 'payment';
  amount: number;
  note?: string;
}

export interface KhataCustomer {
  id: string;
  name: string;
  phone: string;
  phone2?: string;
  address?: string;
  image?: string;
  balance: number;
  lastUpdated: string;
  history: KhataTransaction[];
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  title: string;
  details: string;
  category: 'Sale' | 'Inventory' | 'Khata' | 'Expense' | 'Category' | 'Settings' | 'Purchase';
  type?: 'create' | 'update' | 'delete' | 'sale' | 'payment';
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
}

export interface OnlineAccount {
  id: string;
  name: string;
  accountNumber?: string;
  accountTitle?: string;
  bankType?: string;
}

export interface DailyClosingRecord {
  id: string;
  date: string;
  time: string;
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
  difference?: number;
  closedBy?: string;
  notes?: string;
}

export interface TabPreferences {
  [tabId: string]: Record<string, any>;
}

export interface CartItem extends InventoryItem {
  cartQty: number;
}

export type PaymentMethod = 'Cash' | 'JazzCash' | 'Easypaisa' | 'Bank' | 'Card';

export type InvoiceType = 'cash' | 'credit';

export interface SaleRecord {
  invNo: string;
  custName: string;
  custPhone?: string;
  invoiceType?: InvoiceType;
  amountPaid?: number;
  amountDue?: number;
  khataCustomerId?: string;
  items: {
    id: string;
    name: string;
    category: ItemCategory;
    imei?: string;
    salePrice: number;
    costPrice: number;
    qty: number;
  }[];
  subtotal: number;
  discount: number;
  grandTotal: number;
  totalCost: number;
  netProfit: number;
  paymentMethod: PaymentMethod;
  date: string;
}

export interface PurchaseLedgerEntry {
  id: string;
  date: string;
  itemTitle: string;
  qty: number;
  costPrice: number;
  total: number;
}

export interface PurchaseItem {
  id: string;
  name: string;
  category: string;
  qty: number;
  costPrice: number;
  salePrice?: number;
  total: number;
  barcode?: string;
  imei?: string;
  imeis?: string[];
}

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
}

export type AppTheme =
  | 'dark'
  | 'light'
  | 'blue-white'
  | 'green-white'
  | 'red-white'
  | 'orange-white'
  | 'purple-white';

export type UserRole = 'admin' | 'salesman';

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
  returnPolicy?: string;
  lowStockThreshold?: number;
}

export interface AppData {
  inventory: InventoryItem[];
  repairs: RepairTicket[];
  khata: KhataCustomer[];
  expenses: ExpenseItem[];
  sales: SaleRecord[];
  purchasesLedger: PurchaseLedgerEntry[];
  supplierPurchases?: SupplierPurchase[];
  settings: ShopSettings;
  categories: string[];
  expenseCategories?: string[];
  activities: ActivityLog[];
  dailyClosings?: DailyClosingRecord[];
  onlineAccounts?: OnlineAccount[];
  tabPreferences?: TabPreferences;
  currentRole?: UserRole;
}
