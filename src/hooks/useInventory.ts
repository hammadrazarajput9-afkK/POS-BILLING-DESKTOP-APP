import { useState, Dispatch, SetStateAction } from 'react';
import {
  AppData,
  InventoryItem,
  StockAdjustment,
  StockAdjustmentReason,
  ActivityLog,
} from '../types';
import { recordImeisAvailable } from '../utils/imeiManager';
import {
  saveInventoryItemToFirestore,
  deleteInventoryItemFromFirestore,
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
    const newAdjustment: StockAdjustment = {
      ...adj,
      id: generateEntityId('ADJ'),
      adjustedAt: new Date().toISOString(),
    };

    setData(prev => ({
      ...prev,
      stockAdjustments: [newAdjustment, ...(prev.stockAdjustments || [])],
    }));

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

    const itemsList = Array.isArray(itemData) ? itemData : [itemData];

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
        createdAt: existingProduct?.createdAt || new Date().toISOString(),
        status: singleItem.status || existingProduct?.status || 'ACTIVE',
      };

      setData(prev => {
        const updated = prev.inventory.map(item =>
          item.id === existingId ? updatedItem : item
        );
        const updatedImeiRecords = recordImeisAvailable({
          items: [updatedItem],
          existingImeiRecords: prev.imeiRecords || [],
        });

        return {
          ...prev,
          inventory: updated,
          imeiRecords: updatedImeiRecords,
        };
      });

      saveInventoryItemToFirestore(updatedItem).catch(err => {
        console.warn('Firestore inventory update warning:', err);
      });

      logActivity(
        'Inventory',
        `Updated Product: ${singleItem.name}`,
        `Category: ${singleItem.category}, Qty: ${singleItem.qty}, Sale: ${data.settings.currency} ${singleItem.salePrice}`,
        'update',
        existingId
      );
    } else {
      const newItems: InventoryItem[] = itemsList.map((item) => ({
        ...item,
        id: generateEntityId('STK'),
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
      }));

      const newPurchases = itemsList.map((item) => ({
        id: generateEntityId('PL'),
        date: new Date().toISOString(),
        itemTitle: item.name,
        qty: item.qty,
        costPrice: item.costPrice,
        total: item.costPrice * item.qty,
      }));

      setData(prev => {
        const updatedImeiRecords = recordImeisAvailable({
          items: newItems,
          existingImeiRecords: prev.imeiRecords || [],
        });

        return {
          ...prev,
          inventory: [...newItems, ...prev.inventory],
          purchasesLedger: [...newPurchases, ...prev.purchasesLedger],
          imeiRecords: updatedImeiRecords,
        };
      });

      // Sync new items to Firestore sub-collection
      for (const newItem of newItems) {
        saveInventoryItemToFirestore(newItem).catch(err => {
          console.warn('Firestore new item save warning:', err);
        });
      }

      if (itemsList.length === 1) {
        logActivity(
          'Inventory',
          `Added New Product: ${itemsList[0].name}`,
          `Stock: ${itemsList[0].qty} units @ Cost ${data.settings.currency} ${itemsList[0].costPrice}, Sale ${data.settings.currency} ${itemsList[0].salePrice}`,
          'create',
          newItems[0].id
        );
      } else {
        logActivity(
          'Inventory',
          `Added ${itemsList.length} Mobile Variants for: ${itemsList[0].name.split('(')[0].trim()}`,
          `Total Batch: ${itemsList.reduce((acc, i) => acc + i.qty, 0)} units registered into inventory`,
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

    setData(prev => ({
      ...prev,
      inventory: prev.inventory.map(item =>
        item.id === id ? { ...item, status: 'ARCHIVED' as const } : item
      ),
    }));

    saveInventoryItemToFirestore({ ...itemToDelete, status: 'ARCHIVED' }).catch(() => {
      deleteInventoryItemFromFirestore(id).catch(err => {
        console.warn('Firestore delete item warning:', err);
      });
    });

    logActivity(
      'Inventory',
      `Archived Item: ${itemToDelete.name}`,
      `Removed from active stock (Category: ${itemToDelete.category})`,
      'delete',
      id
    );

    showToast(`Product "${itemToDelete.name}" archived from active catalog`, 'info');
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

    setData(prev => ({
      ...prev,
      inventory: prev.inventory.map(item =>
        item.id === id ? { ...item, status: 'ACTIVE' as const } : item
      ),
    }));

    saveInventoryItemToFirestore({ ...itemToRestore, status: 'ACTIVE' }).catch(err => {
      console.warn('Firestore restore item warning:', err);
    });

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

    setData(prev => ({
      ...prev,
      categories: [...prev.categories, trimmed],
    }));

    logActivity('Category', `Created Category: ${trimmed}`, 'Added to product categories list', 'create');
    showToast(`Category "${trimmed}" added!`, 'success');
  };

  const handleDeleteCategory = (catName: string): boolean => {
    setData(prev => ({
      ...prev,
      categories: prev.categories.filter(c => c !== catName),
    }));

    logActivity('Category', `Deleted Category: ${catName}`, 'Removed from category lists', 'delete');
    showToast(`Category "${catName}" deleted!`, 'info');
    return true;
  };

  const handleAddProductFromPurchases = (item: Omit<InventoryItem, 'id' | 'createdAt'>): InventoryItem => {
    const newItem: InventoryItem = {
      ...item,
      id: generateEntityId('STK'),
      createdAt: new Date().toISOString(),
      status: 'ACTIVE',
    };

    setData(prev => {
      const updatedImeis = recordImeisAvailable({
        items: [newItem],
        existingImeiRecords: prev.imeiRecords || [],
      });
      return {
        ...prev,
        inventory: [newItem, ...prev.inventory],
        imeiRecords: updatedImeis,
      };
    });

    saveInventoryItemToFirestore(newItem).catch(err => {
      console.warn('Firestore purchase item save warning:', err);
    });

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
    handleRestoreInventory,
    handleStockAdjustment,
    handleAddCategory,
    handleDeleteCategory,
    handleAddProductFromPurchases,
    stockModalOpen,
    setStockModalOpen,
    editStockItem,
    setEditStockItem,
  };
}
