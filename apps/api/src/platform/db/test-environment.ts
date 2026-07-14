export function resolvePostgisDatabaseUrl(): string | undefined {
  const configuredUrl = process.env.V2_DATABASE_URL?.trim();
  return configuredUrl || undefined;
}
