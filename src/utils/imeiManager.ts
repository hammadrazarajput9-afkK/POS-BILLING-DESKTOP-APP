import { InventoryItem, ImeiRecord, SaleRecord, SupplierPurchase, SalesReturnRecord } from '../types';

/**
 * Extracts and sanitizes all IMEIs from an item (both .imeis array and .imei string).
 */
export function extractItemImeis(item: { imei?: string; imeis?: string[] }): string[] {
  const result = new Set<string>();

  if (Array.isArray(item.imeis)) {
    for (const im of item.imeis) {
      const clean = (im || '').toString().trim();
      if (clean) result.add(clean);
    }
  }

  if (item.imei) {
    const parts = item.imei.split(',').map(s => s.trim()).filter(Boolean);
    for (const p of parts) {
      if (p) result.add(p);
    }
  }

  return Array.from(result);
}

export interface ImeiValidationResult {
  valid: boolean;
  error?: string;
  duplicateImei?: string;
}

/**
 * Validates IMEIs before adding, editing, purchasing, or importing.
 * 
 * Rules:
 * 1. An IMEI must not exist as available stock in multiple products.
 *    If it already exists in inventory: "This IMEI already exists in inventory."
 * 2. If it was already sold: "This IMEI has already been sold."
 * 3. Duplicate IMEIs within the same form/input list are blocked.
 * 4. Cross-checks sales returns to prevent re-entering returned stock as new items.
 */
export function validateImeis({
  imeisToCheck,
  currentProductId,
  inventory = [],
  imeiRecords = [],
  sales = [],
  salesReturns = [],
}: {
  imeisToCheck: string[];
  currentProductId?: string;
  inventory?: InventoryItem[];
  imeiRecords?: ImeiRecord[];
  sales?: SaleRecord[];
  salesReturns?: SalesReturnRecord[];
}): ImeiValidationResult {
  const cleanedList = imeisToCheck.map(i => (i || '').toString().trim()).filter(Boolean);
  if (cleanedList.length === 0) {
    return { valid: true };
  }

  // 1. Check for duplicates within the entered input list
  const seenInInput = new Set<string>();
  for (const imei of cleanedList) {
    const lower = imei.toLowerCase();
    if (seenInInput.has(lower)) {
      return {
        valid: false,
        error: `This IMEI already exists in inventory. (Duplicate in current entry: ${imei})`,
        duplicateImei: imei,
      };
    }
    seenInInput.add(lower);
  }

  // 2. Build set of currently available inventory IMEIs (excluding currentProductId if editing)
  const availableInventoryImeis = new Map<string, { productId: string; productName: string }>();
  for (const item of inventory) {
    if (currentProductId && item.id === currentProductId) {
      continue;
    }
    // Only check active inventory items
    if (item.status === 'ARCHIVED') {
      continue;
    }
    const itemImeis = extractItemImeis(item);
    for (const imei of itemImeis) {
      availableInventoryImeis.set(imei.toLowerCase(), {
        productId: item.id,
        productName: item.name,
      });
    }
  }

  // 3. Build set of SOLD IMEIs from imeiRecords and historical sales
  const soldImeis = new Map<string, { invoiceNo?: string; soldDate?: string }>();

  // Check imeiRecords with status === 'SOLD'
  for (const rec of imeiRecords) {
    if (rec.status === 'SOLD') {
      soldImeis.set(rec.imei.toLowerCase(), {
        invoiceNo: rec.invoiceNo,
        soldDate: rec.soldDate,
      });
    }
  }

  // Also check all historical sales
  for (const sale of sales) {
    for (const soldItem of sale.items) {
      const soldItemImeis = extractItemImeis(soldItem);
      for (const imei of soldItemImeis) {
        if (!soldImeis.has(imei.toLowerCase())) {
          soldImeis.set(imei.toLowerCase(), {
            invoiceNo: sale.invNo,
            soldDate: sale.date,
          });
        }
      }
    }
  }

  // 4. Build set of returned IMEIs from salesReturns ledger
  const returnedImeisMap = new Map<string, { returnNo: string; returnDate: string }>();
  for (const ret of salesReturns) {
    for (const retItem of ret.items) {
      const retItemImeis = extractItemImeis(retItem);
      for (const imei of retItemImeis) {
        if (!returnedImeisMap.has(imei.toLowerCase())) {
          returnedImeisMap.set(imei.toLowerCase(), {
            returnNo: ret.returnNo,
            returnDate: ret.returnDate,
          });
        }
      }
    }
  }

  // 5. Validate each entered IMEI against Available Stock, Sold History, and Returns
  for (const imei of cleanedList) {
    const lower = imei.toLowerCase();

    // Check if exists in other available inventory
    if (availableInventoryImeis.has(lower)) {
      const existing = availableInventoryImeis.get(lower)!;
      return {
        valid: false,
        error: `This IMEI already exists in inventory (Product: "${existing.productName}").`,
        duplicateImei: imei,
      };
    }

    // Check if was already sold
    if (soldImeis.has(lower)) {
      const soldInfo = soldImeis.get(lower);
      return {
        valid: false,
        error: `This IMEI has already been sold${soldInfo?.invoiceNo ? ` on Invoice #${soldInfo.invoiceNo}` : ''}.`,
        duplicateImei: imei,
      };
    }
  }

  return { valid: true };
}

