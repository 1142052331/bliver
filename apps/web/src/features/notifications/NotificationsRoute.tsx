import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Skeleton } from '@bliver/ui';
import {
  ArrowUpRight,
  Bell,
  BellOff,
  BellRing,
  Check,
  CheckCheck,
  CircleAlert,
  Heart,
  MessageCircle,
  MessagesSquare,
  RotateCw,
  ShieldAlert,
  UserPlus,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { AppStatusScene } from '../../app/AppStatusScene.js';
import { disableWebPush, enableWebPush } from './push.js';
import {
  fetchNotificationPreferences,
  fetchNotifications,
  readAllNotifications,
  readNotification,
  saveNotificationPreferences,
  type NotificationItem,
} from './api.js';
import { notificationTranslations } from './translations.js';
import './notifications.css';

type NotificationTranslationKey =
  keyof typeof notificationTranslations.en.notifications;
type NotificationCopy = (
  key: NotificationTranslationKey,
  values?: Record<string, string | number>,
) => string;

const preferenceKeys = [
  'messages',
  'social',
  'comments',
  'reactions',
  'moderation',
  'push',
] as const;

const preferenceCopy = {
  messages: {
    label: 'preferenceMessagesLabel',
    detail: 'preferenceMessagesDetail',
  },
  social: {
    label: 'preferenceSocialLabel',
    detail: 'preferenceSocialDetail',
  },
  comments: {
    label: 'preferenceCommentsLabel',
    detail: 'preferenceCommentsDetail',
  },
  reactions: {
    label: 'preferenceReactionsLabel',
    detail: 'preferenceReactionsDetail',
  },
  moderation: {
    label: 'preferenceModerationLabel',
    detail: 'preferenceModerationDetail',
  },
  push: {
    label: 'preferencePushLabel',
    detail: 'preferencePushDetail',
  },
} as const satisfies Record<
  (typeof preferenceKeys)[number],
  {
    label: NotificationTranslationKey;
    detail: NotificationTranslationKey;
  }
>;

const notificationKinds = {
  reaction: { label: 'typeReaction', Icon: Heart },
  comment: { label: 'typeComment', Icon: MessageCircle },
  reply: { label: 'typeReply', Icon: MessagesSquare },
  friend_request: { label: 'typeFriendRequest', Icon: UserPlus },
  friend: { label: 'typeFriendUpdate', Icon: UserPlus },
  message: { label: 'typeMessage', Icon: MessagesSquare },
  moderation: { label: 'typeModeration', Icon: ShieldAlert },
} as const;

function presentationFor(item: NotificationItem, copy: NotificationCopy) {
  const presentation =
    notificationKinds[item.type as keyof typeof notificationKinds];
  return presentation
    ? { label: copy(presentation.label), Icon: presentation.Icon }
    : { label: item.type.replaceAll('_', ' '), Icon: Bell };
}

function targetFor(item: NotificationItem, copy: NotificationCopy): string {
  if (item.target.type === 'footprint') return copy('targetFootprint');
  if (item.target.type === 'user') return copy('targetUser');
  if (item.target.type === 'conversation') return copy('targetConversation');
  return copy('targetFallback');
}

function messageFor(item: NotificationItem, copy: NotificationCopy): string {
  const actor = item.actor?.name ?? 'Bliver';
  const target = targetFor(item, copy);

  switch (item.type) {
    case 'reaction':
      return copy('messageReaction', { actor, target });
    case 'comment':
      return copy('messageComment', { actor, target });
    case 'reply':
      return copy('messageReply', { actor });
    case 'friend_request':
      return copy('messageFriendRequest', { actor });
    case 'message':
      return copy('messageDirect', { actor });
    case 'moderation':
      return copy('messageModeration', { target });
    default:
      return copy('messageUpdated', { actor, target });
  }
}

function notificationHref(item: NotificationItem): string {
  if (item.target.type === 'footprint') {
    return `/footprints/${item.target.id}`;
  }
  if (item.target.type === 'user') return `/profile/${item.target.id}`;
  if (item.target.type === 'conversation') return `/messages/${item.target.id}`;
  return '/notifications';
}

function formatNotificationTime(value: string, locale?: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function NotificationsRoute() {
  const { i18n, t } = useTranslation();
  const copy: NotificationCopy = (key, values = {}) =>
    t(`notifications.${key}`, {
      defaultValue: notificationTranslations.en.notifications[key],
      ...values,
    });
  const client = useQueryClient();
  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: fetchNotifications,
    retry: 1,
  });
  const preferences = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: fetchNotificationPreferences,
  });
  const refresh = (): void => {
    void Promise.all([
      client.invalidateQueries({ queryKey: ['notifications'] }),
      client.invalidateQueries({ queryKey: ['notification-preferences'] }),
    ]);
  };
  const read = useMutation({
    mutationFn: readNotification,
    onSuccess: refresh,
  });
  const readAll = useMutation({
    mutationFn: readAllNotifications,
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: saveNotificationPreferences,
    onSuccess: refresh,
  });
  const push = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (enabled) {
        const supported = await enableWebPush();
        if (!supported) throw new Error('Web push could not be enabled');
        return true;
      }
      await disableWebPush();
      return true;
    },
    onSuccess: refresh,
  });

  if (notifications.isLoading) {
    return (
      <section className="notifications-route" aria-busy="true">
        <header className="notifications-route__header">
          <div className="notifications-route__title">
            <span className="notifications-route__title-icon" aria-hidden="true">
              <Bell />
            </span>
            <div>
              <p className="notifications-route__context">{copy('context')}</p>
              <h1>{copy('title')}</h1>
              <p role="status">{copy('loading')}</p>
            </div>
          </div>
        </header>
        <div className="notifications-route__layout notifications-route__loading-layout">
          <section className="notifications-route__loading" aria-label={copy('loadingEvents')}>
            <Skeleton label={copy('loadingEvents')} lines={8} />
          </section>
          <aside className="notification-settings notifications-route__loading" aria-label={copy('loadingSettings')}>
            <Skeleton label={copy('loadingSettings')} lines={6} />
          </aside>
        </div>
      </section>
    );
  }

  if (notifications.isError) {
    return (
      <section className="notifications-route notifications-route--state">
        <AppStatusScene
          Icon={BellOff}
          code="INBOX / 503"
          title={copy('unavailableTitle')}
          body={copy('unavailableBody')}
          action={
            <Button onClick={() => void notifications.refetch()}>
              <RotateCw aria-hidden="true" />
              {copy('retry')}
            </Button>
          }
        />
      </section>
    );
  }

  const items = notifications.data?.items ?? [];
  const unreadCount = notifications.data?.unreadCount ?? 0;

  return (
    <section className="notifications-route">
      <header className="notifications-route__header">
        <div className="notifications-route__title">
          <span className="notifications-route__title-icon" aria-hidden="true">
            <Bell />
          </span>
          <div>
            <p className="notifications-route__context">{copy('context')}</p>
            <h1>{copy('title')}</h1>
            <p>
              <strong>{copy('unread', { count: unreadCount })}</strong>
            </p>
          </div>
        </div>
        {unreadCount > 0 ? (
          <Button
            variant="secondary"
            disabled={read.isPending}
            loading={readAll.isPending}
            onClick={() => readAll.mutate()}
          >
            <CheckCheck aria-hidden="true" />
            {copy('markAllRead')}
          </Button>
        ) : null}
      </header>

      <div className="notifications-route__layout">
        <section
          className="notifications-route__stream"
          aria-labelledby="notification-stream-heading"
        >
          <header className="notifications-route__section-header">
            <div>
              <h2 id="notification-stream-heading">{copy('recentTitle')}</h2>
              <p>{copy('recentBody')}</p>
            </div>
            <span>{copy('eventCount', { count: items.length })}</span>
          </header>

          {readAll.isError ? (
            <div className="notifications-route__notice" role="alert">
              <CircleAlert aria-hidden="true" />
              <span>{copy('readAllError')}</span>
              <Button
                variant="ghost"
                disabled={read.isPending || readAll.isPending}
                onClick={() => readAll.mutate()}
              >
                <RotateCw aria-hidden="true" />
                {copy('retry')}
              </Button>
            </div>
          ) : null}

          <div className="notification-list">
            {items.length ? (
              items.map((item) => {
                const presentation = presentationFor(item, copy);
                const Icon = presentation.Icon;
                const isUnread = !item.readAt;
                const readingThis = read.isPending && read.variables === item.id;
                const readFailed = read.isError && read.variables === item.id;

                return (
                  <article
                    key={item.id}
                    className={isUnread ? 'notification-item is-unread' : 'notification-item'}
                  >
                    <span className="notification-item__icon" aria-hidden="true">
                      <Icon />
                    </span>
                    <div className="notification-item__body">
                      <div className="notification-item__heading">
                        <strong>{presentation.label}</strong>
                        {isUnread ? <span>{copy('new')}</span> : null}
                      </div>
                      <p>{messageFor(item, copy)}</p>
                      <time dateTime={item.createdAt}>
                        {formatNotificationTime(
                          item.createdAt,
                          i18n.resolvedLanguage,
                        )}
                      </time>
                    </div>
                    <div className="notification-item__actions">
                      <Link to={notificationHref(item)}>
                        <span>{copy('open')}</span>
                        <ArrowUpRight aria-hidden="true" />
                      </Link>
                      {isUnread ? (
                        <Button
                          className="notification-item__read"
                          variant="ghost"
                          disabled={readAll.isPending || (read.isPending && !readingThis)}
                          loading={readingThis}
                          onClick={() => read.mutate(item.id)}
                        >
                          <Check aria-hidden="true" />
                          {copy('markRead')}
                        </Button>
                      ) : null}
                    </div>
                    {readFailed ? (
                      <div
                        className="notifications-route__notice notification-item__notice"
                        role="alert"
                      >
                        <CircleAlert aria-hidden="true" />
                        <span>{copy('readError')}</span>
                        <Button
                          variant="ghost"
                          disabled={readAll.isPending || read.isPending}
                          onClick={() => read.mutate(item.id)}
                        >
                          <RotateCw aria-hidden="true" />
                          {copy('retry')}
                        </Button>
                      </div>
                    ) : null}
                  </article>
                );
              })
            ) : (
              <div className="notifications-route__empty">
                <span aria-hidden="true">
                  <CheckCheck />
                </span>
                <h2>{copy('emptyTitle')}</h2>
                <p>{copy('emptyBody')}</p>
              </div>
            )}
          </div>

        </section>

        <aside
          className="notification-settings"
          aria-labelledby="notification-settings-heading"
        >
          <header>
            <div>
              <h2 id="notification-settings-heading">
                {copy('settingsTitle')}
              </h2>
              <p>{copy('settingsBody')}</p>
            </div>
            <BellRing aria-hidden="true" />
          </header>

          {preferences.isLoading ? (
            <div className="notification-settings__loading">
              <Skeleton label={copy('loadingSettings')} lines={6} />
            </div>
          ) : preferences.isError || !preferences.data ? (
            <div className="notification-settings__error">
              <p role="alert">
                <CircleAlert aria-hidden="true" />
                <span>{copy('settingsError')}</span>
              </p>
              <Button
                variant="secondary"
                onClick={() => void preferences.refetch()}
              >
                <RotateCw aria-hidden="true" />
                {copy('retry')}
              </Button>
            </div>
          ) : (
            <div
              className="notification-settings__list"
              aria-busy={update.isPending}
            >
              {preferenceKeys.map((key) => {
                const preference = preferenceCopy[key];
                return (
                  <label key={key} className="notification-setting">
                    <span className="notification-setting__copy">
                      <strong>{copy(preference.label)}</strong>
                      <small>{copy(preference.detail)}</small>
                    </span>
                    <span className="notification-switch">
                      <input
                        type="checkbox"
                        checked={preferences.data[key]}
                        disabled={update.isPending}
                        onChange={(event) =>
                          update.mutate({
                            ...preferences.data,
                            [key]: event.target.checked,
                          })
                        }
                      />
                      <span aria-hidden="true" />
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          {update.isError ? (
            <p className="notification-settings__notice" role="alert">
              <CircleAlert aria-hidden="true" />
              <span>{copy('saveError')}</span>
            </p>
          ) : null}

          <div className="push-actions">
            <p>{copy('browserPush')}</p>
            <div>
              <Button
                variant="secondary"
                disabled={push.isPending}
                loading={push.isPending && push.variables === true}
                onClick={() => push.mutate(true)}
              >
                <BellRing aria-hidden="true" />
                {copy('enablePush')}
              </Button>
              <Button
                variant="ghost"
                disabled={push.isPending}
                loading={push.isPending && push.variables === false}
                onClick={() => push.mutate(false)}
              >
                <BellOff aria-hidden="true" />
                {copy('disablePush')}
              </Button>
            </div>
            {push.isError ? (
              <p role="alert">
                <CircleAlert aria-hidden="true" />
                <span>{copy('pushError')}</span>
              </p>
            ) : null}
          </div>
        </aside>
      </div>
    </section>
  );
}
