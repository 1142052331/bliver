import type { Page, Route } from '@playwright/test';
import {
  V2_TEST_FOOTPRINTS,
  V2_TEST_NOW,
  V2_TEST_SESSIONS,
  V2_TEST_SOCIAL,
  V2_TEST_USERS,
  publicUserFixture,
  sessionFixture,
  visibleFootprintsFor,
  type V2TestActor,
} from '@bliver/testing';
import { installControlledMapTiles } from './map-fixture.js';

function json(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const fixtureMessage = {
  id: V2_TEST_SOCIAL.replyId,
  conversationId: V2_TEST_SOCIAL.conversationId,
  senderId: V2_TEST_USERS.userB.id,
  content: 'Accessible conversation fixture',
  kind: 'message' as const,
  sentAt: V2_TEST_NOW,
  eventId: V2_TEST_SOCIAL.replyId,
  moderation: { status: 'clear' as const, labels: [] },
};

const fixtureConversation = {
  id: V2_TEST_SOCIAL.conversationId,
  participantLowId: V2_TEST_USERS.userA.id,
  participantHighId: V2_TEST_USERS.userB.id,
  initiatorId: V2_TEST_USERS.userA.id,
  state: 'active' as const,
  createdAt: V2_TEST_NOW,
  updatedAt: V2_TEST_NOW,
  unreadCount: 0,
  lastMessage: fixtureMessage,
};

export async function installJourneyApi(page: Page, actor: V2TestActor): Promise<void> {
  await installControlledMapTiles(page);
  await page.routeWebSocket('**/socket.io/**', () => undefined);
  if (actor !== 'guest') {
    await page.context().addCookies([
      { name: 'bliver_session', value: V2_TEST_SESSIONS[actor], domain: '127.0.0.1', path: '/' },
      { name: 'bliver_csrf', value: 'phase7-fixture-csrf', domain: '127.0.0.1', path: '/' },
    ]);
  }
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/v1/session') return actor === 'guest' ? json(route, { code: 'AUTH_REQUIRED' }, 401) : json(route, sessionFixture(actor));
    if (path === '/api/v1/users/me' && actor !== 'guest') return json(route, publicUserFixture(actor));
    if (path === '/api/v1/map/footprints') return json(route, { items: visibleFootprintsFor(actor), nextCursor: null });
    if (path === '/api/v1/activity') return json(route, { items: visibleFootprintsFor(actor), resolvedScope: 'global' });
    if (/^\/api\/v1\/footprints\/[^/]+$/.test(path)) return json(route, V2_TEST_FOOTPRINTS.find((item) => path.endsWith(item.id)) ?? V2_TEST_FOOTPRINTS[0]);
    if (/\/comments$/.test(path)) return json(route, { items: [] });
    if (path === '/api/v1/friendships/requests') return json(route, { incoming: [], outgoing: [] });
    if (path === '/api/v1/friendships') return json(route, { items: [] });
    if (path === '/api/v1/blocks') return json(route, { items: [] });
    if (path === '/api/v1/conversations') return json(route, { items: actor === 'userA' ? [fixtureConversation] : [] });
    if (/\/conversations\/[^/]+\/messages$/.test(path)) return json(route, { items: [fixtureMessage] });
    if (/\/conversations\/[^/]+\/typing$/.test(path)) return json(route, { items: [] });
    if (path === '/api/v1/me') return json(route, { summary: { footprintCount: 3, photoCount: 0, visitorCount: 1 }, map: visibleFootprintsFor(actor === 'guest' ? 'userA' : actor) });
    if (path.endsWith('/timeline')) return json(route, { items: visibleFootprintsFor(actor === 'guest' ? 'userA' : actor) });
    if (path.endsWith('/photos')) return json(route, { items: [] });
    if (path.endsWith('/visitors')) return json(route, { items: [{ id: V2_TEST_USERS.userB.id, name: V2_TEST_USERS.userB.displayName, visitedAt: V2_TEST_NOW }] });
    if (/\/profile\/[^/]+(?:\/memories)?$/.test(path)) return json(route, { summary: { footprintCount: 1, photoCount: 0, visitorCount: 0 }, map: [V2_TEST_FOOTPRINTS[0]] });
    if (path === '/api/v1/notifications') return json(route, { items: [], unreadCount: 0 });
    if (path === '/api/v1/notifications/preferences') return json(route, { reactions: true, comments: true, social: true, messages: true, moderation: true, push: false });
    if (path === '/api/v1/admin/role') return json(route, { role: actor === 'admin' ? 'admin' : null });
    if (/\/admin\/(reports|users|audit|sessions|footprints)$/.test(path)) return json(route, { items: [] });
    if (path === '/api/v1/auth/login') return json(route, { user: publicUserFixture('userA'), session: sessionFixture('userA') });
    return json(route, { code: 'FIXTURE_ROUTE_NOT_FOUND', path }, 404);
  });
}
