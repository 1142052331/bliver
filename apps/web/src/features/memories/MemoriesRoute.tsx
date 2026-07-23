import { Button } from '@bliver/ui';
import { useQuery } from '@tanstack/react-query';
import {
  Archive,
  ArrowUpRight,
  CalendarDays,
  Camera,
  Clock3,
  Eye,
  Images,
  Map,
  Settings2,
  UserRound,
} from 'lucide-react';
import { type CSSProperties, type ComponentType, type ReactNode, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router-dom';

import { MomentFrame } from '../../components/moment/MomentFrame.js';
import { FootprintMoodMark } from '../../components/moment/FootprintMoodMark.js';
import {
  fetchCurrentUser,
  fetchPublicProfiles,
  type PublicProfile,
} from '../identity/api.js';
import { resolveFootprintMood } from '../../platform/footprint-mood.js';
import {
  gsap,
  motionTokens,
  useGSAP,
  withMotionPreferences,
} from '../../platform/motion/gsap.js';
import { DeleteFootprintButton } from '../footprints/DeleteFootprintButton.js';
import {
  fetchMemories,
  fetchPhotos,
  fetchTimeline,
  fetchVisitors,
  type MemoryFootprint,
  type MemorySummary,
} from './api.js';
import './memories.css';

interface MemoryTab {
  readonly path: string;
  readonly labelKey: string;
  readonly icon: ComponentType<{ readonly 'aria-hidden'?: boolean }>;
}

type MemoryView = 'overview' | 'map' | 'timeline' | 'photos' | 'visitors';

const memoryViewOrder: readonly MemoryView[] = ['overview', 'map', 'timeline', 'photos', 'visitors'];

const tabs: readonly MemoryTab[] = [
  { path: '/me', labelKey: 'memories.overview', icon: Archive },
  { path: '/me/map', labelKey: 'memories.map', icon: Map },
  { path: '/me/timeline', labelKey: 'memories.timeline', icon: Clock3 },
  { path: '/me/photos', labelKey: 'memories.photos', icon: Images },
  { path: '/me/visitors', labelKey: 'memories.visitors', icon: Eye },
];

interface MemoryPlotPoint {
  readonly item: MemoryFootprint;
  readonly x: number;
  readonly y: number;
}

function memoryPlot(items: readonly MemoryFootprint[]): MemoryPlotPoint[] {
  if (!items.length) return [];
  const latitudes = items.map((item) => item.displayPoint.lat);
  const longitudes = items.map((item) => item.displayPoint.lng);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const latRange = Math.max(maxLat - minLat, 0.01);
  const lngRange = Math.max(maxLng - minLng, 0.01);

  return items.map((item) => ({
    item,
    x: items.length === 1 ? 50 : 10 + ((item.displayPoint.lng - minLng) / lngRange) * 80,
    y: items.length === 1 ? 46 : 80 - ((item.displayPoint.lat - minLat) / latRange) * 68,
  }));
}

function formatDate(value: string, locale: string, options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' }): string {
  return new Intl.DateTimeFormat(locale, options).format(new Date(value));
}

function visibilityLabelKey(visibility: string): 'memories.visibilityPublic' | 'memories.visibilityFriends' | 'memories.visibilityPrivate' {
  if (visibility === 'public') return 'memories.visibilityPublic';
  if (visibility === 'friends') return 'memories.visibilityFriends';
  return 'memories.visibilityPrivate';
}

function profileMonogram(displayName: string, username: string): string {
  const words = displayName.trim().split(/\s+/u).filter(Boolean);
  if (words.length > 1) return words.slice(0, 2).map((word) => Array.from(word)[0]).join('').toLocaleUpperCase();
  const source = words[0] || username.trim() || 'B';
  return Array.from(source).slice(0, 2).join('').toLocaleUpperCase();
}

function IdentityMasthead({
  profile,
  ownProfile,
  showMapAction,
}: {
  readonly profile: PublicProfile | null | undefined;
  readonly ownProfile: boolean;
  readonly showMapAction: boolean;
}) {
  const { t } = useTranslation();
  const displayName = profile?.displayName.trim() || t(ownProfile ? 'memories.mySpace' : 'memories.profileFallbackName');
  const username = profile?.username.trim();

  return (
    <header className="memories-header">
      <div className="memories-identity">
        <span className="memories-identity__monogram" aria-hidden="true">{profileMonogram(displayName, username ?? '')}</span>
        <div className="memories-identity__copy">
          <p>{t(ownProfile ? 'memories.personalArchive' : 'memories.profileMemories')}</p>
          <h1>{displayName}</h1>
          {username ? <span>@{username}</span> : <span>{t('memories.profileFallbackHandle')}</span>}
        </div>
      </div>
      <div className="memories-header__actions">
        {showMapAction ? (
          <Link className="memories-header__map-link" to="/map" aria-label={t('memories.openMap')}>
            <Map aria-hidden="true" />
            <span>{t('memories.openMap')}</span>
          </Link>
        ) : null}
        {ownProfile ? (
          <Link className="memories-header__notifications-link" to="/notifications" aria-label={t('memories.notificationSettings')}>
            <Settings2 aria-hidden="true" />
            <span>{t('memories.notifications')}</span>
          </Link>
        ) : null}
      </div>
    </header>
  );
}

function memoryTicketStyle(item: MemoryFootprint, x: number, y: number): CSSProperties {
  const moodTone = resolveFootprintMood(item.mood);
  return {
    '--memory-x': `${x}%`,
    '--memory-y': `${y}%`,
    ...(moodTone ? {
      '--memory-mood-accent': moodTone.accent,
      '--memory-mood-surface': moodTone.surface,
      '--memory-mood-ink': moodTone.ink,
    } : {}),
  } as CSSProperties;
}

function MemoryEmpty({ children, action = false }: { readonly children: ReactNode; readonly action?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="memories-empty" data-memory-arrival>
      <p>{children}</p>
      {action ? <Link className="memories-empty__action" to="/map"><Map aria-hidden="true" />{t('memories.openMap')}<ArrowUpRight aria-hidden="true" /></Link> : null}
    </div>
  );
}

function MemoryPreview({ item, variant }: { readonly item: MemoryFootprint; readonly variant: 'feature' | 'ledger' }) {
  const { i18n, t } = useTranslation();
  if (!item.primaryMedia) return null;
  return (
    <span className={`memory-preview memory-preview--${variant}`} aria-hidden="true">
      <MomentFrame
        authorName={t('memories.photoAlt')}
        displayPoint={item.displayPoint}
        loading="lazy"
        locale={i18n.resolvedLanguage ?? i18n.language}
        media={item.primaryMedia}
        mediaAlt=""
        mood={item.mood}
        showCoordinates={false}
        showTelemetry={false}
        spatialLabel={t('memories.photoUnavailable')}
        variant="stage"
      />
    </span>
  );
}

type MemoryPhotoItem = Awaited<ReturnType<typeof fetchPhotos>>['items'][number];

function MemoryPhoto({ item, locale }: { readonly item: MemoryPhotoItem; readonly locale: string }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const rootRef = useRef<HTMLAnchorElement>(null);
  const previousStatusRef = useRef(status);

  useGSAP(() => {
    const root = rootRef.current;
    if (!root) return;
    const previousStatus = previousStatusRef.current;
    previousStatusRef.current = status;
    if (previousStatus === status || status === 'loading') return;

    const frame = root.querySelector<HTMLElement>('[data-moment-frame]');
    if (!frame) return;
    return withMotionPreferences(root, ({ reducedMotion }) => {
      if (reducedMotion) {
        gsap.set(frame, { clearProps: 'transform,opacity,visibility,willChange' });
        return;
      }
      const tween = gsap.fromTo(frame, {
        autoAlpha: status === 'ready' ? 0.82 : 0.68,
        scale: status === 'ready' ? 0.992 : 0.985,
      }, {
        autoAlpha: 1,
        scale: 1,
        duration: motionTokens.duration.state,
        ease: motionTokens.ease.route,
        overwrite: 'auto',
        willChange: 'transform,opacity',
        clearProps: 'transform,opacity,visibility,willChange',
      });
      return () => tween.kill();
    });
  }, { dependencies: [status], scope: rootRef, revertOnUpdate: true });

  return (
    <Link
      ref={rootRef}
      className={`memory-photo memory-photo--${status}`}
      aria-label={t('memories.openMemory', { date: formatDate(item.createdAt, locale) })}
      data-memory-arrival
      data-memory-photo-status={status}
      to={`/footprints/${item.footprintId}`}
    >
      <figure aria-busy={status === 'loading'}>
        <MomentFrame
          authorName={t('memories.photoAlt')}
          loading="lazy"
          loadingLabel={t('memories.loading')}
          locale={locale}
          media={status === 'error' ? undefined : { url: item.url, width: 16, height: 10 }}
          mediaAlt={t('memories.photoAlt')}
          noMediaLabel={t('memories.photoUnavailable')}
          onMediaStateChange={(next) => {
            if (next === 'loaded') setStatus('ready');
            else if (next === 'error') setStatus('error');
            else setStatus('loading');
          }}
          revealOnLoad
          showCoordinates={false}
          showTelemetry={false}
          spatialLabel={t('memories.photoUnavailable')}
          variant="stage"
        />
        <figcaption><time dateTime={item.createdAt}>{formatDate(item.createdAt, locale)}</time><ArrowUpRight aria-hidden="true" /></figcaption>
      </figure>
    </Link>
  );
}

function Loading({ profile = false }: { readonly profile?: boolean }) {
  const { t } = useTranslation();
  return (
    <section className="memories-route memories-route--loading" aria-busy="true">
      <header><div><p>{t('memories.personalArchive')}</p><h1>{t(profile ? 'memories.profile' : 'memories.mySpace')}</h1><span role="status">{t('memories.loading')}</span></div></header>
      <div className="memories-loading-stage" aria-hidden="true"><span /><span /><span /><span /></div>
      <p className="memories-loading-note">{t('memories.pendingMigration')}</p>
    </section>
  );
}

function ErrorState({ retry }: { readonly retry: () => void }) {
  const { t } = useTranslation();
  return (
    <section className="memories-route memories-route--state" aria-labelledby="memories-error-heading" role="alert">
      <span className="memories-state__ticket" aria-hidden="true" />
      <h1 id="memories-error-heading">{t('memories.unavailableTitle')}</h1>
      <p>{t('memories.unavailableBody')}</p>
      <Button onClick={retry}>{t('memories.retry')}</Button>
    </section>
  );
}

function MemoryStatValue({ value }: { readonly value: number }) {
  const valueRef = useRef<HTMLSpanElement>(null);
  const previousValueRef = useRef(value);

  useGSAP(() => {
    const target = valueRef.current;
    if (!target) return;
    const previousValue = previousValueRef.current;
    previousValueRef.current = value;
    target.textContent = String(value);
    if (previousValue === value) return;

    return withMotionPreferences(target, ({ reducedMotion }) => {
      if (reducedMotion) {
        target.textContent = String(value);
        gsap.set(target, { clearProps: 'transform,opacity,visibility,willChange' });
        return;
      }

      const counter = { value: previousValue };
      const timeline = gsap.timeline({
        defaults: { overwrite: 'auto' },
        onComplete: () => { target.textContent = String(value); },
      });
      timeline.to(counter, {
        value,
        duration: motionTokens.duration.state,
        ease: motionTokens.ease.quiet,
        onUpdate: () => { target.textContent = String(Math.round(counter.value)); },
      }, 0).fromTo(target, {
        autoAlpha: 0.72,
        scale: 0.94,
      }, {
        autoAlpha: 1,
        scale: 1,
        duration: motionTokens.duration.state,
        ease: motionTokens.ease.route,
        willChange: 'transform,opacity',
        clearProps: 'transform,opacity,visibility,willChange',
      }, 0);
      return () => {
        timeline.kill();
        target.textContent = String(value);
      };
    });
  }, { dependencies: [value], scope: valueRef, revertOnUpdate: true });

  return <span ref={valueRef} className="memories-summary__value">{value}</span>;
}

function MemoryStats({ summary, standalone = false }: { readonly summary: MemorySummary | undefined; readonly standalone?: boolean }) {
  const { t } = useTranslation();
  const footprintCount = summary?.footprintCount ?? 0;
  const photoCount = summary?.photoCount ?? 0;
  const visitorCount = summary?.visitorCount ?? 0;
  return (
    <dl className={`memories-summary${standalone ? ' memories-summary--standalone' : ''}`} aria-label={t('memories.memorySummary')} data-memory-primary={standalone ? 'true' : undefined}>
      <div><dt>{t('memories.footprints')}</dt><dd><MemoryStatValue value={footprintCount} /></dd></div>
      <div><dt>{t('memories.photos')}</dt><dd><MemoryStatValue value={photoCount} /></dd></div>
      <div><dt>{t('memories.visitors')}</dt><dd><MemoryStatValue value={visitorCount} /></dd></div>
    </dl>
  );
}

function MemorySeed({ summary, ownProfile }: { readonly summary: MemorySummary | undefined; readonly ownProfile: boolean }) {
  const { t } = useTranslation();
  return (
    <section className="memory-seed" aria-labelledby="memory-seed-heading" data-memory-primary="true">
      <div className="memory-seed__body">
        <span className="memory-seed__mark" aria-hidden="true"><Archive /></span>
        <div className="memory-seed__copy">
          <h2 id="memory-seed-heading">{t(ownProfile ? 'memories.seedTitle' : 'memories.profileSeedTitle')}</h2>
          <p>{t(ownProfile ? 'memories.seedBody' : 'memories.profileSeedBody')}</p>
        </div>
        <Link className="memory-seed__action" to={ownProfile ? '/publish' : '/map'}>
          <Map aria-hidden="true" />
          <span>{t(ownProfile ? 'memories.leaveFirstFootprint' : 'memories.exploreMap')}</span>
          <ArrowUpRight aria-hidden="true" />
        </Link>
      </div>
      <MemoryStats summary={summary} />
    </section>
  );
}

function MemoryField({ items, summary, expanded = false, canDelete = false }: { readonly items: readonly MemoryFootprint[]; readonly summary: MemorySummary | undefined; readonly expanded?: boolean; readonly canDelete?: boolean }) {
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const rootRef = useRef<HTMLElement>(null);
  const visibleItems = items.slice(0, 12);
  const points = memoryPlot(visibleItems);
  const primary = visibleItems[0];
  const trace = points.map(({ x, y }) => `${x},${y}`).join(' ');

  useGSAP(() => {
    const root = rootRef.current;
    if (!root) return;
    const path = root.querySelector<SVGPolylineElement>('[data-memory-trace]');
    const tickets = root.querySelectorAll<HTMLElement>('[data-memory-ticket]');
    const feature = root.querySelector<HTMLElement>('[data-memory-feature]');

    return withMotionPreferences(root, ({ reducedMotion }) => {
      const targets = [path, ...tickets, feature].filter(Boolean);
      if (reducedMotion) {
        if (targets.length) gsap.set(targets, { clearProps: 'transform,opacity,visibility,strokeDasharray,strokeDashoffset,willChange' });
        return;
      }

      const timeline = gsap.timeline({ defaults: { overwrite: 'auto' } });
      if (path) {
        gsap.set(path, { strokeDasharray: 1, strokeDashoffset: 1 });
        timeline.to(path, {
          strokeDashoffset: 0,
          duration: motionTokens.duration.contentRoute,
          ease: motionTokens.ease.shared,
          clearProps: 'strokeDasharray,strokeDashoffset',
        }, 0);
      }
      if (tickets.length) {
        timeline.fromTo(tickets, { autoAlpha: 0, y: 7 }, {
          autoAlpha: 1,
          y: 0,
          duration: motionTokens.duration.state,
          ease: motionTokens.ease.route,
          stagger: 0.025,
          clearProps: 'transform,opacity,visibility',
        }, 0.04);
      }
      if (feature) {
        timeline.fromTo(feature, { autoAlpha: 0.72, y: 6 }, {
          autoAlpha: 1,
          y: 0,
          duration: motionTokens.duration.state,
          ease: motionTokens.ease.quiet,
          clearProps: 'transform,opacity,visibility',
        }, 0.1);
      }
      return () => timeline.kill();
    });
  }, {
    dependencies: [expanded, visibleItems.map((item) => item.id).join('|')],
    scope: rootRef,
    revertOnUpdate: true,
  });

  return (
    <section ref={rootRef} className={`memory-atlas${expanded ? ' memory-atlas--expanded' : ''}`} aria-labelledby="memory-atlas-heading" data-memory-primary="true">
      <header className="memory-atlas__heading">
        <h2 id="memory-atlas-heading">{t('memories.mapMemories')}</h2>
        {items.length ? <p>{t(items.length === 1 ? 'memories.savedPlace' : 'memories.savedPlaces', { count: items.length })}</p> : null}
      </header>
      {primary ? (
        <>
          <div className="memory-atlas__plot" aria-label={t('memories.spatialIndex')}>
            {points.length > 1 ? (
              <svg aria-hidden="true" className="memory-atlas__trace" preserveAspectRatio="none" viewBox="0 0 100 100">
                <polyline data-memory-trace pathLength="1" points={trace} vectorEffect="non-scaling-stroke" />
              </svg>
            ) : null}
            {points.map(({ item, x, y }, index) => (
            <Link
              className={`memory-atlas__ticket${index === 0 ? ' is-primary' : ''}`}
              key={item.id}
              to={`/footprints/${item.id}`}
              style={memoryTicketStyle(item, x, y)}
              data-footprint-mood={resolveFootprintMood(item.mood)?.key}
              aria-label={`${t('memories.openMemory', { date: formatDate(item.publishedAt, locale) })} · ${t(visibilityLabelKey(item.visibility))}`}
              data-memory-ticket
            >
              <span aria-hidden="true"><i /><i /></span>
              <time dateTime={item.publishedAt}>{formatDate(item.publishedAt, locale, { month: 'short', day: 'numeric' })}</time>
            </Link>
            ))}
          </div>
          <div className="memory-atlas__feature-row">
            <Link
              aria-label={`${t('memories.openMemory', { date: formatDate(primary.publishedAt, locale) })} · ${t(visibilityLabelKey(primary.visibility))}`}
              className={`memory-atlas__feature${primary.primaryMedia ? ' has-media' : ''}`}
              data-memory-feature
              to={`/footprints/${primary.id}`}
            >
              <MemoryPreview item={primary} variant="feature" />
              <span className="memory-atlas__feature-date">
                <time dateTime={primary.publishedAt}>{formatDate(primary.publishedAt, locale)}</time>
                <FootprintMoodMark mood={primary.mood} variant="icon" />
              </span>
              <strong>{primary.message || t('memories.sharedMoment')}</strong>
              <span className="memory-atlas__feature-meta">
                <span>{primary.displayPoint.lat.toFixed(3)}, {primary.displayPoint.lng.toFixed(3)}</span>
                <span>{t(visibilityLabelKey(primary.visibility))}</span>
                <ArrowUpRight aria-hidden="true" />
              </span>
            </Link>
            {canDelete ? <DeleteFootprintButton footprintId={primary.id} /> : null}
          </div>
        </>
      ) : (
        <div className="memory-atlas__empty">
          <p>{t('memories.noMemories')}</p>
          <Link to="/map"><Map aria-hidden="true" />{t('memories.openMap')}<ArrowUpRight aria-hidden="true" /></Link>
        </div>
      )}
      <MemoryStats summary={summary} />
    </section>
  );
}

function MemoryLedger({ items, title, titleId, emptyText, canDelete = false }: { readonly items: readonly MemoryFootprint[]; readonly title: string; readonly titleId: string; readonly emptyText: string; readonly canDelete?: boolean }) {
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  return (
    <section className="memory-ledger" aria-labelledby={titleId}>
      <div className="memory-ledger__heading" data-memory-arrival><h2 id={titleId}>{title}</h2><span>{items.length}</span></div>
      {items.length ? (
        <ol>
          {items.map((item) => (
            <li key={item.id} data-memory-arrival>
              <Link className={item.primaryMedia ? 'has-media' : undefined} aria-label={`${t('memories.openMemory', { date: formatDate(item.publishedAt, locale) })} · ${t(visibilityLabelKey(item.visibility))}`} to={`/footprints/${item.id}`}>
                <time dateTime={item.publishedAt}><strong>{formatDate(item.publishedAt, locale, { day: '2-digit' })}</strong><span>{formatDate(item.publishedAt, locale, { month: 'short', year: 'numeric' })}</span></time>
                <MemoryPreview item={item} variant="ledger" />
                <span className="memory-ledger__content"><strong>{item.message || t('memories.sharedMoment')}</strong><small><FootprintMoodMark mood={item.mood} /><span className="memory-ledger__coordinate">{item.displayPoint.lat.toFixed(3)}, {item.displayPoint.lng.toFixed(3)}</span><span className="memory-ledger__visibility">{t(visibilityLabelKey(item.visibility))}</span></small></span>
                <ArrowUpRight aria-hidden="true" />
              </Link>
              {canDelete ? <DeleteFootprintButton footprintId={item.id} /> : null}
            </li>
          ))}
        </ol>
      ) : <MemoryEmpty>{emptyText}</MemoryEmpty>}
    </section>
  );
}

export function MemoriesRoute() {
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const location = useLocation();
  const userId = useParams().userId;
  const base = userId ? `/profile/${userId}/memories` : '/me';
  const routeRef = useRef<HTMLElement>(null);
  const previousViewRef = useRef<MemoryView | null>(null);
  const isMap = location.pathname.endsWith('/map');
  const isTimeline = location.pathname.endsWith('/timeline');
  const isPhotos = location.pathname.endsWith('/photos');
  const isVisitors = location.pathname.endsWith('/visitors');
  const isOverview = !isMap && !isTimeline && !isPhotos && !isVisitors;
  const view: MemoryView = isMap ? 'map' : isTimeline ? 'timeline' : isPhotos ? 'photos' : isVisitors ? 'visitors' : 'overview';
  const overview = useQuery({ queryKey: ['memories', base], queryFn: () => fetchMemories(base), retry: false });
  const identity = useQuery<PublicProfile | null>({
    queryKey: userId ? ['identity', 'public-profile', userId] : ['identity', 'current-user'],
    queryFn: userId
      ? async () => (await fetchPublicProfiles([userId])).find((profile) => profile.id === userId) ?? null
      : fetchCurrentUser,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const timeline = useQuery<Awaited<ReturnType<typeof fetchTimeline>>>({ queryKey: ['memories', 'timeline', base], queryFn: () => fetchTimeline(base), enabled: location.pathname.endsWith('/timeline') });
  const photos = useQuery<Awaited<ReturnType<typeof fetchPhotos>>>({ queryKey: ['memories', 'photos', base], queryFn: () => fetchPhotos(base), enabled: location.pathname.endsWith('/photos') });
  const visitors = useQuery({ queryKey: ['memories', 'visitors', base], queryFn: () => fetchVisitors(base), enabled: location.pathname.endsWith('/visitors') });

  const loading = overview.isLoading || timeline.isLoading || photos.isLoading || visitors.isLoading;
  const failed = overview.isError || timeline.isError || photos.isError || visitors.isError;

  useGSAP(() => {
    const root = routeRef.current;
    if (!root) return;
    const previousView = previousViewRef.current;
    previousViewRef.current = view;
    if (!previousView || previousView === view) return;

    const activeTab = root.querySelector<HTMLElement>('[data-memory-tab][aria-current="page"]');
    const activeIcon = activeTab?.querySelector<SVGElement>('svg');
    const indicator = activeTab?.querySelector<HTMLElement>('[data-memory-tab-indicator]');
    const tabList = activeTab?.parentElement;
    const primary = root.querySelector<HTMLElement>('[data-memory-primary]');
    const viewRoot = root.querySelector<HTMLElement>(`[data-memory-view="${view}"]`);
    const arrivals = viewRoot ? Array.from(viewRoot.querySelectorAll<HTMLElement>('[data-memory-arrival]')) : [];
    const arrivalTargets = arrivals.length ? arrivals : viewRoot ? [viewRoot] : [];
    const previousIndex = memoryViewOrder.indexOf(previousView);
    const nextIndex = memoryViewOrder.indexOf(view);
    const direction = nextIndex >= previousIndex ? 1 : -1;

    return withMotionPreferences(root, ({ reducedMotion }) => {
      const motionTargets = [activeTab, activeIcon, indicator, primary, ...arrivalTargets].filter(Boolean);
      const desiredScrollLeft = activeTab && tabList
        ? Math.max(0, Math.min(tabList.scrollWidth - tabList.clientWidth, activeTab.offsetLeft + activeTab.offsetWidth / 2 - tabList.clientWidth / 2))
        : 0;

      if (reducedMotion) {
        if (tabList) tabList.scrollLeft = desiredScrollLeft;
        if (motionTargets.length) gsap.set(motionTargets, { clearProps: 'transform,opacity,visibility,willChange' });
        return;
      }

      const timeline = gsap.timeline({ defaults: { overwrite: 'auto' } });
      if (tabList) {
        timeline.to(tabList, {
          scrollLeft: desiredScrollLeft,
          duration: motionTokens.duration.state,
          ease: motionTokens.ease.quiet,
        }, 0);
      }
      if (indicator) {
        timeline.fromTo(indicator, { scaleX: 0.36 }, {
          scaleX: 1,
          duration: motionTokens.duration.state,
          ease: motionTokens.ease.route,
          transformOrigin: '50% 50%',
          clearProps: 'transform,transformOrigin',
        }, 0);
      }
      if (activeIcon) {
        timeline.fromTo(activeIcon, { autoAlpha: 0.64, scale: 0.88 }, {
          autoAlpha: 1,
          scale: 1,
          duration: motionTokens.duration.state,
          ease: motionTokens.ease.route,
          clearProps: 'transform,opacity,visibility',
        }, 0);
      }
      if (primary) {
        timeline.fromTo(primary, { autoAlpha: 0.9, x: direction * 5 }, {
          autoAlpha: 1,
          x: 0,
          duration: motionTokens.duration.state,
          ease: motionTokens.ease.route,
          willChange: 'transform,opacity',
          clearProps: 'transform,opacity,visibility,willChange',
        }, 0);
      }
      if (arrivalTargets.length) {
        timeline.fromTo(arrivalTargets, { autoAlpha: 0.82, x: direction * 7, y: 2 }, {
          autoAlpha: 1,
          x: 0,
          y: 0,
          duration: motionTokens.duration.state,
          ease: motionTokens.ease.route,
          stagger: 0.018,
          willChange: 'transform,opacity',
          clearProps: 'transform,opacity,visibility,willChange',
        }, 0.025);
      }
      return () => timeline.kill();
    });
  }, { dependencies: [view, loading, failed], scope: routeRef, revertOnUpdate: true });

  if (loading) return <Loading profile={Boolean(userId)} />;
  if (failed) return <ErrorState retry={() => {
    void overview.refetch();
    void timeline.refetch();
    void photos.refetch();
    void visitors.refetch();
  }} />;

  const map = overview.data?.map ?? [];
  const summary = overview.data?.summary;

  return (
    <section ref={routeRef} className="memories-route">
      <IdentityMasthead
        ownProfile={!userId}
        profile={identity.data}
        showMapAction={map.length > 0 || (!isOverview && !isMap)}
      />
      {isOverview || isMap
        ? map.length
          ? <MemoryField items={map} summary={summary} expanded={isMap} canDelete={!userId} />
          : <MemorySeed summary={summary} ownProfile={!userId} />
        : <MemoryStats summary={summary} standalone />}
      <div className="memories-toolbar">
        <nav className="memories-tabs" aria-label={t('memories.memoryViews')}>
          {tabs.map(({ path, labelKey, icon: Icon }) => {
            const destination = userId ? path.replace('/me', base) : path;
            const active = path === '/me' && userId
              ? location.pathname === `/profile/${userId}` || location.pathname === base
              : location.pathname === destination;
            return (
              <Link key={path} className={active ? 'active' : undefined} aria-current={active ? 'page' : undefined} data-memory-tab to={destination}>
                <Icon aria-hidden={true} />
                <span className="memories-tabs__label">{t(labelKey)}</span>
                <span className="memories-tabs__indicator" data-memory-tab-indicator aria-hidden="true" />
              </Link>
            );
          })}
        </nav>
      </div>

      {isOverview && map.length > 1 ? <div className="memories-overview" data-memory-view="overview"><MemoryLedger items={map.slice(1)} title={t('memories.recentArchive')} titleId="memory-ledger-recent" emptyText={t('memories.noMemories')} canDelete={!userId} /></div> : null}
      {isMap && map.length > 1 ? <div className="memories-map-view" data-memory-view="map"><MemoryLedger items={map.slice(1)} title={t('memories.coordinateIndex')} titleId="memory-ledger-coordinates" emptyText={t('memories.noVisibleMapMemories')} canDelete={!userId} /></div> : null}
      {isTimeline ? (
        <section className="memories-view memories-timeline" aria-labelledby="memories-timeline-heading" data-memory-view="timeline">
          <div className="memories-view__heading" data-memory-arrival><span><CalendarDays aria-hidden="true" /><h2 id="memories-timeline-heading">{t('memories.timeline')}</h2></span><strong>{timeline.data?.items.length ?? 0}</strong></div>
          <MemoryLedger items={timeline.data?.items ?? []} title={t('memories.chronologicalRecord')} titleId="memory-ledger-timeline" emptyText={t('memories.timelineEmpty')} canDelete={!userId} />
        </section>
      ) : null}
      {isPhotos ? (
        <section className="memories-view memories-photos" aria-labelledby="memories-photos-heading" data-memory-view="photos">
          <div className="memories-view__heading" data-memory-arrival><span><Camera aria-hidden="true" /><h2 id="memories-photos-heading">{t('memories.photos')}</h2></span><strong>{photos.data?.items.length ?? 0}</strong></div>
          {photos.data?.items.length ? <div className="memories-photo-grid">{photos.data.items.map((item) => <MemoryPhoto key={item.assetId} item={item} locale={locale} />)}</div> : <MemoryEmpty action>{t('memories.noPhotos')}</MemoryEmpty>}
        </section>
      ) : null}
      {isVisitors ? (
        <section className="memories-view memories-visitors" aria-labelledby="memories-visitors-heading" data-memory-view="visitors">
          <div className="memories-view__heading" data-memory-arrival><span><Eye aria-hidden="true" /><h2 id="memories-visitors-heading">{t('memories.visitors')}</h2></span><strong>{visitors.data?.items.length ?? 0}</strong></div>
          {visitors.data?.items.length ? <ol>{visitors.data.items.map((item) => <li key={item.id} data-memory-arrival><span className="memories-visitor__avatar" aria-hidden="true"><UserRound /></span><strong>{item.name}</strong><time dateTime={item.visitedAt}>{formatDate(item.visitedAt, locale)}</time></li>)}</ol> : <MemoryEmpty>{t('memories.visitorsEmpty')}</MemoryEmpty>}
        </section>
      ) : null}
    </section>
  );
}
