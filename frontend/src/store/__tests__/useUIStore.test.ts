import { beforeEach, describe, expect, it } from 'vitest';
import useUIStore from '../useUIStore';

const initialState = useUIStore.getInitialState();

describe('useUIStore.closeTransientSurfaces', () => {
  beforeEach(() => {
    useUIStore.setState(initialState, true);
  });

  it('closes modal, drawer, chat, profile, and map-detail state together', () => {
    useUIStore.setState({
      showCheckIn: true,
      showTimeline: true,
      showNotifs: true,
      showAdmin: true,
      showAuth: true,
      showPhotoWall: true,
      showAbout: true,
      showFeedback: true,
      showAnnouncements: true,
      showFriends: true,
      chatUserId: 'friend-1',
      viewingProfileId: 'user-2',
      activeFootprintId: 'fp-1',
      mapPreviewId: 'fp-2',
      flyArrivedFp: { _id: 'fp-3' },
      timelineTargetFpId: 'fp-4',
      clusterData: {
        footprintIds: ['fp-5'],
        bounds: [[31.2, 121.4], [31.3, 121.5]],
        placeCount: 1,
        footprintCount: 1,
      },
      shareTarget: 'fp-7',
    });

    useUIStore.getState().closeTransientSurfaces();

    expect(useUIStore.getState()).toMatchObject({
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
      activeFootprintId: null,
      mapPreviewId: null,
      flyArrivedFp: null,
      timelineTargetFpId: null,
      clusterData: null,
      shareTarget: null,
    });
  });

  it('preserves toast and realtime event state', () => {
    const footprintEvent = { type: 'deleted' as const, footprintId: 'fp-1' };
    useUIStore.setState({
      toasts: [{ id: 'toast-1', type: 'message', content: 'hello', timestamp: 1 }],
      footprintEvent,
      footprintEventId: 3,
      profileEvent: { userId: 'user-1', user: { name: '阿森' } },
      profileEventId: 4,
    });

    useUIStore.getState().closeTransientSurfaces();

    expect(useUIStore.getState()).toMatchObject({
      toasts: [{ id: 'toast-1', type: 'message', content: 'hello', timestamp: 1 }],
      footprintEvent,
      footprintEventId: 3,
      profileEvent: { userId: 'user-1', user: { name: '阿森' } },
      profileEventId: 4,
    });
  });

  it('opens and closes a cluster selection with its map context', () => {
    const payload = {
      footprintIds: ['fp-1', 'fp-2'],
      bounds: [[31.2, 121.4], [31.3, 121.5]] as [[number, number], [number, number]],
      placeCount: 1,
      footprintCount: 2,
    };

    useUIStore.getState().openCluster(payload);
    expect(useUIStore.getState().clusterData).toEqual(payload);

    useUIStore.getState().closeCluster();
    expect(useUIStore.getState().clusterData).toBeNull();
  });
});
