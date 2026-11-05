/**
 * Web Bluetooth Thermal Printer Integration (ESC/POS)
 * Supports 80mm and 58mm thermal printers without browser print dialog.
 */

import { SaleRecord, ShopSettings } from '../types';

// Standard Bluetooth Low Energy (BLE) Printing Service & Characteristic UUIDs
const BLE_PRINTER_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard Bluetooth Printing Service
  '0000ffe0-0000-1000-8000-00805f9b34fb', // Common POS / HM-10 BLE Service
  '0000fff0-0000-1000-8000-00805f9b34fb', // Chinese Thermal POS BLE Service
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Transparent UART
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Generic BLE POS
];

export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

export interface BluetoothPrintResult {
  success: boolean;
  message: string;
}

/**
 * ESC/POS Command Builder for Thermal Receipts
 */
class EscPosBuilder {
  private buffer: number[] = [];
  private charWidth: number;

  constructor(format: 'thermal-80' | 'thermal-58' = 'thermal-80') {
    // 80mm printers have ~48 chars per line; 58mm printers have ~32 chars per line
    this.charWidth = format === 'thermal-58' ? 32 : 48;
    this.init();
  }

  // Initialize printer
  init(): this {
    this.buffer.push(0x1b, 0x40); // ESC @
    return this;
  }

  // Alignment: 0 = Left, 1 = Center, 2 = Right
  align(alignMode: 0 | 1 | 2): this {
    this.buffer.push(0x1b, 0x61, alignMode);
    return this;
  }

  // Bold text toggle
  bold(enable: boolean): this {
    this.buffer.push(0x1b, 0x45, enable ? 1 : 0);
    return this;
  }

  // Text size: normal, double-height, double-width, double-both
  textSize(widthMultiplier: 1 | 2 = 1, heightMultiplier: 1 | 2 = 1): this {
    const n = ((widthMultiplier - 1) << 4) | (heightMultiplier - 1);
    this.buffer.push(0x1d, 0x21, n); // GS ! n
    return this;
  }

