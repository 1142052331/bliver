import { Button } from '@bliver/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Check, Hash, Mail, MessageSquare, Send, ShieldBan, Undo2, UserCheck, UserRoundPlus, UserRoundX, UsersRound, X } from 'lucide-react';
import { type ReactNode, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router-dom';

import { gsap, useGSAP, withMotionPreferences } from '../../platform/motion/gsap.js';
import {
  fetchPublicProfiles,
  IdentityApiError,
  type PublicProfile,
} from '../identity/api.js';

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
  SocialApiError,
} from './api.js';
import './social.css';

type Requests = Awaited<ReturnType<typeof fetchFriendRequests>>;
type Friendships = Awaited<ReturnType<typeof fetchFriendships>>;
type Blocks = Awaited<ReturnType<typeof fetchBlocks>>;
type ProfilesById = ReadonlyMap<string, PublicProfile>;

function sessionExpired(error: unknown): boolean {
  return (
    (error instanceof SocialApiError || error instanceof IdentityApiError)
    && error.status === 401
  );
}

function personMonogram(profile: PublicProfile | undefined): string {
  const source = profile?.displayName.trim() || profile?.username.trim() || '?';
  const words = source.split(/\s+/u).filter(Boolean);
  if (words.length > 1) {
    return words
      .slice(0, 2)
      .map((word) => Array.from(word)[0])
      .join('')
      .toLocaleUpperCase();
  }
  return Array.from(source).slice(0, 2).join('').toLocaleUpperCase();
}

function PersonIdentity({
  userId,
  profiles,
}: {
  readonly userId: string;
  readonly profiles: ProfilesById;
}) {
  const { t } = useTranslation();
  const profile = profiles.get(userId);
  const handle = profile?.username.trim();
  const displayName = profile?.displayName.trim() || handle || t('social.privatePerson');

  return (
    <span className="person-id">
      <span className="person-id__avatar" aria-hidden="true">{personMonogram(profile)}</span>
      <span className="person-id__copy">
        <span className="person-id__label">{displayName}</span>
        {handle ? <span className="person-id__handle">@{handle}</span> : null}
      </span>
    </span>
  );
}

function SocialEmpty({
  children,
  action,
}: {
  readonly children: React.ReactNode;
  readonly action?: string;
}) {
  return (
    <div className="social-list__empty">
      <span className="social-list__empty-mark" aria-hidden="true"><UsersRound /></span>
      <p>{children}</p>
      {action ? <a className="social-empty__action" href="#person-id"><UserRoundPlus aria-hidden="true" />{action}</a> : null}
    </div>
  );
}

function SocialStatePanel({
  title,
  body,
  actions,
}: {
  readonly title: string;
  readonly body: string;
  readonly actions: ReactNode;
}) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const root = rootRef.current;
    if (!root) return;
    const signal = root.querySelector<HTMLElement>('.social-state-panel__signal');
    const content = root.querySelector<HTMLElement>('.social-state-panel__copy');
    if (!signal || !content) return;

    return withMotionPreferences(root, ({ reducedMotion }) => {
      if (reducedMotion) {
        gsap.set([signal, content], { clearProps: 'all' });
        return;
      }
      const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } });
      timeline
        .fromTo(signal, { autoAlpha: 0, scale: 0.9 }, {
          autoAlpha: 1,
          scale: 1,
          duration: 0.28,
          clearProps: 'transform,opacity,visibility',
        })
        .fromTo(content, { autoAlpha: 0, y: 8 }, {
          autoAlpha: 1,
          y: 0,
          duration: 0.36,
          clearProps: 'transform,opacity,visibility',
        }, 0.06);
      return () => timeline.kill();
    });
  }, { scope: rootRef });

  return (
    <div className="social-state-panel" ref={rootRef} role="alert">
      <span className="social-state-panel__signal" aria-hidden="true"><Ban /></span>
      <div className="social-state-panel__copy">
        <span className="social-state-panel__eyebrow">{t('social.title')}</span>
        <h2>{title}</h2>
        <p>{body}</p>
        <div className="social-state-panel__actions">{actions}</div>
      </div>
    </div>
  );
}

