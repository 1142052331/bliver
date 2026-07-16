import { expect, test, type Browser, type BrowserContext, type Page, type Route } from '@playwright/test';

const actorA = '019f0000-0000-7000-8000-000000000001';
const actorB = '019f0000-0000-7000-8000-000000000002';
const friendshipId = '019f0000-0000-7000-8000-000000000003';
const conversationId = '019f0000-0000-7000-8000-000000000004';
const greetingId = '019f0000-0000-7000-8000-000000000005';
const replyId = '019f0000-0000-7000-8000-000000000006';
const now = '2026-07-15T08:00:00.000Z';

type Actor = 'a' | 'b';
interface SocialMessagingState {
  friendship: 'none' | 'pending' | 'accepted';
  conversation: 'none' | 'requested' | 'active' | 'blocked';
  greetingSent: boolean;
  replySent: boolean;
  unreadForB: number;
  blocked: Set<string>;
  revoked: Set<Actor>;
}

function userId(actor: Actor): string { return actor === 'a' ? actorA : actorB; }
function otherId(actor: Actor): string { return actor === 'a' ? actorB : actorA; }
function response(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}
function conversationDto(state: SocialMessagingState) {
  return { id: conversationId, participantLowId: actorA, participantHighId: actorB, initiatorId: actorA, state: state.conversation === 'none' ? 'requested' : state.conversation, createdAt: now, updatedAt: now };
}
function messageDto(id: string, senderId: string, content: string, kind: 'greeting' | 'message') {
  return { id, conversationId, senderId, content, kind, sentAt: now, eventId: id, moderation: { status: 'clear', labels: [] } };
}

async function mockApi(page: Page, actor: Actor, state: SocialMessagingState): Promise<void> {
  await page.routeWebSocket('**/socket.io/**', () => undefined);
  await page.context().addCookies([
    { name: 'bliver_session', value: `e2e-${actor}`, domain: '127.0.0.1', path: '/' },
    { name: 'bliver_csrf', value: 'e2e-csrf-token', domain: '127.0.0.1', path: '/' },
  ]);
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === '/api/v1/session') {
      if (state.revoked.has(actor)) return response(route, { code: 'SESSION_INVALID' }, 401);
      return response(route, { id: `e2e-${actor}`, deviceName: 'Playwright', createdAt: now, lastSeenAt: now, current: true });
    }
    if (path === '/api/v1/users/me') {
      if (state.revoked.has(actor)) return response(route, { code: 'SESSION_INVALID' }, 401);
      return response(route, { id: userId(actor), username: `person-${actor}`, displayName: `Person ${actor.toUpperCase()}`, email: null, roles: ['user'] });
    }
    if (path === '/api/v1/friendships/requests' && method === 'GET') {
      const incoming = state.friendship === 'pending' && actor === 'b' ? [{ id: friendshipId, userId: actorA, createdAt: now }] : [];
      const outgoing = state.friendship === 'pending' && actor === 'a' ? [{ id: friendshipId, userId: actorB, createdAt: now }] : [];
      return response(route, { incoming, outgoing });
    }
    if (path === '/api/v1/friendships' && method === 'GET') {
      const items = state.friendship === 'accepted' ? [{ friendshipId, userId: otherId(actor), status: 'accepted', updatedAt: now }] : [];
      return response(route, { items });
    }
    if (path === '/api/v1/friendships' && method === 'POST') {
      state.friendship = 'pending';
      return response(route, { id: friendshipId, requesterId: actorA, addresseeId: actorB, status: 'pending', createdAt: now, updatedAt: now }, 201);
    }
    if (path === `/api/v1/friendships/${friendshipId}/accept` && method === 'POST') {
      state.friendship = 'accepted';
      return response(route, { id: friendshipId, requesterId: actorA, addresseeId: actorB, status: 'accepted', createdAt: now, updatedAt: now });
    }
    if (path === `/api/v1/friendships/${friendshipId}/reject` && method === 'POST') {
      state.friendship = 'none';
      return response(route, { id: friendshipId, requesterId: actorA, addresseeId: actorB, status: 'rejected', createdAt: now, updatedAt: now });
    }
    if (path.startsWith('/api/v1/friendships/') && method === 'DELETE') {
      state.friendship = 'none';
      return response(route, {}, 204);
    }
    if (path === '/api/v1/blocks' && method === 'GET') {
      const items = state.blocked.has(otherId(actor)) ? [{ userId: otherId(actor), createdAt: now }] : [];
      return response(route, { items });
    }
    if (path.startsWith('/api/v1/blocks/') && method === 'PUT') {
      state.blocked.add(path.split('/').at(-1) ?? '');
      state.conversation = 'blocked';
      return response(route, { userId: otherId(actor), createdAt: now });
    }
    if (path.startsWith('/api/v1/blocks/') && method === 'DELETE') {
      state.blocked.delete(path.split('/').at(-1) ?? '');
      state.conversation = state.replySent ? 'active' : 'requested';
      return response(route, {}, 204);
    }
    if (path === '/api/v1/conversations' && method === 'GET') {
      if (state.conversation === 'none') return response(route, { items: [] });
      const lastMessage = state.replySent ? messageDto(replyId, actorB, 'Reply unlocks the conversation', 'message') : messageDto(greetingId, actorA, 'Hello from the river', 'greeting');
      const unreadCount = actor === 'b' ? state.unreadForB : 0;
      return response(route, { items: [{ ...conversationDto(state), unreadCount, lastMessage }] });
    }
    if (path === `/api/v1/users/${actorB}/greetings` && method === 'POST') {
      state.greetingSent = true;
      state.conversation = 'requested';
      state.unreadForB = 1;
      return response(route, { conversation: conversationDto(state), message: messageDto(greetingId, actorA, 'Hello from the river', 'greeting') }, 201);
    }
    if (path === `/api/v1/conversations/${conversationId}/messages` && method === 'GET') {
      if (!state.greetingSent) return response(route, { items: [] });
      const items = [messageDto(greetingId, actorA, 'Hello from the river', 'greeting')];
      if (state.replySent) items.push(messageDto(replyId, actorB, 'Reply unlocks the conversation', 'message'));
      return response(route, { items });
    }
    if (path === `/api/v1/conversations/${conversationId}/typing` && method === 'GET') return response(route, { items: [] });
    if (path === `/api/v1/conversations/${conversationId}/reply` && method === 'POST') {
      state.replySent = true;
      state.conversation = 'active';
      state.unreadForB = 0;
      return response(route, { conversation: conversationDto(state), message: messageDto(replyId, actorB, 'Reply unlocks the conversation', 'message') });
    }
    return response(route, {}, 404);
  });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function newUserPage(browser: Browser, actor: Actor, state: SocialMessagingState): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await mockApi(page, actor, state);
  return { page, close: () => context.close() };
}

