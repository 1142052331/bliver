// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { BliverI18nProvider } from '../../../i18n/I18nProvider.js';
import { createBliverI18n } from '../../../i18n/i18n.js';
import { FootprintMoodMark } from '../FootprintMoodMark.js';
import { MomentFrame } from '../MomentFrame.js';

function renderMood(node: React.ReactNode) {
  return render(
    <BliverI18nProvider instance={createBliverI18n('en')}>
      {node}
    </BliverI18nProvider>,
  );
}

afterEach(cleanup);

describe('shared footprint mood presentation', () => {
  it('normalizes a legacy value before presenting a localized label', () => {
    const { container } = renderMood(<FootprintMoodMark mood="happy" />);

    expect(screen.getByText('Radiant')).toBeVisible();
    expect(container.querySelector('[data-footprint-mood="radiant"]')).toBeInTheDocument();
    expect(screen.queryByText('happy')).not.toBeInTheDocument();
  });

  it('degrades an unknown storage value to neutral without exposing the raw key', () => {
    const { container } = renderMood(<FootprintMoodMark mood="internal-mood-42" />);

    expect(container.firstElementChild).toBeNull();
    expect(screen.queryByText('internal-mood-42')).not.toBeInTheDocument();
  });

  it('carries a canonical mood into the media-free shared frame', () => {
    const { container } = renderMood(
      <MomentFrame
        authorName="Lin"
        mediaAlt=""
        mood="sad"
        spatialLabel="Spatial moment"
        variant="stage"
      />,
    );

    expect(container.querySelector('.moment-frame')).toHaveAttribute('data-mood-key', 'low');
    expect(screen.getByRole('img', { name: 'Spatial moment' })).toBeVisible();
  });
});
