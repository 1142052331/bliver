import type { NotificationPreferences, NotificationRecord, NotificationRepository, PushSubscription } from '../domain/types.js';
const defaults: NotificationPreferences = { reactions:true,comments:true,social:true,messages:true,moderation:true,push:false };
export function createMemoryNotificationRepository(): NotificationRepository {
  const records: NotificationRecord[]=[];const prefs=new Map<string,NotificationPreferences>();const subscriptions=new Map<string,PushSubscription[]>();const attempts:unknown[]=[];
  return {
    async create(record){if(!records.some((item)=>item.recipientId===record.recipientId&&item.dedupeKey===record.dedupeKey))records.push(record);},
    async findByDedupe(recipientId,key){return records.find((item)=>item.recipientId===recipientId&&item.dedupeKey===key)??null;},
    async list(recipientId,cursor){return records.filter((item)=>item.recipientId===recipientId&&(!cursor||item.createdAt.toISOString()<cursor)).sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime()).slice(0,50);},
    async unreadCount(recipientId){return records.filter((item)=>item.recipientId===recipientId&&!item.readAt).length;},
    async markRead(recipientId,id){const item=records.find((value)=>value.recipientId===recipientId&&value.id===id);if(item)(item as {readAt:Date|null}).readAt=new Date();},
    async markAllRead(recipientId){for(const item of records.filter((value)=>value.recipientId===recipientId&&!value.readAt))(item as {readAt:Date|null}).readAt=new Date();},
    async preferences(userId){return prefs.get(userId)??defaults;},async setPreferences(userId,input){const value={...(prefs.get(userId)??defaults),...input};prefs.set(userId,value);return value;},
    async addSubscription(value){for(const [owner,list] of subscriptions)if(owner!==value.userId&&list.some((item)=>item.endpoint===value.endpoint))throw new Error('PUSH_SUBSCRIPTION_OWNED');const list=subscriptions.get(value.userId)??[];subscriptions.set(value.userId,[...list.filter((item)=>item.endpoint!==value.endpoint),value]);},
    async removeSubscription(userId,endpoint){subscriptions.set(userId,(subscriptions.get(userId)??[]).filter((item)=>item.endpoint!==endpoint));},async subscriptions(userId){return subscriptions.get(userId)??[];},async recordDeliveryAttempt(input){attempts.push(input);},
  };
}
