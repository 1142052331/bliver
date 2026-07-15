import { parseFootprintId, parseUserId } from '@bliver/domain';
import type { DatabaseClient } from '../../../platform/db/client.js';
import type { Report, ReportRepository } from '../domain/reports.js';

type Row = Record<string, unknown>;
const report = (row: Row): Report => ({ id: String(row.id), footprintId: parseFootprintId(String(row.footprint_id)), reporterId: parseUserId(String(row.reporter_id)), reason: row.reason as Report['reason'], ...(row.details ? { details: String(row.details) } : {}), status: row.status as Report['status'], createdAt: new Date(String(row.created_at)) });
export function createPostgresReportRepository(db: DatabaseClient): ReportRepository { return {
  async findOpen(footprintId, reporterId) { const result = await db.query<Row>("SELECT id, footprint_id, reporter_id, reason, details, status, created_at FROM reports WHERE footprint_id=$1 AND reporter_id=$2 AND status='open'", [footprintId, reporterId]); return result.rows[0] ? report(result.rows[0]) : null; },
  async create(item) { await db.query('INSERT INTO reports (id,footprint_id,reporter_id,reason,details,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [item.id, item.footprintId, item.reporterId, item.reason, item.details ?? null, item.status, item.createdAt]); },
  async appendEvent(item) { await db.query('INSERT INTO platform.outbox_events (id,type,aggregate_id,payload) VALUES ($1,$2,$3,$4)', [item.id, item.type, item.aggregateId, JSON.stringify(item.payload)]); },
}; }
