import { expect, test, type Locator, type Page } from '@playwright/test';
import { V2_TEST_FOOTPRINTS } from '@bliver/testing';
import { expectNoAxeViolations } from './accessibility.js';
import {
  installControlledMapRealtime,
  installControlledMapTiles,
  installUnavailableMapProvider,
} from './map-fixture.js';

test.beforeEach(async ({ page }) => {
  await installControlledMapTiles(page);
});

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/session', async (route) => { await route.fulfill({ status: 401, contentType: 'application/problem+json', body: JSON.stringify({ type: 'about:blank', title: 'Unauthorized', status: 401, code: 'AUTH_REQUIRED' }) }); });
});

async function expectInteractiveMapReady(page: Page): Promise<void> {
  const map = page.getByTestId('map-canvas');
  await expect(map).toHaveAttribute('data-map-ready', 'true');
  await expect(map.locator('canvas.maplibregl-canvas')).toHaveCount(1);
  await expect(map.locator('canvas.maplibregl-canvas')).toBeVisible();
}

async function expectNoOverlap(left: Locator, right: Locator, description: string): Promise<void> {
  const [leftBox, rightBox] = await Promise.all([left.boundingBox(), right.boundingBox()]);
  expect(leftBox, `${description}: first element must be visible`).not.toBeNull();
  expect(rightBox, `${description}: second element must be visible`).not.toBeNull();
  const overlapWidth = Math.min(leftBox!.x + leftBox!.width, rightBox!.x + rightBox!.width)
    - Math.max(leftBox!.x, rightBox!.x);
  const overlapHeight = Math.min(leftBox!.y + leftBox!.height, rightBox!.y + rightBox!.height)
    - Math.max(leftBox!.y, rightBox!.y);
  expect(
    overlapWidth > 0.5 && overlapHeight > 0.5,
    `${description}: elements overlap by ${overlapWidth.toFixed(1)} x ${overlapHeight.toFixed(1)}px`,
  ).toBe(false);
}

async function expectMapControlsFit(page: Page): Promise<void> {
  const controls = page.locator([
    '.map-route__search-input:visible',
    '.map-route__controls button:visible',
    '.map-route__controls select:visible',
  ].join(', '));
  const failures = await controls.evaluateAll((elements) => {
    const searchFields = [...document.querySelectorAll('.map-route__search-field')];
    const boxes = elements.map((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const searchField = element.closest('.map-route__search-field');
      let selectedTextFits = true;
      if (element instanceof HTMLSelectElement) {
        const measure = document.createElement('canvas').getContext('2d');
        if (measure) {
          measure.font = style.font;
          const selectedText = element.selectedOptions[0]?.textContent ?? '';
          const available = element.clientWidth
            - Number.parseFloat(style.paddingLeft)
            - Number.parseFloat(style.paddingRight);
          selectedTextFits = measure.measureText(selectedText).width <= available + 1;
        }
      }
      return {
        label: element.getAttribute('aria-label') ?? element.textContent?.trim() ?? element.tagName,
        left: rect.left,
        right: rect.right,
        searchFieldIndex: searchField ? searchFields.indexOf(searchField) : -1,
        top: rect.top,
        bottom: rect.bottom,
        selectedTextFits,
        textFits: element.scrollWidth <= element.clientWidth + 1
          && element.scrollHeight <= element.clientHeight + 1,
      };
    });
    const issues = boxes.flatMap((box) => [
      ...(box.textFits ? [] : [`${box.label} clips its rendered content`]),
      ...(box.selectedTextFits ? [] : [`${box.label} clips its selected option`]),
    ]);
    for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < boxes.length; rightIndex += 1) {
        const left = boxes[leftIndex]!;
        const right = boxes[rightIndex]!;
        if (left.searchFieldIndex >= 0 && left.searchFieldIndex === right.searchFieldIndex) continue;
        const overlapWidth = Math.min(left.right, right.right) - Math.max(left.left, right.left);
        const overlapHeight = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
        if (overlapWidth > 0.5 && overlapHeight > 0.5) {
          issues.push(`${left.label} overlaps ${right.label}`);
        }
      }
    }
    return issues;
  });
  expect(failures, failures.join('\n')).toEqual([]);

  const semanticPanel = page.locator('.map-canvas__semantic');
  for (let index = 0; index < await controls.count(); index += 1) {
    await expectNoOverlap(controls.nth(index), semanticPanel, `map control ${index + 1} and footprint list`);
  }
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => ({
    bodyFits: document.body.scrollWidth <= window.innerWidth,
    documentFits: document.documentElement.scrollWidth <= window.innerWidth,
  }))).toEqual({ bodyFits: true, documentFits: true });
}

