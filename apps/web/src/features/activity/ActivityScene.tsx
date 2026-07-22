import type { FootprintDto } from '@bliver/contracts';
import { Image as ImageIcon, MapPin } from 'lucide-react';
import { useRef, useState, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { MomentFrame } from '../../components/moment/MomentFrame.js';
import { FootprintMoodMark } from '../../components/moment/FootprintMoodMark.js';

interface ActivitySceneProps {
  readonly active: boolean;
  readonly index: number;
  readonly item: FootprintDto;
  readonly total: number;
  readonly onSwipe?: (direction: -1 | 1) => void;
}

export function ActivityScene({ active, index, item, total, onSwipe }: ActivitySceneProps) {
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const visibility = item.visibility === 'public'
    ? t('activity.public')
    : item.visibility === 'friends'
      ? t('activity.friends')
      : t('activity.onlyYou');
  const precision = item.locationPrecision === 'precise'
    ? t('activity.exactPlace')
    : t('activity.nearbyArea');
  const media = active ? item.primaryMedia : undefined;
  const [failedMediaUrl, setFailedMediaUrl] = useState<string | null>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const frameMode: 'media' | 'spatial' = media && media.url !== failedMediaUrl ? 'media' : 'spatial';

  const startSwipe = (event: PointerEvent<HTMLDivElement>): void => {
    pointerStart.current = { x: event.clientX, y: event.clientY };
  };

  const finishSwipe = (event: PointerEvent<HTMLDivElement>): void => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start || !onSwipe) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < 46 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) return;
    onSwipe(deltaX < 0 ? 1 : -1);
  };

  return (
    <div
      className={`activity-scene activity-scene--${frameMode}`}
      data-moment-index={String(index).padStart(2, '0')}
      data-moment-total={String(total).padStart(2, '0')}
      data-scene-role="moment"
      onPointerCancel={() => { pointerStart.current = null; }}
      onPointerDown={startSwipe}
      onPointerUp={finishSwipe}
    >
      <MomentFrame
        authorName={item.author.name}
        displayPoint={item.displayPoint}
        fetchPriority={active ? 'high' : 'low'}
        loading="lazy"
        loadingLabel={t('activity.loading')}
        locale={locale}
        media={media}
        mediaAlt={t('activity.photoAlt', { author: item.author.name })}
        mood={item.mood}
        onMediaStateChange={(state) => {
          if (state === 'error' && media) setFailedMediaUrl(media.url);
          if (state === 'loaded') setFailedMediaUrl(null);
        }}
        precisionLabel={precision}
        publishedAt={item.publishedAt}
        spatialLabel={t('activity.spatialFallback', { author: item.author.name })}
        showCoordinates
        showTelemetry={false}
        variant="stage"
        visibilityLabel={visibility}
      />
      <div className="activity-scene__hud" aria-hidden="true">
        <span className="activity-scene__sequence">
          {String(index).padStart(2, '0')}
          <i>/ {String(total).padStart(2, '0')}</i>
        </span>
        <span className="activity-scene__material">
          {frameMode === 'media' ? <ImageIcon /> : <MapPin />}
        </span>
        <FootprintMoodMark className="activity-scene__mood" mood={item.mood} variant="icon" />
      </div>
    </div>
  );
}
