import type { LegacyRecord } from '../adapters/fixture-source.js';
import { DeterministicIdRegistry } from './ids.js';

const asDate = (value: unknown): Date => new Date(String(value));

export function transformIdentity(users: readonly LegacyRecord[], ids = new DeterministicIdRegistry()) {
  const userRows = users.map((source) => {
    const id = ids.id('user', String(source._id));
    const username = String(source.name).trim();
    return { id, username, displayName: source.migrationSynthetic === true ? 'Deleted user' : username, email: null, createdAt: asDate(source.createdAt), updatedAt: asDate(source.updatedAt) };
  });
  const userIdBySource = new Map(users.map((source, index) => [String(source._id), userRows[index]!.id]));
  const credentials = users.filter((source) => source.migrationSynthetic !== true).map((source) => ({
    userId: userIdBySource.get(String(source._id))!,
    passwordHash: String(source.password),
    createdAt: asDate(source.createdAt),
    updatedAt: asDate(source.updatedAt),
  }));
  const roles = users.flatMap((source) => {
    const userId = userIdBySource.get(String(source._id))!;
    const rows: Array<{ userId: string; role: 'user' | 'admin'; createdAt: Date }> = [{ userId, role: 'user', createdAt: asDate(source.createdAt) }];
    if (source.role === 'admin') rows.push({ userId, role: 'admin', createdAt: asDate(source.createdAt) });
    return rows;
  });
  const adminRoles = users
    .filter((source) => source.role === 'admin')
    .map((source) => ({ userId: userIdBySource.get(String(source._id))!, role: 'admin' as const, grantedBy: null, createdAt: asDate(source.createdAt) }));
  return { users: userRows, credentials, roles, adminRoles, userIdBySource };
}