function readViewportFromUrl(url: string): Record<'west' | 'south' | 'east' | 'north', number> {
  const params = new URL(url).searchParams;
  return {
    west: Number(params.get('west')),
    south: Number(params.get('south')),
    east: Number(params.get('east')),
    north: Number(params.get('north')),
  };
}

test('guest map opens as the primary surface', async ({ page }) => {
  await page.route('**/api/v1/map/footprints**', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], nextCursor: null }) }); });
  await page.goto('/map');
  await expect(page.getByRole('heading', { name: 'Map' })).toBeVisible();
  await expectInteractiveMapReady(page);
  await expect(page.getByRole('button', { name: 'Search places' })).toBeVisible();
  await expectNoAxeViolations(page);
});

test('a user camera move writes finite viewport bounds to the URL and map query', async ({ page }) => {
  const mapRequests: string[] = [];
  await page.route('**/api/v1/map/footprints**', async (route) => {
    mapRequests.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [V2_TEST_FOOTPRINTS[0]], nextCursor: null }),
    });
  });
  await page.goto('/map?west=120&south=30&east=122&north=32');
  await expectInteractiveMapReady(page);

  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(() => readViewportFromUrl(page.url()).west).not.toBe(120);
  const viewport = readViewportFromUrl(page.url());
  expect(Object.values(viewport).every(Number.isFinite)).toBe(true);
  expect(viewport.west).toBeGreaterThanOrEqual(-180);
  expect(viewport.east).toBeLessThanOrEqual(180);
  expect(viewport.south).toBeGreaterThanOrEqual(-90);
  expect(viewport.north).toBeLessThanOrEqual(90);
  expect(viewport.west).toBeLessThan(viewport.east);
  expect(viewport.south).toBeLessThan(viewport.north);
  await expect.poll(() => mapRequests.some((requestUrl) => {
    const requested = readViewportFromUrl(requestUrl);
    return Object.entries(viewport).every(([key, value]) => requested[key as keyof typeof requested] === value);
  })).toBe(true);
});

test('a controlled Socket.IO footprint event invalidates and refreshes the browser map query', async ({ page }) => {
  const realtime = await installControlledMapRealtime(page);
  const publishedFootprint = { ...V2_TEST_FOOTPRINTS[1]!, visibility: 'public' as const };
  let items = [V2_TEST_FOOTPRINTS[0]!];
  let mapRequestCount = 0;
  await page.route('**/api/v1/map/footprints**', async (route) => {
    mapRequestCount += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items, nextCursor: null }),
    });
  });
  await page.goto('/map');
  await expectInteractiveMapReady(page);
  await realtime.waitUntilConnected();
  await expect(page.getByTestId('map-footprint-item')).toHaveCount(1);
  const requestsBeforeEvent = mapRequestCount;

  items = [V2_TEST_FOOTPRINTS[0]!, publishedFootprint];
  await realtime.emitFootprintPublished({ footprintId: publishedFootprint.id });

  await expect.poll(() => mapRequestCount).toBeGreaterThan(requestsBeforeEvent);
  await expect(page.getByTestId('map-footprint-item')).toHaveCount(2);
  await expect(page.getByTestId('map-footprint-list')).toContainText(publishedFootprint.author.name);
});

