import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import BottomNavigation from '../BottomNavigation';

it('renders exactly four top-level destinations', () => {
  render(<BottomNavigation activeDestination="map" onDestinationChange={() => {}} />);

  expect(screen.getByRole('navigation', { name: '主要导航' })).toBeInTheDocument();
  expect(screen.getAllByRole('button')).toHaveLength(4);
  expect(screen.getByRole('button', { name: '地图' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('button', { name: '动态' })).not.toHaveAttribute('aria-current');
  expect(screen.getByRole('button', { name: '消息' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '我的' })).toBeInTheDocument();
});

it('reports the exact destination contract for every item', async () => {
  const user = userEvent.setup();
  const onDestinationChange = vi.fn();
  render(<BottomNavigation activeDestination="map" onDestinationChange={onDestinationChange} />);

  await user.click(screen.getByRole('button', { name: '地图' }));
  await user.click(screen.getByRole('button', { name: '动态' }));
  await user.click(screen.getByRole('button', { name: '消息' }));
  await user.click(screen.getByRole('button', { name: '我的' }));

  expect(onDestinationChange.mock.calls).toEqual([
    ['map'],
    ['activity'],
    ['messages'],
    ['me'],
  ]);
});

it('selects the Me destination with the shared mobile contract', () => {
  render(<BottomNavigation activeDestination="me" onDestinationChange={() => {}} />);

  expect(screen.getByRole('button', { name: '我的' })).toHaveAttribute('aria-current', 'page');
});

it.each([
  { unreadMessages: 0, accessibleName: '消息', badge: null },
  { unreadMessages: -1, accessibleName: '消息', badge: null },
  { unreadMessages: Number.NaN, accessibleName: '消息', badge: null },
  { unreadMessages: Number.POSITIVE_INFINITY, accessibleName: '消息', badge: null },
  { unreadMessages: 1.5, accessibleName: '消息，1 条未读', badge: '1' },
  { unreadMessages: 99, accessibleName: '消息，99 条未读', badge: '99' },
  { unreadMessages: 100, accessibleName: '消息，100 条未读', badge: '99+' },
])(
  'normalizes unreadMessages=$unreadMessages for aria and badge output',
  ({ unreadMessages, accessibleName, badge }) => {
    render(
      <BottomNavigation
        activeDestination="messages"
        unreadMessages={unreadMessages}
        onDestinationChange={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: accessibleName })).toHaveAttribute(
      'aria-current',
      'page',
    );

    if (badge === null) {
      expect(document.querySelector('.bliver-bottom-navigation__badge')).not.toBeInTheDocument();
    } else {
      expect(screen.getByText(badge)).toBeInTheDocument();
    }
  },
);

it('marks every shell control for QA', () => {
  const { container } = render(
    <BottomNavigation activeDestination="me" onDestinationChange={() => {}} />,
  );

  expect(container.querySelectorAll('[data-shell-control]')).toHaveLength(4);
});

it('uses the base navigation layer by default', () => {
  render(<BottomNavigation activeDestination="map" onDestinationChange={() => {}} />);

  const navigation = screen.getByRole('navigation');
  expect(navigation).toHaveClass('bliver-bottom-navigation');
  expect(navigation).not.toHaveClass('bliver-bottom-navigation--destination');
  expect(navigation).not.toHaveClass('bliver-bottom-navigation--destination-auth');
});

it.each([
  ['destination', 'bliver-bottom-navigation--destination'],
  ['destination-auth', 'bliver-bottom-navigation--destination-auth'],
])('applies the %s layer modifier', (layer, modifierClass) => {
  render(
    <BottomNavigation
      activeDestination="map"
      layer={layer}
      onDestinationChange={() => {}}
    />,
  );

  expect(screen.getByRole('navigation')).toHaveClass(modifierClass);
});

it('falls back to the exact base class for an unknown layer', () => {
  render(
    <BottomNavigation
      activeDestination="map"
      layer="unexpected"
      onDestinationChange={() => {}}
    />,
  );

  expect(screen.getByRole('navigation')).toHaveClass('bliver-bottom-navigation', { exact: true });
});

it('uses the approved navigation layer scale', () => {
  const tokensCss = readFileSync(resolve(cwd(), 'src/styles/tokens.css'), 'utf8');
  const mobileRules = tokensCss.slice(
    tokensCss.indexOf('@media (max-width: 767px)'),
    tokensCss.indexOf('@media (min-width: 768px)'),
  );

  expect(tokensCss).toMatch(/\.bliver-bottom-navigation\s*{[^}]*z-index:\s*1100;/s);
  expect(tokensCss).toMatch(
    /\.bliver-bottom-navigation--destination\s*{[^}]*z-index:\s*2600;/s,
  );
  expect(tokensCss).toMatch(
    /\.bliver-bottom-navigation--destination-auth\s*{[^}]*z-index:\s*3100;/s,
  );
  expect(mobileRules).toMatch(
    /\.bliver-shell \.bliver-destination-surface\s*{[^}]*padding-bottom:\s*calc\(var\(--bliver-nav-height\) \+ var\(--bliver-safe-bottom\)\);/s,
  );
  expect(mobileRules).toMatch(
    /\.bliver-shell \.bliver-destination-auth-surface\s*{[^}]*padding-bottom:\s*calc\(var\(--bliver-nav-height\) \+ var\(--bliver-safe-bottom\) \+ 0\.75rem\)\s*!important;/s,
  );
  expect(mobileRules).toMatch(
    /\.bliver-shell \.bliver-destination-auth-surface > div > \.ios-panel\s*{[^}]*max-height:\s*calc\(100dvh - var\(--bliver-nav-height\) - var\(--bliver-safe-bottom\) - 1\.5rem\)\s*!important;/s,
  );
});
