import { describe, expect, it, vi } from 'vitest';

import {
  runCapacitorCommandGates,
  validateAndroidDeepLinks,
  validateCapacitorConfig,
  validateDeepLinkAuthReturn,
  validateOfflineWorkerPolicy,
} from './smoke.js';

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

  it('executes platform behavior, browser auth return and Android sync as required gates', () => {
    const runner = vi.fn((_command: { readonly label: string; readonly args: readonly string[] }) => 0);
    expect(runCapacitorCommandGates(runner)).toEqual([]);
    expect(runner.mock.calls.map(([command]) => command)).toEqual([
      expect.objectContaining({
        label: 'platform behavior',
        args: expect.arrayContaining(['run', 'apps/web/src/platform/__tests__/pwa-capacitor.test.ts']),
      }),
      expect.objectContaining({
        label: 'browser deep-link auth return',
        args: expect.arrayContaining([
          'test',
          'apps/web/e2e/auth.spec.ts',
          '--project=mobile-390x844',
          '--grep=Capacitor footprint deep link returns to the footprint after login',
          '--output=test-results/capacitor-smoke',
        ]),
      }),
      expect.objectContaining({ label: 'Android sync', args: ['sync', 'android'] }),
    ]);

    const failingRunner = vi.fn((command: { readonly label: string }) => command.label === 'Android sync' ? 1 : 0);
    expect(runCapacitorCommandGates(failingRunner)).toEqual(['Android sync failed']);
  });
});
