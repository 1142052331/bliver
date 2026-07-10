import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newNotification } from '../socketHandlers';

const setMessageIsland = vi.fn();

vi.mock('../../store/useUIStore', () => ({
  default: {
    getState: () => ({
      setMessageIsland,
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
