import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  footprintDeleted,
  footprintNew,
  footprintUpdated,
  invalidateFootprintLists,
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
});