test('a maximum-length unbroken author name remains contained in the map surfaces', async ({ page }) => {
  const longAuthorName = 'SpatialMemoryAtlasExplorerAcrossCitiesRiversStationsAndSeasons26';
  expect(longAuthorName).toHaveLength(64);
  const footprint = {
    ...V2_TEST_FOOTPRINTS[0]!,
    author: { ...V2_TEST_FOOTPRINTS[0]!.author, name: longAuthorName },
  };
  await page.route('**/api/v1/map/footprints**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [footprint], nextCursor: null }),
    });
  });
  await page.goto('/map');
  await expectInteractiveMapReady(page);

  const item = page.getByTestId('map-footprint-item');
  await expect(item).toHaveAccessibleName(new RegExp(longAuthorName));
  await expect(page.locator('.map-route__preview strong')).toHaveText(longAuthorName);
  const authorTextFits = await page.locator([
    '.map-canvas__semantic-copy strong',
    '.map-route__preview strong',
  ].join(', ')).evaluateAll((elements) => elements.every((element) => (
    element.scrollWidth <= element.clientWidth + 1
    && element.scrollHeight <= element.clientHeight + 1
  )));
  expect(authorTextFits).toBe(true);
  await assertNoHorizontalOverflow(page);
  await expectNoOverlap(item, page.locator('.map-route__preview'), 'footprint list item and preview');
});

test.describe('browser map degradation', () => {
  test('provider failure preserves the static geography summary and semantic path', async ({ page }) => {
    await installUnavailableMapProvider(page);
    await page.route('**/api/v1/map/footprints**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [V2_TEST_FOOTPRINTS[0]], nextCursor: null }),
      });
    });
    await page.goto('/map');

    await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-mode', 'static');
    await expect(page.getByTestId('map-static-fallback')).toBeVisible();
    await page.getByTestId('map-footprint-item').click();
    await expect(page).toHaveURL(new RegExp(`footprint=${V2_TEST_FOOTPRINTS[0]!.id}`));
  });

  test('WebGL construction failure keeps every footprint operable through the semantic list', async ({ page }) => {
    await page.addInitScript(() => {
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        configurable: true,
        value(this: HTMLCanvasElement, contextId: string, ...args: unknown[]) {
          if (contextId === 'webgl' || contextId === 'webgl2' || contextId === 'experimental-webgl') return null;
          return Reflect.apply(originalGetContext, this, [contextId, ...args]) as unknown;
        },
      });
    });
    await page.route('**/api/v1/map/footprints**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [V2_TEST_FOOTPRINTS[0]], nextCursor: null }),
      });
    });
    await page.goto('/map');

    await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-mode', 'static');
    await expect(page.getByTestId('map-static-fallback')).toBeVisible();
    await page.getByTestId('map-footprint-item').click();
    await expect(page).toHaveURL(new RegExp(`footprint=${V2_TEST_FOOTPRINTS[0]!.id}`));
  });
});

test('expanded search and denied location expose stable feedback without overlap', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (
          _success: PositionCallback,
          error?: PositionErrorCallback | null,
        ) => error?.({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }),
      },
    });
  });
  await page.route('**/api/v1/map/footprints**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [V2_TEST_FOOTPRINTS[0]], nextCursor: null }),
    });
  });
  await page.route('**/api/v1/places/search**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], query: 'No such place' }),
    });
  });
  await page.goto('/map');
  await expectInteractiveMapReady(page);

  await page.getByRole('button', { name: 'Search places' }).click();
  await expect(page.getByLabel('Place search')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close search' })).toBeVisible();
  await expectMapControlsFit(page);

  await page.getByLabel('Place search').fill('No such place');
  await page.getByLabel('Place search').press('Enter');
  const noResults = page.getByTestId('map-control-notice');
  await expect(noResults).toHaveRole('status');
  await expect(noResults).toHaveText('No places found.');

  await page.getByRole('button', { name: 'Locate me' }).click();
  const locationDenied = page.getByTestId('map-control-notice');
  await expect(locationDenied).toHaveRole('alert');
  await expect(locationDenied).toHaveText('Location is unavailable. You can keep browsing the map.');
});

