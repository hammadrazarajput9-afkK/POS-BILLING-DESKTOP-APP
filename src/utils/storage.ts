import { AppData, OnlineAccount, DailyClosingRecord, ShopSettings, SupplierPurchase } from '../types';
import { saveAppDataToDB, loadAppDataFromDB } from './db';

export const STORAGE_KEY = 'MOBILE_POS_PRO_DATA_V2';

export const defaultSettings: ShopSettings = {
  shopName: 'Mobile Shop Pro',
  tagline: 'VIP Mobile Sales & Repair Suite',
  address: 'Shop # 12, Main Mobile Market, Lahore',
  phone: '0300-1234567',
  currency: 'Rs.',
  receiptFooter: 'Warranty void if sticker is damaged. Thank you for your business!',
  theme: 'blue-white',
};

export const defaultCategories: string[] = [
  'Android Mobile',
  'Keypad Mobile',
  'Used Mobile (Second Hand)',
  'Chargers & Cables',
  'Airpods & Handsfree',
  'Power Banks',
  'Protector & Back Covers',
  'Spare Parts & Displays',
];

export const defaultExpenseCategories: string[] = [
  'Shop Rent',
  'Electricity & Utility Bills',
  'Staff Salary & Tea',
  'Refreshment & Food',
  'Transportation & Cargo',
  'Packaging & Printing',
  'Maintenance & Repairs',
  'Miscellaneous & Others',
];

export const defaultOnlineAccounts: OnlineAccount[] = [
  { id: 'OA-1', name: 'JazzCash Counter', accountNumber: '0300-1234567', accountTitle: 'Muhammad Ahmad', bankType: 'JazzCash' },
  { id: 'OA-2', name: 'Easypaisa Business', accountNumber: '0345-9876543', accountTitle: 'Muhammad Ahmad', bankType: 'Easypaisa' },
  { id: 'OA-3', name: 'Meezan Bank Current', accountNumber: '0281-0105892101', accountTitle: 'Mobile Pro Shop', bankType: 'Meezan Bank' },
];

export const sampleDailyClosings: DailyClosingRecord[] = [
  {
    id: 'DCL-SAMPLE-1',
    date: new Date(Date.now() - 1 * 86400000).toISOString().substring(0, 10),
    time: '22:30',
    denominations: {
      '5000': 15,
      '1000': 42,
      '500': 30,
      '100': 85,
      '50': 40,
      '20': 50,
      '10': 30,
    },
    coins: 450,
    totalCash: 143950,
    onlineBalances: [
      { accountId: 'OA-1', accountName: 'JazzCash Counter', balance: 48500 },
      { accountId: 'OA-2', accountName: 'Easypaisa Business', balance: 32000 },
      { accountId: 'OA-3', accountName: 'Meezan Bank Current', balance: 185000 },
    ],
    totalOnline: 265500,
    grandTotal: 409450,
    expectedCash: 143950,
    difference: 0,
    closedBy: 'Hammad Raza',
    notes: 'All physical cash notes and digital accounts matched counter closing register.',
  },
];

export const sampleSupplierPurchases: SupplierPurchase[] = [
  {
    id: 'PUR-001',
    billNo: 'HZ-8921',
    partyName: 'Hafeez Center Mobile Wholesale',
    partyPhone: '0321-4455667',
    date: new Date(Date.now() - 3 * 86400000).toISOString().substring(0, 10),
    items: [
      {
        id: 'PI-1',
        name: 'Samsung Galaxy A54 (8GB/128GB)',
        category: 'Android Mobile',
        qty: 4,
        costPrice: 78000,
        salePrice: 86500,
        total: 312000,
        imeis: ['354892019482710', '354892019482711', '354892019482712', '354892019482713'],
      },
      {
        id: 'PI-2',
        name: 'Nokia 105 4G Keypad Phone',
        category: 'Keypad Mobile',
        qty: 5,
        costPrice: 4200,
        salePrice: 5200,
        total: 21000,
        imeis: ['864201948273911', '864201948273912'],
      }
    ],
    totalAmount: 333000,
    paidAmount: 250000,
    balanceDue: 83000,
    paymentMethod: 'Bank Transfer',
    notes: 'Received via Cargo Hall Road. Balance due in 7 days.',
  },
  {
    id: 'PUR-002',
    billNo: 'PAK-4102',
    partyName: 'Al-Rehman Telecom Traders',
    partyPhone: '0300-8899112',
    date: new Date(Date.now() - 1 * 86400000).toISOString().substring(0, 10),
    items: [
      {
        id: 'PI-3',
        name: 'Super Fast 65W GaN Charger',
        category: 'Chargers & Cables',
        qty: 20,
        costPrice: 1800,
        salePrice: 2800,
        total: 36000,
      },
      {
        id: 'PI-4',
        name: 'Pro ANC Wireless Earbuds',
        category: 'Airpods & Handsfree',
        qty: 10,
        costPrice: 3200,
        salePrice: 4800,
        total: 32000,
      }
    ],
    totalAmount: 68000,
    paidAmount: 68000,
    balanceDue: 0,
    paymentMethod: 'Cash',
    notes: 'Cash payment on delivery. Stock added to shop.',
  }
];

