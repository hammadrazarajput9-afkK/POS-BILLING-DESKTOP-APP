declare const __GMP_API_KEY__: string | undefined;

/**
 * Safely reads the Google Maps Platform API key configured for the app.
 * Never hardcodes credentials directly in source files.
 */
export function getGoogleMapsApiKey(): string {
  const viteKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (typeof viteKey === 'string' && viteKey.trim()) {
    return viteKey.trim();
  }
  if (typeof __GMP_API_KEY__ === 'string' && __GMP_API_KEY__.trim()) {
    return __GMP_API_KEY__.trim();
  }
  return '';
}

/**
 * Builds an official Google Maps Search URL to inspect a customer's pinned location or address.
 */
export function buildGoogleMapsViewUrl(params: {
  lat?: number;
  lng?: number;
  placeId?: string;
  address?: string;
}): string | null {
  const { lat, lng, placeId, address } = params;
  if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
    const base = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
    return placeId ? `${base}&query_place_id=${encodeURIComponent(placeId)}` : base;
  }
  if (address && address.trim()) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
  }
  return null;
}

/**
 * Builds an official Google Maps Directions URL to track/navigate directly to a customer's house/shop.
 */
export function buildGoogleMapsTrackUrl(params: {
  lat?: number;
  lng?: number;
  placeId?: string;
  address?: string;
}): string | null {
  const { lat, lng, placeId, address } = params;
  if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
    const base = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`;
    return placeId ? `${base}&destination_place_id=${encodeURIComponent(placeId)}` : base;
  }
  if (address && address.trim()) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address.trim())}`;
  }
  return null;
}

/**
 * Checks whether an error object or string indicates Google Maps Platform quota exhaustion (Case A).
 */
export function isMapsQuotaError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : String(error);
  const status = (error as { status?: unknown; code?: unknown })?.status;
  const code = (error as { code?: unknown })?.code;
  return (
    status === 429 ||
    code === 429 ||
    msg.includes('OVER_QUERY_LIMIT') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('OverQuotaMapError') ||
    msg.includes('QuotaExceededError')
  );
}
