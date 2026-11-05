/**
 * Standard Cryptographic ID Generator using native crypto.randomUUID()
 * Replaces insecure Math.random() string concatenations.
 */

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Safe fallback if crypto.randomUUID is unavailable in older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generates an entity ID with a readable prefix and a standard UUID suffix.
 * Example: generateEntityId('STK') => 'STK-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'
 */
export function generateEntityId(prefix: string): string {
  return `${prefix}-${generateUUID()}`;
}

/**
 * Generates a clean human-readable numeric or short invoice/bill number.
 */
export function generateInvoiceNumber(prefix: string = 'INV'): string {
  const timeHex = Date.now().toString(36).toUpperCase();
  const randomPart = Math.floor(1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000));
  return `${prefix}-${timeHex}-${randomPart}`;
}
