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

  expect(tokensCss).toMatch(/--bliver-space-sm:\s*8px;/);
  expect(attributionBlock).toMatch(/margin-bottom:\s*calc\(var\(--bliver-nav-height\)\s*\+\s*var\(--bliver-safe-bottom\)\s*\+\s*var\(--bliver-space-sm\)\);/);
});

it('uses zoomable warm-paper Natural City PWA metadata', () => {
  const indexHtml = readFileSync(resolve(cwd(), 'index.html'), 'utf8');
  const indexDocument = new DOMParser().parseFromString(indexHtml, 'text/html');
  const viewport = indexDocument.querySelector('meta[name="viewport"]');

  expect(viewport?.getAttribute('content')).toBe('width=device-width, initial-scale=1.0, viewport-fit=cover');
  expect(viewport?.getAttribute('content')).not.toMatch(/maximum-scale|minimum-scale|user-scalable/);
  expect(indexDocument.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#FAF8F3');
  expect(indexDocument.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.getAttribute('content')).toBe('default');

  const manifest = JSON.parse(readFileSync(resolve(cwd(), 'public/manifest.json'), 'utf8'));
  expect(manifest).toMatchObject({
    theme_color: '#FAF8F3',
    background_color: '#FAF8F3',
  });
});

it('keeps accessible coral action tokens synchronized with DESIGN.md', () => {
  const tokensCss = readFileSync(resolve(cwd(), 'src/styles/tokens.css'), 'utf8');
  const designDoc = readFileSync(resolve(cwd(), '../DESIGN.md'), 'utf8');

  expect(tokensCss).toMatch(/--bliver-coral:\s*#c54b36;/i);
  expect(tokensCss).toMatch(/--bliver-coral-active:\s*#ad3d2d;/i);
  expect(designDoc).toMatch(/^\s{2}coral: "#C54B36"\r?$/m);
  expect(designDoc).toMatch(/^\s{2}coral-active: "#AD3D2D"\r?$/m);
  expect(designDoc).toMatch(/white text[^.\r\n]*WCAG AA/i);
});