test('two people can request, accept, greet, reply, and see unread state', async ({ browser }) => {
  const state: SocialMessagingState = { friendship: 'none', conversation: 'none', greetingSent: false, replySent: false, unreadForB: 0, blocked: new Set(), revoked: new Set() };
  const userA = await newUserPage(browser, 'a', state);
  const userB = await newUserPage(browser, 'b', state);
  try {
    await userA.page.goto('/people');
    await expect(userA.page.getByRole('heading', { name: 'People' })).toBeVisible();
    await userA.page.getByRole('textbox', { name: 'Person ID', exact: true }).fill(actorB);
    await userA.page.getByRole('button', { name: 'Send request' }).click();
    await expect(userA.page.getByText('Friend request sent.')).toBeVisible();

    await userB.page.goto('/people');
    await userB.page.getByRole('button', { name: 'Accept' }).click();
    await expect(userB.page.getByText('Friend request accepted.')).toBeVisible();
    await userA.page.reload();
    await expect(userA.page.getByText('Messages are unlocked')).toBeVisible();

    await userA.page.goto('/messages');
    await userA.page.getByRole('textbox', { name: 'Person ID', exact: true }).fill(actorB);
    await userA.page.getByRole('textbox', { name: 'Greeting', exact: true }).fill('Hello from the river');
    await userA.page.getByRole('button', { name: 'Send greeting' }).click();
    await expect(userA.page).toHaveURL(new RegExp(`/messages/${conversationId}$`));

    await userB.page.goto('/messages');
    await expect(userB.page.getByText('1 unread')).toBeVisible();
    await userB.page.getByRole('link', { name: /Open conversation/ }).click();
    await expect(userB.page.getByText('Hello from the river')).toBeVisible();
    await userB.page.getByRole('textbox', { name: 'Message' }).fill('Reply unlocks the conversation');
    await userB.page.getByRole('button', { name: 'Reply and unlock' }).click();
    await expect(userB.page.getByText('Conversation unlocked.')).toBeVisible();
    await expectNoHorizontalOverflow(userA.page);
    await expectNoHorizontalOverflow(userB.page);
  } finally {
    await userA.close();
    await userB.close();
  }
});

