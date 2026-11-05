import { useState, Dispatch, SetStateAction } from 'react';
import {
  AppData,
  SaleRecord,
  SalesReturnRecord,
  KhataCustomer,
  ActivityLog,
} from '../types';
import { recordImeisSold, extractItemImeis, recordImeisReturned } from '../utils/imeiManager';
import { saveSaleAtomic, deleteSaleFromFirestore, updateSaleInFirestore } from '../utils/storage';
import { generateEntityId } from '../utils/id';

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
  // Modal states related to sales
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
    // 1. Calculate Inventory Updates & remaining IMEIs
    const inventoryUpdates: Array<{ id: string; newQty: number; remainingImeis?: string[] }> = [];

    const updatedInventory = data.inventory.map(invItem => {
      const soldItem = sale.items.find(s => s.id === invItem.id);
      if (soldItem) {
        const soldImeisList = extractItemImeis(soldItem);
        const currentImeis = extractItemImeis(invItem);
        const remainingImeis = currentImeis.filter(
          im => !soldImeisList.some(sIm => sIm.toLowerCase() === im.toLowerCase())
        );

        const newQty = Math.max(0, invItem.qty - soldItem.qty);
        inventoryUpdates.push({
          id: invItem.id,
          newQty,
          remainingImeis: remainingImeis.length > 0 ? remainingImeis : undefined,
        });

        return {
          ...invItem,
          qty: newQty,
          imeis: remainingImeis.length > 0 ? remainingImeis : undefined,
          imei: remainingImeis.length > 0 ? remainingImeis.join(', ') : undefined,
        };
      }
      return invItem;
    });

    // 2. Update permanent IMEI tracking ledger
    const updatedImeiRecords = recordImeisSold({
      sale,
      existingImeiRecords: data.imeiRecords || [],
      inventory: data.inventory,
    });

    // 3. Khata ledger calculation
    let updatedKhata = data.khata;
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

    if (sale.invoiceType === 'credit' && sale.amountDue && sale.amountDue > 0) {
      let matched = false;
      const txId = generateEntityId('TX');
      const txDate = new Date().toISOString();

      updatedKhata = data.khata.map(c => {
        const isTarget = sale.khataCustomerId
          ? c.id === sale.khataCustomerId
          : c.name.toLowerCase() === (sale.custName || '').toLowerCase();

        if (isTarget) {
          matched = true;
          const newBal = c.balance + sale.amountDue!;
          khataAtomicUpdate = {
            customerId: c.id,
            newBalance: newBal,
            transaction: {
              id: txId,
              date: txDate,
              type: 'credit',
              amount: sale.amountDue!,
              note: `Invoice #${sale.invNo} (${sale.items.length} items)`,
            },
          };
          return {
            ...c,
            balance: newBal,
            lastUpdated: txDate,
            history: [
              {
                id: txId,
                date: txDate,
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
        const newCustId = sale.khataCustomerId || generateEntityId('KHT');
        const newCust: KhataCustomer = {
          id: newCustId,
          name: sale.custName,
          phone: sale.custPhone || 'N/A',
          balance: sale.amountDue,
          lastUpdated: txDate,
          history: [
            {
              id: txId,
              date: txDate,
              type: 'credit',
              amount: sale.amountDue,
              note: `Invoice #${sale.invNo}`,
            },
          ],
        };
        updatedKhata = [newCust, ...updatedKhata];
        khataAtomicUpdate = {
          customerId: newCustId,
          newBalance: sale.amountDue,
          transaction: {
            id: txId,
            date: txDate,
            type: 'credit',
            amount: sale.amountDue,
            note: `Invoice #${sale.invNo}`,
          },
        };
      }
    }

    const activityData: ActivityLog = {
      id: generateEntityId('ACT'),
      timestamp: new Date().toISOString(),
      category: 'Sale',
      title: `${sale.invoiceType === 'credit' ? 'Credit' : 'Cash'} Invoice #${sale.invNo} Completed`,
      details: `Total: ${data.settings.currency} ${sale.grandTotal.toLocaleString()} | Items: ${sale.items.length} | Customer: ${sale.custName || 'Walk-in'}${sale.amountDue ? ` | Due: ${data.settings.currency} ${sale.amountDue.toLocaleString()}` : ''}`,
      type: 'sale',
      user: data.currentRole === 'salesman' ? 'Salesman Terminal' : 'Administrator',
      userRole: data.currentRole,
      relatedRecordId: sale.invNo,
    };

    // 4. Update React State immediately for responsive UI
    setData(prev => ({
      ...prev,
      inventory: updatedInventory,
      khata: updatedKhata,
      sales: [sale, ...prev.sales],
      imeiRecords: updatedImeiRecords,
      activities: [activityData, ...(prev.activities || [])].slice(0, 500),
    }));

    setActiveReceiptSale(sale);
    setReceiptModalOpen(true);
    showToast(`Sale #${sale.invNo} completed!`, 'success');

    // 5. Fire atomic Firestore subcollection batch update
    saveSaleAtomic({
      sale,
      inventoryUpdates,
      khataUpdate: khataAtomicUpdate,
      activity: activityData,
    }).catch(err => {
      console.warn('Background atomic Firestore sync warning:', err);
    });
  };

  /**
   * Delete or Cancel a Sale with Stock & IMEI recovery
   */
  const handleDeleteSale = (
    invNo: string,
    permanent: boolean = false,
    reason: string = 'Customer request / voided'
  ) => {
    setData(prev => {
      const sale = prev.sales.find(s => s.invNo === invNo);
      if (!sale) return prev;

      let updatedInventory = prev.inventory;
      let updatedImeiRecords = prev.imeiRecords || [];
      let updatedKhata = prev.khata;

      // Only restore stock, IMEIs and khata balance if the sale was NOT already CANCELLED
      if (sale.status !== 'CANCELLED') {
        // 1. Restore product quantities and IMEIs in inventory
        updatedInventory = prev.inventory.map(invItem => {
          const soldItem = sale.items.find(si => si.id === invItem.id || si.name === invItem.name);
          if (soldItem) {
            const soldImeis = soldItem.imeis || (soldItem.imei ? [soldItem.imei] : []);
            const currentImeis = invItem.imeis || (invItem.imei ? invItem.imei.split(',').map(s => s.trim()).filter(Boolean) : []);
            const combinedImeis = Array.from(new Set([...currentImeis, ...soldImeis]));
            return {
              ...invItem,
              qty: invItem.qty + soldItem.qty,
              imeis: combinedImeis.length > 0 ? combinedImeis : undefined,
              imei: combinedImeis.length > 0 ? combinedImeis.join(', ') : undefined,
            };
          }
          return invItem;
        });

        // 2. Update IMEI ledger records back to 'AVAILABLE'
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
              updatedAt: new Date().toISOString(),
            };
          }
          return rec;
        });

        // 3. Deduct from customer Khata balance if credit sale
        if (sale.invoiceType === 'credit' && sale.amountDue && sale.amountDue > 0) {
          updatedKhata = prev.khata.map(c => {
            const isTarget = sale.khataCustomerId
              ? c.id === sale.khataCustomerId
              : c.name.toLowerCase() === (sale.custName || '').toLowerCase();

            if (isTarget) {
              return {
                ...c,
                balance: Math.max(0, c.balance - sale.amountDue!),
                lastUpdated: new Date().toISOString(),
                history: [
                  {
                    id: generateEntityId('TX'),
                    date: new Date().toISOString(),
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

      let updatedSales: SaleRecord[];
      if (permanent) {
        updatedSales = prev.sales.filter(s => s.invNo !== invNo);
      } else {
        updatedSales = prev.sales.map(s => {
          if (s.invNo === invNo) {
            return {
              ...s,
              status: 'CANCELLED' as const,
              notes: `Cancelled: ${reason} | ${s.notes || ''}`.trim(),
            };
          }
          return s;
        });
      }

      return {
        ...prev,
        inventory: updatedInventory,
        imeiRecords: updatedImeiRecords,
        khata: updatedKhata,
        sales: updatedSales,
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
      deleteSaleFromFirestore(invNo).catch(err => console.warn('Failed to delete sale from Firestore:', err));
    } else {
      const saleToCancel = data.sales.find(s => s.invNo === invNo);
      if (saleToCancel) {
        updateSaleInFirestore({
          ...saleToCancel,
          status: 'CANCELLED',
          notes: `Cancelled: ${reason} | ${saleToCancel.notes || ''}`.trim(),
        }).catch(err => console.warn('Failed to cancel sale in Firestore:', err));
      }
    }

    if (activeReceiptSale && activeReceiptSale.invNo === invNo) {
      if (permanent) {
        setActiveReceiptSale(null);
        setReceiptModalOpen(false);
      } else {
        setActiveReceiptSale(prev => (prev ? { ...prev, status: 'CANCELLED' as const } : null));
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
    setData(prev => ({
      ...prev,
      sales: prev.sales.map(s => (s.invNo === updatedSale.invNo ? updatedSale : s)),
    }));

    updateSaleInFirestore(updatedSale).catch(err => console.warn('Failed to update sale in Firestore:', err));

    if (activeReceiptSale && activeReceiptSale.invNo === updatedSale.invNo) {
      setActiveReceiptSale(updatedSale);
    }

    logActivity(
      'Sale',
      `Updated Invoice #${updatedSale.invNo}`,
      `Total: ${data.settings.currency} ${updatedSale.grandTotal.toLocaleString()}`,
      'update',
      updatedSale.invNo
    );

    showToast(`Invoice #${updatedSale.invNo} updated!`, 'info');
  };

  const handleOpenSalesReturn = (sale?: SaleRecord | null) => {
    setSalesReturnInitialSale(sale || null);
    setSalesReturnModalOpen(true);
  };

  const handleSaveSalesReturn = (returnRecord: SalesReturnRecord) => {
    setData(prev => {
      // 1. Restore product quantities and returned IMEIs in inventory
      const updatedInventory = prev.inventory.map(inv => {
        const retItem = returnRecord.items.find(ri => ri.productId === inv.id || ri.name === inv.name);
        if (retItem) {
          const retImeis = retItem.imeis || (retItem.imei ? [retItem.imei] : []);
          const existingImeis = inv.imeis || (inv.imei ? inv.imei.split(',').map(s => s.trim()).filter(Boolean) : []);
          const combinedImeis = Array.from(new Set([...existingImeis, ...retImeis]));

          return {
            ...inv,
            qty: inv.qty + retItem.qty,
            imei: combinedImeis.length > 0 ? combinedImeis.join(', ') : undefined,
            imeis: combinedImeis.length > 0 ? combinedImeis : undefined,
          };
        }
        return inv;
      });

      // 2. Restore available IMEI in imeiRecords ledger
      let updatedImeiRecords = prev.imeiRecords || [];
      returnRecord.items.forEach(retItem => {
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

      // 3. Mark original sale returnStatus
      const updatedSales = prev.sales.map(s => {
        if (s.invNo === returnRecord.originalInvNo) {
          const alreadyRefunded = s.totalRefunded || 0;
          const newRefundTotal = alreadyRefunded + returnRecord.totalRefundAmount;
          const isFull = newRefundTotal >= s.grandTotal;
          return {
            ...s,
            returnStatus: isFull ? ('FULL' as const) : ('PARTIAL' as const),
            totalRefunded: newRefundTotal,
          };
        }
        return s;
      });

      // 4. If credit sale with customer balance, deduct refund from Khata balance
      let updatedKhata = prev.khata;
      if (returnRecord.khataCustomerId && returnRecord.totalRefundAmount > 0) {
        updatedKhata = prev.khata.map(c => {
          if (c.id === returnRecord.khataCustomerId) {
            return {
              ...c,
              balance: Math.max(0, c.balance - returnRecord.totalRefundAmount),
              lastUpdated: new Date().toISOString(),
              history: [
                {
                  id: generateEntityId('TX'),
                  date: new Date().toISOString(),
                  type: 'debit' as const,
                  amount: returnRecord.totalRefundAmount,
                  note: `Sales Return #${returnRecord.returnNo} for Inv #${returnRecord.originalInvNo}`,
                },
                ...c.history,
              ],
            };
          }
          return c;
        });
      }

      return {
        ...prev,
        inventory: updatedInventory,
        imeiRecords: updatedImeiRecords,
        sales: updatedSales,
        khata: updatedKhata,
        salesReturns: [returnRecord, ...(prev.salesReturns || [])],
      };
    });

    logActivity(
      'Sale',
      `Processed Return #${returnRecord.returnNo} for Inv #${returnRecord.originalInvNo}`,
      `Customer: ${returnRecord.customerName} | Refunded: ${data.settings.currency} ${returnRecord.totalRefundAmount.toLocaleString()} via ${returnRecord.refundPaymentMethod} | Stock & IMEIs restored | Reason: ${returnRecord.reason}`,
      'return',
      returnRecord.returnNo
    );

    showToast(`Return #${returnRecord.returnNo} completed & stock updated!`, 'success');
  };

  return {
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
  };
}
