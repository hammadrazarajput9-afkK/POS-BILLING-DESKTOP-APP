import React, { useState, useEffect } from 'react';
import {
  AppData,
  InventoryItem,
  KhataCustomer,
  SaleRecord,
  ShopSettings,
  ActivityLog,
  ExpenseItem,
  DailyClosingRecord,
  OnlineAccount,
  SupplierPurchase
} from './types';
import { loadStoredData, saveStoredData, defaultExpenseCategories, initializeIndexedDB } from './utils/storage';
import { ToastProvider, useToast } from './components/Toast';
import { FormDraftProvider } from './context/FormDraftContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { DashboardTab } from './components/DashboardTab';
import { PosTab } from './components/PosTab';
import { InventoryTab } from './components/InventoryTab';
import { PurchasesTab } from './components/PurchasesTab';
import { BarcodeGenerator } from './components/BarcodeGenerator';
import { KhataTab } from './components/KhataTab';
import { ExpensesTab } from './components/ExpensesTab';
import { ReportsTab } from './components/ReportsTab';
import { ActivityCenterTab } from './components/ActivityCenterTab';
import { ReceiptModal } from './components/ReceiptModal';
import { StockModal } from './components/StockModal';
import { AddKhataModal, SettleKhataModal } from './components/KhataModal';
import { ExpenseModal } from './components/ExpenseModal';
import { ExpenseCategoryModal } from './components/ExpenseCategoryModal';
import { SettingsModal } from './components/SettingsModal';
import { DailyClosingTab } from './components/DailyClosingTab';
import { TabSettingsModal } from './components/TabSettingsModal';
import { PdfExportModal } from './components/PdfExportModal';

