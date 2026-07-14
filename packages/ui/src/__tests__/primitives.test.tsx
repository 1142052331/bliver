// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button, Surface } from '../index.js';

describe('Natural City primitives', () => {
  it('renders a native button with a stable accessible target', () => {
    render(<Button>Publish footprint</Button>);

    const button = screen.getByRole('button', { name: 'Publish footprint' });
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveStyle({ minHeight: '44px' });
  });

  it('forwards the disabled state to the native control', () => {
    render(<Button disabled>Unavailable</Button>);

    expect(screen.getByRole('button', { name: 'Unavailable' })).toBeDisabled();
  });

  it('renders semantic content without feature state', () => {
    render(
      <Surface aria-label="Memory summary">
        <h2>Memory summary</h2>
      </Surface>,
    );

    expect(
      screen.getByRole('region', { name: 'Memory summary' }),
    ).toContainElement(
      screen.getByRole('heading', { name: 'Memory summary', level: 2 }),
    );
  });
});
