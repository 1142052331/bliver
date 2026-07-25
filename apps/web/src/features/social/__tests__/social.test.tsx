// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FriendRequestList, PeopleRoute, RelationshipList } from '../PeopleRoute.js';
import { BliverI18nProvider } from '../../../i18n/I18nProvider.js';
import { createBliverI18n } from '../../../i18n/i18n.js';

const incoming = {
  id: '019f0000-0000-7000-8000-000000000001',
  userId: '019f0000-0000-7000-8000-000000000002',
  createdAt: '2026-07-15T08:00:00.000Z',
};
const blockedUserId = '019f0000-0000-7000-8000-000000000005';
const profiles = new Map([
  [incoming.userId, { id: incoming.userId, username: 'mina', displayName: 'Mina Kato' }],
  [blockedUserId, { id: blockedUserId, username: 'taro', displayName: 'Taro Ito' }],
]);
const i18n = createBliverI18n('en');

function wrap(node: React.ReactNode) {
  return <BliverI18nProvider instance={i18n}><MemoryRouter>{node}</MemoryRouter></BliverI18nProvider>;
}

function ok(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('social relationship views', () => {
  it('keeps incoming and outgoing requests distinct and exposes both decisions', () => {
    const accept = vi.fn();
    const reject = vi.fn();

    render(wrap(
      <FriendRequestList
        incoming={[incoming]}
        outgoing={[{ ...incoming, id: '019f0000-0000-7000-8000-000000000003' }]}
        profiles={profiles}
        busyId={null}
        onAccept={accept}
        onReject={reject}
      />,
    ));

    expect(screen.getByRole('heading', { name: 'Incoming requests' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Sent requests' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(accept).toHaveBeenCalledWith(incoming.id);
    expect(reject).toHaveBeenCalledWith(incoming.id);
  });

  it('supports removing friends and unblocking people without hiding safety state', () => {
    const remove = vi.fn();
    const unblock = vi.fn();

    render(wrap(
      <RelationshipList
        friendships={[{
          friendshipId: '019f0000-0000-7000-8000-000000000004',
          userId: incoming.userId,
          status: 'accepted',
          updatedAt: incoming.createdAt,
        }]}
        blocks={[{ userId: '019f0000-0000-7000-8000-000000000005', createdAt: incoming.createdAt }]}
        profiles={profiles}
        busyId={null}
        onRemove={remove}
        onUnblock={unblock}
      />,
    ));

    fireEvent.click(screen.getByRole('button', { name: 'Remove friend' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unblock' }));
    expect(remove).toHaveBeenCalledWith(incoming.userId);
    expect(unblock).toHaveBeenCalledWith(blockedUserId);
    expect(screen.getByText('Blocked people cannot find or message you.')).toBeVisible();
  });

  it('resolves relationship identities to public names and handles instead of truncated IDs', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/friendships/requests')) {
        return ok({ incoming: [incoming], outgoing: [] });
      }
      if (url.endsWith('/friendships')) {
        return ok({
          items: [{
            friendshipId: '019f0000-0000-7000-8000-000000000004',
            userId: incoming.userId,
            status: 'accepted',
            updatedAt: incoming.createdAt,
          }],
        });
      }
      if (url.endsWith('/blocks')) {
        return ok({ items: [{ userId: blockedUserId, createdAt: incoming.createdAt }] });
      }
      if (url.includes('/users?')) {
        return ok({ items: [...profiles.values()] });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        {wrap(<PeopleRoute />)}
      </QueryClientProvider>,
    );

    expect((await screen.findAllByText('Mina Kato')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('@mina')).length).toBeGreaterThan(0);
    expect(await screen.findByText('Taro Ito')).toBeVisible();
    expect(screen.getByText('@taro')).toBeVisible();
    expect(screen.queryByText(/Person 019f/i)).not.toBeInTheDocument();
    expect(screen.queryByText(incoming.userId)).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes('/api/v1/users?ids=')),
    ).toBe(true);
  });
});
