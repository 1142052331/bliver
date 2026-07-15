import { describe, expect, it, vi } from 'vitest';

import { executeTransaction, type DatabaseQueryPort } from '../client.js';

function queryPort() {
  const statements: string[] = [];
  const query = vi.fn(async (statement: string) => {
    statements.push(statement);
    return { rows: [], rowCount: 0 };
  }) as unknown as DatabaseQueryPort['query'];
  return { port: { query } satisfies DatabaseQueryPort, statements };
}

describe('database transaction port', () => {
  it('commits after the callback succeeds', async () => {
    const fake = queryPort();

    await expect(executeTransaction(fake.port, async (client) => {
      await client.query('INSERT INTO example VALUES ($1)', ['value']);
      return 'committed';
    })).resolves.toBe('committed');

    expect(fake.statements).toEqual(['BEGIN', 'INSERT INTO example VALUES ($1)', 'COMMIT']);
  });

  it('rolls back and rethrows when the callback fails', async () => {
    const fake = queryPort();
    const failure = new Error('write failed');

    await expect(executeTransaction(fake.port, async (client) => {
      await client.query('UPDATE example SET value = $1', ['value']);
      throw failure;
    })).rejects.toBe(failure);

    expect(fake.statements).toEqual(['BEGIN', 'UPDATE example SET value = $1', 'ROLLBACK']);
  });
});
