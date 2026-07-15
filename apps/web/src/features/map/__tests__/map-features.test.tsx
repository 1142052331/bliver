// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { MapRoute } from '../MapRoute.js';
import { PublishFootprintRoute } from '../../footprints/PublishFootprintRoute.js';
import { FootprintDetailRoute } from '../../footprints/FootprintDetailRoute.js';

vi.mock('../MapCanvas.js', () => ({ MapCanvas: () => <div data-testid="map-canvas" /> }));

function renderRoute(element: React.ReactNode) { return render(<MemoryRouter>{element}</MemoryRouter>); }

describe('V2 map and footprint features', () => {
  it('renders loading, empty, and privacy-labelled map states', () => {
    const { rerender } = renderRoute(<MapRoute state="loading" items={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading map');
    rerender(<MemoryRouter><MapRoute state="empty" items={[]} /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'No footprints here yet' })).toBeInTheDocument();
    rerender(<MemoryRouter><MapRoute state="ready" items={[{ id: 'one', author: { name: 'A' }, displayPoint: { lat: 31, lng: 121 }, visibility: 'friends', locationPrecision: 'approximate', publishedAt: new Date().toISOString() }]} /></MemoryRouter>);
    expect(screen.getByText('Approximate location')).toBeInTheDocument();
    expect(screen.getByText('Friends only')).toBeInTheDocument();
  });

  it('validates publishing before upload and recovers from upload failure', async () => {
    const sign = vi.fn(async () => { throw new Error('upload down'); });
    renderRoute(<PublishFootprintRoute signUpload={sign} publish={vi.fn(async () => undefined)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Publish footprint' }));
    expect(screen.getByText('Write a message before publishing.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'At the river' } });
    fireEvent.change(screen.getByLabelText('Photo (optional)'), { target: { files: [new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })] } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish footprint' }));
    expect(await screen.findByText('Upload failed. Try again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish footprint' })).toBeEnabled();
  });

  it('keeps detail privacy visible and supports close/back', () => {
    const onClose = vi.fn();
    renderRoute(<FootprintDetailRoute footprint={{ id: 'one', message: 'Hello', visibility: 'private', locationPrecision: 'precise' }} onClose={onClose} />);
    expect(screen.getByText('Only you')).toBeInTheDocument();
    expect(screen.getByText('Precise location')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close footprint' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
