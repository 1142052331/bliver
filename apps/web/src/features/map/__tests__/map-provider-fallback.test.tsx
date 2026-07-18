// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BliverI18nProvider } from '../../../i18n/I18nProvider.js';
import { createBliverI18n } from '../../../i18n/i18n.js';

vi.mock('../map-provider.js', () => ({
  resolveMapProvider: () => {
    throw new Error('INVALID_PROVIDER_CONFIGURATION');
  },
}));

import { MapCanvas } from '../MapCanvas.js';

afterEach(() => cleanup());

describe('MapCanvas provider configuration fallback', () => {
  it('keeps the static geography and semantic list when provider validation fails', () => {
    const i18n = createBliverI18n('en');
    render(
      <BliverI18nProvider instance={i18n}>
        <MapCanvas
          items={[{
            id: 'footprint-provider-fallback',
            author: { name: 'Provider fallback author' },
            displayPoint: { lat: 35.68, lng: 139.76 },
          }]}
        />
      </BliverI18nProvider>,
    );

    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-mode', 'static');
    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-map-ready', 'false');
    expect(screen.getByTestId('map-static-fallback')).toBeVisible();
    expect(screen.getByRole('button', { name: /Provider fallback author/ })).toBeVisible();
  });
});
