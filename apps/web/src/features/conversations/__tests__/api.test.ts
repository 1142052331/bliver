// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendMessage } from '../api.js';

afterEach(() => vi.unstubAllGlobals());

describe('conversation web API', () => {
  it('keeps the caller idempotency key and CSRF header on retries', async () => {
    Object.defineProperty(document, 'cookie', { configurable: true, value: 'bliver_csrf=csrf-token' });
    const response = { ok: true, status: 201, json: vi.fn(async () => ({ id: '019f0000-0000-7000-8000-000000000001', conversationId: '019f0000-0000-7000-8000-000000000002', senderId: '019f0000-0000-7000-8000-000000000003', content: 'hello', kind: 'message', sentAt: '2026-07-15T08:00:00.000Z', eventId: '019f0000-0000-7000-8000-000000000004', moderation: { status: 'pending', labels: [] } })) };
    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal('fetch', fetchMock);
    const first = await sendMessage('019f0000-0000-7000-8000-000000000002', 'hello', 'message-key-1');
    const second = await sendMessage('019f0000-0000-7000-8000-000000000002', 'hello', 'message-key-1');
    expect(first).toEqual(second);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0]?.[1]).toMatchObject({ headers: expect.objectContaining({ 'idempotency-key': 'message-key-1', 'x-csrf-token': 'csrf-token' }) });
  });
});
