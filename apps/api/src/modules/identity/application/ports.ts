import type { UserId } from '@bliver/domain';
import type { SessionPlatform } from '../domain/session.js';

export type Role = 'user' | 'moderator' | 'admin';

export interface UserRecord {
  id: UserId;
  username: string;
  email: string | null;
  displayName: string;
  createdAt: Date;
}

export interface CredentialRecord { userId: UserId; passwordHash: string; }
export interface DeviceRecord { id: string; userId: UserId; name: string; platform: SessionPlatform; }
export interface SessionRecord {
  id: string;
  userId: UserId;
  deviceId: string;
  familyId: string;
  tokenHash: string;
  refreshTokenHash: string | null;
  expiresAt: Date;
  createdAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
}

export interface UserRepository {
  findByUsername(username: string): Promise<UserRecord | null>;
  findById(id: UserId): Promise<UserRecord | null>;
  create(input: Omit<UserRecord, 'createdAt'>): Promise<UserRecord>;
}
export interface CredentialRepository {
  findByUserId(userId: UserId): Promise<CredentialRecord | null>;
  create(record: CredentialRecord): Promise<void>;
  replaceHash(userId: UserId, expectedHash: string, replacementHash: string): Promise<boolean>;
}
export interface DeviceRepository {
  create(record: DeviceRecord): Promise<DeviceRecord>;
}
export interface SessionRepository {
  create(record: SessionRecord): Promise<void>;
  findByTokenHash(hash: string): Promise<SessionRecord | null>;
  findById(id: string): Promise<SessionRecord | null>;
  listByUserId(userId: UserId): Promise<SessionRecord[]>;
  revoke(id: string, at?: Date): Promise<void>;
  revokeFamily(familyId: string, at?: Date): Promise<void>;
  rotate(id: string, replacement: SessionRecord, at?: Date): Promise<void>;
}

export interface RoleRepository { listByUserId(userId: UserId): Promise<Role[]>; }
export interface SecurityEventRepository { record(event: { userId: UserId | null; eventType: string; metadata?: Record<string, unknown> }): Promise<void>; }
export interface SuspensionRepository { isSuspended(userId: UserId): Promise<boolean>; }

export interface IdentityRepositories {
  readonly users: UserRepository;
  readonly credentials: CredentialRepository;
  readonly devices: DeviceRepository;
  readonly sessions: SessionRepository;
  readonly roles: RoleRepository;
  readonly securityEvents: SecurityEventRepository;
  readonly suspensions?: SuspensionRepository;
}
