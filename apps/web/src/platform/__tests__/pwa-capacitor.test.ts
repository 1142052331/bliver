// @vitest-environment jsdom

import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearFootprintDraft, loadFootprintDraft, saveFootprintDraft } from '../drafts.js';
import { deepLinkDestination, loginReturnDestination } from '../deep-link.js';
import { createCapacitorCredentialStore, handleCapacitorAuthExpiry } from '../credentials.js';
import { requestNativePermission } from '../permissions.js';

beforeEach(() => localStorage.clear());

describe('PWA and Capacitor client boundaries', () => {
  it('persists recoverable form fields without coordinates, media or credentials', () => {
    saveFootprintDraft({ message: 'Offline note', visibility: 'friends', locationPrecision: 'approximate' });
    expect(loadFootprintDraft()).toEqual({ message: 'Offline note', visibility: 'friends', locationPrecision: 'approximate' });
    expect(localStorage.getItem('bliver:footprint-draft')).not.toMatch(/lat|lng|token|file/i);
    clearFootprintDraft();
    expect(loadFootprintDraft()).toBeNull();
  });

  it('requires a secure native storage backend and clears it on auth expiry', async () => {
    const values = new Map<string, string>();
    const storage = {
      security: 'hardware-backed' as const,
      async get(key: string) { return { value: values.get(key) ?? null }; },
      async set(entry: { key: string; value: string }) { values.set(entry.key, entry.value); },
      async remove(entry: { key: string }) { values.delete(entry.key); },
    };
    const credentials = createCapacitorCredentialStore(storage);
    await credentials.setAccessToken('fixture-token');
    expect(await credentials.getAccessToken()).toBe('fixture-token');
    const navigate = vi.fn();
    await handleCapacitorAuthExpiry(credentials, '/footprints/footprint-1', navigate);
    expect(await credentials.getAccessToken()).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/login?returnTo=%2Ffootprints%2Ffootprint-1');
  });

  it('routes deep links through authentication and returns to the footprint', () => {
    expect(deepLinkDestination('bliver://app/footprints/footprint-1', false)).toBe('/login?returnTo=%2Ffootprints%2Ffootprint-1');
    expect(deepLinkDestination('bliver://app/footprints/footprint-1', true)).toBe('/footprints/footprint-1');
    expect(loginReturnDestination('?returnTo=%2Ffootprints%2Ffootprint-1')).toBe('/footprints/footprint-1');
    expect(loginReturnDestination('?returnTo=https%3A%2F%2Fevil.example')).toBe('/map');
  });

  it('treats camera and location permission denial as a recoverable result', async () => {
    const bridge = { request: vi.fn(async () => ({ state: 'denied' as const })) };
    await expect(requestNativePermission(bridge, 'camera')).resolves.toBe(false);
    await expect(requestNativePermission(bridge, 'location')).resolves.toBe(false);
  });

  it('ships an offline shell that never caches private API or credential requests', async () => {
    const worker = await readFile(resolve('apps/web/public/sw.js'), 'utf8');
    expect(worker).toContain("pathname.startsWith('/api/')");
    expect(worker).toContain("request.mode === 'navigate'");
    expect(worker).toContain("caches.match('/index.html')");
    expect(worker).not.toContain("cache.put('/api/");
    expect(worker.indexOf("request.mode === 'navigate'")).toBeLessThan(worker.indexOf("request.credentials === 'include'"));
  });

  it('ships every icon referenced by the install manifest', async () => {
    const manifest = JSON.parse(await readFile(resolve('apps/web/public/manifest.webmanifest'), 'utf8')) as { icons: Array<{ src: string }> };
    await Promise.all(manifest.icons.map(({ src }) => access(resolve('apps/web/public', src.replace(/^\//, '')))));
  });
});
