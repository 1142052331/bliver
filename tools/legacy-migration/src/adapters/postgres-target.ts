export interface QueryResult { readonly rows: readonly Record<string, unknown>[]; readonly rowCount: number }
export interface QueryClient { query(sql: string, values?: readonly unknown[]): Promise<QueryResult> }
export interface MigrationTarget {
  empty(): Promise<void>;
  transaction<T>(callback: (client: QueryClient) => Promise<T>): Promise<T>;
}

export async function loadMigration(target: MigrationTarget, plan: { readonly rows: Record<string, unknown>; readonly digest: string }): Promise<{ readonly digest: string }> {
  await target.empty();
  await target.transaction(async (client) => {
    for (const row of plan.rows.identityUsers as Array<Record<string, unknown>>) {
      await client.query('INSERT INTO identity_users (id, username, email, display_name, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6)', [row.id, row.username, row.email, row.displayName, row.createdAt, row.updatedAt]);
    }
  });
  return { digest: plan.digest };
}
