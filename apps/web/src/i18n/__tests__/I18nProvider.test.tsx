// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { act, render, screen } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { BliverI18nProvider } from '../I18nProvider.js';
import { createBliverI18n } from '../i18n.js';

function Probe() {
  const { t } = useTranslation();
  return <p>{t('actions.publish')}</p>;
}

describe('BliverI18nProvider', () => {
  it('renders a locale and updates translations and the document language', async () => {
    const instance = createBliverI18n('en');
    render(
      <BliverI18nProvider instance={instance}>
        <Probe />
      </BliverI18nProvider>,
    );

    expect(screen.getByText('Leave footprint')).toBeVisible();
    expect(document.documentElement).toHaveAttribute('lang', 'en');

    await act(() => instance.changeLanguage('ja'));

    expect(screen.getByText('足跡を残す')).toBeVisible();
    expect(document.documentElement).toHaveAttribute('lang', 'ja');
  });
});
