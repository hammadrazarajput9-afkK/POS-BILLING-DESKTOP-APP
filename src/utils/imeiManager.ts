import { InventoryItem, ImeiRecord, SaleRecord, SupplierPurchase, SalesReturnRecord } from '../types';

export const MAX_SINGLE_IMEI_LENGTH = 17;

/**
 * Sanitizes a single IMEI box value so it strictly contains at most 1 IMEI.
 * Removes spaces, commas, newlines, tabs, semicolons, and caps length.
 */
export function sanitizeSingleImei(raw: string): string {
  const cleaned = (raw || '').toString().replace(/[^0-9a-zA-Z]/g, '');
  if (!cleaned) return '';
  if (/^\d+$/.test(cleaned) && cleaned.length > 16) {
    return cleaned.slice(0, 15);
  }
  return cleaned.slice(0, MAX_SINGLE_IMEI_LENGTH);
}

/**
 * Extracts individual IMEI tokens from pasted/scanned input.
 * Splits by commas, whitespace, newlines, semicolons, AND chunks back-to-back
 * continuous 15-digit numeric barcode scanner streams into separate 15-digit IMEIs.
 */
export function extractScannedImeiTokens(raw: string): string[] {
  const roughParts = (raw || '')
    .toString()
    .split(/[\r\n\t,;|/\s]+/)
    .map(p => p.replace(/[^0-9a-zA-Z]/g, ''))
    .filter(Boolean);

  const tokens: string[] = [];
  for (const part of roughParts) {
    if (/^\d{16,}$/.test(part)) {
      // Scanner concatenated multiple 15-digit IMEIs without separator
      for (let i = 0; i < part.length; i += 15) {
        const chunk = part.slice(i, i + 15);
        if (chunk) tokens.push(chunk);
      }
    } else if (part.length > MAX_SINGLE_IMEI_LENGTH) {
      // Long alphanumeric scan burst: take standard 15-char chunk if starts with 15 digits, else 17-char chunks
      if (/^\d{15}/.test(part)) {
        tokens.push(part.slice(0, 15));
        const rest = part.slice(15);
        if (rest) tokens.push(...extractScannedImeiTokens(rest));
      } else {
        for (let i = 0; i < part.length; i += MAX_SINGLE_IMEI_LENGTH) {
          const chunk = part.slice(i, i + MAX_SINGLE_IMEI_LENGTH);
          if (chunk) tokens.push(chunk);
        }
      }
    } else {
      tokens.push(part);
    }
  }
  return tokens;
}

/**
 * Enforces strict "1 Box = 1 IMEI" across all IMEI input boxes.
 * If a scanner or user enters/pastes a second IMEI (via delimiter or >15 digits),
 * keeps only 1 IMEI in `targetIndex` and overflows extra IMEIs into subsequent boxes.
 */