function AppContent() {
  const [data, setData] = useState<AppData>(() => loadStoredData());
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(true);

  // PDF Export Modal state
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfModalTab, setPdfModalTab] = useState<'sales' | 'inventory' | 'khata' | 'expenses' | 'activity' | 'dailyClosing'>('sales');

  const handleOpenPdfReport = (tab: 'sales' | 'inventory' | 'khata' | 'expenses' | 'activity' | 'dailyClosing') => {
    setPdfModalTab(tab);
    setPdfModalOpen(true);
  };

  // Reconcile high-capacity IndexedDB data on mount
  useEffect(() => {
    initializeIndexedDB(updatedData => {
      setData(updatedData);
    });
  }, []);

  // Modals state
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [editStockItem, setEditStockItem] = useState<InventoryItem | null>(null);

  const [addKhataModalOpen, setAddKhataModalOpen] = useState(false);
  const [settleKhataModalOpen, setSettleKhataModalOpen] = useState(false);
  const [settleCustomer, setSettleCustomer] = useState<KhataCustomer | null>(null);
  const [selectedKhataCustomerId, setSelectedKhataCustomerId] = useState<string | null>(null);

  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expenseCategoryModalOpen, setExpenseCategoryModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [tabSettingsModalOpen, setTabSettingsModalOpen] = useState(false);

  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [activeReceiptSale, setActiveReceiptSale] = useState<SaleRecord | null>(null);

  const { showToast } = useToast();

  // Apply theme to document root
  useEffect(() => {
    const activeTheme = data.settings?.theme || 'blue-white';
    document.documentElement.setAttribute('data-theme', activeTheme);
  }, [data.settings?.theme]);

  // Sync to local storage
  useEffect(() => {
    saveStoredData(data);
  }, [data]);

  // Centralized Activity Logger
  const logActivity = (
    category: ActivityLog['category'],
    title: string,
    details: string
  ) => {
    const newActivity: ActivityLog = {
      id: 'ACT-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      timestamp: new Date().toISOString(),
      category,
      title,
      details,
    };

    setData(prev => ({
      ...prev,
      activities: [newActivity, ...(prev.activities || [])].slice(0, 500),
    }));
  };

  // Inventory handlers
  const handleSaveStock = (
    itemData: Omit<InventoryItem, 'id' | 'createdAt'>,
    existingId?: string
  ) => {
    if (existingId) {
      setData(prev => {
        const updated = prev.inventory.map(item =>
          item.id === existingId ? { ...item, ...itemData } : item
        );
        return {
          ...prev,
          inventory: updated,
        };
      });

      logActivity(
        'Inventory',
        `Updated Product: ${itemData.name}`,
        `Category: ${itemData.category}, Qty: ${itemData.qty}, Sale: ${data.settings.currency} ${itemData.salePrice}`
      );
    } else {
      const newItem: InventoryItem = {
        ...itemData,
        id: 'STK-' + Date.now(),
        createdAt: new Date().toISOString(),
      };

      setData(prev => ({
        ...prev,
        inventory: [newItem, ...prev.inventory],
        purchasesLedger: [
          {
            id: 'PL-' + Date.now(),
            date: new Date().toISOString(),
            itemTitle: newItem.name,
            qty: newItem.qty,
            costPrice: newItem.costPrice,
            total: newItem.costPrice * newItem.qty,
          },
          ...prev.purchasesLedger,
        ],
      }));

      logActivity(
        'Inventory',
        `Added New Product: ${newItem.name}`,
        `Stock: ${newItem.qty} units @ Cost ${data.settings.currency} ${newItem.costPrice}, Sale ${data.settings.currency} ${newItem.salePrice}`
      );
    }
  };

  const handleDeleteInventory = (id: string) => {
    const targetItem = data.inventory.find(i => i.id === id);
    setData(prev => ({
      ...prev,
      inventory: prev.inventory.filter(i => i.id !== id),
    }));

    if (targetItem) {
      logActivity(
        'Inventory',
        `Deleted Product: ${targetItem.name}`,
        `Category: ${targetItem.category}, Last Qty: ${targetItem.qty}`
      );
    }
  };

  // Inventory Category handlers
  const handleAddCategory = (categoryName: string) => {
    const trimmed = categoryName.trim();
    if (!trimmed) return;
    setData(prev => {
      const currentCats = prev.categories || ['Android Mobile', 'Keypad Mobile'];
      if (currentCats.some(c => c.toLowerCase() === trimmed.toLowerCase())) return prev;
      return {
        ...prev,
        categories: [...currentCats, trimmed],
      };
    });

    logActivity('Category', `Created Category: ${trimmed}`, 'New product category registered');
  };

  const handleDeleteCategory = (categoryName: string): boolean => {
    const trimmed = categoryName.trim();
    const hasProducts = data.inventory.some(
      item => item.category.toLowerCase() === trimmed.toLowerCase()
    );

    if (hasProducts) {
      showToast(
        `Cannot delete "${trimmed}": Category has active products in inventory!`,
        'error'
      );
      return false;
    }

    setData(prev => ({
      ...prev,
      categories: (prev.categories || []).filter(
        c => c.toLowerCase() !== trimmed.toLowerCase()
      ),
    }));

    logActivity(
      'Category',
      `Deleted Category: ${trimmed}`,
      'Category deleted safely'
    );
    showToast(`Category "${trimmed}" removed successfully`, 'success');
    return true;
  };

  // Expense Category Handlers (Manage Categories feature for Expenses)
  const handleAddExpenseCategory = (categoryName: string) => {
    const trimmed = categoryName.trim();
    if (!trimmed) return;
    setData(prev => {
      const currentCats = prev.expenseCategories || defaultExpenseCategories;
      if (currentCats.some(c => c.toLowerCase() === trimmed.toLowerCase())) return prev;
      return {
        ...prev,
        expenseCategories: [...currentCats, trimmed],
      };
    });

    logActivity('Expense', `Created Expense Category: ${trimmed}`, 'New expense category registered');
  };

  const handleDeleteExpenseCategory = (categoryName: string): boolean => {
    const trimmed = categoryName.trim();
    const hasExpenses = data.expenses.some(
      e => e.category.toLowerCase() === trimmed.toLowerCase()
    );

    if (hasExpenses) {
      showToast(
        `Cannot delete "${trimmed}": Category has active expenses!`,
        'error'
      );
      return false;
    }

    setData(prev => ({
      ...prev,
      expenseCategories: (prev.expenseCategories || defaultExpenseCategories).filter(
        c => c.toLowerCase() !== trimmed.toLowerCase()
      ),
    }));

    logActivity(
      'Expense',
      `Deleted Expense Category: ${trimmed}`,
      'Expense category deleted safely'
    );
    showToast(`Category "${trimmed}" removed successfully`, 'success');
    return true;
  };

  // Khata handlers
  const handleAddKhataCustomer = (customerData: {
    name: string;
    phone: string;
    phone2?: string;
    address?: string;
    image?: string;
  }) => {
    const newCustomer: KhataCustomer = {
      id: 'KHT-' + Date.now(),
      name: customerData.name,
      phone: customerData.phone,
      phone2: customerData.phone2,
      address: customerData.address,
      image: customerData.image,
      balance: 0,
      lastUpdated: new Date().toISOString(),
      history: [],
    };

    setData(prev => ({
      ...prev,
      khata: [newCustomer, ...prev.khata],
    }));

    logActivity(
      'Khata',
      `Created Customer Account: ${newCustomer.name}`,
      `Phone: ${newCustomer.phone}${newCustomer.phone2 ? ` / ${newCustomer.phone2}` : ''}`
    );

    showToast(`Customer account opened for "${newCustomer.name}"`, 'success');
    setActiveTab('khata');
    setSelectedKhataCustomerId(newCustomer.id);
  };

  const handleUpdateKhataBalance = (
    customerId: string,
    type: 'credit' | 'payment',
    amount: number,
    note?: string
  ) => {
    const targetCust = data.khata.find(c => c.id === customerId);

    setData(prev => ({
      ...prev,
      khata: prev.khata.map(c => {
        if (c.id === customerId) {
          const newBalance =
            type === 'payment' ? Math.max(0, c.balance - amount) : c.balance + amount;
          const newTx = {
            id: 'TX-' + Date.now(),
            date: new Date().toISOString(),
            type,
            amount,
            note,
          };
          return {
            ...c,
            balance: newBalance,
            lastUpdated: new Date().toISOString(),
            history: [newTx, ...c.history],
          };
        }
        return c;
      }),
    }));

    if (targetCust) {
      logActivity(
        'Khata',
        type === 'credit'
          ? `Credit Given: ${data.settings.currency} ${amount.toLocaleString()}`
          : `Payment Received: ${data.settings.currency} ${amount.toLocaleString()}`,
        `Customer: ${targetCust.name} (${targetCust.phone})${note ? ` | Note: ${note}` : ''}`
      );
    }
  };

  const handleDeleteKhataCustomer = (id: string) => {
    const targetCust = data.khata.find(c => c.id === id);
    setData(prev => ({
      ...prev,
      khata: prev.khata.filter(c => c.id !== id),
    }));

    if (targetCust) {
      logActivity(
        'Khata',
        `Deleted Customer Account: ${targetCust.name}`,
        `Removed balance: ${data.settings.currency} ${targetCust.balance}`
      );
    }
  };

  // Expenses handlers
  const handleSaveExpense = (expenseData: {
    description: string;
    category: any;
    amount: number;
    date: string;
    image?: string;
    paymentMethod?: string;
  }) => {
    const newExp: ExpenseItem = {
      id: 'EXP-' + Date.now(),
      ...expenseData,
    };

    setData(prev => ({
      ...prev,
      expenses: [newExp, ...prev.expenses],
    }));

    logActivity(
      'Expense',
      `Recorded Expense: ${expenseData.description}`,
      `${data.settings.currency} ${expenseData.amount.toLocaleString()} [${expenseData.category}]${expenseData.paymentMethod ? ` via ${expenseData.paymentMethod}` : ''}`
    );
  };

  const handleDeleteExpense = (id: string) => {
    const targetExp = data.expenses.find(e => e.id === id);
    setData(prev => ({
      ...prev,
      expenses: prev.expenses.filter(e => e.id !== id),
    }));

    if (targetExp) {
      logActivity(
        'Expense',
        `Deleted Expense: ${targetExp.description}`,
        `Amount: ${data.settings.currency} ${targetExp.amount}`
      );
    }
  };

  // Daily Closing & Digital Accounts Handlers
  const handleSaveDailyClosing = (record: Omit<DailyClosingRecord, 'id'>) => {
    setData(prev => {
      const existingIndex = (prev.dailyClosings || []).findIndex(r => r.date === record.date);
      if (existingIndex >= 0) {
        const updatedClosings = [...(prev.dailyClosings || [])];
        updatedClosings[existingIndex] = {
          ...updatedClosings[existingIndex],
          ...record,
        };
        return {
          ...prev,
          dailyClosings: updatedClosings,
        };
      } else {
        const newRecord: DailyClosingRecord = {
          id: 'DCL-' + Date.now(),
          ...record,
        };
        return {
          ...prev,
          dailyClosings: [newRecord, ...(prev.dailyClosings || [])],
        };
      }
    });
  };

  const handleDeleteDailyClosing = (id: string) => {
    setData(prev => ({
      ...prev,
      dailyClosings: (prev.dailyClosings || []).filter(r => r.id !== id),
    }));
  };

  const handleAddOnlineAccount = (acc: Omit<OnlineAccount, 'id'>) => {
    const newAccount: OnlineAccount = {
      id: 'OA-' + Date.now(),
      ...acc,
    };

    setData(prev => ({
      ...prev,
      onlineAccounts: [...(prev.onlineAccounts || []), newAccount],
    }));

    logActivity(
      'Settings',
      `Added Online Account: ${acc.name}`,
      `Type: ${acc.bankType || 'Wallet'}${acc.accountNumber ? ` (${acc.accountNumber})` : ''}`
    );
  };

  const handleDeleteOnlineAccount = (id: string) => {
    const acc = (data.onlineAccounts || []).find(a => a.id === id);
    setData(prev => ({
      ...prev,
      onlineAccounts: (prev.onlineAccounts || []).filter(a => a.id !== id),
    }));

    if (acc) {
      logActivity('Settings', `Deleted Online Account: ${acc.name}`, 'Account removed from daily closing');
    }
  };

  const handleSaveTabPreferences = (tabId: string, prefs: Record<string, any>) => {
    setData(prev => ({
      ...prev,
      tabPreferences: {
        ...(prev.tabPreferences || {}),
        [tabId]: prefs,
      },
    }));
  };

  // Sale Checkout Handler with Cash vs Credit Support
  const handleCompleteSale = (sale: SaleRecord) => {
    // 1. Deduct stock from inventory
    // 2. If credit sale with due balance, update customer Khata ledger automatically!
    setData(prev => {
      const updatedInventory = prev.inventory.map(invItem => {
        const soldItem = sale.items.find(s => s.id === invItem.id);
        if (soldItem) {
          return {
            ...invItem,
            qty: Math.max(0, invItem.qty - soldItem.qty),
          };
        }
        return invItem;
      });

      let updatedKhata = prev.khata;
      if (sale.invoiceType === 'credit' && sale.amountDue && sale.amountDue > 0) {
        let matched = false;
        updatedKhata = prev.khata.map(c => {
          const isTarget = sale.khataCustomerId
            ? c.id === sale.khataCustomerId
            : c.name.toLowerCase() === (sale.custName || '').toLowerCase();

          if (isTarget) {
            matched = true;
            return {
              ...c,
              balance: c.balance + sale.amountDue!,
              lastUpdated: new Date().toISOString(),
              history: [
                {
                  id: 'TX-' + Date.now(),
                  date: new Date().toISOString(),
                  type: 'credit' as const,
                  amount: sale.amountDue!,
                  note: `Invoice #${sale.invNo} (${sale.items.length} items)`,
                },
                ...c.history,
              ],
            };
          }
          return c;
        });

        // If no matching customer was found in Khata, create one automatically
        if (!matched && sale.custName && sale.custName !== 'Walk-in Customer') {
          const newCust: KhataCustomer = {
            id: 'KHT-' + Date.now(),
            name: sale.custName,
            phone: sale.custPhone || 'N/A',
            balance: sale.amountDue!,
            lastUpdated: new Date().toISOString(),
            history: [
              {
                id: 'TX-' + Date.now(),
                date: new Date().toISOString(),
                type: 'credit',
                amount: sale.amountDue!,
                note: `Invoice #${sale.invNo}`,
              },
            ],
          };
          updatedKhata = [newCust, ...updatedKhata];
        }
      }

      return {
        ...prev,
        inventory: updatedInventory,
        khata: updatedKhata,
        sales: [sale, ...prev.sales],
      };
    });

    logActivity(
      'Sale',
      `${sale.invoiceType === 'credit' ? 'Credit' : 'Cash'} Invoice #${sale.invNo} Completed`,
      `Total: ${data.settings.currency} ${sale.grandTotal.toLocaleString()} | Items: ${sale.items.length} | Customer: ${sale.custName || 'Walk-in'}${sale.amountDue ? ` | Due: ${data.settings.currency} ${sale.amountDue.toLocaleString()}` : ''}`
    );

    setActiveReceiptSale(sale);
    setReceiptModalOpen(true);
    showToast(`Sale #${sale.invNo} completed!`, 'success');
  };

  // Activity Center Handlers
  const handleClearActivities = () => {
    setData(prev => ({
      ...prev,
      activities: [],
    }));
  };

  // Supplier Purchases Handlers
  const handleSavePurchase = (
    purchaseData: Omit<SupplierPurchase, 'id'>,
    autoAddToInventory: boolean
  ) => {
    const newPurchaseId = 'PUR-' + Date.now();
    const newPurchase: SupplierPurchase = {
      ...purchaseData,
      id: newPurchaseId,
    };

    setData(prev => {
      let updatedInventory = [...prev.inventory];

      if (autoAddToInventory) {
        newPurchase.items.forEach(purchaseItem => {
          const matchIndex = updatedInventory.findIndex(
            inv =>
              inv.name.trim().toLowerCase() === purchaseItem.name.trim().toLowerCase() ||
              (purchaseItem.barcode && inv.barcode === purchaseItem.barcode)
          );

          if (matchIndex >= 0) {
            const existing = updatedInventory[matchIndex];
            const existingImeis = existing.imeis || (existing.imei ? [existing.imei] : []);
            const newImeis = purchaseItem.imeis || (purchaseItem.imei ? [purchaseItem.imei] : []);
            const combinedImeis = Array.from(new Set([...existingImeis, ...newImeis]));

            updatedInventory[matchIndex] = {
              ...existing,
              qty: existing.qty + purchaseItem.qty,
              costPrice: purchaseItem.costPrice > 0 ? purchaseItem.costPrice : existing.costPrice,
              salePrice: purchaseItem.salePrice && purchaseItem.salePrice > 0 ? purchaseItem.salePrice : existing.salePrice,
              barcode: purchaseItem.barcode || existing.barcode,
              imei: combinedImeis[0] || existing.imei,
              imeis: combinedImeis.length > 0 ? combinedImeis : undefined,
            };
          } else {
            const newItem: InventoryItem = {
              id: 'STK-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
              name: purchaseItem.name,
              category: purchaseItem.category || (prev.categories?.[0] || 'Android Mobile'),
              costPrice: purchaseItem.costPrice,
              salePrice: purchaseItem.salePrice || Math.round(purchaseItem.costPrice * 1.15),
              qty: purchaseItem.qty,
              barcode: purchaseItem.barcode,
              imei: purchaseItem.imei,
              imeis: purchaseItem.imeis,
              createdAt: new Date().toISOString(),
            };
            updatedInventory = [newItem, ...updatedInventory];
          }
        });
      }

      const newLedgerEntries = newPurchase.items.map(item => ({
        id: 'PL-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        date: newPurchase.date,
        itemTitle: `${item.name} (${newPurchase.partyName})`,
        qty: item.qty,
        costPrice: item.costPrice,
        total: item.costPrice * item.qty,
      }));

      return {
        ...prev,
        inventory: updatedInventory,
        supplierPurchases: [newPurchase, ...(prev.supplierPurchases || [])],
        purchasesLedger: [...newLedgerEntries, ...(prev.purchasesLedger || [])],
      };
    });

    logActivity(
      'Purchase',
      `Stock Inward: ${newPurchase.partyName} (Bill #${newPurchase.billNo})`,
      `Total: ${data.settings.currency} ${newPurchase.totalAmount.toLocaleString()} | Paid: ${data.settings.currency} ${newPurchase.paidAmount.toLocaleString()} | Items: ${newPurchase.items.length}`
    );
  };

  const handleDeletePurchase = (id: string) => {
    const target = (data.supplierPurchases || []).find(p => p.id === id);
    setData(prev => ({
      ...prev,
      supplierPurchases: (prev.supplierPurchases || []).filter(p => p.id !== id),
    }));

    if (target) {
      logActivity(
        'Purchase',
        `Deleted Purchase Bill #${target.billNo}`,
        `Supplier: ${target.partyName} | Amount: ${data.settings.currency} ${target.totalAmount.toLocaleString()}`
      );
    }
  };

  // Shop Settings Handler
  const handleSaveSettings = (newSettings: ShopSettings) => {
    setData(prev => ({
      ...prev,
      settings: newSettings,
    }));
    logActivity('Settings', 'Updated Shop Settings', `Shop: ${newSettings.shopName}`);
  };

  const handleReplaceData = (newData: AppData) => {
    setData(newData);
    logActivity('Settings', 'Restored System Backup', 'Database replaced from JSON file');
  };

  // Modal Opener Dispatcher
  const handleOpenModal = (modal: 'stock' | 'khata' | 'expense') => {
    if (modal === 'stock') {
      setEditStockItem(null);
      setStockModalOpen(true);
    } else if (modal === 'khata') {
      setAddKhataModalOpen(true);
    } else if (modal === 'expense') {
      setExpenseModalOpen(true);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-800">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        onOpenSettings={() => setSettingsModalOpen(true)}
        settings={data.settings}
        activityCount={(data.activities || []).length}
      />

      {/* Main Viewport Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header with Menu Toggle */}
        <Header
          activeTab={activeTab}
          isMenuOpen={isMenuOpen}
          onToggleMenu={() => setIsMenuOpen(prev => !prev)}
          onSwitchTab={setActiveTab}
          onOpenModal={handleOpenModal}
          onOpenSettings={() => setSettingsModalOpen(true)}
          onOpenTabSettings={() => setTabSettingsModalOpen(true)}
          settings={data.settings}
        />

        {/* Scrollable Tab Content - Persistent Mounting with CSS visibility */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-7xl mx-auto">
            <div className={activeTab === 'dashboard' ? 'block' : 'hidden'}>
              <DashboardTab
                data={data}
                onSwitchTab={setActiveTab}
                onOpenModal={handleOpenModal}
                onOpenSettings={() => setTabSettingsModalOpen(true)}
              />
            </div>

            <div className={activeTab === 'pos' ? 'block' : 'hidden'}>
              <PosTab
                inventory={data.inventory}
                currency={data.settings.currency}
                categories={data.categories || ['Android Mobile', 'Keypad Mobile']}
                khataCustomers={data.khata || []}
                onCompleteSale={handleCompleteSale}
                onOpenAddStock={() => {
                  setEditStockItem(null);
                  setStockModalOpen(true);
                }}
                onOpenPdfReport={() => handleOpenPdfReport('sales')}
              />
            </div>

            <div className={activeTab === 'inventory' ? 'block' : 'hidden'}>
              <InventoryTab
                inventory={data.inventory}
                currency={data.settings.currency}
                categories={data.categories || ['Android Mobile', 'Keypad Mobile']}
                onOpenAddModal={() => {
                  setEditStockItem(null);
                  setStockModalOpen(true);
                }}
                onOpenEditModal={item => {
                  setEditStockItem(item);
                  setStockModalOpen(true);
                }}
                onDeleteItem={handleDeleteInventory}
                onAddCategory={handleAddCategory}
                onDeleteCategory={handleDeleteCategory}
                onOpenPdfReport={() => handleOpenPdfReport('inventory')}
              />
            </div>

            <div className={activeTab === 'purchases' ? 'block' : 'hidden'}>
              <PurchasesTab
                purchases={data.supplierPurchases || []}
                currency={data.settings.currency}
                categories={data.categories || ['Android Mobile', 'Keypad Mobile']}
                inventory={data.inventory}
                onSavePurchase={handleSavePurchase}
                onDeletePurchase={handleDeletePurchase}
              />
            </div>

            <div className={activeTab === 'barcode' ? 'block' : 'hidden'}>
              <BarcodeGenerator
                inventory={data.inventory}
                settings={data.settings}
              />
            </div>

            <div className={activeTab === 'khata' ? 'block' : 'hidden'}>
              <KhataTab
                khata={data.khata}
                settings={data.settings}
                onOpenAddModal={() => setAddKhataModalOpen(true)}
                onOpenSettleModal={cust => {
                  setSettleCustomer(cust);
                  setSettleKhataModalOpen(true);
                }}
                onDeleteCustomer={handleDeleteKhataCustomer}
                onAddTransaction={handleUpdateKhataBalance}
                selectedCustomerId={selectedKhataCustomerId}
                onClearSelectedCustomer={() => setSelectedKhataCustomerId(null)}
                onOpenPdfReport={() => handleOpenPdfReport('khata')}
              />
            </div>

            <div className={activeTab === 'expenses' ? 'block' : 'hidden'}>
              <ExpensesTab
                expenses={data.expenses}
                currency={data.settings.currency}
                categories={data.expenseCategories || defaultExpenseCategories}
                onOpenAddModal={() => setExpenseModalOpen(true)}
                onOpenManageCategories={() => setExpenseCategoryModalOpen(true)}
                onDeleteExpense={handleDeleteExpense}
                onOpenSettings={() => setTabSettingsModalOpen(true)}
                onOpenPdfReport={() => handleOpenPdfReport('expenses')}
              />
            </div>

            <div className={activeTab === 'dailyClosing' ? 'block' : 'hidden'}>
              <DailyClosingTab
                data={data}
                onSaveClosing={handleSaveDailyClosing}
                onDeleteClosing={handleDeleteDailyClosing}
                onAddOnlineAccount={handleAddOnlineAccount}
                onDeleteOnlineAccount={handleDeleteOnlineAccount}
                onOpenSettings={() => setTabSettingsModalOpen(true)}
                onOpenPdfReport={() => handleOpenPdfReport('dailyClosing')}
              />
            </div>

            <div className={activeTab === 'reports' ? 'block' : 'hidden'}>
              <ReportsTab
                data={data}
                onViewReceipt={sale => {
                  setActiveReceiptSale(sale);
                  setReceiptModalOpen(true);
                }}
              />
            </div>

            <div className={activeTab === 'activity' ? 'block' : 'hidden'}>
              <ActivityCenterTab
                activities={data.activities || []}
                onClearActivities={handleClearActivities}
                onOpenPdfReport={() => handleOpenPdfReport('activity')}
              />
            </div>
          </div>
        </main>
      </div>

      {/* MODALS */}
      {/* 0. Universal PDF Export Modal */}
      <PdfExportModal
        isOpen={pdfModalOpen}
        onClose={() => setPdfModalOpen(false)}
        tab={pdfModalTab}
        data={data}
      />

      {/* 1. Receipt Modal */}
      <ReceiptModal
        sale={activeReceiptSale}
        settings={data.settings}
        isOpen={receiptModalOpen}
        onClose={() => setReceiptModalOpen(false)}
      />

      {/* 2. Stock Add/Edit Modal */}
      <StockModal
        isOpen={stockModalOpen}
        onClose={() => {
          setStockModalOpen(false);
          setEditStockItem(null);
        }}
        onSave={handleSaveStock}
        editItem={editStockItem}
        currency={data.settings.currency}
        categories={data.categories || ['Android Mobile', 'Keypad Mobile']}
        onAddCategory={handleAddCategory}
      />

      {/* 3. Khata Customer Add Modal */}
      <AddKhataModal
        isOpen={addKhataModalOpen}
        onClose={() => setAddKhataModalOpen(false)}
        onSave={handleAddKhataCustomer}
        currency={data.settings.currency}
      />

      {/* 4. Khata Customer Settle Modal */}
      <SettleKhataModal
        isOpen={settleKhataModalOpen}
        customer={settleCustomer}
        onClose={() => {
          setSettleKhataModalOpen(false);
          setSettleCustomer(null);
        }}
        onSave={handleUpdateKhataBalance}
        currency={data.settings.currency}
      />

      {/* 5. Expense Add Modal */}
      <ExpenseModal
        isOpen={expenseModalOpen}
        onClose={() => setExpenseModalOpen(false)}
        onSave={handleSaveExpense}
        currency={data.settings.currency}
        categories={data.expenseCategories || defaultExpenseCategories}
        onOpenManageCategories={() => {
          setExpenseModalOpen(false);
          setExpenseCategoryModalOpen(true);
        }}
      />

      {/* 6. Expense Category Management Modal */}
      <ExpenseCategoryModal
        isOpen={expenseCategoryModalOpen}
        onClose={() => setExpenseCategoryModalOpen(false)}
        categories={data.expenseCategories || defaultExpenseCategories}
        expenses={data.expenses}
        onAddCategory={handleAddExpenseCategory}
        onDeleteCategory={handleDeleteExpenseCategory}
      />

      {/* 7. Settings & Data Modal (with Theme Customization) */}
      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        settings={data.settings}
        onSaveSettings={handleSaveSettings}
        fullData={data}
        onReplaceData={handleReplaceData}
      />

      {/* 8. Tab Customization Settings Modal */}
      <TabSettingsModal
        isOpen={tabSettingsModalOpen}
        onClose={() => setTabSettingsModalOpen(false)}
        activeTab={activeTab}
        preferences={data.tabPreferences || {}}
        onSavePreferences={handleSaveTabPreferences}
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <FormDraftProvider>
        <AppContent />
      </FormDraftProvider>
    </ToastProvider>
  );
}
