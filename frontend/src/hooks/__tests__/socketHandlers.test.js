import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  footprintDeleted,
  footprintNew,
  footprintUpdated,
  invalidateFootprintLists,
  setFootprintUnreadState,
  forceLogout,
  newNotification,
  resetFootprintEventLedger,
} from '../socketHandlers';

const setMessageIsland = vi.fn();
const emitFootprintEvent = vi.fn();

vi.mock('../../store/useUIStore', () => ({
  default: {
    getState: () => ({
      setMessageIsland,
      emitFootprintEvent,
    }),
  },
}));

describe('newNotification socket handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards the notification to the explicit append API', () => {
    const appendNotification = vi.fn();
    const notification = {
      _id: 'socket-1',
      isRead: false,
      type: 'comment',
      senderName: '朋友',
      footprintId: 'fp-1',
      content: '新评论',
    };

    newNotification(appendNotification)({ notification });

    expect(appendNotification).toHaveBeenCalledWith(notification);
  });
});

describe('footprint socket cache invalidation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('invalidates map and future activity list prefixes', () => {
    const queryClient = { invalidateQueries: vi.fn() };
    invalidateFootprintLists(queryClient);
    expect(queryClient.invalidateQueries.mock.calls).toEqual([
      [{ queryKey: ['footprints', 'map'] }],
      [{ queryKey: ['footprints', 'activity'] }],
    ]);
  });

  it.each([
    ['new', footprintNew, { footprint: { _id: 'fp-1' } }],
    ['updated', footprintUpdated, { footprint: { _id: 'fp-1' } }],
    ['deleted', footprintDeleted, { footprintId: 'fp-1' }],
  ])('invalidates authoritative queries for %s events', (type, factory, payload) => {
    const queryClient = { invalidateQueries: vi.fn() };
    factory(queryClient)(payload);
    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(2);
    expect(emitFootprintEvent).toHaveBeenCalledWith({ type, ...payload });
  });

  it.each([
    ['private', { visibility: 'private' }],
    ['expired', { visibility: 'public', discoveryExpiresAt: '2026-07-11T00:00:00.000Z' }],
  ])('removes an item becoming %s only from caches outside the authorized viewer', (_label, change) => {
    vi.setSystemTime('2026-07-12T00:00:00.000Z');
    const queryClient = new QueryClient();
    const guestKey = ['footprints', 'activity', 'guest', { scope: 'global', limit: 1 }];
    const userKey = ['footprints', 'activity', 'user:viewer-1', { scope: 'smart', limit: 1 }];
    const strangerKey = ['footprints', 'activity', 'user:viewer-2', { scope: 'smart', limit: 1 }];
    const data = {
      pages: [
        { items: [{ _id: 'fp-1', message: 'old' }], nextCursor: 'page-2', hasMore: true },
        { items: [{ _id: 'fp-2' }, { _id: 'fp-1', message: 'duplicate' }], hasMore: false },
      ],
      pageParams: [undefined, 'page-2'],
    };
    queryClient.setQueryData(guestKey, data);
    queryClient.setQueryData(userKey, data);
    queryClient.setQueryData(strangerKey, data);

    footprintUpdated(queryClient, 'user:viewer-1')({ footprint: { _id: 'fp-1', ...change } });

    for (const key of [guestKey, strangerKey]) {
      const cached = queryClient.getQueryData(key);
      expect(cached.pageParams).toEqual([undefined, 'page-2']);
      expect(cached.pages.map((page) => page.items.map((item) => item._id))).toEqual([[], ['fp-2']]);
    }
    expect(queryClient.getQueryData(userKey).pages[0].items[0]._id).toBe('fp-1');
    vi.useRealTimers();
  });

  it('removes a deleted item immediately from map data and every Activity page', () => {
    const queryClient = new QueryClient();
    const mapKey = ['footprints', 'map', 'guest', { scope: 'global' }];
    const activityKey = ['footprints', 'activity', 'guest', { scope: 'global', limit: 20 }];
    queryClient.setQueryData(mapKey, { footprints: [{ _id: 'fp-1' }, { _id: 'fp-2' }] });
    queryClient.setQueryData(activityKey, {
      pages: [{ items: [{ _id: 'fp-1' }] }, { items: [{ _id: 'fp-2' }, { _id: 'fp-1' }] }],
      pageParams: [undefined, 'next'],
    });

    footprintDeleted(queryClient, 'guest')({ footprintId: 'fp-1' });

    expect(queryClient.getQueryData(mapKey).footprints.map((item) => item._id)).toEqual(['fp-2']);
    expect(queryClient.getQueryData(activityKey).pages.map((page) => page.items.map((item) => item._id)))
      .toEqual([[], ['fp-2']]);
  });

  it('preserves infinite page metadata while applying optimistic read state to all duplicates', () => {
    const queryClient = new QueryClient();
    const key = ['footprints', 'activity', 'user:viewer-1', { scope: 'smart', limit: 20 }];
    const guestKey = ['footprints', 'activity', 'guest', { scope: 'smart', limit: 20 }];
    const guestMapKey = ['footprints', 'map', { scope: 'global' }, 'guest'];
    const userMapKey = ['footprints', 'map', { scope: 'global' }, 'viewer-1'];
    queryClient.setQueryData(key, {
      pages: [
        { items: [{ _id: 'fp-1', isUnread: true }], nextCursor: 'next', hasMore: true },
        { items: [{ _id: 'fp-1', isUnread: true }], nextCursor: null, hasMore: false },
      ],
      pageParams: [undefined, 'next'],
    });
    queryClient.setQueryData(guestKey, { pages: [{ items: [{ _id: 'fp-1', isUnread: true }] }], pageParams: [undefined] });
    queryClient.setQueryData(guestMapKey, { footprints: [{ _id: 'fp-1', isUnread: true }] });
    queryClient.setQueryData(userMapKey, { footprints: [{ _id: 'fp-1', isUnread: true }] });

    setFootprintUnreadState(queryClient, 'fp-1', false, 'user:viewer-1');

    const cached = queryClient.getQueryData(key);
    expect(cached.pages.flatMap((page) => page.items).every((item) => item.isUnread === false)).toBe(true);
    expect(cached.pageParams).toEqual([undefined, 'next']);
    expect(cached.pages[0].nextCursor).toBe('next');
    expect(queryClient.getQueryData(guestKey).pages[0].items[0].isUnread).toBe(true);
    expect(queryClient.getQueryData(guestMapKey).footprints[0].isUnread).toBe(true);
    expect(queryClient.getQueryData(userMapKey).footprints[0].isUnread).toBe(false);
  });

  it('does not resurrect a deletion when a duplicate or out-of-order update arrives later', () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    footprintDeleted(queryClient, 'guest')({ footprintId: 'fp-1' });
    footprintDeleted(queryClient, 'guest')({ footprintId: 'fp-1' });
    footprintUpdated(queryClient, 'guest')({
      footprint: { _id: 'fp-1', updatedAt: '2026-07-11T00:00:00.000Z', message: 'late' },
    });

    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(emitFootprintEvent).toHaveBeenCalledTimes(1);
    expect(emitFootprintEvent).toHaveBeenCalledWith({ type: 'deleted', footprintId: 'fp-1' });
  });

  it('forgets event dedupe state when the authenticated query client logs out', () => {
    const queryClient = { invalidateQueries: vi.fn(), clear: vi.fn() };
    const setUser = vi.fn();
    const payload = { footprint: { _id: 'fp-logout', message: 'same event' } };
    footprintUpdated(queryClient, 'user:user-1')(payload);
    footprintUpdated(queryClient, 'user:user-1')(payload);
    expect(emitFootprintEvent).toHaveBeenCalledTimes(1);

    forceLogout(queryClient, setUser)();
    footprintUpdated(queryClient, 'user:user-1')(payload);

    expect(queryClient.clear).toHaveBeenCalledTimes(1);
    expect(setUser).toHaveBeenCalledWith(null);
    expect(emitFootprintEvent).toHaveBeenCalledTimes(2);
  });

  it('keeps deletion tombstones after the bounded ordinary ledger evicts old entries', () => {
    const queryClient = { invalidateQueries: vi.fn() };
    footprintDeleted(queryClient, 'guest')({ footprintId: 'fp-tombstone' });
    for (let i = 0; i < 2050; i += 1) {
      footprintUpdated(queryClient, 'guest')({ footprint: { _id: `fp-${i}`, updatedAt: `2026-07-12T00:00:${String(i % 60).padStart(2, '0')}.000Z` } });
    }
    footprintUpdated(queryClient, 'guest')({ footprint: { _id: 'fp-tombstone', updatedAt: '2026-07-12T00:00:01.000Z', message: 'late' } });
    expect(emitFootprintEvent).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'updated', footprint: expect.objectContaining({ _id: 'fp-tombstone' }) }));
  });

  it('rejects a different payload carrying the same event version', () => {
    const queryClient = { invalidateQueries: vi.fn() };
    const updatedAt = '2026-07-12T00:00:01.000Z';
    footprintUpdated(queryClient, 'guest')({ footprint: { _id: 'fp-version', updatedAt, message: 'first' } });
    footprintUpdated(queryClient, 'guest')({ footprint: { _id: 'fp-version', updatedAt, message: 'conflicting' } });
    expect(emitFootprintEvent).toHaveBeenCalledTimes(1);
  });

  it('resets only the requested viewer ledger so a later session accepts the same event', () => {
    const queryClient = { invalidateQueries: vi.fn() };
    const payload = { footprint: { _id: 'fp-session', message: 'same' } };
    footprintUpdated(queryClient, 'user:user-a')(payload);
    footprintUpdated(queryClient, 'user:user-a')(payload);
    resetFootprintEventLedger(queryClient, 'user:user-a');
    footprintUpdated(queryClient, 'user:user-a')(payload);
    expect(emitFootprintEvent).toHaveBeenCalledTimes(2);
  });

  it('updates an admin viewer map cache keyed by the raw user id', () => {
    const queryClient = new QueryClient();
    const mapKey = ['footprints', 'map', { scope: 'global' }, 'admin-1'];
    queryClient.setQueryData(mapKey, { footprints: [{ _id: 'fp-admin', isUnread: true }] });
    setFootprintUnreadState(queryClient, 'fp-admin', false, 'admin:admin-1');
    expect(queryClient.getQueryData(mapKey).footprints[0].isUnread).toBe(false);
  });
});
