import { resolve } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { FixtureSource, type LegacyCollections } from '../adapters/fixture-source.js';
import { preflight } from '../domain/preflight.js';

let clean: LegacyCollections;

beforeEach(async () => {
  clean = structuredClone(await (await FixtureSource.fromFile(resolve('fixtures/v1-complete.json'))).collections());
});

describe('legacy source preflight', () => {
  it('classifies every source record exactly once', () => {
    const result = preflight(clean);
    expect(result.summary).toEqual({ source: 31, migrated: 18, archivedOnly: 13, blocked: 0 });
    expect(result.errors).toEqual([]);
    expect(result.defaultedVisibilityCount).toBe(1);
  });

  it('blocks an active comment whose author is missing', () => {
    const footprint = clean.Footprint[0] as { comments: Array<Record<string, unknown>> };
    footprint.comments[0]!.userId = '507f1f77bcf86cd799439999';
    expect(preflight(clean).errors).toContainEqual({ code: 'COMMENT_AUTHOR_MISSING', collection: 'Footprint' });
  });

  it('blocks a username that cannot preserve the V2 login contract', () => {
    const user = clean.User[0] as Record<string, unknown>;
    user.name = '不兼容用户名';
    expect(preflight(clean).errors).toContainEqual({ code: 'USERNAME_V2_INCOMPATIBLE', collection: 'User' });
  });

  it('blocks conflicting reactions for the same user and footprint', () => {
    const footprint = clean.Footprint[0] as { reactions: Array<Record<string, unknown>> };
    footprint.reactions.push({ ...footprint.reactions[0], _id: '507f1f77bcf86cd799439299', emoji: 'angry' });
    expect(preflight(clean).errors).toContainEqual({ code: 'REACTION_CONFLICT', collection: 'Footprint' });
  });
});
