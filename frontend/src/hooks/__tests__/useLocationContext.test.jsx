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

  it('keeps reminder cooldown isolated between viewers', async () => {
    const first = vi.fn((_success, reject) => reject({ code: 1 }));
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: first } });
    const firstHook = renderHook(() => useLocationContext({ viewerKey: 'viewer-a' }));
    await act(() => firstHook.result.current.requestLocation({ explicit: false, now: NOW }));

    const second = vi.fn((_success, reject) => reject({ code: 1 }));
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: second } });
    const secondHook = renderHook(() => useLocationContext({ viewerKey: 'viewer-b' }));
    await act(() => secondHook.result.current.requestLocation({ explicit: false, now: NOW + 1 }));

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('does not request geolocation during passive hook startup', () => {
    const getCurrentPosition = vi.fn();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    });

    renderHook(() => useLocationContext({ viewerKey: 'guest' }));

    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('restores denied guidance without prompting again on startup', () => {
    localStorage.setItem('bliver_location_reminder_at_v2:viewer-a', JSON.stringify({
      permissionState: 'denied',
      remindedAt: NOW,
    }));
    const getCurrentPosition = vi.fn();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    });

    const { result } = renderHook(() => useLocationContext({ viewerKey: 'viewer-a' }));

    expect(result.current.permissionState).toBe('denied');
    expect(result.current.scopeContext).toEqual({ scope: 'global', reason: 'permission-denied' });
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('switches permission guidance when the active viewer changes', () => {
    localStorage.setItem('bliver_location_reminder_at_v2:viewer-a', JSON.stringify({
      permissionState: 'denied',
      remindedAt: NOW,
    }));
    const { result, rerender } = renderHook(
      ({ viewerKey }) => useLocationContext({ viewerKey }),
      { initialProps: { viewerKey: 'viewer-a' } },
    );
    expect(result.current.permissionState).toBe('denied');

    rerender({ viewerKey: 'viewer-b' });

    expect(result.current.permissionState).toBe('idle');
    expect(result.current.scopeContext).toEqual({ scope: 'smart', reason: 'unresolved' });
  });

  it('keeps resolved locations isolated when switching between viewers', async () => {
    const getCurrentPosition = vi.fn((resolve) => resolve({
      coords: { latitude: 31.23, longitude: 121.47 },
    }));
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    });
    mocks.resolveLocation
      .mockResolvedValueOnce({ data: { location: { countryCode: 'CN', regionCode: 'CN-SH' } } })
      .mockResolvedValueOnce({ data: { location: { countryCode: 'US', regionCode: 'US-CA' } } });

    const { result, rerender } = renderHook(
      ({ viewerKey }) => useLocationContext({ viewerKey }),
      { initialProps: { viewerKey: 'viewer-a' } },
    );

    await act(() => result.current.requestLocation({ explicit: true, now: NOW }));
    expect(result.current.scopeContext).toMatchObject({ countryCode: 'CN', regionCode: 'CN-SH' });

    rerender({ viewerKey: 'viewer-b' });
    expect(result.current.scopeContext).toEqual({ scope: 'smart', reason: 'unresolved' });
    await act(() => result.current.requestLocation({ explicit: true, now: NOW + 1 }));
    expect(result.current.scopeContext).toMatchObject({ countryCode: 'US', regionCode: 'US-CA' });

    rerender({ viewerKey: 'viewer-a' });
    expect(result.current.scopeContext).toMatchObject({ countryCode: 'CN', regionCode: 'CN-SH' });
  });

  it('does not expose a signed-in viewer location to guest mode', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: vi.fn((resolve) => resolve({ coords: { latitude: 1, longitude: 2 } })) },
    });
    mocks.resolveLocation.mockResolvedValueOnce({
      data: { location: { countryCode: 'CN', regionCode: 'CN-SH' } },
    });
    const { result, rerender } = renderHook(
      ({ viewerKey }) => useLocationContext({ viewerKey }),
      { initialProps: { viewerKey: 'viewer-a' } },
    );

    await act(() => result.current.requestLocation({ explicit: true, now: NOW }));
    rerender({ viewerKey: 'guest' });

    expect(result.current.scopeContext).toEqual({ scope: 'smart', reason: 'unresolved' });
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

    let outcome;
    await act(async () => {
      outcome = await result.current.requestLocation({ explicit: true, now: NOW });
    });

    expect(result.current.permissionState).toBe('granted');
    expect(result.current.scopeContext).toMatchObject({
      scope: 'smart', countryCode: 'CN', regionCode: 'CN-SH', reason: 'resolved-location',
    });
    expect(outcome).toMatchObject({
      status: 'granted',
      coords: { lat: 31.23, lng: 121.47 },
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