export interface FriendRequestListProps {
  readonly incoming: Requests['incoming'];
  readonly outgoing: Requests['outgoing'];
  readonly profiles: ProfilesById;
  readonly busyId: string | null;
  readonly onAccept: (id: string) => void;
  readonly onReject: (id: string) => void;
}

export function FriendRequestList({ incoming, outgoing, profiles, busyId, onAccept, onReject }: FriendRequestListProps) {
  const { t } = useTranslation();
  return (
    <div className="social-sections social-sections--requests">
      <section className="social-list" aria-labelledby="incoming-heading">
        <div className="social-list__heading"><span><UserRoundPlus aria-hidden="true" /><h2 id="incoming-heading">{t('social.incomingRequests')}</h2></span><strong>{incoming.length}</strong></div>
        <div className="social-list__body">
          {incoming.length ? incoming.map((item) => (
            <div className="social-list__row" key={item.id}>
              <div className="social-list__person"><strong><PersonIdentity userId={item.userId} profiles={profiles} /></strong><small>{t('social.wantsToConnect')}</small></div>
              <div className="social-list__actions">
                <Button onClick={() => onAccept(item.id)} disabled={busyId !== null} aria-busy={busyId === item.id}><Check aria-hidden="true" />{t('social.accept')}</Button>
                <Button variant="secondary" onClick={() => onReject(item.id)} disabled={busyId !== null} aria-busy={busyId === item.id}><X aria-hidden="true" />{t('social.decline')}</Button>
              </div>
            </div>
          )) : <SocialEmpty action={t('social.connectById')}>{t('social.noIncomingRequests')}</SocialEmpty>}
        </div>
      </section>
      <section className="social-list" aria-labelledby="outgoing-heading">
        <div className="social-list__heading"><span><Send aria-hidden="true" /><h2 id="outgoing-heading">{t('social.sentRequests')}</h2></span><strong>{outgoing.length}</strong></div>
        <div className="social-list__body">
          {outgoing.length ? outgoing.map((item) => (
            <div className="social-list__row" key={item.id}><div className="social-list__person"><strong><PersonIdentity userId={item.userId} profiles={profiles} /></strong><small>{t('social.waitingForResponse')}</small></div><span className="social-list__status">{t('social.pending')}</span></div>
          )) : <SocialEmpty action={t('social.connectById')}>{t('social.noOutgoingRequests')}</SocialEmpty>}
        </div>
      </section>
    </div>
  );
}

export interface RelationshipListProps {
  readonly friendships: Friendships;
  readonly blocks: Blocks;
  readonly profiles: ProfilesById;
  readonly busyId: string | null;
  readonly onRemove: (id: string) => void;
  readonly onBlock?: (id: string) => void;
  readonly onUnblock: (id: string) => void;
}

