import { useCallback, useMemo, useState } from 'react';
import { apiClient } from '../api';
import { getUser } from '../auth';
import {
  loadFixedScope,
  saveFixedScope,
} from '../domain/locationStorage';
import {
  loadLocationReminderState,
  markLocationReminder,
  shouldShowLocationReminder,
} from '../domain/locationReminder';

export default function useLocationContext({ viewerKey } = {}) {
  const currentViewerKey = viewerKey || getUser()?._id || 'guest';
  const [fixedScope, setFixedScopeState] = useState(loadFixedScope);
  const [resolvedLocations, setResolvedLocations] = useState({});
  const restorePermissionState = useCallback((key) => {
    const restored = loadLocationReminderState(key).permissionState;
    return ['denied', 'unavailable', 'error'].includes(restored) ? restored : 'idle';
  }, []);
  const [permissionStates, setPermissionStates] = useState(() => ({
    [currentViewerKey]: restorePermissionState(currentViewerKey),
  }));
  const permissionState = permissionStates[currentViewerKey]
    ?? restorePermissionState(currentViewerKey);
  const resolvedLocation = resolvedLocations[currentViewerKey] || null;
  const setPermissionState = useCallback((nextState) => {
    setPermissionStates((current) => ({ ...current, [currentViewerKey]: nextState }));
  }, [currentViewerKey]);

  const shouldRemind = useCallback(({ explicit = false, now = Date.now() } = {}) => (
    shouldShowLocationReminder(currentViewerKey, { explicit, now })
  ), [currentViewerKey]);

  const requestLocation = useCallback(async ({ explicit = false, now = Date.now() } = {}) => {
    if (!shouldRemind({ explicit, now })) return { status: 'cooldown' };
    markLocationReminder(currentViewerKey, now, localStorage, 'locating');
    setPermissionState('locating');

    if (!navigator.geolocation) {
      setResolvedLocations((current) => {
        if (!(currentViewerKey in current)) return current;
        const next = { ...current };
        delete next[currentViewerKey];
        return next;
      });
      setPermissionState('unavailable');
      markLocationReminder(currentViewerKey, now, localStorage, 'unavailable');
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
      setResolvedLocations((current) => ({ ...current, [currentViewerKey]: location }));
      setPermissionState('granted');
      markLocationReminder(currentViewerKey, now, localStorage, 'granted');
      return { status: 'granted', location, coords: { lat, lng } };
    } catch (error) {
      setResolvedLocations((current) => {
        if (!(currentViewerKey in current)) return current;
        const next = { ...current };
        delete next[currentViewerKey];
        return next;
      });
      const denied = error?.code === 1;
      const nextState = denied ? 'denied' : 'error';
      setPermissionState(nextState);
      markLocationReminder(currentViewerKey, now, localStorage, nextState);
      return { status: denied ? 'denied' : 'error' };
    }
  }, [currentViewerKey, setPermissionState, shouldRemind]);

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
    viewerKey: currentViewerKey,
    scopeContext,
    requestLocation,
    setFixedScope,
    clearFixedScope,
    shouldRemind,
  };
}
