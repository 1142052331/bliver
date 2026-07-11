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
  closeTimeline: vi.fn(),
  openFriends: vi.fn(),
  closeFriends: vi.fn(),
  openProfile: vi.fn(),
  closeProfile: vi.fn(),
  openAuth: vi.fn(),
  closeAuth: vi.fn(),
  openAbout: vi.fn(),
  toggleNotifs: vi.fn(),
  authModalProps: vi.fn(),
  timelineDrawerProps: vi.fn(),
  friendsPanelProps: vi.fn(),
  profileDrawerProps: vi.fn(),
  mapPreviewProps: vi.fn(),
  footprints: [],
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
  mapPreviewId: null,
  flyArrivedFp: null,
  timelineTargetFpId: null,
  openCheckIn: mocks.openCheckIn,
  closeCheckIn: vi.fn(),
  openTimeline: mocks.openTimeline,
  closeTimeline: mocks.closeTimeline,
  toggleNotifs: mocks.toggleNotifs,
  closeNotifs: vi.fn(),
  openAdmin: vi.fn(),
  closeAdmin: vi.fn(),
  openAuth: mocks.openAuth,
  closeAuth: mocks.closeAuth,
  openPhotoWall: vi.fn(),
  closePhotoWall: vi.fn(),
  openAbout: mocks.openAbout,
  closeAbout: vi.fn(),
  openFeedback: vi.fn(),
  closeFeedback: vi.fn(),
  openAnnouncements: vi.fn(),
  closeAnnouncements: vi.fn(),
  openFriends: mocks.openFriends,
  closeFriends: mocks.closeFriends,
  setActiveFootprintId: vi.fn(),
  setMapPreviewId: vi.fn(),
  setFlyArrivedFp: vi.fn(),
  setTimelineTargetFpId: vi.fn(),
  setClusterData: vi.fn(),
  setShareTarget: vi.fn(),
  openChat: vi.fn(),
  closeChat: vi.fn(),
  openProfile: mocks.openProfile,
  closeProfile: mocks.closeProfile,
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
    appendNotification: vi.fn(),
    applyServerNotifications: vi.fn(),
    clearNotifications: mocks.clearNotifications,
    unreadCount: 3,
    markFootprintRead: vi.fn(),
    handleNotifNavigate: vi.fn(),
  }),
  refetchNotifications: vi.fn(),
}));
vi.mock('../hooks/useFootprints', () => ({
  default: () => ({ data: mocks.footprints, isLoading: false, error: null, refetch: vi.fn() }),
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
vi.mock('../components/AuthModal', () => ({
  default: (props) => {
    mocks.authModalProps(props.reserveMobileNavigation);
    return (
      <div>
        <button type="button" onClick={props.onClose}>Close auth surface</button>
        <button type="button" onClick={() => props.onDone({ _id: 'signed-in-user' })}>Complete auth</button>
      </div>
    );
  },
}));
vi.mock('../components/CheckInModal', () => ({ default: () => null }));
vi.mock('../components/TimelineDrawer', () => ({
  default: (props) => {
    mocks.timelineDrawerProps(props.reserveMobileNavigation);
    return props.isOpen
      ? <button type="button" onClick={props.onClose}>Close timeline surface</button>
      : null;
  },
}));
vi.mock('../components/ClusterDetailPanel', () => ({ default: () => null }));
vi.mock('../components/NotificationPanel', () => ({ default: () => null }));
vi.mock('../components/AdminPanel', () => ({ default: () => null }));
vi.mock('../components/GlobalToaster', () => ({ default: () => null }));
vi.mock('../components/AboutModal', () => ({ default: () => null }));
vi.mock('../components/FeedbackModal', () => ({ default: () => null }));
vi.mock('../components/ProfileDrawer', () => ({
  default: (props) => {
    mocks.profileDrawerProps(props.reserveMobileNavigation);
    return <button type="button" onClick={props.onClose}>Close profile surface</button>;
  },
}));
vi.mock('../components/FootprintDetailModal', () => ({ default: () => null }));
vi.mock('../components/MapPreviewCard', () => ({
  default: (props) => {
    mocks.mapPreviewProps(props);
    return props.footprint
      ? <button type="button" onClick={props.onOpenDetail}>Open selected footprint</button>
      : null;
  },
}));
vi.mock('../components/PhotoWall', () => ({ default: () => null }));
vi.mock('../components/AnnouncementPanel', () => ({ default: () => null }));
vi.mock('../components/FriendsPanel', () => ({
  default: (props) => {
    mocks.friendsPanelProps(props.reserveMobileNavigation);
    return <button type="button" onClick={props.onClose}>Close friends surface</button>;
  },
}));
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
    uiState.showAuth = false;
    uiState.showFriends = false;
    uiState.showTimeline = false;
    uiState.viewingProfileId = null;
    uiState.mapPreviewId = null;
    mocks.footprints = [];
    useShellStore.setState(useShellStore.getInitialState(), true);
  });

  it('routes a selected map footprint through preview before detail', async () => {
    const user = userEvent.setup();
    const selected = { _id: 'fp-1', userId: { _id: 'u-1' } };
    mocks.footprints = [selected];
    uiState.mapPreviewId = selected._id;

    render(<App />);

    expect(mocks.mapPreviewProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ footprint: selected }),
    );
    await user.click(screen.getByRole('button', { name: 'Open selected footprint' }));
    expect(uiState.setMapPreviewId).toHaveBeenCalledWith(null);
    expect(uiState.setFlyArrivedFp).toHaveBeenCalledWith(selected);
  });

  it('renders the natural-city shell without legacy mobile controls', () => {
    const { container } = render(<App />);

    expect(screen.getByRole('navigation', { name: '主要导航' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发布足迹' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '菜单' })).not.toBeInTheDocument();
    expect(screen.getByTestId('map-view')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '主要导航' }).closest('main')).toBeNull();
    expect(screen.getByRole('button', { name: '发布足迹' }).closest('main')).toBeNull();
    const mapLayer = container.querySelector('.ios-map-overlay');
    expect(mapLayer).toHaveClass('absolute', 'inset-0');
    expect(mapLayer).not.toHaveClass('fixed', 'overflow-hidden');
    expect(mapLayer).not.toHaveStyle({ touchAction: 'none' });
  });

  it.each([
    ['Timeline', 'activity', null, 'showTimeline', true, mocks.timelineDrawerProps],
    ['Friends', 'messages', { _id: 'user-1' }, 'showFriends', true, mocks.friendsPanelProps],
    ['Profile', 'me', { _id: 'user-1' }, 'viewingProfileId', 'user-1', mocks.profileDrawerProps],
  ])(
    'raises bottom navigation above the %s destination surface',
    (_surface, destination, currentUser, stateKey, stateValue, surfaceProps) => {
      mocks.user = currentUser;
      uiState[stateKey] = stateValue;
      useShellStore.setState({ activeDestination: destination });

      render(<App />);

      expect(screen.getByRole('navigation')).toHaveClass(
        'bliver-bottom-navigation--destination',
      );
      expect(surfaceProps).toHaveBeenLastCalledWith(true);
    },
  );

  it.each(['messages', 'me'])(
    'raises bottom navigation above destination-owned Auth for guest %s',
    (destination) => {
      uiState.showAuth = true;
      useShellStore.setState({ activeDestination: destination });

      render(<App />);

      expect(screen.getByRole('navigation')).toHaveClass(
        'bliver-bottom-navigation--destination-auth',
      );
      expect(mocks.authModalProps).toHaveBeenLastCalledWith(true);
    },
  );

  it('keeps bottom navigation at the base layer for Map Auth', () => {
    uiState.showAuth = true;

    render(<App />);

    const navigation = screen.getByRole('navigation');
    expect(navigation).not.toHaveClass('bliver-bottom-navigation--destination');
    expect(navigation).not.toHaveClass('bliver-bottom-navigation--destination-auth');
    expect(mocks.authModalProps).toHaveBeenLastCalledWith(false);
  });

  it('keeps bottom navigation below secondary Auth over a destination surface', () => {
    uiState.showTimeline = true;
    uiState.showAuth = true;
    useShellStore.setState({ activeDestination: 'activity' });

    render(<App />);

    const navigation = screen.getByRole('navigation');
    expect(navigation).toHaveClass('bliver-bottom-navigation--destination');
    expect(navigation).not.toHaveClass('bliver-bottom-navigation--destination-auth');
    expect(mocks.timelineDrawerProps).toHaveBeenLastCalledWith(true);
    expect(mocks.authModalProps).toHaveBeenLastCalledWith(false);
  });

  it('keeps Activity current until the Timeline surface closes', async () => {
    const user = userEvent.setup();
    uiState.showTimeline = true;
    render(<App />);

    const mapDestination = screen.getByRole('button', { name: '地图' });
    const activityDestination = screen.getByRole('button', { name: '动态' });
    await user.click(activityDestination);

    await waitFor(() => expect(mocks.openTimeline).toHaveBeenCalledTimes(1));
    expect(activityDestination).toHaveAttribute('aria-current', 'page');
    expect(mapDestination).not.toHaveAttribute('aria-current');

    await user.click(screen.getByRole('button', { name: 'Close timeline surface' }));

    expect(mapDestination).toHaveAttribute('aria-current', 'page');
    expect(activityDestination).not.toHaveAttribute('aria-current');
  });

  it.each([
    ['Timeline', 'activity', null, 'showTimeline', true, mocks.closeTimeline, '动态'],
    ['Friends', 'messages', { _id: 'user-1' }, 'showFriends', true, mocks.closeFriends, /^消息/],
    ['Profile', 'me', { _id: 'user-1' }, 'viewingProfileId', 'user-1', mocks.closeProfile, '我的'],
    ['Auth', 'messages', null, 'showAuth', true, mocks.closeAuth, /^消息/],
  ])(
    'closes the open %s destination surface before returning to Map',
    async (_surface, destination, currentUser, stateKey, stateValue, closeAction, destinationName) => {
      const user = userEvent.setup();
      mocks.user = currentUser;
      uiState[stateKey] = stateValue;
      useShellStore.setState({ activeDestination: destination });
      render(<App />);

      const mapDestination = screen.getByRole('button', { name: '地图' });
      const currentDestination = screen.getByRole('button', { name: destinationName });
      expect(currentDestination).toHaveAttribute('aria-current', 'page');

      await user.click(mapDestination);

      expect(closeAction).toHaveBeenCalledTimes(1);
      expect(mapDestination).toHaveAttribute('aria-current', 'page');
      expect(currentDestination).not.toHaveAttribute('aria-current');
    },
  );

  it('closes Timeline before opening Messages', async () => {
    const user = userEvent.setup();
    mocks.user = { _id: 'user-1' };
    uiState.showTimeline = true;
    useShellStore.setState({ activeDestination: 'activity' });
    render(<App />);

    await waitFor(() => expect(mocks.openTimeline).toHaveBeenCalledTimes(1));
    const messagesDestination = screen.getByRole('button', { name: /^消息/ });

    await user.click(messagesDestination);

    await waitFor(() => expect(mocks.openFriends).toHaveBeenCalledTimes(1));
    expect(mocks.closeTimeline).toHaveBeenCalledTimes(1);
    expect(mocks.closeTimeline.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.openFriends.mock.invocationCallOrder[0]);
    expect(messagesDestination).toHaveAttribute('aria-current', 'page');
  });

  it('does not close or reopen Activity when its selected destination is pressed again', async () => {
    const user = userEvent.setup();
    uiState.showTimeline = true;
    useShellStore.setState({ activeDestination: 'activity' });
    render(<App />);

    const activityDestination = screen.getByRole('button', { name: '动态' });
    await waitFor(() => expect(mocks.openTimeline).toHaveBeenCalledTimes(1));

    await user.click(activityDestination);

    expect(mocks.closeTimeline).not.toHaveBeenCalled();
    expect(mocks.openTimeline).toHaveBeenCalledTimes(1);
    expect(activityDestination).toHaveAttribute('aria-current', 'page');
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

  it('keeps Messages current until the Friends surface closes', async () => {
    const user = userEvent.setup();
    mocks.user = { _id: 'user-1' };
    uiState.showFriends = true;
    render(<App />);

    const mapDestination = screen.getByRole('button', { name: '地图' });
    const messagesDestination = screen.getByRole('button', { name: /^消息/ });
    await user.click(messagesDestination);
    await waitFor(() => expect(mocks.openFriends).toHaveBeenCalledTimes(1));
    expect(messagesDestination).toHaveAttribute('aria-current', 'page');

    await user.click(screen.getByRole('button', { name: 'Close friends surface' }));

    expect(mapDestination).toHaveAttribute('aria-current', 'page');
  });

  it('keeps Me current until the Profile surface closes', async () => {
    const user = userEvent.setup();
    mocks.user = { _id: 'user-1' };
    uiState.viewingProfileId = 'user-1';
    render(<App />);

    const mapDestination = screen.getByRole('button', { name: '地图' });
    const meDestination = screen.getByRole('button', { name: '我的' });
    await user.click(meDestination);
    await waitFor(() => expect(mocks.openProfile).toHaveBeenCalledWith('user-1'));
    expect(meDestination).toHaveAttribute('aria-current', 'page');

    await user.click(screen.getByRole('button', { name: 'Close profile surface' }));

    expect(mapDestination).toHaveAttribute('aria-current', 'page');
  });

  it('keeps a guest destination current until Auth closes', async () => {
    const user = userEvent.setup();
    uiState.showAuth = true;
    render(<App />);

    const mapDestination = screen.getByRole('button', { name: '地图' });
    const messagesDestination = screen.getByRole('button', { name: /^消息/ });
    await user.click(messagesDestination);
    await waitFor(() => expect(mocks.openAuth).toHaveBeenCalled());
    expect(messagesDestination).toHaveAttribute('aria-current', 'page');

    await user.click(screen.getByRole('button', { name: 'Close auth surface' }));

    expect(mapDestination).toHaveAttribute('aria-current', 'page');
  });

  it('returns a guest destination to Map after Auth succeeds', async () => {
    const user = userEvent.setup();
    uiState.showAuth = true;
    render(<App />);

    const mapDestination = screen.getByRole('button', { name: '地图' });
    const meDestination = screen.getByRole('button', { name: '我的' });
    await user.click(meDestination);
    await waitFor(() => expect(mocks.openAuth).toHaveBeenCalled());
    expect(meDestination).toHaveAttribute('aria-current', 'page');

    await user.click(screen.getByRole('button', { name: 'Complete auth' }));

    expect(mapDestination).toHaveAttribute('aria-current', 'page');
  });

  it.each(['Close auth surface', 'Complete auth'])(
    'keeps Activity current when secondary Auth exits through %s',
    async (authAction) => {
      const user = userEvent.setup();
      uiState.showTimeline = true;
      uiState.showAuth = true;
      useShellStore.setState({ activeDestination: 'activity' });
      render(<App />);

      const mapDestination = screen.getByRole('button', { name: '地图' });
      const activityDestination = screen.getByRole('button', { name: '动态' });
      expect(activityDestination).toHaveAttribute('aria-current', 'page');

      await user.click(screen.getByRole('button', { name: authAction }));

      expect(activityDestination).toHaveAttribute('aria-current', 'page');
      expect(mapDestination).not.toHaveAttribute('aria-current');

      await user.click(screen.getByRole('button', { name: 'Close timeline surface' }));
      expect(mapDestination).toHaveAttribute('aria-current', 'page');
    },
  );

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

  it('shows no stale badge and requests login when a guest presses notifications', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '通知' }));

    expect(mocks.openAuth).toHaveBeenCalledWith('login', '登录后查看通知');
    expect(mocks.toggleNotifs).not.toHaveBeenCalled();
  });

  it('opens notifications through the existing UI action for authenticated users', async () => {
    const user = userEvent.setup();
    mocks.user = { _id: 'user-1' };
    render(<App />);

    await user.click(screen.getByRole('button', { name: '通知，3 条未读' }));

    expect(mocks.toggleNotifs).toHaveBeenCalledTimes(1);
    expect(mocks.openAuth).not.toHaveBeenCalled();
  });
});
