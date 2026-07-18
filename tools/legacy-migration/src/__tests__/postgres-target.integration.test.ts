import { describe, expect, it, vi } from 'vitest';

import { loadMigration, type MigrationTarget } from '../adapters/postgres-target.js';

function fakeTarget(count = 0, failAt = ''): MigrationTarget & { statements: string[] } {
  const statements: string[] = [];
  const query = vi.fn(async (sql: string) => {
    statements.push(sql);
    if (sql.includes('SELECT count')) {
      const table = sql.match(/FROM\s+([a-z_.]+)/i)?.[1] ?? '';
      const inserted = statements.filter((statement) => statement.includes(`INSERT INTO ${table} `) || statement.includes(`INSERT INTO ${table} (`)).length;
      return { rows: [{ count: inserted || (table === 'identity_users' ? count : 0) }], rowCount: 1 };
    }
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
    expect(target.statements.some((statement) => statement.includes('INSERT INTO platform.outbox_events') || statement.includes('INSERT INTO audit_logs'))).toBe(false);
  });

  it('writes every formal V2 row group emitted by the migration plan', async () => {
    const target = fakeTarget();
    await loadMigration(target, {
      rows: {
        identityUsers: [{ id: 'u' }], identityCredentials: [{ userId: 'u' }], identityRoles: [{ userId: 'u' }], adminRoles: [],
        regions: [{ id: 'r' }], places: [{ id: 'p', location: { lng: 1, lat: 2 } }], mediaAssets: [{ id: 'm' }], footprintMedia: [{ id: 'fm' }], footprints: [{ id: 'f', privatePoint: { lng: 1, lat: 2 }, displayPoint: { lng: 1, lat: 2 } }], discovery: [{ footprintId: 'f', displayPoint: { lng: 1, lat: 2 } }],
        reads: [{ footprintId: 'f' }], reactions: [{ footprintId: 'f' }], comments: [{ id: 'c' }], friendships: [{ id: 'fr' }], history: [{ id: 'fh' }], blocks: [{ blockerId: 'u' }],
        conversations: [{ id: 'co' }], participants: [{ id: 'cp' }], messages: [{ id: 'msg' }], receipts: [{ messageId: 'msg' }],
        notifications: [{ id: 'n' }], pushSubscriptions: [{ id: 'ps' }], preferences: [{ userId: 'u' }], reports: [{ id: 'rep' }], profileVisitors: [{ ownerId: 'u' }],
      }, digest: 'x', sideEffects: { outbox: 0, sockets: 0, push: 0, audit: 0 },
    } as never);
    for (const table of ['identity_credentials', 'identity_roles', 'regions', 'places', 'media_assets', 'footprint_media', 'footprints', 'discovery_entries', 'discovery_reads', 'footprint_reactions', 'footprint_comments', 'friendships', 'friendship_status_history', 'blocks', 'conversations', 'conversation_participants', 'messages', 'message_receipts', 'notifications', 'push_subscriptions', 'notification_preferences', 'reports', 'profile_visitors']) {
      expect(target.statements.some((statement) => statement.includes(`INSERT INTO ${table}`))).toBe(true);
    }
  });

  it('propagates an insert failure for the caller to rollback the empty target', async () => {
    const target = fakeTarget(0, 'identity_users');
    await expect(loadMigration(target, { rows: { identityUsers: [{ id: 'user' }] }, digest: 'x', sideEffects: { outbox: 0, sockets: 0, push: 0, audit: 0 } } as never)).rejects.toThrow('injected loader failure');
  });
});
