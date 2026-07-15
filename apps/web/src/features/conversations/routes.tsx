import type { MessageDto } from '@bliver/contracts';
import { Button } from '@bliver/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';

import { blockUser, unblockUser } from '../social/index.js';
import {
  ConversationApiError,
  fetchConversations,
  fetchCurrentUser,
  fetchMessages,
  fetchTyping,
  replyToGreeting,
  sendGreeting,
  sendMessage,
  type ConversationListItem,
  type ConversationPage,
} from './api.js';
import { ConversationList, GreetingComposer, MessageComposer, MessageSettings, MessageTimeline, type PendingMessage } from './components.js';
import { connectConversationRealtime, type ConversationRealtime } from './realtime.js';
import './conversations.css';

const currentUserKey = ['identity', 'me'] as const;
const conversationListKey = ['conversations'] as const;
const messageKey = (id: string) => ['conversations', id, 'messages'] as const;
const typingKey = (id: string) => ['conversations', id, 'typing'] as const;

function expired(error: unknown): boolean { return error instanceof ConversationApiError && error.status === 401; }
function peer(item: ConversationListItem, currentUserId: string): string { return item.participantLowId === currentUserId ? item.participantHighId : item.participantLowId; }
function person(value: string): string { return `Person ${value.slice(0, 8)}`; }

function LoadingMessages({ label = 'Loading messages' }: { readonly label?: string }) {
  return <section className="messages-route" aria-busy="true"><header className="messages-header"><div><h1>Messages</h1><p>Private conversations and one-time greetings</p></div></header><div className="messages-skeleton" role="status">{label}</div><div className="messages-skeleton messages-skeleton--short" aria-hidden="true" /></section>;
}

export function MessagesRoute() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [target, setTarget] = useState('');
  const [sessionExpired, setSessionExpired] = useState(false);
  const user = useQuery({ queryKey: currentUserKey, queryFn: fetchCurrentUser, retry: false });
  const conversations = useQuery({ queryKey: conversationListKey, queryFn: fetchConversations, retry: 1 });
  const { refetch: refetchUser } = user;
  const { refetch: refetchConversations } = conversations;
  const refetchSession = useCallback((): void => { void Promise.all([refetchUser(), refetchConversations()]); }, [refetchConversations, refetchUser]);

  useEffect(() => {
    const realtime = connectConversationRealtime({
      onMessage: () => { void client.invalidateQueries({ queryKey: conversationListKey }); },
      onTyping: () => undefined,
      onRead: () => { void client.invalidateQueries({ queryKey: conversationListKey }); },
      onReconnect: refetchSession,
      onSessionExpired: () => setSessionExpired(true),
    });
    return () => realtime.disconnect();
  }, [client, refetchSession]);

  if (sessionExpired || expired(user.error) || expired(conversations.error)) return <Navigate to="/session-expired" replace state={{ from: '/messages' }} />;
  if (user.isLoading || conversations.isLoading) return <LoadingMessages />;
  if (user.isError || conversations.isError || !user.data) return <section className="messages-route messages-route--state"><h1>Messages are unavailable</h1><p>Your conversations could not be loaded.</p><Button onClick={() => void Promise.all([user.refetch(), conversations.refetch()])}>Try again</Button></section>;

  return (
    <section className="messages-route">
      <header className="messages-header"><div><h1>Messages</h1><p>Private conversations and one-time greetings</p></div><Link className="messages-text-link" to="/people">People</Link></header>
      <section className="greeting-start" aria-labelledby="greeting-start-heading"><div><h2 id="greeting-start-heading">Start with a greeting</h2><p>Strangers can receive one message. Their reply unlocks the conversation.</p></div><label htmlFor="greeting-person">Person ID</label><input id="greeting-person" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="Person ID" autoComplete="off" />{target.trim() ? <GreetingComposer userId={target.trim()} onSend={sendGreeting} onSent={(result) => { const id = (result as { conversation?: { id?: unknown } }).conversation?.id; void client.invalidateQueries({ queryKey: conversationListKey }); if (typeof id === 'string') navigate(`/messages/${id}`); }} /> : null}</section>
      <section className="conversation-list-section" aria-labelledby="conversation-list-heading"><div className="section-heading"><h2 id="conversation-list-heading">Conversations</h2><span>{conversations.data?.length ?? 0}</span></div><ConversationList items={conversations.data ?? []} currentUserId={user.data.id} /></section>
    </section>
  );
}

