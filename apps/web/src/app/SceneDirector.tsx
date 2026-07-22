import type { ReactNode } from 'react';
import { useRef } from 'react';
import { useLocation } from 'react-router-dom';

import {
  gsap,
  motionTokens,
  useGSAP,
  withMotionPreferences,
} from '../platform/motion/gsap.js';
import './scene-director.css';

export type SceneDirectorVariant = 'spatial' | 'content' | 'auth' | 'work';

export interface SceneDirectorProps {
  readonly children: ReactNode;
  readonly routeKey: string;
  readonly variant?: SceneDirectorVariant;
  readonly className?: string;
}

export interface RouteSceneDirectorProps {
  readonly children: ReactNode;
  readonly variant?: SceneDirectorVariant;
  readonly className?: string;
}

interface ArrivalSpec {
  readonly x: number;
  readonly y: number;
  readonly clipPath: string;
  readonly duration: number;
  readonly opacity: number;
  readonly apertureOpacity: number;
  readonly showReticle: boolean;
}

const arrivalSpecs: Record<SceneDirectorVariant, ArrivalSpec> = {
  spatial: {
    x: 0,
    y: 0,
    clipPath: 'inset(1.8% 1.2% 1.8% 1.2%)',
    duration: motionTokens.duration.spatialRoute,
    opacity: 0.66,
    apertureOpacity: 0.32,
    showReticle: true,
  },
  content: {
    x: 0,
    y: 12,
    clipPath: 'inset(0% 0% 3% 0%)',
    duration: motionTokens.duration.contentRoute,
    opacity: 0.82,
    apertureOpacity: 0.14,
    showReticle: false,
  },
  auth: {
    x: 0,
    y: 0,
    clipPath: 'inset(0% 0% 0% 0%)',
    duration: motionTokens.duration.state,
    opacity: 0.94,
    apertureOpacity: 0,
    showReticle: false,
  },
  work: {
    x: 0,
    y: 6,
    clipPath: 'inset(0% 0% 0% 0%)',
    duration: motionTokens.duration.workRoute,
    opacity: 0.92,
    apertureOpacity: 0,
    showReticle: false,
  },
};

export function sceneVariantForPathname(
  pathname: string,
): SceneDirectorVariant {
  if (pathname === '/map' || pathname.startsWith('/publish')) return 'spatial';
  if (pathname === '/login' || pathname === '/session-expired') return 'auth';
  if (
    pathname.startsWith('/messages') ||
    pathname.startsWith('/notifications') ||
    pathname.startsWith('/people') ||
    pathname.startsWith('/admin')
  ) return 'work';
  if (
    pathname.startsWith('/activity') ||
    pathname.startsWith('/footprints') ||
    pathname.startsWith('/me') ||
    pathname.startsWith('/profile')
  ) return 'content';
  return 'content';
}

/**
 * Adds one short, route-keyed arrival without owning routing or page layout.
 * Keep routeKey stable while only search params change, especially on the map.
 */
