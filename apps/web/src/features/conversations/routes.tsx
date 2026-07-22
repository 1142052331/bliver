import type { MessageDto } from "@bliver/contracts";
import { Button } from "@bliver/ui";
import {
  ArrowLeft,
  ArrowUpRight,
  AtSign,
  ChevronRight,
  CircleAlert,
  LockKeyhole,
  MessageCircle,
  Radio,
  Search,
  ShieldCheck,
  UserRoundPlus,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

import {
  blockUser,
  fetchFriendships,
  SocialApiError,
  unblockUser,
} from "../social/index.js";
import {
  fetchCurrentUser,
  fetchPublicProfiles,
  IdentityApiError,
  type PublicProfile,
} from "../identity/api.js";
import {
  gsap,
  motionTokens,
  useGSAP,
  withMotionPreferences,
} from "../../platform/motion/gsap.js";
import {
  ConversationApiError,
  fetchConversations,
  fetchMessages,
  fetchTyping,
  replyToGreeting,
  sendGreeting,
  sendMessage,
  type ConversationListItem,
  type ConversationPage,
} from "./api.js";
import {
  ConversationList,
  GreetingComposer,
  MessageComposer,
  MessageSettings,
  MessageTimeline,
  type PendingMessage,
} from "./components.js";
import {
  connectConversationRealtime,
  type ConversationRealtime,
} from "./realtime.js";
import {
  conversationDefault,
  type ConversationTranslationKey,
} from "./translations.js";
import "./conversations.css";

const currentUserKey = ["identity", "me"] as const;
const conversationListKey = ["conversations"] as const;
const messageKey = (id: string) => ["conversations", id, "messages"] as const;
const typingKey = (id: string) => ["conversations", id, "typing"] as const;

function expired(error: unknown): boolean {
  return (
    (error instanceof ConversationApiError
      || error instanceof IdentityApiError
      || error instanceof SocialApiError)
    && error.status === 401
  );
}

function peer(item: ConversationListItem, currentUserId: string): string {
  return item.participantLowId === currentUserId
    ? item.participantHighId
    : item.participantLowId;
}

type MessageCopy = (
  key: ConversationTranslationKey,
  values?: Record<string, string | number>,
) => string;

function useConversationCopy(): {
  readonly copy: MessageCopy;
  readonly locale: string;
} {
  const { i18n, t } = useTranslation();
  return {
    locale: i18n.resolvedLanguage ?? i18n.language,
    copy: (key, values = {}) =>
      String(
        t(`messages.${key}`, {
          defaultValue: conversationDefault(key, values),
          ...values,
        }),
      ),
  };
}

function profileMap(profiles: readonly PublicProfile[] | undefined): ReadonlyMap<string, PublicProfile> {
  return new Map((profiles ?? []).map((profile) => [profile.id, profile]));
}

function person(
  value: string,
  profiles: ReadonlyMap<string, PublicProfile>,
  copy: MessageCopy,
): string {
  return profiles.get(value)?.displayName.trim() || copy("privatePerson");
}

function personMonogram(value: string): string {
  const segments = value.trim().split(/\s+/u).filter(Boolean);
  if (!segments.length) return "--";
  return (segments.length > 1
    ? `${segments[0]?.[0] ?? ""}${segments.at(-1)?.[0] ?? ""}`
    : segments[0]?.slice(0, 2) ?? "--"
  ).toLocaleUpperCase();
}

function isUserId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value.trim());
}

function LoadingMessages({ label }: { readonly label?: string }) {
  const { copy } = useConversationCopy();
  return (
    <section
      className="messages-route messages-route--loading"
      aria-busy="true"
    >
      <header className="messages-header">
        <div>
          <h1>{copy("title")}</h1>
          <p>{copy("subtitle")}</p>
        </div>
      </header>
      <div className="messages-skeleton" role="status">
        <span className="messages-skeleton__label">
          {label ?? copy("loading")}
        </span>
        {[0, 1, 2].map((item) => (
          <span
            className="messages-skeleton__row"
            key={item}
            aria-hidden="true"
          >
            <i />
            <b />
            <small />
          </span>
        ))}
      </div>
    </section>
  );
}

