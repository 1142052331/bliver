import { describe, expect, it } from 'vitest';
import { createFootprintId, createUserId } from '@bliver/domain';
import type { ActorContext } from '../../../identity/index.js';
import { CreateReport, createMemoryReportRepository } from '../reports.js';
const actor: ActorContext = { userId: createUserId(), sessionId: 'session', roles: ['user'], transport: 'bearer' }; const footprintId = createFootprintId();
describe('CreateReport', () => {
  it('rejects anonymous intake, invalid reasons, and duplicate open reports', async () => { const create = new CreateReport(createMemoryReportRepository(), { async canReport() { return true; } }); await expect(create.execute(null, { footprintId, reason: 'spam' })).rejects.toThrow('AUTH_REQUIRED'); await expect(create.execute(actor, { footprintId, reason: 'spam' })).resolves.toMatchObject({ status: 'open' }); await expect(create.execute(actor, { footprintId, reason: 'spam' })).rejects.toThrow('DUPLICATE_OPEN_REPORT'); });
  it('rejects blocked reporters before creating an intake record', async () => { const create = new CreateReport(createMemoryReportRepository(), { async canReport() { return false; } }); await expect(create.execute(actor, { footprintId, reason: 'harassment' })).rejects.toThrow('BLOCKED'); });
});
