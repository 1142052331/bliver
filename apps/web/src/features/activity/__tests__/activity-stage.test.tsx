// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { FootprintDto } from '@bliver/contracts';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BliverI18nProvider } from '../../../i18n/I18nProvider.js';
import { createBliverI18n } from '../../../i18n/i18n.js';
import { ActivityRoute } from '../ActivityRoute.js';

const first: FootprintDto = {
  id: '019f0000-0000-7000-8000-000000000001',
  author: { id: '019f0000-0000-7000-8000-000000000002', name: 'Lin' },
  displayPoint: { lat: 31, lng: 121 },
  visibility: 'public',
  locationPrecision: 'approximate',
  message: 'By the river',
  mood: 'calm',
  publishedAt: '2026-07-15T08:00:00.000Z',
};

const second: FootprintDto = {
  ...first,
  id: '019f0000-0000-7000-8000-000000000003',
  author: { id: '019f0000-0000-7000-8000-000000000004', name: 'Aya' },
  displayPoint: { lat: 35.676, lng: 139.65 },
  message: 'Second moment',
};

function renderActivity(node: ReactNode) {
  const i18n = createBliverI18n('en');
  return render(
    <BliverI18nProvider instance={i18n}>
      <MemoryRouter>{node}</MemoryRouter>
    </BliverI18nProvider>,
  );
}

function stagePanel(container: HTMLElement, id: string): HTMLElement {
  const panel = container.querySelector<HTMLElement>(`[data-stage-id="${id}"]`);
  if (!panel) throw new Error(`Missing activity stage panel ${id}`);
  return panel;
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

describe('Activity single stage and moment strip', () => {
  it('selects the first moment and exposes only its stage by default', () => {
    const { container } = renderActivity(
      <ActivityRoute page={{ items: [first, second], resolvedScope: 'global' }} />,
    );

    expect(screen.getByRole('button', { name: 'Focus moment 1 of 2 by Lin' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Focus moment 1 of 2 by Lin' })).toHaveAttribute('data-mood-key', 'calm');
    expect(screen.getByRole('button', { name: 'Focus moment 1 of 2 by Lin' })).toHaveStyle({
      '--footprint-mood-surface': '#e4efea',
      '--footprint-mood-ink': '#28584d',
    });
    expect(screen.getByRole('button', { name: 'Focus moment 2 of 2 by Aya' })).toHaveAttribute('aria-pressed', 'false');
    expect(stagePanel(container, first.id)).toHaveAttribute('aria-hidden', 'false');
    expect(stagePanel(container, second.id)).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('.activity-stage__panel.is-active')).toHaveLength(1);
  });

  it('changes the selected stage by click and keyboard navigation', () => {
    const { container } = renderActivity(
      <ActivityRoute page={{ items: [first, second], resolvedScope: 'global' }} />,
    );
    const firstTrigger = screen.getByRole('button', { name: 'Focus moment 1 of 2 by Lin' });
    const secondTrigger = screen.getByRole('button', { name: 'Focus moment 2 of 2 by Aya' });

    fireEvent.click(secondTrigger);
    expect(secondTrigger).toHaveAttribute('aria-pressed', 'true');
    expect(stagePanel(container, second.id)).toHaveAttribute('aria-hidden', 'false');

    secondTrigger.focus();
    fireEvent.keyDown(secondTrigger, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(firstTrigger);
    expect(firstTrigger).toHaveAttribute('aria-pressed', 'true');
    expect(stagePanel(container, first.id)).toHaveAttribute('aria-hidden', 'false');
    expect(stagePanel(container, second.id)).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps search quiet until requested and focuses the revealed field', () => {
    renderActivity(
      <ActivityRoute page={{ items: [first, second], resolvedScope: 'global' }} />,
    );

    expect(screen.queryByRole('searchbox', { name: 'Search moments' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Search moments' }));
    expect(screen.getByRole('searchbox', { name: 'Search moments' })).toBeInTheDocument();
  });

  it('moves to the adjacent moment after a horizontal stage drag', () => {
    const { container } = renderActivity(
      <ActivityRoute page={{ items: [first, second], resolvedScope: 'global' }} />,
    );
    const scene = container.querySelector<HTMLElement>('.activity-stage__panel.is-active .activity-scene');
    if (!scene) throw new Error('Missing active activity scene');

    fireEvent.pointerDown(scene, { clientX: 280, clientY: 180 });
    fireEvent.pointerUp(scene, { clientX: 180, clientY: 184 });

    expect(screen.getByRole('button', { name: 'Focus moment 2 of 2 by Aya' })).toHaveAttribute('aria-pressed', 'true');
    expect(stagePanel(container, second.id)).toHaveAttribute('aria-hidden', 'false');
  });

  it('renders an authorized primary image with intrinsic dimensions and localized alt text', () => {
    const mediaItem: FootprintDto = {
      ...first,
      primaryMedia: {
        url: 'https://res.cloudinary.com/bliver/image/upload/sample.jpg',
        width: 1600,
        height: 900,
      },
    };
    renderActivity(<ActivityRoute page={{ items: [mediaItem], resolvedScope: 'global' }} />);

    const image = screen.getByRole('img', { name: 'Footprint photo shared by Lin' });
    expect(image).toHaveAttribute('src', mediaItem.primaryMedia?.url);
    expect(image).toHaveAttribute('width', '1600');
    expect(image).toHaveAttribute('height', '900');
  });

  it('uses the spatial coordinate scene when a moment has no authorized media', () => {
    const { container } = renderActivity(
      <ActivityRoute page={{ items: [first], resolvedScope: 'global' }} />,
    );

    const fallback = screen.getByRole('img', { name: "Spatial coordinate view of Lin's footprint" });
    expect(fallback).toBeVisible();
    expect(within(fallback).getByText('31.000 / 121.000')).toBeInTheDocument();
    expect(fallback.closest('.activity-scene')).toHaveClass('activity-scene--spatial');
    expect(fallback.closest('.moment-frame')).toHaveAttribute('data-mood-key', 'calm');
    expect(container.querySelector('.activity-card__meta-actions [data-footprint-mood="calm"]')).toBeInTheDocument();
    expect(container.querySelector('.activity-scene img')).not.toBeInTheDocument();
  });

  it('preserves an in-progress interaction when switching away and back', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ items: [] }),
    } as Response));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderActivity(
      <ActivityRoute page={{ items: [first, second], resolvedScope: 'global' }} />,
    );
    const firstPanel = stagePanel(container, first.id);

    fireEvent.click(within(firstPanel).getByRole('button', { name: 'Comment' }));
    const draft = within(firstPanel).getByLabelText('Comment');
    fireEvent.change(draft, { target: { value: 'Keep this draft' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole('button', { name: 'Focus moment 2 of 2 by Aya' }));
    expect(firstPanel).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Focus moment 1 of 2 by Lin' }));

    expect(firstPanel).toHaveAttribute('aria-hidden', 'false');
    expect(within(firstPanel).getByLabelText('Comment')).toHaveValue('Keep this draft');
  });
});
