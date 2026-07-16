export const V2_TEST_NOW = '2026-07-15T08:00:00.000Z';

export interface V2TestUser {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly roles: readonly ('user' | 'moderator' | 'admin')[];
  readonly fixtureOnly: true;
}

export const V2_TEST_USERS = {
  guest: null,
  admin: {
    id: '019f0000-0000-7000-8000-000000000701',
    username: 'phase7-admin',
    displayName: 'Phase Seven Admin',
    roles: ['admin'],
    fixtureOnly: true,
  },
  userA: {
    id: '019f0000-0000-7000-8000-000000000702',
    username: 'phase7-user-a',
    displayName: 'River Walker',
    roles: ['user'],
    fixtureOnly: true,
  },
  userB: {
    id: '019f0000-0000-7000-8000-000000000703',
    username: 'phase7-user-b',
    displayName: 'Harbor Friend',
    roles: ['user'],
    fixtureOnly: true,
  },
} as const satisfies Record<'guest', null> & Record<'admin' | 'userA' | 'userB', V2TestUser>;

export type V2TestActor = keyof typeof V2_TEST_USERS;

export const V2_TEST_SESSIONS = {
  admin: '019f0000-0000-7000-8000-000000000704',
  userA: '019f0000-0000-7000-8000-000000000705',
  userB: '019f0000-0000-7000-8000-000000000706',
} as const;

export function publicUserFixture(actor: Exclude<V2TestActor, 'guest'>) {
  const user = V2_TEST_USERS[actor];
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: null,
    roles: [...user.roles],
  };
}

export function sessionFixture(actor: Exclude<V2TestActor, 'guest'>) {
  return {
    id: V2_TEST_SESSIONS[actor],
    deviceName: 'Phase 7 browser fixture',
    createdAt: V2_TEST_NOW,
    lastSeenAt: V2_TEST_NOW,
    current: true,
  };
}
