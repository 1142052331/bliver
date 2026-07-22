import { gsap, motionTokens, prefersReducedMotion } from './gsap.js';

export type SpatialTransitionKind = 'to-detail' | 'to-map';

interface SpatialTransitionOptions {
  readonly kind: SpatialTransitionKind;
  readonly navigate: () => void;
  readonly source: HTMLElement | null;
}

interface ActiveSpatialTransition {
  readonly portal: HTMLElement;
  readonly cancel: () => void;
}

let activeSpatialTransition: ActiveSpatialTransition | undefined;

function cancelActiveSpatialTransition(): void {
  const active = activeSpatialTransition;
  activeSpatialTransition = undefined;
  active?.cancel();
}

function isUsableRect(rect: DOMRect): boolean {
  return rect.width > 1 && rect.height > 1;
}

function sanitizeClone(clone: HTMLElement): void {
  clone.setAttribute('aria-hidden', 'true');
  clone.inert = true;
  clone.removeAttribute('id');
  clone.removeAttribute('data-testid');
  clone.querySelectorAll<HTMLElement>('[id], [data-testid]').forEach((node) => {
    node.removeAttribute('id');
    node.removeAttribute('data-testid');
  });
}

function contentTarget(): DOMRect {
  const header = document.querySelector<HTMLElement>('.app-shell__header')
    ?.getBoundingClientRect();
  const nav = document.querySelector<HTMLElement>('.app-shell__nav')
    ?.getBoundingClientRect();
  const desktopRail = Boolean(nav && nav.width < 160);
  const left = desktopRail ? (nav?.right ?? 0) : 0;
  const top = header?.bottom ?? 0;
  const bottom = !desktopRail && nav ? nav.top : window.innerHeight;
  const inset = window.innerWidth < 608 ? 0 : 16;

  return new DOMRect(
    left + inset,
    top + inset,
    Math.max(1, window.innerWidth - left - inset * 2),
    Math.max(1, bottom - top - inset * 2),
  );
}

function mapTarget(): { readonly x: number; readonly y: number; readonly size: number } {
  const map = document.querySelector<HTMLElement>('.map-canvas__viewport')
    ?.getBoundingClientRect();
  const bounds = map && isUsableRect(map)
    ? map
    : new DOMRect(0, 0, window.innerWidth, window.innerHeight);

  return {
    x: bounds.left + bounds.width / 2,
    y: bounds.top + bounds.height / 2,
    size: 52,
  };
}

function coverTarget(
  source: DOMRect,
  target: DOMRect,
): {
  readonly borderRadius: string;
  readonly clipPath: string;
  readonly scale: number;
  readonly x: number;
  readonly y: number;
} {
  const scale = Math.max(
    target.width / source.width,
    target.height / source.height,
  );
  const visibleWidth = target.width / scale;
  const visibleHeight = target.height / scale;
  const horizontalInset = Math.max(
    0,
    ((source.width - visibleWidth) / source.width) * 50,
  );
  const verticalInset = Math.max(
    0,
    ((source.height - visibleHeight) / source.height) * 50,
  );
  const targetRadius = window.innerWidth < 608 ? 0 : 8;
  const sourceCenterX = source.left + source.width / 2;
  const sourceCenterY = source.top + source.height / 2;
  const targetCenterX = target.left + target.width / 2;
  const targetCenterY = target.top + target.height / 2;

  return {
    borderRadius: `${targetRadius / scale}px`,
    clipPath: `inset(${verticalInset}% ${horizontalInset}% round ${targetRadius / scale}px)`,
    scale,
    x: targetCenterX - sourceCenterX,
    y: targetCenterY - sourceCenterY,
  };
}

export function shouldAnimateSpatialClick(event: {
  readonly altKey: boolean;
  readonly button: number;
  readonly ctrlKey: boolean;
  readonly defaultPrevented: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}): boolean {
  return !event.defaultPrevented
    && event.button === 0
    && !event.altKey
    && !event.ctrlKey
    && !event.metaKey
    && !event.shiftKey;
}

