import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AppData,
  ShopSettings,
  ActivityLog,
  ExpenseItem,
  DailyClosingRecord,
  OnlineAccount,
  SupplierPurchase,
  InventoryItem,
  UserAccount,
} from './types';
import { hasPermission } from './utils/permissions';
import {
  loadStoredData,
  saveStoredData,
  defaultExpenseCategories,
  migrateAndInitializeData,
  saveExpenseItemToFirestore,
  deleteExpenseItemFromFirestore,
  saveRootConfigToFirestore,
  saveActivityLogToFirestore,
  clearAllStoredData,
} from './utils/storage';
import { recordImeisReversed, recordImeisAvailable } from './utils/imeiManager';
import { generateEntityId } from './utils/id';
import { ToastProvider, useToast } from './components/Toast';
import { FormDraftProvider } from './context/FormDraftContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { AuthScreen } from './components/AuthScreen';
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
import { SalesReturnModal } from './components/SalesReturnModal';
import { StockModal } from './components/StockModal';
import { AddKhataModal, SettleKhataModal } from './components/KhataModal';
import { ExpenseModal } from './components/ExpenseModal';
import { ExpenseCategoryModal } from './components/ExpenseCategoryModal';
import { SettingsModal } from './components/SettingsModal';
import { DailyClosingTab } from './components/DailyClosingTab';
import { TabSettingsModal } from './components/TabSettingsModal';
import { PdfExportModal } from './components/PdfExportModal';
import { BottomNavigation } from './components/BottomNavigation';
import { PWAUpdateBanner } from './components/PWAUpdateBanner';

// Modular Custom Hooks
import { useSales } from './hooks/useSales';
import { useInventory } from './hooks/useInventory';
import { useKhata } from './hooks/useKhata';

