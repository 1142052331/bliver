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
  commitComment?(input: IdempotentCommentCommit): Promise<Comment>;
  readonly transactions?: InteractionTransactionPort;
}
export interface InteractionTransactionPort {
  addReaction(input: { readonly reaction: Reaction; readonly event: InteractionEvent }): Promise<void>;
  removeReaction(input: { readonly footprintId: FootprintId; readonly actorId: UserId; readonly event: InteractionEvent }): Promise<void>;
  addComment(input: { readonly comment: Comment; readonly event: InteractionEvent }): Promise<void>;
  deleteComment(input: { readonly commentId: string; readonly at: Date; readonly event: InteractionEvent }): Promise<void>;
}
export interface IdempotentCommentCommit { readonly actorId: UserId; readonly scope: 'interaction.comment' | 'interaction.reply'; readonly key: string; readonly fingerprint: string; readonly comment: Comment; readonly event: InteractionEvent; }
export interface InteractionAccess { canInteract(actor: ActorContext, footprintId: FootprintId): Promise<boolean>; canRead?: (actor: ActorContext | null, footprintId: FootprintId) => Promise<boolean>; isBlocked(actorId: UserId, targetId: UserId): Promise<boolean>; footprintOwner(footprintId: FootprintId): Promise<UserId | null>; }