export const initialCleanData: AppData = {
  inventory: [],
  repairs: [],
  khata: [],
  expenses: [],
  sales: [],
  purchasesLedger: [],
  supplierPurchases: [],
  settings: defaultSettings,
  categories: defaultCategories,
  expenseCategories: defaultExpenseCategories,
  activities: [],
  onlineAccounts: defaultOnlineAccounts,
  dailyClosings: [],
  tabPreferences: {},
  currentRole: 'admin',
};

export const sampleSeedData: AppData = {
  settings: defaultSettings,
  categories: defaultCategories,
  expenseCategories: defaultExpenseCategories,
  inventory: [
    {
      id: 'STK-101',
      name: 'Samsung Galaxy A54 (8GB/128GB)',
      category: 'Android Mobile',
      imei: '354892019482710',
      imeis: ['354892019482710', '354892019482711', '354892019482712', '354892019482713'],
      costPrice: 78000,
      salePrice: 86500,
      qty: 4,
      createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    },
    {
      id: 'STK-102',
      name: 'Nokia 105 4G Keypad Phone',
      category: 'Keypad Mobile',
      imei: '864201948273911',
      imeis: ['864201948273911', '864201948273912'],
      costPrice: 4200,
      salePrice: 5200,
      qty: 2,
      createdAt: new Date(Date.now() - 4 * 86400000).toISOString(),
    },
  ],
  repairs: [
    {
      id: 'REP-201',
      ticketNo: '4821',
      custName: 'Hassan Tariq',
      custPhone: '0301-4455667',
      device: 'iPhone 12 Pro',
      problem: 'Glass replacement & Battery service',
      cost: 14500,
      advancePaid: 3000,
      status: 'In-Progress',
      date: new Date(Date.now() - 1 * 86400000).toISOString(),
      technicianNotes: 'Screen replaced. Waiting for battery calibration test.',
    },
  ],
  khata: [
    {
      id: 'KHT-301',
      name: 'Usman Ali (Shop Dealer)',
      phone: '0321-9988776',
      phone2: '0300-8877665',
      address: 'Shop # 18, Hall Road, Lahore',
      balance: 14000,
      lastUpdated: new Date(Date.now() - 2 * 86400000).toISOString(),
      history: [
        {
          id: 'TX-1',
          date: new Date(Date.now() - 4 * 86400000).toISOString(),
          type: 'credit',
          amount: 24000,
          note: 'Purchased 2 Units Keypad Phone on credit',
        },
        {
          id: 'TX-2',
          date: new Date(Date.now() - 2 * 86400000).toISOString(),
          type: 'payment',
          amount: 10000,
          note: 'Bank transfer received',
        },
      ],
    },
  ],
  expenses: [
    {
      id: 'EXP-401',
      description: 'Monthly Shop Rent',
      category: 'Shop Rent',
      amount: 45000,
      date: new Date(Date.now() - 3 * 86400000).toISOString(),
      paymentMethod: 'Bank Transfer',
    },
    {
      id: 'EXP-402',
      description: 'Counter Staff Tea & Water',
      category: 'Staff Salary & Tea',
      amount: 450,
      date: new Date().toISOString(),
      paymentMethod: 'Cash',
    },
  ],
  sales: [
    {
      invNo: '948201',
      custName: 'Kamran Akmal',
      custPhone: '0312-5566778',
      invoiceType: 'cash',
      amountPaid: 86500,
      amountDue: 0,
      items: [
        {
          id: 'STK-101',
          name: 'Samsung Galaxy A54 (8GB/128GB)',
          category: 'Android Mobile',
          imei: '354892019482710',
          salePrice: 86500,
          costPrice: 78000,
          qty: 1,
        },
      ],
      subtotal: 86500,
      discount: 0,
      grandTotal: 86500,
      totalCost: 78000,
      netProfit: 8500,
      paymentMethod: 'Cash',
      date: new Date(Date.now() - 1 * 86400000).toISOString(),
    },
  ],
  purchasesLedger: [
    {
      id: 'PL-501',
      date: new Date(Date.now() - 5 * 86400000).toISOString(),
      itemTitle: 'Samsung Galaxy A54 (8GB/128GB)',
      qty: 5,
      costPrice: 78000,
      total: 390000,
    },
    {
      id: 'PL-502',
      date: new Date(Date.now() - 4 * 86400000).toISOString(),
      itemTitle: 'Nokia 105 4G Keypad Phone',
      qty: 4,
      costPrice: 4200,
      total: 16800,
    },
  ],
  supplierPurchases: sampleSupplierPurchases,
  onlineAccounts: defaultOnlineAccounts,
  dailyClosings: sampleDailyClosings,
  currentRole: 'admin',
  activities: [
    {
      id: 'ACT-1',
      timestamp: new Date().toISOString(),
      title: 'POS Invoice #948201 Completed',
      details: 'Total: Rs. 86,500 | Items: 1 | Customer: Kamran Akmal',
      category: 'Sale',
      type: 'sale',
    },
  ],
};

