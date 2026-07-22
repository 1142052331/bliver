import { expect, type Page, type Route } from '@playwright/test';
import {
  V2_TEST_FOOTPRINTS,
  V2_TEST_NOW,
  V2_TEST_USERS,
  publicUserFixture,
  type V2TestActor,
} from '@bliver/testing';

import { installJourneyApi } from './journey-api.js';

export const VISUAL_BASELINE_PROJECT = 'mobile-390x844';

export const visualBaselineLocales = ['zh-CN', 'en', 'ja'] as const;
export type VisualBaselineLocale = (typeof visualBaselineLocales)[number];

export const visualBaselineStates = [
  'login',
  'map-single',
  'map-stack',
  'activity',
  'messages',
  'me',
  'publish',
  'footprint-detail',
  'notifications',
  'admin',
  'session-expired',
] as const;
export type VisualBaselineState = (typeof visualBaselineStates)[number];

function json(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

function actorFor(state: VisualBaselineState): V2TestActor {
  if (state === 'login' || state === 'session-expired') return 'guest';
  if (state === 'admin') return 'admin';
  return 'userA';
}

async function installProfileDirectory(page: Page): Promise<void> {
  await page.route('**/api/v1/users**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== '/api/v1/users' || !url.searchParams.has('ids')) {
      await route.fallback();
      return;
    }

    const requested = new Set(
      (url.searchParams.get('ids') ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    );
    const items = (['admin', 'userA', 'userB'] as const)
      .map((actor) => publicUserFixture(actor))
      .filter((profile) => requested.has(profile.id))
      .map(({ id, username, displayName }) => ({ id, username, displayName }));

    await json(route, { items });
  });
}

async function installNotificationStream(page: Page): Promise<void> {
  await page.route('**/api/v1/notifications', (route) => json(route, {
    items: [
      {
        id: '019f0000-0000-7000-8000-000000000801',
        type: 'comment',
        actor: {
          id: V2_TEST_USERS.userB.id,
          name: V2_TEST_USERS.userB.displayName,
        },
        target: {
          type: 'footprint',
          id: V2_TEST_FOOTPRINTS[0]!.id,
        },
        createdAt: V2_TEST_NOW,
      },
      {
        id: '019f0000-0000-7000-8000-000000000802',
        type: 'message',
        actor: {
          id: V2_TEST_USERS.userB.id,
          name: V2_TEST_USERS.userB.displayName,
        },
        target: {
          type: 'conversation',
          id: '019f0000-0000-7000-8000-000000000004',
        },
        readAt: V2_TEST_NOW,
        createdAt: '2026-07-15T07:45:00.000Z',
      },
    ],
    unreadCount: 1,
    nextCursor: null,
  }));
}

async function installAdminDirectory(page: Page): Promise<void> {
  await page.route('**/api/v1/admin/reports', (route) => json(route, {
    items: [{
      id: '019f0000-0000-7000-8000-000000000811',
      footprint_id: V2_TEST_FOOTPRINTS[0]!.id,
      status: 'open',
    }],
  }));
  await page.route('**/api/v1/admin/users', (route) => json(route, {
    items: [{
      id: V2_TEST_USERS.userB.id,
      username: V2_TEST_USERS.userB.username,
      display_name: V2_TEST_USERS.userB.displayName,
      role: 'user',
      suspended_at: null,
    }],
  }));
  await page.route('**/api/v1/admin/audit', (route) => json(route, {
    items: [{
      id: '019f0000-0000-7000-8000-000000000812',
      created_at: V2_TEST_NOW,
      actor_id: V2_TEST_USERS.admin.id,
      action: 'report.reviewed',
      target_id: V2_TEST_FOOTPRINTS[0]!.id,
      reason: 'Visual baseline fixture',
    }],
  }));
}

async function installStackedMapMoments(page: Page): Promise<void> {
  const displayPoint = V2_TEST_FOOTPRINTS[0]!.displayPoint;
  const items = V2_TEST_FOOTPRINTS.map((item) => ({ ...item, displayPoint }));

  await page.route('**/api/v1/map/footprints**', (route) => json(route, {
    items,
    nextCursor: null,
  }));
}

