import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import useShellStore from '../store/useShellStore';

const mocks = vi.hoisted(() => ({
  user: null,
  requireLogin: vi.fn(() => false),
  logout: vi.fn(),
  clearNotifications: vi.fn(),
  openCheckIn: vi.fn(),
  openTimeline: vi.fn(),
  openFriends: vi.fn(),
  openProfile: vi.fn(),
  openAuth: vi.fn(),
  openAbout: vi.fn(),
  toggleNotifs: vi.fn(),
}));

const uiState = vi.hoisted(() => ({
  showCheckIn: false,
  showTimeline: false,
  showNotifs: false,
  showAdmin: false,
  showAuth: false,
  showPhotoWall: false,
  showAbout: false,
  showFeedback: false,
  showAnnouncements: false,
  showFriends: false,
  chatUserId: null,
  viewingProfileId: null,
  authTab: 'login',
  authMessage: '',
  shareTarget: null,
  clusterData: null,
  activeFootprintId: null,
  flyArrivedFp: null,
  timelineTargetFpId: null,
  openCheckIn: mocks.openCheckIn,
  closeCheckIn: vi.fn(),
  openTimeline: mocks.openTimeline,
  closeTimeline: vi.fn(),
  toggleNotifs: mocks.toggleNotifs,
  closeNotifs: vi.fn(),
  openAdmin: vi.fn(),
  closeAdmin: vi.fn(),
  openAuth: mocks.openAuth,
  closeAuth: vi.fn(),
  openPhotoWall: vi.fn(),
  closePhotoWall: vi.fn(),
  openAbout: mocks.openAbout,
  closeAbout: vi.fn(),
  openFeedback: vi.fn(),
  closeFeedback: vi.fn(),
  openAnnouncements: vi.fn(),
  closeAnnouncements: vi.fn(),
  openFriends: mocks.openFriends,
  closeFriends: vi.fn(),
  setActiveFootprintId: vi.fn(),
  setFlyArrivedFp: vi.fn(),
  setTimelineTargetFpId: vi.fn(),
  setClusterData: vi.fn(),
  setShareTarget: vi.fn(),
  openChat: vi.fn(),
  closeChat: vi.fn(),
  openProfile: mocks.openProfile,
  closeProfile: vi.fn(),
  setAuthTab: vi.fn(),
  setAuthMessage: vi.fn(),
  messageIsland: null,
  setMessageIsland: vi.fn(),
  clearMessageIsland: vi.fn(),
  pendingCheckInLocation: null,
  setPendingCheckInLocation: vi.fn(),
  addToast: vi.fn(),
  dismissToastByType: vi.fn(),
}));

vi.mock('@sentry/react', () => ({ init: vi.fn(), browserTracingIntegration: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ setQueryData: vi.fn() }) }));
vi.mock('leaflet', () => ({
  default: { Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } } },
}));

vi.mock('../hooks/useAuth', () => ({
  default: () => ({
    user: mocks.user,
    setUser: vi.fn(),
    isAdmin: false,
    isAsen: false,
    requireLogin: mocks.requireLogin,
    logout: mocks.logout,
    pendingActionRef: { current: null },
  }),
}));
vi.mock('../hooks/useNotifications', () => ({
  default: () => ({
    notifications: [],
    setNotifications: vi.fn(),
    clearNotifications: mocks.clearNotifications,
    unreadCount: 3,
    markFootprintRead: vi.fn(),
    handleNotifNavigate: vi.fn(),
  }),
  refetchNotifications: vi.fn(),
}));
vi.mock('../hooks/useFootprints', () => ({
  default: () => ({ data: [], isLoading: false, refetch: vi.fn() }),
}));
vi.mock('../hooks/useSocket', () => ({ default: () => ({ socketRef: { current: null } }) }));
vi.mock('../hooks/useFriends', () => ({
  default: () => ({
    friends: [],
    onlineStatus: {},
    unreadCounts: { friend: 2 },
    pendingRequests: [],
    friendshipStatus: vi.fn(),
    getPendingRequestId: vi.fn(),
    sendFriendRequest: vi.fn(),
    acceptRequest: vi.fn(),
    rejectRequest: vi.fn(),
    clearUnread: vi.fn(),
  }),
}));
vi.mock('../hooks/useAnnounceUnread', () => ({ default: () => [false, vi.fn()] }));
vi.mock('../hooks/useVisibilityRefresh', () => ({ default: vi.fn() }));
vi.mock('../hooks/useChatFriendMeta', () => ({ default: () => null }));
vi.mock('../push', () => ({ subscribeToPush: vi.fn(() => Promise.resolve()) }));

