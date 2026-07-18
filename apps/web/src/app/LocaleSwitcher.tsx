import { useTranslation } from 'react-i18next';

import {
  matchSupportedLocale,
  persistLocale,
  supportedLocales,
  type AppLocale,
} from '../i18n/locale.js';

const localeKeys = {
  'zh-CN': 'locale.zhCN',
  en: 'locale.en',
  ja: 'locale.ja',
} as const satisfies Record<AppLocale, string>;

export function LocaleSwitcher() {
  const { i18n, t } = useTranslation();
  const value =
    matchSupportedLocale(i18n.resolvedLanguage ?? i18n.language) ?? 'en';
  const label = t('common.language');

  const changeLocale = (locale: AppLocale): void => {
    try {
      persistLocale(window.localStorage, locale);
    } catch {
      // Language switching still works when embedded storage is unavailable.
    }
    void i18n.changeLanguage(locale);
  };

  return (
    <label className="locale-switcher">
      <span className="app-shell__sr-only">{label}</span>
      <select
        aria-label={label}
        title={label}
        value={value}
        onChange={(event) => changeLocale(event.target.value as AppLocale)}
      >
        {supportedLocales.map((locale) => (
          <option key={locale} value={locale}>
            {t(localeKeys[locale])}
          </option>
        ))}
      </select>
    </label>
  );
}
