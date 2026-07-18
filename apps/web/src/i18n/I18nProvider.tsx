import { useEffect, type ReactNode } from 'react';
import type { i18n } from 'i18next';
import { I18nextProvider } from 'react-i18next';

import { bliverI18n } from './i18n.js';

export interface BliverI18nProviderProps {
  readonly children: ReactNode;
  readonly instance?: i18n;
}

export function BliverI18nProvider({
  children,
  instance = bliverI18n,
}: BliverI18nProviderProps) {
  useEffect(() => {
    const syncDocumentLanguage = (language: string): void => {
      document.documentElement.lang = language;
    };

    syncDocumentLanguage(instance.resolvedLanguage ?? instance.language);
    instance.on('languageChanged', syncDocumentLanguage);

    return () => {
      instance.off('languageChanged', syncDocumentLanguage);
    };
  }, [instance]);

  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}
