import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import CheckInAction from '../CheckInAction';

function hexToRelativeLuminance(hexColor) {
  const channels = hexColor.match(/[a-f\d]{2}/gi).map((channel) => Number.parseInt(channel, 16) / 255);
  const linearChannels = channels.map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));

  return (0.2126 * linearChannels[0]) + (0.7152 * linearChannels[1]) + (0.0722 * linearChannels[2]);
}

function getContrastRatio(firstColor, secondColor) {
  const firstLuminance = hexToRelativeLuminance(firstColor);
  const secondLuminance = hexToRelativeLuminance(secondColor);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

it('is an independent primary action with the publishing accessible name', async () => {
  const user = userEvent.setup();
  const onPress = vi.fn();
  render(<CheckInAction onPress={onPress} />);

  const button = screen.getByRole('button', { name: '发布足迹' });

  expect(button).toHaveTextContent('发布足迹');
  expect(button).toHaveAttribute('data-shell-control');
  expect(button.closest('nav')).toBeNull();

  await user.click(button);
  expect(onPress).toHaveBeenCalledTimes(1);
});

it('exposes native and accessible disabled states', async () => {
  const user = userEvent.setup();
  const onPress = vi.fn();
  render(<CheckInAction disabled onPress={onPress} />);

  const button = screen.getByRole('button', { name: '发布足迹' });

  expect(button).toBeDisabled();
  expect(button).toHaveAttribute('aria-disabled', 'true');
  await user.click(button);
  expect(onPress).not.toHaveBeenCalled();
});

it('uses the mobile shell positioning and visual contract', () => {
  const tokensCss = readFileSync(resolve(cwd(), 'src/styles/tokens.css'), 'utf8');

  expect(tokensCss).toMatch(/\.bliver-check-in-action\s*{[^}]*width:\s*56px;[^}]*height:\s*56px;/s);
  expect(tokensCss).toMatch(/\.bliver-check-in-action\s*{[^}]*bottom:\s*calc\(var\(--bliver-nav-height\) \+ var\(--bliver-safe-bottom\) \+ [^)]+\);/s);
  expect(tokensCss).toMatch(/\.bliver-check-in-action\s*{[^}]*background:\s*var\(--bliver-coral\);/s);
  expect(tokensCss).toMatch(/\.bliver-check-in-action\s*{[^}]*z-index:\s*1120;/s);
});


it('keeps coral primary-action colors readable with white text', () => {
  const tokensCss = readFileSync(resolve(cwd(), 'src/styles/tokens.css'), 'utf8');
  const coral = tokensCss.match(/--bliver-coral:\s*(#[a-f\d]{6});/i)?.[1];
  const coralActive = tokensCss.match(/--bliver-coral-active:\s*(#[a-f\d]{6});/i)?.[1];

  expect(coral).toBeDefined();
  expect(coralActive).toBeDefined();
  expect(getContrastRatio(coral, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  expect(getContrastRatio(coralActive, '#ffffff')).toBeGreaterThanOrEqual(4.5);
});