function MessagesStatePanel({
  icon,
  eyebrow,
  title,
  body,
  actions,
}: {
  readonly icon: ReactNode;
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly actions: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const root = rootRef.current;
    if (!root) return;
    const signal = root.querySelector<HTMLElement>(".messages-state-panel__signal");
    const content = root.querySelector<HTMLElement>(".messages-state-panel__copy");
    if (!signal || !content) return;

    return withMotionPreferences(root, ({ reducedMotion }) => {
      if (reducedMotion) {
        gsap.set([signal, content], { clearProps: "all" });
        return;
      }
      const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });
      timeline
        .fromTo(signal, { opacity: 0.72, scale: 0.9 }, {
          opacity: 1,
          scale: 1,
          duration: 0.28,
          clearProps: "transform,opacity",
        })
        .fromTo(content, { opacity: 0.72, y: 8 }, {
          opacity: 1,
          y: 0,
          duration: 0.36,
          clearProps: "transform,opacity",
        }, 0.06);
      return () => timeline.kill();
    });
  }, { scope: rootRef });

  return (
    <div className="messages-state-panel" ref={rootRef} role="alert">
      <span className="messages-state-panel__signal" aria-hidden="true">{icon}</span>
      <div className="messages-state-panel__copy">
        <span className="messages-state-panel__eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{body}</p>
        <div className="messages-state-panel__actions">{actions}</div>
      </div>
    </div>
  );
}

