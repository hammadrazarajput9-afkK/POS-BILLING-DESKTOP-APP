import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  APIProvider,
  Map as GoogleMap,
  AdvancedMarker,
  Pin,
  InfoWindow,
  useMapsLibrary,
  useMap,
  useApiLoadingStatus,
  APILoadingStatus,
  useAdvancedMarkerRef,
  MapMouseEvent,
} from '@vis.gl/react-google-maps';
import {
  MapPin,
  Navigation,
  Search,
  Crosshair,
  ExternalLink,
  Loader2,
  Trash2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  getGoogleMapsApiKey,
  buildGoogleMapsTrackUrl,
  buildGoogleMapsViewUrl,
  isMapsQuotaError,
} from '../utils/mapsConfig';

export interface CustomerLocationValue {
  address: string;
  lat?: number;
  lng?: number;
  placeId?: string;
  mapUrl?: string;
}

interface CustomerLocationPickerProps {
  value: CustomerLocationValue;
  onChange: (next: CustomerLocationValue) => void;
  customerName?: string;
  readOnly?: boolean;
  heightClass?: string;
  showAddressInput?: boolean;
  showTrackActions?: boolean;
}

const MapViewportSync: React.FC<{ lat?: number; lng?: number }> = ({ lat, lng }) => {
  const map = useMap();
  const prevRef = useRef<string>('');

  useEffect(() => {
    if (!map || typeof lat !== 'number' || typeof lng !== 'number') return;
    const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    if (prevRef.current !== key) {
      prevRef.current = key;
      map.panTo({ lat, lng });
      const currentZoom = map.getZoom() ?? 3;
      if (currentZoom < 15) {
        map.setZoom(16);
      }
    }
  }, [map, lat, lng]);

  return null;
};

interface PlacesSearchBarProps {
  queryText: string;
  onSelectPlace: (loc: CustomerLocationValue) => void;
}

