import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const footprint = { id: '019f0000-0000-7000-8000-000000000001', author: { id: '019f0000-0000-7000-8000-000000000002', name: 'Lin' }, displayPoint: { lat: 31, lng: 121 }, visibility: 'public', locationPrecision: 'approximate', message: 'By the river', publishedAt: '2026-07-15T08:00:00.000Z', discoveryExpiresAt: '2099-07-16T08:00:00.000Z' };
const comment = { id: '019f0000-0000-7000-8000-000000000003', footprintId: footprint.id, author: footprint.author, content: 'First note', parentCommentId: null, createdAt: '2026-07-15T08:01:00.000Z', replies: [] };

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/session', (route) => route.fulfill({ status: 401, contentType: 'application/problem+json', body: '{}' }));
});

async function activity(page: Page, items = [footprint]) {
  await page.route('**/api/v1/activity**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items, resolvedScope: 'global' }) }));
}

async function authenticatedSession(page: Page, sessionId: string) {
  await page.unroute('**/api/v1/session');
  await page.route('**/api/v1/session', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: sessionId, deviceName: 'E2E', createdAt: '2026-07-15T08:00:00.000Z', lastSeenAt: '2026-07-15T08:00:00.000Z', current: true }) }));
  await page.context().addCookies([{ name: 'bliver_session', value: sessionId, domain: '127.0.0.1', path: '/' }]);
}

test('guest discovery keeps a pending reaction through authentication', async ({ page }) => {
  await activity(page);
  let reactionAttempts = 0;
  await page.route('**/reactions', (route) => { reactionAttempts += 1; return reactionAttempts === 1 ? route.fulfill({ status: 401, contentType: 'application/problem+json', body: '{}' }) : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ actorId: footprint.author.id, emoji: 'heart', createdAt: '2026-07-15T08:02:00.000Z' }) }); });
  await page.route('**/api/v1/auth/login', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: '019f0000-0000-7000-8000-000000000020', username: 'guest', displayName: 'Guest', email: null, roles: ['user'] }, session: { id: '019f0000-0000-7000-8000-000000000021', deviceName: 'E2E', createdAt: '2026-07-15T08:00:00.000Z', lastSeenAt: '2026-07-15T08:00:00.000Z', current: true } }) }));
  await page.goto('/activity');
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible();
  await expect(page.getByText('By the river')).toBeVisible();
  await page.getByRole('button', { name: 'React with heart' }).click();
  await expect(page.getByText('Sign in to react.')).toBeVisible();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('bliver:pending-action'))).toContain('reaction');
  await page.getByRole('link', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Username').fill('guest');
  await page.getByLabel('Password').fill('password-123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/activity$/);
  await expect.poll(() => reactionAttempts).toBe(2);
});

test('authenticated reaction, comment, reply, and report stay in the public interaction loop', async ({ page }) => {
  await authenticatedSession(page, 'e2e-auth-session');
  await activity(page);
  await page.route('**/reactions', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ actorId: footprint.author.id, emoji: 'heart', createdAt: '2026-07-15T08:02:00.000Z' }) }));
  await page.route('**/comments', (route) => route.request().method() === 'GET' ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [comment] }) }) : route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(comment) }));
  await page.route('**/comments/*/replies', (route) => route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ...comment, id: '019f0000-0000-7000-8000-000000000004', parentCommentId: comment.id }) }));
  await page.route('**/api/v1/reports', (route) => route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: '019f0000-0000-7000-8000-000000000005', status: 'open' }) }));
  await page.goto('/activity');
  await page.getByRole('button', { name: 'React with heart' }).click();
  await expect(page.getByRole('button', { name: 'React with heart' })).toHaveClass(/bliver-button--primary/);
  await page.getByRole('button', { name: 'Comment' }).click();
  await expect(page.getByText('First note')).toBeVisible();
  await page.getByLabel('Comment').fill('New note');
  await page.getByRole('button', { name: 'Post' }).click();
  await page.getByRole('button', { name: 'Reply' }).click();
  await page.getByLabel('Reply').fill('A reply');
  await page.getByRole('button', { name: 'Post' }).click();
  await page.getByRole('button', { name: 'Report' }).click();
  await expect(page.getByText('Report received.')).toBeVisible();
});

test('blocked content is absent from discovery for an authenticated actor', async ({ page }) => {
  await authenticatedSession(page, 'e2e-blocked-session');
  const blocked = { ...footprint, id: '019f0000-0000-7000-8000-000000000099', author: { ...footprint.author, id: '019f0000-0000-7000-8000-000000000098', name: 'Blocked author' }, message: 'Should never cross the privacy filter' };
  await activity(page, [footprint]);
  await page.goto('/activity');
  await expect(page.getByText('By the river')).toBeVisible();
  await expect(page.getByText(blocked.message)).toHaveCount(0);
  await expect(page.getByText(blocked.author.name)).toHaveCount(0);
});
