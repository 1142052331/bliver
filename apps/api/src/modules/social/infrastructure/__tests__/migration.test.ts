import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(import.meta.dirname, '../../../../../drizzle/0007_social_conversations.sql'), 'utf8');

describe('phase 5 social migration', () => {
  it('uses a canonical friendship pair with status history', () => {
    expect(migration).toMatch(/user_low_id uuid NOT NULL/i);
    expect(migration).toMatch(/user_high_id uuid NOT NULL/i);
    expect(migration).toMatch(/UNIQUE \(user_low_id, user_high_id\)/i);
    expect(migration).toMatch(/status IN \('pending', 'accepted', 'rejected'\)/i);
    expect(migration).toMatch(/CREATE TABLE friendship_status_history/i);
  });

  it('keeps directional blocks unique and forbids self blocks', () => {
    expect(migration).toMatch(/CREATE TABLE blocks/i);
    expect(migration).toMatch(/PRIMARY KEY \(blocker_id, blocked_id\)/i);
    expect(migration).toMatch(/CHECK \(blocker_id <> blocked_id\)/i);
  });
});
