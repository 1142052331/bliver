import {
  CloudRain,
  Heart,
  Moon,
  Sun,
  Waves,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useRef } from 'react';

import {
  footprintMoodTones,
  type FootprintMoodKey,
} from '../../platform/footprint-mood.js';
import {
  gsap,
  motionTokens,
  prefersReducedMotion,
  useGSAP,
} from '../../platform/motion/gsap.js';
import type { FootprintTranslationKey } from './translations.js';

type FootprintCopy = (
  key: FootprintTranslationKey,
  values?: Record<string, string | number>,
) => string;

interface MoodOption {
  readonly key: FootprintMoodKey;
  readonly icon: LucideIcon;
  readonly labelKey: FootprintTranslationKey;
  readonly bodyKey: FootprintTranslationKey;
}

const moodOptions: readonly MoodOption[] = [
  { key: 'radiant', icon: Sun, labelKey: 'moodRadiant', bodyKey: 'moodRadiantBody' },
  { key: 'calm', icon: Waves, labelKey: 'moodCalm', bodyKey: 'moodCalmBody' },
  { key: 'tender', icon: Heart, labelKey: 'moodTender', bodyKey: 'moodTenderBody' },
  { key: 'charged', icon: Zap, labelKey: 'moodCharged', bodyKey: 'moodChargedBody' },
  { key: 'low', icon: CloudRain, labelKey: 'moodLow', bodyKey: 'moodLowBody' },
  { key: 'quiet', icon: Moon, labelKey: 'moodQuiet', bodyKey: 'moodQuietBody' },
];

const neutralTone = {
  accent: '#5f8f82',
  surface: '#e9f0ec',
  ink: '#28584d',
} as const;

export interface MoodExposureSelectorProps {
  readonly copy: FootprintCopy;
  readonly disabled?: boolean;
  readonly hasMedia: boolean;
  readonly onChange: (mood: FootprintMoodKey | undefined) => void;
  readonly value?: FootprintMoodKey | undefined;
}

export function MoodExposureSelector({
  copy,
  disabled = false,
  hasMedia,
  onChange,
  value,
}: MoodExposureSelectorProps) {
  const rootRef = useRef<HTMLFieldSetElement>(null);
  const selected = moodOptions.find((option) => option.key === value);
  const tone = value ? footprintMoodTones[value] : undefined;
  const previousToneRef = useRef(tone ?? neutralTone);
  const SelectedIcon = selected?.icon;

  useGSAP(() => {
    const root = rootRef.current;
    if (!root) return;
    const stage = root.querySelector<HTMLElement>('[data-mood-exposure]');
    const marker = root.querySelector<HTMLElement>('[data-mood-marker]');
    const sweep = root.querySelector<HTMLElement>('[data-mood-sweep]');
    const selectedControl = root.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!stage || !marker || !sweep) return;

    const nextTone = tone ?? neutralTone;
    const previousTone = previousToneRef.current;
    previousToneRef.current = nextTone;
    const targets = [root, stage, marker, sweep, selectedControl].filter(
      (target): target is HTMLElement => Boolean(target),
    );
    gsap.killTweensOf(targets);

    if (prefersReducedMotion()) {
      gsap.set(root, {
        '--mood-accent': nextTone.accent,
        '--mood-surface': nextTone.surface,
        '--mood-ink': nextTone.ink,
      });
      gsap.set([stage, marker, sweep, selectedControl], {
        clearProps: 'transform,opacity,visibility,willChange',
      });
      return;
    }

    const timeline = gsap.timeline({
      defaults: { ease: motionTokens.ease.route, overwrite: 'auto' },
    });
    gsap.set(stage, { willChange: 'clip-path' });
    gsap.set([marker, sweep, selectedControl].filter(Boolean), {
      willChange: 'transform,opacity',
    });
    timeline
      .fromTo(root, {
        '--mood-accent': previousTone.accent,
        '--mood-surface': previousTone.surface,
        '--mood-ink': previousTone.ink,
      }, {
        '--mood-accent': nextTone.accent,
        '--mood-surface': nextTone.surface,
        '--mood-ink': nextTone.ink,
        duration: motionTokens.duration.state,
      }, 0)
      .fromTo(stage, {
        clipPath: 'inset(0 5% 0 5% round 8px)',
      }, {
        clipPath: 'inset(0 0% 0 0% round 8px)',
        duration: 0.36,
        clearProps: 'clipPath',
      }, 0)
      .fromTo(marker, {
        rotation: value ? -7 : 0,
        scale: 0.86,
        y: 8,
      }, {
        rotation: 0,
        scale: 1,
        y: 0,
        duration: 0.36,
        clearProps: 'transform',
      }, 0.02)
      .fromTo(sweep, {
        autoAlpha: 0,
        xPercent: -115,
      }, {
        autoAlpha: 0.58,
        xPercent: 115,
        duration: 0.48,
      }, 0)
      .set(sweep, { clearProps: 'transform,opacity,visibility' });

    if (selectedControl) {
      timeline.fromTo(selectedControl, { scale: 0.94 }, {
        scale: 1,
        duration: motionTokens.duration.state,
        clearProps: 'transform',
      }, 0.04);
    }
    timeline.set([stage, marker, sweep, selectedControl].filter(Boolean), {
      clearProps: 'willChange',
    });

    return () => timeline.kill();
  }, {
    dependencies: [hasMedia, value],
    revertOnUpdate: true,
    scope: rootRef,
  });

  return (
    <fieldset
      ref={rootRef}
      className={`publish-mood${value ? ' has-mood' : ''}${hasMedia ? ' has-media' : ''}`}
    >
      <legend>
        <span>{copy('moodTitle')}</span>
        <small>{copy('moodOptional')}</small>
      </legend>

      <div className="publish-mood__exposure" data-mood-exposure>
        <span className="publish-mood__sweep" data-mood-sweep aria-hidden="true" />
        <span className="publish-mood__marker" data-mood-marker aria-hidden="true">
          <span className="publish-mood__marker-face">
            {SelectedIcon ? <SelectedIcon /> : <span className="publish-mood__neutral-glyph" />}
          </span>
          <span className="publish-mood__marker-tip" />
        </span>
        <span className="publish-mood__readout" aria-live="polite">
          <strong>{selected ? copy(selected.labelKey) : copy('moodNeutralTitle')}</strong>
          <small>{selected ? copy(selected.bodyKey) : copy('moodNeutralBody')}</small>
        </span>
        {hasMedia && value ? (
          <span className="publish-mood__media-note">{copy('moodPhotoTreatment')}</span>
        ) : null}
      </div>

      <div className="publish-mood__rail">
        {moodOptions.map((option) => {
          const Icon = option.icon;
          const pressed = option.key === value;
          return (
            <button
              key={option.key}
              type="button"
              aria-label={copy(option.labelKey)}
              aria-pressed={pressed}
              disabled={disabled}
              onClick={() => onChange(pressed ? undefined : option.key)}
            >
              <span aria-hidden="true"><Icon /></span>
              <small>{copy(option.labelKey)}</small>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
