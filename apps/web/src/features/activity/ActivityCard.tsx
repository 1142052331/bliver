import type { FootprintDto } from '@bliver/contracts';
import { Button, Surface } from '@bliver/ui';
import { Flag, Heart, LockKeyhole, MapPinned, MessageCircle, UsersRound } from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { runSpatialTransition, shouldAnimateSpatialClick } from '../../platform/motion/spatial-navigation.js';
import { FootprintMoodMark } from '../../components/moment/FootprintMoodMark.js';
import { addReaction as defaultAddReaction, removeReaction as defaultRemoveReaction, reportFootprint as defaultReport } from './api.js';
import { ActivityScene } from './ActivityScene.js';
import { ConversationSection } from './ConversationSection.js';

export interface ActivityCardProps {
  readonly item: FootprintDto;
  readonly index?: number;
  readonly total?: number;
  readonly active?: boolean;
  readonly presentation?: 'card' | 'stage';
  readonly onActivate?: () => void;
  readonly onSwipe?: (direction: -1 | 1) => void;
  readonly onAuthRequired?: (action: Record<string, string>) => void;
  readonly addReaction?: (id: string, emoji: string) => Promise<unknown>;
  readonly removeReaction?: (id: string) => Promise<void>;
  readonly report?: (id: string, reason: 'spam') => Promise<unknown>;
}

function VisibilityIcon({ visibility }: { readonly visibility: FootprintDto['visibility'] }) {
  if (visibility === 'private') return <LockKeyhole aria-hidden="true" />;
  return <UsersRound aria-hidden="true" />;
}

function formatActivityDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function ActivityCard({
  item,
  index = 1,
  total = 1,
  active = false,
  presentation = 'card',
  onActivate,
  onSwipe,
  onAuthRequired,
  addReaction = defaultAddReaction,
  removeReaction = defaultRemoveReaction,
  report = defaultReport,
}: ActivityCardProps) {
  const { i18n, t } = useTranslation();
  const navigate = useNavigate();
  const [reaction, setReaction] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState<'signInToReact' | 'reactionFailed' | 'reportReceived' | 'signInToReport' | 'reportFailed' | null>(null);
  const discussionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expanded) return;
    const discussion = discussionRef.current;
    if (!discussion || typeof window === 'undefined') return;
    const adjustScroll = (): void => {
      const card = discussion.closest<HTMLElement>('.activity-card--stage') ?? discussion;
      const header = document.querySelector<HTMLElement>('.app-shell__header');
      const safeTop = (header?.getBoundingClientRect().height ?? 0) + 12;
      const delta = card.getBoundingClientRect().top - safeTop;
      const reducedMotion = typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (delta >= 0) return;
      if (reducedMotion) {
        const nextScroll = Math.max(0, window.scrollY + delta);
        document.documentElement.scrollTop = nextScroll;
        document.body.scrollTop = nextScroll;
        return;
      }
      if (typeof window.scrollBy !== 'function') return;
      window.scrollBy({ top: delta, behavior: 'smooth' });
    };
    const timer = window.setTimeout(adjustScroll, 0);
    return () => window.clearTimeout(timer);
  }, [expanded]);

  const react = async (emoji: string): Promise<void> => {
    const prior = reaction;
    setNotice(null);
    setReaction(prior === emoji ? null : emoji);
    try {
      if (prior === emoji) await removeReaction(item.id);
      else await addReaction(item.id, emoji);
    } catch (cause) {
      setReaction(prior);
      if (cause instanceof Error && cause.message === 'AUTH_REQUIRED') {
        onAuthRequired?.({ kind: 'reaction', footprintId: item.id, emoji });
        setNotice('signInToReact');
      } else {
        setNotice('reactionFailed');
      }
    }
  };

  const submitReport = async (): Promise<void> => {
    setNotice(null);
    try {
      await report(item.id, 'spam');
      setNotice('reportReceived');
    } catch (cause) {
      if (cause instanceof Error && cause.message === 'AUTH_REQUIRED') {
        onAuthRequired?.({ kind: 'report', footprintId: item.id, reason: 'spam' });
        setNotice('signInToReport');
      } else {
        setNotice('reportFailed');
      }
    }
  };

  const visibilityLabel = t(item.visibility === 'public' ? 'activity.public' : item.visibility === 'friends' ? 'activity.friends' : 'activity.onlyYou');
  const point = `${item.displayPoint.lat.toFixed(3)}, ${item.displayPoint.lng.toFixed(3)}`;
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const mapHref = `/map?lat=${item.displayPoint.lat}&lng=${item.displayPoint.lng}&footprint=${item.id}&sheet=preview`;
  const openMap = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (!shouldAnimateSpatialClick(event)) return;
    event.preventDefault();
    const source = event.currentTarget
      .closest<HTMLElement>('.activity-card')
      ?.querySelector<HTMLElement>('.activity-scene') ?? null;
    runSpatialTransition({
      kind: 'to-map',
      navigate: () => navigate(mapHref),
      source,
    });
  };

  return (
    <Surface
      className={`activity-card activity-card--${presentation}${active ? ' is-active' : ''}`}
      data-activity-index={String(index).padStart(2, '0')}
      data-sequence-item={item.id}
      onFocusCapture={onActivate}
      onPointerDown={onActivate}
    >
      {presentation === 'stage' ? <ActivityScene active={active} index={index} item={item} total={total} {...(onSwipe ? { onSwipe } : {})} /> : null}
      <div className="activity-card__content" data-cinematic-rail="true">
        <header className="activity-card__header">
          <div className="activity-card__identity">
            {presentation === 'stage' ? (
              <span className="activity-card__sequence-mark" aria-hidden="true">{String(index).padStart(2, '0')}</span>
            ) : (
              <span className="activity-card__avatar" aria-hidden="true">{item.author.name.trim().charAt(0).toLocaleUpperCase() || '?'}</span>
            )}
            <div><strong>{item.author.name}</strong><time dateTime={item.publishedAt}>{formatActivityDate(item.publishedAt, locale)}</time></div>
          </div>
          <span className="activity-card__meta-actions">
            <FootprintMoodMark mood={item.mood} />
            <span className="activity-card__visibility"><VisibilityIcon visibility={item.visibility} />{visibilityLabel}</span>
          </span>
        </header>
        <Link className="activity-card__place" onClick={openMap} to={mapHref}>
          <MapPinned aria-hidden="true" />
          <span><strong>{t(item.locationPrecision === 'precise' ? 'activity.exactPlace' : 'activity.nearbyArea')}</strong><small>{point}</small></span>
        </Link>
        <p className="activity-card__message">{item.message ?? t('activity.sharedMoment')}</p>
        <div className="activity-card__tools" aria-label={t('activity.momentActions')}>
          <Button variant={reaction === 'heart' ? 'primary' : 'ghost'} aria-label={t('activity.reactWithHeart')} aria-pressed={reaction === 'heart'} onClick={() => void react('heart')}><Heart aria-hidden="true" fill={reaction === 'heart' ? 'currentColor' : 'none'} />{t('activity.heart')}</Button>
          <Button variant="ghost" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}><MessageCircle aria-hidden="true" />{t('activity.comment')}</Button>
          <Button className={presentation === 'stage' ? 'activity-card__safety' : undefined} variant="ghost" aria-label={t('activity.report')} onClick={() => void submitReport()}><Flag aria-hidden="true" />{t('activity.report')}</Button>
        </div>
        {notice ? <p className={`activity-card__notice${notice === 'reportReceived' ? ' activity-card__notice--success' : ''}`} role="status">{t(`activity.${notice}`)}{notice === 'signInToReact' || notice === 'signInToReport' ? <> <Link to="/login">{t('activity.signIn')}</Link></> : null}</p> : null}
      </div>
      {expanded ? <div ref={discussionRef} className="activity-card__discussion"><ConversationSection footprintId={item.id} {...(onAuthRequired ? { onAuthRequired } : {})} /></div> : null}
    </Surface>
  );
}
