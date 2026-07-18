import { expect, test, type Page, type Route } from '@playwright/test';
import { V2_TEST_FOOTPRINTS, V2_TEST_SOCIAL, V2_TEST_USERS } from '@bliver/testing';

import { expectNoAxeViolations, expectNoHorizontalOverflow } from './accessibility.js';
import { installJourneyApi } from './journey-api.js';
import { writeBrowserEvidenceRecord } from '../../../scripts/perf/browser-evidence-writer.js';
import type { BrowserEvidenceProject } from '../../../scripts/perf/browser-evidence.js';

const longMoment = {
  ...V2_TEST_FOOTPRINTS[0]!,
  author: {
    ...V2_TEST_FOOTPRINTS[0]!.author,
    name: 'A deliberately long display name that still preserves the activity layout at narrow widths',
  },
  message: `A long accessible moment ${'without-horizontal-overflow '.repeat(18)}`,
};

function json(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockGuestActivity(page: Page): Promise<void> {
  await page.routeWebSocket('**/socket.io/**', () => undefined);
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/session') return json(route, { code: 'AUTH_REQUIRED' }, 401);
    if (path === '/api/v1/activity') return json(route, { items: [longMoment], resolvedScope: 'global' });
    if (path.endsWith('/comments')) return json(route, { items: [] });
    if (path === '/api/v1/auth/login') return json(route, { code: 'INVALID_CREDENTIALS' }, 401);
    return json(route, { code: 'FIXTURE_ROUTE_NOT_FOUND' }, 404);
  });
}

test.beforeEach(async ({ page }) => mockGuestActivity(page));

test('every route-owned surface passes the WCAG axe gate', async ({ page }) => {
  test.setTimeout(60_000);
  await installJourneyApi(page, 'userA');
  const routes = [
    ['/', 'Map'],
    ['/map', 'Map'],
    ['/activity', 'Activity'],
    ['/login', 'Sign in'],
    ['/people', 'People'],
    ['/messages', 'Messages'],
    [`/messages/${V2_TEST_SOCIAL.conversationId}`, 'Person 019f0000'],
    ['/notifications', 'Notifications'],
    ['/me', 'Memories'],
    ['/me/map', 'Map memories'],
    ['/me/timeline', 'Timeline'],
    ['/me/photos', 'Photos'],
    ['/me/visitors', 'Visitors'],
    [`/profile/${V2_TEST_USERS.userB.id}`, 'Profile memories'],
    [`/profile/${V2_TEST_USERS.userB.id}/memories`, 'Profile memories'],
    [`/profile/${V2_TEST_USERS.userB.id}/memories/map`, 'Map memories'],
    [`/profile/${V2_TEST_USERS.userB.id}/memories/timeline`, 'Timeline'],
    [`/profile/${V2_TEST_USERS.userB.id}/memories/photos`, 'Photos'],
    [`/profile/${V2_TEST_USERS.userB.id}/memories/visitors`, 'Visitors'],
    [`/footprints/${V2_TEST_FOOTPRINTS[0]!.id}`, 'Footprint'],
    ['/publish?lat=31.231&lng=121.471', 'Publish a footprint'],
    ['/session-expired', 'Session expired'],
    ['/missing-route', 'Page not found'],
  ] as const;

  for (const [path, heading] of routes) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expectNoAxeViolations(page);
    await expectNoHorizontalOverflow(page);
  }
});

test('admin route surface passes the WCAG axe gate', async ({ page }) => {
  await installJourneyApi(page, 'admin');
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Admin', exact: true })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalOverflow(page);
});

test('route semantics, labels and long content pass the WCAG axe gate', async ({ page }) => {
  await page.goto('/activity');
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalOverflow(page);
});

test('filter dialog supports keyboard focus, Escape and focus restoration', async ({ page }, testInfo) => {
  await page.goto('/activity');
  await page.evaluate(() => {
    const samples: number[] = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const event = entry as PerformanceEntry & { interactionId?: number };
        if ((event.interactionId ?? 0) > 0) samples.push(event.duration);
      }
    });
    observer.observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
    (window as typeof window & { __v2InpSamples?: number[] }).__v2InpSamples = samples;
  });
  const filter = page.getByRole('button', { name: 'Filter' });
  await filter.focus();
  await expect(filter).toBeFocused();
  await expect(filter).toHaveCSS('outline-style', 'solid');
  await filter.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Activity filters' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(filter).toBeFocused();
  await filter.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect.poll(
    () => page.evaluate(() => ((window as typeof window & { __v2InpSamples?: number[] }).__v2InpSamples ?? []).length),
    { timeout: 2_000 },
  ).toBeGreaterThan(0);
  const inpMs = await page.evaluate(() => Math.max(...((window as typeof window & { __v2InpSamples?: number[] }).__v2InpSamples ?? []), -1));
  expect(inpMs).toBeGreaterThanOrEqual(0);
  await writeBrowserEvidenceRecord({ metric: 'inp', project: testInfo.project.name as BrowserEvidenceProject, valueMs: inpMs });
});

test('keyboard order reaches shell commands before the sign-in form with visible focus', async ({ page }) => {
  await page.goto('/login');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Bliver' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('combobox', { name: 'Language' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Notifications' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Leave footprint' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Username')).toBeFocused();
  await expect(page.getByLabel('Username')).toHaveCSS('outline-style', 'solid');
});

test('primary controls preserve a 44px touch target through mobile keyboard resizing', async ({ page }) => {
  await page.goto('/activity');
  await expect(page.getByRole('button', { name: 'Filter' })).toBeVisible();
  const controls = page.locator('.activity-route button, .activity-route input, .activity-route select, .activity-route textarea');
  const count = await controls.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const box = await controls.nth(index).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  }
  await page.setViewportSize({ width: page.viewportSize()?.width ?? 360, height: 420 });
  await page.getByRole('button', { name: 'Filter' }).click();
  await expect(page.getByRole('button', { name: 'Close filters' })).toBeInViewport();
  await expectNoHorizontalOverflow(page);
});

test('reduced motion removes nonessential transitions without hiding state', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/activity');
  const button = page.getByRole('button', { name: 'Filter' });
  await expect(button).toBeVisible();
  const transitionMs = await button.evaluate((element) => Number.parseFloat(getComputedStyle(element).transitionDuration) * 1_000);
  expect(transitionMs).toBeLessThanOrEqual(0.01);
  await button.click();
  await expect(page.getByRole('dialog', { name: 'Activity filters' })).toBeVisible();
});

test('authentication failures are announced without displacing keyboard users', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill('fixture-user');
  await page.getByLabel('Password').fill('incorrect-fixture-value');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Sign in failed. Check your details and try again.');
  await expectNoAxeViolations(page);
});
