import { describe, expect, it } from 'vitest';

import { validateAndroidDeepLinks, validateCapacitorConfig, validateDeepLinkAuthReturn, validateOfflineWorkerPolicy } from './smoke.js';

describe('Capacitor smoke policy', () => {
  it('requires the V2 dist, stable app id and HTTPS-only server', () => {
    expect(validateCapacitorConfig({ appId: 'com.bliver.app', webDir: 'apps/web/dist', server: { url: 'https://bliver.app', cleartext: false } })).toEqual([]);
    expect(validateCapacitorConfig({ appId: 'wrong', webDir: 'frontend/dist', server: { url: 'http://localhost', cleartext: true } })).toHaveLength(4);
  });

  it('returns an unauthenticated footprint deep link to the same route after login', () => {
    expect(validateDeepLinkAuthReturn('bliver://app/footprints/footprint-1')).toBe(true);
  });

  it('matches the verified Android App Link host to the production server', () => {
    const manifest = '<intent-filter android:autoVerify="true"><data android:scheme="bliver"/><data android:scheme="https" android:host="bliver.onrender.com"/></intent-filter>';
    expect(validateAndroidDeepLinks(manifest, 'https://bliver.onrender.com')).toEqual([]);
    expect(validateAndroidDeepLinks(manifest, 'https://wrong.example')).toContain('Android verified App Link host must match the Capacitor production server');
  });

  it('rejects a worker that bypasses credentialed navigation before its offline fallback', () => {
    const safe = "pathname.startsWith('/api/'); request.mode === 'navigate'; caches.match('/index.html'); request.credentials === 'include'";
    const unsafe = "pathname.startsWith('/api/'); request.credentials === 'include'; request.mode === 'navigate'; caches.match('/index.html')";
    expect(validateOfflineWorkerPolicy(safe)).toBe(true);
    expect(validateOfflineWorkerPolicy(unsafe)).toBe(false);
  });
});
