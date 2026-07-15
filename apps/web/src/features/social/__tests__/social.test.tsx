// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { FriendRequestList, RelationshipList } from '../PeopleRoute.js';

const incoming = {
  id: '019f0000-0000-7000-8000-000000000001',
  userId: '019f0000-0000-7000-8000-000000000002',
  createdAt: '2026-07-15T08:00:00.000Z',
};

describe('social relationship views', () => {
  it('keeps incoming and outgoing requests distinct and exposes both decisions', () => {
    const accept = vi.fn();
    const reject = vi.fn();

    render(
      <FriendRequestList
        incoming={[incoming]}
        outgoing={[{ ...incoming, id: '019f0000-0000-7000-8000-000000000003' }]}
        busyId={null}
        onAccept={accept}
        onReject={reject}
      />,
    );

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

    render(
      <MemoryRouter><RelationshipList
        friendships={[{
          friendshipId: '019f0000-0000-7000-8000-000000000004',
          userId: incoming.userId,
          status: 'accepted',
          updatedAt: incoming.createdAt,
        }]}
        blocks={[{ userId: '019f0000-0000-7000-8000-000000000005', createdAt: incoming.createdAt }]}
        busyId={null}
        onRemove={remove}
        onUnblock={unblock}
      /></MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove friend' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unblock' }));
    expect(remove).toHaveBeenCalledWith(incoming.userId);
    expect(unblock).toHaveBeenCalledWith('019f0000-0000-7000-8000-000000000005');
    expect(screen.getByText('Blocked people cannot find or message you.')).toBeVisible();
  });
});
