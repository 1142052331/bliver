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
  ])('removes an item becoming %s from every viewer-isolated Activity page', (_label, change) => {
    vi.setSystemTime('2026-07-12T00:00:00.000Z');
    const queryClient = new QueryClient();
    const guestKey = ['footprints', 'activity', 'guest', { scope: 'global', limit: 1 }];
    const userKey = ['footprints', 'activity', 'user:viewer-1', { scope: 'smart', limit: 1 }];
    const data = {
      pages: [
        { items: [{ _id: 'fp-1', message: 'old' }], nextCursor: 'page-2', hasMore: true },
        { items: [{ _id: 'fp-2' }, { _id: 'fp-1', message: 'duplicate' }], hasMore: false },
      ],
      pageParams: [undefined, 'page-2'],
    };
    queryClient.setQueryData(guestKey, data);
    queryClient.setQueryData(userKey, data);

    footprintUpdated(queryClient)({ footprint: { _id: 'fp-1', ...change } });

    for (const key of [guestKey, userKey]) {
      const cached = queryClient.getQueryData(key);
      expect(cached.pageParams).toEqual([undefined, 'page-2']);
      expect(cached.pages.map((page) => page.items.map((item) => item._id))).toEqual([[], ['fp-2']]);
    }
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

    footprintDeleted(queryClient)({ footprintId: 'fp-1' });

    expect(queryClient.getQueryData(mapKey).footprints.map((item) => item._id)).toEqual(['fp-2']);
    expect(queryClient.getQueryData(activityKey).pages.map((page) => page.items.map((item) => item._id)))
      .toEqual([[], ['fp-2']]);
  });

  it('preserves infinite page metadata while applying optimistic read state to all duplicates', () => {
    const queryClient = new QueryClient();
    const key = ['footprints', 'activity', 'user:viewer-1', { scope: 'smart', limit: 20 }];
    queryClient.setQueryData(key, {
      pages: [
        { items: [{ _id: 'fp-1', isUnread: true }], nextCursor: 'next', hasMore: true },
        { items: [{ _id: 'fp-1', isUnread: true }], nextCursor: null, hasMore: false },
      ],
      pageParams: [undefined, 'next'],
    });

    setFootprintUnreadState(queryClient, 'fp-1', false);

    const cached = queryClient.getQueryData(key);
    expect(cached.pages.flatMap((page) => page.items).every((item) => item.isUnread === false)).toBe(true);
    expect(cached.pageParams).toEqual([undefined, 'next']);
    expect(cached.pages[0].nextCursor).toBe('next');
  });

  it('does not resurrect a deletion when a duplicate or out-of-order update arrives later', () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    footprintDeleted(queryClient)({ footprintId: 'fp-1' });
    footprintDeleted(queryClient)({ footprintId: 'fp-1' });
    footprintUpdated(queryClient)({
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
    footprintUpdated(queryClient)(payload);
    footprintUpdated(queryClient)(payload);
    expect(emitFootprintEvent).toHaveBeenCalledTimes(1);

    forceLogout(queryClient, setUser)();
    footprintUpdated(queryClient)(payload);

    expect(queryClient.clear).toHaveBeenCalledTimes(1);
    expect(setUser).toHaveBeenCalledWith(null);
    expect(emitFootprintEvent).toHaveBeenCalledTimes(2);
  });
});
