import { randomUUID } from 'node:crypto';
import type { NotificationDto, NotificationPreferences, NotificationRecord, NotificationRepository, PushSubscription } from './types.js';

export interface NotificationEvent { readonly id: string; readonly type: string; readonly payload: Record<string, unknown>; }
export interface NotificationPolicy { isBlocked?(recipientId: string, actorId: string): Promise<boolean>; }
export class NotificationService {
  constructor(private readonly repository: NotificationRepository, private readonly policy: NotificationPolicy = {}) {}
  recipientForEvent(event: NotificationEvent): string | null { const p=event.payload;let value:unknown;if(event.type==='FriendshipRequested')value=p.addresseeId;else if(event.type==='FriendshipAccepted')value=p.requesterId;else if(event.type==='ReportCreated')value=p.reporterId;else if(/Suspended|RoleChanged|SessionsRevoked|ReportResolved/.test(event.type))value=p.recipientId??p.targetUserId??p.targetId;else value=p.recipientId??p.targetUserId??p.authorId??p.ownerId??p.recipient;return value?String(value):null; }
  async consume(event: NotificationEvent): Promise<NotificationDto | null> {
    const p = event.payload; const recipientId = this.recipientForEvent(event); if (!recipientId) return null;
    const actorValue=event.type==='FriendshipRequested'?p.requesterId:event.type==='FriendshipAccepted'?p.addresseeId:p.actorId??p.senderId;const actorId=actorValue?String(actorValue):undefined;if(actorId===recipientId&&event.type!=='ReportCreated')return null;if (actorId && await this.policy.isBlocked?.(recipientId, actorId)) return null;
    const type = this.mapType(event.type); if (!type || !(await this.repository.preferences(recipientId))[this.prefKey(type)]) return null;
    const existing = await this.repository.findByDedupe(recipientId, event.id); if (existing) return this.dto(existing);
    const record: NotificationRecord = { id: randomUUID(), recipientId, type, ...(actorId ? { actorId } : {}), targetType: String(p.targetType ?? 'event'), targetId: String(p.targetId ?? p.footprintId ?? event.id), payload: { reference: String(p.targetId ?? p.footprintId ?? event.id) }, createdAt: new Date(), dedupeKey: event.id, readAt: null };
    await this.repository.create(record); return this.dto(record);
  }
  async list(recipientId: string, cursor?: string) { const items = await this.repository.list(recipientId, cursor); return { items: items.map((item) => this.dto(item)), unreadCount: await this.repository.unreadCount(recipientId), nextCursor: items.length === 50 ? items.at(-1)?.createdAt.toISOString() ?? null : null }; }
  async markRead(recipientId: string, id: string): Promise<void> { await this.repository.markRead(recipientId, id); }
  async markAllRead(recipientId: string): Promise<void> { await this.repository.markAllRead(recipientId); }
  async getPreferences(userId: string): Promise<NotificationPreferences> { return this.repository.preferences(userId); }
  async setPreferences(userId: string, input: Partial<NotificationPreferences>): Promise<NotificationPreferences> { return this.repository.setPreferences(userId, input); }
  async subscribe(subscription: PushSubscription): Promise<void> { if (!this.repository.addSubscription) throw new Error('PUSH_UNAVAILABLE'); await this.repository.addSubscription(subscription); await this.repository.setPreferences(subscription.userId,{push:true}); }
  async unsubscribe(userId: string, endpoint: string): Promise<void> { if (!this.repository.removeSubscription) return; await this.repository.removeSubscription(userId, endpoint);const remaining=await this.repository.subscriptions?.(userId);if(!remaining?.length)await this.repository.setPreferences(userId,{push:false}); }
  private dto(item: NotificationRecord): NotificationDto { return { id: item.id, type: item.type, ...(item.actorId ? { actor: { id: item.actorId, name: item.actorId } } : {}), target: { type: item.targetType, id: item.targetId }, ...(item.readAt ? { readAt: item.readAt.toISOString() } : {}), createdAt: item.createdAt.toISOString() }; }
  private mapType(type: string): NotificationDto['type'] | null { if (/reaction/i.test(type)) return 'reaction'; if (/comment/i.test(type)) return 'comment'; if (/friend/i.test(type)) return 'friendship'; if (/greeting/i.test(type)) return 'greeting'; if (/message/i.test(type)) return 'message'; if (/report/i.test(type)) return 'report'; if (/admin|suspend|role|session/i.test(type)) return 'admin'; return null; }
  private prefKey(type: string): keyof NotificationPreferences { if (type === 'reaction') return 'reactions'; if (type === 'comment') return 'comments'; if (['friendship','greeting'].includes(type)) return 'social'; if (type === 'message') return 'messages'; if (type === 'admin' || type === 'report') return 'moderation'; return 'push'; }
}