export function SceneDirector({
  children,
  routeKey,
  variant = 'content',
  className,
}: SceneDirectorProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const root = rootRef.current;
    if (!root) return;

    const content = root.querySelector<HTMLElement>('.scene-director__content');
    const aperture = root.querySelector<HTMLElement>('.scene-director__aperture');
    const horizon = aperture?.querySelector<HTMLElement>(
      '.scene-director__horizon',
    );
    const meridian = aperture?.querySelector<HTMLElement>(
      '.scene-director__meridian',
    );
    const reticle = aperture?.querySelector<HTMLElement>(
      '.scene-director__reticle',
    );
    if (!content) return;

    const decorative = [aperture, horizon, meridian, reticle].filter(
      (node): node is HTMLElement => node !== null && node !== undefined,
    );
    const animated = [content, ...decorative];

    return withMotionPreferences(root, ({ compact, reducedMotion }) => {
      if (reducedMotion) {
        gsap.set(animated, {
          clearProps: 'transform,opacity,visibility,clipPath,transformOrigin,willChange',
        });
        return;
      }

      const spec = arrivalSpecs[variant];
      const timeline = gsap.timeline({
        defaults: {
          ease: variant === 'work'
            ? motionTokens.ease.quiet
            : motionTokens.ease.route,
          overwrite: 'auto',
        },
      });

      if (variant === 'work') {
        gsap.set(content, { willChange: 'transform,opacity' });
        timeline.fromTo(content, {
          autoAlpha: spec.opacity,
          y: compact ? 4 : spec.y,
        }, {
          autoAlpha: 1,
          y: 0,
          duration: spec.duration,
          clearProps: 'transform,opacity,visibility,willChange',
        });
        return () => timeline.kill();
      }

      gsap.set(content, { willChange: 'transform,opacity,clip-path' });
      if (decorative.length) {
        gsap.set(decorative, {
          willChange: 'transform,opacity,clip-path',
        });
      }

      timeline.fromTo(content, {
        autoAlpha: spec.opacity,
        x: compact ? spec.x * 0.5 : spec.x,
        y: compact ? spec.y * 0.6 : spec.y,
        clipPath: spec.clipPath,
      }, {
        autoAlpha: 1,
        x: 0,
        y: 0,
        clipPath: 'inset(0% 0% 0% 0%)',
        duration: spec.duration,
        clearProps: 'transform,opacity,visibility,clipPath,willChange',
      }, 0);

      if (aperture && horizon) {
        timeline
          .fromTo(aperture, {
            opacity: spec.apertureOpacity,
            clipPath: variant === 'auth'
              ? 'inset(0% 7% 0% 0%)'
              : 'inset(6% 5% 6% 5%)',
          }, {
            opacity: 0,
            clipPath: 'inset(0% 0% 0% 0%)',
            duration: spec.duration,
            clearProps: 'opacity,clipPath,willChange',
          }, 0)
          .fromTo(horizon, {
            opacity: variant === 'content' ? 0.3 : 0.66,
            scaleX: 0,
            transformOrigin: '50% 50%',
          }, {
            opacity: 0,
            scaleX: 1,
            duration: Math.max(
              motionTokens.duration.state,
              spec.duration - 0.06,
            ),
            clearProps: 'transform,opacity,transformOrigin,willChange',
          }, motionTokens.duration.micro * 0.2);
      }

      if (meridian && variant !== 'content') {
        timeline.fromTo(meridian, {
          opacity: variant === 'auth' ? 0.4 : 0.58,
          scaleY: 0,
          transformOrigin: '50% 50%',
        }, {
          opacity: 0,
          scaleY: 1,
          duration: spec.duration - 0.04,
          clearProps: 'transform,opacity,transformOrigin,willChange',
        }, motionTokens.duration.micro * 0.3);
      }

      if (reticle && spec.showReticle) {
        timeline
          .fromTo(reticle, {
            autoAlpha: 0,
            scale: 0.62,
            rotation: variant === 'auth' ? -7 : -10,
          }, {
            autoAlpha: 0.72,
            scale: 1,
            rotation: 0,
            duration: motionTokens.duration.state,
          }, motionTokens.duration.micro * 0.25)
          .to(reticle, {
            autoAlpha: 0,
            scale: 1.18,
            duration: motionTokens.duration.state,
            clearProps: 'transform,opacity,visibility,willChange',
          }, `>-${motionTokens.duration.micro * 0.2}`);
      }

      return () => timeline.kill();
    });
  }, {
    dependencies: [routeKey, variant],
    revertOnUpdate: true,
    scope: rootRef,
  });

  const classes = [
    'scene-director',
    `scene-director--${variant}`,
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} data-scene-variant={variant} ref={rootRef}>
      {variant === 'work' || variant === 'auth' ? null : (
        <div className="scene-director__aperture" aria-hidden="true">
          <span className="scene-director__horizon" />
          <span className="scene-director__meridian" />
          <span className="scene-director__reticle" />
        </div>
      )}
      <div className="scene-director__content">{children}</div>
    </div>
  );
}

/** Router-aware convenience wrapper. Search-param updates do not replay arrival. */
export function RouteSceneDirector({
  children,
  variant,
  className,
}: RouteSceneDirectorProps) {
  const location = useLocation();
  const resolvedVariant = variant ?? sceneVariantForPathname(location.pathname);

  return (
    <SceneDirector
      routeKey={location.pathname}
      variant={resolvedVariant}
      {...(className !== undefined ? { className } : {})}
    >
      {children}
    </SceneDirector>
  );
}
