import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
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

it('keeps Leaflet attribution above the mobile navigation', () => {
  const tokensCss = readFileSync(resolve(cwd(), 'src/styles/tokens.css'), 'utf8');
  const mobileBlock = tokensCss.match(/@media\s*\(max-width:\s*767px\)\s*{([\s\S]*?)}\s*@media\s*\(min-width:/)?.[1] ?? '';
  const attributionBlock = mobileBlock.match(/\.bliver-shell\s+\.leaflet-container\s+\.leaflet-control-attribution\s*{([^}]*)}/s)?.[1] ?? '';

  expect(attributionBlock).toMatch(/margin-bottom:\s*calc\(var\(--bliver-nav-height\)\s*\+\s*var\(--bliver-safe-bottom\)\);/);
});
