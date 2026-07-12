import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import useShellStore from '../store/useShellStore';

const mocks = vi.hoisted(() => ({
  user: null,
  requireLogin: vi.fn(() => false),
  setUser: vi.fn(),
  pendingActionRef: { current: null },
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
  activityPageProps: vi.fn(),
  friendsPanelProps: vi.fn(),
  profileDrawerProps: vi.fn(),
  mapPreviewProps: vi.fn(),
  mapViewProps: vi.fn(),
  mapQuery: vi.fn(),
  mapViewerKey: vi.fn(),
  requestLocation: vi.fn(),
  legacyReadImport: vi.fn(),
  refetchMap: vi.fn(),
  footprints: [],
  scopeContext: {
    scope: 'smart', reason: 'resolved-location',
    countryCode: 'CN', regionCode: 'CN-SH',
  },
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
  samePlaceIds: [],
  activeFootprintId: null,
  mapPreviewId: null,
  flyArrivedFp: null,
  timelineTargetFpId: null,
  footprintEvent: null,
  footprintEventId: 0,
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
  closeSamePlace: vi.fn(),
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
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ setQueriesData: vi.fn() }),
}));
vi.mock('leaflet', () => ({
  default: { Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } } },
}));

vi.mock('../hooks/useAuth', () => ({
  default: () => ({
    user: mocks.user,
    setUser: mocks.setUser,
    isAdmin: false,
    isAsen: false,
    requireLogin: mocks.requireLogin,
    logout: mocks.logout,
    pendingActionRef: mocks.pendingActionRef,
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
vi.mock('../hooks/useMapFootprints', () => ({
  default: (query, viewerKey) => {
    mocks.mapQuery(query);
    mocks.mapViewerKey(viewerKey);
    return {
      data: { footprints: mocks.footprints, query, scopesUsed: [] },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: mocks.refetchMap,
    };
  },
}));
vi.mock('../hooks/useLocationContext', () => ({
  default: () => ({
    permissionState: 'granted',
    scopeContext: mocks.scopeContext,
    requestLocation: mocks.requestLocation,
    setFixedScope: vi.fn(),
    clearFixedScope: vi.fn(),
  }),
}));
vi.mock('../hooks/useLegacyReadImport', () => ({
  default: (userId) => mocks.legacyReadImport(userId),
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

vi.mock('../components/MapView', () => ({
  default: (props) => {
    mocks.mapViewProps(props);
    return (
      <div data-testid="map-view">
        <button
          type="button"
          onClick={() => props.onQueryChange?.({ ...props.query, relationship: 'public' })}
        >
          Change map query
        </button>
      </div>
    );
  },
}));
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
vi.mock('../components/FootprintDetailModal', () => ({
  default: ({ fp }) => <div data-testid="footprint-detail">{fp?._id}</div>,
}));
vi.mock('../components/MapPreviewCard', () => ({
  default: (props) => {
    mocks.mapPreviewProps(props);
    return props.footprint
      ? <button type="button" onClick={props.onOpenDetail}>Open selected footprint</button>
      : null;
  },
}));
vi.mock('../components/activity/ActivityPage', () => ({
  default: (props) => {
    mocks.activityPageProps(props);
    const item = { _id: 'activity-footprint', message: 'activity target' };
    return (
      <div data-testid="activity-page">
        <button type="button" data-testid="activity-react" onClick={() => props.onReact?.(item)}>React activity</button>
        <button type="button" data-testid="activity-guest-react" onClick={() => props.onRequireLogin?.({ type: 'react', footprintId: item._id }, item)}>Guest react activity</button>
      </div>
    );
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
    mocks.closeAuth.mockImplementation(() => {});
    mocks.requireLogin.mockReturnValue(false);
    mocks.setUser.mockImplementation((user) => { mocks.user = user; });
    mocks.pendingActionRef.current = null;
    uiState.showAuth = false;
    uiState.showFriends = false;
    uiState.showTimeline = false;
    uiState.viewingProfileId = null;
    uiState.mapPreviewId = null;
    uiState.samePlaceIds = [];
    uiState.footprintEvent = null;
    uiState.footprintEventId = 0;
    mocks.footprints = [];
    mocks.scopeContext = {
      scope: 'smart', reason: 'resolved-location',
      countryCode: 'CN', regionCode: 'CN-SH',
    };
    mocks.requestLocation.mockResolvedValue({ status: 'granted' });
    window.history.replaceState(null, '', '/');
    useShellStore.setState(useShellStore.getInitialState(), true);
  });

  it('loads canonical map state from the URL and preserves unrelated params on changes', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?scope=country&country=jp&period=24h&fp=shared');

    render(<App />);

    expect(mocks.mapQuery).toHaveBeenLastCalledWith({
      scope: 'country', countryCode: 'JP', relationship: 'all',
      period: '24h', content: 'all', query: '',
    });
    await user.click(screen.getByRole('button', { name: 'Change map query' }));
    const params = new URLSearchParams(window.location.search);
    expect(params.get('fp')).toBe('shared');
    expect(params.get('scope')).toBe('country');
    expect(params.get('country')).toBe('JP');
    expect(params.get('relationship')).toBe('public');
  });

  it('adds resolved location codes only to the effective smart query', () => {
    render(<App />);

    expect(mocks.mapQuery).toHaveBeenLastCalledWith({
      scope: 'smart', relationship: 'all', period: '7d', content: 'all', query: '',
      countryCode: 'CN', regionCode: 'CN-SH',
    });
    expect(mocks.mapViewProps).toHaveBeenLastCalledWith(expect.objectContaining({
      query: { scope: 'smart', relationship: 'all', period: '7d', content: 'all', query: '' },
      queryContext: {
        scope: 'smart', relationship: 'all', period: '7d', content: 'all', query: '',
        countryCode: 'CN', regionCode: 'CN-SH',
      },
      locationContext: mocks.scopeContext,
    }));
    expect(mocks.mapViewerKey).toHaveBeenLastCalledWith('guest');
  });

  it('restores a persisted fixed scope as the visible canonical query', () => {
    mocks.scopeContext = {
      scope: 'region', reason: 'fixed', countryCode: 'CN', regionCode: 'CN-SH',
    };

    render(<App />);

    expect(mocks.mapViewProps).toHaveBeenLastCalledWith(expect.objectContaining({
      query: {
        scope: 'region', relationship: 'all', period: '7d', content: 'all', query: '',
        countryCode: 'CN', regionCode: 'CN-SH',
      },
    }));
  });

  it('removes the authenticated unread filter when the viewer logs out', async () => {
    mocks.user = { _id: 'viewer-1' };
    window.history.replaceState(null, '', '/?content=unread');
    const { rerender } = render(<App />);
    expect(mocks.mapQuery).toHaveBeenLastCalledWith(expect.objectContaining({ content: 'unread' }));

    mocks.user = null;
    rerender(<App />);

    await waitFor(() => {
      expect(mocks.mapQuery).toHaveBeenLastCalledWith(expect.objectContaining({ content: 'all' }));
    });
    expect(new URLSearchParams(window.location.search).has('content')).toBe(false);
  });

  it('closes selected surfaces when the authorized response loses their IDs', async () => {
    uiState.mapPreviewId = 'missing-preview';
    uiState.samePlaceIds = ['missing-sheet'];

    render(<App />);

    await waitFor(() => expect(uiState.setMapPreviewId).toHaveBeenCalledWith(null));
    expect(uiState.closeSamePlace).toHaveBeenCalledTimes(1);
  });

  it('passes an explicit new-footprint pulse through the map', async () => {
    mocks.footprints = [{ _id: 'fp-new' }];
    uiState.footprintEvent = { type: 'new', footprint: { _id: 'fp-new' } };
    uiState.footprintEventId = 1;

    render(<App />);

    await waitFor(() => {
      expect(mocks.mapViewProps.mock.calls.at(-1)[0].pulseIds).toEqual(new Set(['fp-new']));
    });
  });

  it('does not request location or notification permission on launch', async () => {
    const getCurrentPosition = vi.fn();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    });
    const requestPermission = vi.fn(() => Promise.resolve('denied'));
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: { permission: 'default', requestPermission },
    });

    render(<App />);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(requestPermission).not.toHaveBeenCalled();
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

  it('renders Activity as a destination surface above the map and below bottom navigation', async () => {
    const viewer = { _id: 'user-1' };
    const footprint = { _id: 'activity-footprint' };
    mocks.user = viewer;
    useShellStore.setState({ activeDestination: 'activity' });

    const { container } = render(<App />);

    expect(screen.getByTestId('activity-page')).toBeInTheDocument();
    expect(container.querySelector('.bliver-activity-destination')).toHaveClass(
      'fixed', 'inset-0', 'overflow-y-auto',
    );
    expect(screen.getByRole('navigation')).toHaveClass(
      'bliver-bottom-navigation--destination',
    );
    expect(mocks.openTimeline).not.toHaveBeenCalled();
    expect(mocks.timelineDrawerProps).toHaveBeenLastCalledWith(false);
    const props = mocks.activityPageProps.mock.calls.at(-1)[0];
    expect(props).toEqual(expect.objectContaining({
      viewer,
      requireLogin: mocks.requireLogin,
      onRequireLogin: expect.any(Function),
      locationContext: mocks.scopeContext,
      onRequestLocation: mocks.requestLocation,
      onReact: expect.any(Function),
      onComment: expect.any(Function),
    }));

    props.onReact(footprint);
    props.onComment(footprint);
    expect(uiState.setFlyArrivedFp).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('footprint-detail')).toHaveTextContent('activity-footprint'));
  });

  it('keeps Activity interaction detail mounted when the target is absent from map footprints', async () => {
    const user = userEvent.setup();
    mocks.user = { _id: 'user-1' };
    useShellStore.setState({ activeDestination: 'activity' });
    const { rerender } = render(<App />);

    await user.click(screen.getByTestId('activity-react'));
    expect(screen.getByTestId('footprint-detail')).toHaveTextContent('activity-footprint');

    mocks.footprints = [];
    rerender(<App />);
    expect(screen.getByTestId('footprint-detail')).toHaveTextContent('activity-footprint');
  });

  it('clears Activity detail when navigating away and does not reopen it on return', async () => {
    const user = userEvent.setup();
    mocks.user = { _id: 'user-1' };
    useShellStore.setState({ activeDestination: 'activity' });
    render(<App />);

    await user.click(screen.getByTestId('activity-react'));
    expect(screen.getByTestId('footprint-detail')).toHaveTextContent('activity-footprint');

    await user.click(screen.getByRole('button', { name: '地图' }));
    expect(screen.queryByTestId('footprint-detail')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '动态' }));
    expect(screen.getByTestId('activity-page')).toBeInTheDocument();
    expect(screen.queryByTestId('footprint-detail')).not.toBeInTheDocument();
  });

  it('returns a guest Activity interaction to Activity and opens its target after login', async () => {
    const user = userEvent.setup();
    uiState.showAuth = true;
    useShellStore.setState({ activeDestination: 'activity' });
    mocks.requireLogin.mockImplementation((action) => {
      mocks.pendingActionRef.current = action;
      return false;
    });
    mocks.closeAuth.mockImplementation(() => { uiState.showAuth = false; });
    render(<App />);

    await user.click(screen.getByTestId('activity-guest-react'));
    expect(mocks.pendingActionRef.current).toEqual(expect.objectContaining({
      type: 'react', footprintId: 'activity-footprint', source: 'activity',
    }));
    await user.click(screen.getByRole('button', { name: 'Complete auth' }));

    expect(useShellStore.getState().activeDestination).toBe('activity');
    expect(screen.getByTestId('activity-page')).toBeInTheDocument();
    expect(screen.getByTestId('footprint-detail')).toHaveTextContent('activity-footprint');
    expect(uiState.setActiveFootprintId).not.toHaveBeenCalled();
  });

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
    uiState.showAuth = true;
    useShellStore.setState({ activeDestination: 'activity' });

    render(<App />);

    const navigation = screen.getByRole('navigation');
    expect(navigation).toHaveClass('bliver-bottom-navigation--destination');
    expect(navigation).not.toHaveClass('bliver-bottom-navigation--destination-auth');
    expect(screen.getByTestId('activity-page')).toBeInTheDocument();
    expect(mocks.timelineDrawerProps).toHaveBeenLastCalledWith(false);
    expect(mocks.authModalProps).toHaveBeenLastCalledWith(false);
  });

  it('selects Activity without opening the legacy Timeline drawer', async () => {
    const user = userEvent.setup();
    render(<App />);

    const mapDestination = screen.getByRole('button', { name: '地图' });
    const activityDestination = screen.getByRole('button', { name: '动态' });
    await user.click(activityDestination);

    expect(await screen.findByTestId('activity-page')).toBeInTheDocument();
    expect(mocks.openTimeline).not.toHaveBeenCalled();
    expect(activityDestination).toHaveAttribute('aria-current', 'page');
    expect(mapDestination).not.toHaveAttribute('aria-current');
  });

  it.each([
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

  it('moves from Activity to Messages without invoking the legacy Timeline drawer', async () => {
    const user = userEvent.setup();
    mocks.user = { _id: 'user-1' };
    useShellStore.setState({ activeDestination: 'activity' });
    render(<App />);

    expect(screen.getByTestId('activity-page')).toBeInTheDocument();
    const messagesDestination = screen.getByRole('button', { name: /^消息/ });

    await user.click(messagesDestination);

    await waitFor(() => expect(mocks.openFriends).toHaveBeenCalledTimes(1));
    expect(mocks.openTimeline).not.toHaveBeenCalled();
    expect(mocks.closeTimeline).not.toHaveBeenCalled();
    expect(screen.queryByTestId('activity-page')).not.toBeInTheDocument();
    expect(messagesDestination).toHaveAttribute('aria-current', 'page');
  });

  it('does not reopen Activity when its selected destination is pressed again', async () => {
    const user = userEvent.setup();
    useShellStore.setState({ activeDestination: 'activity' });
    render(<App />);

    const activityDestination = screen.getByRole('button', { name: '动态' });
    expect(screen.getByTestId('activity-page')).toBeInTheDocument();

    await user.click(activityDestination);

    expect(mocks.closeTimeline).not.toHaveBeenCalled();
    expect(mocks.openTimeline).not.toHaveBeenCalled();
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
      uiState.showAuth = true;
      useShellStore.setState({ activeDestination: 'activity' });
      render(<App />);

      const mapDestination = screen.getByRole('button', { name: '地图' });
      const activityDestination = screen.getByRole('button', { name: '动态' });
      expect(activityDestination).toHaveAttribute('aria-current', 'page');

      await user.click(screen.getByRole('button', { name: authAction }));

      expect(activityDestination).toHaveAttribute('aria-current', 'page');
      expect(mapDestination).not.toHaveAttribute('aria-current');

      expect(screen.getByTestId('activity-page')).toBeInTheDocument();
    },
  );

  it('keeps the legacy Timeline available from an explicit history entry point', () => {
    uiState.showTimeline = true;

    render(<App />);

    expect(screen.getByRole('button', { name: 'Close timeline surface' })).toBeInTheDocument();
    expect(screen.queryByTestId('activity-page')).not.toBeInTheDocument();
    expect(mocks.timelineDrawerProps).toHaveBeenLastCalledWith(false);
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
