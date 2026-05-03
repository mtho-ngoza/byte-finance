import { useEffect, useState, useCallback } from 'react';
import type { KnownVendor } from '@/types';

interface LocationState {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

// Initial seed of known vendors (can grow from user's receipts)
const KNOWN_VENDORS: KnownVendor[] = [
  { name: 'Engen', keywords: ['engen'] },
  { name: 'Shell', keywords: ['shell'] },
  { name: 'Caltex', keywords: ['caltex'] },
  { name: 'BP', keywords: ['bp'] },
  { name: 'Sasol', keywords: ['sasol'] },
  { name: 'Total', keywords: ['total'] },
  { name: 'Makro', keywords: ['makro'] },
  { name: 'Pick n Pay', keywords: ['pnp', 'pick n pay', 'picknpay'] },
  { name: 'Checkers', keywords: ['checkers'] },
  { name: 'Woolworths', keywords: ['woolworths', 'woolies'] },
  { name: 'Spar', keywords: ['spar'] },
  { name: 'Shoprite', keywords: ['shoprite'] },
  { name: 'Clicks', keywords: ['clicks'] },
  { name: 'Dis-Chem', keywords: ['dischem', 'dis-chem'] },
  { name: 'Builders', keywords: ['builders', 'builders warehouse'] },
  { name: 'Game', keywords: ['game'] },
  { name: 'Takealot', keywords: ['takealot'] },
];

/**
 * Hook for GPS location watching
 * Starts watching on mount, provides last known location
 */
export function useGeolocation() {
  const [location, setLocation] = useState<LocationState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setError('Geolocation not supported');
      return;
    }

    setWatching(true);

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: Date.now(),
        });
        setError(null);
      },
      (err) => {
        setError(err.message);
        setWatching(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 30000,       // Cache for 30 seconds
        timeout: 10000,          // 10 second timeout
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      setWatching(false);
    };
  }, []);

  /**
   * Find vendor match based on current location
   * For MVP, just returns null (no location-based matching yet)
   * In future: match against vendor GPS coordinates
   */
  const findVendorMatch = useCallback((): string | null => {
    // TODO: Implement GPS-based vendor matching
    // Would compare location against KNOWN_VENDORS[].locations
    return null;
  }, []);

  /**
   * Get recent/suggested vendors
   */
  const getSuggestedVendors = useCallback((recentVendors: string[] = []): string[] => {
    // Combine recent vendors with common ones
    const suggestions = new Set<string>();

    // Add recent vendors first
    recentVendors.slice(0, 5).forEach((v) => suggestions.add(v));

    // Add common vendors
    KNOWN_VENDORS.slice(0, 10).forEach((v) => suggestions.add(v.name));

    return Array.from(suggestions).slice(0, 8);
  }, []);

  return {
    location,
    error,
    watching,
    findVendorMatch,
    getSuggestedVendors,
    knownVendors: KNOWN_VENDORS,
  };
}
