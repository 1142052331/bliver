import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import CheckInAction from '../CheckInAction';

it('is an independent primary action with the publishing accessible name', async () => {
  const user = userEvent.setup();
  const onPress = vi.fn();
  render(<CheckInAction onPress={onPress} />);

  const button = screen.getByRole('button', { name: '发布足迹' });

  expect(button).toHaveTextContent('打卡');
  expect(button.querySelector('.lucide-map-pin-plus')).toBeInTheDocument();
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
