// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const currentUserId = '019f0000-0000-7000-8000-000000000001';
const peerUserId = '019f0000-0000-7000-8000-000000000002';
const conversationId = '019f0000-0000-7000-8000-000000000003';
const conversation = { id: conversationId, participantLowId: currentUserId, participantHighId: peerUserId, initiatorId: peerUserId, state: 'requested', createdAt: '2026-07-15T08:00:00.000Z', updatedAt: '2026-07-15T08:00:00.000Z', unreadCount: 1 };
const greeting = { id: '019f0000-0000-7000-8000-000000000004', conversationId, senderId: peerUserId, content: 'Hello from the park', kind: 'greeting', sentAt: '2026-07-15T08:00:00.000Z', eventId: '019f0000-0000-7000-8000-000000000005', moderation: { status: 'pending', labels: [] } };
const realtime = { sendMessage: vi.fn(), setTyping: vi.fn(), markRead: vi.fn(), disconnect: vi.fn() };

vi.mock('../realtime.js', () => ({ connectConversationRealtime: vi.fn(() => realtime) }));

import { ConversationRoute, MessagesRoute } from '../routes.js';

function ok(body: unknown, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => body } as Response; }
function renderRoutes(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes><Route path="/messages" element={<MessagesRoute />} /><Route path="/messages/:conversationId" element={<ConversationRoute />} /><Route path="/session-expired" element={<h1>Session expired</h1>} /></Routes></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/users/me')) return ok({ id: currentUserId, username: 'river', displayName: 'River', email: null, roles: ['user'] });
    if (url.includes('/users?ids=')) return ok({ items: [{ id: peerUserId, username: 'harbor', displayName: 'Harbor Light' }] });
    if (url.endsWith('/friendships')) return ok({ items: [] });
    if (url.endsWith('/conversations')) return ok({ items: [conversation] });
    if (url.includes('/messages?')) return ok({ items: [greeting] });
    if (url.endsWith('/typing')) return ok({ items: [{ conversationId, userId: peerUserId, active: true, expiresAt: '2099-07-15T08:00:00.000Z' }] });
    if (url.endsWith('/reply')) return ok({ conversation: { ...conversation, state: 'active' }, message: { ...greeting, id: '019f0000-0000-7000-8000-000000000006', eventId: '019f0000-0000-7000-8000-000000000007', senderId: currentUserId, kind: 'message', content: 'Welcome' } });
    throw new Error(`Unexpected request: ${url}`);
  }));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('message routes', () => {
  it('renders the addressable conversation list and people entry point', async () => {
    renderRoutes('/messages');
    expect(await screen.findByRole('heading', { name: 'Messages' })).toBeVisible();
    expect(await screen.findByRole('link', { name: /open conversation/i })).toHaveAttribute('href', `/messages/${conversationId}`);
    expect(screen.getByRole('link', { name: 'People' })).toHaveAttribute('href', '/people');
  });

  it('opens a deep-linked incoming greeting and replies to unlock it', async () => {
    renderRoutes(`/messages/${conversationId}`);
    expect(await screen.findByText('Hello from the park')).toBeVisible();
    expect(await screen.findByText('Harbor Light is typing')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Welcome' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reply and unlock' }));
    expect(await screen.findByText('Conversation unlocked.')).toBeVisible();
  });

  it('redirects a revoked session without losing the deep-link destination', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({ code: 'SESSION_INVALID' }, 401)));
    renderRoutes(`/messages/${conversationId}`);
    expect(await screen.findByRole('heading', { name: 'Session expired' })).toBeVisible();
  });
});
