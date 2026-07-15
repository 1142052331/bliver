import { describe, expect, it, vi } from 'vitest';
import { createEventId, createFootprintId, createUserId } from '@bliver/domain';
import type { DatabaseClient, DatabaseQueryPort } from '../../../../platform/db/client.js';
import type { Report } from '../../domain/reports.js';
import { createPostgresReportRepository } from '../postgres-report-repository.js';

const report: Report = { id: createEventId(), footprintId: createFootprintId(), reporterId: createUserId(), reason: 'spam', status: 'open', createdAt: new Date('2026-07-15T08:00:00.000Z') };
const event = { id: createEventId(), type: 'ReportCreated' as const, aggregateId: report.footprintId, payload: { reportId: report.id } };

it('loads the committed report winner after a unique-open race', async () => {
  const winner = { ...report, id: createEventId() };
  const unique = Object.assign(new Error('duplicate'), { code: '23505' });
  const transaction = vi.fn(async () => { throw unique; });
  const query = vi.fn(async () => ({ rows: [{ id: winner.id, footprint_id: winner.footprintId, reporter_id: winner.reporterId, reason: winner.reason, status: winner.status, created_at: winner.createdAt }], rowCount: 1 }));
  const repository = createPostgresReportRepository({ query: query as unknown as DatabaseQueryPort['query'], transaction } as unknown as DatabaseClient);
  await expect(repository.transactions!.createReport({ report, event })).resolves.toMatchObject({ id: winner.id });
  expect(query).toHaveBeenCalledWith(expect.stringContaining("status='open'"), [report.footprintId, report.reporterId]);
});

describe('Postgres report transaction', () => {
  it('writes the report and Outbox event atomically', async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 1 }));
    const client = { query: query as unknown as DatabaseQueryPort['query'] };
    const repository = createPostgresReportRepository({ query: client.query, async transaction<T>(callback: (value: DatabaseQueryPort) => Promise<T>) { return callback(client); } } as unknown as DatabaseClient);
    await expect(repository.transactions!.createReport({ report, event })).resolves.toBe(report);
    expect((query.mock.calls as unknown as Array<[string]>).map(([sql]) => String(sql))).toEqual([expect.stringContaining('INSERT INTO reports'), expect.stringContaining('INSERT INTO platform.outbox_events')]);
  });
});