export function ConversationRoute() {
  const { conversationId = '' } = useParams();
  const location = useLocation();
  const client = useQueryClient();
  const realtimeRef = useRef<ConversationRealtime | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [liveTyping, setLiveTyping] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [notice, setNotice] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [safetyBusy, setSafetyBusy] = useState(false);
  const user = useQuery({ queryKey: currentUserKey, queryFn: fetchCurrentUser, retry: false });
  const conversations = useQuery({ queryKey: conversationListKey, queryFn: fetchConversations, retry: 1 });
  const messages = useQuery({ queryKey: messageKey(conversationId), queryFn: () => fetchMessages(conversationId), enabled: Boolean(conversationId), retry: 1 });
  const typing = useQuery({ queryKey: typingKey(conversationId), queryFn: () => fetchTyping(conversationId), enabled: Boolean(conversationId), retry: false, refetchInterval: 5_000 });
  const { refetch: refetchConversationList } = conversations;
  const { refetch: refetchMessages } = messages;
  const { refetch: refetchTyping } = typing;
  const refetchConversation = useCallback((): void => { void Promise.all([refetchConversationList(), refetchMessages(), refetchTyping()]); }, [refetchConversationList, refetchMessages, refetchTyping]);
  const conversation = conversations.data?.find((item) => item.id === conversationId);
  const peerId = conversation && user.data ? peer(conversation, user.data.id) : '';

  useEffect(() => {
    const realtime = connectConversationRealtime({
      onMessage: (message) => {
        void client.invalidateQueries({ queryKey: conversationListKey });
        if (message.conversationId !== conversationId) return;
        client.setQueryData<ConversationPage>(messageKey(conversationId), (prior) => ({ items: prior?.items.some((item) => item.eventId === message.eventId) ? prior.items : [message, ...(prior?.items ?? [])], ...(prior?.nextCursor ? { nextCursor: prior.nextCursor } : {}) }));
      },
      onTyping: (event) => { if (event.conversationId === conversationId) setLiveTyping(event.active ? event.userId : null); },
      onRead: () => { void client.invalidateQueries({ queryKey: conversationListKey }); },
      onReconnect: refetchConversation,
      onSessionExpired: () => setSessionExpired(true),
    });
    realtimeRef.current = realtime;
    return () => { realtimeRef.current = null; realtime.disconnect(); };
  }, [client, conversationId, refetchConversation]);

  const typingUser = useMemo(() => liveTyping ?? typing.data?.find((item) => item.active && item.userId !== user.data?.id)?.userId ?? null, [liveTyping, typing.data, user.data?.id]);

  useEffect(() => {
    if (!user.data || !messages.data?.items.length) return;
    const latest = messages.data.items.find((item) => item.senderId !== user.data.id);
    if (latest) realtimeRef.current?.markRead(conversationId, latest.id);
  }, [conversationId, messages.data?.items, user.data]);

  if (sessionExpired || expired(user.error) || expired(conversations.error) || expired(messages.error) || expired(typing.error)) return <Navigate to="/session-expired" replace state={{ from: `${location.pathname}${location.search}` }} />;
  if (user.isLoading || conversations.isLoading || messages.isLoading) return <LoadingMessages label="Loading conversation" />;
  if (user.isError || conversations.isError || messages.isError || !user.data) return <section className="messages-route messages-route--state"><h1>Conversation is unavailable</h1><p>It may have been removed, blocked, or temporarily unavailable.</p><Button onClick={() => void Promise.all([user.refetch(), conversations.refetch(), messages.refetch()])}>Try again</Button><Link className="messages-text-link" to="/messages">Back to messages</Link></section>;
  if (!conversation) return <section className="messages-route messages-route--state"><h1>Conversation not found</h1><p>This conversation is no longer available.</p><Link className="messages-text-link" to="/messages">Back to messages</Link></section>;

  const other = peer(conversation, user.data.id);
  const requestedByMe = conversation.state === 'requested' && conversation.initiatorId === user.data.id;
  const incomingGreeting = conversation.state === 'requested' && !requestedByMe;
  const unavailable = blocked || conversation.state === 'blocked' || conversation.state === 'ignored' || requestedByMe;
  const send = async (_id: string, content: string, idempotencyKey: string): Promise<MessageDto> => {
    if (incomingGreeting) {
      const result = await replyToGreeting(conversation.id, content, idempotencyKey);
      client.setQueryData<ConversationListItem[]>(conversationListKey, (prior) => prior?.map((item) => item.id === conversation.id ? { ...item, ...result.conversation, unreadCount: 0, lastMessage: result.message } : item));
      setNotice('Conversation unlocked.');
      return result.message;
    }
    return realtimeRef.current ? realtimeRef.current.sendMessage(conversation.id, content, idempotencyKey) : sendMessage(conversation.id, content, idempotencyKey);
  };
  const optimistic = (item: PendingMessage | null, delivered?: MessageDto): void => {
    if (item) setPending((prior) => [...prior.filter((current) => current.idempotencyKey !== item.idempotencyKey), item]);
    else setPending([]);
    if (delivered) client.setQueryData<ConversationPage>(messageKey(conversation.id), (prior) => ({ items: prior?.items.some((message) => message.eventId === delivered.eventId) ? prior.items : [delivered, ...(prior?.items ?? [])], ...(prior?.nextCursor ? { nextCursor: prior.nextCursor } : {}) }));
  };
  const retryPending = (idempotencyKey: string): void => {
    const item = pending.find((candidate) => candidate.idempotencyKey === idempotencyKey); if (!item) return;
    const sending = { ...item, status: 'sending' as const }; setPending([sending]);
    void send(conversation.id, item.content, item.idempotencyKey).then((message) => optimistic(null, message)).catch(() => setPending([{ ...item, status: 'failed' }]));
  };
  const changeBlock = async (next: boolean): Promise<void> => {
    setSafetyBusy(true); setNotice('');
    try { if (next) await blockUser(other); else await unblockUser(other); setBlocked(next); setNotice(next ? 'Person blocked.' : 'Person unblocked.'); void client.invalidateQueries({ queryKey: conversationListKey }); }
    catch { setNotice('Safety setting did not save. Try again.'); }
    finally { setSafetyBusy(false); }
  };

  return (
    <section className="conversation-route">
      <header className="conversation-header"><Link className="conversation-back" to="/messages" aria-label="Back to messages">Back</Link><div><h1 title={peerId}>{person(peerId)}</h1><p>{incomingGreeting ? 'Greeting request' : requestedByMe ? 'Waiting for a reply' : unavailable ? 'Messaging unavailable' : 'Private conversation'}</p></div></header>
      <MessageTimeline currentUserId={user.data.id} messages={messages.data?.items ?? []} pending={pending} {...(typingUser ? { typingLabel: `${person(typingUser)} is typing` } : {})} onRetry={retryPending} />
      {notice ? <p className="conversation-notice" role="status">{notice}</p> : null}
      <div className="conversation-composer-dock"><MessageComposer conversationId={conversation.id} disabled={unavailable} {...(requestedByMe || blocked ? { reason: requestedByMe ? 'You can send another message after they reply.' : 'Unblock this person before messaging.' } : {})} submitLabel={incomingGreeting ? 'Reply and unlock' : 'Send'} onSend={send} onOptimistic={optimistic} onTyping={(active) => realtimeRef.current?.setTyping(conversation.id, active)} /></div>
      <MessageSettings userId={other} blocked={blocked || conversation.state === 'blocked'} busy={safetyBusy} onBlock={() => void changeBlock(true)} onUnblock={() => void changeBlock(false)} />
    </section>
  );
}
