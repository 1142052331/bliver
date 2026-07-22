import { IconButton } from '@bliver/ui';
import {
  ArrowRight,
  Globe2,
  Layers3,
  LockKeyhole,
  MapPin,
  Maximize2,
  UsersRound,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { useTranslation } from 'react-i18next';

import { MomentFrame } from '../../components/moment/MomentFrame.js';
import { FootprintMoodMark } from '../../components/moment/FootprintMoodMark.js';
import {
  footprintMoodCssVariables,
  resolveFootprintMood,
} from '../../platform/footprint-mood.js';
import {
  gsap,
  motionTokens,
  prefersReducedMotion,
  useGSAP,
  withMotionPreferences,
} from '../../platform/motion/gsap.js';
import type { ChronoLensItem, ChronoLensPoint } from './ChronoLens.js';

import './moment-deck.css';

export interface MomentDeckProps {
  readonly items: readonly ChronoLensItem[];
  readonly anchor?: ChronoLensPoint;
  readonly onOpen: (item: ChronoLensItem) => void;
  readonly onClose: () => void;
  readonly onExpandMap?: () => void;
}

interface MomentDeckCardProps {
  readonly item: ChronoLensItem;
  readonly index: number;
  readonly total: number;
  readonly locale: string;
  readonly onOpen: (item: ChronoLensItem) => void;
}

function formatCardDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatCoordinates(item: ChronoLensItem): string {
  return `${item.displayPoint.lat.toFixed(3)}, ${item.displayPoint.lng.toFixed(3)}`;
}

function visibilityCopy(
  item: ChronoLensItem,
  translate: (key: string) => string,
): string {
  if (item.visibility === 'public') return translate('map.public');
  if (item.visibility === 'friends') return translate('map.friendsOnly');
  return translate('map.onlyYou');
}

function MomentDeckCard({
  item,
  index,
  total,
  locale,
  onOpen,
}: MomentDeckCardProps) {
  const { t } = useTranslation();
  const VisibilityIcon = item.visibility === 'public'
    ? Globe2
    : item.visibility === 'friends'
      ? UsersRound
      : LockKeyhole;
  const date = formatCardDate(item.publishedAt, locale);
  const cardLabel = `${t('map.openFootprint')}: ${t('map.footprintBy', {
    name: item.author.name,
  })}`;
  const spatialLabel = `${t('map.preview')} ${t('map.footprintBy', {
    name: item.author.name,
  })}`;
  const moodTone = resolveFootprintMood(item.mood);

  return (
    <li
      className="moment-deck__card"
      data-moment-deck-card="true"
      data-footprint-id={item.id}
      data-has-media={item.primaryMedia ? 'true' : 'false'}
      data-mood-key={moodTone?.key}
      style={moodTone ? footprintMoodCssVariables(moodTone) : undefined}
    >
      <button
        className="moment-deck__card-button"
        type="button"
        aria-label={cardLabel}
        onClick={() => onOpen(item)}
      >
        <span className="moment-deck__visual" data-moment-anchor="deck-card">
          <MomentFrame
            authorName={item.author.name}
            className="moment-deck__frame"
            displayPoint={item.displayPoint}
            fetchPriority={index === 0 ? 'high' : 'low'}
            loading={index === 0 ? 'eager' : 'lazy'}
            locale={locale}
            media={item.primaryMedia}
            mediaAlt=""
            mood={item.mood}
            showCoordinates={false}
            showTelemetry={false}
            spatialLabel={spatialLabel}
            variant="stage"
          />
          <FootprintMoodMark
            className="moment-deck__mood"
            mood={item.mood}
            variant="icon"
          />
        </span>
        <span className="moment-deck__card-copy">
          <span className="moment-deck__card-header">
            <span className="moment-deck__identity">
              <strong>{item.author.name}</strong>
              {date ? <time dateTime={item.publishedAt}>{date}</time> : null}
            </span>
            <span className="moment-deck__sequence">{index + 1} / {total}</span>
          </span>
          <span className="moment-deck__message">
            {item.message?.trim() || t('map.momentWithoutMessage')}
          </span>
          <span className="moment-deck__card-facts">
            <span className="moment-deck__place" title={formatCoordinates(item)}>
              <MapPin aria-hidden="true" />
              <span>{formatCoordinates(item)}</span>
            </span>
            <span className="moment-deck__visibility" title={visibilityCopy(item, t)}>
              <VisibilityIcon aria-hidden="true" />
              <span>{visibilityCopy(item, t)}</span>
            </span>
            <ArrowRight className="moment-deck__arrow" aria-hidden="true" />
          </span>
        </span>
      </button>
    </li>
  );
}

function MomentDeckContent({
  items,
  anchor,
  onOpen,
  onClose,
  onExpandMap,
}: MomentDeckProps) {
  const { i18n, t } = useTranslation();
  const rootRef = useRef<HTMLElement>(null);
  const closingRef = useRef(false);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const itemKey = useMemo(() => items.map((item) => item.id).join('|'), [items]);
  const reducedAtRender = prefersReducedMotion();
  const anchorX = anchor?.x ?? null;
  const anchorY = anchor?.y ?? null;

  const { contextSafe } = useGSAP(() => {
    const root = rootRef.current;
    if (!root) return;
    const cards = Array.from(
      root.querySelectorAll<HTMLElement>('[data-moment-deck-card="true"]'),
    );
    const targets: HTMLElement[] = [root, ...cards];

    return withMotionPreferences(root, ({ reducedMotion }) => {
      gsap.killTweensOf(targets);

      if (anchor) {
        const bounds = root.getBoundingClientRect();
        const originX = Math.max(0, anchor.x - bounds.left);
        const originY = Math.max(0, anchor.y - bounds.top);
        gsap.set(root, { transformOrigin: `${originX}px ${originY}px` });
      } else {
        gsap.set(root, { transformOrigin: '50% 100%' });
      }

      if (reducedMotion) {
        gsap.set(targets, {
          clearProps: 'transform,opacity,visibility,clipPath,willChange',
        });
        return;
      }

      gsap.set(targets, { willChange: 'transform,opacity' });
      const timeline = gsap.timeline({ defaults: { overwrite: 'auto' } });
      timeline.fromTo(root, { autoAlpha: 0.01, y: 16 }, {
        autoAlpha: 1,
        y: 0,
        duration: motionTokens.duration.state,
        ease: motionTokens.ease.quiet,
        clearProps: 'transform,opacity,visibility',
      });
      if (cards.length) {
        timeline.fromTo(cards.slice(0, 4), {
          autoAlpha: 0.01,
          y: 10,
          clipPath: 'inset(0 0 12% round 8px)',
        }, {
          autoAlpha: 1,
          y: 0,
          clipPath: 'inset(0 0 0% round 8px)',
          duration: motionTokens.duration.state,
          ease: motionTokens.ease.quiet,
          stagger: 0.035,
          clearProps: 'transform,opacity,visibility,clipPath',
        }, 0.035);
      }
      timeline.set(targets, { clearProps: 'willChange' });
      return () => timeline.kill();
    });
  }, {
    dependencies: [anchorX, anchorY, itemKey],
    revertOnUpdate: true,
    scope: rootRef,
  });

  const finishAfterExit = useCallback((callback: () => void): void => {
    contextSafe(() => {
      if (closingRef.current) return;
      closingRef.current = true;
      const root = rootRef.current;
      if (!root || prefersReducedMotion()) {
        callback();
        return;
      }
      gsap.killTweensOf(root);
      gsap.to(root, {
        autoAlpha: 0,
        y: 16,
        duration: 0.2,
        ease: 'power3.in',
        overwrite: true,
        onComplete: callback,
      });
    })();
  }, [contextSafe]);

  const close = useCallback((): void => {
    finishAfterExit(onClose);
  }, [finishAfterExit, onClose]);

  const open = useCallback((item: ChronoLensItem): void => {
    finishAfterExit(() => onOpen(item));
  }, [finishAfterExit, onOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close]);

  return (
    <aside
      ref={rootRef}
      aria-label={t('map.nearbyFootprints')}
      className="moment-deck"
      data-anchor={anchor ? 'marker' : 'tray'}
      data-motion-preference={reducedAtRender ? 'reduced' : 'full'}
      data-testid="moment-deck"
    >
      <div className="moment-deck__toolbar">
        <span className="moment-deck__heading">
          <Layers3 aria-hidden="true" />
          <strong>{t('map.footprintCount', { count: items.length })}</strong>
        </span>
        <span className="moment-deck__actions">
          {onExpandMap ? (
            <IconButton
              className="moment-deck__tool"
              label={t('map.zoomIn')}
              onClick={onExpandMap}
            >
              <Maximize2 aria-hidden="true" />
            </IconButton>
          ) : null}
          <IconButton
            className="moment-deck__tool"
            label={t('map.closePreview')}
            onClick={close}
          >
            <X aria-hidden="true" />
          </IconButton>
        </span>
      </div>
      <div
        aria-label={t('map.nearbyFootprints')}
        className="moment-deck__viewport"
        role="region"
        tabIndex={0}
      >
        <ol className="moment-deck__track" role="list">
          {items.map((item, index) => (
            <MomentDeckCard
              key={item.id}
              item={item}
              index={index}
              locale={locale}
              onOpen={open}
              total={items.length}
            />
          ))}
        </ol>
      </div>
    </aside>
  );
}

export function MomentDeck(props: MomentDeckProps) {
  if (!props.items.length) return null;
  return <MomentDeckContent {...props} />;
}
