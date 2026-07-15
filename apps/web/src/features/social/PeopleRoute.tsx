import { Button } from '@bliver/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import {
  acceptFriendship,
  blockUser,
  fetchBlocks,
  fetchFriendRequests,
  fetchFriendships,
  rejectFriendship,
  removeFriendship,
  requestFriendship,
  unblockUser,
} from './api.js';
import './social.css';

type Requests = Awaited<ReturnType<typeof fetchFriendRequests>>;
type Friendships = Awaited<ReturnType<typeof fetchFriendships>>;
type Blocks = Awaited<ReturnType<typeof fetchBlocks>>;

function PersonId({ value }: { readonly value: string }) {
  return <span className="person-id" title={value}>Person {value.slice(0, 8)}</span>;
}

export interface FriendRequestListProps {
  readonly incoming: Requests['incoming'];
  readonly outgoing: Requests['outgoing'];
  readonly busyId: string | null;
  readonly onAccept: (id: string) => void;
  readonly onReject: (id: string) => void;
}

export function FriendRequestList({ incoming, outgoing, busyId, onAccept, onReject }: FriendRequestListProps) {
  return (
    <div className="social-sections">
      <section className="social-list" aria-labelledby="incoming-heading">
        <div className="social-list__heading"><h2 id="incoming-heading">Incoming requests</h2><span>{incoming.length}</span></div>
        {incoming.length ? incoming.map((item) => (
          <div className="social-list__row" key={item.id}>
            <div><strong><PersonId value={item.userId} /></strong><small>Wants to connect</small></div>
            <div className="social-list__actions">
              <Button onClick={() => onAccept(item.id)} disabled={busyId === item.id}>Accept</Button>
              <Button variant="secondary" onClick={() => onReject(item.id)} disabled={busyId === item.id}>Decline</Button>
            </div>
          </div>
        )) : <p className="social-list__empty">No requests waiting.</p>}
      </section>
      <section className="social-list" aria-labelledby="outgoing-heading">
        <div className="social-list__heading"><h2 id="outgoing-heading">Sent requests</h2><span>{outgoing.length}</span></div>
        {outgoing.length ? outgoing.map((item) => (
          <div className="social-list__row" key={item.id}><div><strong><PersonId value={item.userId} /></strong><small>Waiting for a response</small></div></div>
        )) : <p className="social-list__empty">You have no pending requests.</p>}
      </section>
    </div>
  );
}

export interface RelationshipListProps {
  readonly friendships: Friendships;
  readonly blocks: Blocks;
  readonly busyId: string | null;
  readonly onRemove: (id: string) => void;
  readonly onBlock?: (id: string) => void;
  readonly onUnblock: (id: string) => void;
}

export function RelationshipList({ friendships, blocks, busyId, onRemove, onBlock, onUnblock }: RelationshipListProps) {
  return (
    <div className="social-sections">
      <section className="social-list" aria-labelledby="friends-heading">
        <div className="social-list__heading"><h2 id="friends-heading">Friends</h2><span>{friendships.length}</span></div>
        {friendships.length ? friendships.map((item) => (
          <div className="social-list__row" key={item.friendshipId}>
            <div><strong><PersonId value={item.userId} /></strong><small>Messages are unlocked</small></div>
            <div className="social-list__actions">
              <Link className="social-action-link" to="/messages">Message</Link>
              <Button variant="secondary" disabled={busyId === item.userId} onClick={() => onRemove(item.userId)}>Remove friend</Button>
              {onBlock ? <Button variant="danger" disabled={busyId === item.userId} onClick={() => onBlock(item.userId)}>Block</Button> : null}
            </div>
          </div>
        )) : <p className="social-list__empty">Friends will appear here after a request is accepted.</p>}
      </section>
      <section className="social-list" aria-labelledby="blocked-heading">
        <div className="social-list__heading"><div><h2 id="blocked-heading">Blocked</h2><p>Blocked people cannot find or message you.</p></div><span>{blocks.length}</span></div>
        {blocks.length ? blocks.map((item) => (
          <div className="social-list__row" key={item.userId}>
            <div><strong><PersonId value={item.userId} /></strong><small>Hidden across Bliver</small></div>
            <Button variant="secondary" disabled={busyId === item.userId} onClick={() => onUnblock(item.userId)}>Unblock</Button>
          </div>
        )) : <p className="social-list__empty">No blocked people.</p>}
      </section>
    </div>
  );
}

