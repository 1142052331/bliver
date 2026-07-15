import type { MessageDto } from '@bliver/contracts';
import { Button } from '@bliver/ui';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import type { ConversationListItem } from './api.js';

function shortPerson(value: string): string { return `Person ${value.slice(0, 8)}`; }
function peer(item: ConversationListItem, currentUserId: string): string { return item.participantLowId === currentUserId ? item.participantHighId : item.participantLowId; }

export function ConversationList({ items, currentUserId }: { readonly items: readonly ConversationListItem[]; readonly currentUserId: string }) {
  if (!items.length) return <div className="messages-empty"><h2>No conversations yet</h2><p>Find someone from a public moment or your people list.</p><Link className="messages-text-link" to="/people">Find people</Link></div>;
  return (
    <div className="conversation-list" aria-label="Conversations">
      {items.map((item) => {
        const other = peer(item, currentUserId);
        const incomingGreeting = item.state === 'requested' && item.initiatorId !== currentUserId;
        return (
          <Link className="conversation-row" key={item.id} to={`/messages/${item.id}`} aria-label={`Open conversation with ${shortPerson(other)}`}>
            <span className="conversation-row__avatar" aria-hidden="true">{other.slice(0, 2).toUpperCase()}</span>
            <span className="conversation-row__body"><strong title={other}>{shortPerson(other)}</strong><small>{incomingGreeting ? 'New greeting' : item.lastMessage?.content ?? (item.state === 'requested' ? 'Waiting for a reply' : 'Open conversation')}</small></span>
            <span className="conversation-row__meta"><time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time>{item.unreadCount > 0 ? <b>{item.unreadCount} unread</b> : null}</span>
          </Link>
        );
      })}
    </div>
  );
}

interface GreetingComposerProps {
  readonly userId: string;
  readonly disabled?: boolean;
  readonly reason?: string;
  readonly onSend: (userId: string, content: string, idempotencyKey: string) => Promise<unknown>;
  readonly onSent?: (result: unknown) => void;
}

export function GreetingComposer({ userId, disabled = false, reason, onSend, onSent }: GreetingComposerProps) {
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const submit = async (): Promise<void> => {
    const value = content.trim(); if (!value || disabled || busy) return;
    setBusy(true); setNotice('');
    try { const result = await onSend(userId, value, crypto.randomUUID()); setContent(''); setNotice('Greeting sent.'); onSent?.(result); }
    catch (error) { setNotice(error instanceof Error && error.message === 'GREETING_ALREADY_SENT' ? 'You already sent a greeting.' : 'Greeting did not send. Try again.'); }
    finally { setBusy(false); }
  };
  return <form className="greeting-composer" onSubmit={(event) => { event.preventDefault(); void submit(); }}><label htmlFor="greeting-message">Greeting</label><textarea id="greeting-message" value={content} onChange={(event) => setContent(event.target.value)} disabled={disabled || busy} maxLength={2000} placeholder="Say hello once" /><div className="composer-actions"><small>{reason ?? 'A reply unlocks the full conversation.'}</small><Button type="submit" disabled={disabled || busy || !content.trim()}>{busy ? 'Sending...' : 'Send greeting'}</Button></div>{notice ? <p className="composer-notice" role="status">{notice}</p> : null}</form>;
}

export interface PendingMessage { readonly content: string; readonly idempotencyKey: string; readonly status: 'sending' | 'failed'; }
interface MessageComposerProps {
  readonly conversationId: string;
  readonly disabled: boolean;
  readonly reason?: string;
  readonly onSend: (conversationId: string, content: string, idempotencyKey: string) => Promise<MessageDto>;
  readonly onOptimistic?: (pending: PendingMessage | null, message?: MessageDto) => void;
  readonly onTyping?: (active: boolean) => void;
  readonly submitLabel?: string;
}

export function MessageComposer({ conversationId, disabled, reason, onSend, onOptimistic, onTyping, submitLabel = 'Send' }: MessageComposerProps) {
  const [content, setContent] = useState('');
  const [pending, setPending] = useState<PendingMessage | null>(null);
  const deliver = async (item: PendingMessage): Promise<void> => {
    const sending = { ...item, status: 'sending' as const }; setPending(sending); onOptimistic?.(sending);
    try { const message = await onSend(conversationId, item.content, item.idempotencyKey); setPending(null); setContent(''); onTyping?.(false); onOptimistic?.(null, message); }
    catch { const failed = { ...item, status: 'failed' as const }; setPending(failed); onOptimistic?.(failed); }
  };
  const submit = (): void => { const value = content.trim(); if (!value || disabled || pending?.status === 'sending') return; void deliver({ content: value, idempotencyKey: crypto.randomUUID(), status: 'sending' }); };
  return <form className="message-composer" onSubmit={(event) => { event.preventDefault(); submit(); }}><label htmlFor="conversation-message">Message</label><textarea id="conversation-message" value={content} onChange={(event) => { setContent(event.target.value); onTyping?.(Boolean(event.target.value.trim())); }} disabled={disabled || pending?.status === 'sending'} maxLength={2000} placeholder={disabled ? 'Messaging is unavailable' : 'Write a message'} /><div className="composer-actions"><small>{reason ?? `${content.length}/2000`}</small><Button type="submit" disabled={disabled || !content.trim() || pending?.status === 'sending'}>{pending?.status === 'sending' ? 'Sending...' : submitLabel}</Button></div>{pending?.status === 'failed' ? <div className="composer-failure" role="alert"><span>Message did not send.</span><Button type="button" variant="secondary" onClick={() => void deliver(pending)}>Retry message</Button></div> : null}</form>;
}

export function MessageTimeline({ currentUserId, messages, pending, typingLabel, onRetry }: { readonly currentUserId: string; readonly messages: readonly MessageDto[]; readonly pending: readonly PendingMessage[]; readonly typingLabel?: string; readonly onRetry: (idempotencyKey: string) => void }) {
  const ordered = [...messages].sort((left, right) => left.sentAt.localeCompare(right.sentAt));
  if (!ordered.length && !pending.length) return <div className="message-timeline message-timeline--empty"><p>No messages in this conversation.</p></div>;
  return <ol className="message-timeline" aria-live="polite">{ordered.map((message) => <li className={message.senderId === currentUserId ? 'message-bubble message-bubble--mine' : 'message-bubble'} key={message.eventId}><p>{message.content}</p><time dateTime={message.sentAt}>{new Date(message.sentAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</time></li>)}{pending.map((item) => <li className="message-bubble message-bubble--mine message-bubble--pending" key={item.idempotencyKey}><p>{item.content}</p><small>{item.status === 'failed' ? 'Not sent' : 'Sending'}</small>{item.status === 'failed' ? <button type="button" onClick={() => onRetry(item.idempotencyKey)}>Retry</button> : null}</li>)}{typingLabel ? <li className="typing-status" role="status">{typingLabel}</li> : null}</ol>;
}

export function MessageSettings({ userId, blocked, busy = false, onBlock, onUnblock }: { readonly userId: string; readonly blocked: boolean; readonly busy?: boolean; readonly onBlock: (userId: string) => void; readonly onUnblock: (userId: string) => void }) {
  return <section className="message-settings" aria-labelledby="message-safety-heading"><div><h2 id="message-safety-heading">Safety</h2><p>{blocked ? 'This person is blocked.' : 'Blocking hides both people from each other across Bliver.'}</p></div>{blocked ? <Button variant="secondary" disabled={busy} onClick={() => onUnblock(userId)}>Unblock</Button> : <Button variant="danger" disabled={busy} onClick={() => onBlock(userId)}>Block</Button>}</section>;
}
