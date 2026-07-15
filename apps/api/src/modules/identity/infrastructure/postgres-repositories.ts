import type { DatabaseClient } from '../../../platform/db/client.js';
import type { IdentityRepositories, UserRepository, CredentialRepository, DeviceRepository, SessionRepository, RoleRepository, SecurityEventRepository, UserRecord, CredentialRecord, DeviceRecord, SessionRecord, Role } from '../application/ports.js';
import type { UserId } from '@bliver/domain';

type Row = Record<string, unknown>;
const asDate = (value: unknown): Date => new Date(String(value));
const userFrom = (row: Row): UserRecord => ({ id: row.id as UserId, username: String(row.username), email: row.email ? String(row.email) : null, displayName: String(row.display_name), createdAt: asDate(row.created_at) });

export function createPostgresIdentityRepositories(db: DatabaseClient): IdentityRepositories {
  const users: UserRepository = {
    async findByUsername(username) { const result = await db.query<Row>('SELECT id, username, email, display_name, created_at FROM identity_users WHERE username = $1', [username]); return result.rows[0] ? userFrom(result.rows[0]) : null; },
    async findById(id) { const result = await db.query<Row>('SELECT id, username, email, display_name, created_at FROM identity_users WHERE id = $1', [id]); return result.rows[0] ? userFrom(result.rows[0]) : null; },
    async create(input) { const result = await db.query<Row>('INSERT INTO identity_users (id, username, email, display_name) VALUES ($1, $2, $3, $4) RETURNING id, username, email, display_name, created_at', [input.id, input.username, input.email, input.displayName]); const row = result.rows[0]; if (!row) throw new Error('USER_CREATE_FAILED'); return userFrom(row); },
  };
  const credentials: CredentialRepository = {
    async findByUserId(userId) { const result = await db.query<Row>('SELECT user_id, password_hash FROM identity_credentials WHERE user_id = $1', [userId]); const row = result.rows[0]; return row ? { userId: row.user_id as UserId, passwordHash: String(row.password_hash) } : null; },
    async create(record: CredentialRecord) { await db.query('INSERT INTO identity_credentials (user_id, password_hash) VALUES ($1, $2)', [record.userId, record.passwordHash]); },
  };
  const devices: DeviceRepository = { async create(record: DeviceRecord) { await db.query('INSERT INTO identity_devices (id, user_id, name, platform) VALUES ($1, $2, $3, $4)', [record.id, record.userId, record.name, record.platform]); return record; } };
  const sessions: SessionRepository = {
    async create(record) { await db.query('INSERT INTO identity_sessions (id, user_id, device_id, family_id, token_hash, refresh_token_hash, expires_at, created_at, last_seen_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [record.id, record.userId, record.deviceId, record.familyId, record.tokenHash, record.refreshTokenHash, record.expiresAt, record.createdAt, record.lastSeenAt]); },
    async findByTokenHash(hash) { const result = await db.query<Row>('SELECT * FROM identity_sessions WHERE token_hash = $1 OR refresh_token_hash = $1', [hash]); return result.rows[0] ? sessionFrom(result.rows[0]) : null; },
    async findById(id) { const result = await db.query<Row>('SELECT * FROM identity_sessions WHERE id = $1', [id]); return result.rows[0] ? sessionFrom(result.rows[0]) : null; },
    async listByUserId(userId) { const result = await db.query<Row>('SELECT * FROM identity_sessions WHERE user_id = $1 ORDER BY created_at DESC', [userId]); return result.rows.map(sessionFrom); },
    async revoke(id, at = new Date()) { await db.query('UPDATE identity_sessions SET revoked_at = $2 WHERE id = $1', [id, at]); },
    async revokeFamily(familyId, at = new Date()) { await db.query('UPDATE identity_sessions SET revoked_at = $2 WHERE family_id = $1', [familyId, at]); },
    async rotate(id, replacement, at = new Date()) { await this.revoke(id, at); await this.create(replacement); },
  };
  const roles: RoleRepository = { async listByUserId(userId) { const result = await db.query<Row>('SELECT role FROM identity_roles WHERE user_id = $1 ORDER BY role', [userId]); return result.rows.map((row) => row.role as Role); } };
  const securityEvents: SecurityEventRepository = { async record(event) { await db.query('INSERT INTO identity_security_events (id, user_id, event_type, metadata) VALUES (gen_random_uuid(), $1, $2, $3)', [event.userId, event.eventType, JSON.stringify(event.metadata ?? {})]); } };
  return { users, credentials, devices, sessions, roles, securityEvents };
}

function sessionFrom(row: Row): SessionRecord { return { id: String(row.id), userId: row.user_id as UserId, deviceId: String(row.device_id), familyId: String(row.family_id), tokenHash: String(row.token_hash), refreshTokenHash: row.refresh_token_hash ? String(row.refresh_token_hash) : null, expiresAt: asDate(row.expires_at), createdAt: asDate(row.created_at), lastSeenAt: asDate(row.last_seen_at), revokedAt: row.revoked_at ? asDate(row.revoked_at) : null }; }
