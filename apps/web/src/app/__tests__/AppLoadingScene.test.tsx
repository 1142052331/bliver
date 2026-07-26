// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { AppLoadingScene } from '../AppLoadingScene.js';

afterEach(cleanup);

describe('AppLoadingScene', () => {
  it('announces one quiet loading status without status-scene decoration', () => {
    const { container } = render(<AppLoadingScene label="Loading session" />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading session');
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelector('.app-loading-scene__track')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(container.querySelector('.app-status-scene__atlas')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });
});
