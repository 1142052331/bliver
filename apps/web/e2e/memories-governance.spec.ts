import { expect,test,type Page,type Route } from '@playwright/test';
const ownerId='019f0000-0000-7000-8000-000000000101';const visitorId='019f0000-0000-7000-8000-000000000102';const footprintId='019f0000-0000-7000-8000-000000000103';const reportId='019f0000-0000-7000-8000-000000000104';const caseId='019f0000-0000-7000-8000-000000000105';const now='2026-07-16T08:00:00.000Z';
const reply=(route:Route,body:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
async function cookies(page:Page){await page.context().addCookies([{name:'bliver_session',value:'e2e-session',domain:'127.0.0.1',path:'/'},{name:'bliver_csrf',value:'e2e-csrf',domain:'127.0.0.1',path:'/'}]);}
const session=(route:Route)=>reply(route,{id:ownerId,deviceName:'Playwright',createdAt:now,lastSeenAt:now,current:true});

test('owner and visitor see only authorized memories and notifications',async({page})=>{
  await cookies(page);let unread=1;
  await page.route('**/api/v1/**',async(route)=>{const request=route.request();const path=new URL(request.url()).pathname;
    if(path==='/api/v1/session')return session(route);
    if(path==='/api/v1/me')return reply(route,{summary:{footprintCount:1,photoCount:1,visitorCount:1},map:[{id:footprintId,message:'Harbor morning',publishedAt:now,visibility:'private',displayPoint:{lat:31.2,lng:121.5}}]});
    if(path===`/api/v1/profile/${ownerId}/memories`)return reply(route,{summary:{footprintCount:0,photoCount:0,visitorCount:0},map:[]});
    if(path==='/api/v1/notifications')return reply(route,{items:[{id:'notice-1',type:'comment',actor:{id:visitorId,name:'Visitor'},target:{type:'footprint',id:footprintId},...(unread?{}:{readAt:now}),createdAt:now}],unreadCount:unread});
    if(path==='/api/v1/notifications/preferences')return reply(route,{reactions:true,comments:true,social:true,messages:true,moderation:true,push:false});
    if(path==='/api/v1/notifications/notice-1/read'&&request.method()==='POST'){unread=0;return reply(route,{},204);}return reply(route,{},404);
  });
  await page.goto('/me');await expect(page.getByRole('heading',{name:'Memories'})).toBeVisible();await expect(page.getByText('Harbor morning')).toBeVisible();await page.goto(`/profile/${ownerId}`);await expect(page.getByText('No memories are visible here yet.')).toBeVisible();await page.goto('/notifications');await expect(page.getByText('1 unread')).toBeVisible();await page.getByRole('button',{name:'Mark read'}).click();await expect(page.getByText('0 unread')).toBeVisible();
});

test('admin resolves a report through a case and sees immutable audit',async({page})=>{
  await cookies(page);let resolved=false;const audit:Record<string,unknown>[]=[];
  await page.route('**/api/v1/**',async(route)=>{const request=route.request();const path=new URL(request.url()).pathname;
    if(path==='/api/v1/session')return session(route);if(path==='/api/v1/admin/role')return reply(route,{role:'admin'});if(path==='/api/v1/admin/reports')return reply(route,{items:resolved?[]:[{id:reportId,footprint_id:footprintId,status:'open'}]});if(path==='/api/v1/admin/users')return reply(route,{items:[{id:visitorId,display_name:'Visitor',role:'user',suspended_at:null}]});if(path==='/api/v1/admin/audit')return reply(route,{items:audit});if(path==='/api/v1/admin/cases'&&request.method()==='POST')return reply(route,{id:caseId,status:'open',targetType:'footprint',targetId:footprintId,reason:'review'},201);if(path===`/api/v1/admin/cases/${caseId}/resolve`&&request.method()==='POST'){resolved=true;audit.push({id:'audit-1',createdAt:now,actorId:ownerId,action:'resolve_case',targetId:caseId,reason:'Reviewed evidence'});return reply(route,audit[0]);}return reply(route,{},404);
  });
  await page.goto('/admin');await expect(page.getByRole('heading',{name:'Admin',exact:true})).toBeVisible();await page.getByRole('button',{name:'Resolve'}).click();await page.getByRole('textbox',{name:'Reason'}).fill('Reviewed evidence');await page.getByRole('button',{name:'Confirm'}).click();await expect(page.getByText('resolve_case')).toBeVisible();await expect(page.getByText('Reviewed evidence')).toBeVisible();await expect(page.getByText('No open reports.')).toBeVisible();
});

test('real app fixture protects and serves the authenticated memories route',async({page},testInfo)=>{
  await page.goto('/me');await expect(page).toHaveURL(/\/session-expired$/);const username=`real_${testInfo.project.name}_${Date.now()}`;const response=await page.request.post('/api/v1/auth/register',{data:{username,password:'password-123',displayName:'Real fixture'}});expect(response.ok()).toBe(true);await page.goto('/me');await expect(page.getByRole('heading',{name:'Memories'})).toBeVisible();await expect(page.getByText('No memories are visible here yet.')).toBeVisible();
});
