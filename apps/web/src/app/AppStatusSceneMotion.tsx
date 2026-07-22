import type { RefObject } from 'react';

import {
  gsap,
  motionTokens,
  useGSAP,
  withMotionPreferences,
} from '../platform/motion/gsap.js';

interface AppStatusSceneMotionProps {
  readonly rootRef: RefObject<HTMLDivElement | null>;
  readonly busy: boolean;
  readonly statusKind: string;
  readonly statusLabel?: string;
}

export function AppStatusSceneMotion({
  rootRef,
  busy,
  statusKind,
  statusLabel,
}: AppStatusSceneMotionProps) {
  useGSAP(() => {
    const scene = rootRef.current;
    if (!scene) return;

    const field = scene.querySelector<HTMLElement>('[data-status-field]');
    const district = scene.querySelector<SVGPathElement>('[data-status-district]');
    const network = scene.querySelectorAll<SVGGElement>('[data-status-network]');
    const traces = scene.querySelectorAll<SVGPathElement>('[data-status-trace]');
    const point = scene.querySelector<HTMLElement>('[data-status-point]');
    const pointRing = scene.querySelector<HTMLElement>('[data-status-point-ring]');
    const pointIcon = scene.querySelector<SVGElement>('[data-status-point-icon]');
    const details = scene.querySelectorAll<HTMLElement>('[data-status-detail]');
    const measure = scene.querySelector<HTMLElement>('[data-status-measure]');

    if (!field || !district || !point || !pointRing) return;

    return withMotionPreferences(scene, ({ compact, reducedMotion }) => {
      if (reducedMotion) {
        gsap.set([field, district, network, traces, point, pointRing, details, measure].filter(Boolean), {
          clearProps: 'transform,opacity,visibility,willChange',
        });
        return;
      }

      const timeline = gsap.timeline({
        defaults: {
          duration: motionTokens.duration.state,
          ease: motionTokens.ease.quiet,
          overwrite: 'auto',
        },
      });

      timeline
        .addLabel('field', 0)
        .fromTo(field, {
          autoAlpha: 0.88,
          scale: 1.012,
        }, {
          autoAlpha: 1,
          scale: 1,
          duration: compact
            ? motionTokens.duration.state
            : motionTokens.duration.contentRoute,
          clearProps: 'transform,opacity,visibility',
        }, 'field')
        .fromTo(district, {
          xPercent: compact ? 4 : 7,
          scale: 1.025,
          transformOrigin: 'center center',
        }, {
          xPercent: 0,
          scale: 1,
          duration: motionTokens.duration.contentRoute,
          clearProps: 'transform,transformOrigin',
        }, 'field')
        .fromTo(network, {
          autoAlpha: 0.45,
          y: 6,
        }, {
          autoAlpha: 1,
          y: 0,
          duration: motionTokens.duration.state,
          stagger: 0.025,
          clearProps: 'transform,opacity,visibility',
        }, 'field+=0.06')
        .fromTo(traces, {
          strokeDashoffset: 0.24,
        }, {
          strokeDashoffset: 0,
          duration: motionTokens.duration.contentRoute,
          stagger: 0.06,
        }, 'field+=0.06')
        .addLabel('point', 'field+=0.16')
        .fromTo(pointRing, {
          autoAlpha: 0,
          scale: 1.65,
        }, {
          autoAlpha: 1,
          scale: 1,
          duration: motionTokens.duration.state,
          clearProps: 'transform,opacity,visibility',
        }, 'point')
        .fromTo(point, {
          autoAlpha: 0,
          scale: 0.72,
        }, {
          autoAlpha: 1,
          scale: 1,
          duration: motionTokens.duration.state,
          clearProps: 'transform,opacity,visibility',
        }, 'point+=0.03')
        .addLabel('content', compact ? 0.1 : 0.16)
        .fromTo(details, {
          y: compact ? 10 : 14,
        }, {
          y: 0,
          duration: motionTokens.duration.state,
          stagger: 0.035,
          clearProps: 'transform',
        }, 'content')
        .fromTo(measure, {
          scaleX: 0,
          transformOrigin: 'left center',
        }, {
          scaleX: 1,
          duration: motionTokens.duration.state,
          clearProps: 'transform,transformOrigin',
        }, 'content+=0.08');

      if (busy && pointIcon) {
        timeline.to(pointIcon, {
          rotation: 360,
          transformOrigin: 'center center',
          duration: 1,
          ease: 'none',
          repeat: -1,
        }, 'point+=0.04');
      }

      return () => timeline.kill();
    });
  }, {
    dependencies: [busy, statusKind, statusLabel],
    revertOnUpdate: true,
    scope: rootRef,
  });

  return null;
}
