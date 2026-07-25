import { useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { MapRoute } from '../../features/map/MapRoute.js';
import {
  gsap,
  motionTokens,
  useGSAP,
  withMotionPreferences,
} from '../../platform/motion/gsap.js';
import './spatial-map-layout.css';

export function Component() {
  const location = useLocation();
  const publishing = location.pathname === '/publish';
  const layoutRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const previousPublishingRef = useRef(publishing);

  useGSAP(() => {
    const layout = layoutRef.current;
    const map = mapRef.current;
    if (!layout || !map) return;
    const previousPublishing = previousPublishingRef.current;
    previousPublishingRef.current = publishing;

    return withMotionPreferences(layout, ({ compact, reducedMotion }) => {
      const quietTargets = map.querySelectorAll<HTMLElement>(
        '.map-route__controls, .map-canvas__semantic, .map-canvas__attribution',
      );
      const previousYPercent = previousPublishing && compact ? -31 : 0;
      const nextYPercent = publishing && compact ? -31 : 0;
      const previousAutoAlpha = previousPublishing ? 0 : 1;
      const nextAutoAlpha = publishing ? 0 : 1;
      gsap.killTweensOf([map, ...quietTargets]);

      if (reducedMotion || previousPublishing === publishing) {
        gsap.set(map, { yPercent: nextYPercent });
        gsap.set(quietTargets, { autoAlpha: nextAutoAlpha });
        return;
      }

      const timeline = gsap.timeline({
        defaults: { overwrite: 'auto' },
      });
      timeline
        .fromTo(map, {
          yPercent: previousYPercent,
        }, {
          yPercent: nextYPercent,
          duration: 0.42,
          ease: motionTokens.ease.route,
        }, 0)
        .fromTo(quietTargets, {
          autoAlpha: previousAutoAlpha,
        }, {
          autoAlpha: nextAutoAlpha,
          duration: motionTokens.duration.micro,
          ease: motionTokens.ease.route,
        }, 0);

      return () => timeline.kill();
    });
  }, {
    dependencies: [publishing],
    revertOnUpdate: true,
    scope: layoutRef,
  });

  return (
    <div
      ref={layoutRef}
      className={`spatial-map-layout${publishing ? ' is-publishing' : ''}`}
    >
      <div
        ref={mapRef}
        className="spatial-map-layout__map"
        aria-hidden={publishing ? true : undefined}
        inert={publishing ? true : undefined}
      >
        <MapRoute freezeViewport={publishing} loadFromApi state="ready" />
      </div>
      <Outlet />
    </div>
  );
}
