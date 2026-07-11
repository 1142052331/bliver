import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import NavBar from '../NavBar';
import App from '../../App';
import useShellStore from '../../store/useShellStore';

vi.mock('@sentry/react', () => ({ init: vi.fn(), browserTracingIntegration: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ setQueriesData: vi.fn() }) }));
vi.mock('leaflet', () => ({
  default: { Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } } },
}));
vi.mock('../../hooks/useAuth', () => ({
  default: () => ({
    user: null,
    setUser: vi.fn(),
    isAdmin: false,
    isAsen: false,
    requireLogin: vi.fn(() => false),
    logout: vi.fn(),
    pendingActionRef: { current: null },
  }),
}));
vi.mock('../../hooks/useNotifications', () => ({
  default: () => ({
    notifications: [], setNotifications: vi.fn(), appendNotification: vi.fn(),
    applyServerNotifications: vi.fn(), captureNotificationRequest: vi.fn(),
    clearNotifications: vi.fn(), unreadCount: 0, markFootprintRead: vi.fn(),
    handleNotifNavigate: vi.fn(),
  }),
  refetchNotifications: vi.fn(),
}));
vi.mock('../../hooks/useMapFootprints', () => ({
  default: () => ({
    data: { footprints: [] }, isLoading: false, isFetching: false,
    error: null, refetch: vi.fn(),
  }),
}));
vi.mock('../../hooks/useLocationContext', () => ({
  default: () => ({
    scopeContext: { scope: 'smart', reason: 'unresolved' },
    requestLocation: vi.fn(), setFixedScope: vi.fn(), clearFixedScope: vi.fn(),
  }),
}));
vi.mock('../../hooks/useLegacyReadImport', () => ({ default: vi.fn() }));
vi.mock('../../hooks/useSocket', () => ({ default: () => ({ socketRef: { current: null } }) }));
vi.mock('../../hooks/useFriends', () => ({
  default: () => ({
    friends: [], onlineStatus: {}, unreadCounts: {}, pendingRequests: [],
    friendshipStatus: vi.fn(), getPendingRequestId: vi.fn(), sendFriendRequest: vi.fn(),
    acceptRequest: vi.fn(), rejectRequest: vi.fn(), clearUnread: vi.fn(),
  }),
}));
vi.mock('../../hooks/useAnnounceUnread', () => ({ default: () => [false, vi.fn()] }));
vi.mock('../../hooks/useVisibilityRefresh', () => ({ default: vi.fn() }));
vi.mock('../../hooks/useChatFriendMeta', () => ({ default: () => null }));
vi.mock('../../push', () => ({ subscribeToPush: vi.fn(() => Promise.resolve()) }));
vi.mock('../MapView', () => ({ default: () => null }));
vi.mock('../MobileTopBar', () => ({ default: () => null }));
vi.mock('../shell/MobileTopBar', () => ({ default: () => null }));
vi.mock('../shell/BottomNavigation', () => ({ default: () => null }));
vi.mock('../shell/CheckInAction', () => ({ default: () => null }));
vi.mock('../shell/LegacyDestinationBridge', () => ({ default: () => null }));
vi.mock('../shell/AppShell', () => ({ default: ({ children }) => children }));
vi.mock('../AuthModal', () => ({ default: () => null }));
vi.mock('../CheckInModal', () => ({ default: () => null }));
vi.mock('../TimelineDrawer', () => ({ default: () => null }));
vi.mock('../NotificationPanel', () => ({ default: () => null }));
vi.mock('../AdminPanel', () => ({ default: () => null }));
vi.mock('../GlobalToaster', () => ({ default: () => null }));
vi.mock('../AboutModal', () => ({ default: () => null }));
vi.mock('../FeedbackModal', () => ({ default: () => null }));
vi.mock('../ProfileDrawer', () => ({ default: () => null }));
vi.mock('../FootprintDetailModal', () => ({ default: () => null }));
vi.mock('../MapPreviewCard', () => ({ default: () => null }));
vi.mock('../PhotoWall', () => ({ default: () => null }));
vi.mock('../AnnouncementPanel', () => ({ default: () => null }));
vi.mock('../FriendsPanel', () => ({ default: () => null }));
vi.mock('../ChatWindow', () => ({ default: () => null }));
vi.mock('../MessageIsland', () => ({ default: () => null }));
vi.mock('../ErrorBoundary', () => ({ default: ({ children }) => children }));
vi.mock('../../contexts/FootprintActionsContext', () => ({
  FootprintActionsProvider: ({ children }) => children,
}));
vi.mock('../../store/useUIStore', () => {
  const state = {
    samePlaceIds: [],
    openTimeline: vi.fn(), openPhotoWall: vi.fn(), openAbout: vi.fn(), openAuth: vi.fn(),
    closeSamePlace: vi.fn(), setMapPreviewId: vi.fn(),
  };
  const store = () => state;
  store.getState = () => state;
  return { default: store };
});

describe('map home visual contract', () => {
  it('uses Natural City styling for the desktop navigation', () => {
    const { container } = render(
      <NavBar onlineCount={0} user={null} onLogout={vi.fn()} unreadCount={0}
        announceHasUnread={false} friendUnreadCount={0} isAdmin={false} onCheckIn={vi.fn()} />,
    );
    const navigation = container.querySelector('nav');
    expect(navigation).toHaveClass('bliver-desktop-nav');
    expect(navigation).not.toHaveClass('ios-glass');
    expect(screen.getByRole('button', { name: '登录' })).not.toHaveClass('ios-primary');
  });

  it('uses shared desktop shortcut controls instead of black glass buttons', () => {
    useShellStore.setState(useShellStore.getInitialState(), true);
    render(<App />);
    for (const label of ['足迹记录', '照片墙']) {
      expect(screen.getByRole('button', { name: label })).toHaveClass('bliver-desktop-shortcut');
      expect(screen.getByRole('button', { name: label })).not.toHaveClass('aurora-btn-glass');
    }
  });

  it('hides the native search cancel control and keeps map actions touch-sized', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');
    expect(css).toMatch(
      /\.bliver-map-search__field input::-webkit-search-cancel-button\s*,\s*\.bliver-map-search__field input::-webkit-search-decoration\s*{[^}]*display:\s*none;/s,
    );
    expect(css).toMatch(/\.bliver-map-notice button\s*{[^}]*min-height:\s*44px;/s);
  });
});
