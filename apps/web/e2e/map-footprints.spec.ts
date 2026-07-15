import { expect, test } from '@playwright/test';

test('guest map opens as the primary surface', async ({ page }) => {
  await page.goto('/map');
  await expect(page.getByRole('heading', { name: 'Map' })).toBeVisible();
  await expect(page.getByTestId('map-canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Search places' })).toBeVisible();
});

test('authenticated publish flow keeps audience and precision controls explicit', async ({ context, page }) => {
  await context.addCookies([{ name: 'bliver_session', value: 'e2e-session', domain: '127.0.0.1', path: '/' }]);
  let publishRequest: { readonly body: string; readonly cookie: string | undefined } | undefined;
  await page.route('**/api/v1/footprints', async (route) => {
    publishRequest = { body: route.request().postData() ?? '', cookie: (await route.request().headerValue('cookie')) ?? undefined };
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ footprint: { id: 'e2e-footprint' } }) });
  });
  await page.goto('/publish');
  await page.getByLabel('Message').fill('A quiet river crossing');
  await page.getByLabel('Who can see it').selectOption('friends');
  await page.getByLabel('Location precision').selectOption('precise');
  await expect(page.getByLabel('Who can see it')).toHaveValue('friends');
  await expect(page.getByLabel('Location precision')).toHaveValue('precise');
  await page.locator('.publish-route').getByRole('button', { name: 'Publish footprint' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect.poll(() => publishRequest).toBeTruthy();
  expect(publishRequest?.cookie).toContain('bliver_session=e2e-session');
  expect(JSON.parse(publishRequest?.body ?? '{}')).toMatchObject({ visibility: 'friends', locationPrecision: 'precise' });
});

test('footprint deep links expose privacy labels for precise and approximate locations', async ({ page }) => {
  await page.goto('/footprints/test-footprint');
  await expect(page.getByRole('heading', { name: 'Footprint' })).toBeVisible();
  await expect(page.getByText('Approximate location')).toBeVisible();
  await page.goto('/footprints/test-footprint?precision=precise');
  await expect(page.getByText('Precise location')).toBeVisible();
});
