import { describe,expect,it } from 'vitest';
import { createMemoryNotificationRepository } from '../../application/memory-repository.js';
import { NotificationService } from '../service.js';
describe('notifications',()=>{
  it('maps and deduplicates events without copying private payload',async()=>{const service=new NotificationService(createMemoryNotificationRepository());const event={id:'event-1',type:'CommentAdded',payload:{recipientId:'owner',actorId:'actor',footprintId:'footprint',privatePoint:{lat:1,lng:2},content:'hidden'}};await service.consume(event);await service.consume(event);const page=await service.list('owner');expect(page.items).toHaveLength(1);expect(JSON.stringify(page.items[0])).not.toContain('privatePoint');expect(JSON.stringify(page.items[0])).not.toContain('hidden');});
  it('suppresses blocked actors and maintains unread state',async()=>{const service=new NotificationService(createMemoryNotificationRepository(),{async isBlocked(){return true;}});await expect(service.consume({id:'event-2',type:'ReactionAdded',payload:{recipientId:'owner',actorId:'blocked'}})).resolves.toBeNull();expect((await service.list('owner')).unreadCount).toBe(0);});
  it('reads one or all notifications without changing preferences',async()=>{const service=new NotificationService(createMemoryNotificationRepository());const item=await service.consume({id:'event-3',type:'MessageSent',payload:{recipientId:'owner',actorId:'actor'}});await service.markRead('owner',item!.id);expect((await service.list('owner')).unreadCount).toBe(0);expect((await service.getPreferences('owner')).messages).toBe(true);});
  it.each([
    ['FriendshipRequested',{requesterId:'sender',addresseeId:'recipient'},'recipient'],
    ['FriendshipAccepted',{requesterId:'recipient',addresseeId:'sender'},'recipient'],
    ['GreetingSent',{senderId:'sender',recipientId:'recipient'},'recipient'],
    ['MessageSent',{senderId:'sender',recipientId:'recipient'},'recipient'],
    ['ReportCreated',{reporterId:'reporter'},'reporter'],
    ['ReportResolved',{actorId:'admin',recipientId:'reporter'},'reporter'],
  ])('maps the existing %s payload',async(type,payload,recipient)=>{const service=new NotificationService(createMemoryNotificationRepository());expect(service.recipientForEvent({id:type,type,payload})).toBe(recipient);expect(await service.consume({id:type,type,payload})).not.toBeNull();});
  it('enables push on subscribe, rejects cross-account endpoint reuse, and disables on final unsubscribe',async()=>{const repository=createMemoryNotificationRepository();const service=new NotificationService(repository);await service.subscribe({id:'a',userId:'owner',endpoint:'https://push.test/one',p256dh:'p',auth:'a'});expect((await service.getPreferences('owner')).push).toBe(true);await expect(service.subscribe({id:'b',userId:'other',endpoint:'https://push.test/one',p256dh:'p',auth:'a'})).rejects.toThrow('PUSH_SUBSCRIPTION_OWNED');await service.unsubscribe('owner','https://push.test/one');expect((await service.getPreferences('owner')).push).toBe(false);});
});