test('successful place search hands the selected map point to publishing', async ({ context, page }) => {
  const place = {
    id: 'shibuya-crossing',
    name: 'Shibuya Crossing',
    lat: 35.6595,
    lng: 139.7005,
    countryCode: 'JP',
  };
  await context.addCookies([{
    name: 'bliver_session',
    value: 'e2e-session',
    domain: '127.0.0.1',
    path: '/',
  }]);
  await page.route('**/api/v1/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '00000000-0000-4000-8000-000000000001',
        deviceName: 'E2E',
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        current: true,
      }),
    });
  });
  await page.route('**/api/v1/map/footprints**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], nextCursor: null }),
    });
  });
  await page.route('**/api/v1/places/search**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [place], query: place.name }),
    });
  });
  let publishBody: string | undefined;
  await page.route('**/api/v1/footprints', async (route) => {
    publishBody = route.request().postData() ?? undefined;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ footprint: { id: 'searched-place-footprint' } }),
    });
  });

  await page.goto('/map');
  await expectInteractiveMapReady(page);
  await page.getByRole('button', { name: 'Search places' }).click();
  await page.getByLabel('Place search').fill(place.name);
  await page.getByLabel('Place search').press('Enter');

  await expect.poll(() => Number(new URL(page.url()).searchParams.get('lat')))
    .toBeCloseTo(place.lat, 5);
  await expect.poll(() => Number(new URL(page.url()).searchParams.get('lng')))
    .toBeCloseTo(place.lng, 5);
  const searchedViewport = readViewportFromUrl(page.url());
  expect(searchedViewport.west).toBeLessThan(place.lng);
  expect(searchedViewport.east).toBeGreaterThan(place.lng);
  expect(searchedViewport.south).toBeLessThan(place.lat);
  expect(searchedViewport.north).toBeGreaterThan(place.lat);
  expect((searchedViewport.west + searchedViewport.east) / 2)
    .toBeCloseTo(place.lng, 5);
  expect((searchedViewport.south + searchedViewport.north) / 2)
    .toBeCloseTo(place.lat, 5);
  await page.getByRole('button', { name: 'Leave footprint' }).click();
  await expect(page).toHaveURL(/\/publish(?:\?|$)/);
  await page.getByLabel('Message').fill('A crossing found from the map');
  await page.locator('.publish-route')
    .getByRole('button', { name: 'Publish footprint' })
    .click();

  await expect.poll(() => publishBody).toBeTruthy();
  const submitted = JSON.parse(publishBody ?? '{}') as {
    readonly privatePoint?: { readonly lat?: number; readonly lng?: number };
  };
  expect(submitted.privatePoint?.lat).toBeCloseTo(place.lat, 5);
  expect(submitted.privatePoint?.lng).toBeCloseTo(place.lng, 5);
});

test('Japanese map controls retain their full labels at the configured viewport', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bliver.locale', 'ja'));
  await page.route('**/api/v1/map/footprints**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [V2_TEST_FOOTPRINTS[0]], nextCursor: null }),
    });
  });
  await page.goto('/map');
  await expectInteractiveMapReady(page);
  await page.locator('.map-route__controls button[aria-expanded]').click();
  await expectMapControlsFit(page);
});

test('attribution stays clear of both empty and footprint preview cards', async ({ page }) => {
  let items: readonly unknown[] = [];
  await page.route('**/api/v1/map/footprints**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items, nextCursor: null }),
    });
  });

  await page.goto('/map');
  await expectInteractiveMapReady(page);
  const attribution = page.locator('.map-canvas__attribution');
  const attributionSummary = attribution.locator('summary');
  await expect(attributionSummary).toBeVisible();
  await expectNoOverlap(attribution, page.locator('.map-route__empty'), 'attribution and empty state');

  await attributionSummary.click();
  await expect(attribution.getByRole('link', { name: 'OpenFreeMap' })).toBeVisible();
  await expect(attribution.getByRole('link', { name: 'OpenMapTiles' })).toBeVisible();
  await expect(attribution.getByRole('link', { name: 'OpenStreetMap' })).toBeVisible();
  await expectNoOverlap(
    attribution.locator(':scope > div'),
    page.locator('.map-route__empty'),
    'expanded attribution and empty state',
  );
  await attributionSummary.click();

  items = [V2_TEST_FOOTPRINTS[0]];
  await page.reload();
  await expectInteractiveMapReady(page);
  await expect(page.locator('.map-route__preview')).toBeVisible();
  await expectNoOverlap(
    page.locator('.map-canvas__attribution'),
    page.locator('.map-route__preview'),
    'attribution and footprint preview',
  );
  await page.locator('.map-canvas__attribution summary').click();
  await expectNoOverlap(
    page.locator('.map-canvas__attribution > div'),
    page.locator('.map-route__preview'),
    'expanded attribution and footprint preview',
  );
});

