// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BliverI18nProvider } from '../../../i18n/I18nProvider.js';
import { createBliverI18n } from '../../../i18n/i18n.js';
import { MomentDeck } from '../MomentDeck.js';
import type { ChronoLensItem } from '../ChronoLens.js';

const first: ChronoLensItem = {
  id: 'tokyo-shibuya',
  author: { name: 'Aoi' },
  displayPoint: { lat: 35.6595, lng: 139.7005 },
  visibility: 'public',
  locationPrecision: 'precise',
  publishedAt: '2026-07-20T08:15:00.000Z',
  message: 'Rain on the crossing, then a quiet coffee.',
  mood: 'happy',
  primaryMedia: {
    url: 'https://example.test/shibuya.jpg',
    width: 1200,
    height: 800,
  },
};

const second: ChronoLensItem = {
  id: 'tokyo-asakusa',
  author: { name: 'Ren' },
  displayPoint: { lat: 35.7148, lng: 139.7967 },
  visibility: 'friends',
  locationPrecision: 'approximate',
  publishedAt: '2026-07-19T22:30:00.000Z',
  message: 'Lanterns were still glowing by the river.',
};

function renderDeck(
  items: readonly ChronoLensItem[] = [first, second],
  props: Partial<React.ComponentProps<typeof MomentDeck>> = {},
) {
  const i18n = createBliverI18n('en');
  return render(
    <BliverI18nProvider instance={i18n}>
      <MomentDeck
        items={items}
        onClose={props.onClose ?? vi.fn()}
        onOpen={props.onOpen ?? vi.fn()}
        {...(props.onExpandMap ? { onExpandMap: props.onExpandMap } : {})}
      />
    </BliverI18nProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: true,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('MomentDeck', () => {
  it('renders a stable horizontal group with media and spatial cards', () => {
    const { container } = renderDeck();

    expect(screen.getByTestId('moment-deck')).toHaveAttribute(
      'data-motion-preference',
      'reduced',
    );
    expect(screen.getByRole('region', { name: 'Nearby footprints' })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-moment-deck-card="true"]')).toHaveLength(2);
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    expect(screen.getByText('Rain on the crossing, then a quiet coffee.')).toBeInTheDocument();
    expect(screen.getByText('Lanterns were still glowing by the river.')).toBeInTheDocument();
    expect(container.querySelector('.moment-frame--media')).toBeInTheDocument();
    expect(container.querySelector('.moment-frame--spatial')).toBeInTheDocument();
    expect(container.querySelectorAll('button.moment-deck__card-button')).toHaveLength(2);
    expect(container.querySelector('[data-footprint-mood="radiant"]')).toBeInTheDocument();
    expect(container.querySelector('.moment-frame--media[data-mood-key="radiant"]')).toBeInTheDocument();
    const moodCard = container.querySelector<HTMLElement>('[data-moment-deck-card="true"][data-mood-key="radiant"]');
    expect(moodCard).toHaveStyle({
      '--footprint-mood-surface': '#f5edd8',
      '--footprint-mood-ink': '#654b1d',
    });
    expect(container.querySelector('[data-moment-deck-card="true"]:not([data-mood-key])')).toBeInTheDocument();
  });

  it('does not use a first-letter avatar for a media-free card', () => {
    const { container } = renderDeck([second]);

    expect(container.querySelector('.moment-deck__avatar')).not.toBeInTheDocument();
    expect(container.querySelector('.moment-frame--spatial')).toBeInTheDocument();
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
  });

  it('exits before opening a selected card and supports expand/close actions', () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const onExpandMap = vi.fn();
    const { unmount } = renderDeck([first, second], { onOpen, onClose, onExpandMap });

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(onExpandMap).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: /Open footprint: Footprint by Aoi/ }));
    expect(onOpen).toHaveBeenCalledWith(first);
    unmount();

    renderDeck([first], { onClose });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('returns no visual tray for an empty group', () => {
    const { container } = renderDeck([]);
    expect(container.firstElementChild).toBeNull();
  });
});
