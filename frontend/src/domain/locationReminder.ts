export const LOCATION_REMINDER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const STORAGE_PREFIX = 'bliver_location_reminder_at_v2:';
const PERMISSION_STATES = new Set(['idle', 'locating', 'granted', 'denied', 'unavailable', 'error']);

export type LocationPermissionState = 'idle' | 'locating' | 'granted' | 'denied' | 'unavailable' | 'error';

function storageKey(viewerKey: string = 'guest') {
  const normalized = String(viewerKey || 'guest').trim() || 'guest';
  return `${STORAGE_PREFIX}${encodeURIComponent(normalized)}`;
}

export function loadLocationReminderState(viewerKey = 'guest', storage: Storage = localStorage) {
  const raw = storage.getItem(storageKey(viewerKey));
  if (!raw) return { permissionState: 'idle' as LocationPermissionState, remindedAt: 0 };
  try {
    const parsed = JSON.parse(raw);
    const remindedAt = Number(parsed?.remindedAt);
    const permissionState = PERMISSION_STATES.has(parsed?.permissionState)
      ? parsed.permissionState as LocationPermissionState
      : 'idle';
    return {
      permissionState,
      remindedAt: Number.isFinite(remindedAt) && remindedAt > 0 ? remindedAt : 0,
    };
  } catch {
    const legacyTimestamp = Number(raw);
    return {
      permissionState: 'idle' as LocationPermissionState,
      remindedAt: Number.isFinite(legacyTimestamp) && legacyTimestamp > 0 ? legacyTimestamp : 0,
    };
  }
}

export function loadLocationReminderAt(viewerKey = 'guest', storage: Storage = localStorage) {
  return loadLocationReminderState(viewerKey, storage).remindedAt;
}

export function markLocationReminder(
  viewerKey = 'guest',
  now = Date.now(),
  storage: Storage = localStorage,
  permissionState: LocationPermissionState = 'idle',
) {
  const timestamp = Number(now);
  if (!Number.isFinite(timestamp) || timestamp < 0) return;
  storage.setItem(storageKey(viewerKey), JSON.stringify({
    permissionState: PERMISSION_STATES.has(permissionState) ? permissionState : 'idle',
    remindedAt: timestamp,
  }));
}

export function shouldShowLocationReminder(
  viewerKey = 'guest',
  { explicit = false, now = Date.now(), storage = localStorage }: {
    explicit?: boolean;
    now?: number;
    storage?: Storage;
  } = {},
) {
  if (explicit) return true;
  return Number(now) - loadLocationReminderAt(viewerKey, storage) >= LOCATION_REMINDER_COOLDOWN_MS;
}

export { storageKey as locationReminderStorageKey };