export function MessagesRoute() {
  const { copy, locale } = useConversationCopy();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [target, setTarget] = useState("");
  const [peopleQuery, setPeopleQuery] = useState("");
  const [query, setQuery] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const routeRef = useRef<HTMLElement>(null);
  const greetingStageRef = useRef<HTMLDivElement>(null);
  const greetingMotionReadyRef = useRef(false);
  const user = useQuery({
    queryKey: currentUserKey,
    queryFn: fetchCurrentUser,
    retry: false,
  });
  const conversations = useQuery({
    queryKey: conversationListKey,
    queryFn: fetchConversations,
    retry: 1,
  });
  const friendships = useQuery({
    queryKey: ["social", "friendships"],
    queryFn: fetchFriendships,
    retry: false,
  });
  const conversationPeerIds = useMemo(() => {
    if (!user.data) return [];
    return (conversations.data ?? []).map((item) => peer(item, user.data.id));
  }, [conversations.data, user.data]);
  const contactIds = useMemo(
    () => [...new Set([
      ...conversationPeerIds,
      ...(friendships.data ?? []).map((item) => item.userId),
    ])],
    [conversationPeerIds, friendships.data],
  );
  const profiles = useQuery({
    queryKey: ["identity", "profiles", contactIds.join("|")],
    queryFn: () => fetchPublicProfiles(contactIds),
    enabled: contactIds.length > 0,
    retry: false,
  });
  const { refetch: refetchUser } = user;
  const { refetch: refetchConversations } = conversations;
  const { refetch: refetchFriendships } = friendships;
  const { refetch: refetchProfiles } = profiles;
  const refetchSession = useCallback((): void => {
    void Promise.all([
      refetchUser(),
      refetchConversations(),
      refetchFriendships(),
      refetchProfiles(),
    ]);
  }, [refetchConversations, refetchFriendships, refetchProfiles, refetchUser]);
  const greetingActive = Boolean(target.trim());

  useGSAP(() => {
    const root = routeRef.current;
    const stage = greetingStageRef.current;
    if (!root || !stage) return;

    if (!greetingMotionReadyRef.current) {
      greetingMotionReadyRef.current = true;
      return;
    }

    return withMotionPreferences(root, ({ reducedMotion }) => {
      gsap.killTweensOf(stage);
      if (reducedMotion) {
        gsap.set(stage, { clearProps: "all" });
        return;
      }

      gsap.set(stage, { willChange: "transform,opacity" });
      const tween = gsap.fromTo(
        stage,
        { opacity: 0.72, y: 8 },
        {
          opacity: 1,
          y: 0,
          duration: motionTokens.duration.state,
          ease: motionTokens.ease.quiet,
          clearProps: "transform,opacity,willChange",
        },
      );
      return () => tween.kill();
    });
  }, {
    dependencies: [greetingActive, Boolean(user.data), conversations.isLoading],
    revertOnUpdate: true,
    scope: routeRef,
  });

  useEffect(() => {
    const realtime = connectConversationRealtime({
      onMessage: () => {
        void client.invalidateQueries({ queryKey: conversationListKey });
      },
      onTyping: () => undefined,
      onRead: () => {
        void client.invalidateQueries({ queryKey: conversationListKey });
      },
      onReconnect: refetchSession,
      onSessionExpired: () => setSessionExpired(true),
    });
    return () => realtime.disconnect();
  }, [client, refetchSession]);

  if (
    sessionExpired
    || expired(user.error)
    || expired(conversations.error)
    || expired(friendships.error)
    || expired(profiles.error)
  ) {
    return (
      <Navigate to="/session-expired" replace state={{ from: "/messages" }} />
    );
  }
  if (user.isLoading || conversations.isLoading) return <LoadingMessages />;
  if (user.isError || conversations.isError || !user.data) {
    return (
      <section className="messages-route messages-route--state">
        <header className="messages-header">
          <div><h1>{copy("title")}</h1><p>{copy("subtitle")}</p></div>
          <Link className="messages-text-link" to="/people">
            <span>{copy("people")}</span><ArrowUpRight aria-hidden="true" />
          </Link>
        </header>
        <MessagesStatePanel
          icon={<CircleAlert />}
          eyebrow={copy("conversationsTitle")}
          title={copy("unavailableTitle")}
          body={copy("unavailableBody")}
          actions={(
            <>
              <Button onClick={() => void Promise.all([user.refetch(), conversations.refetch()])}>{copy("retry")}</Button>
              <Link className="messages-text-link" to="/people"><UserRoundPlus aria-hidden="true" /><span>{copy("findPeople")}</span></Link>
            </>
          )}
        />
      </section>
    );
  }

  const profilesById = profileMap(profiles.data);
  const friendIds = new Set((friendships.data ?? []).map((item) => item.userId));
  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  const filtered = (conversations.data ?? []).filter((item) => {
    if (!normalizedQuery) return true;
    const other = peer(item, user.data.id);
    const profile = profilesById.get(other);
    return [
      person(other, profilesById, copy),
      profile?.username ?? "",
      item.lastMessage?.content ?? "",
    ].some(
      (value) => value.toLocaleLowerCase(locale).includes(normalizedQuery),
    );
  });
  const normalizedPeopleQuery = peopleQuery.trim().toLocaleLowerCase(locale);
  const visiblePeople = (profiles.data ?? [])
    .filter((profile) => profile.id !== user.data.id)
    .filter((profile) => !normalizedPeopleQuery || [
      profile.displayName,
      profile.username,
    ].some((value) => value.toLocaleLowerCase(locale).includes(normalizedPeopleQuery)))
    .sort((left, right) => {
      const friendshipOrder = Number(friendIds.has(right.id)) - Number(friendIds.has(left.id));
      return friendshipOrder || left.displayName.localeCompare(right.displayName, locale);
    })
    .slice(0, 6);
  const selectedProfile = profilesById.get(target);

  return (
    <section className="messages-route messages-route--ledger" ref={routeRef}>
      <header className="messages-header">
        <div>
          <h1>{copy("title")}</h1>
          <p>{copy("subtitle")}</p>
        </div>
        <Link className="messages-text-link messages-header__people" to="/people">
          <UserRoundPlus aria-hidden="true" />
          <span>{copy("people")}</span>
        </Link>
      </header>

      <div className={`messages-workspace${(conversations.data?.length ?? 0) === 0 ? " is-empty" : ""}`}>
        <section
          className="conversation-list-section"
          aria-labelledby="conversation-list-heading"
        >
          <div className="section-heading">
            <div>
              <h2 id="conversation-list-heading">
                {copy("conversationsTitle")}
              </h2>
              <p>{copy("latestActivity")}</p>
            </div>
            <span>{conversations.data?.length ?? 0}</span>
          </div>
          {(conversations.data?.length ?? 0) > 0 ? (
            <label className="conversation-search">
              <span>{copy("searchConversations")}</span>
              <span className="conversation-search__field">
                <Search aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={copy("searchPlaceholder")}
                />
              </span>
            </label>
          ) : null}
          {normalizedQuery && !filtered.length ? (
            <div className="messages-empty messages-empty--search">
              <Search aria-hidden="true" />
              <h2>{copy("noSearchResultsTitle")}</h2>
              <p>{copy("noSearchResultsBody")}</p>
              <Button variant="secondary" onClick={() => setQuery("")}>
                {copy("clearSearch")}
              </Button>
            </div>
          ) : (
            <ConversationList
              items={filtered}
              currentUserId={user.data.id}
              profiles={profiles.data ?? []}
            />
          )}
        </section>

        <section
          className="greeting-start"
          aria-labelledby="greeting-start-heading"
        >
          <div className="greeting-start__intro">
            <span className="greeting-start__icon" aria-hidden="true">
              <UserRoundPlus />
            </span>
            <div>
              <h2 id="greeting-start-heading">{copy("startGreetingTitle")}</h2>
              <p>{copy("startGreetingBody")}</p>
            </div>
          </div>
          <label htmlFor="greeting-person">{copy("choosePerson")}</label>
          <div className="greeting-start__person-field">
            <Search aria-hidden="true" />
            <input
              id="greeting-person"
              type="search"
              value={peopleQuery}
              onChange={(event) => setPeopleQuery(event.target.value)}
              placeholder={copy("peopleSearchPlaceholder")}
              autoComplete="off"
            />
          </div>
          {!target ? (
            <div className="greeting-people" aria-label={copy("availablePeople")}>
              {visiblePeople.length ? visiblePeople.map((profile) => (
                <button
                  className="greeting-person"
                  key={profile.id}
                  type="button"
                  onClick={() => setTarget(profile.id)}
                >
                  <span className="greeting-person__mark" aria-hidden="true">
                    {personMonogram(profile.displayName)}
                  </span>
                  <span className="greeting-person__identity">
                    <strong>{profile.displayName}</strong>
                    <small>@{profile.username}</small>
                  </span>
                  <span className="greeting-person__relation">
                    {copy(friendIds.has(profile.id) ? "friend" : "recentConversation")}
                  </span>
                  <ChevronRight aria-hidden="true" />
                </button>
              )) : (
                <p className="greeting-people__empty">
                  {profiles.isLoading
                    ? copy("loadingPeople")
                    : copy(normalizedPeopleQuery ? "noPeopleMatch" : "noPeopleYet")}
                </p>
              )}
              {isUserId(peopleQuery) && !profilesById.has(peopleQuery.trim()) ? (
                <button
                  className="greeting-person greeting-person--fallback"
                  type="button"
                  onClick={() => setTarget(peopleQuery.trim())}
                >
                  <AtSign aria-hidden="true" />
                  <span className="greeting-person__identity">
                    <strong>{copy("useIdentifier")}</strong>
                    <small>{copy("identifierFallback")}</small>
                  </span>
                  <ChevronRight aria-hidden="true" />
                </button>
              ) : null}
            </div>
          ) : (
            <div className="greeting-selected" aria-label={copy("selectedPerson")}>
              <span className="greeting-person__mark" aria-hidden="true">
                {personMonogram(selectedProfile?.displayName ?? copy("privatePerson"))}
              </span>
              <span className="greeting-person__identity">
                <strong>{selectedProfile?.displayName ?? copy("privatePerson")}</strong>
                <small>
                  {selectedProfile ? `@${selectedProfile.username}` : copy("directIdentifier")}
                </small>
              </span>
              <button type="button" onClick={() => setTarget("")}>
                {copy("changePerson")}
              </button>
            </div>
          )}
          <div
            className="greeting-start__channel"
            ref={greetingStageRef}
          >
            {greetingActive ? (
              <GreetingComposer
                userId={target.trim()}
                onSend={sendGreeting}
                onSessionExpired={() => setSessionExpired(true)}
                onSent={(result) => {
                  const id = (result as { conversation?: { id?: unknown } })
                    .conversation?.id;
                  void client.invalidateQueries({
                    queryKey: conversationListKey,
                  });
                  if (typeof id === "string") navigate(`/messages/${id}`);
                }}
              />
            ) : (
              <p className="greeting-start__standby">
                <LockKeyhole aria-hidden="true" />
                {copy("choosePersonHint")}
              </p>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

export function ConversationRoute() {
  const { copy } = useConversationCopy();
  const { conversationId = "" } = useParams();
  const location = useLocation();
  const client = useQueryClient();
  const routeRef = useRef<HTMLElement>(null);
  const realtimeRef = useRef<ConversationRealtime | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [liveTyping, setLiveTyping] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [notice, setNotice] = useState<{
    readonly type: "success" | "error";
    readonly text: string;
  } | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [safetyBusy, setSafetyBusy] = useState(false);
  const user = useQuery({
    queryKey: currentUserKey,
    queryFn: fetchCurrentUser,
    retry: false,
  });
  const conversations = useQuery({
    queryKey: conversationListKey,
    queryFn: fetchConversations,
    retry: 1,
  });
  const participantIds = useMemo(() => {
    if (!user.data) return [];
    return (conversations.data ?? []).map((item) => peer(item, user.data.id));
  }, [conversations.data, user.data]);
  const profiles = useQuery({
    queryKey: ["identity", "profiles", participantIds.join("|")],
    queryFn: () => fetchPublicProfiles(participantIds),
    enabled: participantIds.length > 0,
    retry: false,
  });
  const messages = useQuery({
    queryKey: messageKey(conversationId),
    queryFn: () => fetchMessages(conversationId),
    enabled: Boolean(conversationId),
    retry: 1,
  });
  const typing = useQuery({
    queryKey: typingKey(conversationId),
    queryFn: () => fetchTyping(conversationId),
    enabled: Boolean(conversationId),
    retry: false,
    refetchInterval: 5_000,
  });
  const { refetch: refetchConversationList } = conversations;
  const { refetch: refetchMessages } = messages;
  const { refetch: refetchTyping } = typing;
  const refetchConversation = useCallback((): void => {
    void Promise.all([
      refetchConversationList(),
      refetchMessages(),
      refetchTyping(),
    ]);
  }, [refetchConversationList, refetchMessages, refetchTyping]);
  const conversation = conversations.data?.find(
    (item) => item.id === conversationId,
  );
  useGSAP(() => {
    const root = routeRef.current;
    const thread = root?.querySelector<HTMLElement>(".conversation-thread");
    if (!root || !thread || messages.isLoading || !conversation) return;

    return withMotionPreferences(root, ({ compact, reducedMotion }) => {
      gsap.killTweensOf(thread);
      if (reducedMotion) {
        gsap.set(thread, { clearProps: "all" });
        return;
      }

      gsap.set(thread, { willChange: "transform,opacity" });
      const tween = gsap.fromTo(
        thread,
        {
          autoAlpha: 0.78,
          x: compact ? 0 : 8,
          y: compact ? 5 : 0,
        },
        {
          autoAlpha: 1,
          x: 0,
          y: 0,
          duration: motionTokens.duration.workRoute,
          ease: motionTokens.ease.quiet,
          clearProps: "transform,opacity,visibility,willChange",
        },
      );
      return () => tween.kill();
    });
  }, {
    dependencies: [conversation?.id, messages.isLoading],
    revertOnUpdate: true,
    scope: routeRef,
  });

  useEffect(() => {
    const realtime = connectConversationRealtime({
      onMessage: (message) => {
        void client.invalidateQueries({ queryKey: conversationListKey });
        if (message.conversationId !== conversationId) return;
        client.setQueryData<ConversationPage>(
          messageKey(conversationId),
          (prior) => ({
            items: prior?.items.some((item) => item.eventId === message.eventId)
              ? prior.items
              : [message, ...(prior?.items ?? [])],
            ...(prior?.nextCursor ? { nextCursor: prior.nextCursor } : {}),
          }),
        );
      },
      onTyping: (event) => {
        if (event.conversationId === conversationId) {
          setLiveTyping(event.active ? event.userId : null);
        }
      },
      onRead: () => {
        void client.invalidateQueries({ queryKey: conversationListKey });
      },
      onReconnect: refetchConversation,
      onSessionExpired: () => setSessionExpired(true),
    });
    realtimeRef.current = realtime;
    return () => {
      realtimeRef.current = null;
      realtime.disconnect();
    };
  }, [client, conversationId, refetchConversation]);

  const typingUser = useMemo(
    () =>
      liveTyping ??
      typing.data?.find((item) => item.active && item.userId !== user.data?.id)
        ?.userId ??
      null,
    [liveTyping, typing.data, user.data?.id],
  );

  useEffect(() => {
    if (!user.data || !messages.data?.items.length) return;
    const latest = messages.data.items.find(
      (item) => item.senderId !== user.data.id,
    );
    if (latest) realtimeRef.current?.markRead(conversationId, latest.id);
  }, [conversationId, messages.data?.items, user.data]);

  if (
    sessionExpired ||
    expired(user.error) ||
    expired(conversations.error) ||
    expired(profiles.error) ||
    expired(messages.error) ||
    expired(typing.error)
  ) {
    return (
      <Navigate
        to="/session-expired"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }
  if (user.isLoading || conversations.isLoading || messages.isLoading) {
    return <LoadingMessages label={copy("loadingConversation")} />;
  }
  if (user.isError || conversations.isError || messages.isError || !user.data) {
    return (
      <section className="messages-route messages-route--state">
        <header className="messages-header">
          <div><h1>{copy("title")}</h1><p>{copy("privateConversation")}</p></div>
          <Link className="messages-text-link" to="/messages"><ArrowLeft aria-hidden="true" /><span>{copy("backToMessages")}</span></Link>
        </header>
        <MessagesStatePanel
          icon={<CircleAlert />}
          eyebrow={copy("privateChannel")}
          title={copy("conversationUnavailableTitle")}
          body={copy("conversationUnavailableBody")}
          actions={(
            <>
              <Button onClick={() => void Promise.all([user.refetch(), conversations.refetch(), messages.refetch()])}>{copy("retry")}</Button>
              <Link className="messages-text-link" to="/messages"><ArrowLeft aria-hidden="true" /><span>{copy("backToMessages")}</span></Link>
            </>
          )}
        />
      </section>
    );
  }
  if (!conversation) {
    return (
      <section className="messages-route messages-route--state">
        <header className="messages-header">
          <div><h1>{copy("title")}</h1><p>{copy("privateConversation")}</p></div>
        </header>
        <MessagesStatePanel
          icon={<MessageCircle />}
          eyebrow={copy("privateChannel")}
          title={copy("conversationNotFoundTitle")}
          body={copy("conversationNotFoundBody")}
          actions={<Link className="messages-text-link" to="/messages"><ArrowLeft aria-hidden="true" /><span>{copy("backToMessages")}</span></Link>}
        />
      </section>
    );
  }

  const other = peer(conversation, user.data.id);
  const profilesById = profileMap(profiles.data);
  const otherProfile = profilesById.get(other);
  const otherName = person(other, profilesById, copy);
  const requestedByMe =
    conversation.state === "requested" &&
    conversation.initiatorId === user.data.id;
  const incomingGreeting = conversation.state === "requested" && !requestedByMe;
  const unavailable =
    blocked ||
    conversation.state === "blocked" ||
    conversation.state === "ignored" ||
    requestedByMe;
  const channelLabel = incomingGreeting
    ? copy("greetingRequest")
    : requestedByMe
      ? copy("waitingReply")
      : unavailable
        ? copy("messagingUnavailable")
        : copy("privateConversation");

  const send = async (
    _id: string,
    content: string,
    idempotencyKey: string,
  ): Promise<MessageDto> => {
    if (incomingGreeting) {
      const result = await replyToGreeting(
        conversation.id,
        content,
        idempotencyKey,
      );
      client.setQueryData<ConversationListItem[]>(
        conversationListKey,
        (prior) =>
          prior?.map((item) =>
            item.id === conversation.id
              ? {
                  ...item,
                  ...result.conversation,
                  unreadCount: 0,
                  lastMessage: result.message,
                }
              : item,
          ),
      );
      setNotice({ type: "success", text: copy("conversationUnlocked") });
      return result.message;
    }
    return realtimeRef.current
      ? realtimeRef.current.sendMessage(
          conversation.id,
          content,
          idempotencyKey,
        )
      : sendMessage(conversation.id, content, idempotencyKey);
  };

  const optimistic = (
    item: PendingMessage | null,
    delivered?: MessageDto,
  ): void => {
    if (item) {
      setPending((prior) => [
        ...prior.filter(
          (current) => current.idempotencyKey !== item.idempotencyKey,
        ),
        item,
      ]);
    } else {
      setPending([]);
    }
    if (delivered) {
      client.setQueryData<ConversationPage>(
        messageKey(conversation.id),
        (prior) => ({
          items: prior?.items.some(
            (message) => message.eventId === delivered.eventId,
          )
            ? prior.items
            : [delivered, ...(prior?.items ?? [])],
          ...(prior?.nextCursor ? { nextCursor: prior.nextCursor } : {}),
        }),
      );
    }
  };

  const retryPending = (idempotencyKey: string): void => {
    const item = pending.find(
      (candidate) => candidate.idempotencyKey === idempotencyKey,
    );
    if (!item) return;
    const sending = { ...item, status: "sending" as const };
    setPending([sending]);
    void send(conversation.id, item.content, item.idempotencyKey)
      .then((message) => optimistic(null, message))
      .catch((error: unknown) => {
        if (expired(error)) {
          setSessionExpired(true);
          return;
        }
        setPending([{ ...item, status: "failed" }]);
      });
  };

  const changeBlock = async (next: boolean): Promise<void> => {
    setSafetyBusy(true);
    setNotice(null);
    try {
      if (next) await blockUser(other);
      else await unblockUser(other);
      setBlocked(next);
      setNotice({
        type: "success",
        text: next ? copy("personBlocked") : copy("personUnblocked"),
      });
      void client.invalidateQueries({ queryKey: conversationListKey });
    } catch (error) {
      if (
        expired(error)
        || (error instanceof SocialApiError && error.status === 401)
      ) {
        setSessionExpired(true);
        return;
      }
      setNotice({ type: "error", text: copy("safetySaveFailed") });
    } finally {
      setSafetyBusy(false);
    }
  };

  return (
    <section className="conversation-route" ref={routeRef}>
      <header className="conversation-header">
        <Link
          className="conversation-back"
          to="/messages"
          aria-label={copy("backToMessages")}
        >
          <ArrowLeft aria-hidden="true" />
        </Link>
        <div className="conversation-header__identity">
          <h1>{otherName}</h1>
          <p>
            {otherProfile ? <span>@{otherProfile.username}</span> : null}
            <span>{channelLabel}</span>
          </p>
        </div>
        <span
          className={`conversation-header__signal${unavailable ? " is-unavailable" : ""}`}
        >
          <Radio aria-hidden="true" />
          {unavailable ? copy("paused") : copy("live")}
        </span>
      </header>

      <div className="conversation-layout">
        <aside
          className="conversation-context"
          aria-label={copy("conversationContext")}
        >
          <div className="conversation-context__person">
            <span aria-hidden="true">{personMonogram(otherName)}</span>
            <div>
              <strong>{otherName}</strong>
              <small>{otherProfile ? `@${otherProfile.username}` : copy("privatePerson")}</small>
            </div>
          </div>
          <div className="conversation-context__privacy">
            <LockKeyhole aria-hidden="true" />
            <div>
              <strong>{copy("privateChannel")}</strong>
              <p>{copy("privateChannelBody")}</p>
            </div>
          </div>
          <MessageSettings
            userId={other}
            blocked={blocked || conversation.state === "blocked"}
            busy={safetyBusy}
            onBlock={() => void changeBlock(true)}
            onUnblock={() => void changeBlock(false)}
          />
        </aside>

        <div className="conversation-thread">
          <MessageTimeline
            currentUserId={user.data.id}
            conversationKey={conversation.id}
            messages={messages.data?.items ?? []}
            pending={pending}
            {...(typingUser
              ? {
                  typingLabel: copy("typing", {
                    person: person(typingUser, profilesById, copy),
                  }),
                }
              : {})}
            onRetry={retryPending}
          />
          {notice ? (
            <p
              className={`conversation-notice conversation-notice--${notice.type}`}
              role={notice.type === "error" ? "alert" : "status"}
            >
              {notice.type === "error" ? (
                <CircleAlert aria-hidden="true" />
              ) : (
                <ShieldCheck aria-hidden="true" />
              )}
              {notice.text}
            </p>
          ) : null}
          <div className="conversation-composer-dock">
            <MessageComposer
              conversationId={conversation.id}
              disabled={unavailable}
              {...(requestedByMe || blocked
                ? {
                    reason: requestedByMe
                      ? copy("waitBeforeSending")
                      : copy("unblockBeforeSending"),
                  }
                : {})}
              submitLabel={
                incomingGreeting ? copy("replyAndUnlock") : copy("send")
              }
              onSend={send}
              onOptimistic={optimistic}
              onTyping={(active) =>
                realtimeRef.current?.setTyping(conversation.id, active)
              }
              onSessionExpired={() => setSessionExpired(true)}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
