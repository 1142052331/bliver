import type { MessageDto } from "@bliver/contracts";
import { Button } from "@bliver/ui";
import {
  ArrowUpRight,
  ChevronRight,
  CircleAlert,
  Clock3,
  LockKeyhole,
  MessageCircle,
  Send,
  ShieldBan,
  ShieldCheck,
  UserRoundPlus,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import {
  gsap,
  motionTokens,
  prefersReducedMotion,
  useGSAP,
  withMotionPreferences,
} from "../../platform/motion/gsap.js";
import { ConversationApiError, type ConversationListItem } from "./api.js";
import {
  conversationDefault,
  type ConversationTranslationKey,
} from "./translations.js";

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

export interface ConversationPerson {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
}

function personName(
  value: string,
  profiles: ReadonlyMap<string, ConversationPerson>,
  copy: MessageCopy,
): string {
  return profiles.get(value)?.displayName.trim() || copy("privatePerson");
}

function peer(item: ConversationListItem, currentUserId: string): string {
  return item.participantLowId === currentUserId
    ? item.participantHighId
    : item.participantLowId;
}

function personInitial(value: string): string {
  const segments = value.trim().split(/\s+/u).filter(Boolean);
  if (!segments.length) return "--";
  return (segments.length > 1
    ? `${segments[0]?.[0] ?? ""}${segments.at(-1)?.[0] ?? ""}`
    : segments[0]?.slice(0, 2) ?? "--"
  ).toLocaleUpperCase();
}

const MESSAGE_NEAR_BOTTOM_THRESHOLD = 96;

function sessionExpired(error: unknown): boolean {
  return error instanceof ConversationApiError && error.status === 401;
}

export function ConversationList({
  items,
  currentUserId,
  profiles = [],
}: {
  readonly items: readonly ConversationListItem[];
  readonly currentUserId: string;
  readonly profiles?: readonly ConversationPerson[];
}) {
  const { copy, locale } = useConversationCopy();
  const profilesById = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile])),
    [profiles],
  );
  const listRef = useRef<HTMLDivElement>(null);
  const listMotionReadyRef = useRef(false);
  const previousListStatesRef = useRef<
    ReadonlyMap<string, { readonly unreadCount: number; readonly updatedAt: string }>
  >(new Map());
  const listFingerprint = items
    .map((item) => `${item.id}:${item.unreadCount}:${item.updatedAt}`)
    .join("|");

  useGSAP(() => {
    const root = listRef.current;
    if (!root) return;
    const rows = Array.from(
      root.querySelectorAll<HTMLElement>(".conversation-row"),
    );
    if (!rows.length) return;
    const nextStates = new Map(
      items.map((item) => [
        item.id,
        { unreadCount: item.unreadCount, updatedAt: item.updatedAt },
      ]),
    );
    const initialize = !listMotionReadyRef.current;
    const enteringIds = new Set(
      items.flatMap((item) => {
        const previous = previousListStatesRef.current.get(item.id);
        return initialize
          || !previous
          || previous.updatedAt !== item.updatedAt
          || previous.unreadCount !== item.unreadCount
          ? [item.id]
          : [];
      }),
    );
    const unreadIds = new Set(
      items.flatMap((item) => {
        const previous = previousListStatesRef.current.get(item.id);
        return item.unreadCount > 0
          && (initialize || !previous || item.unreadCount > previous.unreadCount)
          ? [item.id]
          : [];
      }),
    );
    const enteringRows = rows.filter((row) =>
      enteringIds.has(row.dataset.conversationId ?? ""),
    );
    listMotionReadyRef.current = true;
    previousListStatesRef.current = nextStates;
    if (!enteringRows.length && !unreadIds.size) return;

    return withMotionPreferences(root, ({ reducedMotion }) => {
      const unreadBadges = Array.from(
        root.querySelectorAll<HTMLElement>(".conversation-row__meta b"),
      ).filter((badge) =>
        unreadIds.has(
          badge.closest<HTMLElement>(".conversation-row")?.dataset
            .conversationId ?? "",
        ),
      );
      gsap.killTweensOf([...enteringRows, ...unreadBadges]);
      if (reducedMotion) {
        gsap.set([...enteringRows, ...unreadBadges], { clearProps: "all" });
        return;
      }

      gsap.set(enteringRows, { willChange: "transform,opacity" });
      const timeline = gsap.timeline({
        defaults: { ease: motionTokens.ease.quiet, overwrite: "auto" },
      });
      timeline.fromTo(
        enteringRows,
        { opacity: 0.72 },
        {
          opacity: 1,
          duration: motionTokens.duration.workRoute,
          stagger: 0.025,
          clearProps: "transform,opacity,willChange",
        },
      );
      if (unreadBadges.length) {
        timeline.fromTo(
          unreadBadges,
          { opacity: 0.72, scale: 0.78 },
          {
            opacity: 1,
            scale: 1,
            duration: motionTokens.duration.state,
            stagger: 0.035,
            clearProps: "transform,opacity",
          },
          0.06,
        );
      }
      return () => timeline.kill();
    });
  }, {
    dependencies: [listFingerprint],
    revertOnUpdate: true,
    scope: listRef,
  });

  if (!items.length) {
    return (
      <div className="messages-empty" ref={listRef}>
        <span className="messages-empty__channel">
          <LockKeyhole aria-hidden="true" />
          {copy("privateChannel")}
        </span>
        <h2>{copy("noConversationsTitle")}</h2>
        <p>{copy("noConversationsBody")}</p>
        <Link className="messages-text-link" to="/people">
          <span>{copy("findPeople")}</span>
          <ArrowUpRight aria-hidden="true" />
        </Link>
      </div>
    );
  }

  return (
    <div
      className="conversation-list"
      ref={listRef}
      aria-label={copy("conversationsTitle")}
    >
      {items.map((item) => {
        const other = peer(item, currentUserId);
        const incomingGreeting =
          item.state === "requested" && item.initiatorId !== currentUserId;
        const summary = incomingGreeting
          ? copy("newGreeting")
          : (item.lastMessage?.content ??
            (item.state === "requested"
              ? copy("waitingReply")
              : copy("openConversation")));
        const profile = profilesById.get(other);
        const otherName = personName(other, profilesById, copy);

        return (
          <Link
            className={`conversation-row${item.unreadCount > 0 ? " conversation-row--unread" : ""}`}
            data-conversation-id={item.id}
            key={item.id}
            to={`/messages/${item.id}`}
            aria-label={copy("openConversationWith", { person: otherName })}
          >
            <span className="conversation-row__stamp" aria-hidden="true">
              <span>{personInitial(otherName)}</span>
              <small>
                {incomingGreeting ? <UserRoundPlus /> : <MessageCircle />}
              </small>
            </span>
            <span className="conversation-row__body">
              <span className="conversation-row__identity">
                <strong>{otherName}</strong>
                {profile ? <em>@{profile.username}</em> : null}
              </span>
              <small>{summary}</small>
            </span>
            <span className="conversation-row__meta">
              <time dateTime={item.updatedAt}>
                {new Date(item.updatedAt).toLocaleDateString(locale, {
                  month: "short",
                  day: "numeric",
                })}
              </time>
              {item.unreadCount > 0 ? (
                <b>{copy("unread", { count: item.unreadCount })}</b>
              ) : null}
            </span>
            <ChevronRight
              className="conversation-row__arrow"
              aria-hidden="true"
            />
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
  readonly onSend: (
    userId: string,
    content: string,
    idempotencyKey: string,
  ) => Promise<unknown>;
  readonly onSent?: (result: unknown) => void;
  readonly onSessionExpired?: () => void;
}

export function GreetingComposer({
  userId,
  disabled = false,
  reason,
  onSend,
  onSent,
  onSessionExpired,
}: GreetingComposerProps) {
  const { copy } = useConversationCopy();
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const submit = async (): Promise<void> => {
    const value = content.trim();
    if (!value || disabled || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const result = await onSend(userId, value, crypto.randomUUID());
      setContent("");
      setNotice(copy("greetingSent"));
      onSent?.(result);
    } catch (error) {
      if (sessionExpired(error)) {
        onSessionExpired?.();
        return;
      }
      setNotice(
        error instanceof Error && error.message === "GREETING_ALREADY_SENT"
          ? copy("greetingAlreadySent")
          : copy("greetingFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="greeting-composer"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label htmlFor="greeting-message">{copy("greeting")}</label>
      <div className="greeting-composer__field">
        <textarea
          id="greeting-message"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          disabled={disabled || busy}
          maxLength={2000}
          placeholder={copy("greetingPlaceholder")}
        />
        <span aria-hidden="true">
          {copy("characterCount", { count: content.length })}
        </span>
      </div>
      <div className="composer-actions">
        <small>{reason ?? copy("replyUnlocks")}</small>
        <Button type="submit" disabled={disabled || busy || !content.trim()}>
          <UserRoundPlus aria-hidden="true" />
          <span>{busy ? copy("sending") : copy("sendGreeting")}</span>
        </Button>
      </div>
      {notice ? (
        <p className="composer-notice" role="status">
          {notice}
        </p>
      ) : null}
    </form>
  );
}

export interface PendingMessage {
  readonly content: string;
  readonly idempotencyKey: string;
  readonly status: "sending" | "failed";
}

interface MessageComposerProps {
  readonly conversationId: string;
  readonly disabled: boolean;
  readonly reason?: string;
  readonly onSend: (
    conversationId: string,
    content: string,
    idempotencyKey: string,
  ) => Promise<MessageDto>;
  readonly onOptimistic?: (
    pending: PendingMessage | null,
    message?: MessageDto,
  ) => void;
  readonly onTyping?: (active: boolean) => void;
  readonly submitLabel?: string;
  readonly onSessionExpired?: () => void;
}

export function MessageComposer({
  conversationId,
  disabled,
  reason,
  onSend,
  onOptimistic,
  onTyping,
  submitLabel,
  onSessionExpired,
}: MessageComposerProps) {
  const { copy } = useConversationCopy();
  const [content, setContent] = useState("");
  const [pending, setPending] = useState<PendingMessage | null>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const deliveryState = pending?.status ?? "idle";

  useGSAP(() => {
    const root = composerRef.current;
    if (!root || deliveryState === "idle") return;

    return withMotionPreferences(root, ({ reducedMotion }) => {
      const field = root.querySelector<HTMLElement>(
        ".message-composer__field",
      );
      const sendButton = root.querySelector<HTMLElement>(
        ".message-composer__send",
      );
      const sendIcon = root.querySelector<SVGElement>(
        ".message-composer__send svg",
      );
      const failure = root.querySelector<HTMLElement>(".composer-failure");
      const targets = [field, sendButton, sendIcon, failure].filter(
        (target): target is HTMLElement | SVGElement => target !== null,
      );
      gsap.killTweensOf(targets);
      if (reducedMotion) {
        gsap.set(targets, { clearProps: "all" });
        return;
      }

      const timeline = gsap.timeline({
        defaults: { ease: motionTokens.ease.quiet, overwrite: "auto" },
      });
      if (deliveryState === "sending") {
        if (sendButton) {
          timeline.fromTo(
            sendButton,
            { scale: 0.96 },
            {
              scale: 1,
              duration: motionTokens.duration.micro,
              clearProps: "transform",
            },
          );
        }
        if (sendIcon) {
          timeline.fromTo(
            sendIcon,
            { autoAlpha: 0.55, x: -3 },
            {
              autoAlpha: 1,
              x: 0,
              duration: motionTokens.duration.state,
              clearProps: "transform,opacity,visibility",
            },
            0,
          );
        }
      } else if (failure) {
        timeline.fromTo(
          failure,
          { opacity: 0.72, y: -4 },
          {
            opacity: 1,
            y: 0,
            duration: motionTokens.duration.state,
            clearProps: "transform,opacity",
          },
        );
        if (field) {
          timeline.fromTo(
            field,
            { x: 3 },
            {
              x: 0,
              duration: motionTokens.duration.micro,
              clearProps: "transform",
            },
            0,
          );
        }
      }
      return () => timeline.kill();
    });
  }, {
    dependencies: [deliveryState],
    revertOnUpdate: true,
    scope: composerRef,
  });

  const deliver = async (item: PendingMessage): Promise<void> => {
    const sending = { ...item, status: "sending" as const };
    setPending(sending);
    onOptimistic?.(sending);
    try {
      const message = await onSend(
        conversationId,
        item.content,
        item.idempotencyKey,
      );
      setPending(null);
      setContent("");
      onTyping?.(false);
      onOptimistic?.(null, message);
    } catch (error) {
      if (sessionExpired(error)) {
        onSessionExpired?.();
        return;
      }
      const failed = { ...item, status: "failed" as const };
      setPending(failed);
      onOptimistic?.(failed);
    }
  };

  const submit = (): void => {
    const value = content.trim();
    if (!value || disabled || pending?.status === "sending") return;
    void deliver({
      content: value,
      idempotencyKey: crypto.randomUUID(),
      status: "sending",
    });
  };

  return (
    <form
      className={`message-composer message-composer--${deliveryState}`}
      ref={composerRef}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label htmlFor="conversation-message">{copy("message")}</label>
      <div className="message-composer__field">
        <textarea
          id="conversation-message"
          value={content}
          onChange={(event) => {
            setContent(event.target.value);
            onTyping?.(Boolean(event.target.value.trim()));
          }}
          disabled={disabled || pending?.status === "sending"}
          maxLength={2000}
          placeholder={
            disabled ? copy("messagingUnavailable") : copy("messagePlaceholder")
          }
        />
        <Button
          className="message-composer__send"
          type="submit"
          disabled={
            disabled || !content.trim() || pending?.status === "sending"
          }
        >
          <Send aria-hidden="true" />
          <span>
            {pending?.status === "sending"
              ? copy("sending")
              : (submitLabel ?? copy("send"))}
          </span>
        </Button>
      </div>
      <small className="message-composer__meta">
        {reason ?? copy("characterCount", { count: content.length })}
      </small>
      {pending?.status === "failed" ? (
        <div className="composer-failure" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{copy("messageFailed")}</span>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void deliver(pending)}
          >
            {copy("retryMessage")}
          </Button>
        </div>
      ) : null}
    </form>
  );
}

export function MessageTimeline({
  currentUserId,
  conversationKey,
  messages,
  pending,
  typingLabel,
  onRetry,
}: {
  readonly currentUserId: string;
  readonly conversationKey?: string;
  readonly messages: readonly MessageDto[];
  readonly pending: readonly PendingMessage[];
  readonly typingLabel?: string;
  readonly onRetry: (idempotencyKey: string) => void;
}) {
  const { copy, locale } = useConversationCopy();
  const endRef = useRef<HTMLLIElement>(null);
  const timelineRef = useRef<HTMLOListElement>(null);
  const initializedRef = useRef(false);
  const nearBottomRef = useRef(true);
  const previousMessageIdsRef = useRef<ReadonlySet<string>>(new Set());
  const previousPendingIdsRef = useRef<ReadonlySet<string>>(new Set());
  const previousFingerprintRef = useRef<{
    readonly currentUserId: string;
    readonly message: string;
    readonly pending: string;
  } | undefined>(undefined);
  const motionReadyRef = useRef(false);
  const motionConversationRef = useRef(conversationKey ?? currentUserId);
  const animatedMessageIdsRef = useRef<ReadonlySet<string>>(new Set());
  const animatedPendingStatesRef = useRef<ReadonlyMap<string, string>>(
    new Map(),
  );
  const typingVisibleRef = useRef(false);
  const ordered = [...messages].sort((left, right) =>
    left.sentAt.localeCompare(right.sentAt),
  );
  const messageFingerprint = ordered
    .map((message) => `${message.eventId}:${message.senderId}`)
    .join("|");
  const pendingFingerprint = pending
    .map((item) => item.idempotencyKey)
    .join("|");
  const pendingMotionFingerprint = pending
    .map((item) => `${item.idempotencyKey}:${item.status}`)
    .join("|");
  const motionConversationKey = conversationKey ?? currentUserId;

  useGSAP(() => {
    const root = timelineRef.current;
    if (!root) return;

    const nextMessageIds = new Set(ordered.map((message) => message.eventId));
    const nextPendingStates = new Map(
      pending.map((item) => [item.idempotencyKey, item.status]),
    );
    const conversationChanged =
      motionConversationRef.current !== motionConversationKey;
    const initialize = !motionReadyRef.current || conversationChanged;
    const newMessageIds = initialize
      ? new Set<string>()
      : new Set(
          [...nextMessageIds].filter(
            (id) => !animatedMessageIdsRef.current.has(id),
          ),
        );
    const newPendingIds = initialize
      ? new Set<string>()
      : new Set(
          [...nextPendingStates.keys()].filter(
            (id) => !animatedPendingStatesRef.current.has(id),
          ),
        );
    const failedPendingIds = initialize
      ? new Set<string>()
      : new Set(
          [...nextPendingStates].flatMap(([id, status]) =>
            status === "failed"
            && animatedPendingStatesRef.current.get(id) !== "failed"
              ? [id]
              : [],
          ),
        );
    const typingAppeared = Boolean(typingLabel) && !typingVisibleRef.current;

    motionReadyRef.current = true;
    motionConversationRef.current = motionConversationKey;
    animatedMessageIdsRef.current = nextMessageIds;
    animatedPendingStatesRef.current = nextPendingStates;
    typingVisibleRef.current = Boolean(typingLabel);

    return withMotionPreferences(root, ({ reducedMotion }) => {
      const messageNodes = Array.from(
        root.querySelectorAll<HTMLElement>("[data-message-key]"),
      );
      const pendingNodes = Array.from(
        root.querySelectorAll<HTMLElement>("[data-pending-key]"),
      );
      const enteringNodes = [
        ...messageNodes.filter((node) =>
          newMessageIds.has(node.dataset.messageKey ?? ""),
        ),
        ...pendingNodes.filter((node) =>
          newPendingIds.has(node.dataset.pendingKey ?? ""),
        ),
      ];
      const failedNodes = pendingNodes.filter((node) =>
        failedPendingIds.has(node.dataset.pendingKey ?? ""),
      );
      const typingStatus = root.querySelector<HTMLElement>(".typing-status");
      const typingDots = typingStatus
        ? Array.from(
            typingStatus.querySelectorAll<HTMLElement>(
              ".typing-status__dots i",
            ),
          )
        : [];
      const targets = [
        ...enteringNodes,
        ...failedNodes,
        ...(typingStatus ? [typingStatus] : []),
        ...typingDots,
      ];
      if (!targets.length) return;
      gsap.killTweensOf(targets);
      if (reducedMotion) {
        gsap.set(targets, { clearProps: "all" });
        return;
      }

      const timeline = gsap.timeline({
        defaults: { ease: motionTokens.ease.quiet, overwrite: "auto" },
      });
      if (enteringNodes.length) {
        gsap.set(enteringNodes, { willChange: "transform,opacity" });
        timeline.fromTo(
          enteringNodes,
          {
            opacity: 0.72,
            scale: 0.985,
            x: (_index, target: HTMLElement) =>
              target.classList.contains("message-bubble--mine") ? 8 : -8,
            y: 5,
          },
          {
            opacity: 1,
            scale: 1,
            x: 0,
            y: 0,
            duration: motionTokens.duration.state,
            stagger: 0.025,
            clearProps: "transform,opacity,willChange",
          },
        );
      }
      if (failedNodes.length) {
        timeline.fromTo(
          failedNodes,
          { x: 4 },
          {
            x: 0,
            duration: motionTokens.duration.micro,
            clearProps: "transform",
          },
          0,
        );
      }
      if (typingStatus && typingAppeared) {
        timeline.fromTo(
          typingStatus,
          { opacity: 0.72, y: 4 },
          {
            opacity: 1,
            y: 0,
            duration: motionTokens.duration.state,
            clearProps: "transform,opacity",
          },
          0,
        );
      }

      const typingLoop = typingDots.length
        ? gsap
            .timeline({ repeat: -1, repeatDelay: 0.08 })
            .fromTo(
              typingDots,
              { autoAlpha: 0.48, y: 1 },
              {
                autoAlpha: 1,
                y: -1,
                duration: 0.28,
                ease: "sine.inOut",
                stagger: 0.08,
              },
            )
            .to(
              typingDots,
              {
                autoAlpha: 0.48,
                y: 1,
                duration: 0.28,
                ease: "sine.inOut",
                stagger: 0.08,
              },
              0.24,
            )
        : null;
      return () => {
        timeline.kill();
        typingLoop?.kill();
      };
    });
  }, {
    dependencies: [
      messageFingerprint,
      motionConversationKey,
      pendingMotionFingerprint,
      typingLabel,
    ],
    revertOnUpdate: true,
    scope: timelineRef,
  });

  useEffect(() => {
    const previousFingerprint = previousFingerprintRef.current;
    if (
      previousFingerprint
      && previousFingerprint.currentUserId === currentUserId
      && previousFingerprint.message === messageFingerprint
      && previousFingerprint.pending === pendingFingerprint
    ) return;
    previousFingerprintRef.current = {
      currentUserId,
      message: messageFingerprint,
      pending: pendingFingerprint,
    };

    const current = { ordered, pending };
    const previousMessageIds = previousMessageIdsRef.current;
    const previousPendingIds = previousPendingIdsRef.current;
    const nextMessageIds = new Set(
      current.ordered.map((message) => message.eventId),
    );
    const nextPendingIds = new Set(
      current.pending.map((item) => item.idempotencyKey),
    );
    const hasItems = current.ordered.length > 0 || current.pending.length > 0;

    if (!hasItems) {
      initializedRef.current = false;
      nearBottomRef.current = true;
      previousMessageIdsRef.current = nextMessageIds;
      previousPendingIdsRef.current = nextPendingIds;
      return;
    }

    const firstPosition = !initializedRef.current;
    const conversationChanged = initializedRef.current
      && previousMessageIds.size > 0
      && current.ordered.length > 0
      && !current.ordered.some((message) => previousMessageIds.has(message.eventId));
    const ownMessageAdded = current.ordered.some(
      (message) => message.senderId === currentUserId
        && !previousMessageIds.has(message.eventId),
    );
    const pendingAdded = current.pending.some(
      (item) => !previousPendingIds.has(item.idempotencyKey),
    );
    const shouldScroll = firstPosition
      || conversationChanged
      || nearBottomRef.current
      || ownMessageAdded
      || pendingAdded;

    initializedRef.current = true;
    previousMessageIdsRef.current = nextMessageIds;
    previousPendingIdsRef.current = nextPendingIds;

    const target = endRef.current;
    if (
      !shouldScroll
      || !target
      || typeof target.scrollIntoView !== "function"
    ) return;

    nearBottomRef.current = true;
    target.scrollIntoView({
      behavior: firstPosition || prefersReducedMotion() ? "auto" : "smooth",
      block: "end",
    });
  }, [
    currentUserId,
    messageFingerprint,
    ordered,
    pending,
    pendingFingerprint,
  ]);

  if (!ordered.length && !pending.length) {
    return (
      <div className="message-timeline message-timeline--empty">
        <MessageCircle aria-hidden="true" />
        <p>{copy("noMessages")}</p>
        <a className="message-timeline__action" href="#conversation-message">
          <Send aria-hidden="true" />
          {copy("messagePlaceholder")}
        </a>
      </div>
    );
  }

  return (
    <ol
      className="message-timeline"
      ref={timelineRef}
      aria-live="polite"
      onScroll={(event) => {
        const timeline = event.currentTarget;
        const distanceFromBottom = timeline.scrollHeight
          - timeline.scrollTop
          - timeline.clientHeight;
        nearBottomRef.current = distanceFromBottom
          <= MESSAGE_NEAR_BOTTOM_THRESHOLD;
      }}
    >
      {ordered.map((message) => (
        <li
          className={
            message.senderId === currentUserId
              ? "message-bubble message-bubble--mine"
              : "message-bubble"
          }
          data-message-key={message.eventId}
          key={message.eventId}
        >
          <p>{message.content}</p>
          <time dateTime={message.sentAt}>
            {new Date(message.sentAt).toLocaleTimeString(locale, {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        </li>
      ))}
      {pending.map((item) => (
        <li
          className={`message-bubble message-bubble--mine message-bubble--pending${item.status === "failed" ? " message-bubble--failed" : ""}`}
          data-pending-key={item.idempotencyKey}
          data-pending-status={item.status}
          key={item.idempotencyKey}
        >
          <p>{item.content}</p>
          <small>
            {item.status === "failed" ? (
              <CircleAlert aria-hidden="true" />
            ) : (
              <Clock3 aria-hidden="true" />
            )}
            {item.status === "failed" ? copy("notSent") : copy("sending")}
          </small>
          {item.status === "failed" ? (
            <button type="button" onClick={() => onRetry(item.idempotencyKey)}>
              {copy("retryShort")}
            </button>
          ) : null}
        </li>
      ))}
      {typingLabel ? (
        <li className="typing-status" role="status">
          <span className="typing-status__dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>{typingLabel}</span>
        </li>
      ) : null}
      <li
        ref={endRef}
        className="message-timeline__anchor"
        aria-hidden="true"
      />
    </ol>
  );
}

export function MessageSettings({
  userId,
  blocked,
  busy = false,
  onBlock,
  onUnblock,
}: {
  readonly userId: string;
  readonly blocked: boolean;
  readonly busy?: boolean;
  readonly onBlock: (userId: string) => void;
  readonly onUnblock: (userId: string) => void;
}) {
  const { copy } = useConversationCopy();
  const SafetyIcon = blocked ? ShieldBan : ShieldCheck;
  return (
    <section
      className="message-settings"
      aria-labelledby="message-safety-heading"
    >
      <SafetyIcon aria-hidden="true" />
      <div>
        <h2 id="message-safety-heading">{copy("safety")}</h2>
        <p>{blocked ? copy("blockedBody") : copy("blockingBody")}</p>
      </div>
      {blocked ? (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => onUnblock(userId)}
        >
          {copy("unblock")}
        </Button>
      ) : (
        <Button
          variant="danger"
          disabled={busy}
          onClick={() => onBlock(userId)}
        >
          {copy("block")}
        </Button>
      )}
    </section>
  );
}
