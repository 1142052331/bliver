// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addComment, addReaction, addReply, deleteComment, reportFootprint, removeReaction } from '../api.js';

afterEach(() => { vi.unstubAllGlobals(); document.cookie = 'bliver_csrf=; Max-Age=0'; });

describe('activity API mutation requests', () => {
  it('sends the non-HttpOnly CSRF cookie on every cookie-authenticated mutation', async () => {
    document.cookie = 'bliver_csrf=unit-csrf';
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => ({ ok: true, status: String(input).includes('/reports') ? 201 : String(input).includes('/reactions') ? 200 : 204, json: async () => String(input).includes('/reports') ? { id: '019f0000-0000-7000-8000-000000000004', status: 'open' } : { emoji: 'heart', actorId: '019f0000-0000-7000-8000-000000000001', createdAt: '2026-07-15T08:00:00.000Z' } }));
    vi.stubGlobal('fetch', fetchMock);
    await addReaction('019f0000-0000-7000-8000-000000000002', 'heart');
    await removeReaction('019f0000-0000-7000-8000-000000000002');
    await addComment('019f0000-0000-7000-8000-000000000002', 'hello');
    await addReply('019f0000-0000-7000-8000-000000000002', '019f0000-0000-7000-8000-000000000003', 'reply');
    await deleteComment('019f0000-0000-8000-8000-000000000003');
    await reportFootprint('019f0000-0000-7000-8000-000000000002', 'spam');
    expect((fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit]>).map(([, init]) => init.headers)).toHaveLength(6);
    for (const [, init] of fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit]>) expect(init.headers).toEqual(expect.objectContaining({ 'x-csrf-token': 'unit-csrf' }));
  });
});
