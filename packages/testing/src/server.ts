import { V2_TEST_SOCIAL } from './social.js';

export interface BrowserJourneyState {
  readonly conversationId: string;
  friendship: 'none' | 'pending' | 'accepted';
  conversation: 'none' | 'requested' | 'active' | 'blocked';
  online: boolean;
  outboxDelayMs: number;
  readonly blockedUserIds: Set<string>;
  readonly revokedActors: Set<'admin' | 'userA' | 'userB'>;
}

export function createJourneyState(): BrowserJourneyState {
  return {
    conversationId: V2_TEST_SOCIAL.conversationId,
    friendship: 'none',
    conversation: 'none',
    online: true,
    outboxDelayMs: 0,
    blockedUserIds: new Set(),
    revokedActors: new Set(),
  };
}
