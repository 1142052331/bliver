import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FixtureSource } from '../adapters/fixture-source.js';
import { buildMigrationPlan } from '../domain/transform.js';

describe('migration plan orchestration', () => {
  it('is input-order independent and carries no historical side effects', async () => {
    const source = await (await FixtureSource.fromFile(resolve('fixtures/v1-complete.json'))).collections();
    const plan = buildMigrationPlan(source, new Map(), { v1VapidPublicKey: 'fixture', v2VapidPublicKey: 'fixture' });
    const reversed = buildMigrationPlan({
      ...source,
      User: [...source.User].reverse(), Footprint: [...source.Footprint].reverse(), Message: [...source.Message].reverse(),
    }, new Map(), { v1VapidPublicKey: 'fixture', v2VapidPublicKey: 'fixture' });
    expect(plan.digest).toBe(reversed.digest);
    expect(plan.sideEffects).toEqual({ outbox: 0, sockets: 0, push: 0, audit: 0 });
    expect(plan.rows.notifications).toBeDefined();
  });
});
