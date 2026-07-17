import { resolve } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { FixtureSource, type LegacyCollections } from '../adapters/fixture-source.js';
import { transformInteractions } from '../domain/interactions.js';

let source: LegacyCollections;
beforeEach(async () => { source = structuredClone(await (await FixtureSource.fromFile(resolve('fixtures/v1-complete.json'))).collections()); });

describe('legacy interaction transformation', () => {
  it('maps reads, reactions and two-level comments without direct-reply snapshots', () => {
    const footprint = source.Footprint[0]!;
    const comments = footprint.comments as Array<Record<string, unknown>>;
    comments.push({
      _id: '507f1f77bcf86cd799439223', userId: '507f1f77bcf86cd799439011', content: 'reply',
      parentCommentId: '507f1f77bcf86cd799439221', replyToCommentId: '507f1f77bcf86cd799439221',
      replyToUser: { username: 'legacy_friend' }, createdAt: '2026-01-07T03:00:00.000Z', isDeleted: false,
    });
    const result = transformInteractions(source.FootprintRead, source.Footprint);
    expect(result.reads[0]?.readAt.toISOString()).toBe('2026-01-09T01:00:00.000Z');
    expect(result.reactions).toHaveLength(1);
    const root = result.comments.find((comment) => comment.content === 'hello')!;
    expect(result.comments.find((comment) => comment.content === 'reply')?.parentCommentId).toBe(root.id);
    expect(result.comments.find((comment) => comment.deletedAt)?.content).toBe('[deleted]');
    expect(JSON.stringify(result.comments)).not.toContain('replyToUser');
  });

  it('collapses exact reaction duplicates and blocks conflicting duplicates', () => {
    const reactions = source.Footprint[0]!.reactions as Array<Record<string, unknown>>;
    reactions.push({ ...reactions[0], _id: '507f1f77bcf86cd799439298' });
    expect(transformInteractions(source.FootprintRead, source.Footprint).reactions).toHaveLength(1);
    reactions[1]!.emoji = 'angry';
    expect(() => transformInteractions(source.FootprintRead, source.Footprint)).toThrow('REACTION_CONFLICT');
  });

  it('blocks missing parents and replies to replies', () => {
    const comments = source.Footprint[0]!.comments as Array<Record<string, unknown>>;
    comments.push({ _id: '507f1f77bcf86cd799439223', userId: '507f1f77bcf86cd799439011', content: 'reply', parentCommentId: '507f1f77bcf86cd799439299', createdAt: '2026-01-07T03:00:00.000Z' });
    expect(() => transformInteractions(source.FootprintRead, source.Footprint)).toThrow('COMMENT_PARENT_MISSING');
    comments[1]!.parentCommentId = '507f1f77bcf86cd799439221';
    comments.push({ _id: '507f1f77bcf86cd799439224', userId: '507f1f77bcf86cd799439012', content: 'too deep', parentCommentId: '507f1f77bcf86cd799439223', createdAt: '2026-01-07T04:00:00.000Z' });
    expect(() => transformInteractions(source.FootprintRead, source.Footprint)).toThrow('COMMENT_DEPTH_INVALID');
  });
});
