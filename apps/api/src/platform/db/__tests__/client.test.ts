import { describe, expect, it, vi } from 'vitest';

import { executeTransaction, observeDatabaseQuery, type DatabaseQueryPort } from '../client.js';

function queryPort() {
  const statements: string[] = [];
  const query = vi.fn(async (statement: string) => {
    statements.push(statement);
    return { rows: [], rowCount: 0 };
  }) as unknown as DatabaseQueryPort['query'];
  return { port: { query } satisfies DatabaseQueryPort, statements };
}

describe('database transaction port', () => {
  it('reports slow queries and pool failures without exposing SQL', async () => {
    const dependency = vi.fn();
    const times = [0, 600, 700, 710];
    await expect(observeDatabaseQuery(async () => ({ rows: [] }), { dependency }, () => times.shift() ?? 0, 500)).resolves.toEqual({ rows: [] });
    await expect(observeDatabaseQuery(async () => { throw new Error('pool down'); }, { dependency }, () => times.shift() ?? 0, 500)).rejects.toThrow('pool down');
    expect(dependency).toHaveBeenCalledWith('slowQuery', false);
    expect(dependency).toHaveBeenCalledWith('dbPool', false);
    expect(JSON.stringify(dependency.mock.calls)).not.toMatch(/SELECT|pool down/);
  });

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
