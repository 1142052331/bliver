import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  V2_TEST_FOOTPRINTS,
  V2_TEST_USERS,
} from '@bliver/testing';
import { expectNoAxeViolations } from './accessibility.js';
import { installJourneyApi } from './journey-api.js';

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

test('Capacitor footprint deep link returns to the footprint after login', async ({ page }) => {
  await installJourneyApi(page, 'guest');
  const footprintPath = `/footprints/${V2_TEST_FOOTPRINTS[0]!.id}`;
  await page.goto(`/login?returnTo=${encodeURIComponent(footprintPath)}`);
  await page.getByLabel('Username').fill(V2_TEST_USERS.userA.username);
  await page.getByLabel('Password').fill('phase-7-fixture-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(`${footprintPath.replaceAll('-', '\\-')}$`));
  await expect(page.getByText(V2_TEST_FOOTPRINTS[0]!.message)).toBeVisible();
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
    [`/profile/${V2_TEST_USERS.userB.id}/memories/map`, 'Map memories'],
    [`/profile/${V2_TEST_USERS.userB.id}/memories/timeline`, 'Timeline'],
    [`/profile/${V2_TEST_USERS.userB.id}/memories/photos`, 'Photos'],
    [`/profile/${V2_TEST_USERS.userB.id}/memories/visitors`, 'Visitors'],
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
  await page.locator('.leaflet-interactive').first().click({ force: true });
  await expect(page).toHaveURL(/footprint=[^&]+/);
  const selectedId = new URL(page.url()).searchParams.get('footprint');
  const selected = V2_TEST_FOOTPRINTS.find((item) => item.id === selectedId);
  expect(selected).toBeDefined();
  await page.getByRole('link', { name: 'Open footprint' }).click();
  await expect(page.getByText(selected!.message)).toBeVisible();
  await page.getByRole('link', { name: 'My space' }).click();
  await expect(page.getByText(V2_TEST_FOOTPRINTS[2]!.message)).toBeVisible();
});

test('captures a tile-independent route screenshot for the configured viewport', async ({ page }, testInfo: TestInfo) => {
  await installJourneyApi(page, 'guest');
  await page.goto('/map');
  await expect(page.getByTestId('map-canvas')).toBeVisible();
  await testInfo.attach(`map-${testInfo.project.name}`, {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
});
