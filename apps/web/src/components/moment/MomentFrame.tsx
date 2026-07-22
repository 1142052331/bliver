import type { FootprintMediaPreview } from '@bliver/contracts';
import { Compass, ImageOff, MapPin, RefreshCw } from 'lucide-react';
import {
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

import {
  footprintMoodCssVariables,
  resolveFootprintMood,
} from '../../platform/footprint-mood.js';

import './moment-frame.css';

export interface MomentPoint {
  readonly lat: number;
  readonly lng: number;
}

export type MomentFrameVariant = 'stage' | 'lens' | 'detail';
export type MomentMediaState = 'loading' | 'loaded' | 'error' | 'fallback';

export interface MomentFrameProps {
  readonly variant: MomentFrameVariant;
  readonly media?: FootprintMediaPreview | undefined;
  readonly authorName: string;
  readonly publishedAt?: string | undefined;
  readonly displayPoint?: MomentPoint | undefined;
  readonly visibilityLabel?: string;
  readonly precisionLabel?: string;
  readonly locale?: string;
  readonly mediaAlt: string;
  readonly spatialLabel: string;
  readonly noMediaLabel?: string;
  readonly mediaUnavailableTitle?: string;
  readonly mediaUnavailableLabel?: string;
  readonly retryMediaLabel?: string;
  readonly loadingLabel?: string;
  readonly loading?: 'lazy' | 'eager';
  readonly fetchPriority?: 'high' | 'low' | 'auto';
  readonly className?: string;
  readonly children?: ReactNode;
  readonly resetKey?: string | number;
  readonly showRetryOnError?: boolean;
  readonly showTelemetry?: boolean;
  readonly showCoordinates?: boolean;
  readonly revealOnLoad?: boolean;
  readonly mood?: string | null | undefined;
  readonly onMediaStateChange?: (state: MomentMediaState) => void;
}

interface MomentDateParts {
  readonly day: string;
  readonly month: string;
  readonly time: string;
}

function dateParts(value: string | undefined, locale: string): MomentDateParts {
  if (!value) return { day: '--', month: '', time: '' };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { day: '--', month: '', time: '' };

  return {
    day: new Intl.DateTimeFormat(locale, { day: '2-digit' }).format(date),
    month: new Intl.DateTimeFormat(locale, { month: 'short' }).format(date),
    time: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date),
  };
}

function pointPosition(point: MomentPoint | undefined): CSSProperties {
  const lat = point?.lat ?? 0;
  const lng = point?.lng ?? 0;
  const x = Math.min(88, Math.max(12, 12 + ((lng + 180) / 360) * 76));
  const y = Math.min(88, Math.max(12, 12 + ((90 - lat) / 180) * 76));
  return {
    '--moment-x': `${x}%`,
    '--moment-y': `${y}%`,
    '--activity-scene-x': `${x}%`,
    '--activity-scene-y': `${y}%`,
  } as CSSProperties;
}

function coordinateText(point: MomentPoint | undefined): string {
  if (!point) return '—';
  return `${point.lat.toFixed(3)} / ${point.lng.toFixed(3)}`;
}

/**
 * Cloudinary keeps the original URL as the canonical source while adding
 * delivery transforms for the responsive candidates. Non-Cloudinary media
 * intentionally stays untouched so signed or local URLs remain valid.
 */
function cloudinarySrcSet(url: string, width: number): string | undefined {
  if (!url.includes('res.cloudinary.com') || !url.includes('/image/upload/')) return undefined;
  const candidates = [320, 480, 640, 960, 1280, 1600].filter((candidate) => candidate < width);
  candidates.push(width);
  return candidates
    .map((candidate) => `${url.replace('/image/upload/', `/image/upload/f_auto,q_auto:eco,c_limit,w_${candidate}/`)} ${candidate}w`)
    .join(', ');
}

