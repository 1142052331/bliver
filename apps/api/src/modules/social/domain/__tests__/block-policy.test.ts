import { createUserId } from '@bliver/domain';
import { describe, expect, it } from 'vitest';

import { BlockPolicy, BlockedResourceNotFoundError } from '../block-policy.js';

describe('BlockPolicy', () => {
  it('returns generic not-found for either block direction', async () => {
    const actor = createUserId();
    const target = createUserId();
    const policy = new BlockPolicy({ async isBlocked() { return true; } });

    await expect(policy.canAccess(actor, target)).resolves.toBe(false);
    await expect(policy.assertAccess(actor, target)).rejects.toBeInstanceOf(BlockedResourceNotFoundError);
    await expect(policy.assertAccess(actor, target)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  });

  it('always permits the same actor and builds a parameterized pre-query predicate', async () => {
    const actor = createUserId();
    const values: unknown[] = [];
    const policy = new BlockPolicy({ async isBlocked() { throw new Error('not queried'); } });

    await expect(policy.canAccess(actor, actor)).resolves.toBe(true);
    const predicate = policy.excludeBlockedSql({
      viewerId: actor,
      targetColumn: 'candidate.author_id',
      addParameter(value) { values.push(value); return `$${values.length}`; },
    });

    expect(predicate).toContain('blocks');
    expect(predicate).toContain('candidate.author_id');
    expect(predicate).not.toContain(actor);
    expect(values).toEqual([actor]);
  });
});
