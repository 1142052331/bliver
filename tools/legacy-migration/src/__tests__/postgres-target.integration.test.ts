import { describe, expect, it, vi } from 'vitest';

import { loadMigration, type MigrationTarget } from '../adapters/postgres-target.js';

function fakeTarget(count = 0, failAt = ''): MigrationTarget & { statements: string[] } {
  const statements: string[] = [];
  const query = vi.fn(async (sql: string) => {
    statements.push(sql);
    if (sql.includes('SELECT count')) return { rows: [{ count }], rowCount: 1 };
    if (failAt && sql.includes(failAt)) throw new Error('injected loader failure');
    return { rows: [], rowCount: 1 };
  });
  return {
    statements,
    async empty() { const result = await query('SELECT count(*)::int AS count FROM identity_users'); if (Number(result.rows[0]?.count ?? 0) !== 0) throw new Error('TARGET_NOT_EMPTY'); },
    async transaction(callback) { return callback({ query }); },
  };
}

describe('PostgreSQL migration target', () => {
  it('rejects a target that contains business rows', async () => {
    await expect(loadMigration(fakeTarget(1), { rows: { identityUsers: [{ id: 'user' }] }, digest: 'x', sideEffects: { outbox: 0, sockets: 0, push: 0, audit: 0 } } as never)).rejects.toThrow('TARGET_NOT_EMPTY');
  });

  it('loads in one transaction and never writes historical side-effect tables', async () => {
    const target = fakeTarget();
    await loadMigration(target, { rows: { identityUsers: [{ id: 'user' }] }, digest: 'x', sideEffects: { outbox: 0, sockets: 0, push: 0, audit: 0 } } as never);
    expect(target.statements.some((statement) => statement.includes('INSERT INTO identity_users'))).toBe(true);
    expect(target.statements.some((statement) => statement.includes('outbox_events') || statement.includes('audit_logs'))).toBe(false);
  });

  it('propagates an insert failure for the caller to rollback the empty target', async () => {
    const target = fakeTarget(0, 'identity_users');
    await expect(loadMigration(target, { rows: { identityUsers: [{ id: 'user' }] }, digest: 'x', sideEffects: { outbox: 0, sockets: 0, push: 0, audit: 0 } } as never)).rejects.toThrow('injected loader failure');
  });
});
