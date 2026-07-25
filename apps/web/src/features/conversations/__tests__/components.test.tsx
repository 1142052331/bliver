// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import {
  ConversationList,
  GreetingComposer,
  MessageComposer,
  MessageSettings,
  MessageTimeline,
} from '../components.js';

const aliceId = '019f0000-0000-7000-8000-000000000001';
const bobId = '019f0000-0000-7000-8000-000000000002';
const conversationId = '019f0000-0000-7000-8000-000000000003';
const message = {
  id: '019f0000-0000-7000-8000-000000000004',
  conversationId,
  senderId: aliceId,
  content: 'Meet by the river',
  kind: 'message' as const,
  sentAt: '2026-07-15T08:00:00.000Z',
  eventId: '019f0000-0000-7000-8000-000000000005',
  moderation: { status: 'pending' as const, labels: [] },
};
const scrollIntoView = vi.fn();

Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  configurable: true,
  value: scrollIntoView,
});

describe('conversation views', () => {
  it('preserves history position for typing and incoming messages', () => {
    scrollIntoView.mockClear();
    const initialIncoming = { ...message, senderId: bobId };
    const nextIncoming = {
      ...message,
      id: '019f0000-0000-7000-8000-000000000006',
      eventId: '019f0000-0000-7000-8000-000000000007',
      senderId: bobId,
      sentAt: '2026-07-15T08:01:00.000Z',
    };
    const { container, rerender } = render(
      <MessageTimeline
        currentUserId={aliceId}
        messages={[initialIncoming]}
        pending={[]}
        onRetry={vi.fn()}
      />,
    );

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    const timeline = container.querySelector<HTMLOListElement>('.message-timeline');
    expect(timeline).not.toBeNull();
    Object.defineProperties(timeline, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 1_000 },
      scrollTop: { configurable: true, value: 120, writable: true },
    });
    fireEvent.scroll(timeline as HTMLOListElement);

    rerender(
      <MessageTimeline
        currentUserId={aliceId}
        messages={[initialIncoming]}
        pending={[]}
        typingLabel="Bob is typing"
        onRetry={vi.fn()}
      />,
    );
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    rerender(
      <MessageTimeline
        currentUserId={aliceId}
        messages={[initialIncoming, nextIncoming]}
        pending={[]}
        onRetry={vi.fn()}
      />,
    );
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    rerender(
      <MessageTimeline
        currentUserId={aliceId}
        messages={[initialIncoming, nextIncoming]}
        pending={[{
          content: 'My reply',
          idempotencyKey: 'own-pending-message',
          status: 'sending',
        }]}
        onRetry={vi.fn()}
      />,
    );
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(screen.getByText('My reply')).toBeVisible();
  });

  it('links every conversation by id and exposes greeting and unread states', () => {
    render(
      <MemoryRouter>
        <ConversationList
          currentUserId={bobId}
          items={[{
            id: conversationId,
            participantLowId: aliceId,
            participantHighId: bobId,
            initiatorId: aliceId,
            state: 'requested',
            createdAt: message.sentAt,
            updatedAt: message.sentAt,
            unreadCount: 2,
            lastMessage: { ...message, kind: 'greeting' },
          }]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /open conversation/i })).toHaveAttribute('href', `/messages/${conversationId}`);
    expect(screen.getByText('New greeting')).toBeVisible();
    expect(screen.getByText('2 unread')).toBeVisible();
  });

  it('shows an actionable empty state instead of a blank list', () => {
    render(<MemoryRouter><ConversationList currentUserId={aliceId} items={[]} /></MemoryRouter>);
    expect(screen.getByText('No conversations yet')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Find people' })).toHaveAttribute('href', '/people');
  });

  it('uses one idempotency key for a failed optimistic message and its retry', async () => {
    const send = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(message);

    render(<MessageComposer conversationId={conversationId} disabled={false} onSend={send} />);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: message.content } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Message did not send.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry message' }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[0]?.[2]).toBeTruthy();
    expect(send.mock.calls[1]?.[2]).toBe(send.mock.calls[0]?.[2]);
  });

  it('keeps greeting, blocked, disabled, typing and failed states visible', () => {
    render(
      <>
        <GreetingComposer userId={bobId} disabled reason="Stranger greetings are off" onSend={vi.fn()} />
        <MessageTimeline currentUserId={aliceId} messages={[message]} pending={[{ content: 'Still sending', idempotencyKey: 'retry-key', status: 'failed' }]} typingLabel="Bob is typing" onRetry={vi.fn()} />
        <MessageSettings userId={bobId} blocked onBlock={vi.fn()} onUnblock={vi.fn()} />
      </>,
    );

    expect(screen.getByText('Stranger greetings are off')).toBeVisible();
    expect(screen.getByText('Bob is typing')).toBeVisible();
    expect(screen.getByText('Not sent')).toBeVisible();
    expect(screen.getByText('This person is blocked.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Unblock' })).toBeVisible();
  });
});
