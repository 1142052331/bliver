// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapRoute } from '../MapRoute.js';
import { ChronoLens } from '../ChronoLens.js';
import { PublishFootprintRoute } from '../../footprints/PublishFootprintRoute.js';
import { FootprintDetailRoute } from '../../footprints/FootprintDetailRoute.js';
import { MapControls } from '../MapControls.js';
import { BliverI18nProvider } from '../../../i18n/I18nProvider.js';
import { createBliverI18n } from '../../../i18n/i18n.js';

interface MockMapCanvasItem {
  readonly id: string;
  readonly author: { readonly name: string };
  readonly displayPoint: { readonly lat: number; readonly lng: number };
}

interface MockMapCanvasProps {
  readonly items?: readonly MockMapCanvasItem[];
  readonly onActivate?: (selection: {
    readonly kind: 'point' | 'cluster';
    readonly items: readonly MockMapCanvasItem[];
    readonly anchor: { readonly x: number; readonly y: number };
  }) => void;
  readonly onDismiss?: () => void;
  readonly onViewportChange?: (bounds: {
    readonly east: number;
    readonly north: number;
    readonly south: number;
    readonly west: number;
  }) => void;
}

vi.mock('../MapCanvas.js', () => ({
  MapCanvas: ({ items = [], onActivate, onDismiss, onViewportChange }: MockMapCanvasProps) => (
    <div data-testid="map-canvas">
      <button
        type="button"
        onClick={() => {
          const first = items[0];
          if (first) onActivate?.({ kind: 'point', items: [first], anchor: { x: 40, y: 80 } });
        }}
      >
        Activate point
      </button>
      <button
        type="button"
        onClick={() => onActivate?.({ kind: 'cluster', items, anchor: { x: 80, y: 120 } })}
      >
        Activate cluster
      </button>
      <button type="button" onClick={onDismiss}>Dismiss map selection</button>
      <button
        type="button"
        onClick={() => onViewportChange?.({ east: 122, north: 32, south: 30, west: 120 })}
      >
        Report viewport
      </button>
    </div>
  ),
}));

function renderRoute(element: React.ReactNode) {
  const instance = createBliverI18n('en');
  const renderElement = (node: React.ReactNode) => (
    <BliverI18nProvider instance={instance}>
      <MemoryRouter>{node}</MemoryRouter>
    </BliverI18nProvider>
  );
  const result = render(renderElement(element));
  return {
    ...result,
    rerenderRoute(next: React.ReactNode) {
      result.rerender(renderElement(next));
    },
  };
}

