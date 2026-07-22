import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ActivityPageDto, ActivityQuery, FootprintDto } from '@bliver/contracts';
import { Button } from '@bliver/ui';
import { Compass, Image as ImageIcon, MapPin, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { consumePendingAction, savePendingAction, type PendingAction } from '../../platform/pending-action.js';
import {
  footprintMoodCssVariables,
  resolveFootprintMood,
} from '../../platform/footprint-mood.js';
import {
  gsap,
  motionTokens,
  useGSAP,
  withMotionPreferences,
} from '../../platform/motion/gsap.js';
import { addComment, addReaction, addReply, reportFootprint, useActivityInfiniteQuery } from './api.js';
import { ActivityCard } from './ActivityCard.js';
import { ActivityScopeSheet } from './ActivityScopeSheet.js';
import './activity.css';

export type ActivityState = 'loading' | 'empty' | 'error' | 'ready';
export interface ActivityRouteProps {
  readonly state?: ActivityState;
  readonly items?: readonly FootprintDto[];
  readonly page?: ActivityPageDto;
  readonly onRetry?: () => void;
  readonly loadFromApi?: boolean;
}

const defaultQuery: ActivityQuery = { scope: 'smart', relationship: 'all', content: 'all', limit: 20 };
interface ActivityMomentStripProps {
  readonly activeId: string | null;
  readonly items: readonly FootprintDto[];
  readonly onSelect: (id: string) => void;
}

function ActivityMomentThumbnail({
  item,
  priority,
}: {
  readonly item: FootprintDto;
  readonly priority: boolean;
}) {
  const [failedMediaUrl, setFailedMediaUrl] = useState<string | null>(null);
  const media = item.primaryMedia;
  const hasMedia = media && media.url !== failedMediaUrl;

  return (
    <span
      aria-hidden="true"
      className={`activity-moment-strip__thumbnail${hasMedia ? ' has-media' : ' is-spatial'}`}
    >
      {hasMedia ? (
        <img
          alt=""
          decoding="async"
          height={media.height}
          loading={priority ? 'eager' : 'lazy'}
          onError={() => setFailedMediaUrl(media.url)}
          src={media.url}
          width={media.width}
        />
      ) : (
        <>
          <span className="activity-moment-strip__spatial-axis" />
          <MapPin />
          <small>{item.displayPoint.lat.toFixed(1)} / {item.displayPoint.lng.toFixed(1)}</small>
        </>
      )}
    </span>
  );
}

function ActivityMomentStrip({ activeId, items, onSelect }: ActivityMomentStripProps) {
  const { i18n, t } = useTranslation();
  const stripRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const cursorRef = useRef<HTMLLIElement>(null);
  const activeIndex = Math.max(0, items.findIndex((item) => item.id === activeId));
  const itemOrder = items.map((item) => item.id).join('|');

  useGSAP((_context, contextSafe) => {
    const root = stripRef.current;
    const list = listRef.current;
    const cursor = cursorRef.current;
    if (!root || !list || !cursor) return;

    return withMotionPreferences(root, ({ reducedMotion }) => {
      const alignCursor = (animate: boolean): void => {
        const button = list.querySelector<HTMLButtonElement>(
          'button[aria-pressed="true"]',
        );
        if (!button) return;
        const scrollLeft = Math.max(
          0,
          button.offsetLeft + button.offsetWidth / 2 - list.clientWidth / 2,
        );
        gsap.killTweensOf([cursor, list]);
        if (!animate || reducedMotion) {
          gsap.set(cursor, { x: button.offsetLeft, scaleX: button.offsetWidth });
          list.scrollLeft = scrollLeft;
          return;
        }
        gsap.to(cursor, {
          x: button.offsetLeft,
          scaleX: button.offsetWidth,
          duration: 0.24,
          ease: 'expo.out',
          overwrite: 'auto',
        });
        // Scroll position is the one deliberate non-transform tween here.
        gsap.to(list, {
          scrollLeft,
          duration: 0.32,
          ease: 'power3.inOut',
          overwrite: 'auto',
        });
      };

      alignCursor(true);
      if (typeof ResizeObserver === 'undefined') {
        return () => gsap.killTweensOf([cursor, list]);
      }
      const onResize = contextSafe
        ? contextSafe(() => alignCursor(false))
        : () => alignCursor(false);
      const observer = new ResizeObserver(onResize);
      observer.observe(list);
      return () => {
        observer.disconnect();
        gsap.killTweensOf([cursor, list]);
      };
    });
  }, { dependencies: [activeId, itemOrder], scope: stripRef, revertOnUpdate: true });

  const navigateStrip = (event: KeyboardEvent<HTMLOListElement>): void => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-moment-id]'));
    const current = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-moment-id]');
    if (!current || !buttons.length) return;
    const currentIndex = buttons.indexOf(current);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : event.key === 'ArrowRight'
          ? Math.min(buttons.length - 1, currentIndex + 1)
          : Math.max(0, currentIndex - 1);
    event.preventDefault();
    buttons[nextIndex]?.focus();
  };

  return (
    <nav ref={stripRef} className="activity-moment-strip" aria-label={t('activity.momentStrip')}>
      <div className="activity-moment-strip__heading">
        <span>{t('activity.momentStrip')}</span>
        <strong>{activeIndex + 1}<small> / {items.length}</small></strong>
      </div>
      <ol ref={listRef} onKeyDown={navigateStrip}>
        <li ref={cursorRef} className="activity-moment-strip__cursor" aria-hidden="true" />
        {items.map((item, index) => {
          const active = item.id === activeId;
          const date = new Date(item.publishedAt).toLocaleString(i18n.resolvedLanguage ?? i18n.language, {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
          });
          const moodTone = resolveFootprintMood(item.mood);
          return (
            <li key={item.id}>
              <button
                type="button"
                aria-label={t('activity.selectMoment', { author: item.author.name, count: items.length, index: index + 1 })}
                aria-pressed={active}
                data-moment-id={item.id}
                data-mood-key={moodTone?.key}
                onClick={() => onSelect(item.id)}
                onFocus={() => onSelect(item.id)}
                style={moodTone ? footprintMoodCssVariables(moodTone) : undefined}
              >
                <ActivityMomentThumbnail item={item} priority={index < 5} />
                <span className="activity-moment-strip__copy">
                  <strong>{item.author.name}</strong>
                  <time dateTime={item.publishedAt}>{date}</time>
                </span>
                <span className="activity-moment-strip__type" aria-hidden="true">
                  {item.primaryMedia ? <ImageIcon /> : <MapPin />}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

interface ActivityStageProps {
  readonly activeId: string | null;
  readonly items: readonly FootprintDto[];
  readonly onSelect: (id: string) => void;
}

function ActivityStage({ activeId, items, onSelect }: ActivityStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const previousIdRef = useRef<string | null>(null);

  useGSAP(() => {
    const root = stageRef.current;
    if (!root || !activeId) return;

    return withMotionPreferences(root, ({ reducedMotion }) => {
      const panels = Array.from(
        root.querySelectorAll<HTMLElement>('[data-stage-id]'),
      );
      const current = panels.find(
        (panel) => panel.dataset.stageId === activeId,
      );
      const previous = panels.find(
        (panel) => panel.dataset.stageId === previousIdRef.current,
      );
      if (!current) return;
      const currentIndex = panels.indexOf(current);
      const previousIndex = previous ? panels.indexOf(previous) : currentIndex;
      const direction = currentIndex >= previousIndex ? 1 : -1;
      gsap.killTweensOf(panels);
      if (reducedMotion) {
        gsap.set(panels, {
          clearProps: 'transform,opacity,visibility,clipPath,willChange',
        });
        previousIdRef.current = activeId;
        return;
      }

      const timeline = gsap.timeline({ defaults: { overwrite: 'auto' } });
      if (previous && previous !== current) {
        gsap.set(previous, { autoAlpha: 1, willChange: 'transform, opacity' });
        timeline.to(previous, {
          autoAlpha: 0,
          x: -24 * direction,
          duration: motionTokens.duration.state,
          ease: 'power2.in',
          clearProps: 'transform,opacity,visibility,willChange',
        }, 0);
      }
      gsap.set(current, { willChange: 'transform, opacity, clip-path' });
      timeline.fromTo(current, {
        autoAlpha: 0,
        x: 34 * direction,
        clipPath: direction > 0 ? 'inset(0 0 0 9%)' : 'inset(0 9% 0 0)',
      }, {
        autoAlpha: 1,
        x: 0,
        clipPath: 'inset(0 0 0 0%)',
        duration: motionTokens.duration.contentRoute,
        ease: motionTokens.ease.route,
        clearProps: 'transform,clipPath,visibility,willChange',
      }, 0);
      const scene = current.querySelector<HTMLElement>('.activity-scene');
      const telemetry = current.querySelector<HTMLElement>('.moment-frame__telemetry');
      const point = current.querySelector<HTMLElement>(
        '.moment-frame__point',
      );
      const content = current.querySelectorAll<HTMLElement>(
        '[data-cinematic-rail] > *',
      );
      const hud = current.querySelectorAll<HTMLElement>(
        '.activity-scene__hud > *',
      );
      if (scene) {
        gsap.set(scene, { willChange: 'transform' });
        timeline.fromTo(scene, { scale: 1.035 }, {
          scale: 1,
          duration: motionTokens.duration.sharedElement,
          ease: motionTokens.ease.shared,
          clearProps: 'transform,willChange',
        }, 0);
      }
      if (telemetry) {
        timeline.fromTo(telemetry, { y: -10, autoAlpha: 0.7 }, {
          y: 0,
          autoAlpha: 1,
          duration: motionTokens.duration.state,
          ease: motionTokens.ease.quiet,
          clearProps: 'transform,opacity,visibility',
        }, 0.08);
      }
      if (point) {
        timeline.fromTo(point, { autoAlpha: 0.35, scale: 0.72 }, {
          autoAlpha: 1,
          scale: 1,
          duration: motionTokens.duration.state,
          ease: motionTokens.ease.route,
          clearProps: 'transform,opacity,visibility',
        }, 0.1);
      }
      timeline.fromTo(hud, { autoAlpha: 0, y: -8 }, {
        autoAlpha: 1,
        y: 0,
        duration: motionTokens.duration.state,
        ease: motionTokens.ease.quiet,
        stagger: 0.035,
        clearProps: 'transform,opacity,visibility',
      }, 0.08);
      timeline.fromTo(content, { autoAlpha: 0, y: 16 }, {
        autoAlpha: 1,
        y: 0,
        duration: motionTokens.duration.state,
        ease: motionTokens.ease.quiet,
        stagger: 0.035,
        clearProps: 'transform,opacity,visibility',
      }, 0.12);
      timeline.set(current, { clearProps: 'willChange' });
      previousIdRef.current = activeId;
      return () => timeline.kill();
    });
  }, { dependencies: [activeId], scope: stageRef, revertOnUpdate: true });

  const selectAdjacent = (direction: -1 | 1): void => {
    if (!activeId) return;
    const index = items.findIndex((item) => item.id === activeId);
    const next = items[index + direction];
    if (next) onSelect(next.id);
  };

  return (
    <div ref={stageRef} className="activity-stage">
      {items.map((item, index) => {
        const active = item.id === activeId;
        return (
          <div
            className={`activity-stage__panel${active ? ' is-active' : ''}`}
            data-stage-id={item.id}
            aria-hidden={!active}
            key={item.id}
          >
            <ActivityCard
              active={active}
              index={index + 1}
              item={item}
              presentation="stage"
              total={items.length}
              onSwipe={selectAdjacent}
              onAuthRequired={savePendingActivityAction}
            />
          </div>
        );
      })}
    </div>
  );
}

function ActivityUnavailableState({ onRetry }: { readonly onRetry: () => void }) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const root = rootRef.current;
    if (!root) return;
    const field = root.querySelector<HTMLElement>('[data-activity-state-field]');
    const route = root.querySelector<HTMLElement>('[data-activity-state-route]');
    const point = root.querySelector<HTMLElement>('[data-activity-state-point]');
    const content = root.querySelector<HTMLElement>('[data-activity-state-content]');
    if (!field || !route || !point || !content) return;

    return withMotionPreferences(root, ({ reducedMotion }) => {
      if (reducedMotion) {
        gsap.set([field, route, point, content], {
          clearProps: 'transform,opacity,visibility,willChange',
        });
        return;
      }
      const timeline = gsap.timeline({ defaults: { overwrite: 'auto' } });
      timeline
        .fromTo(field, { scale: 1.02 }, {
          scale: 1,
          duration: motionTokens.duration.contentRoute,
          ease: motionTokens.ease.route,
          clearProps: 'transform,opacity,visibility',
        })
        .fromTo(route, { scaleX: 0, transformOrigin: 'left center' }, {
          scaleX: 1,
          duration: motionTokens.duration.sharedElement,
          ease: motionTokens.ease.shared,
          clearProps: 'transform,transformOrigin',
        }, 0.08)
        .fromTo(point, { scale: 0.64 }, {
          scale: 1,
          duration: motionTokens.duration.state,
          ease: motionTokens.ease.route,
          clearProps: 'transform,opacity,visibility',
        }, 0.16)
        .fromTo(content, { y: 12 }, {
          y: 0,
          duration: motionTokens.duration.state,
          ease: motionTokens.ease.quiet,
          clearProps: 'transform,opacity,visibility',
        }, 0.12);
      return () => timeline.kill();
    });
  }, { scope: rootRef });

  return (
    <div className="activity-state" ref={rootRef}>
      <div
        aria-hidden="true"
        className="activity-state__field"
        data-activity-state-field
      >
        <span className="activity-state__field-code">ACTIVITY / 503</span>
        <span className="activity-state__field-status">DISCOVERY CHANNEL</span>
        <span className="activity-state__route" data-activity-state-route />
        <span className="activity-state__point" data-activity-state-point>
          <Compass />
        </span>
        <span className="activity-state__field-index">NC / STORY</span>
      </div>
      <div className="activity-state__message" data-activity-state-content role="alert">
        <div className="activity-state__rail">
          <span aria-hidden="true" />
          <span>ACTIVITY / 503</span>
          <small>STORY / STATUS</small>
        </div>
        <h1>{t('activity.unavailableTitle')}</h1>
        <p>{t('activity.unavailableBody')}</p>
        <Button onClick={onRetry}>
          <RefreshCw aria-hidden="true" />
          <span>{t('activity.retry')}</span>
        </Button>
        <span aria-hidden="true" className="activity-state__measure" />
      </div>
    </div>
  );
}

function savePendingActivityAction(action: Record<string, string>): void {
  savePendingAction(action as Omit<PendingAction, 'returnTo'>);
}

export function ActivityRoute(props: ActivityRouteProps) {
  const client = useMemo(() => new QueryClient(), []);
  return <QueryClientProvider client={client}><ActivityRouteBody {...props} /></QueryClientProvider>;
}

function ActivityRouteBody({ state = 'ready', items = [], page, onRetry, loadFromApi = false }: ActivityRouteProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(defaultQuery);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const remote = useActivityInfiniteQuery(query, loadFromApi);
  const data = loadFromApi ? remote.data?.pages[remote.data.pages.length - 1] : page;
  const visible = loadFromApi ? (remote.data?.pages.flatMap((current) => current.items) ?? []) : (page?.items ?? items);
  const resolvedActiveId = visible.some((item) => item.id === activeId)
    ? activeId
    : visible[0]?.id ?? null;
  const location = useLocation();
  const replayed = useRef<string | null>(null);
  const routeRef = useRef<HTMLElement>(null);
  const filterTrigger = useRef<HTMLButtonElement>(null);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  useGSAP(() => {
    const root = routeRef.current;
    const search = root?.querySelector<HTMLElement>('.activity-route__search');
    if (!root || !search || !searchOpen) return;

    return withMotionPreferences(root, ({ reducedMotion }) => {
      if (reducedMotion) {
        gsap.set(search, { clearProps: 'transform,opacity,visibility' });
        return;
      }
      const entrance = gsap.fromTo(search, {
        autoAlpha: 0,
        y: -6,
      }, {
        autoAlpha: 1,
        y: 0,
        duration: 0.18,
        ease: motionTokens.ease.route,
        clearProps: 'transform,opacity,visibility',
      });
      return () => entrance.kill();
    });
  }, {
    dependencies: [searchOpen],
    revertOnUpdate: true,
    scope: routeRef,
  });

  useEffect(() => {
    if (!searchOpen) return;
    const frame = requestAnimationFrame(() => searchInput.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [searchOpen]);

  useEffect(() => {
    const pending = (location.state as { pendingAction?: PendingAction } | null)?.pendingAction;
    if (!pending) return;
    const fingerprint = JSON.stringify(pending);
    if (replayed.current === fingerprint) return;
    replayed.current = fingerprint;
    void (async () => {
      try {
        if (pending.kind === 'reaction' && pending.emoji) await addReaction(pending.footprintId, pending.emoji);
        else if (pending.kind === 'comment' && pending.content) await addComment(pending.footprintId, pending.content);
        else if (pending.kind === 'reply' && pending.content && pending.parentCommentId) await addReply(pending.footprintId, pending.parentCommentId, pending.content);
        else if (pending.kind === 'report' && pending.reason) await reportFootprint(pending.footprintId, pending.reason as 'spam');
      } catch {
        return;
      }
      consumePendingAction();
    })();
  }, [location.state]);

  const retry = (): void => {
    onRetry?.();
    if (loadFromApi) void remote.refetch();
  };

  if (state === 'loading' || (loadFromApi && remote.isLoading && !visible.length)) {
    return (
      <section className="activity-route activity-route--loading" aria-busy="true">
        <div className="activity-route__loading-copy"><h1>{t('activity.title')}</h1><p role="status">{t('activity.loading')}</p></div>
        <div className="activity-route__skeleton" aria-hidden="true"><span /><span /><span /></div>
      </section>
    );
  }

  if (state === 'error' || remote.isError) {
    return (
      <section className="activity-route activity-route--state">
        <ActivityUnavailableState onRetry={retry} />
      </section>
    );
  }

  const resolved = data?.resolvedScope ?? 'global';
  const resolvedLabel = t(resolved === 'region' ? 'activity.scopeRegion' : resolved === 'country' ? 'activity.scopeCountry' : 'activity.scopeGlobal');
  const closeScope = (): void => {
    setScopeOpen(false);
    requestAnimationFrame(() => filterTrigger.current?.focus());
  };

  return (
    <section ref={routeRef} className="activity-route">
      <header className="activity-route__header">
        <div>
          <h1>{t('activity.title')}</h1>
          <p><MapPin aria-hidden="true" /><span className="activity-route__scope-label">{resolvedLabel}</span><span className="activity-route__separator" aria-hidden="true">/</span><span>{t(visible.length === 1 ? 'activity.moment' : 'activity.moments', { count: visible.length })}</span></p>
        </div>
        <div className="activity-route__header-actions">
          <Button
            ref={searchTrigger}
            className="activity-route__search-toggle"
            variant="ghost"
            aria-label={t('activity.searchMoments')}
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((open) => !open)}
          >
            <Search aria-hidden="true" />
          </Button>
          <Button ref={filterTrigger} variant="secondary" aria-expanded={scopeOpen} onClick={() => setScopeOpen(true)}><SlidersHorizontal aria-hidden="true" />{t('activity.filter')}</Button>
        </div>
      </header>
      {searchOpen ? (
        <label className="activity-route__search">
          <span>{t('activity.searchMoments')}</span>
          <span className="activity-route__search-control"><Search aria-hidden="true" /><input ref={searchInput} type="search" value={query.query ?? ''} onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            setSearchOpen(false);
            requestAnimationFrame(() => searchTrigger.current?.focus());
          }} onChange={(event) => {
            const { query: _query, cursor: _cursor, ...base } = query;
            void _query;
            void _cursor;
            setQuery({ ...base, ...(event.target.value ? { query: event.target.value } : {}) });
          }} /></span>
        </label>
      ) : null}
      {scopeOpen ? <ActivityScopeSheet value={query} onChange={(value) => {
        const { cursor: _cursor, ...next } = value;
        void _cursor;
        setQuery(next);
      }} onClose={closeScope} /> : null}
      {state === 'empty' || (!visible.length && !remote.isLoading) ? (
        <div className="activity-route__empty"><Compass aria-hidden="true" /><h2>{t('activity.emptyTitle')}</h2><p>{t('activity.emptyBody')}</p></div>
      ) : (
        <div className="activity-route__layout" data-activity-sequence="true">
          <ActivityStage activeId={resolvedActiveId} items={visible} onSelect={setActiveId} />
          <ActivityMomentStrip activeId={resolvedActiveId} items={visible} onSelect={setActiveId} />
        </div>
      )}
      {data?.nextCursor ? <div className="activity-route__more"><Button variant="secondary" disabled={remote.isFetchingNextPage} onClick={() => void remote.fetchNextPage()}>{t(remote.isFetchingNextPage ? 'activity.loadingMore' : 'activity.loadMore')}</Button></div> : null}
    </section>
  );
}
