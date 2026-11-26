import { useState, Dispatch, SetStateAction } from 'react';
import {
  AppData,
  SaleRecord,
  SalesReturnRecord,
  KhataCustomer,
  ActivityLog,
  SaleItem,
} from '../types';
import { recordImeisSold, extractItemImeis, recordImeisReturned, diffChangedImeiRecords } from '../utils/imeiManager';
import {
  saveSaleAtomic,
  deleteSaleFromFirestore,
  updateSaleInFirestore,
  saveSalesReturnToFirestore,
  saveInventoryItemToFirestore,
  saveKhataCustomerToFirestore,
  saveImeiRecordsBatchToFirestore,
  saveActivityLogToFirestore,
  saveRootConfigToFirestore,
  addTombstonesToMap,
  removeTombstoneFromMap,
  recordLocalSaleInJournal,
  removeSaleFromJournal,
} from '../utils/storage';
import { generateEntityId } from '../utils/id';

const formatSaleProductSummary = (items: SaleItem[]) => {
  if (!items || items.length === 0) return 'Sale Transaction';
  return items.map(it => `${it.name}${it.variantLabel ? ` (${it.variantLabel})` : ''} x${it.qty}`).join(', ');
};

interface UseSalesProps {
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

export function useSales({ data, setData, logActivity, showToast }: UseSalesProps) {
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [activeReceiptSale, setActiveReceiptSale] = useState<SaleRecord | null>(null);
  const [saleToEdit, setSaleToEdit] = useState<SaleRecord | null>(null);

  const [salesReturnModalOpen, setSalesReturnModalOpen] = useState(false);
  const [salesReturnInitialSale, setSalesReturnInitialSale] = useState<SaleRecord | null>(null);

  /**
   * Sale Checkout Handler with Cash vs Credit Support, Strict IMEI Lifecycle Management,
   * and Atomic Firestore Sub-collection sync.
   */
  const handleCompleteSale = async (sale: SaleRecord) => {
    const now = new Date().toISOString();
    const saleWithTs: SaleRecord = {
      ...sale,
      updatedAt: now,
    };

    // 1. Calculate Inventory Updates, remaining IMEIs & variant stock
    const inventoryUpdates: Array<{
      id: string;
      newQty: number;
      remainingImeis?: string[];
      variants?: typeof data.inventory[number]['variants'];
      updatedAt?: string;
    }> = [];

    const updatedInventory = data.inventory.map(invItem => {
      const soldItemsForProduct = saleWithTs.items.filter(s => s.id === invItem.id);
      if (soldItemsForProduct.length > 0) {
        const soldImeisList = soldItemsForProduct.flatMap(si => extractItemImeis(si));
        const totalSoldQty = soldItemsForProduct.reduce((sum, si) => sum + (si.qty || 0), 0);
        const currentImeis = extractItemImeis(invItem);
        const remainingImeis = currentImeis.filter(
          im => !soldImeisList.some(sIm => sIm.toLowerCase() === im.toLowerCase())
        );

        let updatedVariants = invItem.variants;
        if (invItem.variants && invItem.variants.length > 0) {
          updatedVariants = invItem.variants.map(v => {
            const matchingLines = soldItemsForProduct.filter(
              si => si.variantId && v.id && si.variantId === v.id
            );
            const qtyDeducted = matchingLines.reduce((sum, si) => sum + (si.qty || 0), 0);
            const variantSoldImeis = matchingLines.flatMap(si => extractItemImeis(si));
            const curVImeis = Array.isArray(v.imeis) ? v.imeis.filter(Boolean) : [];
            const nextVImeis = curVImeis.filter(
              im =>
                !variantSoldImeis.some(sIm => sIm.toLowerCase() === im.toLowerCase()) &&
                !soldImeisList.some(sIm => sIm.toLowerCase() === im.toLowerCase())
            );
            const curVQty = v.qty === '' || v.qty === undefined ? curVImeis.length : Number(v.qty) || 0;
            const nextVQty = Math.max(0, curVQty - qtyDeducted);
            return {
              ...v,
              qty: nextVQty,
              imeis: nextVImeis,
            };
          });
        }

        const newQty = Math.max(0, invItem.qty - totalSoldQty);
        inventoryUpdates.push({
          id: invItem.id,
          newQty,
          remainingImeis,
          variants: updatedVariants,
          updatedAt: now,
        });

        return {
          ...invItem,
          qty: newQty,
          updatedAt: now,
          imeis: remainingImeis.length > 0 ? remainingImeis : undefined,
          imei: remainingImeis.length > 0 ? remainingImeis.join(', ') : undefined,
          variants: updatedVariants,
        };
      }
      return invItem;
    });

    // 2. Update permanent IMEI tracking ledger
    const updatedImeiRecords = recordImeisSold({
      sale: saleWithTs,
      existingImeiRecords: data.imeiRecords || [],
      inventory: data.inventory,
    });

    // 3. Khata ledger calculation
    let updatedKhata = data.khata;
    let resolvedKhataCustomerId = saleWithTs.khataCustomerId;
    let newKhataCustomerToCreate: KhataCustomer | undefined;
    let khataAtomicUpdate: {
      customerId: string;
      newBalance: number;
      transaction: {
        id: string;
        date: string;
        type: 'credit' | 'payment' | 'debit';
        amount: number;
        note?: string;
      };
    } | undefined = undefined;

    if (saleWithTs.invoiceType === 'credit' && saleWithTs.amountDue && saleWithTs.amountDue > 0) {
      let matched = false;
      const txId = generateEntityId('TX');
      const txDate = saleWithTs.date || now;
      const saleNormPhone = (saleWithTs.custPhone || '').replace(/[^0-9]/g, '');
      const saleNormName = (saleWithTs.custName || '').trim().toLowerCase();

      updatedKhata = data.khata.map(c => {
        const cNormPhone = (c.phone || '').replace(/[^0-9]/g, '');
        const isTarget = saleWithTs.khataCustomerId
          ? c.id === saleWithTs.khataCustomerId
          : (saleNormName && c.name.trim().toLowerCase() === saleNormName) ||
            (saleNormPhone.length >= 7 && cNormPhone === saleNormPhone);

        if (isTarget) {
          matched = true;
          resolvedKhataCustomerId = c.id;
          const newBal = c.balance + saleWithTs.amountDue!;
          khataAtomicUpdate = {
            customerId: c.id,
            newBalance: newBal,
            transaction: {
              id: txId,
              date: txDate,
              type: 'credit',
              amount: saleWithTs.amountDue!,
              note: formatSaleProductSummary(saleWithTs.items),
            },
          };
          return {
            ...c,
            balance: newBal,
            lastUpdated: txDate,
            updatedAt: txDate,
            history: [
              {
                id: txId,
                date: txDate,
                type: 'credit' as const,
                amount: saleWithTs.amountDue!,
                note: formatSaleProductSummary(saleWithTs.items),
              },
              ...c.history,
            ],
          };
        }
        return c;
      });

      // If no matching customer was found in Khata, create one automatically
      if (!matched && saleWithTs.custName && saleWithTs.custName !== 'Walk-in Customer') {
        const newCustId = saleWithTs.khataCustomerId || generateEntityId('KHT');
        resolvedKhataCustomerId = newCustId;
        const newCust: KhataCustomer = {
          id: newCustId,
          name: saleWithTs.custName,
          phone: saleWithTs.custPhone || 'N/A',
          balance: saleWithTs.amountDue,
          lastUpdated: txDate,
          updatedAt: txDate,
          history: [
            {
              id: txId,
              date: txDate,
              type: 'credit',
              amount: saleWithTs.amountDue,
              note: formatSaleProductSummary(saleWithTs.items),
            },
          ],
        };
        updatedKhata = [newCust, ...updatedKhata];
        newKhataCustomerToCreate = newCust;
        khataAtomicUpdate = {
          customerId: newCustId,
          newBalance: saleWithTs.amountDue,
          transaction: {
            id: txId,
            date: txDate,
            type: 'credit',
            amount: saleWithTs.amountDue,
            note: formatSaleProductSummary(saleWithTs.items),
          },
        };
      }
    }

    if (resolvedKhataCustomerId && !saleWithTs.khataCustomerId) {
      saleWithTs.khataCustomerId = resolvedKhataCustomerId;
    }

    const activityData: ActivityLog = {
      id: generateEntityId('ACT'),
      timestamp: now,
      updatedAt: now,
      category: 'Sale',
      title: `${saleWithTs.invoiceType === 'credit' ? 'Credit' : 'Cash'} Invoice #${saleWithTs.invNo} Completed`,
      details: `Total: ${data.settings.currency} ${saleWithTs.grandTotal.toLocaleString()} | Items: ${saleWithTs.items.length} | Customer: ${saleWithTs.custName || 'Walk-in'}${saleWithTs.amountDue ? ` | Due: ${data.settings.currency} ${saleWithTs.amountDue.toLocaleString()}` : ''}`,
      type: 'sale',
      user: data.currentRole === 'salesman' ? 'Salesman Terminal' : 'Administrator',
      userRole: data.currentRole,
      relatedRecordId: saleWithTs.invNo,
    };

    // Synchronously persist sale + inventory deductions in tiny quota-proof journal BEFORE async React/IDB/network steps
    recordLocalSaleInJournal(saleWithTs, inventoryUpdates);

    // 4. Update React State immediately for responsive UI
    setData(prev => {
      const cleanedTombstones = removeTombstoneFromMap(
        prev.deletedIds,
        'sales',
        saleWithTs.invNo,
        prev.deletedInventoryIds
      );
      return {
        ...prev,
        lastModified: now,
        inventory: updatedInventory,
        khata: updatedKhata,
        sales: [saleWithTs, ...prev.sales],
        imeiRecords: updatedImeiRecords,
        activities: [activityData, ...(prev.activities || [])].slice(0, 500),
        deletedIds: cleanedTombstones.deletedIds,
        deletedInventoryIds: cleanedTombstones.deletedInventoryIds,
      };
    });

    setActiveReceiptSale(saleWithTs);
    setReceiptModalOpen(true);
    showToast(`Sale #${saleWithTs.invNo} completed!`, 'success');

    // 5. Fire atomic Firestore subcollection batch update & IMEI tracking sync
    saveSaleAtomic({
      sale: saleWithTs,
      inventoryUpdates,
      khataUpdate: newKhataCustomerToCreate ? undefined : khataAtomicUpdate,
      activity: activityData,
    }).catch(err => {
      console.warn('Background atomic Firestore sync warning:', err);
    });
    if (newKhataCustomerToCreate) {
      saveKhataCustomerToFirestore(newKhataCustomerToCreate).catch(() => {});
    }
    const changedImeis = diffChangedImeiRecords(data.imeiRecords || [], updatedImeiRecords);
    if (changedImeis.length > 0) {
      saveImeiRecordsBatchToFirestore(changedImeis).catch(() => {});
    }
  };

  /**
   * Delete or Cancel a Sale with Stock & IMEI recovery (+ tombstone for permanent delete)
   */
  const handleDeleteSale = (
    invNo: string,
    permanent: boolean = false,
    reason: string = 'Customer request / voided'
  ) => {
    const now = new Date().toISOString();
    const targetSale = data.sales.find(s => s.invNo === invNo);
    const restoredInventoryToSync: typeof data.inventory = [];
    let restoredKhataToSync: KhataCustomer | undefined;
    let syncedImeiRecordsToSave: typeof data.imeiRecords = [];

    if (targetSale && targetSale.status !== 'CANCELLED') {
      data.inventory.forEach(invItem => {
        const soldItems = targetSale.items.filter(si => si.id === invItem.id || si.name === invItem.name);
        if (soldItems.length > 0) {
          const soldImeis = soldItems.flatMap(si => si.imeis || (si.imei ? [si.imei] : []));
          const totalRestoredQty = soldItems.reduce((sum, si) => sum + (si.qty || 0), 0);
          const currentImeis = invItem.imeis || (invItem.imei ? invItem.imei.split(',').map(s => s.trim()).filter(Boolean) : []);
          const combinedImeis = Array.from(new Set([...currentImeis, ...soldImeis]));
          const restoredVariants =
            invItem.variants && invItem.variants.length > 0
              ? invItem.variants.map(v => {
                  const vSoldLines = soldItems.filter(si => si.variantId && v.id && si.variantId === v.id);
                  if (vSoldLines.length === 0) return v;
                  const vQtyAdd = vSoldLines.reduce((sum, si) => sum + (si.qty || 0), 0);
                  const vSoldImeis = vSoldLines.flatMap(si => si.imeis || (si.imei ? [si.imei] : []));
                  const curVImeis = Array.isArray(v.imeis) ? v.imeis.filter(Boolean) : [];
                  return {
                    ...v,
                    qty: (Number(v.qty) || 0) + vQtyAdd,
                    imeis: Array.from(new Set([...curVImeis, ...vSoldImeis])),
                  };
                })
              : invItem.variants;

          restoredInventoryToSync.push({
            ...invItem,
            qty: invItem.qty + totalRestoredQty,
            updatedAt: now,
            imeis: combinedImeis.length > 0 ? combinedImeis : undefined,
            imei: combinedImeis.length > 0 ? combinedImeis.join(', ') : undefined,
            variants: restoredVariants,
          });
        }
      });

      syncedImeiRecordsToSave = (data.imeiRecords || []).map(rec => {
        const isFromSale = targetSale.items.some(si => {
          const soldImeis = si.imeis || (si.imei ? [si.imei] : []);
          return soldImeis.some(im => im.toLowerCase() === rec.imei.toLowerCase());
        });
        if (isFromSale) {
          return {
            ...rec,
            status: 'AVAILABLE' as const,
            invoiceNo: undefined,
            soldDate: undefined,
            customerName: undefined,
            customerPhone: undefined,
            updatedAt: now,
          };
        }
        return rec;
      });

      if (targetSale.invoiceType === 'credit' && targetSale.amountDue && targetSale.amountDue > 0) {
        const matchedCust = data.khata.find(c =>
          targetSale.khataCustomerId
            ? c.id === targetSale.khataCustomerId
            : c.name.toLowerCase() === (targetSale.custName || '').toLowerCase()
        );
        if (matchedCust) {
          restoredKhataToSync = {
            ...matchedCust,
            balance: Math.max(0, matchedCust.balance - targetSale.amountDue),
            lastUpdated: now,
            updatedAt: now,
            history: [
              {
                id: generateEntityId('TX'),
                date: now,
                type: 'debit' as const,
                amount: targetSale.amountDue,
                note: `Invoice #${targetSale.invNo} ${permanent ? 'Permanently Deleted' : 'Cancelled/Voided'}`,
              },
              ...matchedCust.history,
            ],
          };
        }
      }
    }

    const tombstoneRes = permanent
      ? addTombstonesToMap(data.deletedIds, 'sales', [invNo], data.deletedInventoryIds)
      : null;

    setData(prev => {
      const sale = prev.sales.find(s => s.invNo === invNo);
      if (!sale) return prev;

      let updatedInventory = prev.inventory;
      let updatedImeiRecords = prev.imeiRecords || [];
      let updatedKhata = prev.khata;

      if (sale.status !== 'CANCELLED') {
        updatedInventory = prev.inventory.map(invItem => {
          const soldItems = sale.items.filter(si => si.id === invItem.id || si.name === invItem.name);
          if (soldItems.length > 0) {
            const soldImeis = soldItems.flatMap(si => si.imeis || (si.imei ? [si.imei] : []));
            const totalRestoredQty = soldItems.reduce((sum, si) => sum + (si.qty || 0), 0);
            const currentImeis = invItem.imeis || (invItem.imei ? invItem.imei.split(',').map(s => s.trim()).filter(Boolean) : []);
            const combinedImeis = Array.from(new Set([...currentImeis, ...soldImeis]));
            const restoredVariants =
              invItem.variants && invItem.variants.length > 0
                ? invItem.variants.map(v => {
                    const vSoldLines = soldItems.filter(si => si.variantId && v.id && si.variantId === v.id);
                    if (vSoldLines.length === 0) return v;
                    const vQtyAdd = vSoldLines.reduce((sum, si) => sum + (si.qty || 0), 0);
                    const vSoldImeis = vSoldLines.flatMap(si => si.imeis || (si.imei ? [si.imei] : []));
                    const curVImeis = Array.isArray(v.imeis) ? v.imeis.filter(Boolean) : [];
                    return {
                      ...v,
                      qty: (Number(v.qty) || 0) + vQtyAdd,
                      imeis: Array.from(new Set([...curVImeis, ...vSoldImeis])),
                    };
                  })
                : invItem.variants;

            return {
              ...invItem,
              qty: invItem.qty + totalRestoredQty,
              updatedAt: now,
              imeis: combinedImeis.length > 0 ? combinedImeis : undefined,
              imei: combinedImeis.length > 0 ? combinedImeis.join(', ') : undefined,
              variants: restoredVariants,
            };
          }
          return invItem;
        });

        updatedImeiRecords = (prev.imeiRecords || []).map(rec => {
          const isFromSale = sale.items.some(si => {
            const soldImeis = si.imeis || (si.imei ? [si.imei] : []);
            return soldImeis.some(im => im.toLowerCase() === rec.imei.toLowerCase());
          });
          if (isFromSale) {
            return {
              ...rec,
              status: 'AVAILABLE' as const,
              invoiceNo: undefined,
              soldDate: undefined,
              customerName: undefined,
              customerPhone: undefined,
              updatedAt: now,
            };
          }
          return rec;
        });

        if (sale.invoiceType === 'credit' && sale.amountDue && sale.amountDue > 0) {
          updatedKhata = prev.khata.map(c => {
            const isTarget = sale.khataCustomerId
              ? c.id === sale.khataCustomerId
              : c.name.toLowerCase() === (sale.custName || '').toLowerCase();

            if (isTarget) {
              return {
                ...c,
                balance: Math.max(0, c.balance - sale.amountDue!),
                lastUpdated: now,
                updatedAt: now,
                history: [
                  {
                    id: generateEntityId('TX'),
                    date: now,
                    type: 'debit' as const,
                    amount: sale.amountDue!,
                    note: `Invoice #${sale.invNo} ${permanent ? 'Permanently Deleted' : 'Cancelled/Voided'}`,
                  },
                  ...c.history,
                ],
              };
            }
            return c;
          });
        }
      }

      const updatedSales = permanent
        ? prev.sales.filter(s => s.invNo !== invNo)
        : prev.sales.map(s =>
            s.invNo === invNo
              ? {
                  ...s,
                  status: 'CANCELLED' as const,
                  updatedAt: now,
                  notes: `Cancelled: ${reason} | ${s.notes || ''}`.trim(),
                }
              : s
          );

      const nextTomb = permanent
        ? addTombstonesToMap(prev.deletedIds, 'sales', [invNo], prev.deletedInventoryIds)
        : null;

      return {
        ...prev,
        lastModified: now,
        inventory: updatedInventory,
        imeiRecords: updatedImeiRecords,
        khata: updatedKhata,
        sales: updatedSales,
        ...(nextTomb
          ? {
              deletedIds: nextTomb.deletedIds,
              deletedInventoryIds: nextTomb.deletedInventoryIds,
            }
          : {}),
      };
    });

    logActivity(
      'Sale',
      permanent ? `Invoice #${invNo} Permanently Deleted` : `Invoice #${invNo} Cancelled`,
      `Reason: ${reason} | Restored stock quantities and IMEI status`,
      'delete',
      invNo
    );

    if (permanent) {
      removeSaleFromJournal(invNo);
      deleteSaleFromFirestore(invNo).catch(err => console.warn('Failed to delete sale from Firestore:', err));
      if (tombstoneRes) {
        saveRootConfigToFirestore({
          deletedIds: tombstoneRes.deletedIds,
          deletedInventoryIds: tombstoneRes.deletedInventoryIds,
        }).catch(() => {});
      }
    } else if (targetSale) {
      const cancelledSale: SaleRecord = {
        ...targetSale,
        status: 'CANCELLED',
        updatedAt: now,
        notes: `Cancelled: ${reason} | ${targetSale.notes || ''}`.trim(),
      };
      recordLocalSaleInJournal(cancelledSale, []);
      updateSaleInFirestore(cancelledSale).catch(err => console.warn('Failed to cancel sale in Firestore:', err));
    }

    restoredInventoryToSync.forEach(item => saveInventoryItemToFirestore(item).catch(() => {}));
    if (restoredKhataToSync) saveKhataCustomerToFirestore(restoredKhataToSync).catch(() => {});
    const changedDeleteImeis = diffChangedImeiRecords(data.imeiRecords || [], syncedImeiRecordsToSave);
    if (changedDeleteImeis.length > 0) {
      saveImeiRecordsBatchToFirestore(changedDeleteImeis).catch(() => {});
    }

    if (activeReceiptSale && activeReceiptSale.invNo === invNo) {
      if (permanent) {
        setActiveReceiptSale(null);
        setReceiptModalOpen(false);
      } else {
        setActiveReceiptSale(prev => (prev ? { ...prev, status: 'CANCELLED' as const, updatedAt: now } : null));
      }
    }

    showToast(
      permanent
        ? `Invoice #${invNo} permanently deleted!`
        : `Invoice #${invNo} cancelled & stock restored!`,
      'success'
    );
  };

  const handleCancelSale = (invNo: string, reason: string) => {
    handleDeleteSale(invNo, false, reason);
  };

  const handleUpdateSale = (updatedSale: SaleRecord) => {
    const now = new Date().toISOString();
    const saleWithTs: SaleRecord = { ...updatedSale, updatedAt: now };

    recordLocalSaleInJournal(saleWithTs, []);
    setData(prev => ({
      ...prev,
      lastModified: now,
      sales: prev.sales.map(s => (s.invNo === saleWithTs.invNo ? saleWithTs : s)),
    }));

    updateSaleInFirestore(saleWithTs).catch(err => console.warn('Failed to update sale in Firestore:', err));

    if (activeReceiptSale && activeReceiptSale.invNo === saleWithTs.invNo) {
      setActiveReceiptSale(saleWithTs);
    }

    logActivity(
      'Sale',
      `Updated Invoice #${saleWithTs.invNo}`,
      `Total: ${data.settings.currency} ${saleWithTs.grandTotal.toLocaleString()}`,
      'update',
      saleWithTs.invNo
    );

    showToast(`Invoice #${saleWithTs.invNo} updated!`, 'info');
  };

  /**
   * Non-destructive Atomic Invoice Replacement for Edited Bills:
   * Restores old items/IMEIs/Khata & deducts updated items/IMEIs/Khata in one pass
   * WITHOUT creating a CANCELLED invoice record if user backs out early.
   */
  const handleReplaceEditedSale = async (originalInvNo: string, updatedSale: SaleRecord) => {
    const origSale = data.sales.find(s => s.invNo === originalInvNo);
    if (!origSale || origSale.status === 'CANCELLED') {
      await handleCompleteSale(updatedSale);
      return;
    }

    const now = new Date().toISOString();
    const saleWithTs: SaleRecord = {
      ...updatedSale,
      invNo: originalInvNo,
      date: origSale.date || updatedSale.date || now,
      status: 'COMPLETED',
      updatedAt: now,
    };

    // 1. Compute atomic inventory updates (restore origSale items, then apply updatedSale items)
    const inventoryUpdates: Array<{
      id: string;
      newQty: number;
      remainingImeis?: string[];
      variants?: typeof data.inventory[number]['variants'];
      updatedAt?: string;
    }> = [];

    const changedInventoryItems: typeof data.inventory = [];

    const updatedInventory = data.inventory.map(invItem => {
      const origLines = origSale.items.filter(si => si.id === invItem.id || si.name === invItem.name);
      const newLines = saleWithTs.items.filter(si => si.id === invItem.id || si.name === invItem.name);
      if (origLines.length === 0 && newLines.length === 0) return invItem;

      const origQty = origLines.reduce((sum, si) => sum + (si.qty || 0), 0);
      const newQty = newLines.reduce((sum, si) => sum + (si.qty || 0), 0);
      const origImeis = origLines.flatMap(si => extractItemImeis(si));
      const newImeis = newLines.flatMap(si => extractItemImeis(si));

      const currentImeis = extractItemImeis(invItem);
      const withRestoredImeis = Array.from(new Set([...currentImeis, ...origImeis]));
      const remainingImeis = withRestoredImeis.filter(
        im => !newImeis.some(nIm => nIm.toLowerCase() === im.toLowerCase())
      );

      let updatedVariants = invItem.variants;
      if (invItem.variants && invItem.variants.length > 0) {
        updatedVariants = invItem.variants.map(v => {
          const origVLines = origLines.filter(si => si.variantId && v.id && si.variantId === v.id);
          const newVLines = newLines.filter(si => si.variantId && v.id && si.variantId === v.id);
          if (origVLines.length === 0 && newVLines.length === 0) return v;

          const vOrigQty = origVLines.reduce((sum, si) => sum + (si.qty || 0), 0);
          const vNewQty = newVLines.reduce((sum, si) => sum + (si.qty || 0), 0);
          const vOrigImeis = origVLines.flatMap(si => extractItemImeis(si));
          const vNewImeis = newVLines.flatMap(si => extractItemImeis(si));

          const curVImeis = Array.isArray(v.imeis) ? v.imeis.filter(Boolean) : [];
          const restoredVImeis = Array.from(new Set([...curVImeis, ...vOrigImeis]));
          const nextVImeis = restoredVImeis.filter(
            im =>
              !vNewImeis.some(nIm => nIm.toLowerCase() === im.toLowerCase()) &&
              !newImeis.some(nIm => nIm.toLowerCase() === im.toLowerCase())
          );
          const curVQty = v.qty === '' || v.qty === undefined ? curVImeis.length : Number(v.qty) || 0;
          const nextVQty = Math.max(0, curVQty + vOrigQty - vNewQty);

          return {
            ...v,
            qty: nextVQty,
            imeis: nextVImeis,
          };
        });
      }

      const finalQty = Math.max(0, invItem.qty + origQty - newQty);
      const nextItem = {
        ...invItem,
        qty: finalQty,
        updatedAt: now,
        imeis: remainingImeis.length > 0 ? remainingImeis : undefined,
        imei: remainingImeis.length > 0 ? remainingImeis.join(', ') : undefined,
        variants: updatedVariants,
      };

      inventoryUpdates.push({
        id: invItem.id,
        newQty: finalQty,
        remainingImeis,
        variants: updatedVariants,
        updatedAt: now,
      });
      changedInventoryItems.push(nextItem);
      return nextItem;
    });

    // 2. Revert original invoice IMEIs back to AVAILABLE, then mark updated invoice IMEIs SOLD
    const revertedImeis = (data.imeiRecords || []).map(rec => {
      const wasInOrigSale = origSale.items.some(si => {
        const soldImeis = extractItemImeis(si);
        return soldImeis.some(im => im.toLowerCase() === rec.imei.toLowerCase());
      });
      if (wasInOrigSale) {
        return {
          ...rec,
          status: 'AVAILABLE' as const,
          invoiceNo: undefined,
          soldDate: undefined,
          customerName: undefined,
          customerPhone: undefined,
          updatedAt: now,
        };
      }
      return rec;
    });

    const updatedImeiRecords = recordImeisSold({
      sale: saleWithTs,
      existingImeiRecords: revertedImeis,
      inventory: data.inventory,
    });

    // 3. Reconcile Khata ledger delta cleanly
    let updatedKhata = [...data.khata];
    const modifiedKhataIds = new Set<string>();
    const origDue = origSale.invoiceType === 'credit' ? Math.max(0, origSale.amountDue || 0) : 0;
    const newDue = saleWithTs.invoiceType === 'credit' ? Math.max(0, saleWithTs.amountDue || 0) : 0;

    const findKhataCustomerIndex = (
      list: KhataCustomer[],
      custId?: string,
      custName?: string,
      custPhone?: string
    ): number => {
      if (custId) {
        const idx = list.findIndex(c => c.id === custId);
        if (idx !== -1) return idx;
      }
      const normPhone = (custPhone || '').replace(/[^0-9]/g, '');
      const normName = (custName || '').trim().toLowerCase();
      return list.findIndex(c => {
        const cPhone = (c.phone || '').replace(/[^0-9]/g, '');
        return (
          (normName && c.name.trim().toLowerCase() === normName) ||
          (normPhone.length >= 7 && cPhone === normPhone)
        );
      });
    };

    const origCustIdx = origDue > 0
      ? findKhataCustomerIndex(updatedKhata, origSale.khataCustomerId, origSale.custName, origSale.custPhone)
      : -1;
    const newCustIdx = newDue > 0
      ? findKhataCustomerIndex(updatedKhata, saleWithTs.khataCustomerId, saleWithTs.custName, saleWithTs.custPhone)
      : -1;

    let resolvedKhataCustomerId = saleWithTs.khataCustomerId;
    if (origCustIdx !== -1 && origCustIdx === newCustIdx) {
      const targetCust = updatedKhata[origCustIdx];
      resolvedKhataCustomerId = targetCust.id;
      const netDelta = newDue - origDue;
      if (netDelta !== 0) {
        const nextBal = Math.max(0, targetCust.balance + netDelta);
        updatedKhata[origCustIdx] = {
          ...targetCust,
          balance: nextBal,
          lastUpdated: now,
          updatedAt: now,
          history: [
            {
              id: generateEntityId('TX'),
              date: now,
              type: netDelta > 0 ? ('credit' as const) : ('debit' as const),
              amount: Math.abs(netDelta),
              note: formatSaleProductSummary(saleWithTs.items),
            },
            ...targetCust.history,
          ],
        };
        modifiedKhataIds.add(targetCust.id);
      }
    } else {
      if (origCustIdx !== -1 && origDue > 0) {
        const prevCust = updatedKhata[origCustIdx];
        updatedKhata[origCustIdx] = {
          ...prevCust,
          balance: Math.max(0, prevCust.balance - origDue),
          lastUpdated: now,
          updatedAt: now,
          history: [
            {
              id: generateEntityId('TX'),
              date: now,
              type: 'debit' as const,
              amount: origDue,
              note: `Reversed: ${formatSaleProductSummary(saleWithTs.items)}`,
            },
            ...prevCust.history,
          ],
        };
        modifiedKhataIds.add(prevCust.id);
      }

      if (newDue > 0) {
        if (newCustIdx !== -1) {
          const nextCust = updatedKhata[newCustIdx];
          resolvedKhataCustomerId = nextCust.id;
          updatedKhata[newCustIdx] = {
            ...nextCust,
            balance: nextCust.balance + newDue,
            lastUpdated: now,
            updatedAt: now,
            history: [
              {
                id: generateEntityId('TX'),
                date: now,
                type: 'credit' as const,
                amount: newDue,
                note: formatSaleProductSummary(saleWithTs.items),
              },
              ...nextCust.history,
            ],
          };
          modifiedKhataIds.add(nextCust.id);
        } else if (saleWithTs.custName && saleWithTs.custName !== 'Walk-in Customer') {
          const newCustId = saleWithTs.khataCustomerId || generateEntityId('KHT');
          resolvedKhataCustomerId = newCustId;
          const newCust: KhataCustomer = {
            id: newCustId,
            name: saleWithTs.custName,
            phone: saleWithTs.custPhone || 'N/A',
            balance: newDue,
            lastUpdated: now,
            updatedAt: now,
            history: [
              {
                id: generateEntityId('TX'),
                date: now,
                type: 'credit',
                amount: newDue,
                note: formatSaleProductSummary(saleWithTs.items),
              },
            ],
          };
          updatedKhata = [newCust, ...updatedKhata];
          modifiedKhataIds.add(newCustId);
        }
      }
    }

    if (resolvedKhataCustomerId && !saleWithTs.khataCustomerId) {
      saleWithTs.khataCustomerId = resolvedKhataCustomerId;
    }

    const activityData: ActivityLog = {
      id: generateEntityId('ACT'),
      timestamp: now,
      updatedAt: now,
      category: 'Sale',
      title: `Edited Invoice #${originalInvNo}`,
      details: `Total: ${data.settings.currency} ${saleWithTs.grandTotal.toLocaleString()} | Items: ${saleWithTs.items.length} | Customer: ${saleWithTs.custName || 'Walk-in'}`,
      type: 'update',
      user: data.currentRole === 'salesman' ? 'Salesman Terminal' : 'Administrator',
      userRole: data.currentRole,
      relatedRecordId: originalInvNo,
    };

    recordLocalSaleInJournal(saleWithTs, inventoryUpdates);

    setData(prev => ({
      ...prev,
      lastModified: now,
      inventory: updatedInventory,
      khata: updatedKhata,
      imeiRecords: updatedImeiRecords,
      sales: prev.sales.map(s => (s.invNo === originalInvNo ? saleWithTs : s)),
      activities: [activityData, ...(prev.activities || [])].slice(0, 500),
    }));

    setActiveReceiptSale(saleWithTs);
    setReceiptModalOpen(true);
    showToast(`Invoice #${originalInvNo} updated successfully!`, 'success');

    updateSaleInFirestore(saleWithTs).catch(() => {});
    changedInventoryItems.forEach(item => saveInventoryItemToFirestore(item).catch(() => {}));
    modifiedKhataIds.forEach(kId => {
      const cust = updatedKhata.find(c => c.id === kId);
      if (cust) saveKhataCustomerToFirestore(cust).catch(() => {});
    });
    const changedImeis = diffChangedImeiRecords(data.imeiRecords || [], updatedImeiRecords);
    if (changedImeis.length > 0) saveImeiRecordsBatchToFirestore(changedImeis).catch(() => {});
    saveActivityLogToFirestore(activityData).catch(() => {});
  };

  const handleOpenSalesReturn = (sale?: SaleRecord | null) => {
    setSalesReturnInitialSale(sale || null);
    setSalesReturnModalOpen(true);
  };

  const handleSaveSalesReturn = (returnRecord: SalesReturnRecord) => {
    const now = new Date().toISOString();
    const origSale = data.sales.find(s => s.invNo === returnRecord.originalInvNo);

    const applyReturnToInventoryItem = (inv: typeof data.inventory[number]) => {
      const matchingReturns = returnRecord.items.filter(
        ri => ri.productId === inv.id || ri.itemId === inv.id || ri.name === inv.name
      );
      if (matchingReturns.length === 0) return null;

      const totalRestoredQty = matchingReturns.reduce((sum, ri) => sum + (Number(ri.qty) || 0), 0);
      const retImeis = matchingReturns.flatMap(ri => ri.imeis || (ri.imei ? [ri.imei] : []));
      const existingImeis =
        inv.imeis || (inv.imei ? inv.imei.split(',').map(s => s.trim()).filter(Boolean) : []);
      const combinedImeis = Array.from(new Set([...existingImeis, ...retImeis]));

      let updatedVariants = inv.variants;
      if (inv.variants && inv.variants.length > 0) {
        updatedVariants = inv.variants.map(v => {
          const vReturns = matchingReturns.filter(ri => {
            if (ri.variantId && v.id) return ri.variantId === v.id;
            const vLabel = `${v.ram}${v.storage ? `/${v.storage}` : ''}${v.color ? ` (${v.color})` : ''}`;
            return ri.variantLabel && ri.variantLabel === vLabel;
          });
          if (vReturns.length === 0) return v;
          const vAddQty = vReturns.reduce((sum, ri) => sum + (Number(ri.qty) || 0), 0);
          const vRetImeis = vReturns.flatMap(ri => ri.imeis || (ri.imei ? [ri.imei] : []));
          const curVImeis = Array.isArray(v.imeis) ? v.imeis.filter(Boolean) : [];
          return {
            ...v,
            qty: (Number(v.qty) || 0) + vAddQty,
            imeis: Array.from(new Set([...curVImeis, ...vRetImeis])),
          };
        });
      }

      return {
        ...inv,
        qty: inv.qty + totalRestoredQty,
        updatedAt: now,
        imei: combinedImeis.length > 0 ? combinedImeis.join(', ') : undefined,
        imeis: combinedImeis.length > 0 ? combinedImeis : undefined,
        variants: updatedVariants,
      };
    };

    const applyReturnToSale = (sale: SaleRecord): SaleRecord => {
      const alreadyRefunded = sale.totalRefunded || 0;
      const newRefundTotal = alreadyRefunded + returnRecord.totalRefundAmount;
      const isFull = newRefundTotal >= sale.grandTotal;
      const updatedItems = sale.items.map(sItem => {
        const matchedRetItems = returnRecord.items.filter(ri => {
          const idMatch = ri.productId === sItem.id || ri.itemId === sItem.id;
          const variantMatch = !ri.variantId || !sItem.variantId || ri.variantId === sItem.variantId;
          const sImeis = sItem.imeis || (sItem.imei ? sItem.imei.split(',').map(x => x.trim()).filter(Boolean) : []);
          const rImeis = ri.imeis || (ri.imei ? [ri.imei] : []);
          const imeiMatch = rImeis.length === 0 || sImeis.length === 0 || rImeis.some(im => sImeis.includes(im));
          return idMatch && variantMatch && imeiMatch;
        });
        if (matchedRetItems.length === 0) return sItem;

        const addRetQty = matchedRetItems.reduce((sum, ri) => sum + (Number(ri.qty) || 0), 0);
        const addRetImeis = matchedRetItems.flatMap(ri => ri.imeis || (ri.imei ? [ri.imei] : []));
        const prevRetImeis = sItem.returnedImeis || [];
        const mergedRetImeis = Array.from(new Set([...prevRetImeis, ...addRetImeis]));
        const latestReason =
          matchedRetItems.map(ri => ri.returnReason).filter(Boolean).join(', ') ||
          returnRecord.reason;
        const combinedReason = sItem.returnReason
          ? Array.from(new Set([sItem.returnReason, latestReason])).join('; ')
          : latestReason;

        return {
          ...sItem,
          returnedQty: Math.min(sItem.qty, (sItem.returnedQty || 0) + addRetQty),
          returnedImeis: mergedRetImeis.length > 0 ? mergedRetImeis : sItem.returnedImeis,
          returnReason: combinedReason,
          returnedAt: now,
        };
      });

      const allItemsFullyReturned = updatedItems.every(it => (it.returnedQty || 0) >= it.qty);
      const isFullReturn = isFull || allItemsFullyReturned;
      const remainingCost = updatedItems.reduce(
        (sum, it) => sum + Math.max(0, (Number(it.qty) || 0) - (Number(it.returnedQty) || 0)) * (Number(it.costPrice) || 0),
        0
      );
      const remainingRevenue = isFullReturn ? 0 : Math.max(0, (Number(sale.grandTotal) || 0) - newRefundTotal);
      const updatedNetProfit = isFullReturn ? 0 : Math.max(0, remainingRevenue - remainingCost);

      return {
        ...sale,
        updatedAt: now,
        items: updatedItems,
        returnStatus: isFullReturn ? ('FULL' as const) : ('PARTIAL' as const),
        totalRefunded: newRefundTotal,
        netProfit: updatedNetProfit,
      };
    };

    const resolveTargetKhataCustomer = (khataList: KhataCustomer[]): KhataCustomer | undefined => {
      const candidateId = returnRecord.khataCustomerId || origSale?.khataCustomerId;
      if (candidateId) {
        const byId = khataList.find(c => c.id === candidateId);
        if (byId) return byId;
      }
      const normPhone = (returnRecord.customerPhone || origSale?.custPhone || '').replace(/[^0-9]/g, '');
      if (normPhone.length >= 7) {
        const byPhone = khataList.find(c => (c.phone || '').replace(/[^0-9]/g, '') === normPhone);
        if (byPhone) return byPhone;
      }
      const normName = (returnRecord.customerName || origSale?.custName || '').trim().toLowerCase();
      if (normName && normName !== 'walk-in customer') {
        const byName = khataList.find(c => c.name.trim().toLowerCase() === normName);
        if (byName) return byName;
      }
      return undefined;
    };

    const matchedKhataCust = resolveTargetKhataCustomer(data.khata);
    const shouldDeductKhata =
      typeof returnRecord.khataDeductedAmount === 'number'
        ? returnRecord.khataDeductedAmount > 0
        : returnRecord.refundPaymentMethod === 'Credit Adjustment' || origSale?.invoiceType === 'credit';

    const khataDeductAmount =
      shouldDeductKhata && matchedKhataCust
        ? typeof returnRecord.khataDeductedAmount === 'number'
          ? Math.max(0, returnRecord.khataDeductedAmount)
          : returnRecord.totalRefundAmount
        : 0;

    const returnWithTs: SalesReturnRecord = {
      ...returnRecord,
      khataCustomerId: matchedKhataCust?.id || returnRecord.khataCustomerId,
      khataDeductedAmount: khataDeductAmount > 0 ? khataDeductAmount : undefined,
      updatedAt: now,
    };

    const restoredInvToSync: typeof data.inventory = [];
    data.inventory.forEach(inv => {
      const nextInv = applyReturnToInventoryItem(inv);
      if (nextInv) restoredInvToSync.push(nextInv);
    });

    let syncedImeiRecords = data.imeiRecords || [];
    returnWithTs.items.forEach(retItem => {
      const retImeis = retItem.imeis || (retItem.imei ? [retItem.imei] : []);
      if (retImeis.length > 0) {
        syncedImeiRecords = recordImeisReturned({
          returnedImeis: retImeis,
          productId: retItem.productId,
          productName: retItem.name,
          existingImeiRecords: syncedImeiRecords,
        });
      }
    });

    const updatedSaleToSync: SaleRecord | undefined = origSale ? applyReturnToSale(origSale) : undefined;

    const returnedItemsSummary = returnWithTs.items.map(ri => ({
      name: ri.name,
      variantLabel: ri.variantLabel,
      qty: ri.qty,
      imeis: ri.imeis && ri.imeis.length > 0 ? ri.imeis : ri.imei ? [ri.imei] : undefined,
      reason: ri.returnReason || returnWithTs.reason,
      refundAmount: ri.refundAmount,
    }));
    const productReasonSummary = returnedItemsSummary
      .map(
        it =>
          `${it.name}${it.variantLabel ? ` (${it.variantLabel})` : ''} x${it.qty}${
            it.imeis?.length ? ` [IMEI: ${it.imeis.join(', ')}]` : ''
          } — Returned (${it.reason})`
      )
      .join(' | ');
    const khataReturnTxId = generateEntityId('TX');
    const combinedReturnReason =
      Array.from(new Set(returnedItemsSummary.map(i => i.reason).filter(Boolean))).join(', ') ||
      returnWithTs.reason;

    let updatedKhataToSync: KhataCustomer | undefined;
    if (matchedKhataCust && khataDeductAmount > 0) {
      updatedKhataToSync = {
        ...matchedKhataCust,
        balance: Math.max(0, matchedKhataCust.balance - khataDeductAmount),
        lastUpdated: now,
        updatedAt: now,
        history: [
          {
            id: khataReturnTxId,
            date: now,
            type: 'debit' as const,
            amount: khataDeductAmount,
            paymentMethod: returnWithTs.refundPaymentMethod,
            returnNo: returnWithTs.returnNo,
            originalInvNo: returnWithTs.originalInvNo,
            returnReason: combinedReturnReason,
            returnedItemsSummary,
            note: `Sales Return #${returnWithTs.returnNo} for Inv #${returnWithTs.originalInvNo} • ${productReasonSummary}`,
          },
          ...matchedKhataCust.history,
        ],
      };
    }

    setData(prev => {
      const updatedInventory = prev.inventory.map(inv => applyReturnToInventoryItem(inv) || inv);

      let updatedImeiRecords = prev.imeiRecords || [];
      returnWithTs.items.forEach(retItem => {
        const retImeis = retItem.imeis || (retItem.imei ? [retItem.imei] : []);
        if (retImeis.length > 0) {
          updatedImeiRecords = recordImeisReturned({
            returnedImeis: retImeis,
            productId: retItem.productId,
            productName: retItem.name,
            existingImeiRecords: updatedImeiRecords,
          });
        }
      });

      const updatedSales = prev.sales.map(s =>
        s.invNo === returnWithTs.originalInvNo ? applyReturnToSale(s) : s
      );

      let updatedKhata = prev.khata;
      if (khataDeductAmount > 0) {
        const prevTarget = resolveTargetKhataCustomer(prev.khata);
        if (prevTarget) {
          updatedKhata = prev.khata.map(c => {
            if (c.id === prevTarget.id) {
              return {
                ...c,
                balance: Math.max(0, c.balance - khataDeductAmount),
                lastUpdated: now,
                updatedAt: now,
                history: [
                  {
                    id: khataReturnTxId,
                    date: now,
                    type: 'debit' as const,
                    amount: khataDeductAmount,
                    paymentMethod: returnWithTs.refundPaymentMethod,
                    returnNo: returnWithTs.returnNo,
                    originalInvNo: returnWithTs.originalInvNo,
                    returnReason: combinedReturnReason,
                    returnedItemsSummary,
                    note: `Sales Return #${returnWithTs.returnNo} for Inv #${returnWithTs.originalInvNo} • ${productReasonSummary}`,
                  },
                  ...c.history,
                ],
              };
            }
            return c;
          });
        }
      }

      return {
        ...prev,
        lastModified: now,
        inventory: updatedInventory,
        imeiRecords: updatedImeiRecords,
        sales: updatedSales,
        khata: updatedKhata,
        salesReturns: [returnWithTs, ...(prev.salesReturns || [])],
      };
    });

    saveSalesReturnToFirestore(returnWithTs).catch(() => {});
    if (updatedSaleToSync) updateSaleInFirestore(updatedSaleToSync).catch(() => {});
    restoredInvToSync.forEach(item => saveInventoryItemToFirestore(item).catch(() => {}));
    if (updatedKhataToSync) saveKhataCustomerToFirestore(updatedKhataToSync).catch(() => {});
    const changedReturnImeis = diffChangedImeiRecords(data.imeiRecords || [], syncedImeiRecords);
    if (changedReturnImeis.length > 0) saveImeiRecordsBatchToFirestore(changedReturnImeis).catch(() => {});

    logActivity(
      'Sale',
      `Processed Return #${returnWithTs.returnNo} for Inv #${returnWithTs.originalInvNo}`,
      `Customer: ${returnWithTs.customerName} | Refunded: ${data.settings.currency} ${returnWithTs.totalRefundAmount.toLocaleString()} via ${returnWithTs.refundPaymentMethod}${khataDeductAmount > 0 ? ` | Khata Deducted: ${data.settings.currency} ${khataDeductAmount.toLocaleString()}` : ''} | Stock & IMEIs restored | Reason: ${combinedReturnReason}`,
      'return',
      returnWithTs.returnNo
    );

    showToast(
      khataDeductAmount > 0
        ? `Return #${returnWithTs.returnNo} processed! Stock restored & ${data.settings.currency} ${khataDeductAmount.toLocaleString()} deducted from customer Khata.`
        : `Return #${returnWithTs.returnNo} completed & stock updated!`,
      'success'
    );
  };

  return {
    handleCompleteSale,
    handleDeleteSale,
    handleCancelSale,
    handleUpdateSale,
    handleReplaceEditedSale,
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
  };
}
