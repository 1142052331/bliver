import type { LegacyRecord } from '../adapters/fixture-source.js';
import { DeterministicIdRegistry } from './ids.js';
import { MigrationError } from './types.js';

const date = (value: unknown): Date => new Date(String(value));

export function transformInteractions(
  readSources: readonly LegacyRecord[],
  footprintSources: readonly LegacyRecord[],
  ids = new DeterministicIdRegistry(),
) {
  const reads = readSources.map((source) => ({
    footprintId: ids.id('footprint', String(source.footprintId)),
    viewerId: ids.id('user', String(source.userId)),
    readAt: date(source.readAt),
  }));
  const reactions: Array<{ footprintId: string; actorId: string; emoji: string; createdAt: Date; updatedAt: Date }> = [];
  const reactionByPair = new Map<string, { emoji: string; createdAt: string }>();
  const commentSources = new Map<string, { source: LegacyRecord; footprintSourceId: string }>();

  for (const footprint of footprintSources) {
    const footprintSourceId = String(footprint._id);
    for (const source of Array.isArray(footprint.reactions) ? footprint.reactions as LegacyRecord[] : []) {
      const pair = `${footprintSourceId}:${String(source.userId)}`;
      const value = { emoji: String(source.emoji), createdAt: String(source.createdAt) };
      const prior = reactionByPair.get(pair);
      if (prior) {
        if (prior.emoji !== value.emoji || prior.createdAt !== value.createdAt) throw new MigrationError('REACTION_CONFLICT');
        continue;
      }
      reactionByPair.set(pair, value);
      reactions.push({ footprintId: ids.id('footprint', footprintSourceId), actorId: ids.id('user', String(source.userId)), emoji: value.emoji, createdAt: date(source.createdAt), updatedAt: date(source.createdAt) });
    }
    for (const source of Array.isArray(footprint.comments) ? footprint.comments as LegacyRecord[] : []) {
      commentSources.set(String(source._id), { source, footprintSourceId });
    }
  }

  const comments = [...commentSources.entries()].map(([sourceId, entry]) => {
    const parentSourceId = entry.source.parentCommentId ? String(entry.source.parentCommentId) : null;
    if (parentSourceId) {
      const parent = commentSources.get(parentSourceId);
      if (!parent || parent.footprintSourceId !== entry.footprintSourceId) throw new MigrationError('COMMENT_PARENT_MISSING');
      if (parent.source.parentCommentId) throw new MigrationError('COMMENT_DEPTH_INVALID');
    }
    const deletedAt = entry.source.deletedAt ? date(entry.source.deletedAt) : entry.source.isDeleted ? date(entry.source.createdAt) : null;
    return {
      id: ids.id('comment', sourceId),
      footprintId: ids.id('footprint', entry.footprintSourceId),
      authorId: ids.id('user', String(entry.source.userId)),
      parentCommentId: parentSourceId ? ids.id('comment', parentSourceId) : null,
      content: deletedAt && !String(entry.source.content ?? '') ? '[deleted]' : String(entry.source.content),
      createdAt: date(entry.source.createdAt),
      deletedAt,
    };
  });
  return { reads, reactions, comments };
}
