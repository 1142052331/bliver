import { z } from './zod.js';

export const socialUserId = z.string().uuid();
export const friendshipStatus = z.enum(['pending', 'accepted', 'rejected']);
export const relationshipState = z.enum(['none', 'pending-outgoing', 'pending-incoming', 'friends', 'blocked']);

export const requestFriendshipInput = z.object({ targetUserId: socialUserId }).strict();

export const friendshipDto = z.object({
  id: z.string().uuid(),
  requesterId: socialUserId,
  addresseeId: socialUserId,
  status: friendshipStatus,
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
}).strict();

export const friendshipListItemDto = z.object({
  friendshipId: z.string().uuid(),
  userId: socialUserId,
  status: z.literal('accepted'),
  updatedAt: z.iso.datetime({ offset: true }),
}).strict();

export const friendshipRequestDto = z.object({
  id: z.string().uuid(),
  userId: socialUserId,
  createdAt: z.iso.datetime({ offset: true }),
}).strict();

export const relationshipSummaryDto = z.object({
  state: relationshipState,
  requestId: z.string().uuid().optional(),
}).strict();

export const blockDto = z.object({
  userId: socialUserId,
  createdAt: z.iso.datetime({ offset: true }),
}).strict();

export type FriendshipDto = z.infer<typeof friendshipDto>;
export type RelationshipSummaryDto = z.infer<typeof relationshipSummaryDto>;
