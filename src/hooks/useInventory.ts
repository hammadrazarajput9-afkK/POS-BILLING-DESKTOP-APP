import { useState, Dispatch, SetStateAction } from 'react';
import {
  AppData,
  InventoryItem,
  StockAdjustment,
  StockAdjustmentReason,
  ActivityLog,
} from '../types';
import { recordImeisAvailable, diffChangedImeiRecords } from '../utils/imeiManager';
import {
  saveInventoryItemToFirestore,
  deleteInventoryItemFromFirestore,
  saveRootConfigToFirestore,
  saveStockAdjustmentToFirestore,
  saveImeiRecordsBatchToFirestore,
  savePurchasesLedgerBatchToFirestore,
  savePurchaseToFirestore,
  addTombstonesToMap,
  removeTombstoneFromMap,
} from '../utils/storage';
import { hasPermission } from '../utils/permissions';
import { generateEntityId } from '../utils/id';

interface UseInventoryProps {
  data: AppData;
  setData: Dispatch<SetStateAction<AppData>>;
  logActivity: (
    category: ActivityLog['category'],
    title: string,
    details: string,
    type?: ActivityLog['type'],
    relatedRecordId?: string,
    beforeValue?: string,
    afterValue?: string
  ) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export function useInventory({ data, setData, logActivity, showToast }: UseInventoryProps) {
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [editStockItem, setEditStockItem] = useState<InventoryItem | null>(null);

  /**
   * Centralized Stock Adjustment Logger
   */
  const handleStockAdjustment = (adj: Omit<StockAdjustment, 'id' | 'adjustedAt'>) => {
    const now = new Date().toISOString();
    const newAdjustment: StockAdjustment = {
      ...adj,
      id: generateEntityId('ADJ'),
      adjustedAt: now,
      updatedAt: now,
    };

    setData(prev => ({
      ...prev,
      lastModified: now,
      stockAdjustments: [newAdjustment, ...(prev.stockAdjustments || [])],
    }));

    saveStockAdjustmentToFirestore(newAdjustment).catch(() => {});

    logActivity(
      'Inventory',
      `Stock Adjusted: ${adj.productName} (${adj.difference > 0 ? `+${adj.difference}` : adj.difference} units)`,
      `Reason: ${adj.reason} | Previous: ${adj.previousQty} -> New: ${adj.newQty}${adj.notes ? ` | Note: ${adj.notes}` : ''}`,
      'update',
      adj.productId
    );
  };

  /**
   * Inventory Save Handler: Single Product, Multi-Variant Mobile, or Batch Insert
   */
  const handleSaveStock = (
    itemData: Omit<InventoryItem, 'id' | 'createdAt'> | Omit<InventoryItem, 'id' | 'createdAt'>[],
    existingId?: string,
    adjustment?: {
      reason: StockAdjustmentReason | string;
      notes?: string;
    }
  ) => {
    if (!hasPermission(data.currentRole || 'admin', 'canEditInventory')) {
      showToast('Permission Denied: Inventory editing is restricted to Administrators', 'error');
      return;
    }

    const now = new Date().toISOString();
    const itemsList = Array.isArray(itemData) ? itemData : [itemData];

    const collectMissingAlertsForItem = (item: Omit<InventoryItem, 'id' | 'createdAt'>): string => {
      const missing: string[] = [];
      if (!item.image) missing.push('Picture');
      if (item.variants && item.variants.length > 0) {
        item.variants.forEach((v, idx) => {
          const vLabel = [v.ram, v.storage, v.color?.trim()].filter(Boolean).join('/') || `Var #${idx + 1}`;
          const vMiss: string[] = [];
          if (v.costPrice === '' || v.costPrice === undefined) vMiss.push('Cost Price');
          if (v.salePrice === '' || v.salePrice === undefined) vMiss.push('Sale Price');
          if (v.wholesalePrice === '' || v.wholesalePrice === undefined) vMiss.push('Wholesale Price');
          const qtyCount = Math.max(1, Number(v.qty) || 1);
          const vImeis = v.imeis || [];
          const emptyImeis: string[] = [];
          for (let k = 0; k < qtyCount; k++) {
            if (!(vImeis[k] || '').trim()) emptyImeis.push(`#${k + 1}`);
          }
          if (emptyImeis.length > 0) {
            vMiss.push(`IMEI ${emptyImeis.slice(0, 4).join(', ')}${emptyImeis.length > 4 ? ` (+${emptyImeis.length - 4})` : ''}`);
          }
          if (vMiss.length > 0) missing.push(`${vLabel}: ${vMiss.join(', ')}`);
        });
      } else {
        if (!item.costPrice) missing.push('Cost Price');
        if (!item.salePrice) missing.push('Sale Price');
        if (item.wholesalePrice === undefined) missing.push('Wholesale Price');
        const catLower = (item.category || '').toLowerCase();
        const looksMobile =
          catLower.includes('android') ||
          catLower.includes('keypad') ||
          catLower.includes('smart') ||
          catLower.includes('feature') ||
          catLower.includes('mobile') ||
          catLower.includes('phone');
        if (looksMobile && item.qty > 0) {
          const enteredImeis =
            item.imeis && item.imeis.length > 0
              ? item.imeis.filter(Boolean).length
              : item.imei
              ? item.imei.split(',').map(s => s.trim()).filter(Boolean).length
              : 0;
          if (enteredImeis < item.qty) {
            const missingSlots: string[] = [];
            for (let k = enteredImeis; k < item.qty; k++) {
              missingSlots.push(`#${k + 1}`);
            }
            missing.push(`IMEI ${missingSlots.slice(0, 4).join(', ')}${missingSlots.length > 4 ? ` (+${missingSlots.length - 4})` : ''}`);
          }
        }
      }
      return missing.join(' | ');
    };

    if (existingId && itemsList.length === 1) {
      const singleItem = itemsList[0];
      const existingProduct = data.inventory.find(i => i.id === existingId);

      // If quantity changed and adjustment reason provided, log stock adjustment
      if (existingProduct && existingProduct.qty !== singleItem.qty && adjustment) {
        handleStockAdjustment({
          productId: existingId,
          productName: singleItem.name,
          previousQty: existingProduct.qty,
          newQty: singleItem.qty,
          difference: singleItem.qty - existingProduct.qty,
          reason: adjustment.reason,
          notes: adjustment.notes,
          adjustedBy: 'Admin',
        });
      }

      const updatedItem: InventoryItem = {
        ...singleItem,
        id: existingId,
        createdAt: existingProduct?.createdAt || now,
        updatedAt: now,
        status: singleItem.status || existingProduct?.status || 'ACTIVE',
      };

      const syncedImeis = recordImeisAvailable({
        items: [updatedItem],
        existingImeiRecords: data.imeiRecords || [],
      });

      const cleanBase = singleItem.name.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
      const otherLegacyIds: string[] = [];
      data.inventory.forEach(item => {
        if (item.id === existingId) return;
        const itemBase = item.name.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
        if (
          singleItem.variants &&
          singleItem.variants.length > 0 &&
          item.category.toLowerCase() === singleItem.category.toLowerCase() &&
          itemBase === cleanBase
        ) {
          otherLegacyIds.push(item.id);
        }
      });

      let nextTombstones = removeTombstoneFromMap(
        data.deletedIds,
        'inventory',
        existingId,
        data.deletedInventoryIds
      );
      if (otherLegacyIds.length > 0) {
        nextTombstones = addTombstonesToMap(
          nextTombstones.deletedIds,
          'inventory',
          otherLegacyIds,
          nextTombstones.deletedInventoryIds
        );
      }

      setData(prev => {
        const filteredInventory = prev.inventory.filter(
          item => item.id !== existingId && !otherLegacyIds.includes(item.id)
        );
        const updated = [updatedItem, ...filteredInventory];
        const updatedImeiRecords = recordImeisAvailable({
          items: [updatedItem],
          existingImeiRecords: prev.imeiRecords || [],
        });

        let prevTombstones = removeTombstoneFromMap(
          prev.deletedIds,
          'inventory',
          existingId,
          prev.deletedInventoryIds
        );
        if (otherLegacyIds.length > 0) {
          prevTombstones = addTombstonesToMap(
            prevTombstones.deletedIds,
            'inventory',
            otherLegacyIds,
            prevTombstones.deletedInventoryIds
          );
        }

        return {
          ...prev,
          lastModified: now,
          inventory: updated,
          imeiRecords: updatedImeiRecords,
          deletedIds: prevTombstones.deletedIds,
          deletedInventoryIds: prevTombstones.deletedInventoryIds,
        };
      });

      otherLegacyIds.forEach(oldId => {
        deleteInventoryItemFromFirestore(oldId).catch(err => console.warn(err));
      });
      if (otherLegacyIds.length > 0) {
        saveRootConfigToFirestore({
          deletedIds: nextTombstones.deletedIds,
          deletedInventoryIds: nextTombstones.deletedInventoryIds,
        }).catch(() => {});
      }

      saveInventoryItemToFirestore(updatedItem).catch(err => {
        console.warn('Firestore inventory update warning:', err);
      });
      const changedEditImeis = diffChangedImeiRecords(data.imeiRecords || [], syncedImeis);
      if (changedEditImeis.length > 0) {
        saveImeiRecordsBatchToFirestore(changedEditImeis).catch(() => {});
      }

      const editMissing = collectMissingAlertsForItem(singleItem);
      logActivity(
        'Inventory',
        `Updated Product: ${singleItem.name}`,
        `Category: ${singleItem.category}, Qty: ${singleItem.qty}, Sale: ${data.settings.currency} ${singleItem.salePrice}${editMissing ? ` | Missing Alerts: ${editMissing}` : ''}`,
        'update',
        existingId
      );
    } else {
      const newItems: InventoryItem[] = itemsList.map((item) => ({
        ...item,
        id: generateEntityId('STK'),
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      }));

      const newPurchases = itemsList.map((item) => ({
        id: generateEntityId('PL'),
        date: now,
        updatedAt: now,
        itemTitle: item.name,
        qty: item.qty,
        costPrice: item.costPrice,
        total: item.costPrice * item.qty,
      }));

      const syncedImeis = recordImeisAvailable({
        items: newItems,
        existingImeiRecords: data.imeiRecords || [],
      });

      setData(prev => {
        const updatedImeiRecords = recordImeisAvailable({
          items: newItems,
          existingImeiRecords: prev.imeiRecords || [],
        });

        return {
          ...prev,
          lastModified: now,
          inventory: [...newItems, ...prev.inventory],
          purchasesLedger: [...newPurchases, ...(prev.purchasesLedger || [])],
          imeiRecords: updatedImeiRecords,
        };
      });

      // Sync new items to Firestore sub-collection
      for (const newItem of newItems) {
        saveInventoryItemToFirestore(newItem).catch(err => {
          console.warn('Firestore new item save warning:', err);
        });
      }
      savePurchasesLedgerBatchToFirestore(newPurchases).catch(() => {});
      const changedNewImeis = diffChangedImeiRecords(data.imeiRecords || [], syncedImeis);
      if (changedNewImeis.length > 0) {
        saveImeiRecordsBatchToFirestore(changedNewImeis).catch(() => {});
      }

      if (itemsList.length === 1) {
        const createMissing = collectMissingAlertsForItem(itemsList[0]);
        logActivity(
          'Inventory',
          `Added New Product: ${itemsList[0].name}`,
          `Stock: ${itemsList[0].qty} units @ Cost ${data.settings.currency} ${itemsList[0].costPrice}, Sale ${data.settings.currency} ${itemsList[0].salePrice}${createMissing ? ` | Missing Alerts: ${createMissing}` : ''}`,
          'create',
          newItems[0].id
        );
      } else {
        const batchMissing = itemsList
          .map(it => {
            const m = collectMissingAlertsForItem(it);
            return m ? `${it.name}: ${m}` : '';
          })
          .filter(Boolean)
          .join(' | ');
        logActivity(
          'Inventory',
          `Added ${itemsList.length} Mobile Variants for: ${itemsList[0].name.split('(')[0].trim()}`,
          `Total Batch: ${itemsList.reduce((acc, i) => acc + i.qty, 0)} units registered into inventory${batchMissing ? ` | Missing Alerts: ${batchMissing}` : ''}`,
          'create'
        );
      }
    }
  };

  /**
   * Delete / Archive an Inventory item
   */
  const handleDeleteInventory = (id: string) => {
    if (!hasPermission(data.currentRole || 'admin', 'canDeleteInventory')) {
      showToast('Permission Denied: Deleting inventory items is restricted to Administrators', 'error');
      return;
    }

    const itemToDelete = data.inventory.find(item => item.id === id);
    if (!itemToDelete) return;

    const now = new Date().toISOString();
    const cleanBase = itemToDelete.name.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
    const relatedIds = data.inventory
      .filter(i => {
        if (i.id === id) return true;
        const iBase = i.name.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
        return i.category.toLowerCase() === itemToDelete.category.toLowerCase() && iBase === cleanBase;
      })
      .map(i => i.id);

    setData(prev => ({
      ...prev,
      lastModified: now,
      inventory: prev.inventory.map(item =>
        relatedIds.includes(item.id) ? { ...item, status: 'ARCHIVED' as const, updatedAt: now } : item
      ),
    }));

    relatedIds.forEach(targetId => {
      const it = data.inventory.find(i => i.id === targetId);
      if (it) {
        saveInventoryItemToFirestore({ ...it, status: 'ARCHIVED', updatedAt: now }).catch(() => {
          deleteInventoryItemFromFirestore(targetId).catch(err => {
            console.warn('Firestore delete item warning:', err);
          });
        });
      }
    });

    logActivity(
      'Inventory',
      `Archived Item: ${cleanBase || itemToDelete.name}`,
      `Removed from active stock (Category: ${itemToDelete.category})`,
      'delete',
      id
    );

    showToast(`Product "${cleanBase || itemToDelete.name}" archived from active catalog`, 'info');
  };

  /**
   * Permanent Delete an Inventory item completely from state and Firestore (with tombstones)
   */
  const handlePermanentDeleteInventory = (id: string) => {
    if (!hasPermission(data.currentRole || 'admin', 'canDeleteInventory')) {
      showToast('Permission Denied: Permanent deletion of inventory items is restricted to Administrators', 'error');
      return;
    }

    const itemToDelete = data.inventory.find(item => item.id === id);
    if (!itemToDelete) return;

    const now = new Date().toISOString();
    const cleanBase = itemToDelete.name.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
    const relatedIds = data.inventory
      .filter(i => {
        if (i.id === id) return true;
        const iBase = i.name.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
        return i.category.toLowerCase() === itemToDelete.category.toLowerCase() && iBase === cleanBase;
      })
      .map(i => i.id);

    const removedImeiIds = (data.imeiRecords || [])
      .filter(rec => relatedIds.includes(rec.productId))
      .map(rec => rec.id || rec.imei)
      .filter(Boolean);

    let tombstoneRes = addTombstonesToMap(
      data.deletedIds,
      'inventory',
      relatedIds,
      data.deletedInventoryIds
    );
    if (removedImeiIds.length > 0) {
      tombstoneRes = addTombstonesToMap(
        tombstoneRes.deletedIds,
        'imeiRecords',
        removedImeiIds,
        tombstoneRes.deletedInventoryIds
      );
    }

    setData(prev => {
      let prevTombstones = addTombstonesToMap(
        prev.deletedIds,
        'inventory',
        relatedIds,
        prev.deletedInventoryIds
      );
      if (removedImeiIds.length > 0) {
        prevTombstones = addTombstonesToMap(
          prevTombstones.deletedIds,
          'imeiRecords',
          removedImeiIds,
          prevTombstones.deletedInventoryIds
        );
      }

      return {
        ...prev,
        lastModified: now,
        inventory: prev.inventory.filter(item => !relatedIds.includes(item.id)),
        imeiRecords: (prev.imeiRecords || []).filter(rec => !relatedIds.includes(rec.productId)),
        deletedIds: prevTombstones.deletedIds,
        deletedInventoryIds: prevTombstones.deletedInventoryIds,
      };
    });

    relatedIds.forEach(targetId => {
      deleteInventoryItemFromFirestore(targetId).catch(err => {
        console.warn('Firestore permanent delete item warning:', err);
      });
    });

    saveRootConfigToFirestore({
      deletedIds: tombstoneRes.deletedIds,
      deletedInventoryIds: tombstoneRes.deletedInventoryIds,
    }).catch(() => {});

    logActivity(
      'Inventory',
      `Permanently Deleted Product: ${cleanBase || itemToDelete.name}`,
      `Completely removed product record and all variants from system database (Category: ${itemToDelete.category})`,
      'delete',
      id
    );

    showToast(`Product "${cleanBase || itemToDelete.name}" permanently deleted!`, 'success');
  };

  /**
   * Restore an archived inventory item
   */
  const handleRestoreInventory = (id: string) => {
    if (!hasPermission(data.currentRole || 'admin', 'canEditInventory')) {
      showToast('Permission Denied: Modifying inventory is restricted to Administrators', 'error');
      return;
    }

    const itemToRestore = data.inventory.find(item => item.id === id);
    if (!itemToRestore) return;

    const now = new Date().toISOString();
    const updatedItem: InventoryItem = { ...itemToRestore, status: 'ACTIVE', updatedAt: now };
    const tombstones = removeTombstoneFromMap(
      data.deletedIds,
      'inventory',
      id,
      data.deletedInventoryIds
    );

    setData(prev => {
      const prevTombstones = removeTombstoneFromMap(
        prev.deletedIds,
        'inventory',
        id,
        prev.deletedInventoryIds
      );
      return {
        ...prev,
        lastModified: now,
        inventory: prev.inventory.map(item =>
          item.id === id ? { ...item, status: 'ACTIVE' as const, updatedAt: now } : item
        ),
        deletedIds: prevTombstones.deletedIds,
        deletedInventoryIds: prevTombstones.deletedInventoryIds,
      };
    });

    saveInventoryItemToFirestore(updatedItem).catch(err => {
      console.warn('Firestore restore item warning:', err);
    });
    saveRootConfigToFirestore({
      deletedIds: tombstones.deletedIds,
      deletedInventoryIds: tombstones.deletedInventoryIds,
    }).catch(() => {});

    logActivity(
      'Inventory',
      `Restored Item: ${itemToRestore.name}`,
      `Re-activated in active stock catalog`,
      'restore',
      id
    );

    showToast(`Product "${itemToRestore.name}" restored to active inventory!`, 'success');
  };

  const handleAddCategory = (catName: string) => {
    const trimmed = catName.trim();
    if (!trimmed || data.categories.includes(trimmed)) return;

    const now = new Date().toISOString();
    const updatedCategories = [...data.categories, trimmed];
    setData(prev => ({
      ...prev,
      lastModified: now,
      categoriesUpdatedAt: now,
      categories: updatedCategories,
    }));

    saveRootConfigToFirestore({
      categories: updatedCategories,
      categoriesUpdatedAt: now,
    }).catch(err => {
      console.warn('Firestore category creation sync warning:', err);
    });

    logActivity('Category', `Created Category: ${trimmed}`, 'Added to product categories list', 'create');
    showToast(`Category "${trimmed}" added!`, 'success');
  };

  const handleDeleteCategory = (catName: string): boolean => {
    const now = new Date().toISOString();
    const updatedCategories = data.categories.filter(c => c !== catName);
    setData(prev => ({
      ...prev,
      lastModified: now,
      categoriesUpdatedAt: now,
      categories: updatedCategories,
    }));

    saveRootConfigToFirestore({
      categories: updatedCategories,
      categoriesUpdatedAt: now,
    }).catch(err => {
      console.warn('Firestore category deletion sync warning:', err);
    });

    logActivity('Category', `Deleted Category: ${catName}`, 'Removed from category lists', 'delete');
    showToast(`Category "${catName}" deleted!`, 'info');
    return true;
  };

  const handleRenameCategory = (oldName: string, newName: string): boolean => {
    const cleanOld = oldName.trim();
    const cleanNew = newName.trim();
    if (!cleanOld || !cleanNew) {
      showToast('Category name cannot be empty', 'warning');
      return false;
    }
    if (cleanOld === cleanNew) {
      return true;
    }
    if (data.categories.some(c => c.toLowerCase() === cleanNew.toLowerCase() && c.toLowerCase() !== cleanOld.toLowerCase())) {
      showToast(`Category "${cleanNew}" already exists`, 'warning');
      return false;
    }

    const now = new Date().toISOString();
    const updatedCategories = (data.categories || []).map(c =>
      c.toLowerCase() === cleanOld.toLowerCase() ? cleanNew : c
    );
    if (!updatedCategories.some(c => c.toLowerCase() === cleanNew.toLowerCase())) {
      updatedCategories.push(cleanNew);
    }

    const updatedInventoryToSync: InventoryItem[] = [];
    (data.inventory || []).forEach(item => {
      if ((item.category || '').trim().toLowerCase() === cleanOld.toLowerCase()) {
        updatedInventoryToSync.push({ ...item, category: cleanNew, updatedAt: now });
      }
    });

    const updatedImeisToSync = (data.imeiRecords || [])
      .filter(rec => (rec.category || '').trim().toLowerCase() === cleanOld.toLowerCase())
      .map(rec => ({ ...rec, category: cleanNew, updatedAt: now }));

    const updatedPurchasesToSync = (data.supplierPurchases || [])
      .filter(pur => (pur.items || []).some(pi => (pi.category || '').trim().toLowerCase() === cleanOld.toLowerCase()))
      .map(pur => ({
        ...pur,
        updatedAt: now,
        items: (pur.items || []).map(pi =>
          (pi.category || '').trim().toLowerCase() === cleanOld.toLowerCase()
            ? { ...pi, category: cleanNew }
            : pi
        ),
      }));

    setData(prev => ({
      ...prev,
      lastModified: now,
      categoriesUpdatedAt: now,
      categories: updatedCategories,
      inventory: (prev.inventory || []).map(item =>
        (item.category || '').trim().toLowerCase() === cleanOld.toLowerCase()
          ? { ...item, category: cleanNew, updatedAt: now }
          : item
      ),
      imeiRecords: (prev.imeiRecords || []).map(rec =>
        (rec.category || '').trim().toLowerCase() === cleanOld.toLowerCase()
          ? { ...rec, category: cleanNew, updatedAt: now }
          : rec
      ),
      supplierPurchases: (prev.supplierPurchases || []).map(pur => ({
        ...pur,
        updatedAt: (pur.items || []).some(pi => (pi.category || '').trim().toLowerCase() === cleanOld.toLowerCase())
          ? now
          : pur.updatedAt,
        items: (pur.items || []).map(pi =>
          (pi.category || '').trim().toLowerCase() === cleanOld.toLowerCase()
            ? { ...pi, category: cleanNew }
            : pi
        ),
      })),
    }));

    updatedInventoryToSync.forEach(item => {
      saveInventoryItemToFirestore(item).catch(err => {
        console.warn('Firestore category rename inventory sync warning:', err);
      });
    });
    updatedPurchasesToSync.forEach(pur => {
      savePurchaseToFirestore(pur).catch(() => {});
    });
    if (updatedImeisToSync.length > 0) {
      saveImeiRecordsBatchToFirestore(updatedImeisToSync).catch(() => {});
    }
    saveRootConfigToFirestore({
      categories: updatedCategories,
      categoriesUpdatedAt: now,
    }).catch(err => {
      console.warn('Firestore category rename config sync warning:', err);
    });

    logActivity(
      'Category',
      `Renamed Category: ${cleanOld} → ${cleanNew}`,
      `Updated across ${updatedInventoryToSync.length} inventory item(s)`,
      'update'
    );
    showToast(`Category renamed to "${cleanNew}"`, 'success');
    return true;
  };

  const handleAddProductFromPurchases = (item: Omit<InventoryItem, 'id' | 'createdAt'>): InventoryItem => {
    const now = new Date().toISOString();
    const newItem: InventoryItem = {
      ...item,
      id: generateEntityId('STK'),
      createdAt: now,
      updatedAt: now,
      status: 'ACTIVE',
    };

    const syncedImeis = recordImeisAvailable({
      items: [newItem],
      existingImeiRecords: data.imeiRecords || [],
    });
    setData(prev => {
      const updatedImeis = recordImeisAvailable({
        items: [newItem],
        existingImeiRecords: prev.imeiRecords || [],
      });
      return {
        ...prev,
        lastModified: now,
        inventory: [newItem, ...prev.inventory],
        imeiRecords: updatedImeis,
      };
    });

    saveInventoryItemToFirestore(newItem).catch(err => {
      console.warn('Firestore purchase item save warning:', err);
    });
    const changedPurchaseImeis = diffChangedImeiRecords(data.imeiRecords || [], syncedImeis);
    if (changedPurchaseImeis.length > 0) {
      saveImeiRecordsBatchToFirestore(changedPurchaseImeis).catch(() => {});
    }

    logActivity(
      'Inventory',
      `Registered New Inward Product: ${newItem.name}`,
      `Stock: ${newItem.qty} | Sale: ${data.settings.currency} ${newItem.salePrice}`,
      'create',
      newItem.id
    );

    return newItem;
  };

  return {
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
  };
}
