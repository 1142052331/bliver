export const supportedLocales = ['zh-CN', 'en', 'ja'] as const;

export type AppLocale = (typeof supportedLocales)[number];

export const LOCALE_STORAGE_KEY = 'bliver.locale';

export function matchSupportedLocale(
  value: string | null | undefined,
): AppLocale | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.startsWith('zh')) return 'zh-CN';
  if (normalized.startsWith('ja')) return 'ja';
  if (normalized.startsWith('en')) return 'en';
  return null;
}

export function resolveInitialLocale(input: {
  readonly stored: string | null;
  readonly languages: readonly string[];
}): AppLocale {
  const stored = matchSupportedLocale(input.stored);
  if (stored) return stored;

  for (const language of input.languages) {
    const match = matchSupportedLocale(language);
    if (match) return match;
  }

  return 'en';
}

export function persistLocale(
  storage: Pick<Storage, 'setItem'>,
  locale: AppLocale,
): void {
  storage.setItem(LOCALE_STORAGE_KEY, locale);
}

export function detectInitialLocale(): AppLocale {
  if (typeof window === 'undefined') return 'en';

  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in private or embedded browsing contexts.
  }

  const languages =
    window.navigator.languages.length > 0
      ? window.navigator.languages
      : [window.navigator.language];

  return resolveInitialLocale({ stored, languages });
}
