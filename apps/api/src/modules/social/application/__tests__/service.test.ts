import { createUserId } from '@bliver/domain';
import { describe, expect, it } from 'vitest';

import { SocialService } from '../service.js';
import { createMemorySocialRepository } from '../memory-repository.js';

describe('social graph', () => {
  it('stores one canonical pair and preserves pending to accepted history', async () => {
    const left = createUserId();
    const right = createUserId();
    const repository = createMemorySocialRepository();
    const service = new SocialService(repository);

    const requested = await service.requestFriendship(right, left);
    expect(requested).toMatchObject({
      requesterId: right,
      addresseeId: left,
      userLowId: [left, right].sort()[0],
      userHighId: [left, right].sort()[1],
      status: 'pending',
    });

    const accepted = await service.acceptFriendship(left, requested.id);
    expect(accepted.status).toBe('accepted');
    await expect(repository.listHistory(requested.id)).resolves.toMatchObject([
      { fromStatus: null, toStatus: 'pending', actorId: right },
      { fromStatus: 'pending', toStatus: 'accepted', actorId: left },
    ]);
    await expect(repository.areFriends(left, right)).resolves.toBe(true);
    await expect(repository.getRelationshipSummary(left, right)).resolves.toEqual({ state: 'friends' });
  });

  it('rejects self requests and treats repeat request and accept commands idempotently', async () => {
    const sender = createUserId();
    const recipient = createUserId();
    const repository = createMemorySocialRepository();
    const service = new SocialService(repository);

    await expect(service.requestFriendship(sender, sender)).rejects.toMatchObject({ code: 'SELF_RELATIONSHIP' });
    const first = await service.requestFriendship(sender, recipient);
    await expect(service.requestFriendship(sender, recipient)).resolves.toEqual(first);
    const accepted = await service.acceptFriendship(recipient, first.id);
    await expect(service.acceptFriendship(recipient, first.id)).resolves.toEqual(accepted);
    await expect(service.requestFriendship(sender, recipient)).resolves.toEqual(accepted);
  });

  it('supports rejected requests and explicit transition conflicts', async () => {
    const sender = createUserId();
    const recipient = createUserId();
    const stranger = createUserId();
    const repository = createMemorySocialRepository();
    const service = new SocialService(repository);
    const request = await service.requestFriendship(sender, recipient);

    await expect(service.acceptFriendship(stranger, request.id)).rejects.toMatchObject({ code: 'FRIENDSHIP_NOT_FOUND' });
    const rejected = await service.rejectFriendship(recipient, request.id);
    expect(rejected.status).toBe('rejected');
    await expect(service.acceptFriendship(recipient, request.id)).rejects.toMatchObject({ code: 'FRIENDSHIP_STATE_CONFLICT' });
    await expect(repository.getRelationshipSummary(sender, recipient)).resolves.toEqual({ state: 'none' });
  });

  it('removes accepted friendships and emits the complete event sequence', async () => {
    const sender = createUserId();
    const recipient = createUserId();
    const repository = createMemorySocialRepository();
    const service = new SocialService(repository);
    const request = await service.requestFriendship(sender, recipient);
    await service.acceptFriendship(recipient, request.id);

    await service.removeFriendship(sender, recipient);

    await expect(repository.areFriends(sender, recipient)).resolves.toBe(false);
    expect((await repository.listEvents()).map((event) => event.type)).toEqual([
      'FriendshipRequested',
      'FriendshipAccepted',
      'FriendshipRemoved',
    ]);
  });

  it('supports mutual blocks, hides pending requests, and restores none after both unblock', async () => {
    const left = createUserId();
    const right = createUserId();
    const repository = createMemorySocialRepository();
    const service = new SocialService(repository);
    await service.requestFriendship(left, right);

    await service.blockUser(left, right);
    await service.blockUser(right, left);

    await expect(repository.isBlocked(left, right)).resolves.toBe(true);
    await expect(repository.isBlocked(right, left)).resolves.toBe(true);
    await expect(repository.getPendingRequest(left, right)).resolves.toBeNull();
    await expect(repository.getRelationshipSummary(left, right)).resolves.toEqual({ state: 'blocked' });
    await expect(service.requestFriendship(left, right)).rejects.toMatchObject({ code: 'RELATIONSHIP_NOT_FOUND' });

    await service.unblockUser(left, right);
    await expect(repository.getRelationshipSummary(left, right)).resolves.toEqual({ state: 'blocked' });
    await service.unblockUser(right, left);
    await expect(repository.getRelationshipSummary(left, right)).resolves.toEqual({ state: 'none' });
    expect((await repository.listEvents()).map((event) => event.type)).toEqual([
      'FriendshipRequested',
      'FriendshipRemoved',
      'UserBlocked',
      'UserBlocked',
      'UserUnblocked',
      'UserUnblocked',
    ]);
  });
});