const PlacesSearchBar: React.FC<PlacesSearchBarProps> = ({ queryText, onSelectPlace }) => {
  const placesLib = useMapsLibrary('places');
  const [searchInput, setSearchInput] = useState('');
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const trimmed = searchInput.trim();
    if (!placesLib || trimmed.length < 2) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new AutocompleteSessionToken();
        }
        setIsSearching(true);
        const res = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: trimmed,
          sessionToken: sessionTokenRef.current,
        });
        setSuggestions(res.suggestions || []);
        setShowDropdown(true);
      } catch (err) {
        if (isMapsQuotaError(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        setSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    }, 280);

    return () => window.clearTimeout(timer);
  }, [placesLib, searchInput]);

  const handlePickSuggestion = useCallback(
    async (suggestion: google.maps.places.AutocompleteSuggestion) => {
      if (!placesLib || !suggestion.placePrediction) return;
      try {
        const place = suggestion.placePrediction.toPlace();
        await place.fetchFields({
          fields: ['displayName', 'formattedAddress', 'location', 'id'],
        });

        const loc = place.location;
        const lat = loc ? loc.lat() : undefined;
        const lng = loc ? loc.lng() : undefined;
        const placeId = place.id || undefined;
        const formatted =
          place.formattedAddress ||
          place.displayName ||
          suggestion.placePrediction.text.text ||
          queryText;
        const mapUrl = buildGoogleMapsViewUrl({ lat, lng, placeId, address: formatted }) || undefined;

        onSelectPlace({
          address: formatted,
          lat,
          lng,
          placeId,
          mapUrl,
        });

        setSearchInput(formatted);
        setShowDropdown(false);
        setSuggestions([]);
        sessionTokenRef.current = null;
      } catch (err) {
        if (isMapsQuotaError(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
      }
    },
    [placesLib, onSelectPlace, queryText]
  );

  return (
    <div ref={containerRef} className="relative flex-1 min-w-0">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={searchInput}
          onFocus={() => {
            if (suggestions.length > 0) setShowDropdown(true);
          }}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="Apne area ya street ka naam likhein (e.g. Anarkali Lahore)..."
          className="w-full pl-9 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-purple-600 shadow-2xs transition"
        />
        {isSearching && (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600 absolute right-3 top-1/2 -translate-y-1/2" />
        )}
      </div>

      {showDropdown && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-30 max-h-52 overflow-y-auto divide-y divide-slate-100">
          {suggestions.map((suggestion, idx) => {
            const label = suggestion.placePrediction?.text?.text || '';
            return (
              <li key={idx}>
                <button
                  type="button"
                  onClick={() => void handlePickSuggestion(suggestion)}
                  className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-purple-50 hover:text-purple-900 flex items-start gap-2 transition cursor-pointer"
                >
                  <MapPin className="w-3.5 h-3.5 text-purple-600 shrink-0 mt-0.5" />
                  <span className="line-clamp-2">{label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

interface InteractiveMapCanvasProps {
  value: CustomerLocationValue;
  onChange: (next: CustomerLocationValue) => void;
  customerName?: string;
  readOnly?: boolean;
  heightClass: string;
}

const InteractiveMapCanvas: React.FC<InteractiveMapCanvasProps> = ({
  value,
  onChange,
  customerName,
  readOnly = false,
  heightClass,
}) => {
  const status = useApiLoadingStatus();
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [infoOpen, setInfoOpen] = useState(false);

  const hasCoords =
    typeof value.lat === 'number' &&
    typeof value.lng === 'number' &&
    Number.isFinite(value.lat) &&
    Number.isFinite(value.lng);

  // Default center: Lahore / Pakistan local surroundings if customer location not yet pinned
  const defaultCenter = hasCoords
    ? { lat: value.lat!, lng: value.lng! }
    : { lat: 31.5204, lng: 74.3587 };

  const handleMapClick = useCallback(
    (ev: MapMouseEvent) => {
      if (readOnly) return;
      const ll = ev.detail?.latLng;
      if (!ll) return;
      const lat = Number(ll.lat.toFixed(6));
      const lng = Number(ll.lng.toFixed(6));
      const mapUrl = buildGoogleMapsViewUrl({ lat, lng, address: value.address }) || undefined;
      onChange({
        ...value,
        lat,
        lng,
        placeId: undefined,
        mapUrl,
      });
    },
    [readOnly, value, onChange]
  );

  const handleMarkerDragEnd = useCallback(
    (ev: google.maps.MapMouseEvent) => {
      if (readOnly || !ev.latLng) return;
      const rawLat = typeof ev.latLng.lat === 'function' ? ev.latLng.lat() : (ev.latLng as unknown as { lat: number }).lat;
      const rawLng = typeof ev.latLng.lng === 'function' ? ev.latLng.lng() : (ev.latLng as unknown as { lng: number }).lng;
      const lat = Number(rawLat.toFixed(6));
      const lng = Number(rawLng.toFixed(6));
      const mapUrl = buildGoogleMapsViewUrl({ lat, lng, address: value.address }) || undefined;
      onChange({
        ...value,
        lat,
        lng,
        placeId: undefined,
        mapUrl,
      });
    },
    [readOnly, value, onChange]
  );

  if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
    return (
      <div className={`w-full ${heightClass} rounded-xl border border-amber-200 bg-amber-50/70 flex flex-col items-center justify-center p-4 text-center gap-2`}>
        <AlertCircle className="w-6 h-6 text-amber-600" />
        <p className="text-xs font-bold text-amber-900">Google Maps Interactive View Unavailable</p>
        <p className="text-[11px] text-amber-800 max-w-sm">
          Aap customer ka address manual enter kar sakte hain aur Google Maps tracking links direct open kar sakte hain.
        </p>
      </div>
    );
  }

  const trackUrl = buildGoogleMapsTrackUrl({
    lat: value.lat,
    lng: value.lng,
    placeId: value.placeId,
    address: value.address,
  });

  return (
    <div className={`w-full ${heightClass} rounded-xl overflow-hidden border border-slate-200 relative bg-slate-100`}>
      <GoogleMap
        mapId="DEMO_MAP_ID"
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        defaultCenter={defaultCenter}
        defaultZoom={hasCoords ? 16 : 14}
        gestureHandling="greedy"
        streetViewControl={false}
        mapTypeControl={false}
        onClick={handleMapClick}
        style={{ width: '100%', height: '100%' }}
      >
        <MapViewportSync lat={value.lat} lng={value.lng} />
        {hasCoords && (
          <>
            <AdvancedMarker
              ref={markerRef}
              position={{ lat: value.lat!, lng: value.lng! }}
              draggable={!readOnly}
              onDragEnd={handleMarkerDragEnd}
              onClick={() => setInfoOpen(prev => !prev)}
              title={customerName || value.address || 'Customer Location'}
            >
              <Pin background="#7c3aed" borderColor="#4c1d95" glyphColor="#ffffff" />
            </AdvancedMarker>
            {infoOpen && marker && (
              <InfoWindow anchor={marker} onCloseClick={() => setInfoOpen(false)} maxWidth={240}>
                <div className="p-1 text-xs space-y-1">
                  <p className="font-bold text-slate-900">{customerName || 'Customer Location'}</p>
                  {value.address && <p className="text-[11px] text-slate-600">{value.address}</p>}
                  <p className="text-[10px] text-slate-400 tabular-nums">
                    {value.lat?.toFixed(5)}, {value.lng?.toFixed(5)}
                  </p>
                  {trackUrl && (
                    <a
                      href={trackUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-700 hover:underline pt-0.5"
                    >
                      <Navigation className="w-3 h-3" /> Google Maps par Track Karein
                    </a>
                  )}
                </div>
              </InfoWindow>
            )}
          </>
        )}
      </GoogleMap>

      {!readOnly && (
        <div className="absolute bottom-2 left-2 right-2 bg-white/90 backdrop-blur-xs border border-slate-200/90 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-xs pointer-events-none text-center">
          {hasCoords ? 'Pin set ho gaya! Aap pin ko drag bhi kar sakte hain.' : 'Map par kisi bhi jagah click karke customer ki location pin karein.'}
        </div>
      )}
    </div>
  );
};

export const CustomerLocationPicker: React.FC<CustomerLocationPickerProps> = ({
  value,
  onChange,
  customerName,
  readOnly = false,
  heightClass = 'h-60 sm:h-72',
  showAddressInput = true,
  showTrackActions = true,
}) => {
  const apiKey = getGoogleMapsApiKey();
  const [locatingGps, setLocatingGps] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const hasCoords =
    typeof value.lat === 'number' &&
    typeof value.lng === 'number' &&
    Number.isFinite(value.lat) &&
    Number.isFinite(value.lng);

  const viewUrl = buildGoogleMapsViewUrl({
    lat: value.lat,
    lng: value.lng,
    placeId: value.placeId,
    address: value.address,
  });

  const trackUrl = buildGoogleMapsTrackUrl({
    lat: value.lat,
    lng: value.lng,
    placeId: value.placeId,
    address: value.address,
  });

  const handleDetectGps = () => {
    if (!navigator.geolocation) {
      setGpsError('Browser GPS geolocation is not supported.');
      return;
    }
    setGpsError(null);
    setLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const mapUrl = buildGoogleMapsViewUrl({ lat, lng, address: value.address }) || undefined;
        onChange({
          ...value,
          lat,
          lng,
          placeId: undefined,
          mapUrl,
        });
        setLocatingGps(false);
      },
      err => {
        setGpsError(err.message || 'Unable to get live GPS coordinates.');
        setLocatingGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleClearPin = () => {
    onChange({
      ...value,
      lat: undefined,
      lng: undefined,
      placeId: undefined,
      mapUrl: value.address.trim() ? buildGoogleMapsViewUrl({ address: value.address }) || undefined : undefined,
    });
  };

  return (
    <div className="space-y-3">
      {showAddressInput && (
        <div>
          <label className="block font-semibold text-slate-700 text-xs mb-1 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-purple-600" />
              Customer House / Shop Address
            </span>
            {hasCoords && (
              <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-1 tabular-nums bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <CheckCircle2 className="w-3 h-3" />
                Pin Pinned
              </span>
            )}
          </label>
          <input
            type="text"
            readOnly={readOnly}
            value={value.address}
            onChange={e => onChange({ ...value, address: e.target.value })}
            placeholder="e.g. Shop #12, Main Market Lahore..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-medium text-slate-800 focus:outline-none focus:border-purple-600 focus:bg-white transition"
          />
        </div>
      )}

      {apiKey ? (
        <APIProvider apiKey={apiKey} libraries={['places', 'marker']}>
          {!readOnly && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <PlacesSearchBar queryText={value.address} onSelectPlace={onChange} />
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleDetectGps}
                  disabled={locatingGps}
                  className="px-3.5 py-2.5 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs rounded-xl border border-purple-200 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-60 shadow-2xs"
                  title="Apni live GPS location ke mutabiq map center karein"
                >
                  {locatingGps ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
                  ) : (
                    <Crosshair className="w-3.5 h-3.5 text-purple-600" />
                  )}
                  <span>Meri Live Location</span>
                </button>
                {hasCoords && (
                  <button
                    type="button"
                    onClick={handleClearPin}
                    className="p-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl border border-rose-200 transition cursor-pointer"
                    title="Remove Pin"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}

          {gpsError && (
            <p className="text-[11px] text-rose-600 font-medium">{gpsError}</p>
          )}

          <InteractiveMapCanvas
            value={value}
            onChange={onChange}
            customerName={customerName}
            readOnly={readOnly}
            heightClass={heightClass}
          />
        </APIProvider>
      ) : (
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-purple-600" />
              GPS Coordinates
            </span>
            {!readOnly && (
              <button
                type="button"
                onClick={handleDetectGps}
                disabled={locatingGps}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-bold text-[11px] rounded-lg border border-slate-200 transition flex items-center gap-1 cursor-pointer"
              >
                <Crosshair className="w-3 h-3 text-purple-600" />
                {locatingGps ? 'Locating...' : 'Get GPS'}
              </button>
            )}
          </div>
        </div>
      )}

      {showTrackActions && (viewUrl || trackUrl) && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <span className="text-[11px] text-slate-500 tabular-nums">
            {hasCoords
              ? `GPS: ${value.lat?.toFixed(4)}, ${value.lng?.toFixed(4)}`
              : 'Google Maps Ready'}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {viewUrl && (
              <a
                href={viewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold text-xs transition shadow-2xs"
              >
                <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                Google Maps par Dekhein
              </a>
            )}
            {trackUrl && (
              <a
                href={trackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition shadow-xs"
              >
                <Navigation className="w-3.5 h-3.5" />
                Track Customer Location
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