async function installSingleMapMoment(page: Page): Promise<void> {
  await page.route('**/api/v1/map/footprints**', (route) => json(route, {
    items: [V2_TEST_FOOTPRINTS[0]],
    nextCursor: null,
  }));
}

export async function prepareVisualBaseline(
  page: Page,
  locale: VisualBaselineLocale,
  state: VisualBaselineState,
): Promise<void> {
  await page.addInitScript(({ storedLocale }) => {
    localStorage.setItem('bliver.locale', storedLocale);
  }, { storedLocale: locale });
  await page.emulateMedia({
    reducedMotion: state === 'publish' ? 'reduce' : 'no-preference',
  });
  await installJourneyApi(page, actorFor(state));
  await installProfileDirectory(page);

  if (state === 'map-single') await installSingleMapMoment(page);
  if (state === 'map-stack') await installStackedMapMoments(page);
  if (state === 'notifications') await installNotificationStream(page);
  if (state === 'admin') await installAdminDirectory(page);
}

export function pathForVisualBaseline(state: VisualBaselineState): string {
  const footprint = V2_TEST_FOOTPRINTS[0]!;
  const mapBounds = [
    'west=121.461',
    'south=31.221',
    'east=121.481',
    'north=31.241',
  ].join('&');

  switch (state) {
    case 'login':
      return '/login';
    case 'map-single':
      return `/map?${mapBounds}&footprint=${footprint.id}&sheet=preview`;
    case 'map-stack':
      return `/map?${mapBounds}`;
    case 'activity':
      return '/activity';
    case 'messages':
      return '/messages';
    case 'me':
      return '/me';
    case 'publish':
      return `/publish?lat=${footprint.displayPoint.lat}&lng=${footprint.displayPoint.lng}`;
    case 'footprint-detail':
      return `/footprints/${footprint.id}`;
    case 'notifications':
      return '/notifications';
    case 'admin':
      return '/admin';
    case 'session-expired':
      return '/session-expired';
  }
}

const readySelectors: Record<VisualBaselineState, string> = {
  login: '.auth-route--login[data-auth-state="ready"]',
  'map-single': '[data-testid="chrono-lens"]',
  'map-stack': '[data-testid="moment-deck"]',
  activity: '[data-activity-sequence="true"]',
  messages: '.messages-route--ledger',
  me: '.memories-toolbar',
  publish: '.publish-compose-form',
  'footprint-detail': '.footprint-detail__lens',
  notifications: '.notification-list',
  admin: '.admin-route__index',
  'session-expired': '.auth-route--expired[data-auth-state="ready"]',
};

async function activateMomentStack(page: Page): Promise<void> {
  const map = page.locator('[data-testid="map-canvas"]');
  await expect(map).toHaveAttribute('data-map-ready', 'true', { timeout: 15_000 });
  const canvas = page.locator('.map-canvas__viewport canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Interactive map canvas has no visible bounds');

  await page.mouse.click(
    box.x + box.width / 2,
    box.y + box.height / 2 - 20,
  );
}

export async function settleVisualBaseline(
  page: Page,
  locale: VisualBaselineLocale,
  state: VisualBaselineState,
): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('lang', locale);

  if (state === 'map-stack') await activateMomentStack(page);
  if (state === 'map-single') {
    await expect(page.locator('[data-testid="map-canvas"]')).toHaveAttribute(
      'data-map-ready',
      'true',
      { timeout: 15_000 },
    );
  }

  await page.locator(readySelectors[state]).waitFor({
    state: 'visible',
    timeout: 15_000,
  });
  await page.waitForFunction(() =>
    [...document.images].every((image) => image.complete),
  );
  await page.evaluate(async () => {
    await document.fonts?.ready;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  });

  // Let route, map-camera and GSAP state timelines reach their final frame.
  await page.waitForTimeout(state.startsWith('map-') ? 1_000 : 700);

  await page.evaluate(() => new Promise<void>((resolve) => {
    document.documentElement.getBoundingClientRect();
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}
