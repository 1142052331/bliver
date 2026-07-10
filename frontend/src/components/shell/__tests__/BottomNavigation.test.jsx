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

it('reports the selected destination', async () => {
  const user = userEvent.setup();
  const onDestinationChange = vi.fn();
  render(<BottomNavigation activeDestination="map" onDestinationChange={onDestinationChange} />);

  await user.click(screen.getByRole('button', { name: '动态' }));

  expect(onDestinationChange).toHaveBeenCalledWith('activity');
});

it('announces unread messages and caps the visible badge', () => {
  render(
    <BottomNavigation
      activeDestination="messages"
      unreadMessages={125}
      onDestinationChange={() => {}}
    />,
  );

  expect(screen.getByRole('button', { name: '消息，125 条未读' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(screen.getByText('99+')).toBeInTheDocument();
});

it('marks every shell control for QA', () => {
  const { container } = render(
    <BottomNavigation activeDestination="profile" onDestinationChange={() => {}} />,
  );

  expect(container.querySelectorAll('[data-shell-control]')).toHaveLength(4);
});