  // Add raw string text
  text(str: string): this {
    // Convert string to bytes (ASCII/Code Page 437)
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      this.buffer.push(code < 128 ? code : 0x3f); // replace non-ascii with ?
    }
    return this;
  }

  // Add line break
  line(str: string = ''): this {
    if (str) {
      this.text(str);
    }
    this.buffer.push(0x0a); // LF
    return this;
  }

  // Draw separator line across full receipt width
  separator(char: string = '-'): this {
    const lineStr = char.repeat(this.charWidth);
    return this.line(lineStr);
  }

  // 2-column key-value row (e.g. Left: "Subtotal", Right: "Rs. 1,500")
  row(left: string, right: string, padChar: string = ' '): this {
    const availableSpace = this.charWidth - right.length;
    if (availableSpace <= 0) {
      return this.line(`${left} ${right}`);
    }
    const truncatedLeft = left.length > availableSpace ? left.substring(0, availableSpace) : left;
    const padding = padChar.repeat(Math.max(1, this.charWidth - truncatedLeft.length - right.length));
    return this.line(truncatedLeft + padding + right);
  }

  // Feed n lines
  feed(lines: number = 3): this {
    this.buffer.push(0x1b, 0x64, lines);
    return this;
  }

  // Paper cut command
  cut(): this {
    this.buffer.push(0x1d, 0x56, 0x41, 0x00); // GS V 65 0 (Full Cut)
    return this;
  }

  getBytes(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

/**
 * Builds ESC/POS binary buffer for a sales invoice
 */
export function generateEscPosInvoiceData(
  sale: SaleRecord,
  settings: ShopSettings,
  format: 'thermal-80' | 'thermal-58' = 'thermal-80'
): Uint8Array {
  const b = new EscPosBuilder(format);
  const cur = settings.currency || 'Rs.';

  const grandTotal = sale.grandTotal || 0;
  const amountPaid = sale.amountPaid !== undefined ? sale.amountPaid : grandTotal;
  const amountDue = sale.amountDue !== undefined ? sale.amountDue : Math.max(0, grandTotal - amountPaid);
  const isPaid = amountDue <= 0;

  // Header: Center aligned, bold, double height title
  b.align(1)
    .bold(true)
    .textSize(1, 2)
    .line(settings.shopName.toUpperCase())
    .textSize(1, 1)
    .bold(false);

  if (settings.tagline) {
    b.line(settings.tagline);
  }
  if (settings.address) {
    b.line(settings.address);
  }
  if (settings.phone) {
    b.line(`Tel: ${settings.phone}`);
  }

  b.separator('=');

  // Metadata: Left aligned
  b.align(0);
  b.row(`INV #${sale.invNo}`, new Date(sale.date).toLocaleDateString());
  b.line(`Time: ${new Date(sale.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
  b.line(`Customer: ${sale.custName || 'Walk-in Customer'}`);
  if (sale.custPhone) {
    b.line(`Phone: ${sale.custPhone}`);
  }
  b.bold(true).line(`Status: [${isPaid ? 'PAID' : amountPaid > 0 ? 'PARTIAL' : 'CREDIT KHATA'}]`).bold(false);

  b.separator('-');

  // Items Header
  b.bold(true);
  b.row('Item / Qty', 'Total');
  b.bold(false);
  b.separator('-');

  // Items List
  for (const item of sale.items) {
    const itemTotal = `${cur} ${(item.salePrice * item.qty).toLocaleString()}`;
    b.bold(true).line(item.name).bold(false);
    b.row(`  x${item.qty} @ ${cur} ${item.salePrice.toLocaleString()}`, itemTotal);

    if (item.imei) {
      b.line(`  IMEI: ${item.imei}`);
    }
  }

  b.separator('-');

  // Totals
  b.row('Subtotal:', `${cur} ${sale.subtotal.toLocaleString()}`);
  if (sale.discount > 0) {
    b.row('Discount:', `-${cur} ${sale.discount.toLocaleString()}`);
  }

  // Grand Total Bold & Larger
  b.bold(true)
    .textSize(1, 1)
    .row('GRAND TOTAL:', `${cur} ${grandTotal.toLocaleString()}`)
    .textSize(1, 1)
    .bold(false);

  b.row(`Paid (${sale.paymentMethod || 'Cash'}):`, `${cur} ${amountPaid.toLocaleString()}`);
  if (amountDue > 0) {
    b.bold(true).row('Balance Due:', `${cur} ${amountDue.toLocaleString()}`).bold(false);
  }

  b.separator('=');

  // Footer / Return Policy
  b.align(1);
  const footerText = settings.returnPolicy || settings.receiptFooter || 'Thank you for your visit!';
  b.line(footerText);
  b.line('Warranty claims require original receipt.');

  b.feed(4);
  b.cut();

  return b.getBytes();
}

/**
 * Connects to a Bluetooth Thermal Printer via Web Bluetooth and streams the ESC/POS receipt.
 */
export async function printInvoiceViaBluetooth(
  sale: SaleRecord,
  settings: ShopSettings,
  format: 'thermal-80' | 'thermal-58' = 'thermal-80'
): Promise<BluetoothPrintResult> {
  if (!isWebBluetoothSupported()) {
    return {
      success: false,
      message: 'Web Bluetooth is not supported in this browser. Please use Chrome or Edge on Android or PC.',
    };
  }

  try {
    // 1. Request Bluetooth Device pairing dialog
    const nav = navigator as any;
    const device = await nav.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: BLE_PRINTER_SERVICE_UUIDS,
    });

    if (!device || !device.gatt) {
      return { success: false, message: 'No Bluetooth device selected.' };
    }

    // 2. Connect to GATT Server
    const server = await device.gatt.connect();

    // 3. Search known printer services
    let targetChar: any = null;

    for (const serviceUuid of BLE_PRINTER_SERVICE_UUIDS) {
      try {
        const service = await server.getPrimaryService(serviceUuid);
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            targetChar = char;
            break;
          }
        }
        if (targetChar) break;
      } catch {
        // Continue searching other service UUIDs
      }
    }

    if (!targetChar) {
      // Fallback: try querying all primary services on device
      try {
        const services = await server.getPrimaryServices();
        for (const s of services) {
          const chars = await s.getCharacteristics();
          for (const c of chars) {
            if (c.properties.write || c.properties.writeWithoutResponse) {
              targetChar = c;
              break;
            }
          }
          if (targetChar) break;
        }
      } catch (err) {
        console.warn('Could not list all services:', err);
      }
    }

    if (!targetChar) {
      return {
        success: false,
        message: 'Connected to Bluetooth device, but no writable printer characteristic was found.',
      };
    }

    // 4. Generate ESC/POS byte array
    const data = generateEscPosInvoiceData(sale, settings, format);

    // 5. Send data in safe MTU chunk sizes (50 bytes per packet)
    const CHUNK_SIZE = 50;
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.slice(i, i + CHUNK_SIZE);
      if (targetChar.writeValueWithoutResponse) {
        await targetChar.writeValueWithoutResponse(chunk);
      } else {
        await targetChar.writeValue(chunk);
      }
      // Small 15ms throttle to prevent buffer overrun on budget thermal printers
      await new Promise(res => setTimeout(res, 15));
    }

    // Disconnect cleanly after slight pause
    setTimeout(() => {
      try {
        if (device.gatt?.connected) {
          device.gatt.disconnect();
        }
      } catch {}
    }, 1000);

    return {
      success: true,
      message: `Invoice #${sale.invNo} successfully sent to Bluetooth thermal printer!`,
    };
  } catch (err: any) {
    if (err?.name === 'NotFoundError' || err?.message?.includes('cancelled')) {
      return {
        success: false,
        message: 'Bluetooth device selection cancelled.',
      };
    }
    console.error('Bluetooth printing error:', err);
    return {
      success: false,
      message: `Bluetooth printing failed: ${err?.message || 'Connection error'}`,
    };
  }
}
