export type Classification = 'migrated' | 'archived-only' | 'blocked';

export interface CollectionCounts {
  readonly source: number;
  readonly migrated: number;
  readonly archivedOnly: number;
  readonly blocked: number;
}

export interface MigrationIssue {
  readonly code: string;
  readonly collection: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export class MigrationError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