export function loadStoredData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return sampleSeedData;
    }
    const parsed = JSON.parse(raw);
    const existingCats: string[] =
      Array.isArray(parsed.categories) && parsed.categories.length > 0
        ? parsed.categories
        : defaultCategories;

    const existingExpenseCats: string[] =
      Array.isArray(parsed.expenseCategories) && parsed.expenseCategories.length > 0
        ? parsed.expenseCategories
        : defaultExpenseCategories;

    // Strict 24-hour auto-purge for activity log:
    // Only keep activities from the last 24 hours, so daily log resets automatically!
    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
    const rawActivities = Array.isArray(parsed.activities)
      ? parsed.activities
      : (sampleSeedData.activities || []);
    const validActivities = rawActivities.filter(
      (act: any) => new Date(act.timestamp).getTime() >= twentyFourHoursAgo
    );

    return {
      inventory: parsed.inventory || [],
      repairs: parsed.repairs || [],
      khata: parsed.khata || [],
      expenses: parsed.expenses || [],
      sales: parsed.sales || [],
      purchasesLedger: parsed.purchasesLedger || [],
      supplierPurchases: Array.isArray(parsed.supplierPurchases) && parsed.supplierPurchases.length > 0
        ? parsed.supplierPurchases
        : sampleSupplierPurchases,
      settings: { ...defaultSettings, ...(parsed.settings || {}) },
      categories: existingCats,
      expenseCategories: existingExpenseCats,
      activities: validActivities,
      onlineAccounts:
        Array.isArray(parsed.onlineAccounts) && parsed.onlineAccounts.length > 0
          ? parsed.onlineAccounts
          : defaultOnlineAccounts,
      dailyClosings: Array.isArray(parsed.dailyClosings)
        ? parsed.dailyClosings
        : sampleDailyClosings,
      tabPreferences: parsed.tabPreferences || {},
      currentRole: parsed.currentRole || 'admin',
    };
  } catch (error) {
    console.error('Failed to parse stored data:', error);
    return sampleSeedData;
  }
}

export function saveStoredData(data: AppData): void {
  // 1. Asynchronously persist to high-capacity IndexedDB (>50MB, handles all base64 photos/receipts)
  saveAppDataToDB(data).catch(err => console.error('IndexedDB async save failed:', err));

  // 2. Synchronous fallback to localStorage with quota overflow protection
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn('LocalStorage quota limit reached or unavailable; IndexedDB primary storage used:', error);
  }
}

/**
 * Initializes and reconciles state from IndexedDB on startup.
 * If IndexedDB already holds user data, it invokes onDataLoaded callback.
 * If IndexedDB is empty, it migrates existing localStorage data into IndexedDB.
 */
export async function initializeIndexedDB(onDataLoaded: (data: AppData) => void): Promise<void> {
  try {
    const idbData = await loadAppDataFromDB();
    if (idbData && idbData.inventory) {
      onDataLoaded(idbData);
    } else {
      // Migrate initial data into IndexedDB
      const current = loadStoredData();
      await saveAppDataToDB(current);
    }
  } catch (err) {
    console.error('Error synchronizing with IndexedDB:', err);
  }
}

