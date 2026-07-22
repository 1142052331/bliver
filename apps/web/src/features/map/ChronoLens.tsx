import type { FootprintMediaPreview } from '@bliver/contracts';
import { IconButton } from '@bliver/ui';
import {
  ArrowUpRight,
  Crosshair,
  Globe2,
  LockKeyhole,
  UsersRound,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { MomentFrame } from '../../components/moment/MomentFrame.js';
import { FootprintMoodMark } from '../../components/moment/FootprintMoodMark.js';
import {
  gsap,
  motionTokens,
  prefersReducedMotion,
  useGSAP,
  withMotionPreferences,
} from '../../platform/motion/gsap.js';
import {
  footprintMoodCssVariables,
  resolveFootprintMood,
} from '../../platform/footprint-mood.js';
import { runSpatialTransition, shouldAnimateSpatialClick } from '../../platform/motion/spatial-navigation.js';

import './moment-ticket.css';

export interface ChronoLensPoint {
  readonly x: number;
  readonly y: number;
}

export interface ChronoLensItem {
  readonly id: string;
  readonly author: { readonly name: string };
  readonly displayPoint: { readonly lat: number; readonly lng: number };
  readonly visibility: 'public' | 'friends' | 'private';
  readonly locationPrecision: 'precise' | 'approximate';
  readonly publishedAt: string;
  readonly message?: string;
  readonly mood?: string | null;
  readonly primaryMedia?: FootprintMediaPreview;
}

interface ChronoLensProps {
  readonly item: ChronoLensItem;
  readonly mode: 'ambient' | 'explicit';
  readonly anchor?: ChronoLensPoint;
  readonly onClose?: () => void;
}

function dateParts(locale: string, value: string): {
  readonly day: string;
  readonly month: string;
  readonly full: string;
} {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { day: '--', month: '', full: '' };
  }

  const dayFormatter = new Intl.DateTimeFormat(locale, { day: '2-digit' });
  const monthFormatter = new Intl.DateTimeFormat(locale, { month: 'short' });

  return {
    day: dayFormatter.formatToParts(date).find((part) => part.type === 'day')?.value
      ?? dayFormatter.format(date),
    month: monthFormatter.format(date),
    full: new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date),
  };
}

