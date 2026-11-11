import './polyfills';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';

export interface TotpSetupResult {
  secret: string;     // Base32 secret string (e.g., "JBSWY3DPEHPK3PXP")
  uri: string;        // otpauth://totp/...
  qrDataUrl: string;  // data:image/png;base64,...
}

/**
 * Generate a new TOTP secret and QR code Data URL for an account email.
 * If an existing secret is passed, it re-uses it; otherwise generates a new 20-byte random secret.
 */
export async function generateTotpSetup(email: string, existingSecret?: string): Promise<TotpSetupResult> {
  const cleanEmail = (email || 'admin@fmzpos.com').trim();
  const secret = existingSecret 
    ? OTPAuth.Secret.fromBase32(existingSecret.trim())
    : new OTPAuth.Secret({ size: 20 });
    
  const totp = new OTPAuth.TOTP({
    issuer: 'FMZ Mobile POS',
    label: cleanEmail,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: secret,
  });

  const secretBase32 = secret.base32;
  const uri = totp.toString();
  
  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(uri, {
      width: 256,
      margin: 2,
      color: {
        dark: '#1e1b4b',
        light: '#ffffff',
      },
    });
  } catch (err) {
    console.warn('QR Code generation failed:', err);
  }

  return {
    secret: secretBase32,
    uri,
    qrDataUrl,
  };
}

/**
 * Validates a 6-digit TOTP code against a secret string.
 * Allows a window of 1 (30s clock drift tolerance).
 */
export function verifyTotpCode(secretBase32: string, token: string, alternateSecrets?: string[]): boolean {
  if (!token) return false;
  const cleanCode = token.trim().replace(/\s+/g, '');
  if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) return false;

  const secrets = [secretBase32, ...(alternateSecrets || [])].filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
  if (secrets.length === 0) return false;

  for (const s of secrets) {
    try {
      const secret = OTPAuth.Secret.fromBase32(s.trim());
      const totp = new OTPAuth.TOTP({
        issuer: 'FMZ Mobile POS',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: secret,
      });

      const delta = totp.validate({ token: cleanCode, window: 1 });
      if (delta !== null) return true;
    } catch {
      // try next secret in pool
    }
  }

  return false;
}
