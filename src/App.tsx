import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  SyncCollectionKey,
} from './types';
import { hasPermission } from './utils/permissions';
import {
  loadStoredData,
  saveStoredData,
  loadFromIndexedDB,
  saveAppDataToFirestore,
  defaultExpenseCategories,
  migrateAndInitializeData,
  saveExpenseItemToFirestore,
  deleteExpenseItemFromFirestore,
  saveRootConfigToFirestore,
  saveActivityLogToFirestore,
  saveUserToFirestore,
  setActiveStoreId,
  saveCurrentSession,
  getSavedSessionUser,
  clearCurrentSession,
  loadAppDataFromFirestore,
  subscribeToStoreFullData,
  saveInventoryItemToFirestore,
  savePurchaseToFirestore,
  saveDailyClosingToFirestore,
  deleteDailyClosingFromFirestore,
  savePurchasesLedgerBatchToFirestore,
  saveImeiRecordsBatchToFirestore,
  mergeAppData,
  recoverAllMissingStoreData,
  addTombstonesToMap,
  isItemTombstoned,
  processPendingWritesQueue,
  toValidFirestoreDocId,
  CollectionDeltaEvent,
  DEFAULT_STORE_ID,
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
import { PWAUpdateBanner } from './components/PWAUpdateBanner';

// Modular Custom Hooks
import { useSales } from './hooks/useSales';
import { useInventory } from './hooks/useInventory';
import { useKhata } from './hooks/useKhata';

function AppContent() {
  const { showToast } = useToast();
  const [data, setData] = useState<AppData>(() => loadStoredData());
  const dataRef = useRef<AppData>(data);
  dataRef.current = data;
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(true);

  // PDF Export Modal state
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfModalTab, setPdfModalTab] = useState<
    'sales' | 'inventory' | 'khata' | 'expenses' | 'activity' | 'dailyClosing' | 'purchases'
  >('sales');
  const [pdfModalCategory, setPdfModalCategory] = useState<string>('all');

  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expenseCategoryModalOpen, setExpenseCategoryModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [tabSettingsModalOpen, setTabSettingsModalOpen] = useState(false);
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);

  useEffect(() => {
    const handleGmpQuota = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleGmpQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', handleGmpQuota);
  }, []);

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
      const now = new Date().toISOString();
      const newActivity: ActivityLog = {
        id: generateEntityId('ACT'),
        timestamp: now,
        updatedAt: now,
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
    handlePermanentDeleteInventory,
    handleRestoreInventory,
    handleStockAdjustment,
    handleAddCategory,
    handleDeleteCategory,
    handleRenameCategory,
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
    handleDeleteKhataTransaction,
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
  const isInitialSyncDoneRef = useRef(false);

  useEffect(() => {
    // Check if an active authenticated user session exists (e.g., across refreshes)
    const sessionUser = getSavedSessionUser();
    setActiveStoreId(DEFAULT_STORE_ID);

    migrateAndInitializeData(updatedData => {
      if (sessionUser) {
        setData({
          ...updatedData,
          currentUser: sessionUser,
          currentRole: sessionUser.role,
        });
      } else {
        setData(updatedData);
      }
      isInitialSyncDoneRef.current = true;
    }, DEFAULT_STORE_ID);
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

  // Sync to local storage mirror on state updates (offline-first IndexedDB + localStorage mirror)
  useEffect(() => {
    if (isInitialSyncDoneRef.current || (data.users && data.users.length > 0) || data.inventory.length > 0) {
      saveStoredData(data, DEFAULT_STORE_ID);
    }
  }, [data]);

  // Live Real-Time Multi-Device Firestore Synchronization (Incremental Deltas + Root Config + Tombstones)
  useEffect(() => {
    const activeSid = DEFAULT_STORE_ID;

    const parseMs = (val?: string): number => {
      if (!val) return 0;
      const t = Date.parse(val);
      return Number.isFinite(t) ? t : 0;
    };

    const getCollectionMeta = (
      colKey: SyncCollectionKey
    ): {
      prefix: string;
      getId: (x: any) => string | undefined;
      getTime: (x: any) => string | undefined;
      sortDescBy?: (x: any) => string | undefined;
      limitCount?: number;
    } => {
      switch (colKey) {
        case 'inventory':
          return { prefix: 'STK', getId: x => x.id, getTime: x => x.updatedAt || x.createdAt };
        case 'sales':
          return { prefix: 'INV', getId: x => x.invNo, getTime: x => x.updatedAt || x.date, sortDescBy: x => x.date };
        case 'khata':
          return { prefix: 'KHT', getId: x => x.id, getTime: x => x.updatedAt || x.lastUpdated };
        case 'expenses':
          return { prefix: 'EXP', getId: x => x.id, getTime: x => x.updatedAt || x.date, sortDescBy: x => x.date };
        case 'supplierPurchases':
          return {
            prefix: 'PUR',
            getId: x => x.id || x.billNo,
            getTime: x => x.updatedAt || x.reversedAt || x.date,
            sortDescBy: x => x.date,
          };
        case 'dailyClosings':
          return {
            prefix: 'DCL',
            getId: x => x.id || x.date,
            getTime: x => x.updatedAt || x.createdAt || x.date,
            sortDescBy: x => x.date,
          };
        case 'salesReturns':
          return {
            prefix: 'RET',
            getId: x => x.returnNo || x.id,
            getTime: x => x.updatedAt || x.returnDate,
            sortDescBy: x => x.returnDate,
          };
        case 'stockAdjustments':
          return {
            prefix: 'ADJ',
            getId: x => x.id,
            getTime: x => x.updatedAt || x.adjustedAt,
            sortDescBy: x => x.adjustedAt,
          };
        case 'purchasesLedger':
          return {
            prefix: 'PL',
            getId: x => x.id,
            getTime: x => x.updatedAt || x.date,
            sortDescBy: x => x.date,
          };
        case 'imeiRecords':
          return { prefix: 'IMEI', getId: x => x.id || x.imei, getTime: x => x.updatedAt || x.createdAt };
        case 'activities':
          return {
            prefix: 'ACT',
            getId: x => x.id,
            getTime: x => x.updatedAt || x.timestamp,
            sortDescBy: x => x.timestamp,
            limitCount: 500,
          };
      }
    };

    const unsubscribe = subscribeToStoreFullData(activeSid, {
      onRootConfig: (incomingPatch) => {
        setData(prev => {
          const merged = mergeAppData(prev, incomingPatch);
          return {
            ...merged,
            currentUser: prev.currentUser,
            currentRole: prev.currentRole || prev.currentUser?.role || 'admin',
          };
        });
      },
      onCollectionDelta: (delta: CollectionDeltaEvent) => {
        setData(prev => {
          const { collection: colKey, upserts, removals } = delta;
          const meta = getCollectionMeta(colKey);
          const tombstones = prev.deletedIds?.[colKey] || [];
          const currentArr = Array.isArray((prev as any)[colKey]) ? ([...(prev as any)[colKey]] as any[]) : [];
          let changed = false;

          // Build lookup maps by exact ID and sanitized Firestore docId
          const indexById = new Map<string, number>();
          currentArr.forEach((item, idx) => {
            const rawId = meta.getId(item);
            if (rawId) {
              indexById.set(rawId, idx);
              indexById.set(toValidFirestoreDocId(rawId, meta.prefix), idx);
            }
          });

          const removalSet = new Set(removals);
          let nextArr = currentArr;

          if (removalSet.size > 0) {
            const filtered = nextArr.filter(item => {
              const rawId = meta.getId(item);
              if (!rawId) return true;
              const safeId = toValidFirestoreDocId(rawId, meta.prefix);
              if (removalSet.has(rawId) || removalSet.has(safeId)) {
                changed = true;
                return false;
              }
              return true;
            });
            nextArr = filtered;
            // Rebuild lookup indices after removals
            indexById.clear();
            nextArr.forEach((item, idx) => {
              const rawId = meta.getId(item);
              if (rawId) {
                indexById.set(rawId, idx);
                indexById.set(toValidFirestoreDocId(rawId, meta.prefix), idx);
              }
            });
          }

          for (const { docId, item } of upserts) {
            const itemId = meta.getId(item) || docId;
            const itemTimeStr = meta.getTime(item);

            if (isItemTombstoned(itemId, itemTimeStr, tombstones)) {
              continue;
            }

            const existingIdx = indexById.get(itemId) ?? indexById.get(docId);
            if (existingIdx !== undefined) {
              const existingItem = nextArr[existingIdx];
              const localMs = parseMs(meta.getTime(existingItem));
              const remoteMs = parseMs(itemTimeStr);

              // Keep local item if it has a strictly newer timestamp
              if (localMs > remoteMs) {
                continue;
              }

              let mergedItem: any = { ...existingItem, ...item };
              if (colKey === 'inventory' || colKey === 'expenses') {
                mergedItem.image = (item as any).image || existingItem.image;
              } else if (colKey === 'supplierPurchases') {
                mergedItem.invoiceImage = (item as any).invoiceImage || existingItem.invoiceImage;
              } else if (colKey === 'khata') {
                mergedItem.image = (item as any).image || existingItem.image;
                const exHist = Array.isArray(existingItem.history) ? existingItem.history : [];
                const incHist = Array.isArray((item as any).history) ? (item as any).history : [];
                mergedItem.history = incHist.length >= exHist.length ? incHist : exHist;
              }

              if (JSON.stringify(existingItem) !== JSON.stringify(mergedItem)) {
                nextArr[existingIdx] = mergedItem;
                changed = true;
              }
            } else {
              nextArr.push(item);
              const newIdx = nextArr.length - 1;
              indexById.set(itemId, newIdx);
              indexById.set(docId, newIdx);
              changed = true;
            }
          }

          if (!changed) return prev;

          if (meta.sortDescBy) {
            nextArr.sort((a, b) => parseMs(meta.sortDescBy!(b)) - parseMs(meta.sortDescBy!(a)));
          }
          if (meta.limitCount && nextArr.length > meta.limitCount) {
            nextArr = nextArr.slice(0, meta.limitCount);
          }

          return {
            ...prev,
            [colKey]: nextArr,
          };
        });
      },
    });

    return () => {
      unsubscribe();
    };
  }, [data.currentUser?.storeId, data.currentUser?.id]);

  // Mobile keyboard scroll into view handler
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      if (window.matchMedia('(max-width: 1023px)').matches) {
        const target = e.target as HTMLElement;
        if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) {
          setTimeout(() => {
            target.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }, 300);
        }
      }
    };
    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, []);

  const handleOpenPdfReport = (
    tab: 'sales' | 'inventory' | 'khata' | 'expenses' | 'activity' | 'dailyClosing' | 'purchases',
    initialCat?: string
  ) => {
    setPdfModalTab(tab);
    setPdfModalCategory(initialCat || 'all');
    setPdfModalOpen(true);
  };

  // Manual Force Refresh & Multi-Device Sync Handler
  const handleManualSyncData = useCallback(async () => {
    const activeSid = DEFAULT_STORE_ID;
    try {
      showToast('Syncing pending writes & refreshing from Cloud Firestore...', 'info');
      await processPendingWritesQueue();
      await migrateAndInitializeData(
        (reloadedData) => {
          setData(prev => ({
            ...mergeAppData(prev, reloadedData),
            currentUser: prev.currentUser,
            currentRole: prev.currentRole || prev.currentUser?.role || 'admin',
          }));
        },
        activeSid,
        { currentState: dataRef.current }
      );
      showToast('Latest data & images synchronized cleanly!', 'success');
    } catch (err) {
      console.warn('Manual sync warning:', err);
      showToast('Data sync complete with offline cache', 'info');
    }
  }, [showToast]);

  // Manual Deep Recovery Handler for Stock Inward / Purchases (Respects Tombstones)
  const handleRecoverMissingPurchases = useCallback(async (): Promise<number> => {
    const activeSid = DEFAULT_STORE_ID;
    try {
      const { mergedData, recoveredPurchasesCount } = await recoverAllMissingStoreData(dataRef.current, activeSid);
      setData(prev => ({
        ...mergedData,
        currentUser: prev.currentUser,
        currentRole: prev.currentRole || prev.currentUser?.role || 'admin',
      }));
      if (recoveredPurchasesCount > 0) {
        showToast(`Recovered ${recoveredPurchasesCount} missing Stock Inward bill(s)!`, 'success');
      } else {
        showToast('Deep scan complete — all available Stock Inward records are already loaded.', 'info');
      }
      return recoveredPurchasesCount;
    } catch (err) {
      console.warn('Recovery scan warning:', err);
      showToast('Could not complete cloud recovery scan', 'warning');
      return 0;
    }
  }, [showToast]);

  const handleRecoverMissingData = useCallback(async (): Promise<number> => {
    const activeSid = DEFAULT_STORE_ID;
    try {
      const { mergedData, totalRecoveredCount } = await recoverAllMissingStoreData(dataRef.current, activeSid);
      setData(prev => ({
        ...mergedData,
        currentUser: prev.currentUser,
        currentRole: prev.currentRole || prev.currentUser?.role || 'admin',
      }));
      if (totalRecoveredCount > 0) {
        showToast(`Recovered ${totalRecoveredCount} missing record(s)!`, 'success');
      } else {
        showToast('Scan complete — no missing records found.', 'info');
      }
      return totalRecoveredCount;
    } catch (err) {
      console.warn('Manual recovery scan warning:', err);
      showToast('Could not complete cloud recovery scan', 'warning');
      return 0;
    }
  }, [showToast]);

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

    const now = new Date().toISOString();
    const newExp: ExpenseItem = {
      id: generateEntityId('EXP'),
      ...expenseData,
      updatedAt: now,
    };

    setData(prev => ({
      ...prev,
      lastModified: now,
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

    const now = new Date().toISOString();
    const targetExp = data.expenses.find(e => e.id === id);
    const tombstoneRes = addTombstonesToMap(
      data.deletedIds,
      'expenses',
      [id],
      data.deletedInventoryIds
    );

    setData(prev => {
      const prevTomb = addTombstonesToMap(
        prev.deletedIds,
        'expenses',
        [id],
        prev.deletedInventoryIds
      );
      return {
        ...prev,
        lastModified: now,
        expenses: prev.expenses.filter(e => e.id !== id),
        deletedIds: prevTomb.deletedIds,
        deletedInventoryIds: prevTomb.deletedInventoryIds,
      };
    });

    deleteExpenseItemFromFirestore(id).catch(err => {
      console.warn('Firestore expense delete warning:', err);
    });
    saveRootConfigToFirestore({
      deletedIds: tombstoneRes.deletedIds,
      deletedInventoryIds: tombstoneRes.deletedInventoryIds,
    }).catch(() => {});

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
    const now = new Date().toISOString();
    const updated = [...currentCats, trimmed];
    setData(prev => ({
      ...prev,
      lastModified: now,
      expenseCategoriesUpdatedAt: now,
      expenseCategories: updated,
    }));
    saveRootConfigToFirestore({
      expenseCategories: updated,
      expenseCategoriesUpdatedAt: now,
    }).catch(err => {
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
    const now = new Date().toISOString();
    const currentCats = data.expenseCategories || defaultExpenseCategories;
    const updated = currentCats.filter(c => c !== category);
    setData(prev => ({
      ...prev,
      lastModified: now,
      expenseCategoriesUpdatedAt: now,
      expenseCategories: updated,
    }));
    saveRootConfigToFirestore({
      expenseCategories: updated,
      expenseCategoriesUpdatedAt: now,
    }).catch(err => {
      console.warn('Firestore expense categories sync warning:', err);
    });
    showToast(`Category "${category}" deleted`, 'info');
    return true;
  };

  const handleRenameExpenseCategory = (oldName: string, newName: string): boolean => {
    const cleanOld = oldName.trim();
    const cleanNew = newName.trim();
    if (!cleanOld || !cleanNew) {
      showToast('Category name cannot be empty', 'warning');
      return false;
    }
    if (cleanOld === cleanNew) return true;

    const currentCats = data.expenseCategories || defaultExpenseCategories;
    if (currentCats.some(c => c.toLowerCase() === cleanNew.toLowerCase() && c.toLowerCase() !== cleanOld.toLowerCase())) {
      showToast(`Category "${cleanNew}" already exists`, 'warning');
      return false;
    }

    const now = new Date().toISOString();
    const prevCats = data.expenseCategories || defaultExpenseCategories;
    const updatedCats = prevCats.map(c => (c.toLowerCase() === cleanOld.toLowerCase() ? cleanNew : c));
    if (!updatedCats.some(c => c.toLowerCase() === cleanNew.toLowerCase())) {
      updatedCats.push(cleanNew);
    }

    const updatedExpensesToSync: ExpenseItem[] = [];
    (data.expenses || []).forEach(exp => {
      if ((exp.category || '').trim().toLowerCase() === cleanOld.toLowerCase()) {
        updatedExpensesToSync.push({ ...exp, category: cleanNew, updatedAt: now });
      }
    });

    setData(prev => ({
      ...prev,
      lastModified: now,
      expenseCategoriesUpdatedAt: now,
      expenseCategories: updatedCats,
      expenses: (prev.expenses || []).map(exp =>
        (exp.category || '').trim().toLowerCase() === cleanOld.toLowerCase()
          ? { ...exp, category: cleanNew, updatedAt: now }
          : exp
      ),
    }));

    saveRootConfigToFirestore({
      expenseCategories: updatedCats,
      expenseCategoriesUpdatedAt: now,
    }).catch(err => {
      console.warn('Firestore expense category rename sync warning:', err);
    });
    updatedExpensesToSync.forEach(exp => {
      saveExpenseItemToFirestore(exp).catch(err => {
        console.warn('Firestore expense item rename sync warning:', err);
      });
    });

    logActivity(
      'Expense',
      `Renamed Expense Category: ${cleanOld} → ${cleanNew}`,
      `Updated across ${updatedExpensesToSync.length} expense record(s)`,
      'update'
    );
    showToast(`Expense category renamed to "${cleanNew}"`, 'success');
    return true;
  };

  // Daily Closing Handlers
  const handleSaveDailyClosing = (record: Omit<DailyClosingRecord, 'id'>) => {
    if (!hasPermission(data.currentRole || 'admin', 'canManageDailyClosing')) {
      showToast('Permission Denied: Daily closing modification is restricted to Administrators', 'error');
      return;
    }

    const now = new Date().toISOString();
    const newRecordId = generateEntityId('DCL');
    const existingList = data.dailyClosings || [];
    const existingIndex = existingList.findIndex(r => r.date === record.date);
    let savedRecord: DailyClosingRecord;
    let syncedClosings: DailyClosingRecord[];

    if (existingIndex >= 0) {
      savedRecord = { ...existingList[existingIndex], ...record, updatedAt: now };
      syncedClosings = existingList.map((r, idx) => (idx === existingIndex ? savedRecord : r));
    } else {
      savedRecord = { id: newRecordId, ...record, updatedAt: now };
      syncedClosings = [savedRecord, ...existingList];
    }

    setData(prev => ({
      ...prev,
      lastModified: now,
      dailyClosings: syncedClosings,
    }));

    saveDailyClosingToFirestore(savedRecord, DEFAULT_STORE_ID).catch(() => {});

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

    const now = new Date().toISOString();
    const target = (data.dailyClosings || []).find(r => r.id === id);
    const idsToTombstone = Array.from(new Set([id, target?.date].filter(Boolean) as string[]));
    const tombstoneRes = addTombstonesToMap(
      data.deletedIds,
      'dailyClosings',
      idsToTombstone,
      data.deletedInventoryIds
    );

    setData(prev => {
      const prevTomb = addTombstonesToMap(
        prev.deletedIds,
        'dailyClosings',
        idsToTombstone,
        prev.deletedInventoryIds
      );
      return {
        ...prev,
        lastModified: now,
        dailyClosings: (prev.dailyClosings || []).filter(r => r.id !== id),
        deletedIds: prevTomb.deletedIds,
        deletedInventoryIds: prevTomb.deletedInventoryIds,
      };
    });

    deleteDailyClosingFromFirestore(id, DEFAULT_STORE_ID).catch(() => {});
    saveRootConfigToFirestore(
      {
        deletedIds: tombstoneRes.deletedIds,
        deletedInventoryIds: tombstoneRes.deletedInventoryIds,
      },
      DEFAULT_STORE_ID
    ).catch(() => {});

    showToast('Daily closing record deleted', 'info');
  };

  const handleAddOnlineAccount = (acc: Omit<OnlineAccount, 'id'>) => {
    const now = new Date().toISOString();
    const newAccount: OnlineAccount = {
      id: generateEntityId('OA'),
      ...acc,
    };

    const updatedOnlineAccounts = [...(data.onlineAccounts || []), newAccount];
    setData(prev => ({
      ...prev,
      lastModified: now,
      onlineAccountsUpdatedAt: now,
      onlineAccounts: updatedOnlineAccounts,
    }));

    saveRootConfigToFirestore({
      onlineAccounts: updatedOnlineAccounts,
      onlineAccountsUpdatedAt: now,
    }).catch(err => {
      console.warn('Firestore online account creation sync warning:', err);
    });

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
    const now = new Date().toISOString();
    const acc = (data.onlineAccounts || []).find(a => a.id === id);
    const updatedOnlineAccounts = (data.onlineAccounts || []).filter(a => a.id !== id);
    setData(prev => ({
      ...prev,
      lastModified: now,
      onlineAccountsUpdatedAt: now,
      onlineAccounts: updatedOnlineAccounts,
    }));

    saveRootConfigToFirestore({
      onlineAccounts: updatedOnlineAccounts,
      onlineAccountsUpdatedAt: now,
    }).catch(err => {
      console.warn('Firestore online account deletion sync warning:', err);
    });

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
    const now = new Date().toISOString();
    const newPurchaseId = generateEntityId('PUR');
    const newPurchase: SupplierPurchase = {
      ...purchaseData,
      id: newPurchaseId,
      updatedAt: now,
    };

    let updatedInventory = [...data.inventory];
    const itemsToRegisterImeis: { id: string; name: string; category?: string; imei?: string; imeis?: string[] }[] = [];
    const changedMap = new Map<string, InventoryItem>();

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

          let updatedVariants = existing.variants ? [...existing.variants] : undefined;
          if (updatedVariants && (purchaseItem.ram || purchaseItem.storage || purchaseItem.color || newImeis.length > 0)) {
            const vIdx = updatedVariants.findIndex(
              v =>
                (v.ram || '').toLowerCase() === (purchaseItem.ram || '').toLowerCase() &&
                (v.storage || '').toLowerCase() === (purchaseItem.storage || '').toLowerCase() &&
                (v.color || '').toLowerCase() === (purchaseItem.color || '').toLowerCase()
            );
            if (vIdx >= 0) {
              const targetV = updatedVariants[vIdx];
              updatedVariants[vIdx] = {
                ...targetV,
                qty: (Number(targetV.qty) || 0) + purchaseItem.qty,
                costPrice: purchaseItem.costPrice > 0 ? purchaseItem.costPrice : targetV.costPrice,
                salePrice: purchaseItem.salePrice && purchaseItem.salePrice > 0 ? purchaseItem.salePrice : targetV.salePrice,
                wholesalePrice: purchaseItem.wholesalePrice !== undefined ? purchaseItem.wholesalePrice : targetV.wholesalePrice,
                imeis: Array.from(new Set([...(targetV.imeis || []), ...newImeis])),
              };
            } else {
              updatedVariants.push({
                id: generateEntityId('VAR'),
                ram: purchaseItem.ram || '',
                storage: purchaseItem.storage || '',
                color: purchaseItem.color || '',
                costPrice: purchaseItem.costPrice,
                salePrice: purchaseItem.salePrice || existing.salePrice,
                wholesalePrice: purchaseItem.wholesalePrice !== undefined ? purchaseItem.wholesalePrice : existing.wholesalePrice,
                qty: purchaseItem.qty,
                imeis: newImeis,
              });
            }
          }

          const updatedItem: InventoryItem = {
            ...existing,
            category: purchaseItem.category || existing.category,
            qty: existing.qty + purchaseItem.qty,
            costPrice: purchaseItem.costPrice > 0 ? purchaseItem.costPrice : existing.costPrice,
            salePrice:
              purchaseItem.salePrice && purchaseItem.salePrice > 0
                ? purchaseItem.salePrice
                : existing.salePrice,
            wholesalePrice:
              purchaseItem.wholesalePrice !== undefined
                ? purchaseItem.wholesalePrice
                : existing.wholesalePrice,
            ram: purchaseItem.ram || existing.ram,
            storage: purchaseItem.storage || existing.storage,
            color: purchaseItem.color || existing.color,
            variants: updatedVariants,
            barcode: purchaseItem.barcode || existing.barcode,
            imei: combinedImeis[0] || existing.imei,
            imeis: combinedImeis.length > 0 ? combinedImeis : undefined,
            status: existing.status || 'ACTIVE',
            updatedAt: now,
          };

          updatedInventory[matchIndex] = updatedItem;
          changedMap.set(updatedItem.id, updatedItem);

          itemsToRegisterImeis.push({
            id: existing.id,
            name: updatedItem.name,
            category: updatedItem.category,
            imeis: newImeis,
          });
        } else {
          const newItemId = generateEntityId('STK');
          const newImeis = purchaseItem.imeis || (purchaseItem.imei ? [purchaseItem.imei] : []);
          const hasMobileSpecs = Boolean(purchaseItem.ram || purchaseItem.storage || purchaseItem.color || newImeis.length > 0);
          const newItem: InventoryItem = {
            id: newItemId,
            name: purchaseItem.name,
            category: purchaseItem.category || data.categories?.[0] || 'Android Mobile',
            costPrice: purchaseItem.costPrice,
            salePrice: purchaseItem.salePrice || Math.round(purchaseItem.costPrice * 1.15),
            wholesalePrice: purchaseItem.wholesalePrice,
            qty: purchaseItem.qty,
            ram: purchaseItem.ram,
            storage: purchaseItem.storage,
            color: purchaseItem.color,
            variants: hasMobileSpecs
              ? [
                  {
                    id: generateEntityId('VAR'),
                    ram: purchaseItem.ram || '',
                    storage: purchaseItem.storage || '',
                    color: purchaseItem.color || '',
                    costPrice: purchaseItem.costPrice,
                    salePrice: purchaseItem.salePrice || Math.round(purchaseItem.costPrice * 1.15),
                    wholesalePrice: purchaseItem.wholesalePrice,
                    qty: purchaseItem.qty,
                    imeis: newImeis,
                  },
                ]
              : undefined,
            barcode: purchaseItem.barcode,
            imei: purchaseItem.imei,
            imeis: purchaseItem.imeis,
            status: 'ACTIVE',
            createdAt: now,
            updatedAt: now,
          };
          updatedInventory = [newItem, ...updatedInventory];
          changedMap.set(newItem.id, newItem);

          itemsToRegisterImeis.push({
            id: newItem.id,
            name: newItem.name,
            category: newItem.category,
            imeis: newImeis,
          });
        }
      });
    }

    const affectedInventoryItems = Array.from(changedMap.values());
    const newLedgerEntries = newPurchase.items.map(item => ({
      id: generateEntityId('PL'),
      date: newPurchase.date,
      updatedAt: now,
      itemTitle: `${item.name} (${newPurchase.partyName})`,
      qty: item.qty,
      costPrice: item.costPrice,
      total: item.costPrice * item.qty,
    }));

    const syncedImeis = recordImeisAvailable({
      items: itemsToRegisterImeis,
      existingImeiRecords: data.imeiRecords || [],
      purchaseBillNo: newPurchase.billNo,
      purchaseParty: newPurchase.partyName,
    });

    setData(prev => ({
      ...prev,
      lastModified: now,
      inventory: updatedInventory,
      supplierPurchases: [newPurchase, ...(prev.supplierPurchases || [])],
      purchasesLedger: [...newLedgerEntries, ...(prev.purchasesLedger || [])],
      imeiRecords: syncedImeis,
    }));

    logActivity(
      'Purchase',
      `Stock Inward: ${newPurchase.partyName} (Bill #${newPurchase.billNo})`,
      `Total: ${data.settings.currency} ${newPurchase.totalAmount.toLocaleString()} | Paid: ${data.settings.currency} ${newPurchase.paidAmount.toLocaleString()} | Items: ${newPurchase.items.length}`,
      'create',
      newPurchase.id
    );

    showToast(`Purchase bill #${newPurchase.billNo} registered!`, 'success');

    // Immediately persist to dedicated Firestore subcollections ONLY (single source of truth)
    if (autoAddToInventory && affectedInventoryItems.length > 0) {
      affectedInventoryItems.forEach(item => {
        saveInventoryItemToFirestore(item, DEFAULT_STORE_ID).catch(() => {});
      });
    }
    savePurchaseToFirestore(newPurchase, DEFAULT_STORE_ID).catch(() => {});
    savePurchasesLedgerBatchToFirestore(newLedgerEntries, DEFAULT_STORE_ID).catch(() => {});
    saveImeiRecordsBatchToFirestore(syncedImeis, DEFAULT_STORE_ID).catch(() => {});
  };

  const handleUpdatePurchase = (
    purchaseId: string,
    updatedPurchaseData: Omit<SupplierPurchase, 'id'>,
    autoAddToInventory: boolean
  ) => {
    const oldPurchase = (data.supplierPurchases || []).find(p => p.id === purchaseId);
    if (!oldPurchase) return;

    const now = new Date().toISOString();
    const updatedPurchase: SupplierPurchase = {
      ...updatedPurchaseData,
      id: purchaseId,
      status: oldPurchase.status,
      updatedAt: now,
    };

    const changedInventoryMap = new Map<string, InventoryItem>();
    let updatedInventory = [...data.inventory];
    const oldAllImeis: string[] = [];

    // 1. Roll back previous purchase items & IMEIs from inventory
    oldPurchase.items.forEach(oldItem => {
      const oldItemImeis = oldItem.imeis || (oldItem.imei ? oldItem.imei.split(',').map(s => s.trim()).filter(Boolean) : []);
      oldAllImeis.push(...oldItemImeis);

      const matchIndex = updatedInventory.findIndex(
        inv =>
          inv.name.trim().toLowerCase() === oldItem.name.trim().toLowerCase() ||
          (oldItem.barcode && inv.barcode === oldItem.barcode)
      );

      if (matchIndex >= 0) {
        const existing = updatedInventory[matchIndex];
        const existingImeis =
          existing.imeis || (existing.imei ? existing.imei.split(',').map(s => s.trim()).filter(Boolean) : []);
        const remainingImeis = existingImeis.filter(
          im => !oldItemImeis.some(oIm => oIm.toLowerCase().trim() === im.toLowerCase().trim())
        );

        let updatedVariants = existing.variants ? [...existing.variants] : undefined;
        if (updatedVariants) {
          updatedVariants = updatedVariants
            .map(v => {
              const vImeis = (v.imeis || []).filter(
                im => !oldItemImeis.some(oIm => oIm.toLowerCase().trim() === im.toLowerCase().trim())
              );
              const matchesSpecs =
                (v.ram || '').toLowerCase() === (oldItem.ram || '').toLowerCase() &&
                (v.storage || '').toLowerCase() === (oldItem.storage || '').toLowerCase() &&
                (v.color || '').toLowerCase() === (oldItem.color || '').toLowerCase();
              if (matchesSpecs || (oldItemImeis.length > 0 && vImeis.length !== (v.imeis || []).length)) {
                const newVQty = Math.max(0, (Number(v.qty) || 0) - oldItem.qty);
                return { ...v, qty: newVQty, imeis: vImeis };
              }
              return v;
            })
            .filter(v => (Number(v.qty) || 0) > 0 || (v.imeis && v.imeis.length > 0));
        }

        const rolledBackItem: InventoryItem = {
          ...existing,
          qty: Math.max(0, existing.qty - oldItem.qty),
          variants: updatedVariants && updatedVariants.length > 0 ? updatedVariants : existing.variants,
          imei: remainingImeis[0] || undefined,
          imeis: remainingImeis.length > 0 ? remainingImeis : undefined,
          updatedAt: now,
        };

        updatedInventory[matchIndex] = rolledBackItem;
        changedInventoryMap.set(rolledBackItem.id, rolledBackItem);
      }
    });

    let nextImeiRecords = recordImeisReversed({
      purchaseBillNo: oldPurchase.billNo,
      reversedImeis: oldAllImeis,
      existingImeiRecords: data.imeiRecords || [],
    });

    const itemsToRegisterImeis: { id: string; name: string; category?: string; imei?: string; imeis?: string[] }[] = [];

    if (autoAddToInventory) {
      updatedPurchase.items.forEach(purchaseItem => {
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

          let updatedVariants = existing.variants ? [...existing.variants] : undefined;
          if (updatedVariants && (purchaseItem.ram || purchaseItem.storage || purchaseItem.color || newImeis.length > 0)) {
            const vIdx = updatedVariants.findIndex(
              v =>
                (v.ram || '').toLowerCase() === (purchaseItem.ram || '').toLowerCase() &&
                (v.storage || '').toLowerCase() === (purchaseItem.storage || '').toLowerCase() &&
                (v.color || '').toLowerCase() === (purchaseItem.color || '').toLowerCase()
            );
            if (vIdx >= 0) {
              const targetV = updatedVariants[vIdx];
              updatedVariants[vIdx] = {
                ...targetV,
                qty: (Number(targetV.qty) || 0) + purchaseItem.qty,
                costPrice: purchaseItem.costPrice > 0 ? purchaseItem.costPrice : targetV.costPrice,
                salePrice: purchaseItem.salePrice && purchaseItem.salePrice > 0 ? purchaseItem.salePrice : targetV.salePrice,
                wholesalePrice: purchaseItem.wholesalePrice !== undefined ? purchaseItem.wholesalePrice : targetV.wholesalePrice,
                imeis: Array.from(new Set([...(targetV.imeis || []), ...newImeis])),
              };
            } else {
              updatedVariants.push({
                id: generateEntityId('VAR'),
                ram: purchaseItem.ram || '',
                storage: purchaseItem.storage || '',
                color: purchaseItem.color || '',
                costPrice: purchaseItem.costPrice,
                salePrice: purchaseItem.salePrice || existing.salePrice,
                wholesalePrice: purchaseItem.wholesalePrice !== undefined ? purchaseItem.wholesalePrice : existing.wholesalePrice,
                qty: purchaseItem.qty,
                imeis: newImeis,
              });
            }
          }

          const updatedItem: InventoryItem = {
            ...existing,
            category: purchaseItem.category || existing.category,
            qty: existing.qty + purchaseItem.qty,
            costPrice: purchaseItem.costPrice > 0 ? purchaseItem.costPrice : existing.costPrice,
            salePrice:
              purchaseItem.salePrice && purchaseItem.salePrice > 0
                ? purchaseItem.salePrice
                : existing.salePrice,
            wholesalePrice:
              purchaseItem.wholesalePrice !== undefined
                ? purchaseItem.wholesalePrice
                : existing.wholesalePrice,
            ram: purchaseItem.ram || existing.ram,
            storage: purchaseItem.storage || existing.storage,
            color: purchaseItem.color || existing.color,
            variants: updatedVariants,
            barcode: purchaseItem.barcode || existing.barcode,
            imei: combinedImeis[0] || existing.imei,
            imeis: combinedImeis.length > 0 ? combinedImeis : undefined,
            status: existing.status || 'ACTIVE',
            updatedAt: now,
          };

          updatedInventory[matchIndex] = updatedItem;
          changedInventoryMap.set(updatedItem.id, updatedItem);

          itemsToRegisterImeis.push({
            id: existing.id,
            name: updatedItem.name,
            category: updatedItem.category,
            imeis: newImeis,
          });
        } else {
          const newItemId = generateEntityId('STK');
          const newImeis = purchaseItem.imeis || (purchaseItem.imei ? [purchaseItem.imei] : []);
          const hasMobileSpecs = Boolean(purchaseItem.ram || purchaseItem.storage || purchaseItem.color || newImeis.length > 0);
          const newItem: InventoryItem = {
            id: newItemId,
            name: purchaseItem.name,
            category: purchaseItem.category || data.categories?.[0] || 'Android Mobile',
            costPrice: purchaseItem.costPrice,
            salePrice: purchaseItem.salePrice || Math.round(purchaseItem.costPrice * 1.15),
            wholesalePrice: purchaseItem.wholesalePrice,
            qty: purchaseItem.qty,
            ram: purchaseItem.ram,
            storage: purchaseItem.storage,
            color: purchaseItem.color,
            variants: hasMobileSpecs
              ? [
                  {
                    id: generateEntityId('VAR'),
                    ram: purchaseItem.ram || '',
                    storage: purchaseItem.storage || '',
                    color: purchaseItem.color || '',
                    costPrice: purchaseItem.costPrice,
                    salePrice: purchaseItem.salePrice || Math.round(purchaseItem.costPrice * 1.15),
                    wholesalePrice: purchaseItem.wholesalePrice,
                    qty: purchaseItem.qty,
                    imeis: newImeis,
                  },
                ]
              : undefined,
            barcode: purchaseItem.barcode,
            imei: purchaseItem.imei,
            imeis: purchaseItem.imeis,
            status: 'ACTIVE',
            createdAt: now,
            updatedAt: now,
          };
          updatedInventory = [newItem, ...updatedInventory];
          changedInventoryMap.set(newItem.id, newItem);

          itemsToRegisterImeis.push({
            id: newItem.id,
            name: newItem.name,
            category: newItem.category,
            imeis: newImeis,
          });
        }
      });
    }

    const syncedImeis = recordImeisAvailable({
      items: itemsToRegisterImeis,
      existingImeiRecords: nextImeiRecords,
      purchaseBillNo: updatedPurchase.billNo,
      purchaseParty: updatedPurchase.partyName,
    });

    const oldSignatures = new Set(
      oldPurchase.items.map(it => `${oldPurchase.date}|${it.name} (${oldPurchase.partyName})|${it.qty}|${it.costPrice}`)
    );
    const filteredOldLedger = (data.purchasesLedger || []).filter(
      entry => !oldSignatures.has(`${entry.date}|${entry.itemTitle}|${entry.qty}|${entry.costPrice}`)
    );
    const newLedgerEntries = updatedPurchase.items.map(item => ({
      id: generateEntityId('PL'),
      date: updatedPurchase.date,
      updatedAt: now,
      itemTitle: `${item.name} (${updatedPurchase.partyName})`,
      qty: item.qty,
      costPrice: item.costPrice,
      total: item.costPrice * item.qty,
    }));

    const syncedLedger = [...newLedgerEntries, ...filteredOldLedger];

    setData(prev => ({
      ...prev,
      lastModified: now,
      inventory: updatedInventory,
      supplierPurchases: (prev.supplierPurchases || []).map(p => (p.id === purchaseId ? updatedPurchase : p)),
      purchasesLedger: syncedLedger,
      imeiRecords: syncedImeis,
    }));

    logActivity(
      'Purchase',
      `Updated Stock Inward: ${updatedPurchase.partyName} (Bill #${updatedPurchase.billNo})`,
      `Total: ${data.settings.currency} ${updatedPurchase.totalAmount.toLocaleString()} | Paid: ${data.settings.currency} ${updatedPurchase.paidAmount.toLocaleString()} | Items: ${updatedPurchase.items.length}`,
      'update',
      updatedPurchase.id
    );

    showToast(`Purchase bill #${updatedPurchase.billNo} updated & synced!`, 'success');

    Array.from(changedInventoryMap.values()).forEach(item => {
      saveInventoryItemToFirestore(item, DEFAULT_STORE_ID).catch(() => {});
    });
    savePurchaseToFirestore(updatedPurchase, DEFAULT_STORE_ID).catch(() => {});
    savePurchasesLedgerBatchToFirestore(syncedLedger, DEFAULT_STORE_ID).catch(() => {});
    saveImeiRecordsBatchToFirestore(syncedImeis, DEFAULT_STORE_ID).catch(() => {});
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

    const changedInventory: InventoryItem[] = [];
    const updatedInventory = [...data.inventory];
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

        const now = new Date().toISOString();
        const updatedItem: InventoryItem = {
          ...existing,
          qty: Math.max(0, existing.qty - purchaseItem.qty),
          imei: remainingImeis.length > 0 ? remainingImeis.join(', ') : undefined,
          imeis: remainingImeis.length > 0 ? remainingImeis : undefined,
          updatedAt: now,
        };
        updatedInventory[matchIndex] = updatedItem;
        changedInventory.push(updatedItem);
      }
    });

    const revNow = new Date().toISOString();
    const syncedImeis = recordImeisReversed({
      purchaseBillNo: purchase.billNo,
      reversedImeis: allPurchaseImeis,
      existingImeiRecords: data.imeiRecords || [],
    });

    const syncedLedger = (data.purchasesLedger || []).map(entry => {
      if (entry.itemTitle.includes(purchase.partyName) || entry.id.includes(purchase.id)) {
        return { ...entry, isReversed: true, updatedAt: revNow };
      }
      return entry;
    });

    const reversedPurchase: SupplierPurchase = {
      ...purchase,
      status: 'REVERSED' as const,
      reversedAt: revNow,
      updatedAt: revNow,
      reversedBy,
      reversalReason: reason,
      reversalNotes: notes,
    };

    setData(prev => ({
      ...prev,
      lastModified: revNow,
      inventory: updatedInventory,
      imeiRecords: syncedImeis,
      purchasesLedger: syncedLedger,
      supplierPurchases: (prev.supplierPurchases || []).map(p => (p.id === purchaseId ? reversedPurchase : p)),
    }));

    changedInventory.forEach(item => {
      saveInventoryItemToFirestore(item, DEFAULT_STORE_ID).catch(() => {});
    });
    savePurchaseToFirestore(reversedPurchase, DEFAULT_STORE_ID).catch(() => {});
    savePurchasesLedgerBatchToFirestore(syncedLedger, DEFAULT_STORE_ID).catch(() => {});
    saveImeiRecordsBatchToFirestore(syncedImeis, DEFAULT_STORE_ID).catch(() => {});

    logActivity(
      'Purchase',
      `Cancelled / Reversed Purchase: Bill #${purchase.billNo}`,
      `Supplier: ${purchase.partyName} | Reason: ${reason} | Stock reversed (${purchase.items.length} items) | Financial reversal: ${data.settings.currency} ${purchase.paidAmount.toLocaleString()} | Reversed by ${reversedBy}`,
      'reversal',
      purchase.billNo
    );

    showToast(`Purchase #${purchase.billNo} has been safely reversed. Stock restored!`, 'success');
  };

  const handleSettlePurchaseDue = ({
    purchaseId,
    paymentAmount,
    paymentMethod,
    notes,
  }: {
    purchaseId: string;
    paymentAmount: number;
    paymentMethod: string;
    notes?: string;
  }) => {
    if (paymentAmount <= 0) {
      showToast('Payment amount must be greater than 0', 'warning');
      return;
    }

    const purchase = (data.supplierPurchases || []).find(p => p.id === purchaseId);
    if (!purchase) return;

    if ((purchase.balanceDue || 0) <= 0) {
      showToast('This purchase bill is already fully paid', 'info');
      return;
    }

    const now = new Date().toISOString();
    const newPaidAmount = (purchase.paidAmount || 0) + paymentAmount;
    const newBalanceDue = Math.max(0, purchase.totalAmount - newPaidAmount);
    const settledPurchase: SupplierPurchase = {
      ...purchase,
      paidAmount: newPaidAmount,
      balanceDue: newBalanceDue,
      updatedAt: now,
      notes: notes ? `${purchase.notes || ''}\n[Payment ${paymentMethod}: ${data.settings.currency} ${paymentAmount.toLocaleString()} - ${notes}]`.trim() : purchase.notes,
    };

    setData(prev => ({
      ...prev,
      lastModified: now,
      supplierPurchases: (prev.supplierPurchases || []).map(p => (p.id === purchaseId ? settledPurchase : p)),
    }));

    savePurchaseToFirestore(settledPurchase, DEFAULT_STORE_ID).catch(() => {});

    logActivity(
      'Purchase',
      `Supplier Payment Settled: ${purchase.partyName} (Bill #${purchase.billNo})`,
      `Paid: ${data.settings.currency} ${paymentAmount.toLocaleString()} via ${paymentMethod} | Remaining Due: ${data.settings.currency} ${newBalanceDue.toLocaleString()}`,
      'update',
      purchase.id
    );

    showToast(`Payment of ${data.settings.currency} ${paymentAmount.toLocaleString()} recorded for Bill #${purchase.billNo}!`, 'success');
  };

  // Settings & Theme
  const handleSaveSettings = (newSettings: ShopSettings) => {
    if (!hasPermission(data.currentRole || 'admin', 'canChangeSettings')) {
      showToast('Permission Denied: Modifying shop settings is restricted to Administrators', 'error');
      return;
    }

    const now = new Date().toISOString();
    setData(prev => ({
      ...prev,
      lastModified: now,
      settingsUpdatedAt: now,
      settings: newSettings,
    }));

    saveRootConfigToFirestore({
      settings: newSettings,
      settingsUpdatedAt: now,
    }).catch(err => {
      console.warn('Firestore settings update warning:', err);
    });

    logActivity('Settings', 'Updated Shop Settings', `Shop: ${newSettings.shopName}`, 'update');
    showToast('Shop settings saved successfully', 'success');
  };

  const handleToggleTheme = () => {
    const now = new Date().toISOString();
    const currentTheme = dataRef.current.settings?.theme || 'blue-white';
    const newTheme = currentTheme === 'dark' ? 'blue-white' : 'dark';
    const nextSettings: ShopSettings = {
      ...dataRef.current.settings,
      theme: newTheme,
    };

    setData(prev => ({
      ...prev,
      lastModified: now,
      settingsUpdatedAt: now,
      settings: {
        ...prev.settings,
        theme: newTheme,
      },
    }));

    saveRootConfigToFirestore({
      settings: nextSettings,
      settingsUpdatedAt: now,
    }).catch(() => {});
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
    clearCurrentSession();
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
          onSyncUsers={syncedUsers => {
            setData(prev => ({
              ...prev,
              users: syncedUsers,
            }));
          }}
          onAuthSuccess={(user, rememberMe = true) => {
            const activeStoreId = DEFAULT_STORE_ID;
            setActiveStoreId(activeStoreId);
            if (rememberMe) {
              saveCurrentSession(user);
            } else {
              clearCurrentSession();
            }

            if (user.role === 'salesman') {
              setActiveTab('pos');
            }

            // 1. Open app IMMEDIATELY (<50ms) using already-mounted / local cached store data
            const localStoreData = loadStoredData(activeStoreId);
            setData(prev => {
              const base = (prev.inventory && prev.inventory.length > 0) || (prev.sales && prev.sales.length > 0)
                ? mergeAppData(localStoreData, prev)
                : localStoreData;
              const currentUsers = (base.users || []).filter(
                u => u && u.id && (u.role !== 'admin' || u.id === user.id)
              );
              const updatedUsers = currentUsers.some(u => u.id === user.id) ? currentUsers : [user, ...currentUsers];

              return {
                ...base,
                users: updatedUsers,
                currentUser: user,
                currentRole: user.role,
              };
            });

            // 2. Immediately rehydrate full images & offline data from IndexedDB right after login
            loadFromIndexedDB(activeStoreId)
              .then(idbData => {
                if (idbData) {
                  setData(prev => {
                    const merged = mergeAppData(prev, idbData);
                    return {
                      ...merged,
                      currentUser: prev.currentUser || user,
                      currentRole: prev.currentRole || user.role,
                    };
                  });
                }
              })
              .catch(() => {});

            // 3. Background refresh & deep merge from Cloud Firestore (including any prior USR-ADM-* shadow writes)
            Promise.all([
              loadAppDataFromFirestore(activeStoreId).catch(() => null),
              user.storeId && user.storeId !== activeStoreId
                ? loadAppDataFromFirestore(user.storeId).catch(() => null)
                : Promise.resolve(null),
            ])
              .then(([remoteData, shadowRemote]) => {
                if (remoteData || shadowRemote) {
                  setData(prev => {
                    let merged = prev;
                    if (shadowRemote) merged = mergeAppData(merged, shadowRemote);
                    if (remoteData) merged = mergeAppData(merged, remoteData);

                    const rUsers = (merged.users || []).filter(
                      u => u && u.id && (u.role !== 'admin' || u.id === user.id)
                    );
                    const rUpdatedUsers = rUsers.some(u => u.id === user.id) ? rUsers : [user, ...rUsers];

                    const finalData: AppData = {
                      ...merged,
                      users: rUpdatedUsers,
                      currentUser: prev.currentUser || user,
                      currentRole: prev.currentRole || user.role,
                    };
                    saveStoredData(finalData, activeStoreId);

                    // Flush only pending offline writes (never bulk upload entire local state on login!)
                    processPendingWritesQueue().catch(() => {});

                    return finalData;
                  });
                }
              })
              .catch(err => {
                console.warn('Background remote load on auth notice:', err);
              });

            saveUserToFirestore(user, activeStoreId).catch(() => {});
          }}
          settings={data.settings}
        />
      </>
    );
  }

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-slate-50 text-slate-800 app-root-container">
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
        {gmpQuotaExceeded && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
            <span>
              Google Maps Platform quota reached. If you are the app owner, visit{' '}
              <a
                href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold text-amber-950 hover:text-amber-800"
              >
                maps developer site
              </a>{' '}
              for instructions to update your account.
            </span>
          </div>
        )}
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
          onRefreshData={handleManualSyncData}
          appData={data}
        />

        {/* Scrollable Tab Content - Optimized with Conditional Rendering (Unmounts Inactive Tabs) */}
        <main
          className={`flex-1 ${
            activeTab === 'pos'
              ? 'p-2 sm:p-3 lg:p-3 overflow-y-auto lg:overflow-hidden pb-3 lg:pb-2'
              : 'overflow-y-auto p-2.5 sm:p-5 pb-6 lg:pb-6'
          }`}
        >
          <div className={activeTab === 'pos' ? 'w-full h-full flex flex-col min-h-0' : 'max-w-7xl mx-auto'}>
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
                supplierPurchases={data.supplierPurchases || []}
                imeiRecords={data.imeiRecords || []}
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
                onPermanentDeleteItem={handlePermanentDeleteInventory}
                onRestoreItem={handleRestoreInventory}
                onAddCategory={handleAddCategory}
                onDeleteCategory={handleDeleteCategory}
                onRenameCategory={handleRenameCategory}
                onOpenPdfReport={(cat?: string) => handleOpenPdfReport('inventory', cat)}
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
                appData={data}
                onSavePurchase={handleSavePurchase}
                onUpdatePurchase={handleUpdatePurchase}
                onDeletePurchase={handleDeletePurchase}
                onReversePurchase={handleReversePurchase}
                onSettlePurchaseDue={handleSettlePurchaseDue}
                onAddInventoryProduct={handleAddProductFromPurchases}
                onAddCategory={handleAddCategory}
                onRenameCategory={handleRenameCategory}
                onOpenPdfReport={() => handleOpenPdfReport('purchases')}
                onRecoverMissingPurchases={handleRecoverMissingPurchases}
              />
            )}

            {activeTab === 'barcode' && (
              <BarcodeGenerator inventory={data.inventory} settings={data.settings} />
            )}

            {activeTab === 'khata' && (
              <KhataTab
                khata={data.khata}
                settings={data.settings}
                sales={data.sales || []}
                isAdmin={(data.currentRole || 'admin') === 'admin'}
                onOpenAddModal={() => setAddKhataModalOpen(true)}
                onOpenSettleModal={cust => {
                  setSettleCustomer(cust);
                  setSettleKhataModalOpen(true);
                }}
                onDeleteCustomer={handleDeleteKhataCustomer}
                onAddTransaction={handleUpdateKhataBalance}
                onUpdateCustomer={handleSaveKhataCustomer}
                onDeleteTransaction={handleDeleteKhataTransaction}
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
        onRenameCategory={handleRenameCategory}
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
        onRenameCategory={handleRenameExpenseCategory}
      />

      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        settings={data.settings}
        onSaveSettings={handleSaveSettings}
        fullData={data}
        onRecoverMissingData={handleRecoverMissingData}
        onReplaceData={(newData: AppData) => {
          const now = new Date().toISOString();
          const stamped: AppData = {
            ...newData,
            lastModified: now,
            settingsUpdatedAt: now,
            categoriesUpdatedAt: now,
            expenseCategoriesUpdatedAt: now,
            onlineAccountsUpdatedAt: now,
            tabPreferencesUpdatedAt: now,
            usersUpdatedAt: now,
            migrationDone: true,
            currentUser: data.currentUser,
            currentRole: data.currentRole || data.currentUser?.role || 'admin',
          };
          setData(stamped);
          saveStoredData(stamped, DEFAULT_STORE_ID);
          saveAppDataToFirestore(stamped, DEFAULT_STORE_ID).catch(() => {});
          showToast('Backup restored successfully', 'success');
        }}
        onUpdateUsers={(users: UserAccount[]) => {
          const now = new Date().toISOString();
          const activeSid = DEFAULT_STORE_ID;
          const updatedData = {
            ...data,
            users,
            usersUpdatedAt: now,
            lastModified: now,
          };
          setData(updatedData);
          saveStoredData(updatedData, activeSid);
          saveRootConfigToFirestore(
            { users, usersUpdatedAt: now },
            activeSid
          ).catch(err => {
            console.warn('Firestore users sync warning:', err);
          });
          users.forEach(u => saveUserToFirestore(u, activeSid).catch(() => {}));
        }}
      />

      <TabSettingsModal
        isOpen={tabSettingsModalOpen}
        onClose={() => setTabSettingsModalOpen(false)}
        activeTab={activeTab}
        preferences={data.tabPreferences || {}}
        onSavePreferences={(tabId: string, prefs: Record<string, unknown>) => {
          const now = new Date().toISOString();
          const nextTabPreferences = {
            ...(dataRef.current.tabPreferences || {}),
            [tabId]: prefs,
          };
          setData(prev => ({
            ...prev,
            lastModified: now,
            tabPreferencesUpdatedAt: now,
            tabPreferences: {
              ...(prev.tabPreferences || {}),
              [tabId]: prefs,
            },
          }));
          saveRootConfigToFirestore({
            tabPreferences: nextTabPreferences,
            tabPreferencesUpdatedAt: now,
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
        initialCategory={pdfModalCategory}
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