/**
 * Persistent Unique Sequence Invoice Number Generator
 * 
 * Format: INV-YYYYMMDD-0001, INV-YYYYMMDD-0002, INV-YYYYMMDD-0003...
 * Survives application restart and persists sequentially without Math.random() collisions.
 */
export function generateNextInvoiceNumber(
  existingSales: SaleRecord[] = [],
  date: Date = new Date()
): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;
  const prefix = `INV-${dateStr}-`;

  let maxSeq = 0;

  for (const sale of existingSales) {
    if (sale.invNo && sale.invNo.startsWith(prefix)) {
      const seqPart = sale.invNo.substring(prefix.length);
      const parsed = parseInt(seqPart, 10);
      if (!isNaN(parsed) && parsed > maxSeq) {
        maxSeq = parsed;
      }
    } else if (sale.invNo && sale.invNo.startsWith('INV-')) {
      // Check if same date in ISO string
      const saleDate = new Date(sale.date);
      if (
        saleDate.getFullYear() === year &&
        saleDate.getMonth() === date.getMonth() &&
        saleDate.getDate() === date.getDate()
      ) {
        const parts = sale.invNo.split('-');
        if (parts.length >= 3) {
          const num = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(num) && num > maxSeq) {
            maxSeq = num;
          }
        }
      }
    }
  }

  const nextSeq = maxSeq + 1;
  const paddedSeq = String(nextSeq).padStart(4, '0');
  return `${prefix}${paddedSeq}`;
}

/**
 * Updates IMEI ledger when a sale is completed.
 * Marks sold IMEIs as SOLD, links to invoice, sale date, and customer.
 * Preserves all historical IMEI information permanently.
 */
