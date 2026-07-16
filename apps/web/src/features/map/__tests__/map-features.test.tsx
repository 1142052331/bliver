// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapRoute } from '../MapRoute.js';
import { PublishFootprintRoute } from '../../footprints/PublishFootprintRoute.js';
import { FootprintDetailRoute } from '../../footprints/FootprintDetailRoute.js';
import { MapControls } from '../MapControls.js';

vi.mock('../MapCanvas.js', () => ({ MapCanvas: () => <div data-testid="map-canvas" /> }));

function renderRoute(element: React.ReactNode) { return render(<MemoryRouter>{element}</MemoryRouter>); }

afterEach(() => { cleanup(); sessionStorage.clear(); vi.unstubAllGlobals(); });

describe('V2 map and footprint features', () => {
  it('renders loading, empty, and privacy-labelled map states', () => {
    const { rerender } = renderRoute(<MapRoute state="loading" items={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading map');
    rerender(<MemoryRouter><MapRoute state="empty" items={[]} /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'No footprints here yet' })).toBeInTheDocument();
    rerender(<MemoryRouter><MapRoute state="ready" items={[{ id: 'one', author: { name: 'A' }, displayPoint: { lat: 31, lng: 121 }, visibility: 'friends', locationPrecision: 'approximate', publishedAt: new Date().toISOString() }]} /></MemoryRouter>);
    expect(screen.getByText('Approximate location')).toBeInTheDocument();
    expect(screen.getByText('Friends only')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open footprint' })).toHaveAttribute('href', '/footprints/one');
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

  it('invokes search and locate control actions', () => {
    const search = vi.fn();
    const locate = vi.fn();
    renderRoute(<MapControls visibility="" onVisibilityChange={vi.fn()} onSearch={search} onLocate={locate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Search places' }));
    fireEvent.click(screen.getByRole('button', { name: 'Locate me' }));
    expect(search).toHaveBeenCalledOnce();
    expect(locate).toHaveBeenCalledOnce();
  });

  it('keeps detail privacy visible and supports close/back', () => {
    const onClose = vi.fn();
    renderRoute(<FootprintDetailRoute footprint={{ id: 'one', message: 'Hello', visibility: 'private', locationPrecision: 'precise' }} onClose={onClose} />);
    expect(screen.getByText('Only you')).toBeInTheDocument();
    expect(screen.getByText('Precise location')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close footprint' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('persists a guest detail comment as a login-resumable action', async () => { vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => init?.method === 'POST' ? ({ ok: false, status: 401, json: async () => ({ code: 'AUTH_REQUIRED' }) }) : ({ ok: true, status: 200, json: async () => ({ items: [] }) }))); renderRoute(<FootprintDetailRoute footprint={{ id: 'one', message: 'Hello', visibility: 'public', locationPrecision: 'approximate' }} />); fireEvent.change(await screen.findByLabelText('Comment'), { target: { value: 'Remember this' } }); fireEvent.click(screen.getByRole('button', { name: 'Post' })); expect(await screen.findByText('Sign in to join the conversation.')).toBeVisible(); expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login'); expect(JSON.parse(sessionStorage.getItem('bliver:pending-action') ?? '{}')).toMatchObject({ kind: 'comment', footprintId: 'one', returnTo: '/' }); });
});
