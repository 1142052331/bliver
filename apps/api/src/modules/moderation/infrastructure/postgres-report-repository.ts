import { parseFootprintId, parseUserId } from '@bliver/domain';
import type { DatabaseClient } from '../../../platform/db/client.js';
import { ReportError, type Report, type ReportRepository } from '../domain/reports.js';

type Row = Record<string, unknown>;
const report = (row: Row): Report => ({ id: String(row.id), footprintId: parseFootprintId(String(row.footprint_id)), reporterId: parseUserId(String(row.reporter_id)), reason: row.reason as Report['reason'], ...(row.details ? { details: String(row.details) } : {}), status: row.status as Report['status'], createdAt: new Date(String(row.created_at)) });
const storedReport = (value: unknown): Report => { const row = value as Record<string, unknown>; return { id: String(row.id), footprintId: parseFootprintId(String(row.footprintId)), reporterId: parseUserId(String(row.reporterId)), reason: row.reason as Report['reason'], ...(row.details ? { details: String(row.details) } : {}), status: row.status as Report['status'], createdAt: new Date(String(row.createdAt)) }; };
export function createPostgresReportRepository(db: DatabaseClient): ReportRepository { return {
  async findOpen(footprintId, reporterId) { const result = await db.query<Row>("SELECT id, footprint_id, reporter_id, reason, details, status, created_at FROM reports WHERE footprint_id=$1 AND reporter_id=$2 AND status='open'", [footprintId, reporterId]); return result.rows[0] ? report(result.rows[0]) : null; },
  async create(item) { await db.query('INSERT INTO reports (id,footprint_id,reporter_id,reason,details,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [item.id, item.footprintId, item.reporterId, item.reason, item.details ?? null, item.status, item.createdAt]); },
  async appendEvent(item) { await db.query('INSERT INTO platform.outbox_events (id,type,aggregate_id,payload) VALUES ($1,$2,$3,$4)', [item.id, item.type, item.aggregateId, JSON.stringify(item.payload)]); },
  transactions: { async createReport(input) {
    try {
      return await db.transaction(async (client) => {
        if (input.idempotency) {
          const reserved = await client.query<Row>('INSERT INTO platform.idempotency_keys (actor_id,scope,key,request_hash,response) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (actor_id,scope,key) DO NOTHING RETURNING request_hash,response', [input.idempotency.actorId, input.idempotency.scope, input.idempotency.key, input.idempotency.fingerprint, JSON.stringify(input.report)]);
          if (!reserved.rowCount) {
            const prior = await client.query<Row>('SELECT request_hash,response FROM platform.idempotency_keys WHERE actor_id=$1 AND scope=$2 AND key=$3', [input.idempotency.actorId, input.idempotency.scope, input.idempotency.key]);
            const row = prior.rows[0];
            if (!row || String(row.request_hash) !== input.idempotency.fingerprint) throw new ReportError('IDEMPOTENCY_CONFLICT');
            return storedReport(row.response);
          }
        }
        await client.query('INSERT INTO reports (id,footprint_id,reporter_id,reason,details,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [input.report.id, input.report.footprintId, input.report.reporterId, input.report.reason, input.report.details ?? null, input.report.status, input.report.createdAt]);
        await client.query('INSERT INTO platform.outbox_events (id,type,aggregate_id,payload) VALUES ($1,$2,$3,$4)', [input.event.id, input.event.type, input.event.aggregateId, JSON.stringify(input.event.payload)]);
        return input.report;
      });
    } catch (error) {
      const databaseError = error as { code?: string; constraint?: string };
      if (databaseError.code !== '23505' || (databaseError.constraint && databaseError.constraint !== 'reports_open_unique_idx')) throw error;
      const winner = await db.query<Row>("SELECT id, footprint_id, reporter_id, reason, details, status, created_at FROM reports WHERE footprint_id=$1 AND reporter_id=$2 AND status='open'", [input.report.footprintId, input.report.reporterId]);
      if (!winner.rows[0]) throw error;
      throw new ReportError('DUPLICATE_OPEN_REPORT');
    }
  } },
}; }
