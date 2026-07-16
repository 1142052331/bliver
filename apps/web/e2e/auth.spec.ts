import { expect, test, type Page, type Route, type TestInfo } from '@playwright/test';
import {
  V2_TEST_FOOTPRINTS,
  V2_TEST_NOW,
  V2_TEST_SESSIONS,
  V2_TEST_USERS,
  publicUserFixture,
  sessionFixture,
  visibleFootprintsFor,
  type V2TestActor,
} from '@bliver/testing';
import { expectNoAxeViolations } from './accessibility.js';

function json(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installJourneyApi(page: Page, actor: V2TestActor): Promise<void> {
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
    if (path === '/api/v1/session') {
      return actor === 'guest'
        ? json(route, { code: 'AUTH_REQUIRED' }, 401)
        : json(route, sessionFixture(actor));
    }
    if (path === '/api/v1/users/me' && actor !== 'guest') return json(route, publicUserFixture(actor));
    if (path === '/api/v1/map/footprints') return json(route, { items: visibleFootprintsFor(actor), nextCursor: null });
    if (path === '/api/v1/activity') return json(route, { items: visibleFootprintsFor(actor), resolvedScope: 'global' });
    if (/^\/api\/v1\/footprints\/[^/]+$/.test(path)) {
      return json(route, V2_TEST_FOOTPRINTS.find((item) => path.endsWith(item.id)) ?? V2_TEST_FOOTPRINTS[0]);
    }
    if (/\/comments$/.test(path)) return json(route, { items: [] });
    if (path === '/api/v1/friendships/requests') return json(route, { incoming: [], outgoing: [] });
    if (path === '/api/v1/friendships') return json(route, { items: [] });
    if (path === '/api/v1/blocks') return json(route, { items: [] });
    if (path === '/api/v1/conversations') return json(route, { items: [] });
    if (/\/conversations\/[^/]+\/messages$/.test(path)) return json(route, { items: [] });
    if (/\/conversations\/[^/]+\/typing$/.test(path)) return json(route, { items: [] });
    if (path === '/api/v1/me') return json(route, {
      summary: { footprintCount: 3, photoCount: 0, visitorCount: 1 },
      map: visibleFootprintsFor(actor === 'guest' ? 'userA' : actor),
    });
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

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('guest route contract keeps public surfaces open and protects private workspaces', async ({ page }) => {
  await installJourneyApi(page, 'guest');
  const publicRoutes = [
    ['/', 'Map'],
    ['/map', 'Map'],
    ['/activity', 'Activity'],
    ['/login', 'Sign in'],
    [`/footprints/${V2_TEST_FOOTPRINTS[0]!.id}`, 'Footprint'],
    [`/profile/${V2_TEST_USERS.userA.id}`, 'Profile memories'],
    ['/missing-route', 'Not found'],
  ] as const;
  for (const [path, heading] of publicRoutes) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await assertNoHorizontalOverflow(page);
  }
  await page.goto('/activity');
  await expectNoAxeViolations(page);
  for (const path of ['/publish', '/notifications', '/me', '/admin']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/session-expired$/);
  }
});

test('authenticated actors can reach every V2 route-owned workspace', async ({ page }) => {
  await installJourneyApi(page, 'userA');
  const routes = [
    ['/publish?lat=31.231&lng=121.471', 'Publish a footprint'],
    ['/people', 'People'],
    ['/messages', 'Messages'],
    ['/notifications', 'Notifications'],
    ['/me', 'Memories'],
    ['/me/map', 'Map memories'],
    ['/me/timeline', 'Timeline'],
    ['/me/photos', 'Photos'],
    ['/me/visitors', 'Visitors'],
    [`/profile/${V2_TEST_USERS.userB.id}/memories`, 'Profile memories'],
    [`/footprints/${V2_TEST_FOOTPRINTS[0]!.id}`, 'Footprint'],
  ] as const;
  for (const [path, heading] of routes) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await assertNoHorizontalOverflow(page);
  }
});

test('admin fixture reaches governance without changing domain ownership', async ({ page }) => {
  await installJourneyApi(page, 'admin');
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Admin', exact: true })).toBeVisible();
  await expect(page.getByText('No open reports.')).toBeVisible();
  await assertNoHorizontalOverflow(page);
});

test('map discovery to footprint detail and memory remains one deterministic journey', async ({ page }) => {
  await installJourneyApi(page, 'userA');
  await page.goto('/map');
  await expect(page.getByTestId('map-canvas')).toBeVisible();
  await page.goto('/activity');
  await expect(page.getByText(V2_TEST_FOOTPRINTS[0]!.message)).toBeVisible();
  await page.goto(`/footprints/${V2_TEST_FOOTPRINTS[0]!.id}`);
  await expect(page.getByText(V2_TEST_FOOTPRINTS[0]!.message)).toBeVisible();
  await page.goto('/me');
  await expect(page.getByText(V2_TEST_FOOTPRINTS[2]!.message)).toBeVisible();
});

test('captures a tile-independent route screenshot for the configured viewport', async ({ page }, testInfo: TestInfo) => {
  await installJourneyApi(page, 'guest');
  await page.goto('/map');
  await page.addStyleTag({ content: '.leaflet-tile-pane,.leaflet-control-attribution{visibility:hidden!important}' });
  await expect(page.getByTestId('map-canvas')).toBeVisible();
  await testInfo.attach(`map-${testInfo.project.name}`, {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
});
