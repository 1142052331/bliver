import {
  CloudRain,
  Heart,
  Moon,
  Sun,
  Waves,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  footprintMoodCssVariables,
  resolveFootprintMood,
  type FootprintMoodKey,
  type FootprintMoodTone,
} from '../../platform/footprint-mood.js';

import './footprint-mood-mark.css';

const moodIcons: Record<FootprintMoodTone['glyph'], LucideIcon> = {
  sun: Sun,
  waves: Waves,
  heart: Heart,
  bolt: Zap,
  rain: CloudRain,
  moon: Moon,
};

const moodLabelKeys: Record<FootprintMoodKey, string> = {
  radiant: 'footprints.moodRadiant',
  calm: 'footprints.moodCalm',
  tender: 'footprints.moodTender',
  charged: 'footprints.moodCharged',
  low: 'footprints.moodLow',
  quiet: 'footprints.moodQuiet',
};

const fallbackLabels: Record<FootprintMoodKey, string> = {
  radiant: 'Radiant',
  calm: 'Calm',
  tender: 'Tender',
  charged: 'Charged',
  low: 'Low tide',
  quiet: 'Still',
};

export interface FootprintMoodMarkProps {
  readonly mood?: string | null | undefined;
  readonly className?: string;
  readonly variant?: 'label' | 'icon';
}

/**
 * Canonical mood metadata used by map, activity, detail and memories.
 * Unknown values intentionally render nothing instead of exposing storage keys.
 */
export function FootprintMoodMark({
  mood,
  className,
  variant = 'label',
}: FootprintMoodMarkProps) {
  const { t } = useTranslation();
  const tone = resolveFootprintMood(mood);
  if (!tone) return null;

  const Icon = moodIcons[tone.glyph];
  const label = String(t(moodLabelKeys[tone.key], {
    defaultValue: fallbackLabels[tone.key],
  }));

  return (
    <span
      className={[
        'footprint-mood-mark',
        `footprint-mood-mark--${variant}`,
        className ?? '',
      ].filter(Boolean).join(' ')}
      data-footprint-mood={tone.key}
      style={footprintMoodCssVariables(tone)}
      title={variant === 'icon' ? label : undefined}
    >
      <span className="footprint-mood-mark__glyph" aria-hidden="true">
        <Icon />
      </span>
      <span className={variant === 'icon' ? 'footprint-mood-mark__label footprint-mood-mark__label--hidden' : 'footprint-mood-mark__label'}>
        {label}
      </span>
    </span>
  );
}