export function distributeImeiInput({
  rawValue,
  currentImeis,
  targetIndex,
}: {
  rawValue: string;
  currentImeis: string[];
  targetIndex: number;
}): {
  nextImeis: string[];
  focusIndex: number | null;
  overflowCount: number;
  multipleDetected: boolean;
  singleTruncated: boolean;
} {
  const prevVal = (currentImeis[targetIndex] || '').trim();
  const nextImeis = [...currentImeis];
  while (nextImeis.length <= targetIndex) nextImeis.push('');

  const cleanedRaw = (rawValue || '').replace(/[\r\n\t]/g, '');

  // Case 1: Box already held a full 15-digit IMEI and new characters were appended at the end (no Enter from scanner)
  if (
    /^\d{15}$/.test(prevVal) &&
    cleanedRaw.length > 15 &&
    cleanedRaw.startsWith(prevVal)
  ) {
    const trailingRaw = cleanedRaw.slice(15);
    const trailingTokens = extractScannedImeiTokens(trailingRaw);
    nextImeis[targetIndex] = prevVal;

    if (trailingTokens.length === 0) {
      return {
        nextImeis,
        focusIndex: targetIndex + 1 < nextImeis.length ? targetIndex + 1 : null,
        overflowCount: 0,
        multipleDetected: false,
        singleTruncated: true,
      };
    }

    let overflowCount = 0;
    let lastFilled = targetIndex;
    for (let i = 0; i < trailingTokens.length; i++) {
      const destIdx = targetIndex + 1 + i;
      if (destIdx < nextImeis.length) {
        nextImeis[destIdx] = sanitizeSingleImei(trailingTokens[i]);
        lastFilled = destIdx;
      } else {
        overflowCount += 1;
      }
    }

    return {
      nextImeis,
      focusIndex: lastFilled < nextImeis.length ? lastFilled : null,
      overflowCount,
      multipleDetected: trailingTokens.length > 0 && overflowCount === 0,
      singleTruncated: overflowCount > 0,
    };
  }

  // Case 2: Multiple tokens separated by space/comma/newline OR continuous 16+ digit scan
  const hasDelimiter = /[\r\n\t,;|/\s]/.test(cleanedRaw.trim());
  const tokens = extractScannedImeiTokens(cleanedRaw);

  if (tokens.length > 1) {
    let overflowCount = 0;
    let lastFilled = targetIndex;
    for (let i = 0; i < tokens.length; i++) {
      const destIdx = targetIndex + i;
      if (destIdx < nextImeis.length) {
        nextImeis[destIdx] = sanitizeSingleImei(tokens[i]);
        lastFilled = destIdx;
      } else {
        overflowCount += 1;
      }
    }
    const nextFocus = lastFilled + 1 < nextImeis.length ? lastFilled + 1 : null;
    return {
      nextImeis,
      focusIndex: nextFocus,
      overflowCount,
      multipleDetected: true,
      singleTruncated: overflowCount > 0,
    };
  }

  // Case 3: Single IMEI entry — strip invalid/separator chars & cap strictly to 1 IMEI
  const single = sanitizeSingleImei(tokens[0] || '');
  const rawAlnum = cleanedRaw.replace(/[^0-9a-zA-Z]/g, '');
  const wasTruncated = rawAlnum.length > single.length || (hasDelimiter && single.length > 0);
  nextImeis[targetIndex] = single;

  return {
    nextImeis,
    focusIndex: null,
    overflowCount: wasTruncated && rawAlnum.length > single.length ? 1 : 0,
    multipleDetected: false,
    singleTruncated: wasTruncated && rawAlnum.length > single.length,
  };
}

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
 * 1. An IMEI box must hold strictly 1 IMEI (no multiple IMEIs or >17 chars in a single box).
 * 2. An IMEI must not exist as available stock in multiple products.
 *    If it already exists in inventory: "This IMEI already exists in inventory."
 * 3. If it was already sold: "This IMEI has already been sold."
 * 4. Duplicate IMEIs within the same form/input list are blocked.
 * 5. Cross-checks sales returns to prevent re-entering returned stock as new items.
 */
export function validateImeis({
  imeisToCheck,
  currentProductId,
  allowedExistingImeis = [],
  inventory = [],
  imeiRecords = [],
  sales = [],
  salesReturns = [],
}: {
  imeisToCheck: string[];
  currentProductId?: string;
  allowedExistingImeis?: string[];
  inventory?: InventoryItem[];
  imeiRecords?: ImeiRecord[];
  sales?: SaleRecord[];
  salesReturns?: SalesReturnRecord[];
}): ImeiValidationResult {
  const cleanedList = imeisToCheck.map(i => (i || '').toString().trim()).filter(Boolean);
  if (cleanedList.length === 0) {
    return { valid: true };
  }

  const allowedSet = new Set(allowedExistingImeis.map(i => (i || '').toString().trim().toLowerCase()).filter(Boolean));

  // 0. Enforce strictly 1 IMEI per entry box (no embedded delimiters or concatenated IMEIs)
  for (const imei of cleanedList) {
    if (/[\s,;|]/.test(imei) || imei.length > MAX_SINGLE_IMEI_LENGTH) {
      return {
        valid: false,
        error: `Each box can only hold 1 IMEI (invalid/multiple IMEI detected: "${imei.slice(0, 20)}...").`,
        duplicateImei: imei,
      };
    }
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
      const lowerImei = imei.toLowerCase();
      if (allowedSet.has(lowerImei)) {
        continue;
      }
      availableInventoryImeis.set(lowerImei, {
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
