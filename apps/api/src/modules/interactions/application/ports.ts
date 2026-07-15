import type { ActorContext } from '../../identity/index.js';
import type { Comment, InteractionEvent, Reaction } from '../domain/model.js';
import type { FootprintId, UserId } from '@bliver/domain';

export interface InteractionRepository {
  findReaction(footprintId: FootprintId, actorId: UserId): Promise<Reaction | null>;
  saveReaction(reaction: Reaction): Promise<void>;
  removeReaction(footprintId: FootprintId, actorId: UserId): Promise<void>;
  listReactions(footprintId: FootprintId): Promise<Reaction[]>;
  findComment(id: string): Promise<Comment | null>;
  saveComment(comment: Comment): Promise<void>;
  updateCommentDeleted(id: string, at: Date): Promise<void>;
  listComments(footprintId: FootprintId): Promise<Comment[]>;
  appendEvent(event: InteractionEvent): Promise<void>;
}
export interface InteractionAccess { canInteract(actor: ActorContext, footprintId: FootprintId): Promise<boolean>; canRead?: (actor: ActorContext | null, footprintId: FootprintId) => Promise<boolean>; isBlocked(actorId: UserId, targetId: UserId): Promise<boolean>; footprintOwner(footprintId: FootprintId): Promise<UserId | null>; }