test('messaging safety supports block, unblock, and forced revocation on a deep link', async ({ browser }) => {
  const state: SocialMessagingState = { friendship: 'accepted', conversation: 'active', greetingSent: true, replySent: true, unreadForB: 0, blocked: new Set(), revoked: new Set() };
  const userB = await newUserPage(browser, 'b', state);
  try {
    await userB.page.goto(`/messages/${conversationId}`);
    await expect(userB.page.getByText('Reply unlocks the conversation')).toBeVisible();
    await userB.page.getByRole('button', { name: 'Block' }).click();
    await expect(userB.page.getByText('Person blocked.')).toBeVisible();
    await userB.page.getByRole('button', { name: 'Unblock' }).click();
    await expect(userB.page.getByText('Person unblocked.')).toBeVisible();
    state.revoked.add('b');
    await userB.page.reload();
    await expect(userB.page).toHaveURL(/\/session-expired$/);
    await expect(userB.page.getByRole('heading', { name: 'Session expired' })).toBeVisible();
    await expectNoHorizontalOverflow(userB.page);
  } finally {
    await userB.close();
  }
});

async function registerRealtimeActor(
  browser: Browser,
  username: string,
): Promise<{ context: BrowserContext; page: Page; userId: string; csrf: string }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const registration = await page.request.post('/api/v1/auth/register', {
    data: { username, password: 'browser-fixture-passphrase', displayName: username },
  });
  const registrationBody = await registration.text();
  expect(registration.ok(), registrationBody).toBe(true);
  const body = JSON.parse(registrationBody) as { user: { id: string } };
  const csrf = (await context.cookies()).find((cookie) => cookie.name === 'bliver_csrf')?.value;
  expect(csrf).toBeTruthy();
  return { context, page, userId: body.user.id, csrf: csrf ?? '' };
}

test('real Socket delivery resyncs after a dual-browser offline window', async ({ browser }, testInfo) => {
  const suffix = `${testInfo.project.name}-${testInfo.retry}`.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const userA = await registerRealtimeActor(browser, `socketa${suffix}`);
  const userB = await registerRealtimeActor(browser, `socketb${suffix}`);
  try {
    const greeting = await userA.page.request.post(`/api/v1/users/${userB.userId}/greetings`, {
      headers: { 'x-csrf-token': userA.csrf, 'idempotency-key': `greeting-${suffix}` },
      data: { content: 'Realtime fixture greeting' },
    });
    expect(greeting.ok()).toBe(true);
    const conversationIdValue = ((await greeting.json()) as { conversation: { id: string } }).conversation.id;
    const reply = await userB.page.request.post(`/api/v1/conversations/${conversationIdValue}/reply`, {
      headers: { 'x-csrf-token': userB.csrf, 'idempotency-key': `reply-${suffix}` },
      data: { content: 'Realtime fixture reply' },
    });
    expect(reply.ok()).toBe(true);

    await Promise.all([
      userA.page.goto(`/messages/${conversationIdValue}`),
      userB.page.goto(`/messages/${conversationIdValue}`),
    ]);
    await expect(userA.page.getByText('Realtime fixture reply')).toBeVisible();
    await expect(userB.page.getByText('Realtime fixture greeting')).toBeVisible();

    await userA.context.setOffline(true);
    await userB.page.getByRole('textbox', { name: 'Message' }).fill('Delivered after reconnect resync');
    await userB.page.getByRole('button', { name: 'Send' }).click();
    await expect(userB.page.getByRole('list').getByText('Delivered after reconnect resync')).toBeVisible();
    await userA.context.setOffline(false);
    await expect(userA.page.getByRole('list').getByText('Delivered after reconnect resync')).toBeVisible({ timeout: 15_000 });
  } finally {
    await Promise.all([userA.context.close(), userB.context.close()]);
  }
});