export function recordImeisSold({
  sale,
  existingImeiRecords = [],
  inventory = [],
}: {
  sale: SaleRecord;
  existingImeiRecords?: ImeiRecord[];
  inventory?: InventoryItem[];
}): ImeiRecord[] {
  const updatedRecords = [...existingImeiRecords];
  const now = new Date().toISOString();

  for (const soldItem of sale.items) {
    const soldImeis = extractItemImeis(soldItem);

    for (const imei of soldImeis) {
      const existingIdx = updatedRecords.findIndex(
        r => r.imei.toLowerCase() === imei.toLowerCase()
      );

      if (existingIdx >= 0) {
        updatedRecords[existingIdx] = {
          ...updatedRecords[existingIdx],
          status: 'SOLD',
          invoiceNo: sale.invNo,
          soldDate: sale.date || now,
          customerName: sale.custName,
          customerPhone: sale.custPhone,
          updatedAt: now,
        };
      } else {
        const matchedInv = inventory.find(i => i.id === soldItem.id);
        updatedRecords.push({
          id: 'IMEI-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          imei,
          productId: soldItem.id,
          productName: soldItem.name,
          category: soldItem.category || matchedInv?.category,
          status: 'SOLD',
          invoiceNo: sale.invNo,
          soldDate: sale.date || now,
          customerName: sale.custName,
          customerPhone: sale.custPhone,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  return updatedRecords;
}

/**
 * Registers new available IMEIs into the IMEI tracking ledger when stock is added or purchased.
 */
export function recordImeisAvailable({
  items,
  existingImeiRecords = [],
  purchaseBillNo,
  purchaseParty,
}: {
  items: { id: string; name: string; category?: string; imei?: string; imeis?: string[] }[];
  existingImeiRecords?: ImeiRecord[];
  purchaseBillNo?: string;
  purchaseParty?: string;
}): ImeiRecord[] {
  const updatedRecords = [...existingImeiRecords];
  const now = new Date().toISOString();

  for (const item of items) {
    const imeis = extractItemImeis(item);
    for (const imei of imeis) {
      const existingIdx = updatedRecords.findIndex(
        r => r.imei.toLowerCase() === imei.toLowerCase()
      );

      if (existingIdx >= 0) {
        // If it was previously returned or available, update product link
        if (updatedRecords[existingIdx].status !== 'SOLD') {
          updatedRecords[existingIdx] = {
            ...updatedRecords[existingIdx],
            productId: item.id,
            productName: item.name,
            category: item.category || updatedRecords[existingIdx].category,
            status: 'AVAILABLE',
            purchaseBillNo: purchaseBillNo || updatedRecords[existingIdx].purchaseBillNo,
            purchaseParty: purchaseParty || updatedRecords[existingIdx].purchaseParty,
            updatedAt: now,
          };
        }
      } else {
        updatedRecords.push({
          id: 'IMEI-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          imei,
          productId: item.id,
          productName: item.name,
          category: item.category,
          status: 'AVAILABLE',
          purchaseBillNo,
          purchaseParty,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  return updatedRecords;
}

/**
 * Generates unique sequence number for Sales Returns: RET-YYYYMMDD-0001, RET-YYYYMMDD-0002...
 */
export function generateNextReturnNumber(
  existingReturns: { returnNo?: string; returnDate?: string }[] = [],
  date: Date = new Date()
): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;
  const prefix = `RET-${dateStr}-`;

  let maxSeq = 0;
  for (const ret of existingReturns) {
    if (ret.returnNo && ret.returnNo.startsWith(prefix)) {
      const seqPart = ret.returnNo.substring(prefix.length);
      const parsed = parseInt(seqPart, 10);
      if (!isNaN(parsed) && parsed > maxSeq) {
        maxSeq = parsed;
      }
    }
  }

  const nextSeq = maxSeq + 1;
  return `${prefix}${String(nextSeq).padStart(4, '0')}`;
}

/**
 * Updates IMEI ledger when an IMEI product is returned.
 * Restores the IMEI status to AVAILABLE so it can be re-sold.
 */
export function recordImeisReturned({
  returnedImeis,
  productId,
  productName,
  existingImeiRecords = [],
}: {
  returnedImeis: string[];
  productId: string;
  productName: string;
  existingImeiRecords?: ImeiRecord[];
}): ImeiRecord[] {
  const updatedRecords = [...existingImeiRecords];
  const now = new Date().toISOString();

  for (const imei of returnedImeis) {
    const clean = (imei || '').trim();
    if (!clean) continue;

    const existingIdx = updatedRecords.findIndex(
      r => r.imei.toLowerCase() === clean.toLowerCase()
    );

    if (existingIdx >= 0) {
      updatedRecords[existingIdx] = {
        ...updatedRecords[existingIdx],
        status: 'AVAILABLE',
        productId,
        productName,
        updatedAt: now,
      };
    } else {
      updatedRecords.push({
        id: 'IMEI-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        imei: clean,
        productId,
        productName,
        status: 'AVAILABLE',
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  return updatedRecords;
}

/**
 * Removes or unregisters IMEIs when a purchase is cancelled / reversed.
 */
export function recordImeisReversed({
  purchaseBillNo,
  reversedImeis,
  existingImeiRecords = [],
}: {
  purchaseBillNo: string;
  reversedImeis: string[];
  existingImeiRecords?: ImeiRecord[];
}): ImeiRecord[] {
  const cleanReversed = new Set(reversedImeis.map(i => i.toLowerCase().trim()).filter(Boolean));
  return existingImeiRecords.filter(rec => {
    if (cleanReversed.has(rec.imei.toLowerCase())) {
      return false;
    }
    if (rec.purchaseBillNo === purchaseBillNo && rec.status === 'AVAILABLE') {
      return false;
    }
    return true;
  });
}
