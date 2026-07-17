import type { CollectionCounts, MigrationIssue } from '../domain/types.js';

export interface EvidenceInput {
  readonly runId: string;
  readonly archiveSha256: string;
  readonly candidateSha: string;
  readonly counts: Readonly<Record<string, CollectionCounts>>;
  readonly errors: readonly MigrationIssue[];
}

export function buildEvidence(input: EvidenceInput) {
  return {
    publicReport: {
      runId: input.runId,
      archiveSha256: input.archiveSha256,
      candidateSha: input.candidateSha,
      counts: input.counts,
      errors: input.errors.map(({ code, collection }) => ({ code, collection })),
    },
    encryptedLedgerRequired: input.errors.length > 0,
    ledger: input,
  } as const;
}
