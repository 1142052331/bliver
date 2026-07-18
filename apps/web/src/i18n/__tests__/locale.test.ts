// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import {
  LOCALE_STORAGE_KEY,
  detectInitialLocale,
  matchSupportedLocale,
  persistLocale,
  resolveInitialLocale,
} from '../locale.js';

describe('Bliver locale resolution', () => {
  it.each([
    ['zh-CN', 'zh-CN'],
    ['zh-Hans-JP', 'zh-CN'],
    ['ja-JP', 'ja'],
    ['en-US', 'en'],
    ['fr-FR', null],
  ] as const)('maps %s to %s', (input, expected) => {
    expect(matchSupportedLocale(input)).toBe(expected);
  });

  it('prefers a persisted supported locale over browser languages', () => {
    expect(resolveInitialLocale({ stored: 'ja', languages: ['zh-CN'] })).toBe(
      'ja',
    );
  });

  it('uses the first supported browser language and falls back to English', () => {
    expect(
      resolveInitialLocale({
        stored: null,
        languages: ['fr-FR', 'zh-Hans'],
      }),
    ).toBe('zh-CN');
    expect(resolveInitialLocale({ stored: null, languages: ['fr-FR'] })).toBe(
      'en',
    );
  });

  it('persists an explicit locale under the canonical key', () => {
    const setItem = vi.fn();
    persistLocale({ setItem }, 'ja');
    expect(setItem).toHaveBeenCalledWith(LOCALE_STORAGE_KEY, 'ja');
  });

  it('detects a persisted preference in the browser', () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'zh-CN');
    expect(detectInitialLocale()).toBe('zh-CN');
    window.localStorage.removeItem(LOCALE_STORAGE_KEY);
  });
});
