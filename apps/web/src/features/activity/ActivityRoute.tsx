import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Button, Surface } from '@bliver/ui';
import type { ActivityPageDto, ActivityQuery, FootprintDto } from '@bliver/contracts';
import { addComment, addReaction, addReply, reportFootprint, useActivityInfiniteQuery } from './api.js';
import { consumePendingAction, savePendingAction, type PendingAction } from '../../platform/pending-action.js';
import { ActivityCard } from './ActivityCard.js';
import { ActivityScopeSheet } from './ActivityScopeSheet.js';
import './activity.css';

export type ActivityState = 'loading' | 'empty' | 'error' | 'ready';
export interface ActivityRouteProps { readonly state?: ActivityState; readonly items?: readonly FootprintDto[]; readonly page?: ActivityPageDto; readonly onRetry?: () => void; readonly loadFromApi?: boolean; }
const defaultQuery: ActivityQuery = { scope: 'smart', relationship: 'all', content: 'all', limit: 20 };
const labels = { region: 'Around your region', country: 'Across your country', global: 'Around the world' } as const;
export function savePendingActivityAction(action: Record<string, string>): void { savePendingAction(action as Omit<PendingAction, 'returnTo'>); }
export function ActivityRoute(props: ActivityRouteProps) { const client = useMemo(() => new QueryClient(), []); return <QueryClientProvider client={client}><ActivityRouteBody {...props} /></QueryClientProvider>; }
function ActivityRouteBody({ state = 'ready', items = [], page, onRetry, loadFromApi = false }: ActivityRouteProps) {
  const [query, setQuery] = useState(defaultQuery); const [scopeOpen, setScopeOpen] = useState(false); const remote = useActivityInfiniteQuery(query, loadFromApi); const data = loadFromApi ? remote.data?.pages[remote.data.pages.length - 1] : page; const visible = loadFromApi ? (remote.data?.pages.flatMap((current) => current.items) ?? []) : (page?.items ?? items);
  const location = useLocation();
  const replayed = useRef<string | null>(null);
  useEffect(() => { const pending = (location.state as { pendingAction?: PendingAction } | null)?.pendingAction; if (!pending) return; const fingerprint = JSON.stringify(pending); if (replayed.current === fingerprint) return; replayed.current = fingerprint; void (async () => { try { if (pending.kind === 'reaction' && pending.emoji) await addReaction(pending.footprintId, pending.emoji); else if (pending.kind === 'comment' && pending.content) await addComment(pending.footprintId, pending.content); else if (pending.kind === 'reply' && pending.content && pending.parentCommentId) await addReply(pending.footprintId, pending.parentCommentId, pending.content); else if (pending.kind === 'report' && pending.reason) await reportFootprint(pending.footprintId, pending.reason as 'spam'); } catch { return; } consumePendingAction(); })(); }, [location.state]);
  const retry = (): void => { onRetry?.(); if (loadFromApi) void remote.refetch(); };
  if (state === 'loading' || (loadFromApi && remote.isLoading && !visible.length)) return <section className="activity-route" aria-busy="true"><h1>Activity</h1><p role="status">Loading activity</p></section>;
  if (state === 'error' || remote.isError) return <section className="activity-route activity-route--state"><Surface><h1>Activity is unavailable</h1><p>Your moments are still safe. Try loading this stream again.</p><Button onClick={retry}>Try again</Button></Surface></section>;
  const resolved = data?.resolvedScope ?? 'global';
  return <section className="activity-route"><header className="activity-route__header"><div><p>Discovery</p><h1>Activity</h1><span>{labels[resolved]}</span></div><Button variant="secondary" aria-expanded={scopeOpen} onClick={() => setScopeOpen(true)}>Filter</Button></header><label className="activity-route__search">Search moments<input type="search" value={query.query ?? ''} onChange={(event) => { const { query: _query, cursor: _cursor, ...base } = query; void _query; void _cursor; setQuery({ ...base, ...(event.target.value ? { query: event.target.value } : {}) }); }} /></label>{scopeOpen ? <ActivityScopeSheet value={query} onChange={(value) => { const { cursor: _cursor, ...next } = value; void _cursor; setQuery(next); }} onClose={() => setScopeOpen(false)} /> : null}{state === 'empty' || (!visible.length && !remote.isLoading) ? <div className="activity-route__empty"><h2>No moments in this view</h2><p>Change the area or filters to look farther out.</p></div> : <div className="activity-route__stream">{visible.map((item) => <ActivityCard key={item.id} item={item} onAuthRequired={savePendingActivityAction} />)}</div>}{data?.nextCursor ? <div className="activity-route__more"><Button variant="secondary" disabled={remote.isFetchingNextPage} onClick={() => void remote.fetchNextPage()}>{remote.isFetchingNextPage ? 'Loading more' : 'Load more'}</Button></div> : null}</section>;
}