vi.mock('../store/useUIStore', () => {
  const useUIStore = () => uiState;
  useUIStore.getState = () => uiState;
  return { default: useUIStore };
});

vi.mock('../components/MapView', () => ({ default: () => <div data-testid="map-view" /> }));
vi.mock('../components/NavBar', () => ({
  default: ({ onLogout }) => (
    <div data-testid="desktop-nav">
      <button type="button" onClick={onLogout}>Desktop logout</button>
    </div>
  ),
}));
vi.mock('../components/MobileActionDrawer', () => ({
  default: () => <button type="button" aria-label="菜单">菜单</button>,
}));
vi.mock('../components/AuthModal', () => ({ default: () => null }));
vi.mock('../components/CheckInModal', () => ({ default: () => null }));
vi.mock('../components/TimelineDrawer', () => ({ default: () => null }));
vi.mock('../components/ClusterDetailPanel', () => ({ default: () => null }));
vi.mock('../components/NotificationPanel', () => ({ default: () => null }));
vi.mock('../components/AdminPanel', () => ({ default: () => null }));
vi.mock('../components/GlobalToaster', () => ({ default: () => null }));
vi.mock('../components/AboutModal', () => ({ default: () => null }));
vi.mock('../components/FeedbackModal', () => ({ default: () => null }));
vi.mock('../components/ProfileDrawer', () => ({ default: () => null }));
vi.mock('../components/FootprintDetailModal', () => ({ default: () => null }));
vi.mock('../components/PhotoWall', () => ({ default: () => null }));
vi.mock('../components/AnnouncementPanel', () => ({ default: () => null }));
vi.mock('../components/FriendsPanel', () => ({ default: () => null }));
vi.mock('../components/ChatWindow', () => ({ default: () => null }));
vi.mock('../components/MessageIsland', () => ({ default: () => null }));
vi.mock('../components/ErrorBoundary', () => ({ default: ({ children }) => children }));
vi.mock('../contexts/FootprintActionsContext', () => ({
  FootprintActionsProvider: ({ children }) => children,
}));

describe('App mobile shell integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = null;
    mocks.requireLogin.mockReturnValue(false);
    useShellStore.setState(useShellStore.getInitialState(), true);
  });

  it('renders the natural-city shell without legacy mobile controls', () => {
    const { container } = render(<App />);

    expect(screen.getByRole('navigation', { name: '主要导航' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发布足迹' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '菜单' })).not.toBeInTheDocument();
    expect(screen.getByTestId('map-view')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '主要导航' }).closest('main')).toBeNull();
    expect(screen.getByRole('button', { name: '发布足迹' }).closest('main')).toBeNull();
    expect(container.querySelector('.ios-app-shell')).not.toHaveStyle({ touchAction: 'none' });
  });

  it('opens the existing Timeline action from activity', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '动态' }));

    await waitFor(() => expect(mocks.openTimeline).toHaveBeenCalledTimes(1));
  });

  it('guards guest check-in without opening the form', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '发布足迹' }));

    expect(mocks.requireLogin).toHaveBeenCalledWith({ type: 'checkin' });
    expect(mocks.openCheckIn).not.toHaveBeenCalled();
  });

  it.each([
    ['消息', '登录后查看消息'],
    ['我的', '登录后查看个人主页'],
  ])('requests login for guest destination %s', async (destination, message) => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: new RegExp('^' + destination) }));

    await waitFor(() => expect(mocks.openAuth).toHaveBeenCalledWith('login', message));
  });

  it('routes authenticated messages and me through existing surfaces', async () => {
    const user = userEvent.setup();
    mocks.user = { _id: 'user-1' };
    render(<App />);

    await user.click(screen.getByRole('button', { name: /^消息/ }));
    await waitFor(() => expect(mocks.openFriends).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: '我的' }));
    await waitFor(() => expect(mocks.openProfile).toHaveBeenCalledWith('user-1'));
  });

  it('opens About from the brand control', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '关于 Bliver' }));

    expect(mocks.openAbout).toHaveBeenCalledTimes(1);
  });

  it('clears notification state when logging out', async () => {
    const user = userEvent.setup();
    mocks.user = { _id: 'user-1' };
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Desktop logout' }));

    expect(mocks.logout).toHaveBeenCalledTimes(1);
    expect(mocks.clearNotifications).toHaveBeenCalledTimes(1);
  });

  it('opens notifications through the existing UI action', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '通知，3 条未读' }));

    expect(mocks.toggleNotifs).toHaveBeenCalledTimes(1);
  });
});