export function PeopleRoute() {
  const client = useQueryClient();
  const requests = useQuery({ queryKey: ['social', 'requests'], queryFn: fetchFriendRequests, retry: 1 });
  const friendships = useQuery({ queryKey: ['social', 'friendships'], queryFn: fetchFriendships, retry: 1 });
  const blocks = useQuery({ queryKey: ['social', 'blocks'], queryFn: fetchBlocks, retry: 1 });
  const [target, setTarget] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const refresh = async (): Promise<void> => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['social', 'requests'] }),
      client.invalidateQueries({ queryKey: ['social', 'friendships'] }),
      client.invalidateQueries({ queryKey: ['social', 'blocks'] }),
      client.invalidateQueries({ queryKey: ['conversations'] }),
    ]);
  };
  const mutate = async (id: string, action: () => Promise<unknown>, success: string): Promise<void> => {
    setBusyId(id);
    setNotice(null);
    try { await action(); setNotice({ type: 'success', text: success }); await refresh(); }
    catch (error) { setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Relationship action failed' }); }
    finally { setBusyId(null); }
  };
  const submitRequest = async (): Promise<void> => {
    const id = target.trim();
    if (!id) return;
    await mutate(id, () => requestFriendship(id), 'Friend request sent.');
    setTarget('');
  };
  const submitBlock = async (): Promise<void> => {
    const id = target.trim();
    if (!id) return;
    await mutate(id, () => blockUser(id), 'Person blocked.');
    setTarget('');
  };

  const loading = requests.isLoading || friendships.isLoading || blocks.isLoading;
  const failed = requests.isError || friendships.isError || blocks.isError;
  if (loading) return <section className="social-route" aria-busy="true"><header className="social-route__header"><div><h1>People</h1><p>Friend requests and safety controls</p></div></header><div className="social-skeleton" role="status">Loading relationships</div></section>;
  if (failed) return <section className="social-route social-route--state"><h1>People is unavailable</h1><p>Requests and safety settings could not be loaded.</p><Button onClick={() => void Promise.all([requests.refetch(), friendships.refetch(), blocks.refetch()])}>Try again</Button></section>;

  return (
    <section className="social-route">
      <header className="social-route__header"><div><h1>People</h1><p>Friend requests and safety controls</p></div><Link className="social-route__link" to="/messages">Messages</Link></header>
      <section className="social-request-form" aria-labelledby="request-heading">
        <h2 id="request-heading">Connect by person ID</h2>
        <div className="social-request-form__row"><label className="sr-only" htmlFor="person-id">Person ID</label><input id="person-id" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="Person ID" autoComplete="off" /><Button onClick={() => void submitRequest()} disabled={!target.trim() || busyId !== null}>Send request</Button><Button variant="secondary" onClick={() => void submitBlock()} disabled={!target.trim() || busyId !== null}>Block</Button></div>
        {notice ? <p className={`social-notice social-notice--${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.text}</p> : null}
      </section>
      <FriendRequestList incoming={requests.data?.incoming ?? []} outgoing={requests.data?.outgoing ?? []} busyId={busyId} onAccept={(id) => void mutate(id, () => acceptFriendship(id), 'Friend request accepted.')} onReject={(id) => void mutate(id, () => rejectFriendship(id), 'Friend request declined.')} />
      <RelationshipList friendships={friendships.data ?? []} blocks={blocks.data ?? []} busyId={busyId} onRemove={(id) => void mutate(id, () => removeFriendship(id), 'Friend removed.')} onBlock={(id) => void mutate(id, () => blockUser(id), 'Person blocked.')} onUnblock={(id) => void mutate(id, () => unblockUser(id), 'Person unblocked.')} />
    </section>
  );
}