export function MomentFrame({
  variant,
  media,
  authorName,
  publishedAt,
  displayPoint,
  visibilityLabel,
  precisionLabel,
  locale = 'en',
  mediaAlt,
  spatialLabel,
  noMediaLabel,
  mediaUnavailableTitle,
  mediaUnavailableLabel,
  retryMediaLabel,
  loadingLabel,
  loading = 'lazy',
  fetchPriority = 'auto',
  className,
  children,
  resetKey,
  showRetryOnError = false,
  showTelemetry = true,
  showCoordinates = true,
  revealOnLoad = false,
  mood,
  onMediaStateChange,
}: MomentFrameProps) {
  const mediaKey = media ? `${media.url}:${String(resetKey ?? '')}` : '';
  const [failedMediaKey, setFailedMediaKey] = useState<string | null>(null);
  const [loadedMediaKey, setLoadedMediaKey] = useState<string | null>(null);
  const usableMedia = media && mediaKey !== failedMediaKey ? media : undefined;
  const date = useMemo(() => dateParts(publishedAt, locale), [locale, publishedAt]);
  const srcSet = usableMedia ? cloudinarySrcSet(usableMedia.url, usableMedia.width) : undefined;
  const moodTone = resolveFootprintMood(mood);
  const rootClassName = [
    'moment-frame',
    `moment-frame--${variant}`,
    usableMedia ? 'moment-frame--media' : 'moment-frame--spatial',
    failedMediaKey === mediaKey && mediaKey ? 'moment-frame--media-error' : '',
    className ?? '',
  ].filter(Boolean).join(' ');

  const markLoaded = (): void => {
    if (!usableMedia) return;
    setLoadedMediaKey(mediaKey);
    onMediaStateChange?.('loaded');
  };

  const markFailed = (): void => {
    if (!usableMedia) return;
    setLoadedMediaKey(null);
    setFailedMediaKey(mediaKey);
    onMediaStateChange?.('error');
  };

  const retry = (): void => {
    setFailedMediaKey(null);
    setLoadedMediaKey(null);
    onMediaStateChange?.('loading');
  };

  const axisClassName = (axis: 'horizontal' | 'vertical'): string => [
    'moment-frame__axis',
    `moment-frame__axis--${axis}`,
  ].filter(Boolean).join(' ');

  return (
    <div
      className={rootClassName}
      data-mood-key={moodTone?.key}
      data-moment-frame="true"
      data-moment-variant={variant}
      style={{
        '--moment-ratio': variant === 'lens' ? '1 / 1' : variant === 'detail' ? '4 / 3' : '16 / 10',
        ...(moodTone ? footprintMoodCssVariables(moodTone) : {}),
      } as CSSProperties}
    >
      {usableMedia ? (
        <img
          className="moment-frame__media"
          alt={mediaAlt}
          decoding="async"
          fetchPriority={fetchPriority}
          height={usableMedia.height}
          loading={loading}
          onError={markFailed}
          onLoad={markLoaded}
          src={usableMedia.url}
          {...(srcSet ? { srcSet, sizes: variant === 'stage' ? '(max-width: 720px) 100vw, 65vw' : '(max-width: 720px) 100vw, 50vw' } : {})}
          style={revealOnLoad ? { opacity: loadedMediaKey === mediaKey ? 1 : 0 } : undefined}
          width={usableMedia.width}
        />
      ) : (
        <div
          className="moment-frame__spatial-field"
          role="img"
          aria-label={spatialLabel}
          style={pointPosition(displayPoint)}
        >
          {showTelemetry ? (
            <div className="moment-frame__telemetry">
              <strong>{authorName || '—'}</strong>
              <small>{visibilityText(visibilityLabel, date.time)}</small>
              {precisionLabel ? <span>{precisionLabel}</span> : null}
            </div>
          ) : null}
          <Compass className="moment-frame__compass" aria-hidden="true" />
          <span className={axisClassName('horizontal')} aria-hidden="true" />
          <span className={axisClassName('vertical')} aria-hidden="true" />
          <span className="moment-frame__point" aria-hidden="true"><MapPin /></span>
          {showCoordinates ? <span className="moment-frame__coordinates" aria-hidden="true">{coordinateText(displayPoint)}</span> : null}
          {noMediaLabel && failedMediaKey !== mediaKey ? (
            <span className="moment-frame__empty" role="status"><ImageOff aria-hidden="true" />{noMediaLabel}</span>
          ) : null}
        </div>
      )}
      {failedMediaKey === mediaKey && mediaKey && mediaUnavailableLabel ? (
        <div className="moment-frame__error" role="status">
          <ImageOff aria-hidden="true" />
          <span>
            {mediaUnavailableTitle ? <strong>{mediaUnavailableTitle}</strong> : null}
            <span>{mediaUnavailableLabel}</span>
          </span>
          {showRetryOnError && retryMediaLabel ? (
            <button type="button" onClick={retry}>
              <RefreshCw aria-hidden="true" />
              <span>{retryMediaLabel}</span>
            </button>
          ) : null}
        </div>
      ) : null}
      {usableMedia && loadedMediaKey !== mediaKey && loadingLabel ? (
        <span className="moment-frame__loading" role="status" aria-live="polite">{loadingLabel}</span>
      ) : null}
      {children}
    </div>
  );
}

function visibilityText(visibilityLabel: string | undefined, time: string): string {
  return [visibilityLabel, time].filter(Boolean).join(' / ');
}
