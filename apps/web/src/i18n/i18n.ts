import { createInstance, type i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { detectInitialLocale, supportedLocales, type AppLocale } from './locale.js';
import { resources } from './resources.js';

export function createBliverI18n(locale: AppLocale): i18n {
  const instance = createInstance();

  void instance.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: 'en',
    supportedLngs: supportedLocales,
    interpolation: { escapeValue: false },
    initAsync: false,
  });

  return instance;
}

export const bliverI18n = createBliverI18n(detectInitialLocale());
