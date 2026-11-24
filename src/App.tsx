import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  AppData,
  ShopSettings,
  ActivityLog,
  ExpenseItem,
  DailyClosingRecord,
  OnlineAccount,
  SupplierPurchase,
  PurchaseItem,
  InventoryItem,
  MobileVariant,
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
  loadAppDataFromFirestoreWithMeta,
  reconcileWithAuthoritativeCloud,
  getPendingWrites,
  clearActivitiesFromFirestore,
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
  hasPendingWriteForCollectionDoc,
  clearOfflineSaleJournal,
  enqueuePreservedLocalSalesIfMissingFromCloud,
  toValidFirestoreDocId,
  CollectionDeltaEvent,
  DEFAULT_STORE_ID,
} from './utils/storage';
import { recordImeisReversed, recordImeisAvailable, diffChangedImeiRecords } from './utils/imeiManager';
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
      setData(prev => {
        const activeUser = prev.currentUser || getSavedSessionUser() || sessionUser || updatedData.currentUser;
        if (activeUser) {
          return {
            ...updatedData,
            currentUser: activeUser,
            currentRole: prev.currentRole || activeUser.role || 'admin',
          };
        }
        return updatedData;
      });
      isInitialSyncDoneRef.current = true;
    }, DEFAULT_STORE_ID);
  }, []);

  // Safeguard: Ensure salesman role is never on admin-only tabs
  useEffect(() => {
    if (data.currentRole === 'salesman') {
      const restrictedTabs = ['dashboard', 'reports', 'activity'];
      if (restrictedTabs.includes(activeTab)) {
        setActiveTab('pos');
      }
    }
  }, [data.currentRole, activeTab]);

  // Apply visual theme to document root & keep system status bar theme-color synced
  useEffect(() => {
    const activeTheme = data.settings?.theme || 'blue-white';
    document.documentElement.setAttribute('data-theme', activeTheme);
    if (activeTheme === 'dark' || activeTheme === 'gold-black') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      const color =
        activeTheme === 'dark'
          ? '#000000'
          : activeTheme === 'gold-black'
          ? '#09090c'
          : '#ffffff';
      metaTheme.setAttribute('content', color);
    }
  }, [data.settings?.theme]);

  // iOS-only: prevent initial-load viewport scroll drift & keep root anchored edge-to-edge without rotation
  useEffect(() => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) ||
      (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!isIOS) return;

    document.documentElement.classList.add('ios-device');

    const syncIOSViewport = () => {
      const active = document.activeElement as HTMLElement | null;
      const isTyping =
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.tagName === 'SELECT' ||
          active.isContentEditable);

      document.documentElement.style.setProperty('--ios-app-height', `${Math.round(window.innerHeight)}px`);

      if (!isTyping && (window.scrollY !== 0 || window.scrollX !== 0)) {
        window.scrollTo(0, 0);
      }
    };

    const handleFocusOut = () => {
      window.setTimeout(syncIOSViewport, 60);
    };

    syncIOSViewport();
    const t1 = window.setTimeout(syncIOSViewport, 50);
    const t2 = window.setTimeout(syncIOSViewport, 250);
    const t3 = window.setTimeout(syncIOSViewport, 600);

    window.addEventListener('resize', syncIOSViewport);
    window.addEventListener('orientationchange', syncIOSViewport);
    window.addEventListener('pageshow', syncIOSViewport);
    document.addEventListener('visibilitychange', syncIOSViewport);
    window.addEventListener('focusout', handleFocusOut);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.removeEventListener('resize', syncIOSViewport);
      window.removeEventListener('orientationchange', syncIOSViewport);
      window.removeEventListener('pageshow', syncIOSViewport);
      document.removeEventListener('visibilitychange', syncIOSViewport);
      window.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

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
                if (hasPendingWriteForCollectionDoc(colKey, rawId)) {
                  return true;
                }
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
                const deletedTxIds = Array.from(
                  new Set([
                    ...(Array.isArray(existingItem.deletedTxIds) ? existingItem.deletedTxIds : []),
                    ...(Array.isArray((item as any).deletedTxIds) ? (item as any).deletedTxIds : []),
                  ])
                );
                const deletedTxSet = new Set(deletedTxIds);
                const incHist = Array.isArray((item as any).history) ? (item as any).history : [];
                mergedItem.deletedTxIds = deletedTxIds.length > 0 ? deletedTxIds : undefined;
                mergedItem.history = incHist.filter((tx: any) => !deletedTxSet.has(tx.id));
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
            ...reloadedData,
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
      showInPos: acc.showInPos ?? true,
      updatedAt: now,
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
      `Type: ${acc.bankType || 'Digital Wallet'}${acc.accountNumber ? ` (${acc.accountNumber})` : ''}`,
      'create',
      newAccount.id
    );

    showToast(`Online account "${acc.name}" added`, 'success');
  };

  const handleUpdateOnlineAccount = (updatedAcc: OnlineAccount, silent = false) => {
    const now = new Date().toISOString();
    const nextAcc: OnlineAccount = {
      ...updatedAcc,
      updatedAt: now,
    };
    const updatedOnlineAccounts = (data.onlineAccounts || []).map(a =>
      a.id === nextAcc.id ? nextAcc : a
    );
    setData(prev => ({
      ...prev,
      lastModified: now,
      onlineAccountsUpdatedAt: now,
      onlineAccounts: (prev.onlineAccounts || []).map(a => (a.id === nextAcc.id ? nextAcc : a)),
    }));

    saveRootConfigToFirestore({
      onlineAccounts: updatedOnlineAccounts,
      onlineAccountsUpdatedAt: now,
    }).catch(err => {
      console.warn('Firestore online account update sync warning:', err);
    });

    if (!silent) {
      logActivity(
        'Settings',
        `Updated Online Account: ${nextAcc.name}`,
        `Type: ${nextAcc.bankType || 'Digital Wallet'}${nextAcc.accountNumber ? ` (${nextAcc.accountNumber})` : ''} | POS Cart: ${nextAcc.showInPos === false ? 'Hidden' : 'Visible'}`,
        'update',
        nextAcc.id
      );
      showToast(`Account "${nextAcc.name}" updated`, 'success');
    }
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

  const findPurchaseInventoryMatchIndex = (list: InventoryItem[], purchaseItem: PurchaseItem): number => {
    const pName = (purchaseItem.name || '').trim().toLowerCase();
    const pCat = (purchaseItem.category || '').trim().toLowerCase();
    const pBarcode = (purchaseItem.barcode || '').trim().toLowerCase();

    if (pBarcode) {
      const bcIdx = list.findIndex(
        inv =>
          (inv.barcode || '').trim().toLowerCase() === pBarcode &&
          (!pCat || !(inv.category || '').trim() || (inv.category || '').trim().toLowerCase() === pCat)
      );
      if (bcIdx >= 0) return bcIdx;
    }

    if (pCat) {
      const exactCatIdx = list.findIndex(
        inv =>
          (inv.name || '').trim().toLowerCase() === pName &&
          (inv.category || '').trim().toLowerCase() === pCat
      );
      if (exactCatIdx >= 0) return exactCatIdx;
    }

    return list.findIndex(
      inv =>
        (inv.name || '').trim().toLowerCase() === pName &&
        (!pCat || !(inv.category || '').trim() || (inv.category || '').trim().toLowerCase() === pCat)
    );
  };

  const applyPurchaseItemToInventory = (
    list: InventoryItem[],
    purchaseItem: PurchaseItem,
    now: string,
    defaultCategory: string
  ): { nextList: InventoryItem[]; changedItem: InventoryItem; imeiEntry: { id: string; name: string; category?: string; imei?: string; imeis?: string[] } } => {
    const norm = (s?: string) => (s || '').trim().toLowerCase();
    const splitImeis = (imeis?: string[], imei?: string) =>
      Array.from(
        new Set([
          ...(imeis || []),
          ...(imei ? imei.split(',') : []),
        ].map(s => s.trim()).filter(Boolean))
      );

    const matchIndex = findPurchaseInventoryMatchIndex(list, purchaseItem);
    const newImeis = splitImeis(purchaseItem.imeis, purchaseItem.imei);
    const pNote = (purchaseItem.note || '').trim();
    const pCost = Number(purchaseItem.costPrice) || 0;
    const pSaleInput = purchaseItem.salePrice && Number(purchaseItem.salePrice) > 0 ? Number(purchaseItem.salePrice) : undefined;
    const pWholesale = purchaseItem.wholesalePrice !== undefined ? Number(purchaseItem.wholesalePrice) : undefined;

    if (matchIndex >= 0) {
      const existing = list[matchIndex];
      const existingImeis = splitImeis(existing.imeis, existing.imei);
      const combinedImeis = Array.from(new Set([...existingImeis, ...newImeis]));
      const resolvedSale = pSaleInput ?? existing.salePrice;

      const hasExistingVariants = Boolean(existing.variants && existing.variants.length > 0);
      const existingWholesaleNum = existing.wholesalePrice !== undefined ? Number(existing.wholesalePrice) : undefined;

      const priceDiffersFromExisting =
        (pCost > 0 && pCost !== Number(existing.costPrice || 0)) ||
        (pSaleInput !== undefined && Math.round(pSaleInput) !== Math.round(Number(existing.salePrice || 0))) ||
        (pWholesale !== undefined && pWholesale !== existingWholesaleNum);
      const specsDifferFromExisting =
        norm(purchaseItem.ram) !== norm(existing.ram) ||
        norm(purchaseItem.storage) !== norm(existing.storage) ||
        norm(purchaseItem.color) !== norm(existing.color);
      const noteDiffersFromExisting = norm(pNote) !== norm(existing.note);
      const hasAnyVariantSignals = Boolean(
        purchaseItem.ram ||
          purchaseItem.storage ||
          purchaseItem.color ||
          newImeis.length > 0 ||
          pNote ||
          priceDiffersFromExisting
      );

      let updatedVariants: MobileVariant[] | undefined = hasExistingVariants ? [...existing.variants!] : undefined;

      // Preserve pre-existing stock as Variant #1 when incoming stock has different prices, specs, note, or variant traits
      if (!updatedVariants && existing.qty > 0 && (priceDiffersFromExisting || specsDifferFromExisting || noteDiffersFromExisting || hasAnyVariantSignals)) {
        updatedVariants = [
          {
            id: generateEntityId('VAR'),
            ram: existing.ram || '',
            storage: existing.storage || '',
            color: existing.color || '',
            costPrice: existing.costPrice,
            salePrice: existing.salePrice,
            wholesalePrice: existing.wholesalePrice,
            qty: existing.qty,
            imeis: existingImeis,
            note: existing.note || undefined,
          },
        ];
      }

      if (updatedVariants) {
        const vIdx = updatedVariants.findIndex(v => {
          const specsMatch =
            norm(v.ram) === norm(purchaseItem.ram) &&
            norm(v.storage) === norm(purchaseItem.storage) &&
            norm(v.color) === norm(purchaseItem.color);
          if (!specsMatch) return false;

          const vCost = v.costPrice !== '' && v.costPrice !== undefined ? Number(v.costPrice) : existing.costPrice;
          const vSale = v.salePrice !== '' && v.salePrice !== undefined ? Number(v.salePrice) : existing.salePrice;
          const vWholesale =
            v.wholesalePrice !== '' && v.wholesalePrice !== undefined
              ? Number(v.wholesalePrice)
              : existing.wholesalePrice;

          const costMatches = pCost <= 0 || Number(vCost) === pCost;
          const saleMatches = pSaleInput === undefined || Math.round(Number(vSale)) === Math.round(pSaleInput);
          const wholesaleMatches =
            pWholesale === undefined
              ? vWholesale === existing.wholesalePrice || v.wholesalePrice === '' || v.wholesalePrice === undefined
              : vWholesale !== undefined && Number(vWholesale) === pWholesale;
          const noteMatches = norm(v.note) === norm(pNote);

          return costMatches && saleMatches && wholesaleMatches && noteMatches;
        });

        if (vIdx >= 0) {
          const targetV = updatedVariants[vIdx];
          updatedVariants[vIdx] = {
            ...targetV,
            qty: (Number(targetV.qty) || 0) + purchaseItem.qty,
            imeis: Array.from(new Set([...(targetV.imeis || []), ...newImeis])),
            note: targetV.note || (pNote || undefined),
          };
        } else {
          updatedVariants.push({
            id: generateEntityId('VAR'),
            ram: purchaseItem.ram || '',
            storage: purchaseItem.storage || '',
            color: purchaseItem.color || '',
            costPrice: pCost > 0 ? pCost : existing.costPrice,
            salePrice: resolvedSale,
            wholesalePrice: pWholesale !== undefined ? pWholesale : existing.wholesalePrice,
            qty: purchaseItem.qty,
            imeis: newImeis,
            note: pNote || undefined,
          });
        }
      }

      // Only update top-level item prices if the product previously had 0 stock (empty restock)
      const shouldKeepExistingTopPrices = existing.qty > 0;
      const updatedItem: InventoryItem = {
        ...existing,
        category: purchaseItem.category || existing.category,
        qty: existing.qty + purchaseItem.qty,
        costPrice: shouldKeepExistingTopPrices ? existing.costPrice : pCost > 0 ? pCost : existing.costPrice,
        salePrice: shouldKeepExistingTopPrices ? existing.salePrice : resolvedSale,
        wholesalePrice: shouldKeepExistingTopPrices
          ? existing.wholesalePrice
          : pWholesale !== undefined
          ? pWholesale
          : existing.wholesalePrice,
        ram: shouldKeepExistingTopPrices ? existing.ram || purchaseItem.ram : purchaseItem.ram || existing.ram,
        storage: shouldKeepExistingTopPrices ? existing.storage || purchaseItem.storage : purchaseItem.storage || existing.storage,
        color: shouldKeepExistingTopPrices ? existing.color || purchaseItem.color : purchaseItem.color || existing.color,
        note: shouldKeepExistingTopPrices ? existing.note : pNote || existing.note,
        variants: updatedVariants,
        barcode: purchaseItem.barcode || existing.barcode,
        imei: combinedImeis[0] || existing.imei,
        imeis: combinedImeis.length > 0 ? combinedImeis : undefined,
        status: existing.status || 'ACTIVE',
        updatedAt: now,
      };

      const nextList = [...list];
      nextList[matchIndex] = updatedItem;
      return {
        nextList,
        changedItem: updatedItem,
        imeiEntry: {
          id: existing.id,
          name: updatedItem.name,
          category: updatedItem.category,
          imeis: newImeis,
        },
      };
    }

    const newItemId = generateEntityId('STK');
    const resolvedNewSale = pSaleInput ?? Math.round(pCost * 1.15);
    const hasMobileSpecs = Boolean(purchaseItem.ram || purchaseItem.storage || purchaseItem.color || newImeis.length > 0);
    const newItem: InventoryItem = {
      id: newItemId,
      name: purchaseItem.name,
      category: purchaseItem.category || defaultCategory,
      costPrice: pCost,
      salePrice: resolvedNewSale,
      wholesalePrice: pWholesale,
      qty: purchaseItem.qty,
      ram: purchaseItem.ram,
      storage: purchaseItem.storage,
      color: purchaseItem.color,
      note: pNote || undefined,
      variants: hasMobileSpecs
        ? [
            {
              id: generateEntityId('VAR'),
              ram: purchaseItem.ram || '',
              storage: purchaseItem.storage || '',
              color: purchaseItem.color || '',
              costPrice: pCost,
              salePrice: resolvedNewSale,
              wholesalePrice: pWholesale,
              qty: purchaseItem.qty,
              imeis: newImeis,
              note: pNote || undefined,
            },
          ]
        : undefined,
      barcode: purchaseItem.barcode,
      imei: newImeis[0] || purchaseItem.imei,
      imeis: newImeis.length > 0 ? newImeis : purchaseItem.imeis,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };

    return {
      nextList: [newItem, ...list],
      changedItem: newItem,
      imeiEntry: {
        id: newItem.id,
        name: newItem.name,
        category: newItem.category,
        imeis: newImeis,
      },
    };
  };

  const rollbackPurchaseItemFromInventory = (
    list: InventoryItem[],
    oldItem: PurchaseItem,
    now: string
  ): { nextList: InventoryItem[]; changedItem?: InventoryItem; oldItemImeis: string[] } => {
    const norm = (s?: string) => (s || '').trim().toLowerCase();
    const oldItemImeis = Array.from(
      new Set([
        ...(oldItem.imeis || []),
        ...(oldItem.imei ? oldItem.imei.split(',') : []),
      ].map(s => s.trim()).filter(Boolean))
    );

    const matchIndex = findPurchaseInventoryMatchIndex(list, oldItem);
    if (matchIndex < 0) {
      return { nextList: list, oldItemImeis };
    }

    const existing = list[matchIndex];
    const existingImeis = Array.from(
      new Set([
        ...(existing.imeis || []),
        ...(existing.imei ? existing.imei.split(',') : []),
      ].map(s => s.trim()).filter(Boolean))
    );
    const remainingImeis = existingImeis.filter(
      im => !oldItemImeis.some(oIm => oIm.toLowerCase() === im.toLowerCase())
    );

    let updatedVariants = existing.variants ? [...existing.variants] : undefined;
    if (updatedVariants && updatedVariants.length > 0) {
      let targetVIdx = -1;

      if (oldItemImeis.length > 0) {
        targetVIdx = updatedVariants.findIndex(v =>
          (v.imeis || []).some(im => oldItemImeis.some(oIm => oIm.toLowerCase() === im.trim().toLowerCase()))
        );
      }

      if (targetVIdx < 0) {
        targetVIdx = updatedVariants.findIndex(v => {
          const specsMatch =
            norm(v.ram) === norm(oldItem.ram) &&
            norm(v.storage) === norm(oldItem.storage) &&
            norm(v.color) === norm(oldItem.color);
          const vCost = v.costPrice !== '' && v.costPrice !== undefined ? Number(v.costPrice) : existing.costPrice;
          const vSale = v.salePrice !== '' && v.salePrice !== undefined ? Number(v.salePrice) : existing.salePrice;
          const costMatch = (Number(oldItem.costPrice) || 0) === 0 || Number(vCost) === Number(oldItem.costPrice);
          const saleMatch = !oldItem.salePrice || Math.round(Number(vSale)) === Math.round(Number(oldItem.salePrice));
          const noteMatch = norm(v.note) === norm(oldItem.note);
          return specsMatch && costMatch && saleMatch && noteMatch;
        });
      }

      if (targetVIdx < 0) {
        targetVIdx = updatedVariants.findIndex(
          v =>
            norm(v.ram) === norm(oldItem.ram) &&
            norm(v.storage) === norm(oldItem.storage) &&
            norm(v.color) === norm(oldItem.color)
        );
      }

      if (targetVIdx >= 0) {
        const tv = updatedVariants[targetVIdx];
        const remainingVImeis = (tv.imeis || []).filter(
          im => !oldItemImeis.some(oIm => oIm.toLowerCase() === im.trim().toLowerCase())
        );
        const newVQty = Math.max(0, (Number(tv.qty) || 0) - oldItem.qty);
        updatedVariants[targetVIdx] = { ...tv, qty: newVQty, imeis: remainingVImeis };
      }

      updatedVariants = updatedVariants.filter(v => (Number(v.qty) || 0) > 0 || (v.imeis && v.imeis.length > 0));
    }

    const rolledBackItem: InventoryItem = {
      ...existing,
      qty: Math.max(0, existing.qty - oldItem.qty),
      variants: updatedVariants && updatedVariants.length > 0 ? updatedVariants : undefined,
      imei: remainingImeis[0] || undefined,
      imeis: remainingImeis.length > 0 ? remainingImeis : undefined,
      updatedAt: now,
    };

    const nextList = [...list];
    nextList[matchIndex] = rolledBackItem;
    return { nextList, changedItem: rolledBackItem, oldItemImeis };
  };

  // Purchases Handlers
  const handleSavePurchase = (
    purchaseData: Omit<SupplierPurchase, 'id'>,
    autoAddToInventory: boolean
  ) => {
    const activeRole = data.currentRole || 'admin';
    if (!hasPermission(activeRole, 'canManagePurchases')) {
      showToast('Permission Denied: Stock inward entry is not permitted for your role', 'error');
      return;
    }

    const isSalesmanUser = activeRole === 'salesman';
    const now = new Date().toISOString();
    const newPurchaseId = generateEntityId('PUR');
    const newPurchase: SupplierPurchase = {
      ...purchaseData,
      id: newPurchaseId,
      partyPhone: purchaseData.partyPhone?.trim() || undefined,
      paidAmount: isSalesmanUser ? 0 : purchaseData.paidAmount,
      balanceDue: isSalesmanUser ? purchaseData.totalAmount : purchaseData.balanceDue,
      paymentMethod: isSalesmanUser ? 'Credit' : purchaseData.paymentMethod,
      createdByRole: purchaseData.createdByRole || activeRole,
      createdByUserId: purchaseData.createdByUserId || data.currentUser?.id,
      createdByName: purchaseData.createdByName || data.currentUser?.name,
      salesmanEditCount: purchaseData.salesmanEditCount ?? 0,
      updatedAt: now,
    };

    let updatedInventory = [...data.inventory];
    const itemsToRegisterImeis: { id: string; name: string; category?: string; imei?: string; imeis?: string[] }[] = [];
    const changedMap = new Map<string, InventoryItem>();
    const defaultCat = data.categories?.[0] || 'Android Mobile';

    if (autoAddToInventory) {
      newPurchase.items.forEach(purchaseItem => {
        const res = applyPurchaseItemToInventory(updatedInventory, purchaseItem, now, defaultCat);
        updatedInventory = res.nextList;
        changedMap.set(res.changedItem.id, res.changedItem);
        itemsToRegisterImeis.push(res.imeiEntry);
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

    showToast(
      isSalesmanUser
        ? `Stock inward #${newPurchase.billNo} saved!`
        : `Purchase bill #${newPurchase.billNo} registered!`,
      'success'
    );

    // Immediately persist to dedicated Firestore subcollections ONLY (single source of truth)
    if (autoAddToInventory && affectedInventoryItems.length > 0) {
      affectedInventoryItems.forEach(item => {
        saveInventoryItemToFirestore(item, DEFAULT_STORE_ID).catch(() => {});
      });
    }
    savePurchaseToFirestore(newPurchase, DEFAULT_STORE_ID).catch(() => {});
    savePurchasesLedgerBatchToFirestore(newLedgerEntries, DEFAULT_STORE_ID).catch(() => {});
    const changedSaveImeis = diffChangedImeiRecords(data.imeiRecords || [], syncedImeis);
    if (changedSaveImeis.length > 0) {
      saveImeiRecordsBatchToFirestore(changedSaveImeis, DEFAULT_STORE_ID).catch(() => {});
    }
  };

  const handleUpdatePurchase = (
    purchaseId: string,
    updatedPurchaseData: Omit<SupplierPurchase, 'id'>,
    autoAddToInventory: boolean
  ) => {
    const activeRole = data.currentRole || 'admin';
    if (!hasPermission(activeRole, 'canManagePurchases')) {
      showToast('Permission Denied: Updating stock inward entries is not permitted for your role', 'error');
      return;
    }

    const oldPurchase = (data.supplierPurchases || []).find(p => p.id === purchaseId);
    if (!oldPurchase) return;

    const isSalesmanUser = activeRole === 'salesman';
    if (isSalesmanUser) {
      const isOwnEntry =
        oldPurchase.createdByRole === 'salesman' &&
        (!oldPurchase.createdByUserId || !data.currentUser?.id || oldPurchase.createdByUserId === data.currentUser.id);
      if (!isOwnEntry) {
        showToast('You can only edit stock-inward entries that you created.', 'error');
        return;
      }
      if ((oldPurchase.salesmanEditCount || 0) >= 1) {
        showToast('Edit limit reached: You can only edit a stock-inward entry once.', 'error');
        return;
      }
    }

    const now = new Date().toISOString();
    const preservedPaidAmount = isSalesmanUser ? (oldPurchase.paidAmount || 0) : updatedPurchaseData.paidAmount;
    const preservedBalanceDue = isSalesmanUser
      ? Math.max(0, updatedPurchaseData.totalAmount - preservedPaidAmount)
      : updatedPurchaseData.balanceDue;
    const updatedPurchase: SupplierPurchase = {
      ...updatedPurchaseData,
      id: purchaseId,
      partyPhone: updatedPurchaseData.partyPhone?.trim() || undefined,
      paidAmount: preservedPaidAmount,
      balanceDue: preservedBalanceDue,
      paymentMethod: isSalesmanUser ? oldPurchase.paymentMethod : updatedPurchaseData.paymentMethod,
      status: oldPurchase.status,
      createdByRole: oldPurchase.createdByRole || activeRole,
      createdByUserId: oldPurchase.createdByUserId || data.currentUser?.id,
      createdByName: oldPurchase.createdByName || data.currentUser?.name,
      salesmanEditCount: isSalesmanUser ? (oldPurchase.salesmanEditCount || 0) + 1 : (oldPurchase.salesmanEditCount || 0),
      updatedAt: now,
    };

    const changedInventoryMap = new Map<string, InventoryItem>();
    let updatedInventory = [...data.inventory];
    const oldAllImeis: string[] = [];

    // 1. Roll back previous purchase items & IMEIs from inventory (variant-aware)
    oldPurchase.items.forEach(oldItem => {
      const rb = rollbackPurchaseItemFromInventory(updatedInventory, oldItem, now);
      updatedInventory = rb.nextList;
      oldAllImeis.push(...rb.oldItemImeis);
      if (rb.changedItem) {
        changedInventoryMap.set(rb.changedItem.id, rb.changedItem);
      }
    });

    let nextImeiRecords = recordImeisReversed({
      purchaseBillNo: oldPurchase.billNo,
      reversedImeis: oldAllImeis,
      existingImeiRecords: data.imeiRecords || [],
    });

    const itemsToRegisterImeis: { id: string; name: string; category?: string; imei?: string; imeis?: string[] }[] = [];
    const defaultCat = data.categories?.[0] || 'Android Mobile';

    if (autoAddToInventory) {
      updatedPurchase.items.forEach(purchaseItem => {
        const res = applyPurchaseItemToInventory(updatedInventory, purchaseItem, now, defaultCat);
        updatedInventory = res.nextList;
        changedInventoryMap.set(res.changedItem.id, res.changedItem);
        itemsToRegisterImeis.push(res.imeiEntry);
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

    showToast(
      isSalesmanUser
        ? `Stock inward #${updatedPurchase.billNo} updated! (Single edit used)`
        : `Purchase bill #${updatedPurchase.billNo} updated & synced!`,
      'success'
    );

    Array.from(changedInventoryMap.values()).forEach(item => {
      saveInventoryItemToFirestore(item, DEFAULT_STORE_ID).catch(() => {});
    });
    savePurchaseToFirestore(updatedPurchase, DEFAULT_STORE_ID).catch(() => {});
    if (newLedgerEntries.length > 0) {
      savePurchasesLedgerBatchToFirestore(newLedgerEntries, DEFAULT_STORE_ID).catch(() => {});
    }
    const changedUpdateImeis = diffChangedImeiRecords(data.imeiRecords || [], syncedImeis);
    if (changedUpdateImeis.length > 0) {
      saveImeiRecordsBatchToFirestore(changedUpdateImeis, DEFAULT_STORE_ID).catch(() => {});
    }
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
    let updatedInventory = [...data.inventory];
    const allPurchaseImeis: string[] = [];
    const revInvNow = new Date().toISOString();

    purchase.items.forEach(purchaseItem => {
      const rb = rollbackPurchaseItemFromInventory(updatedInventory, purchaseItem, revInvNow);
      updatedInventory = rb.nextList;
      allPurchaseImeis.push(...rb.oldItemImeis);
      if (rb.changedItem) {
        changedInventory.push(rb.changedItem);
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
    const changedLedgerForReversal = syncedLedger.filter(e => e.updatedAt === revNow);
    savePurchaseToFirestore(reversedPurchase, DEFAULT_STORE_ID).catch(() => {});
    if (changedLedgerForReversal.length > 0) {
      savePurchasesLedgerBatchToFirestore(changedLedgerForReversal, DEFAULT_STORE_ID).catch(() => {});
    }
    const changedReverseImeis = diffChangedImeiRecords(data.imeiRecords || [], syncedImeis);
    if (changedReverseImeis.length > 0) {
      saveImeiRecordsBatchToFirestore(changedReverseImeis, DEFAULT_STORE_ID).catch(() => {});
    }

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
    if ((data.currentRole || 'admin') === 'salesman') {
      showToast('Permission Denied: Supplier payment settlement is restricted to Administrators', 'error');
      return;
    }

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
            saveCurrentSession(user, rememberMe);

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

            // 3. Background refresh & authoritative reconciliation from Cloud Firestore (main_store)
            (async () => {
              try {
                await processPendingWritesQueue().catch(() => {});
                const pendingOps = await getPendingWrites();
                const { data: remoteData, fromServer } = await loadAppDataFromFirestoreWithMeta(activeStoreId);
                if (remoteData) {
                  const preMerged =
                    pendingOps.length === 0 && fromServer
                      ? reconcileWithAuthoritativeCloud(dataRef.current, remoteData)
                      : mergeAppData(dataRef.current, remoteData);

                  setData(prev => {
                    const merged =
                      pendingOps.length === 0 && fromServer
                        ? reconcileWithAuthoritativeCloud(prev, remoteData)
                        : mergeAppData(prev, remoteData);

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
                    return finalData;
                  });
                  if (fromServer) {
                    enqueuePreservedLocalSalesIfMissingFromCloud(
                      preMerged,
                      remoteData,
                      activeStoreId
                    ).catch(() => {});
                  }
                }
              } catch (err) {
                console.warn('Background remote load on auth notice:', err);
              }
            })();

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
          className={`flex-1 overflow-y-auto touch-pan-y ${
            activeTab === 'pos'
              ? 'p-2 sm:p-3 lg:p-3 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] lg:pb-4'
              : 'p-2.5 sm:p-5 pb-[calc(4rem+env(safe-area-inset-bottom,0px))] lg:pb-6'
          }`}
        >
          <div className={activeTab === 'pos' ? 'w-full flex flex-col lg:min-h-0' : 'max-w-7xl mx-auto'}>
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
                posPreferences={data.tabPreferences?.pos}
                onOpenPosSettings={() => setTabSettingsModalOpen(true)}
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
                onUpdateOnlineAccount={handleUpdateOnlineAccount}
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
                activities={data.activities || []}
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
                isAdmin={(data.currentRole || 'admin') === 'admin'}
                currentUserId={data.currentUser?.id}
                currentUserName={data.currentUser?.name}
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
                salesReturns={data.salesReturns || []}
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
                onUpdateOnlineAccount={handleUpdateOnlineAccount}
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
                  const currentIds = (data.activities || []).map(a => a.id).filter(Boolean);
                  const now = new Date().toISOString();
                  const tombRes = addTombstonesToMap(
                    data.deletedIds,
                    'activities',
                    currentIds,
                    data.deletedInventoryIds
                  );
                  setData(prev => {
                    const prevIds = (prev.activities || []).map(a => a.id).filter(Boolean);
                    const prevTomb = addTombstonesToMap(
                      prev.deletedIds,
                      'activities',
                      prevIds,
                      prev.deletedInventoryIds
                    );
                    return {
                      ...prev,
                      lastModified: now,
                      activities: [],
                      deletedIds: prevTomb.deletedIds,
                      deletedInventoryIds: prevTomb.deletedInventoryIds,
                    };
                  });
                  clearActivitiesFromFirestore(currentIds).catch(() => {});
                  saveRootConfigToFirestore({
                    deletedIds: tombRes.deletedIds,
                    deletedInventoryIds: tombRes.deletedInventoryIds,
                  }).catch(() => {});
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
        isAdmin={(data.currentRole || 'admin') === 'admin'}
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
          clearOfflineSaleJournal(DEFAULT_STORE_ID);
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
        imeiRecords={data.imeiRecords || []}
        khata={data.khata || []}
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