function AppContent() {
  const { showToast } = useToast();
  const [data, setData] = useState<AppData>(() => loadStoredData());
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(true);

  // PDF Export Modal state
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfModalTab, setPdfModalTab] = useState<
    'sales' | 'inventory' | 'khata' | 'expenses' | 'activity' | 'dailyClosing'
  >('sales');

  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expenseCategoryModalOpen, setExpenseCategoryModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [tabSettingsModalOpen, setTabSettingsModalOpen] = useState(false);

  // Centralized Activity Logger
  const logActivity = useCallback(
    (
      category: ActivityLog['category'],
      title: string,
      details: string,
      type?: ActivityLog['type'],
      relatedRecordId?: string,
      beforeValue?: string,
      afterValue?: string
    ) => {
      const role = data.currentRole || 'admin';
      const newActivity: ActivityLog = {
        id: generateEntityId('ACT'),
        timestamp: new Date().toISOString(),
        category,
        title,
        details,
        type,
        user: role === 'salesman' ? 'Salesman Terminal' : 'Administrator',
        userRole: role,
        relatedRecordId,
        beforeValue,
        afterValue,
      };

      setData(prev => ({
        ...prev,
        activities: [newActivity, ...(prev.activities || [])].slice(0, 500),
      }));

      saveActivityLogToFirestore(newActivity).catch(err => {
        console.warn('Activity log Firestore sync warning:', err);
      });
    },
    [data.currentRole]
  );

  // Modular Business Logic Hooks
  const {
    handleCompleteSale,
    handleDeleteSale,
    handleCancelSale,
    handleUpdateSale,
    handleOpenSalesReturn,
    handleSaveSalesReturn,
    receiptModalOpen,
    setReceiptModalOpen,
    activeReceiptSale,
    setActiveReceiptSale,
    saleToEdit,
    setSaleToEdit,
    salesReturnModalOpen,
    setSalesReturnModalOpen,
    salesReturnInitialSale,
    setSalesReturnInitialSale,
  } = useSales({ data, setData, logActivity, showToast });

  const {
    handleSaveStock,
    handleDeleteInventory,
    handleRestoreInventory,
    handleStockAdjustment,
    handleAddCategory,
    handleDeleteCategory,
    handleAddProductFromPurchases,
    stockModalOpen,
    setStockModalOpen,
    editStockItem,
    setEditStockItem,
  } = useInventory({ data, setData, logActivity, showToast });

  const {
    handleSaveKhataCustomer,
    handleSettleKhataBalance,
    handleUpdateKhataBalance,
    handleDeleteKhataCustomer,
    addKhataModalOpen,
    setAddKhataModalOpen,
    settleKhataModalOpen,
    setSettleKhataModalOpen,
    settleCustomer,
    setSettleCustomer,
    selectedKhataCustomerId,
    setSelectedKhataCustomerId,
  } = useKhata({ data, setData, logActivity, showToast });

  // Safe Schema Migration and Firebase Synchronization on Mount (No Risky Data Wipe!)
  useEffect(() => {
    migrateAndInitializeData(updatedData => {
      setData(updatedData);
    });
  }, []);

  // Safeguard: Ensure salesman role is never on admin-only tabs
  useEffect(() => {
    if (data.currentRole === 'salesman') {
      const restrictedTabs = ['dashboard', 'reports', 'activity', 'purchases'];
      if (restrictedTabs.includes(activeTab)) {
        setActiveTab('pos');
      }
    }
  }, [data.currentRole, activeTab]);

  // Apply visual theme to document root
  useEffect(() => {
    const activeTheme = data.settings?.theme || 'blue-white';
    document.documentElement.setAttribute('data-theme', activeTheme);
    if (activeTheme === 'dark' || activeTheme === 'gold-black') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [data.settings?.theme]);

  // Sync to local storage mirror on state updates
  useEffect(() => {
    saveStoredData(data);
  }, [data]);

  const handleOpenPdfReport = (
    tab: 'sales' | 'inventory' | 'khata' | 'expenses' | 'activity' | 'dailyClosing'
  ) => {
    setPdfModalTab(tab);
    setPdfModalOpen(true);
  };

  // Expenses Handlers
  const handleSaveExpense = (expenseData: {
    description: string;
    category: string;
    amount: number;
    date: string;
    image?: string;
    paymentMethod?: string;
    accountId?: string;
  }) => {
    if (!hasPermission(data.currentRole || 'admin', 'canManageExpenses')) {
      showToast('Permission Denied: Expense creation is restricted to Administrators', 'error');
      return;
    }

    const newExp: ExpenseItem = {
      id: generateEntityId('EXP'),
      ...expenseData,
    };

    setData(prev => ({
      ...prev,
      expenses: [newExp, ...prev.expenses],
    }));

    saveExpenseItemToFirestore(newExp).catch(err => {
      console.warn('Firestore expense save warning:', err);
    });

    logActivity(
      'Expense',
      `Recorded Expense: ${expenseData.description}`,
      `${data.settings.currency} ${expenseData.amount.toLocaleString()} [${expenseData.category}]${expenseData.paymentMethod ? ` via ${expenseData.paymentMethod}` : ''}`,
      'create',
      newExp.id
    );

    showToast('Expense recorded successfully', 'success');
  };

  const handleDeleteExpense = (id: string) => {
    if (!hasPermission(data.currentRole || 'admin', 'canDeleteExpenses')) {
      showToast('Permission Denied: Deleting expenses is restricted to Administrators', 'error');
      return;
    }

    const targetExp = data.expenses.find(e => e.id === id);
    setData(prev => ({
      ...prev,
      expenses: prev.expenses.filter(e => e.id !== id),
    }));

    deleteExpenseItemFromFirestore(id).catch(err => {
      console.warn('Firestore expense delete warning:', err);
    });

    if (targetExp) {
      logActivity(
        'Expense',
        `Deleted Expense: ${targetExp.description}`,
        `Amount: ${data.settings.currency} ${targetExp.amount}`,
        'delete',
        id
      );
    }

    showToast('Expense deleted', 'info');
  };

  const handleAddExpenseCategory = (category: string) => {
    const trimmed = category.trim();
    if (!trimmed) return;
    const currentCats = data.expenseCategories || defaultExpenseCategories;
    if (currentCats.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      showToast('Category already exists', 'warning');
      return;
    }
    const updated = [...currentCats, trimmed];
    setData(prev => ({ ...prev, expenseCategories: updated }));
    saveRootConfigToFirestore({ expenseCategories: updated }).catch(err => {
      console.warn('Firestore expense categories sync warning:', err);
    });
    showToast(`Category "${trimmed}" added`, 'success');
  };

  const handleDeleteExpenseCategory = (category: string): boolean => {
    const inUse = data.expenses.some(e => e.category === category);
    if (inUse) {
      showToast(`Cannot delete category "${category}" because it is in use by expenses`, 'error');
      return false;
    }
    const currentCats = data.expenseCategories || defaultExpenseCategories;
    const updated = currentCats.filter(c => c !== category);
    setData(prev => ({ ...prev, expenseCategories: updated }));
    saveRootConfigToFirestore({ expenseCategories: updated }).catch(err => {
      console.warn('Firestore expense categories sync warning:', err);
    });
    showToast(`Category "${category}" deleted`, 'info');
    return true;
  };

  // Daily Closing Handlers
  const handleSaveDailyClosing = (record: Omit<DailyClosingRecord, 'id'>) => {
    if (!hasPermission(data.currentRole || 'admin', 'canManageDailyClosing')) {
      showToast('Permission Denied: Daily closing modification is restricted to Administrators', 'error');
      return;
    }

    const newRecordId = generateEntityId('DCL');

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
          id: newRecordId,
          ...record,
        };
        return {
          ...prev,
          dailyClosings: [newRecord, ...(prev.dailyClosings || [])],
        };
      }
    });

    logActivity(
      'Closing',
      `Performed Daily Closing: ${record.date}`,
      `Cash: ${data.settings.currency} ${record.totalCash.toLocaleString()} | Total: ${data.settings.currency} ${record.grandTotal.toLocaleString()}`,
      'create'
    );

    showToast('Daily closing saved successfully', 'success');
  };

  const handleDeleteDailyClosing = (id: string) => {
    if (!hasPermission(data.currentRole || 'admin', 'canDeleteDailyClosing')) {
      showToast('Permission Denied: Deleting historical daily closings is restricted to Administrators', 'error');
      return;
    }

    setData(prev => ({
      ...prev,
      dailyClosings: (prev.dailyClosings || []).filter(r => r.id !== id),
    }));

    showToast('Daily closing record deleted', 'info');
  };

  const handleAddOnlineAccount = (acc: Omit<OnlineAccount, 'id'>) => {
    const newAccount: OnlineAccount = {
      id: generateEntityId('OA'),
      ...acc,
    };

    setData(prev => ({
      ...prev,
      onlineAccounts: [...(prev.onlineAccounts || []), newAccount],
    }));

    logActivity(
      'Settings',
      `Added Online Account: ${acc.name}`,
      `Type: ${acc.bankType || 'Wallet'}${acc.accountNumber ? ` (${acc.accountNumber})` : ''}`,
      'create',
      newAccount.id
    );

    showToast(`Online account "${acc.name}" added`, 'success');
  };

  const handleDeleteOnlineAccount = (id: string) => {
    const acc = (data.onlineAccounts || []).find(a => a.id === id);
    setData(prev => ({
      ...prev,
      onlineAccounts: (prev.onlineAccounts || []).filter(a => a.id !== id),
    }));

    if (acc) {
      logActivity('Settings', `Deleted Online Account: ${acc.name}`, 'Account removed from daily closing', 'delete', id);
    }

    showToast('Online account removed', 'info');
  };

  // Purchases Handlers
  const handleSavePurchase = (
    purchaseData: Omit<SupplierPurchase, 'id'>,
    autoAddToInventory: boolean
  ) => {
    const newPurchaseId = generateEntityId('PUR');
    const newPurchase: SupplierPurchase = {
      ...purchaseData,
      id: newPurchaseId,
    };

    setData(prev => {
      let updatedInventory = [...prev.inventory];
      const itemsToRegisterImeis: { id: string; name: string; category?: string; imei?: string; imeis?: string[] }[] = [];

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
              salePrice:
                purchaseItem.salePrice && purchaseItem.salePrice > 0
                  ? purchaseItem.salePrice
                  : existing.salePrice,
              barcode: purchaseItem.barcode || existing.barcode,
              imei: combinedImeis[0] || existing.imei,
              imeis: combinedImeis.length > 0 ? combinedImeis : undefined,
              status: existing.status || 'ACTIVE',
            };

            itemsToRegisterImeis.push({
              id: existing.id,
              name: existing.name,
              category: existing.category,
              imeis: newImeis,
            });
          } else {
            const newItemId = generateEntityId('STK');
            const newItem: InventoryItem = {
              id: newItemId,
              name: purchaseItem.name,
              category: purchaseItem.category || prev.categories?.[0] || 'Android Mobile',
              costPrice: purchaseItem.costPrice,
              salePrice: purchaseItem.salePrice || Math.round(purchaseItem.costPrice * 1.15),
              qty: purchaseItem.qty,
              barcode: purchaseItem.barcode,
              imei: purchaseItem.imei,
              imeis: purchaseItem.imeis,
              status: 'ACTIVE',
              createdAt: new Date().toISOString(),
            };
            updatedInventory = [newItem, ...updatedInventory];

            itemsToRegisterImeis.push({
              id: newItem.id,
              name: newItem.name,
              category: newItem.category,
              imeis: purchaseItem.imeis || (purchaseItem.imei ? [purchaseItem.imei] : []),
            });
          }
        });
      }

      const newLedgerEntries = newPurchase.items.map(item => ({
        id: generateEntityId('PL'),
        date: newPurchase.date,
        itemTitle: `${item.name} (${newPurchase.partyName})`,
        qty: item.qty,
        costPrice: item.costPrice,
        total: item.costPrice * item.qty,
      }));

      // Register new IMEIs in permanent tracking record
      const updatedImeiRecords = recordImeisAvailable({
        items: itemsToRegisterImeis,
        existingImeiRecords: prev.imeiRecords || [],
        purchaseBillNo: newPurchase.billNo,
        purchaseParty: newPurchase.partyName,
      });

      return {
        ...prev,
        inventory: updatedInventory,
        supplierPurchases: [newPurchase, ...(prev.supplierPurchases || [])],
        purchasesLedger: [...newLedgerEntries, ...(prev.purchasesLedger || [])],
        imeiRecords: updatedImeiRecords,
      };
    });

    logActivity(
      'Purchase',
      `Stock Inward: ${newPurchase.partyName} (Bill #${newPurchase.billNo})`,
      `Total: ${data.settings.currency} ${newPurchase.totalAmount.toLocaleString()} | Paid: ${data.settings.currency} ${newPurchase.paidAmount.toLocaleString()} | Items: ${newPurchase.items.length}`,
      'create',
      newPurchase.id
    );

    showToast(`Purchase bill #${newPurchase.billNo} registered!`, 'success');
  };

  const handleDeletePurchase = () => {
    showToast('Deleting completed purchase bills is strictly forbidden. Use Reverse / Cancel Purchase instead.', 'error');
  };

  const handleReversePurchase = ({
    purchaseId,
    reason,
    notes,
    reversedBy = 'Admin',
  }: {
    purchaseId: string;
    reason: string;
    notes?: string;
    reversedBy?: string;
  }) => {
    if (!hasPermission(data.currentRole || 'admin', 'canReversePurchase')) {
      showToast('Permission Denied: Reversing purchase bills is restricted to Administrators', 'error');
      return;
    }

    const purchase = (data.supplierPurchases || []).find(p => p.id === purchaseId);
    if (!purchase) return;

    if (purchase.status === 'REVERSED') {
      showToast('This purchase bill is already reversed', 'warning');
      return;
    }

    setData(prev => {
      // 1. Reverse stock in inventory
      const updatedInventory = [...prev.inventory];
      const allPurchaseImeis: string[] = [];

      purchase.items.forEach(purchaseItem => {
        const itemImeis = purchaseItem.imeis || (purchaseItem.imei ? [purchaseItem.imei] : []);
        allPurchaseImeis.push(...itemImeis);

        const matchIndex = updatedInventory.findIndex(
          inv =>
            inv.name.trim().toLowerCase() === purchaseItem.name.trim().toLowerCase() ||
            (purchaseItem.barcode && inv.barcode === purchaseItem.barcode)
        );

        if (matchIndex >= 0) {
          const existing = updatedInventory[matchIndex];
          const existingImeis =
            existing.imeis || (existing.imei ? existing.imei.split(',').map(s => s.trim()).filter(Boolean) : []);
          const remainingImeis = existingImeis.filter(
            im => !itemImeis.some(pIm => pIm.toLowerCase().trim() === im.toLowerCase().trim())
          );

          updatedInventory[matchIndex] = {
            ...existing,
            qty: Math.max(0, existing.qty - purchaseItem.qty),
            imei: remainingImeis.length > 0 ? remainingImeis.join(', ') : undefined,
            imeis: remainingImeis.length > 0 ? remainingImeis : undefined,
          };
        }
      });

      // 2. Reverse IMEI stock in imeiRecords
      const updatedImeiRecords = recordImeisReversed({
        purchaseBillNo: purchase.billNo,
        reversedImeis: allPurchaseImeis,
        existingImeiRecords: prev.imeiRecords || [],
      });

      // 3. Mark purchasesLedger entry as reversed
      const updatedLedger = (prev.purchasesLedger || []).map(entry => {
        if (entry.itemTitle.includes(purchase.partyName) || entry.id.includes(purchase.id)) {
          return { ...entry, isReversed: true };
        }
        return entry;
      });

      // 4. Mark purchase as REVERSED
      const updatedPurchases = (prev.supplierPurchases || []).map(p => {
        if (p.id === purchaseId) {
          return {
            ...p,
            status: 'REVERSED' as const,
            reversedAt: new Date().toISOString(),
            reversedBy,
            reversalReason: reason,
            reversalNotes: notes,
          };
        }
        return p;
      });

      return {
        ...prev,
        inventory: updatedInventory,
        imeiRecords: updatedImeiRecords,
        purchasesLedger: updatedLedger,
        supplierPurchases: updatedPurchases,
      };
    });

    logActivity(
      'Purchase',
      `Cancelled / Reversed Purchase: Bill #${purchase.billNo}`,
      `Supplier: ${purchase.partyName} | Reason: ${reason} | Stock reversed (${purchase.items.length} items) | Financial reversal: ${data.settings.currency} ${purchase.paidAmount.toLocaleString()} | Reversed by ${reversedBy}`,
      'reversal',
      purchase.billNo
    );

    showToast(`Purchase #${purchase.billNo} has been safely reversed. Stock restored!`, 'success');
  };

  // Settings & Theme
  const handleSaveSettings = (newSettings: ShopSettings) => {
    if (!hasPermission(data.currentRole || 'admin', 'canChangeSettings')) {
      showToast('Permission Denied: Modifying shop settings is restricted to Administrators', 'error');
      return;
    }

    setData(prev => ({
      ...prev,
      settings: newSettings,
    }));

    saveRootConfigToFirestore({ settings: newSettings }).catch(err => {
      console.warn('Firestore settings update warning:', err);
    });

    logActivity('Settings', 'Updated Shop Settings', `Shop: ${newSettings.shopName}`, 'update');
    showToast('Shop settings saved successfully', 'success');
  };

  const handleToggleTheme = () => {
    setData(prev => {
      const currentTheme = prev.settings?.theme || 'blue-white';
      const newTheme = currentTheme === 'dark' ? 'blue-white' : 'dark';
      return {
        ...prev,
        settings: {
          ...prev.settings,
          theme: newTheme,
        },
      };
    });
  };

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

  const handleLogout = () => {
    setData(prev => ({
      ...prev,
      currentUser: undefined,
      currentRole: 'admin',
    }));
    logActivity('Security', 'Signed Out of Terminal', 'User logged out securely', 'update');
    showToast('Signed out successfully', 'info');
  };

  const cartItemCount = useMemo(() => {
    return data.inventory.filter(i => i.qty > 0 && i.status !== 'ARCHIVED').length;
  }, [data.inventory]);

  if (!data.currentUser) {
    return (
      <>
        <PWAUpdateBanner />
        <AuthScreen
          existingUsers={data.users || []}
          onAuthSuccess={user => {
            if (user.role === 'salesman') {
              setActiveTab('pos');
            }
            setData(prev => {
              const users = prev.users || [];
              const userExists = users.some(u => u.id === user.id);
              const updatedUsers = userExists ? users.map(u => (u.id === user.id ? user : u)) : [...users, user];
              return {
                ...prev,
                users: updatedUsers,
                currentUser: user,
                currentRole: user.role,
              };
            });
          }}
          settings={data.settings}
        />
      </>
    );
  }

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-slate-50 text-slate-800">
      {/* PWA Offline & Automatic Update Notification */}
      <PWAUpdateBanner />

      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        onOpenSettings={() => setSettingsModalOpen(true)}
        settings={data.settings}
        activityCount={(data.activities || []).length}
        currentRole={data.currentRole || 'admin'}
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
          onToggleTheme={handleToggleTheme}
          settings={data.settings}
          currentRole={data.currentRole || 'admin'}
          currentUser={data.currentUser}
          onLogout={handleLogout}
        />

        {/* Scrollable Tab Content - Optimized with Conditional Rendering (Unmounts Inactive Tabs) */}
        <main className="flex-1 overflow-y-auto p-3.5 sm:p-6 pb-24 lg:pb-6">
          <div className="max-w-7xl mx-auto">
            {activeTab === 'dashboard' && (data.currentRole || 'admin') === 'admin' && (
              <DashboardTab
                data={data}
                onSwitchTab={setActiveTab}
                onOpenModal={handleOpenModal}
                onOpenSettings={() => setTabSettingsModalOpen(true)}
              />
            )}

            {activeTab === 'pos' && (
              <PosTab
                inventory={data.inventory}
                sales={data.sales || []}
                currency={data.settings.currency}
                categories={data.categories || ['Android Mobile', 'Keypad Mobile']}
                khataCustomers={data.khata || []}
                onlineAccounts={data.onlineAccounts || []}
                settings={data.settings}
                onCompleteSale={handleCompleteSale}
                onOpenAddStock={() => {
                  setEditStockItem(null);
                  setStockModalOpen(true);
                }}
                onOpenPdfReport={() => handleOpenPdfReport('sales')}
                onOpenSalesReturn={handleOpenSalesReturn}
                onViewReceipt={sale => {
                  setActiveReceiptSale(sale);
                  setReceiptModalOpen(true);
                }}
                onCancelSale={handleCancelSale}
                onDeleteSale={handleDeleteSale}
                onUpdateSale={handleUpdateSale}
                saleToEdit={saleToEdit}
                onClearSaleToEdit={() => setSaleToEdit(null)}
              />
            )}

            {activeTab === 'inventory' && (
              <InventoryTab
                inventory={data.inventory}
                currency={data.settings.currency}
                categories={data.categories || ['Android Mobile', 'Keypad Mobile']}
                stockAdjustments={data.stockAdjustments || []}
                sales={data.sales || []}
                isAdmin={(data.currentRole || 'admin') === 'admin'}
                onOpenAddModal={() => {
                  setEditStockItem(null);
                  setStockModalOpen(true);
                }}
                onOpenEditModal={item => {
                  setEditStockItem(item);
                  setStockModalOpen(true);
                }}
                onDeleteItem={handleDeleteInventory}
                onRestoreItem={handleRestoreInventory}
                onAddCategory={handleAddCategory}
                onDeleteCategory={handleDeleteCategory}
                onOpenPdfReport={() => handleOpenPdfReport('inventory')}
              />
            )}

            {activeTab === 'purchases' && (
              <PurchasesTab
                purchases={data.supplierPurchases || []}
                currency={data.settings.currency}
                categories={data.categories || ['Android Mobile', 'Keypad Mobile']}
                inventory={data.inventory}
                imeiRecords={data.imeiRecords || []}
                sales={data.sales || []}
                onlineAccounts={data.onlineAccounts || []}
                onSavePurchase={handleSavePurchase}
                onDeletePurchase={handleDeletePurchase}
                onReversePurchase={handleReversePurchase}
                onAddInventoryProduct={handleAddProductFromPurchases}
                onAddCategory={handleAddCategory}
              />
            )}

            {activeTab === 'barcode' && (
              <BarcodeGenerator inventory={data.inventory} settings={data.settings} />
            )}

            {activeTab === 'khata' && (
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
            )}

            {activeTab === 'expenses' && (
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
            )}

            {activeTab === 'dailyClosing' && (
              <DailyClosingTab
                data={data}
                onSaveClosing={handleSaveDailyClosing}
                onDeleteClosing={handleDeleteDailyClosing}
                onAddOnlineAccount={handleAddOnlineAccount}
                onDeleteOnlineAccount={handleDeleteOnlineAccount}
                onOpenSettings={() => setTabSettingsModalOpen(true)}
                onOpenPdfReport={() => handleOpenPdfReport('dailyClosing')}
              />
            )}

            {activeTab === 'reports' && (data.currentRole || 'admin') === 'admin' && (
              <ReportsTab
                data={data}
                onViewReceipt={sale => {
                  setActiveReceiptSale(sale);
                  setReceiptModalOpen(true);
                }}
                onOpenSalesReturn={handleOpenSalesReturn}
                onEditSale={sale => {
                  setSaleToEdit(sale);
                  setActiveTab('pos');
                }}
                onDeleteSale={handleDeleteSale}
              />
            )}

            {activeTab === 'activity' && (data.currentRole || 'admin') === 'admin' && (
              <ActivityCenterTab
                activities={data.activities || []}
                onClearActivities={() => {
                  setData(prev => ({ ...prev, activities: [] }));
                  showToast('Activities log cleared', 'info');
                }}
                onOpenPdfReport={() => handleOpenPdfReport('activity')}
              />
            )}
          </div>
        </main>

        {/* Mobile Sticky Bottom Dock / Navigation Bar (lg:hidden) */}
        <BottomNavigation
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          onOpenMenu={() => setIsMenuOpen(true)}
          currentRole={data.currentRole || 'admin'}
          cartItemCount={cartItemCount}
        />
      </div>

      {/* Global Application Modals */}
      <StockModal
        isOpen={stockModalOpen}
        onClose={() => setStockModalOpen(false)}
        onSave={handleSaveStock}
        editItem={editStockItem}
        currency={data.settings.currency}
        categories={data.categories}
        inventory={data.inventory}
        imeiRecords={data.imeiRecords || []}
        sales={data.sales || []}
        salesReturns={data.salesReturns || []}
        onAddCategory={handleAddCategory}
        onStockAdjustment={handleStockAdjustment}
      />

      <AddKhataModal
        isOpen={addKhataModalOpen}
        onClose={() => setAddKhataModalOpen(false)}
        onSave={handleSaveKhataCustomer}
        currency={data.settings.currency}
      />

      <SettleKhataModal
        isOpen={settleKhataModalOpen}
        onClose={() => {
          setSettleKhataModalOpen(false);
          setSettleCustomer(null);
        }}
        customer={settleCustomer}
        currency={data.settings.currency}
        onSave={handleUpdateKhataBalance}
      />

      <ExpenseModal
        isOpen={expenseModalOpen}
        onClose={() => setExpenseModalOpen(false)}
        onSave={handleSaveExpense}
        currency={data.settings.currency}
        categories={data.expenseCategories || defaultExpenseCategories}
        onlineAccounts={data.onlineAccounts || []}
        onOpenManageCategories={() => {
          setExpenseModalOpen(false);
          setExpenseCategoryModalOpen(true);
        }}
      />

      <ExpenseCategoryModal
        isOpen={expenseCategoryModalOpen}
        onClose={() => setExpenseCategoryModalOpen(false)}
        categories={data.expenseCategories || defaultExpenseCategories}
        expenses={data.expenses}
        onAddCategory={handleAddExpenseCategory}
        onDeleteCategory={handleDeleteExpenseCategory}
      />

      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        settings={data.settings}
        onSaveSettings={handleSaveSettings}
        fullData={data}
        onReplaceData={(newData: AppData) => {
          setData(newData);
          saveStoredData(newData);
          showToast('Backup restored successfully', 'success');
        }}
        onUpdateUsers={(users: UserAccount[]) => {
          setData(prev => ({ ...prev, users }));
          saveRootConfigToFirestore({ users }).catch(err => {
            console.warn('Firestore users sync warning:', err);
          });
        }}
      />

      <TabSettingsModal
        isOpen={tabSettingsModalOpen}
        onClose={() => setTabSettingsModalOpen(false)}
        activeTab={activeTab}
        preferences={data.tabPreferences || {}}
        onSavePreferences={(tabId: string, prefs: Record<string, unknown>) => {
          setData(prev => ({
            ...prev,
            tabPreferences: {
              ...(prev.tabPreferences || {}),
              [tabId]: prefs,
            },
          }));
          saveRootConfigToFirestore({
            tabPreferences: {
              ...(data.tabPreferences || {}),
              [tabId]: prefs,
            },
          }).catch(err => {
            console.warn('Firestore tab preferences sync warning:', err);
          });
          showToast('Tab settings saved', 'success');
        }}
      />

      <ReceiptModal
        isOpen={receiptModalOpen}
        onClose={() => setReceiptModalOpen(false)}
        sale={activeReceiptSale}
        settings={data.settings}
        onOpenSalesReturn={sale => {
          setReceiptModalOpen(false);
          handleOpenSalesReturn(sale);
        }}
        onDeleteSale={handleDeleteSale}
      />

      <SalesReturnModal
        isOpen={salesReturnModalOpen}
        onClose={() => {
          setSalesReturnModalOpen(false);
          setSalesReturnInitialSale(null);
        }}
        sales={data.sales || []}
        inventory={data.inventory}
        currency={data.settings.currency}
        salesReturns={data.salesReturns || []}
        initialSale={salesReturnInitialSale}
        onlineAccounts={data.onlineAccounts || []}
        onProcessReturn={handleSaveSalesReturn}
      />

      <PdfExportModal
        isOpen={pdfModalOpen}
        onClose={() => setPdfModalOpen(false)}
        data={data}
        tab={pdfModalTab}
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