export function RelationshipList({ friendships, blocks, profiles, busyId, onRemove, onBlock, onUnblock }: RelationshipListProps) {
  const { t } = useTranslation();
  return (
    <div className="social-sections social-sections--relationships">
      <section className="social-list social-list--friends" aria-labelledby="friends-heading">
        <div className="social-list__heading"><span><UserCheck aria-hidden="true" /><h2 id="friends-heading">{t('social.friends')}</h2></span><strong>{friendships.length}</strong></div>
        <div className="social-list__body">
          {friendships.length ? friendships.map((item) => (
            <div className="social-list__row" key={item.friendshipId}>
              <div className="social-list__person"><strong><PersonIdentity userId={item.userId} profiles={profiles} /></strong><small>{t('social.messagesUnlocked')}</small></div>
              <div className="social-list__actions">
                <Link className="social-action-link" to="/messages"><MessageSquare aria-hidden="true" />{t('social.message')}</Link>
                <Button variant="secondary" disabled={busyId !== null} aria-busy={busyId === item.userId} onClick={() => onRemove(item.userId)}><UserRoundX aria-hidden="true" />{t('social.removeFriend')}</Button>
                {onBlock ? <Button variant="danger" disabled={busyId !== null} aria-busy={busyId === item.userId} onClick={() => onBlock(item.userId)}><Ban aria-hidden="true" />{t('social.block')}</Button> : null}
              </div>
            </div>
          )) : <SocialEmpty action={t('social.connectById')}>{t('social.noFriends')}</SocialEmpty>}
        </div>
      </section>
      <section className="social-list social-list--blocked" aria-labelledby="blocked-heading">
        <div className="social-list__heading"><span><ShieldBan aria-hidden="true" /><span><h2 id="blocked-heading">{t('social.blocked')}</h2><p>{t('social.blockedExplanation')}</p></span></span><strong>{blocks.length}</strong></div>
        <div className="social-list__body">
          {blocks.length ? blocks.map((item) => (
            <div className="social-list__row" key={item.userId}>
              <div className="social-list__person"><strong><PersonIdentity userId={item.userId} profiles={profiles} /></strong><small>{t('social.hiddenAcrossBliver')}</small></div>
              <Button variant="secondary" disabled={busyId !== null} aria-busy={busyId === item.userId} onClick={() => onUnblock(item.userId)}><Undo2 aria-hidden="true" />{t('social.unblock')}</Button>
            </div>
          )) : <SocialEmpty action={t('social.connectById')}>{t('social.noBlockedPeople')}</SocialEmpty>}
        </div>
      </section>
    </div>
  );
}