export function runSpatialTransition({
  kind,
  navigate,
  source,
}: SpatialTransitionOptions): void {
  cancelActiveSpatialTransition();

  if (
    !source
    || typeof document === 'undefined'
    || typeof window === 'undefined'
    || prefersReducedMotion()
  ) {
    navigate();
    return;
  }

  const sourceRect = source.getBoundingClientRect();
  if (!isUsableRect(sourceRect)) {
    navigate();
    return;
  }

  document.querySelectorAll('.spatial-transition-portal').forEach((node) => node.remove());

  const portal = document.createElement('div');
  const veil = document.createElement('div');
  const clone = source.cloneNode(true) as HTMLElement;
  portal.className = 'spatial-transition-portal';
  veil.className = 'spatial-transition-portal__veil';
  clone.classList.add('spatial-transition-portal__source');
  sanitizeClone(clone);
  portal.setAttribute('aria-hidden', 'true');
  portal.append(veil, clone);
  document.body.append(portal);

  gsap.set(clone, {
    borderRadius: '8px',
    clipPath: 'inset(0% round 8px)',
    height: sourceRect.height,
    left: sourceRect.left,
    margin: 0,
    position: 'fixed',
    top: sourceRect.top,
    transformOrigin: 'center center',
    width: sourceRect.width,
    x: 0,
    y: 0,
  });
  gsap.set(veil, { autoAlpha: 0 });

  let navigated = false;
  let cleaned = false;
  let cancel = (): void => undefined;
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const navigateOnce = (): void => {
    if (navigated) return;
    navigated = true;
    navigate();
  };
  const onPageHide = (): void => cancel();
  const onReducedMotion = (event: MediaQueryListEvent): void => {
    if (!event.matches) return;
    navigateOnce();
    cancel();
  };
  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    window.removeEventListener('pagehide', onPageHide);
    motionQuery.removeEventListener('change', onReducedMotion);
    portal.remove();
    if (activeSpatialTransition?.portal === portal) {
      activeSpatialTransition = undefined;
    }
  };
  const timeline = gsap.timeline({ onComplete: cleanup, onInterrupt: cleanup });
  cancel = (): void => {
    timeline.kill();
    cleanup();
  };
  window.addEventListener('pagehide', onPageHide, { once: true });
  motionQuery.addEventListener('change', onReducedMotion);
  activeSpatialTransition = { cancel, portal };

  if (kind === 'to-map') {
    const target = mapTarget();
    const sourceCenterX = sourceRect.left + sourceRect.width / 2;
    const sourceCenterY = sourceRect.top + sourceRect.height / 2;
    const scale = target.size / Math.min(sourceRect.width, sourceRect.height);

    timeline
      .to(veil, {
        autoAlpha: 0.9,
        duration: motionTokens.duration.state,
        ease: motionTokens.ease.standard,
      }, 0)
      .to(clone, {
        borderRadius: '50%',
        clipPath: 'circle(50% at 50% 50%)',
        duration: motionTokens.duration.sharedElement - 0.06,
        ease: 'expo.in',
        scale,
        x: target.x - sourceCenterX,
        y: target.y - sourceCenterY,
      }, 0)
      .call(navigateOnce, [], 0.18)
      .to(clone, {
        autoAlpha: 0,
        duration: motionTokens.duration.state - 0.04,
        ease: motionTokens.ease.standard,
      }, 0.45)
      .to(veil, {
        autoAlpha: 0,
        duration: motionTokens.duration.state + 0.06,
        ease: motionTokens.ease.standard,
      }, 0.46);
    return;
  }

  const target = contentTarget();
  const geometry = coverTarget(sourceRect, target);

  timeline
    .to(veil, {
      autoAlpha: 0.94,
      duration: motionTokens.duration.state - 0.04,
      ease: motionTokens.ease.standard,
    }, 0)
    .to(clone, {
      borderRadius: geometry.borderRadius,
      clipPath: geometry.clipPath,
      duration: motionTokens.duration.sharedElement,
      ease: motionTokens.ease.shared,
      scale: geometry.scale,
      x: geometry.x,
      y: geometry.y,
    }, 0)
    .call(navigateOnce, [], 0.12)
    .to(clone, {
      autoAlpha: 0,
      duration: motionTokens.duration.state - 0.04,
      ease: motionTokens.ease.standard,
    }, 0.49)
    .to(veil, {
      autoAlpha: 0,
      duration: motionTokens.duration.state + 0.08,
      ease: motionTokens.ease.standard,
    }, 0.5);
}
