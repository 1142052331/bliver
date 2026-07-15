import { createEventId, parseFootprintId, parseUserId, type FootprintId, type UserId } from '@bliver/domain';
import type { ActorContext } from '../../identity/index.js';

export type ReportReason = 'spam' | 'harassment' | 'hate' | 'privacy' | 'illegal' | 'other';
export interface Report { readonly id: string; readonly footprintId: FootprintId; readonly reporterId: UserId; readonly reason: ReportReason; readonly details?: string; readonly status: 'open' | 'resolved' | 'dismissed'; readonly createdAt: Date; }
export interface ReportRepository { findOpen(footprintId: FootprintId, reporterId: UserId): Promise<Report | null>; create(report: Report): Promise<void>; appendEvent(event: { id: string; type: 'ReportCreated'; aggregateId: FootprintId; payload: Record<string, unknown> }): Promise<void>; }
export interface ReportAccess { canReport(actor: ActorContext, footprintId: FootprintId): Promise<boolean>; }
export class ReportError extends Error { constructor(readonly code: 'AUTH_REQUIRED' | 'INVALID_REASON' | 'DUPLICATE_OPEN_REPORT' | 'BLOCKED') { super(code); this.name = 'ReportError'; } }

export class CreateReport {
  constructor(private readonly repository: ReportRepository, private readonly access: ReportAccess, private readonly now: () => Date = () => new Date()) {}
  async execute(actor: ActorContext | null, input: { footprintId: string; reason: ReportReason; details?: string }): Promise<Report> {
    if (!actor) throw new ReportError('AUTH_REQUIRED');
    if (!['spam', 'harassment', 'hate', 'privacy', 'illegal', 'other'].includes(input.reason)) throw new ReportError('INVALID_REASON');
    const footprintId = parseFootprintId(input.footprintId); const reporterId = parseUserId(actor.userId);
    if (!(await this.access.canReport(actor, footprintId))) throw new ReportError('BLOCKED');
    if (await this.repository.findOpen(footprintId, reporterId)) throw new ReportError('DUPLICATE_OPEN_REPORT');
    const report: Report = { id: createEventId(), footprintId, reporterId, reason: input.reason, ...(input.details?.trim() ? { details: input.details.trim() } : {}), status: 'open', createdAt: this.now() };
    await this.repository.create(report); await this.repository.appendEvent({ id: createEventId(), type: 'ReportCreated', aggregateId: footprintId, payload: { reportId: report.id, reporterId, reason: report.reason } }); return report;
  }
}

export function createMemoryReportRepository(): ReportRepository {
  const reports = new Map<string, Report>();
  return { async findOpen(footprintId, reporterId) { return reports.get(`${footprintId}:${reporterId}`) ?? null; }, async create(report) { reports.set(`${report.footprintId}:${report.reporterId}`, report); }, async appendEvent() { return undefined; } };
}
