import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFixedScope } from '../../domain/locationStorage';
import useLocationContext from '../useLocationContext';

const mocks = vi.hoisted(() => ({ resolveLocation: vi.fn() }));

vi.mock('../../api', () => ({
  apiClient: { map: { resolveLocation: mocks.resolveLocation } },
}));

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-07-11T12:00:00.000Z');

describe('useLocationContext', () => {
  const originalGeolocation = navigator.geolocation;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: originalGeolocation,
    });
  });

  it('falls back to global when location permission is denied', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: vi.fn((_success, reject) => reject({ code: 1 })) },
    });
    const { result } = renderHook(() => useLocationContext());

    await act(() => result.current.requestLocation({ explicit: true, now: NOW }));

    expect(result.current.permissionState).toBe('denied');
    expect(result.current.scopeContext).toEqual({ scope: 'global', reason: 'permission-denied' });
  });

  it('suppresses ordinary reminders for seven days but never blocks explicit locate', async () => {
    const getCurrentPosition = vi.fn((_success, reject) => reject({ code: 1 }));
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    });
    const { result } = renderHook(() => useLocationContext());

    await act(() => result.current.requestLocation({ explicit: false, now: NOW }));
    expect(result.current.shouldRemind({ explicit: false, now: NOW + 2 * DAY })).toBe(false);

    await act(() => result.current.requestLocation({ explicit: false, now: NOW + 2 * DAY }));
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);

    await act(() => result.current.requestLocation({ explicit: true, now: NOW + 2 * DAY }));
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
  });

  it('resolves structured location without persisting precise coordinates', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((resolve) => resolve({
          coords: { latitude: 31.23, longitude: 121.47 },
        })),
      },
    });
    mocks.resolveLocation.mockResolvedValueOnce({
      data: {
        location: {
          displayName: '上海市',
          countryCode: 'CN',
          countryName: '中国',
          regionCode: 'CN-SH',
          regionName: '上海市',
        },
      },
    });
    const { result } = renderHook(() => useLocationContext());

    await act(() => result.current.requestLocation({ explicit: true, now: NOW }));

    expect(result.current.permissionState).toBe('granted');
    expect(result.current.scopeContext).toMatchObject({
      scope: 'smart', countryCode: 'CN', regionCode: 'CN-SH', reason: 'resolved-location',
    });
    expect(mocks.resolveLocation).toHaveBeenCalledWith({ lat: 31.23, lng: 121.47 });
    expect(JSON.stringify(localStorage)).not.toContain('31.23');
    expect(JSON.stringify(localStorage)).not.toContain('121.47');
  });

  it('persists a fixed scope and clearing it returns to smart behavior', async () => {
    const { result } = renderHook(() => useLocationContext());
    const fixed = {
      scope: 'region', countryCode: 'CN', regionCode: 'CN-SH',
      countryName: '中国', regionName: '上海市',
    };

    act(() => result.current.setFixedScope(fixed));
    expect(result.current.scopeContext).toEqual({ ...fixed, reason: 'fixed' });
    expect(loadFixedScope()).toEqual(fixed);

    act(() => result.current.clearFixedScope());
    await waitFor(() => expect(result.current.scopeContext.scope).toBe('smart'));
    expect(loadFixedScope()).toBeNull();
  });
});
