import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import AppShell from '../AppShell';

it('uses the Natural City shell contract', () => {
  const { container } = render(<AppShell><div>Map</div></AppShell>);
  const shell = container.firstChild;
  expect(shell).toHaveClass('bliver-shell');
  expect(shell).toHaveAttribute('data-design-system', 'natural-city');

  const content = container.querySelector('main.bliver-shell__content');
  expect(content).toBeInTheDocument();
  expect(content).toContainElement(screen.getByText('Map'));
});
