export interface ConfigDiagnostics {
  readonly mongoConfigured: boolean;
  readonly targetConfigured: boolean;
  readonly ageRecipientCount: number;
}

export type ConfigResult =
  | { readonly ok: false; readonly code: 'MONGO_DATABASE_REQUIRED' }
  | { readonly ok: true; readonly diagnostics: ConfigDiagnostics };

export function loadConfig(environment: Readonly<Record<string, string | undefined>>): ConfigResult {
  const mongoConfigured = Boolean(environment.LEGACY_MONGO_URL?.trim());
  if (mongoConfigured && !environment.LEGACY_MONGO_DATABASE?.trim()) {
    return { ok: false, code: 'MONGO_DATABASE_REQUIRED' };
  }
  const ageRecipientCount = environment.AGE_RECIPIENTS
    ?.split(',')
    .map((recipient) => recipient.trim())
    .filter(Boolean).length ?? 0;
  return {
    ok: true,
    diagnostics: {
      mongoConfigured,
      targetConfigured: Boolean(environment.TARGET_DATABASE_URL?.trim()),
      ageRecipientCount,
    },
  };
}
