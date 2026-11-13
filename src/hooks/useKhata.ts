import { useState, Dispatch, SetStateAction } from 'react';
import { AppData, KhataCustomer, ActivityLog } from '../types';
import { saveKhataCustomerToFirestore, deleteKhataCustomerFromFirestore } from '../utils/storage';
import { hasPermission } from '../utils/permissions';
import { generateEntityId } from '../utils/id';

interface UseKhataProps {
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

export function useKhata({ data, setData, logActivity, showToast }: UseKhataProps) {
  const [addKhataModalOpen, setAddKhataModalOpen] = useState(false);
  const [settleKhataModalOpen, setSettleKhataModalOpen] = useState(false);
  const [settleCustomer, setSettleCustomer] = useState<KhataCustomer | null>(null);
  const [selectedKhataCustomerId, setSelectedKhataCustomerId] = useState<string | null>(null);

  /**
   * Save or Add New Customer to Khata Ledger
   */
  const handleSaveKhataCustomer = (customerData: {
    id?: string;
    name: string;
    phone: string;
    phone2?: string;
    address?: string;
    lat?: number;
    lng?: number;
    placeId?: string;
    mapUrl?: string;
    image?: string;
    customerType?: 'retail' | 'retailer' | 'wholesaler';
    shopName?: string;
    city?: string;
    ntnNumber?: string;
    cnic?: string;
    creditLimit?: number;
    dueDate?: string;
    guarantorName?: string;
    guarantorPhone?: string;
    notes?: string;
    openingBalance?: number;
    initialBalanceType?: 'payable' | 'receivable';
  }) => {
    if (!hasPermission(data.currentRole || 'admin', 'canManageKhata')) {
      showToast('Permission Denied: Khata ledger operations are restricted to Administrators', 'error');
      return;
    }

    const {
      id,
      name,
      phone,
      phone2,
      address,
      lat,
      lng,
      placeId,
      mapUrl,
      image,
      customerType,
      shopName,
      city,
      ntnNumber,
      cnic,
      creditLimit,
      dueDate,
      guarantorName,
      guarantorPhone,
      notes,
      openingBalance = 0,
      initialBalanceType = 'receivable',
    } = customerData;

    const actualOpeningBalance =
      initialBalanceType === 'payable' ? -Math.abs(openingBalance) : Math.abs(openingBalance);

    if (id) {
      // Editing existing customer
      let updatedCustomer: KhataCustomer | undefined;

      setData(prev => ({
        ...prev,
        khata: prev.khata.map(c => {
          if (c.id === id) {
            updatedCustomer = {
              ...c,
              name: name.trim(),
              phone: phone.trim(),
              phone2: phone2?.trim() || undefined,
              address: address?.trim() || undefined,
              lat: typeof lat === 'number' && Number.isFinite(lat) ? lat : undefined,
              lng: typeof lng === 'number' && Number.isFinite(lng) ? lng : undefined,
              placeId: placeId?.trim() || undefined,
              mapUrl: mapUrl?.trim() || undefined,
              image: image === '' ? undefined : image || c.image,
              customerType: customerType || c.customerType || 'retail',
              shopName: shopName?.trim() || undefined,
              city: city?.trim() || undefined,
              ntnNumber: ntnNumber?.trim() || undefined,
              cnic: cnic?.trim() || undefined,
              creditLimit: typeof creditLimit === 'number' && creditLimit > 0 ? creditLimit : undefined,
              dueDate: dueDate?.trim() || undefined,
              guarantorName: guarantorName?.trim() || undefined,
              guarantorPhone: guarantorPhone?.trim() || undefined,
              notes: notes?.trim() || undefined,
              lastUpdated: new Date().toISOString(),
            };
            return updatedCustomer;
          }
          return c;
        }),
      }));

      if (updatedCustomer) {
        saveKhataCustomerToFirestore(updatedCustomer).catch(err => {
          console.warn('Firestore Khata update warning:', err);
        });
      }

      logActivity('Khata', `Updated Customer Account: ${name}`, `Phone: ${phone}`, 'update', id);
      showToast(`Customer account for "${name}" updated`, 'success');
    } else {
      // Adding new customer
      const newCustomerId = generateEntityId('KHT');
      const now = new Date().toISOString();

      const newCustomer: KhataCustomer = {
        id: newCustomerId,
        name: name.trim(),
        phone: phone.trim(),
        phone2: phone2?.trim() || undefined,
        address: address?.trim() || undefined,
        lat: typeof lat === 'number' && Number.isFinite(lat) ? lat : undefined,
        lng: typeof lng === 'number' && Number.isFinite(lng) ? lng : undefined,
        placeId: placeId?.trim() || undefined,
        mapUrl: mapUrl?.trim() || undefined,
        image: image || undefined,
        customerType: customerType || 'retail',
        shopName: shopName?.trim() || undefined,
        city: city?.trim() || undefined,
        ntnNumber: ntnNumber?.trim() || undefined,
        cnic: cnic?.trim() || undefined,
        creditLimit: typeof creditLimit === 'number' && creditLimit > 0 ? creditLimit : undefined,
        dueDate: dueDate?.trim() || undefined,
        guarantorName: guarantorName?.trim() || undefined,
        guarantorPhone: guarantorPhone?.trim() || undefined,
        notes: notes?.trim() || undefined,
        balance: actualOpeningBalance,
        lastUpdated: now,
        history:
          actualOpeningBalance !== 0
            ? [
                {
                  id: generateEntityId('TX'),
                  date: now,
                  type: actualOpeningBalance > 0 ? 'credit' : 'debit',
                  amount: Math.abs(actualOpeningBalance),
                  note: `Opening Balance (${initialBalanceType === 'payable' ? 'Payable / Advance' : 'Receivable / Due'})`,
                },
              ]
            : [],
      };

      setData(prev => ({
        ...prev,
        khata: [newCustomer, ...prev.khata],
      }));

      saveKhataCustomerToFirestore(newCustomer).catch(err => {
        console.warn('Firestore Khata create warning:', err);
      });

      logActivity(
        'Khata',
        `Created Customer Account: ${newCustomer.name}`,
        `Initial Balance: ${data.settings.currency} ${actualOpeningBalance}`,
        'create',
        newCustomer.id
      );

      showToast(`Account created for ${newCustomer.name}`, 'success');
      setSelectedKhataCustomerId(newCustomer.id);
    }
  };

  /**
   * Settle customer debt with full/partial payment
   */
  const handleSettleKhataBalance = (
    customerId: string,
    amount: number,
    paymentMethod: string,
    accountId?: string,
    note?: string
  ) => {
    let updatedCustomer: KhataCustomer | undefined;

    setData(prev => ({
      ...prev,
      khata: prev.khata.map(c => {
        if (c.id === customerId) {
          const newBal = c.balance - amount;
          const newTx = {
            id: generateEntityId('TX'),
            date: new Date().toISOString(),
            type: 'payment' as const,
            amount,
            paymentMethod,
            accountId,
            note: note || `Payment of ${data.settings.currency} ${amount.toLocaleString()} received via ${paymentMethod}`,
          };

          updatedCustomer = {
            ...c,
            balance: newBal,
            lastUpdated: new Date().toISOString(),
            history: [newTx, ...c.history],
          };
          return updatedCustomer;
        }
        return c;
      }),
    }));

    if (updatedCustomer) {
      saveKhataCustomerToFirestore(updatedCustomer).catch(err => {
        console.warn('Firestore Khata settlement warning:', err);
      });
    }

    const customer = data.khata.find(c => c.id === customerId);
    logActivity(
      'Khata',
      `Payment Received: ${customer?.name || 'Customer'}`,
      `Amount: ${data.settings.currency} ${amount.toLocaleString()} via ${paymentMethod}`,
      'payment',
      customerId
    );

    showToast(`Payment of ${data.settings.currency} ${amount.toLocaleString()} recorded!`, 'success');
  };

  /**
   * Add custom transaction (debit or credit) to customer ledger
   */
  const handleUpdateKhataBalance = (
    customerId: string,
    type: 'credit' | 'payment',
    amount: number,
    paymentMethod?: string,
    accountId?: string,
    note?: string
  ) => {
    let updatedCustomer: KhataCustomer | undefined;

    setData(prev => ({
      ...prev,
      khata: prev.khata.map(c => {
        if (c.id === customerId) {
          const newBal = type === 'credit' ? c.balance + amount : c.balance - amount;
          const newTx = {
            id: generateEntityId('TX'),
            date: new Date().toISOString(),
            type,
            amount,
            paymentMethod,
            accountId,
            note: note || (type === 'credit' ? 'Credit balance added' : 'Payment received'),
          };

          updatedCustomer = {
            ...c,
            balance: newBal,
            lastUpdated: new Date().toISOString(),
            history: [newTx, ...c.history],
          };
          return updatedCustomer;
        }
        return c;
      }),
    }));

    if (updatedCustomer) {
      saveKhataCustomerToFirestore(updatedCustomer).catch(err => {
        console.warn('Firestore Khata transaction warning:', err);
      });
    }

    const customer = data.khata.find(c => c.id === customerId);
    logActivity(
      'Khata',
      `${type === 'credit' ? 'Credit Added' : 'Payment Recorded'}: ${customer?.name || 'Customer'}`,
      `Amount: ${data.settings.currency} ${amount.toLocaleString()}${note ? ` | Note: ${note}` : ''}`,
      'payment',
      customerId
    );
  };

  /**
   * Delete a single mistaken transaction entry and recalculate balance (Admin only)
   */
  const handleDeleteKhataTransaction = (customerId: string, txId: string) => {
    if (!hasPermission(data.currentRole || 'admin', 'canDeleteKhata')) {
      showToast('Permission Denied: Only Administrators can delete ledger entries', 'error');
      return;
    }

    let updatedCustomer: KhataCustomer | undefined;
    let removedAmount = 0;

    setData(prev => ({
      ...prev,
      khata: prev.khata.map(c => {
        if (c.id !== customerId) return c;
        const target = c.history.find(t => t.id === txId);
        if (!target) return c;
        removedAmount = target.amount;
        const nextHistory = c.history.filter(t => t.id !== txId);
        const recalculatedBalance = nextHistory.reduce((acc, t) => {
          return t.type === 'credit' ? acc + t.amount : acc - t.amount;
        }, 0);

        updatedCustomer = {
          ...c,
          balance: recalculatedBalance,
          lastUpdated: new Date().toISOString(),
          history: nextHistory,
        };
        return updatedCustomer;
      }),
    }));

    if (updatedCustomer) {
      saveKhataCustomerToFirestore(updatedCustomer).catch(err => {
        console.warn('Firestore Khata tx delete warning:', err);
      });
      logActivity(
        'Khata',
        `Removed Ledger Entry: ${updatedCustomer.name}`,
        `Removed ${data.settings.currency} ${removedAmount.toLocaleString()} entry`,
        'delete',
        customerId
      );
      showToast('Ledger entry removed and balance updated', 'info');
    }
  };

  /**
   * Delete customer account from ledger
   */
  const handleDeleteKhataCustomer = (customerId: string) => {
    if (!hasPermission(data.currentRole || 'admin', 'canDeleteKhata')) {
      showToast('Permission Denied: Deleting customer ledgers is restricted to Administrators', 'error');
      return;
    }

    const targetCust = data.khata.find(c => c.id === customerId);
    setData(prev => ({
      ...prev,
      khata: prev.khata.filter(c => c.id !== customerId),
    }));

    deleteKhataCustomerFromFirestore(customerId).catch(err => {
      console.warn('Firestore delete Khata customer warning:', err);
    });

    if (targetCust) {
      logActivity(
        'Khata',
        `Deleted Customer Account: ${targetCust.name}`,
        `Removed balance: ${data.settings.currency} ${targetCust.balance}`,
        'delete',
        customerId
      );
    }

    showToast('Customer account deleted from Khata', 'info');
  };

  return {
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
  };
}
