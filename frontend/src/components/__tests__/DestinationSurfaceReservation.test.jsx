import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import FriendsPanel from '../FriendsPanel';
import ProfileDrawer from '../ProfileDrawer';

vi.mock('../../hooks/useProfileData', () => ({
  default: () => ({
    profile: null,
    footprints: [],
    loading: true,
    uploadingBanner: false,
    editingName: false,
    savingProfile: false,
    isOwnProfile: false,
    totalReactions: 0,
    activeDays: 0,
  }),
}));

const friendsProps = {
  isOpen: true,
  onClose: vi.fn(),
  friends: [],
  onlineStatus: {},
  unreadCounts: {},
  onOpenProfile: vi.fn(),
  onOpenChat: vi.fn(),
};

const profileProps = {
  userId: 'user-1',
  onClose: vi.fn(),
  onLogout: vi.fn(),
  friendshipStatus: vi.fn(),
  onSendFriendRequest: vi.fn(),
  onAcceptRequest: vi.fn(),
  onRejectRequest: vi.fn(),
  onOpenChat: vi.fn(),
  onSelectFootprint: vi.fn(),
};

it.each([
  ['FriendsPanel', FriendsPanel, friendsProps],
  ['ProfileDrawer', ProfileDrawer, profileProps],
])('%s applies the reservation class only when requested', (_name, Component, props) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const renderComponent = (extra = {}) => (
    <QueryClientProvider client={queryClient}><Component {...props} {...extra} /></QueryClientProvider>
  );
  const { container, rerender } = render(renderComponent());
  expect(container.querySelector('.ios-panel')).not.toHaveClass('bliver-destination-surface');

  rerender(renderComponent({ reserveMobileNavigation: true }));
  expect(container.querySelector('.ios-panel')).toHaveClass('bliver-destination-surface');
});