export function PeopleRoute() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const requests = useQuery({ queryKey: ['social', 'requests'], queryFn: fetchFriendRequests, retry: 1 });
  const friendships = useQuery({ queryKey: ['social', 'friendships'], queryFn: fetchFriendships, retry: 1 });
  const blocks = useQuery({ queryKey: ['social', 'blocks'], queryFn: fetchBlocks, retry: 1 });
  const profileIds = useMemo(() => [...new Set([
    ...(requests.data?.incoming ?? []).map((item) => item.userId),
    ...(requests.data?.outgoing ?? []).map((item) => item.userId),
    ...(friendships.data ?? []).map((item) => item.userId),
    ...(blocks.data ?? []).map((item) => item.userId),
  ])].sort(), [blocks.data, friendships.data, requests.data]);
  const profiles = useQuery({
    queryKey: ['identity', 'profiles', profileIds.join('|')],
    queryFn: () => fetchPublicProfiles(profileIds),
    enabled: profileIds.length > 0,
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });
  const profilesById = useMemo<ProfilesById>(
    () => new Map((profiles.data ?? []).map((profile) => [profile.id, profile])),
    [profiles.data],
  );
  const [target, setTarget] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sessionExpiredState, setSessionExpiredState] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const refresh = async (): Promise<void> => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['social', 'requests'] }),
      client.invalidateQueries({ queryKey: ['social', 'friendships'] }),
      client.invalidateQueries({ queryKey: ['social', 'blocks'] }),
      client.invalidateQueries({ queryKey: ['identity', 'profiles'] }),
      client.invalidateQueries({ queryKey: ['conversations'] }),
    ]);
  };

  const mutate = async (id: string, action: () => Promise<unknown>, success: string): Promise<boolean> => {
    setBusyId(id);
    setNotice(null);
    try {
      await action();
      setNotice({ type: 'success', text: success });
      await refresh();
      return true;
    } catch (error) {
      if (sessionExpired(error)) {
        setSessionExpiredState(true);
        return false;
      }
      setNotice({ type: 'error', text: t('social.actionFailed') });
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const submitRequest = async (): Promise<void> => {
    const id = target.trim();
    if (!id) return;
    if (await mutate(id, () => requestFriendship(id), t('social.requestSent'))) setTarget('');
  };

  const submitBlock = async (): Promise<void> => {
    const id = target.trim();
    if (!id) return;
    if (await mutate(id, () => blockUser(id), t('social.personBlocked'))) setTarget('');
  };

  const loading = requests.isLoading
    || friendships.isLoading
    || blocks.isLoading
    || (profileIds.length > 0 && profiles.isLoading);
  const failed = requests.isError || friendships.isError || blocks.isError || profiles.isError;

  if (
    sessionExpiredState
    || sessionExpired(requests.error)
    || sessionExpired(friendships.error)
    || sessionExpired(blocks.error)
    || sessionExpired(profiles.error)
  ) {
    return <Navigate to="/session-expired" replace state={{ from: '/people' }} />;
  }

  if (loading) {
    return (
      <section className="social-route" aria-busy="true">
        <header className="social-route__header"><div className="social-route__title"><UsersRound aria-hidden="true" /><div><h1>{t('social.title')}</h1><p>{t('social.subtitle')}</p></div></div></header>
        <div className="social-skeleton" role="status">
          <span>{t('social.loading')}</span>
          <i /><i /><i />
        </div>
      </section>
    );
  }

  if (failed) {
    return (
      <section className="social-route social-route--state">
        <header className="social-route__header">
          <div className="social-route__title">
            <UsersRound aria-hidden="true" />
            <div><h1>{t('social.title')}</h1><p>{t('social.subtitle')}</p></div>
          </div>
          <Link className="social-route__link" to="/messages"><Mail aria-hidden="true" />{t('social.messages')}</Link>
        </header>
        <SocialStatePanel
          title={t('social.unavailableTitle')}
          body={t('social.unavailableBody')}
          actions={(
            <>
              <Button onClick={() => void Promise.all([requests.refetch(), friendships.refetch(), blocks.refetch(), profiles.refetch()])}><Undo2 aria-hidden="true" />{t('social.retry')}</Button>
              <Link className="social-action-link" to="/messages"><Mail aria-hidden="true" />{t('social.messages')}</Link>
            </>
          )}
        />
      </section>
    );
  }

  return (
    <section className="social-route" aria-busy={busyId !== null}>
      <header className="social-route__header">
        <div className="social-route__title"><UsersRound aria-hidden="true" /><div><h1>{t('social.title')}</h1><p>{t('social.subtitle')}</p></div></div>
        <Link className="social-route__link" to="/messages"><Mail aria-hidden="true" />{t('social.messages')}</Link>
      </header>
      <section className="social-request-form" aria-labelledby="request-heading">
        <div className="social-request-form__heading"><span><UserRoundPlus aria-hidden="true" /><h2 id="request-heading">{t('social.connectById')}</h2></span><p>{t('social.connectBody')}</p></div>
        <div className="social-request-form__row">
          <label className="sr-only" htmlFor="person-id">{t('social.personId')}</label>
          <span className="social-request-form__input"><Hash aria-hidden="true" /><input id="person-id" value={target} onChange={(event) => setTarget(event.target.value)} placeholder={t('social.personId')} autoComplete="off" /></span>
          <Button onClick={() => void submitRequest()} disabled={!target.trim() || busyId !== null}><Send aria-hidden="true" />{t('social.sendRequest')}</Button>
          <Button variant="secondary" onClick={() => void submitBlock()} disabled={!target.trim() || busyId !== null}><ShieldBan aria-hidden="true" />{t('social.block')}</Button>
        </div>
        {notice ? <p className={`social-notice social-notice--${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.type === 'success' ? <Check aria-hidden="true" /> : <Ban aria-hidden="true" />}{notice.text}</p> : null}
      </section>
      <FriendRequestList incoming={requests.data?.incoming ?? []} outgoing={requests.data?.outgoing ?? []} profiles={profilesById} busyId={busyId} onAccept={(id) => void mutate(id, () => acceptFriendship(id), t('social.requestAccepted'))} onReject={(id) => void mutate(id, () => rejectFriendship(id), t('social.requestDeclined'))} />
      <RelationshipList friendships={friendships.data ?? []} blocks={blocks.data ?? []} profiles={profilesById} busyId={busyId} onRemove={(id) => void mutate(id, () => removeFriendship(id), t('social.friendRemoved'))} onBlock={(id) => void mutate(id, () => blockUser(id), t('social.personBlocked'))} onUnblock={(id) => void mutate(id, () => unblockUser(id), t('social.personUnblocked'))} />
    </section>
  );
}
