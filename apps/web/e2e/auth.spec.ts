import { writeFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  V2_TEST_FOOTPRINTS,
  V2_TEST_USERS,
} from '@bliver/testing';
import { expectNoAxeViolations } from './accessibility.js';
import { installJourneyApi } from './journey-api.js';
import { CONTROLLED_MAP_BACKGROUND_RGB } from './map-fixture.js';

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function expectInteractiveMapReady(page: Page) {
  const map = page.getByTestId('map-canvas');
  await expect(map).toHaveAttribute('data-map-ready', 'true');
  const canvas = map.locator('canvas.maplibregl-canvas');
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toBeVisible();
  return canvas;
}

async function inspectControlledCanvasPixels(page: Page, png: Buffer) {
  return page.evaluate(async ({ base64, background }) => {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes.buffer], { type: 'image/png' }));
    const decoder = document.createElement('canvas');
    decoder.width = bitmap.width;
    decoder.height = bitmap.height;
    const context = decoder.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Could not create a PNG decoding context');
    context.drawImage(bitmap, 0, 0);
    bitmap.close();

    const pixels = context.getImageData(0, 0, decoder.width, decoder.height).data;
    let backgroundPixels = 0;
    let nonBackgroundPixels = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const distance = Math.max(
        Math.abs(pixels[offset]! - background[0]),
        Math.abs(pixels[offset + 1]! - background[1]),
        Math.abs(pixels[offset + 2]! - background[2]),
      );
      if (pixels[offset + 3] === 255 && distance <= 6) backgroundPixels += 1;
      else nonBackgroundPixels += 1;
    }
    return {
      background: backgroundPixels,
      height: decoder.height,
      nonBackground: nonBackgroundPixels,
      total: decoder.width * decoder.height,
      width: decoder.width,
    };
  }, { base64: png.toString('base64'), background: CONTROLLED_MAP_BACKGROUND_RGB });
}

test('guest route contract keeps public surfaces open and protects private workspaces', async ({ page }) => {
  await installJourneyApi(page, 'guest');
  const publicRoutes = [
    ['/', 'Map'],
    ['/map', 'Map'],
    ['/activity', 'Activity'],
    ['/login', 'Sign in'],
    [`/footprints/${V2_TEST_FOOTPRINTS[0]!.id}`, 'Footprint'],
    [`/profile/${V2_TEST_USERS.userA.id}`, V2_TEST_USERS.userA.displayName],
    ['/missing-route', 'Page not found'],
  ] as const;
  for (const [path, heading] of publicRoutes) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    if (path === '/' || path === '/map') await expectInteractiveMapReady(page);
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
    ['/me', V2_TEST_USERS.userA.displayName],
    ['/me/map', 'Map memories'],
    ['/me/timeline', 'Timeline'],
    ['/me/photos', 'Photos'],
    ['/me/visitors', 'Visitors'],
    [`/profile/${V2_TEST_USERS.userB.id}/memories`, V2_TEST_USERS.userB.displayName],
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
  await expectInteractiveMapReady(page);
  const firstFootprint = page
    .getByRole('button', { name: new RegExp(V2_TEST_FOOTPRINTS[0]!.author.name, 'i') })
    .and(page.getByTestId('map-footprint-item'))
    .first();
  await firstFootprint.focus();
  await firstFootprint.press('Enter');
  await expect(page).toHaveURL(/footprint=[^&]+/);
  const selectedId = new URL(page.url()).searchParams.get('footprint');
  const selected = V2_TEST_FOOTPRINTS.find((item) => item.id === selectedId);
  expect(selected).toBeDefined();
  await page.getByRole('link', { name: 'Open footprint' }).click();
  await expect(page).toHaveURL(/\/footprints\//);
  await expect(
    page.locator('.footprint-detail').getByText(selected!.message, { exact: true }),
  ).toBeVisible();
  await page.locator('.app-shell__nav')
    .getByRole('link', { name: 'My space' })
    .click();
  await expect(
    page.locator('.memories-route').getByText(V2_TEST_FOOTPRINTS[2]!.message, { exact: true }),
  ).toBeVisible();
});

test('captures a tile-independent route screenshot for the configured viewport', async ({ page }, testInfo: TestInfo) => {
  await installJourneyApi(page, 'guest');
  await page.goto('/map');
  const canvas = await expectInteractiveMapReady(page);
  await expect(page.getByTestId('map-footprint-item')).toHaveCount(1);
  const canvasScreenshot = await canvas.screenshot({
    animations: 'disabled',
    style: [
      '.map-canvas__semantic,',
      '.map-canvas__attribution,',
      '.map-route__controls,',
      '[data-map-stage-status="empty"],',
      '.map-route__preview { visibility: hidden !important; }',
    ].join('\n'),
  });
  const pixelStats = await inspectControlledCanvasPixels(page, canvasScreenshot);
  expect(pixelStats.background).toBeGreaterThan(pixelStats.total * 0.9);
  expect(pixelStats.nonBackground).toBeGreaterThan(50);
  await testInfo.attach(`map-canvas-${testInfo.project.name}`, {
    body: canvasScreenshot,
    contentType: 'image/png',
  });
  const pixelEvidence = Buffer.from(JSON.stringify({
    viewport: testInfo.project.name,
    ...pixelStats,
  }, null, 2));
  const pixelEvidencePath = testInfo.outputPath(`map-canvas-pixels-${testInfo.project.name}.json`);
  await writeFile(pixelEvidencePath, pixelEvidence);
  await testInfo.attach(`map-canvas-pixels-${testInfo.project.name}`, {
    path: pixelEvidencePath,
    contentType: 'application/json',
  });
  await testInfo.attach(`map-${testInfo.project.name}`, {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
});
