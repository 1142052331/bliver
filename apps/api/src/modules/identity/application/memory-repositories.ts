import { createUserId } from '@bliver/domain';
import type { IdentityRepositories, UserRecord, CredentialRecord, DeviceRecord, SessionRecord, Role, UserRepository, CredentialRepository, DeviceRepository, SessionRepository, RoleRepository, SecurityEventRepository } from './ports.js';

export function createMemoryIdentityRepositories(): IdentityRepositories {
  const users = new Map<string, UserRecord>();
  const credentials = new Map<string, CredentialRecord>();
  const devices = new Map<string, DeviceRecord>();
  const sessions = new Map<string, SessionRecord>();
  const roles = new Map<string, Role[]>();
  const events: Array<{ userId: string | null; eventType: string; metadata?: Record<string, unknown> }> = [];
  const userRepo: UserRepository = {
    async findByUsername(username) { return [...users.values()].find((u) => u.username === username) ?? null; },
    async findById(id) { return users.get(id) ?? null; },
    async findByIds(ids) { return ids.flatMap((id) => { const user = users.get(id); return user ? [user] : []; }); },
    async create(input) { const record = { ...input, createdAt: new Date() }; users.set(record.id, record); roles.set(record.id, ['user']); return record; },
  };
  const credentialRepo: CredentialRepository = {
    async findByUserId(userId) { return credentials.get(userId) ?? null; },
    async create(record) { credentials.set(record.userId, record); },
    async replaceHash(userId, expectedHash, replacementHash) {
      const current = credentials.get(userId);
      if (!current || current.passwordHash !== expectedHash) return false;
      credentials.set(userId, { ...current, passwordHash: replacementHash });
      return true;
    },
  };
  const deviceRepo: DeviceRepository = { async create(record) { devices.set(record.id, record); return record; } };
  const sessionRepo: SessionRepository = {
    async create(record) { sessions.set(record.id, record); },
    async findByTokenHash(hash) { return [...sessions.values()].find((s) => s.tokenHash === hash || s.refreshTokenHash === hash) ?? null; },
    async findById(id) { return sessions.get(id) ?? null; },
    async listByUserId(userId) { return [...sessions.values()].filter((s) => s.userId === userId); },
    async revoke(id, at = new Date()) { const s = sessions.get(id); if (s) sessions.set(id, { ...s, revokedAt: at }); },
    async revokeFamily(familyId, at = new Date()) { for (const [id, s] of sessions) if (s.familyId === familyId) sessions.set(id, { ...s, revokedAt: at }); },
    async rotate(id, replacement, at = new Date()) { await this.revoke(id, at); sessions.set(replacement.id, replacement); },
  };
  const roleRepo: RoleRepository = { async listByUserId(userId) { return roles.get(userId) ?? []; } };
  const securityEvents: SecurityEventRepository = { async record(event) { events.push(event); } };
  void createUserId;
  return { users: userRepo, credentials: credentialRepo, devices: deviceRepo, sessions: sessionRepo, roles: roleRepo, securityEvents };
}
