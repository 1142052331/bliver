import { createEventId, parseFootprintId, parseUserId, type FootprintId, type UserId } from '@bliver/domain';
import type { ActorContext } from '../../identity/index.js';

export type ReportReason = 'spam' | 'harassment' | 'hate' | 'privacy' | 'illegal' | 'other';
export interface Report { readonly id: string; readonly footprintId: FootprintId; readonly reporterId: UserId; readonly reason: ReportReason; readonly details?: string; readonly status: 'open' | 'resolved' | 'dismissed'; readonly createdAt: Date; }
export interface ReportRepository { findOpen(footprintId: FootprintId, reporterId: UserId): Promise<Report | null>; create(report: Report): Promise<void>; appendEvent(event: { id: string; type: 'ReportCreated'; aggregateId: FootprintId; payload: Record<string, unknown> }): Promise<void>; readonly transactions?: ReportTransactionPort; }
export interface ReportTransactionPort { createReport(input: { readonly report: Report; readonly event: { id: string; type: 'ReportCreated'; aggregateId: FootprintId; payload: Record<string, unknown> }; readonly idempotency?: { readonly actorId: UserId; readonly scope: 'moderation.report'; readonly key: string; readonly fingerprint: string } }): Promise<Report>; }
export interface ReportAccess { canReport(actor: ActorContext, footprintId: FootprintId): Promise<boolean>; }
export class ReportError extends Error { constructor(readonly code: 'AUTH_REQUIRED' | 'INVALID_REASON' | 'DUPLICATE_OPEN_REPORT' | 'BLOCKED' | 'IDEMPOTENCY_CONFLICT') { super(code); this.name = 'ReportError'; } }

export class CreateReport {
  constructor(private readonly repository: ReportRepository, private readonly access: ReportAccess, private readonly now: () => Date = () => new Date()) {}
  async execute(actor: ActorContext | null, input: { footprintId: string; reason: ReportReason; details?: string }, idempotency?: { readonly key: string; readonly fingerprint: string }): Promise<Report> {
    if (!actor) throw new ReportError('AUTH_REQUIRED');
    if (!['spam', 'harassment', 'hate', 'privacy', 'illegal', 'other'].includes(input.reason)) throw new ReportError('INVALID_REASON');
    const footprintId = parseFootprintId(input.footprintId); const reporterId = parseUserId(actor.userId);
    if (!(await this.access.canReport(actor, footprintId))) throw new ReportError('BLOCKED');
    if (!this.repository.transactions && await this.repository.findOpen(footprintId, reporterId)) throw new ReportError('DUPLICATE_OPEN_REPORT');
    const report: Report = { id: createEventId(), footprintId, reporterId, reason: input.reason, ...(input.details?.trim() ? { details: input.details.trim() } : {}), status: 'open', createdAt: this.now() };
    const event = { id: createEventId(), type: 'ReportCreated' as const, aggregateId: footprintId, payload: { reportId: report.id, reporterId, reason: report.reason } };
    if (this.repository.transactions) return this.repository.transactions.createReport({ report, event, ...(idempotency ? { idempotency: { actorId: reporterId, scope: 'moderation.report', ...idempotency } } : {}) });
    await this.repository.create(report); await this.repository.appendEvent(event); return report;
  }
}

export function createMemoryReportRepository(): ReportRepository {
  const reports = new Map<string, Report>(); const idempotency = new Map<string, { fingerprint: string; report: Report }>();
  return { async findOpen(footprintId, reporterId) { return reports.get(`${footprintId}:${reporterId}`) ?? null; }, async create(report) { reports.set(`${report.footprintId}:${report.reporterId}`, report); }, async appendEvent() { return undefined; }, transactions: { async createReport(input) { if (input.idempotency) { const key = `${input.idempotency.actorId}:${input.idempotency.scope}:${input.idempotency.key}`; const prior = idempotency.get(key); if (prior) { if (prior.fingerprint !== input.idempotency.fingerprint) throw new ReportError('IDEMPOTENCY_CONFLICT'); return prior.report; } } const openKey = `${input.report.footprintId}:${input.report.reporterId}`; if (reports.has(openKey)) throw new ReportError('DUPLICATE_OPEN_REPORT'); if (input.idempotency) idempotency.set(`${input.idempotency.actorId}:${input.idempotency.scope}:${input.idempotency.key}`, { fingerprint: input.idempotency.fingerprint, report: input.report }); reports.set(openKey, input.report); return input.report; } } };
}