function SearchControlsFixture({
  locate,
  search,
}: {
  readonly locate: () => void;
  readonly search: (query: string) => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  return (
    <MapControls
      visibility=""
      searchOpen={searchOpen}
      onVisibilityChange={vi.fn()}
      onSearchOpenChange={setSearchOpen}
      onSearch={search}
      onLocate={locate}
    />
  );
}

afterEach(() => { cleanup(); sessionStorage.clear(); vi.unstubAllGlobals(); });

describe('V2 map and footprint features', () => {
  it('commits a preview close once when a projected anchor arrives during exit', async () => {
    const item = {
      id: 'late-anchor',
      author: { name: 'Aoi' },
      displayPoint: { lat: 35.67, lng: 139.76 },
      visibility: 'public' as const,
      locationPrecision: 'approximate' as const,
      publishedAt: '2026-07-15T08:00:00.000Z',
    };
    const onClose = vi.fn();
    const { rerenderRoute } = renderRoute(
      <ChronoLens item={item} mode="explicit" onClose={onClose} />,
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    rerenderRoute(
      <ChronoLens
        item={item}
        mode="explicit"
        anchor={{ x: 80, y: 120 }}
        onClose={onClose}
      />,
    );

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it('renders loading, empty, and privacy-labelled map states', async () => {
    const { rerenderRoute } = renderRoute(<MapRoute state="loading" items={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading map');
    rerenderRoute(<MapRoute state="empty" items={[]} />);
    expect(screen.getByRole('heading', { name: 'No footprints here yet' })).toBeInTheDocument();
    rerenderRoute(<MapRoute state="ready" items={[{ id: 'one', author: { name: 'A' }, displayPoint: { lat: 31, lng: 121 }, visibility: 'friends', locationPrecision: 'approximate', publishedAt: new Date().toISOString() }]} />);
    expect(screen.queryByTestId('chrono-lens')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Activate point' }));
    const textOnlyLens = screen.getByTestId('chrono-lens');
    expect(textOnlyLens).toHaveAttribute('data-frame-mode', 'spatial');
    expect(textOnlyLens.querySelector('.chrono-lens__story')).toBeInTheDocument();
    expect(textOnlyLens.querySelector('.chrono-lens__footer')).toBeInTheDocument();
    expect(textOnlyLens.querySelector('.moment-frame--spatial')).toBeInTheDocument();
    expect(textOnlyLens.querySelector('img')).not.toBeInTheDocument();
    expect(screen.getByText('Approximate location')).toBeInTheDocument();
    expect(screen.getByText('Friends only')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open footprint' })).toHaveAttribute('href', '/footprints/one');
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('chrono-lens')).not.toBeInTheDocument());
  });

  it('keeps a same-frame viewport report from reopening a dismissed preview', async () => {
    renderRoute(<MapRoute state="ready" items={[{
      id: 'one',
      author: { name: 'A' },
      displayPoint: { lat: 31, lng: 121 },
      visibility: 'public',
      locationPrecision: 'approximate',
      publishedAt: '2026-07-15T08:00:00.000Z',
    }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Activate point' }));
    expect(screen.getByTestId('chrono-lens')).toBeInTheDocument();

    const dismiss = screen.getByRole('button', { name: 'Dismiss map selection' });
    const reportViewport = screen.getByRole('button', { name: 'Report viewport' });
    act(() => {
      dismiss.click();
      reportViewport.click();
    });

    await waitFor(() => expect(screen.queryByTestId('chrono-lens')).not.toBeInTheDocument());
  });

  it('projects authorized primary media into the Chrono Lens', () => {
    renderRoute(<MapRoute state="ready" items={[{ id: 'media-one', author: { name: 'Mina' }, displayPoint: { lat: 31, lng: 121 }, visibility: 'public', locationPrecision: 'precise', publishedAt: new Date().toISOString(), mood: 'tender', primaryMedia: { url: 'https://example.test/photo.jpg', width: 1600, height: 900 } }]} />);
    expect(screen.queryByTestId('chrono-lens')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Activate point' }));
    const mediaLens = screen.getByTestId('chrono-lens');
    expect(mediaLens).toHaveAttribute('data-frame-mode', 'media');
    expect(mediaLens).toHaveAttribute('data-mood-key', 'tender');
    expect(mediaLens).toHaveStyle({
      '--footprint-mood-surface': '#f3e6e4',
      '--footprint-mood-ink': '#6b3844',
    });
    const image = mediaLens.querySelector('img');
    expect(image).toHaveAttribute('src', 'https://example.test/photo.jpg');
    expect(image).toHaveAttribute('width', '1600');
    expect(image).toHaveAttribute('height', '900');
    expect(image?.getAttribute('style') ?? '').not.toContain('filter');
  });

  it('opens grouped moments only after a cluster activation and dismisses them from the map', () => {
    const publishedAt = new Date().toISOString();
    renderRoute(
      <MapRoute
        state="ready"
        items={[
          { id: 'one', author: { name: 'Aoi' }, displayPoint: { lat: 35.6595, lng: 139.7005 }, visibility: 'public', locationPrecision: 'approximate', publishedAt, message: 'Shibuya after the rain' },
          { id: 'two', author: { name: 'Ren' }, displayPoint: { lat: 35.6938, lng: 139.7034 }, visibility: 'public', locationPrecision: 'approximate', publishedAt, message: 'Last light over Shinjuku' },
        ]}
      />,
    );

    expect(screen.queryByTestId('moment-deck')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chrono-lens')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Activate cluster' }));

    expect(screen.getByTestId('moment-deck')).toBeVisible();
    expect(screen.getByText('Shibuya after the rain')).toBeVisible();
    expect(screen.getByText('Last light over Shinjuku')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss map selection' }));
    expect(screen.queryByTestId('moment-deck')).not.toBeInTheDocument();
  });

  it('validates publishing before upload and recovers from upload failure', async () => {
    const sign = vi.fn(async () => { throw new Error('upload down'); });
    renderRoute(<PublishFootprintRoute initialPoint={{ lat: 31.2, lng: 121.4 }} signUpload={sign} publish={vi.fn(async () => undefined)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Publish footprint' }));
    expect(screen.getByText('Write a message before publishing.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'At the river' } });
    fireEvent.change(screen.getByLabelText('Photo (optional)'), { target: { files: [new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })] } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish footprint' }));
    expect(await screen.findByText('Upload failed. Try again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish footprint' })).toBeEnabled();
  });

  it('publishes with the selected map point instead of a fixed location', async () => {
    const publish = vi.fn(async () => undefined);
    renderRoute(<PublishFootprintRoute initialPoint={{ lat: 22.5431, lng: 114.0579 }} signUpload={vi.fn()} publish={publish} />);

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Selected place' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish footprint' }));

    await waitFor(() => expect(publish).toHaveBeenCalledWith(expect.objectContaining({ privatePoint: { lat: 22.5431, lng: 114.0579 } })));
  });

  it('expands place search before submitting and supports keyboard and explicit close', () => {
    const search = vi.fn();
    const locate = vi.fn();
    renderRoute(<SearchControlsFixture search={search} locate={locate} />);

    const searchTrigger = screen.getByRole('button', { name: 'Search places' });
    fireEvent.click(searchTrigger);
    expect(search).not.toHaveBeenCalled();
    const input = screen.getByRole('textbox', { name: 'Place search' });
    fireEvent.change(input, { target: { value: '  Shibuya  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(search).toHaveBeenCalledWith('Shibuya');

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'Place search' })).not.toBeInTheDocument();
    expect(searchTrigger).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Search places' }));
    expect(screen.getByRole('textbox', { name: 'Place search' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close search' }));
    expect(screen.queryByRole('textbox', { name: 'Place search' })).not.toBeInTheDocument();
    expect(searchTrigger).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Locate me' }));
    expect(locate).toHaveBeenCalledOnce();
  });

  it('renders dismissible info and error notices for map control feedback', () => {
    const dismiss = vi.fn();
    const props = {
      onDismissStatus: dismiss,
      onLocate: vi.fn(),
      onSearch: vi.fn(),
      onSearchOpenChange: vi.fn(),
      onVisibilityChange: vi.fn(),
      searchOpen: false,
      visibility: '',
    };
    const { rerenderRoute } = renderRoute(
      <MapControls {...props} status={{ kind: 'info', message: 'Location updated' }} />,
    );

    const infoNotice = screen.getByTestId('map-control-notice');
    expect(infoNotice).toHaveAttribute('role', 'status');
    expect(infoNotice).toHaveTextContent('Location updated');
    fireEvent.click(within(infoNotice).getByRole('button', { name: 'Close' }));
    expect(dismiss).toHaveBeenCalledOnce();

    rerenderRoute(
      <MapControls {...props} status={{ kind: 'error', message: 'Location unavailable' }} />,
    );
    expect(screen.getByTestId('map-control-notice')).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId('map-control-notice')).toHaveTextContent('Location unavailable');
  });

  it('keeps detail privacy visible and supports close/back', () => {
    const onClose = vi.fn();
    renderRoute(<FootprintDetailRoute footprint={{ id: 'one', message: 'Hello', visibility: 'private', locationPrecision: 'precise' }} onClose={onClose} />);
    expect(screen.getByText('Only you')).toBeInTheDocument();
    expect(screen.getByText('Precise location')).toBeInTheDocument();
    const close = screen.getByRole('button', { name: 'Close footprint' });
    fireEvent.click(close);
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders authorized detail media and falls back to location when it fails', () => {
    renderRoute(
      <FootprintDetailRoute
        footprint={{
          id: 'one',
          message: 'Hello',
          visibility: 'public',
          locationPrecision: 'approximate',
          author: { name: 'Lin' },
          displayPoint: { lat: 31, lng: 121 },
          primaryMedia: {
            url: 'https://res.cloudinary.com/bliver/image/upload/example.jpg',
            width: 1600,
            height: 1200,
          },
        }}
      />,
    );

    const image = screen.getByRole('img', { name: 'Footprint photo from Lin' });
    expect(image).toHaveAttribute('width', '1600');
    expect(image).toHaveAttribute('height', '1200');
    expect(screen.getByText('Photo by Lin')).toBeVisible();

    fireEvent.error(image);

    expect(screen.queryByRole('img', { name: 'Footprint photo from Lin' })).not.toBeInTheDocument();
    expect(screen.getByText('Photo unavailable. Showing the location instead.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Retry photo' })).toBeVisible();
    expect(screen.getByText(/31\.00000/)).toBeVisible();
  });

  it('persists a guest detail comment as a login-resumable action', async () => { vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => init?.method === 'POST' ? ({ ok: false, status: 401, json: async () => ({ code: 'AUTH_REQUIRED' }) }) : ({ ok: true, status: 200, json: async () => ({ items: [] }) }))); renderRoute(<FootprintDetailRoute footprint={{ id: 'one', message: 'Hello', visibility: 'public', locationPrecision: 'approximate' }} />); fireEvent.change(await screen.findByLabelText('Comment'), { target: { value: 'Remember this' } }); fireEvent.click(screen.getByRole('button', { name: 'Post' })); expect(await screen.findByText('Sign in to join the conversation.')).toBeVisible(); expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login'); expect(JSON.parse(sessionStorage.getItem('bliver:pending-action') ?? '{}')).toMatchObject({ kind: 'comment', footprintId: 'one', returnTo: '/' }); });
});
