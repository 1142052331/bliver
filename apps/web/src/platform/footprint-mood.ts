import type { FootprintMood } from '@bliver/contracts';
import type { CSSProperties } from 'react';

export type FootprintMoodKey = FootprintMood;

export interface FootprintMoodTone {
  readonly key: FootprintMoodKey;
  readonly accent: string;
  readonly surface: string;
  readonly ink: string;
  readonly glyph: 'sun' | 'waves' | 'heart' | 'bolt' | 'rain' | 'moon';
}

export type FootprintMoodCssVariables = CSSProperties & {
  readonly '--footprint-mood-accent': string;
  readonly '--footprint-mood-surface': string;
  readonly '--footprint-mood-ink': string;
};

export const footprintMoodTones: Record<FootprintMoodKey, FootprintMoodTone> = {
  radiant: {
    key: 'radiant',
    accent: '#b8872d',
    surface: '#f5edd8',
    ink: '#654b1d',
    glyph: 'sun',
  },
  calm: {
    key: 'calm',
    accent: '#5f8f82',
    surface: '#e4efea',
    ink: '#28584d',
    glyph: 'waves',
  },
  tender: {
    key: 'tender',
    accent: '#a15f6b',
    surface: '#f3e6e4',
    ink: '#6b3844',
    glyph: 'heart',
  },
  charged: {
    key: 'charged',
    accent: '#397491',
    surface: '#e1edf2',
    ink: '#214f65',
    glyph: 'bolt',
  },
  low: {
    key: 'low',
    accent: '#637c91',
    surface: '#e7edf1',
    ink: '#3e5669',
    glyph: 'rain',
  },
  quiet: {
    key: 'quiet',
    accent: '#6f6c7e',
    surface: '#ebeaf0',
    ink: '#4b485c',
    glyph: 'moon',
  },
};

const aliases: Record<string, FootprintMoodKey> = {
  radiant: 'radiant',
  happy: 'radiant',
  calm: 'calm',
  relaxed: 'calm',
  tender: 'tender',
  loved: 'tender',
  charged: 'charged',
  energetic: 'charged',
  low: 'low',
  sad: 'low',
  quiet: 'quiet',
  still: 'quiet',
  '\u{1f60a}': 'radiant',
  '\u{1f62d}': 'low',
  '\u{1f60b}': 'tender',
  '\u{1f3cb}\ufe0f': 'charged',
  '\u{1f634}': 'quiet',
  '\u{1f37a}': 'calm',
};

export function resolveFootprintMood(value?: string | null): FootprintMoodTone | undefined {
  const key = value?.trim().toLocaleLowerCase();
  if (!key) return undefined;
  const moodKey = aliases[key] ?? (key in footprintMoodTones ? key as FootprintMoodKey : undefined);
  return moodKey ? footprintMoodTones[moodKey] : undefined;
}

export function footprintMoodCssVariables(tone: FootprintMoodTone): FootprintMoodCssVariables {
  return {
    '--footprint-mood-accent': tone.accent,
    '--footprint-mood-surface': tone.surface,
    '--footprint-mood-ink': tone.ink,
  };
}

export function serializeFootprintMood(value?: string | null): FootprintMoodKey | undefined {
  return resolveFootprintMood(value)?.key;
}