test('offline map failure keeps the application shell and exposes a reconnect action', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
  });
  await page.route('**/api/v1/map/footprints**', async (route) => { await route.abort('internetdisconnected'); });
  await page.goto('/map');
  await expect(page.getByRole('heading', { name: 'Map offline' })).toBeVisible();
  await expect(page.getByText('Reconnect to load footprints. Your private map data is not cached.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test('publish form recovers only non-sensitive draft fields', async ({ context, page }) => {
  await context.addCookies([{ name: 'bliver_session', value: 'e2e-session', domain: '127.0.0.1', path: '/' }]);
  await page.route('**/api/v1/session', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: '00000000-0000-4000-8000-000000000001', deviceName: 'E2E', createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), current: true }) }); });
  await page.addInitScript(() => {
    localStorage.setItem('bliver:footprint-draft', JSON.stringify({ message: 'Recovered offline note', visibility: 'friends', locationPrecision: 'approximate' }));
  });
  await page.goto('/publish?lat=31&lng=121');
  await expect(page.getByLabel('Message')).toHaveValue('Recovered offline note');
  await expect(page.getByLabel('Who can see it')).toHaveValue('friends');
  const serialized = await page.evaluate(() => localStorage.getItem('bliver:footprint-draft'));
  expect(serialized).not.toMatch(/lat|lng|token|file|asset/i);
});

test('authenticated publish flow keeps audience and precision controls explicit', async ({ context, page }) => {
  await context.addCookies([{ name: 'bliver_session', value: 'e2e-session', domain: '127.0.0.1', path: '/' }]);
  await page.route('**/api/v1/session', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: '00000000-0000-4000-8000-000000000001', deviceName: 'E2E', createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), current: true }) }); });
  let publishRequest: { readonly body: string; readonly cookie: string | undefined } | undefined;
  await page.route('**/api/v1/footprints', async (route) => {
    publishRequest = { body: route.request().postData() ?? '', cookie: (await route.request().headerValue('cookie')) ?? undefined };
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ footprint: { id: 'e2e-footprint' } }) });
  });
  await page.goto('/publish?lat=31&lng=121');
  await page.getByLabel('Message').fill('A quiet river crossing');
  await page.getByLabel('Who can see it').selectOption('friends');
  await page.getByLabel('Location precision').selectOption('precise');
  await expect(page.getByLabel('Who can see it')).toHaveValue('friends');
  await expect(page.getByLabel('Location precision')).toHaveValue('precise');
  await page.locator('.publish-route').getByRole('button', { name: 'Publish footprint' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect.poll(() => publishRequest).toBeTruthy();
  expect(publishRequest?.cookie).toContain('bliver_session=e2e-session');
  expect(JSON.parse(publishRequest?.body ?? '{}')).toMatchObject({ privatePoint: { lat: 31, lng: 121 }, visibility: 'friends', locationPrecision: 'precise' });
});

test('footprint deep links expose privacy labels for precise and approximate locations', async ({ page }) => {
  await page.route('**/api/v1/footprints/test-footprint', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: '00000000-0000-4000-8000-000000000002', author: { id: '00000000-0000-4000-8000-000000000003', name: 'E2E' }, displayPoint: { lat: 31, lng: 121 }, visibility: 'public', locationPrecision: 'approximate', message: 'A tested footprint', publishedAt: new Date().toISOString() }) }); });
  await page.goto('/footprints/test-footprint');
  await expect(page.getByRole('heading', { name: 'Footprint' })).toBeVisible();
  await expect(page.getByText('Approximate location')).toBeVisible();
  await page.goto('/footprints/test-footprint?precision=precise');
  await expect(page.getByText('Approximate location')).toBeVisible();
});

test.describe('reduced motion map capability', () => {
  test('keeps the static geography and semantic footprint path operable', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/api/v1/map/footprints**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [V2_TEST_FOOTPRINTS[0]], nextCursor: null }),
      });
    });
    await page.goto('/map');

    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    await expect(page.getByTestId('map-static-fallback')).toBeVisible();
    const footprintItem = page.getByTestId('map-footprint-item');
    await expect(footprintItem).toBeVisible();
    await expect(page.locator('.maplibregl-canvas')).toHaveCount(0);
    await footprintItem.click();
    await expect(page).toHaveURL(new RegExp(`footprint=${V2_TEST_FOOTPRINTS[0]!.id}`));
    await expectNoAxeViolations(page);
  });
});
