// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MomentFrame } from '../MomentFrame.js';

afterEach(() => cleanup());

const labels = {
  mediaAlt: 'Footprint photo by Lin',
  spatialLabel: "Spatial view of Lin's footprint",
  noMediaLabel: 'No photo attached',
  mediaUnavailableTitle: 'Photo unavailable',
  mediaUnavailableLabel: 'Showing the location instead.',
  retryMediaLabel: 'Retry photo',
};

describe('MomentFrame', () => {
  it('keeps intrinsic dimensions and builds responsive Cloudinary candidates', () => {
    render(
      <MomentFrame
        {...labels}
        authorName="Lin"
        displayPoint={{ lat: 31, lng: 121 }}
        media={{ url: 'https://res.cloudinary.com/bliver/image/upload/v42/bliver/moment.jpg', width: 1600, height: 900 }}
        publishedAt="2026-07-19T10:00:00.000Z"
        variant="stage"
      />,
    );

    const image = screen.getByRole('img', { name: labels.mediaAlt });
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveAttribute('decoding', 'async');
    expect(image).toHaveAttribute('width', '1600');
    expect(image).toHaveAttribute('height', '900');
    expect(image).toHaveAttribute('srcset');
    expect(image.getAttribute('srcset')).toContain('w_320');
    expect(image.getAttribute('srcset')).toContain('w_1600');
    expect(image).toHaveAttribute('sizes', '(max-width: 720px) 100vw, 65vw');
  });

  it('falls back to a data-driven spatial scene and can retry a failed image', () => {
    const onStateChange = vi.fn();
    render(
      <MomentFrame
        {...labels}
        authorName="Lin"
        displayPoint={{ lat: 31, lng: 121 }}
        media={{ url: 'https://res.cloudinary.com/bliver/image/upload/moment.jpg', width: 1200, height: 800 }}
        onMediaStateChange={onStateChange}
        showRetryOnError
        variant="detail"
      />,
    );

    const image = screen.getByRole('img', { name: labels.mediaAlt });
    fireEvent.error(image);

    expect(screen.queryByRole('img', { name: labels.mediaAlt })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: labels.spatialLabel })).toBeInTheDocument();
    expect(screen.getByText(labels.mediaUnavailableLabel)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: labels.retryMediaLabel })).toBeInTheDocument();
    expect(onStateChange).toHaveBeenCalledWith('error');

    fireEvent.click(screen.getByRole('button', { name: labels.retryMediaLabel }));
    expect(screen.getByRole('img', { name: labels.mediaAlt })).toBeInTheDocument();
    expect(onStateChange).toHaveBeenLastCalledWith('loading');
  });

  it('renders coordinate position from the footprint point when no media exists', () => {
    render(
      <MomentFrame
        {...labels}
        authorName="Aya"
        displayPoint={{ lat: 35.676, lng: 139.65 }}
        variant="lens"
      />,
    );

    const field = screen.getByRole('img', { name: labels.spatialLabel });
    expect(field).toHaveTextContent('35.676 / 139.650');
    expect(field.style.getPropertyValue('--moment-x')).toMatch(/^\d+(\.\d+)?%$/);
    expect(field.style.getPropertyValue('--moment-y')).toMatch(/^\d+(\.\d+)?%$/);
  });
});
