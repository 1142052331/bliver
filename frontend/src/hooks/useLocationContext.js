import { useCallback, useMemo, useState } from 'react';
import { apiClient } from '../api';
import {
  loadFixedScope,
  loadReminderAt,
  saveFixedScope,
  saveReminderAt,
} from '../domain/locationStorage';

const REMINDER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export default function useLocationContext() {
  const [fixedScope, setFixedScopeState] = useState(loadFixedScope);
  const [resolvedLocation, setResolvedLocation] = useState(null);
  const [permissionState, setPermissionState] = useState('idle');

  const shouldRemind = useCallback(({ explicit = false, now = Date.now() } = {}) => (
    explicit || now - loadReminderAt() >= REMINDER_COOLDOWN_MS
  ), []);

  const requestLocation = useCallback(async ({ explicit = false, now = Date.now() } = {}) => {
    if (!shouldRemind({ explicit, now })) return { status: 'cooldown' };
    saveReminderAt(now);
    setPermissionState('locating');

    if (!navigator.geolocation) {
      setResolvedLocation(null);
      setPermissionState('unavailable');
      return { status: 'unavailable' };
    }

    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 8000,
          maximumAge: 60_000,
        });
      });
      const { latitude: lat, longitude: lng } = position.coords;
      const response = await apiClient.map.resolveLocation({ lat, lng });
      const location = response?.data?.location || null;
      setResolvedLocation(location);
      setPermissionState('granted');
      return { status: 'granted', location, coords: { lat, lng } };
    } catch (error) {
      setResolvedLocation(null);
      const denied = error?.code === 1;
      setPermissionState(denied ? 'denied' : 'error');
      return { status: denied ? 'denied' : 'error' };
    }
  }, [shouldRemind]);

  const setFixedScope = useCallback((value) => {
    saveFixedScope(value);
    setFixedScopeState(loadFixedScope());
  }, []);

  const clearFixedScope = useCallback(() => {
    saveFixedScope(null);
    setFixedScopeState(null);
  }, []);

  const scopeContext = useMemo(() => {
    if (fixedScope) return { ...fixedScope, reason: 'fixed' };
    if (permissionState === 'granted' && resolvedLocation) {
      return { scope: 'smart', ...resolvedLocation, reason: 'resolved-location' };
    }
    if (permissionState === 'denied') return { scope: 'global', reason: 'permission-denied' };
    if (permissionState === 'unavailable') return { scope: 'global', reason: 'location-unavailable' };
    if (permissionState === 'error') return { scope: 'global', reason: 'location-error' };
    return { scope: 'smart', reason: 'unresolved' };
  }, [fixedScope, permissionState, resolvedLocation]);

  return {
    permissionState,
    scopeContext,
    requestLocation,
    setFixedScope,
    clearFixedScope,
    shouldRemind,
  };
}
