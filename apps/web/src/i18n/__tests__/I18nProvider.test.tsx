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

  it('provides localized map vocabulary and English footprint plurals', () => {
    const english = createBliverI18n('en');
    const chinese = createBliverI18n('zh-CN');
    const japanese = createBliverI18n('ja');

    expect(english.t('map.footprintCount', { count: 1 })).toBe('1 footprint');
    expect(english.t('map.footprintCount', { count: 2 })).toBe('2 footprints');
    expect(chinese.t('map.nearbyFootprints')).toBe('附近足迹');
    expect(japanese.t('map.staticUnavailableTitle')).toBe(
      'インタラクティブ地図を利用できません',
    );
  });
});
