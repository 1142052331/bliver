import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

import { motionMediaQueries, motionTokens } from './tokens.js';

gsap.registerPlugin(useGSAP);

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface MotionPreferences {
  readonly compact: boolean;
  readonly reducedMotion: boolean;
}

export function withMotionPreferences(
  scope: HTMLElement,
  setup: (preferences: MotionPreferences) => void | (() => void),
): () => void {
  if (
    typeof window === 'undefined'
    || typeof window.matchMedia !== 'function'
  ) {
    const cleanup = setup({ compact: false, reducedMotion: false });
    return typeof cleanup === 'function' ? cleanup : () => undefined;
  }

  const media = gsap.matchMedia(scope);
  media.add(motionMediaQueries, (context) => setup({
    compact: Boolean(context.conditions?.compact),
    reducedMotion: Boolean(context.conditions?.reducedMotion),
  }));
  return () => media.revert();
}

export { gsap, motionMediaQueries, motionTokens, useGSAP };
