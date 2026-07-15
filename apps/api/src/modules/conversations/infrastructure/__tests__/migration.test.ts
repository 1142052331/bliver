import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(import.meta.dirname, '../../../../../drizzle/0008_conversations.sql'), 'utf8');

describe('phase 5 conversation migration', () => {
  it('stores participant pairs, state transitions, and bounded messages', () => {
    expect(migration).toMatch(/CREATE TABLE conversations/i);
    expect(migration).toMatch(/UNIQUE \(participant_low_id, participant_high_id\)/i);
    expect(migration).toMatch(/state IN \('requested', 'active', 'ignored', 'blocked'\)/i);
    expect(migration).toMatch(/char_length\(content\) BETWEEN 1 AND 2000/i);
  });

  it('keeps receipts and typing presence keyed and expiring', () => {
    expect(migration).toMatch(/PRIMARY KEY \(conversation_id, message_id, user_id\)/i);
    expect(migration).toMatch(/CREATE TABLE typing_presence/i);
    expect(migration).toMatch(/expires_at timestamptz NOT NULL/i);
  });
});