export function ChronoLens({ item, mode, anchor, onClose }: ChronoLensProps) {
  const { i18n, t } = useTranslation();
  const navigate = useNavigate();
  const lensRef = useRef<HTMLElement>(null);
  const apertureRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  const closeAnimationRef = useRef<{ kill: () => void } | null>(null);
  const onCloseRef = useRef(onClose);
  const enteredItemRef = useRef<string | undefined>(undefined);
  const anchorRef = useRef<ChronoLensPoint | undefined>(anchor);
  const [failedMediaUrl, setFailedMediaUrl] = useState<string | null>(null);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const formattedDate = useMemo(
    () => dateParts(locale, item.publishedAt),
    [item.publishedAt, locale],
  );
  const visibilityLabel = item.visibility === 'public'
    ? t('map.public')
    : item.visibility === 'friends'
      ? t('map.friendsOnly')
      : t('map.onlyYou');
  const precisionLabel = item.locationPrecision === 'precise'
    ? t('map.preciseLocation')
    : t('map.approximateLocation');
  const VisibilityIcon = item.visibility === 'public'
    ? Globe2
    : item.visibility === 'friends'
      ? UsersRound
      : LockKeyhole;
  const primaryMedia = item.primaryMedia;
  const moodTone = resolveFootprintMood(item.mood);
  const frameMode: 'media' | 'spatial' = primaryMedia && primaryMedia.url !== failedMediaUrl ? 'media' : 'spatial';
  const canClose = Boolean(onClose);
  const hasAnchor = Boolean(anchor);

  useGSAP(() => {
    const lens = lensRef.current;
    const aperture = apertureRef.current;
    const content = contentRef.current;
    if (!lens || !aperture || !content) return;
    return withMotionPreferences(lens, ({ reducedMotion }) => {
      // Closing owns these elements until it has committed the map state.
      // Anchor updates must not replace that timeline with another entrance.
      if (closingRef.current) return;
      gsap.killTweensOf([lens, aperture, content]);

      if (reducedMotion) {
        if (mode !== 'explicit' || !anchor) enteredItemRef.current = undefined;
        else enteredItemRef.current = item.id;
        gsap.set([lens, aperture, content], {
          clearProps: 'transform,opacity,visibility,clipPath,willChange',
        });
        return;
      }

      const timeline = gsap.timeline({ defaults: { overwrite: 'auto' } });
      if (mode !== 'explicit' || !anchor) {
        enteredItemRef.current = undefined;
        timeline.fromTo(lens, { opacity: 0.01, y: 16 }, {
          opacity: 1,
          y: 0,
          duration: motionTokens.duration.state,
          ease: motionTokens.ease.quiet,
          clearProps: 'transform,opacity',
        }).fromTo(content, { opacity: 0.01, y: 8 }, {
          opacity: 1,
          y: 0,
          duration: motionTokens.duration.micro,
          ease: motionTokens.ease.quiet,
          clearProps: 'transform,opacity',
        }, '<0.06');
        return () => timeline.kill();
      }

      // Anchor coordinates can change while the map is panned. The preview is
      // already open in that case, so keep its final geometry and let close()
      // consume the latest ref instead of replaying the entrance.
      if (enteredItemRef.current === item.id) {
        gsap.set([lens, aperture, content], {
          clearProps: 'transform,opacity,visibility,clipPath,willChange',
        });
        return () => timeline.kill();
      }
      enteredItemRef.current = item.id;

      const bounds = aperture.getBoundingClientRect();
      const deltaX = anchor.x - (bounds.left + bounds.width / 2);
      const deltaY = anchor.y - (bounds.top + bounds.height / 2);
      const pointScale = gsap.utils.clamp(
        bounds.width > 120 ? 0.1 : 0.28,
        1,
        46 / Math.max(bounds.width, 1),
      );

      gsap.set(lens, { willChange: 'transform, opacity' });
      gsap.set(aperture, { willChange: 'transform, opacity, clip-path' });
      gsap.set(content, { willChange: 'transform, opacity' });
      timeline
        .addLabel('anchor', 0)
        .fromTo(lens, { opacity: 0.01, y: 16 }, {
          opacity: 1,
          y: 0,
          duration: motionTokens.duration.state,
          ease: motionTokens.ease.quiet,
          clearProps: 'transform,opacity',
        }, 'anchor')
        .fromTo(aperture, {
          x: deltaX,
          y: deltaY,
          scale: pointScale,
          clipPath: 'inset(38% round 50%)',
          autoAlpha: 0.72,
          transformOrigin: 'center center',
        }, {
          x: 0,
          y: 0,
          scale: 1,
          clipPath: 'inset(0% round 0%)',
          autoAlpha: 1,
          duration: motionTokens.duration.sharedElement,
          ease: motionTokens.ease.shared,
          clearProps: 'transform,clipPath,opacity,visibility',
        }, 'anchor')
        .fromTo(content, { opacity: 0.01, y: 12 }, {
          opacity: 1,
          y: 0,
          duration: motionTokens.duration.state,
          ease: motionTokens.ease.quiet,
          clearProps: 'transform,opacity',
        }, 'anchor+=0.18')
        .set([lens, aperture, content], { clearProps: 'willChange' });
      return () => timeline.kill();
    });
  }, {
    dependencies: [hasAnchor, item.id, mode],
    // A projected anchor can arrive during exit. Defer context reversion so
    // entrance styles cannot overwrite the close timeline.
    revertOnUpdate: false,
    scope: lensRef,
  });

  useLayoutEffect(() => {
    anchorRef.current = anchor;
  }, [anchor]);

  // Keep close state ready before the browser can deliver an input event.
  // A passive effect here can race the first Escape after the preview mounts.
  useLayoutEffect(() => {
    closingRef.current = false;
    closeAnimationRef.current?.kill();
    closeAnimationRef.current = null;
    if (mode !== 'explicit') enteredItemRef.current = undefined;
  }, [item.id, mode]);

  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => () => {
    closingRef.current = false;
    closeAnimationRef.current?.kill();
    closeAnimationRef.current = null;
  }, []);

  const close = useCallback((): void => {
    if (!onCloseRef.current || closingRef.current) return;
    const lens = lensRef.current;
    const aperture = apertureRef.current;
    const content = contentRef.current;
    if (!lens || !aperture || !content || prefersReducedMotion()) {
      onCloseRef.current?.();
      return;
    }

    closingRef.current = true;
    const finishClose = (): void => {
      if (!closingRef.current) return;
      closingRef.current = false;
      closeAnimationRef.current = null;
      onCloseRef.current?.();
    };
    closeAnimationRef.current?.kill();
    gsap.killTweensOf([lens, aperture, content]);
    const currentAnchor = anchorRef.current;
    if (!currentAnchor) {
      closeAnimationRef.current = gsap.to(lens, {
        autoAlpha: 0,
        y: 16,
        duration: motionTokens.duration.state,
        ease: 'power3.in',
        overwrite: true,
        onComplete: finishClose,
        onInterrupt: finishClose,
      });
      return;
    }

    const bounds = aperture.getBoundingClientRect();
    const deltaX = currentAnchor.x - (bounds.left + bounds.width / 2);
    const deltaY = currentAnchor.y - (bounds.top + bounds.height / 2);
    const pointScale = gsap.utils.clamp(
      bounds.width > 120 ? 0.1 : 0.28,
      1,
      46 / Math.max(bounds.width, 1),
    );
    gsap.set([lens, aperture, content], { willChange: 'transform, opacity' });
    const timeline = gsap.timeline({
      defaults: { overwrite: true },
      onComplete: finishClose,
      onInterrupt: finishClose,
    });
    closeAnimationRef.current = timeline;
    timeline
      .to(content, {
        autoAlpha: 0,
        y: 8,
        duration: motionTokens.duration.micro,
        ease: 'power2.in',
      }, 0)
      .to(aperture, {
        x: deltaX,
        y: deltaY,
        scale: pointScale,
        clipPath: 'inset(38% round 50%)',
        autoAlpha: 0,
        duration: 0.36,
        ease: 'power3.in',
      }, 0)
      .to(lens, {
        autoAlpha: 0,
        y: 10,
        duration: motionTokens.duration.state,
        ease: 'power2.in',
      }, 0.14);
  }, []);

  const openDetail = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (!shouldAnimateSpatialClick(event)) return;
    event.preventDefault();
    runSpatialTransition({
      kind: 'to-detail',
      navigate: () => navigate(`/footprints/${item.id}`),
      source: apertureRef.current,
    });
  };

  useLayoutEffect(() => {
    if (mode !== 'explicit' || !canClose) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canClose, close, mode]);

  return (
    <aside
      ref={lensRef}
      aria-label={t('map.preview')}
      className={`map-route__preview chrono-lens chrono-lens--ticket chrono-lens--${mode} chrono-lens--${frameMode}`}
      data-frame-mode={frameMode}
      data-mode={mode}
      data-mood-key={moodTone?.key}
      data-testid="chrono-lens"
      style={moodTone ? footprintMoodCssVariables(moodTone) : undefined}
    >
      <div
        ref={apertureRef}
        className={`chrono-lens__aperture${frameMode === 'media' ? ' has-media' : ''}`}
        data-moment-anchor="preview"
        aria-hidden="true"
      >
        <MomentFrame
          authorName={item.author.name}
          className="chrono-lens__moment"
          displayPoint={item.displayPoint}
          fetchPriority="high"
          loading="lazy"
          loadingLabel={t('map.loading')}
          locale={locale}
          media={primaryMedia}
          mediaAlt=""
          mood={item.mood}
          onMediaStateChange={(state) => {
            if (state === 'error' && primaryMedia) setFailedMediaUrl(primaryMedia.url);
            if (state === 'loaded') setFailedMediaUrl(null);
          }}
          precisionLabel={precisionLabel}
          publishedAt={item.publishedAt}
          showCoordinates={false}
          showTelemetry={false}
          spatialLabel={t('map.preview')}
          variant="lens"
          visibilityLabel={visibilityLabel}
        />
      </div>
      <div ref={contentRef} className="chrono-lens__content" data-caption-rail="true">
        <div className="chrono-lens__story">
          <header className="chrono-lens__header">
            <span className="chrono-lens__identity">
              <strong>{item.author.name}</strong>
              {formattedDate.full ? <time dateTime={item.publishedAt}>{formattedDate.full}</time> : null}
            </span>
            {mode === 'explicit' && onClose ? (
              <IconButton
                className="chrono-lens__close"
                label={t('map.closePreview')}
                onClick={close}
              >
                <X aria-hidden="true" />
              </IconButton>
            ) : null}
          </header>
          <p className="chrono-lens__message">
            {item.message?.trim() || t('map.momentWithoutMessage')}
          </p>
        </div>
        <div className="chrono-lens__footer">
          <ul className="chrono-lens__facts" aria-label={t('map.momentDetails')}>
            <li><VisibilityIcon aria-hidden="true" />{visibilityLabel}</li>
            <li><Crosshair aria-hidden="true" />{precisionLabel}</li>
            {moodTone ? <li className="chrono-lens__mood-fact"><FootprintMoodMark mood={moodTone.key} /></li> : null}
          </ul>
          <Link className="chrono-lens__open" onClick={openDetail} to={`/footprints/${item.id}`}>
            <span>{t('map.openFootprint')}</span>
            <ArrowUpRight aria-hidden="true" />
          </Link>
        </div>
      </div>
    </aside>
  );
}
