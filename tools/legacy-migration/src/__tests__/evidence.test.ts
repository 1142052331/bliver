import { describe, expect, it } from 'vitest';

import { buildEvidence } from '../adapters/evidence.js';

describe('migration evidence', () => {
  it('keeps record details only in the encryption-required ledger', () => {
    const sentinel = {
      mongoUrl: 'mongodb://user:secret@source.invalid/bliver',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
      endpoint: 'https://push.invalid/subscription-secret',
      sourceId: '507f1f77bcf86cd799439011',
      message: 'private message content',
      privatePoint: { lat: 31.2304, lng: 121.4737 },
    };
    const evidence = buildEvidence({
      runId: 'run-fixture',
      archiveSha256: 'a'.repeat(64),
      candidateSha: 'b'.repeat(40),
      counts: { User: { source: 1, migrated: 0, archivedOnly: 0, blocked: 1 } },
      errors: [{ code: 'USERNAME_V2_INCOMPATIBLE', collection: 'User', details: sentinel }],
    });

    const publicJson = JSON.stringify(evidence.publicReport);
    for (const secret of Object.values(sentinel).filter((value): value is string => typeof value === 'string')) {
      expect(publicJson).not.toContain(secret);
    }
    expect(publicJson).not.toContain('31.2304');
    expect(evidence.encryptedLedgerRequired).toBe(true);
    expect(evidence.ledger.errors[0]?.details).toEqual(sentinel);
  });
});
