import type { NotificationDto, NotificationRepository, PushSubscription } from '../domain/types.js';

export interface PushProvider { send(subscription: PushSubscription, payload: string, vapid: { publicKey: string; privateKey: string; subject: string }): Promise<void>; }
export interface PushConfiguration { readonly publicKey?: string; readonly privateKey?: string; readonly subject?: string; }
export class PushUnavailableError extends Error { readonly code='PUSH_UNAVAILABLE'; }
export class PushExpiredError extends Error { readonly code='PUSH_EXPIRED'; }
export class PushAdapter {
  constructor(private readonly provider: PushProvider, private readonly config: PushConfiguration) {}
  publicKey(): string | null { return this.config.publicKey ?? null; }
  async deliver(subscription: PushSubscription, notification: NotificationDto): Promise<void> {
    if (!this.config.publicKey || !this.config.privateKey || !this.config.subject) throw new PushUnavailableError('VAPID is not configured');
    try { await this.provider.send(subscription, JSON.stringify({ id:notification.id, type:notification.type, target:notification.target, createdAt:notification.createdAt }), { publicKey:this.config.publicKey, privateKey:this.config.privateKey, subject:this.config.subject }); }
    catch (error) { const status=(error as { statusCode?:number; status?:number }).statusCode ?? (error as {status?:number}).status; if(status===404||status===410) throw new PushExpiredError('Subscription expired'); throw error; }
  }
}

export class PushDeliveryConsumer {
  constructor(private readonly adapter: PushAdapter, private readonly repository: NotificationRepository, private readonly maxAttempts=3) {}
  async deliver(userId: string, notification: NotificationDto): Promise<{ delivered: number; failed: number }> { const subscriptions=await this.repository.subscriptions?.(userId)??[]; let delivered=0;let failed=0;for(const subscription of subscriptions){let complete=false;for(let attempt=1;attempt<=this.maxAttempts&&!complete;attempt+=1){try{await this.adapter.deliver(subscription,notification);delivered+=1;complete=true;}catch(error){if(error instanceof PushExpiredError){await this.repository.removeSubscription?.(userId,subscription.endpoint);complete=true;failed+=1;}else if(error instanceof PushUnavailableError||attempt===this.maxAttempts){failed+=1;complete=true;}}}}return{delivered,failed}; }
}
