import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import MobileTopBar from '../MobileTopBar';

it('renders brand, interactive location, and notifications without a menu control', async () => {
  const user = userEvent.setup();
  const onBrandPress = vi.fn();
  const onLocationPress = vi.fn();
  const onNotificationsPress = vi.fn();

  const { container } = render(
    <MobileTopBar
      locationLabel="当前位置"
      onBrandPress={onBrandPress}
      onLocationPress={onLocationPress}
      onNotificationsPress={onNotificationsPress}
    />,
  );

  const brand = screen.getByRole('button', { name: '关于 Bliver' });
  const location = screen.getByRole('button', { name: '当前位置' });
  const notifications = screen.getByRole('button', { name: '通知' });

  expect(container.querySelectorAll('[data-shell-control]')).toHaveLength(3);
  expect(screen.queryByRole('button', { name: /菜单|menu/i })).not.toBeInTheDocument();

  await user.click(brand);
  await user.click(location);
  await user.click(notifications);

  expect(onBrandPress).toHaveBeenCalledTimes(1);
  expect(onLocationPress).toHaveBeenCalledTimes(1);
  expect(onNotificationsPress).toHaveBeenCalledTimes(1);
});

it('renders location as non-interactive text when no callback exists', () => {
  render(
    <MobileTopBar
      locationLabel="朋友范围"
      onBrandPress={() => {}}
      onNotificationsPress={() => {}}
    />,
  );

  expect(screen.getByText('朋友范围')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '朋友范围' })).not.toBeInTheDocument();
});

it.each([
  { unreadNotifications: 0, accessibleName: '通知', badge: null },
  { unreadNotifications: -1, accessibleName: '通知', badge: null },
  { unreadNotifications: Number.NaN, accessibleName: '通知', badge: null },
  { unreadNotifications: Number.POSITIVE_INFINITY, accessibleName: '通知', badge: null },
  { unreadNotifications: 1.5, accessibleName: '通知，1 条未读', badge: '1' },
  { unreadNotifications: 99, accessibleName: '通知，99 条未读', badge: '99' },
  { unreadNotifications: 100, accessibleName: '通知，100 条未读', badge: '99+' },
])(
  'normalizes unreadNotifications=$unreadNotifications for aria and badge output',
  ({ unreadNotifications, accessibleName, badge }) => {
    render(
      <MobileTopBar
        locationLabel="当前位置"
        unreadNotifications={unreadNotifications}
        onNotificationsPress={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: accessibleName })).toBeInTheDocument();
    if (badge === null) {
      expect(document.querySelector('.bliver-mobile-top-bar__badge')).not.toBeInTheDocument();
    } else {
      expect(screen.getByText(badge)).toBeInTheDocument();
    }
  },
);

it('uses mobile-only controls above the map and below modal layers', () => {
  const tokensCss = readFileSync(resolve(cwd(), 'src/styles/tokens.css'), 'utf8');

  expect(tokensCss).toMatch(/\.bliver-mobile-top-bar\s*{[^}]*z-index:\s*1110;/s);
  expect(tokensCss).toMatch(/\.bliver-mobile-top-bar__control[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/s);
  expect(tokensCss).toMatch(/@media \(min-width:\s*768px\)[\s\S]*\.bliver-mobile-top-bar[\s\S]*display:\s*none;/s);
  expect(tokensCss).not.toMatch(/\.bliver-mobile-top-bar[^}]*backdrop-filter:/s);
  expect(tokensCss).not.toMatch(/\.bliver-mobile-top-bar[^}]*filter:\s*blur/s);
});

it('uses the semantic danger color for notification badges', () => {
  const tokensCss = readFileSync(resolve(cwd(), 'src/styles/tokens.css'), 'utf8');
  const badgeBlock = tokensCss.match(/\.bliver-mobile-top-bar__badge\s*{([^}]*)}/s)?.[1] ?? '';

  expect(badgeBlock).toMatch(/background:\s*var\(--bliver-danger\);/);
  expect(badgeBlock).not.toMatch(/var\(--bliver-coral(?:-active)?\)/);
});

it('removes shell active transforms when reduced motion is requested', () => {
  const tokensCss = readFileSync(resolve(cwd(), 'src/styles/tokens.css'), 'utf8');
  const reducedMotionBlock = tokensCss.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{([\s\S]*)}\s*$/)?.[1] ?? '';

  expect(reducedMotionBlock).toMatch(/\.bliver-mobile-top-bar__control:active\s*{[^}]*transform:\s*none;/s);
  expect(reducedMotionBlock).toMatch(/\.bliver-check-in-action:active(?::not\(:disabled\))?\s*{[^}]*transform:\s*none;/s);
});


it('renders notifications as non-interactive when no callback exists', () => {
  const { container } = render(
    <MobileTopBar locationLabel="当前位置" unreadNotifications={3} />,
  );

  expect(screen.queryByRole('button', { name: /通知/ })).not.toBeInTheDocument();
  expect(container.querySelector('.bliver-mobile-top-bar__notifications--static')).not.toHaveAttribute('tabindex');
  expect(container.querySelectorAll('[data-shell-control]')).toHaveLength(0);
  expect(screen.getByText('3')).toBeInTheDocument();
});

it.each([null, '', '   '])(
  'normalizes locationLabel=%j for interactive and static output',
  (locationLabel) => {
    const { rerender } = render(
      <MobileTopBar locationLabel={locationLabel} onLocationPress={() => {}} />,
    );

    expect(screen.getByRole('button', { name: '当前位置' })).toBeInTheDocument();

    rerender(<MobileTopBar locationLabel={locationLabel} />);
    expect(screen.getByText('当前位置')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '当前位置' })).not.toBeInTheDocument();
  },
);

it('trims a valid location label for interactive and static output', () => {
  const { rerender } = render(
    <MobileTopBar locationLabel="  朋友范围  " onLocationPress={() => {}} />,
  );

  expect(screen.getByRole('button', { name: '朋友范围' })).toBeInTheDocument();

  rerender(<MobileTopBar locationLabel="  朋友范围  " />);
  expect(screen.getByText('朋友范围')).toBeInTheDocument();
});

it.each([true, '3', Symbol('unread'), {}, null])(
  'safely ignores unsupported unreadNotifications values',
  (unreadNotifications) => {
    render(
      <MobileTopBar
        locationLabel="当前位置"
        unreadNotifications={unreadNotifications}
        onNotificationsPress={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: '通知' })).toBeInTheDocument();
    expect(document.querySelector('.bliver-mobile-top-bar__badge')).not.toBeInTheDocument();
  },
);
