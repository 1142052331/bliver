import { render } from '@testing-library/react';
import AppShell from '../AppShell';

it('uses the Natural City shell contract', () => {
  const { container } = render(<AppShell><div>Map</div></AppShell>);
  const shell = container.firstChild;
  expect(shell).toHaveClass('bliver-shell');
  expect(shell).toHaveAttribute('data-design-system', 'natural-city');
});
