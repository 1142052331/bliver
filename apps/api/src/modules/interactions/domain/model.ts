import { createEventId, parseUserId, type FootprintId, type UserId } from '@bliver/domain';
import type { ActorContext } from '../../identity/index.js';

export interface Reaction { readonly footprintId: FootprintId; readonly actorId: UserId; readonly emoji: string; readonly createdAt: Date; }
export interface Comment { readonly id: string; readonly footprintId: FootprintId; readonly authorId: UserId; readonly authorName: string; readonly content: string; readonly parentCommentId: string | null; readonly createdAt: Date; readonly deletedAt: Date | null; }
export interface InteractionEvent { readonly id: string; readonly type: 'ReactionAdded' | 'ReactionRemoved' | 'CommentAdded' | 'CommentDeleted'; readonly aggregateId: FootprintId; readonly payload: Record<string, unknown>; }
export class InteractionError extends Error { constructor(readonly code: 'AUTH_REQUIRED' | 'FOOTPRINT_NOT_FOUND' | 'BLOCKED' | 'COMMENT_PARENT_INVALID' | 'COMMENT_DEPTH_INVALID' | 'COMMENT_FORBIDDEN' | 'REACTION_INVALID') { super(code); this.name = 'InteractionError'; } }
export function assertEmoji(emoji: string): string { const value = emoji.trim(); if (!value || value.length > 32) throw new InteractionError('REACTION_INVALID'); return value; }
export function createCommentId(): string { return createEventId(); }
export function validActor(actor: ActorContext | null): asserts actor is ActorContext { if (!actor) throw new InteractionError('AUTH_REQUIRED'); parseUserId(actor.userId); }
