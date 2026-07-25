import { lazy, Suspense, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { OptionalMotionBoundary } from './OptionalMotion.js';
import './scene-director.css';

const LazySceneDirectorMotion = lazy(() =>
  import('./SceneDirectorMotion.js').then(({ SceneDirectorMotion }) => ({
    default: SceneDirectorMotion,
  })),
);

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

export function sceneVariantForPathname(
  pathname: string,
): SceneDirectorVariant {
  if (pathname === '/map' || pathname.startsWith('/publish')) return 'spatial';
  if (
    pathname === '/login'
    || pathname === '/register'
    || pathname === '/session-expired'
  ) return 'auth';
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
      <OptionalMotionBoundary>
        <Suspense fallback={null}>
          <LazySceneDirectorMotion
            rootRef={rootRef}
            routeKey={routeKey}
            variant={variant}
          />
        </Suspense>
      </OptionalMotionBoundary>
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
