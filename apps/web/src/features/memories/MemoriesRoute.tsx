import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'react-router-dom';
import { fetchMemories, fetchPhotos, fetchTimeline, fetchVisitors } from './api.js';
import './memories.css';

function Loading({ title = 'My space' }: { readonly title?: string }) { return <section className="memories-route" aria-busy="true"><h1>{title}</h1><p role="status">Loading memories</p><p>Pending migration</p></section>; }
function ErrorState({ retry }: { retry: () => void }) { return <section className="memories-route"><h1>Memories unavailable</h1><p>We could not load this view.</p><button type="button" onClick={retry}>Try again</button></section>; }
const tabs = [['/me', 'Overview'], ['/me/map', 'Map'], ['/me/timeline', 'Timeline'], ['/me/photos', 'Photos'], ['/me/visitors', 'Visitors']] as const;
export function MemoriesRoute() {
  const location = useLocation();
  const userId = useParams().userId;
  const base = userId ? `/profile/${userId}/memories` : '/me';
  const overview = useQuery({ queryKey: ['memories', base], queryFn: () => fetchMemories(base), retry: false });
  const timeline = useQuery<Awaited<ReturnType<typeof fetchTimeline>>>({ queryKey: ['memories', 'timeline', base], queryFn: () => fetchTimeline(), enabled: location.pathname.endsWith('/timeline') });
  const photos = useQuery<Awaited<ReturnType<typeof fetchPhotos>>>({ queryKey: ['memories', 'photos', base], queryFn: () => fetchPhotos(), enabled: location.pathname.endsWith('/photos') });
  const visitors = useQuery({ queryKey: ['memories', 'visitors'], queryFn: fetchVisitors, enabled: location.pathname.endsWith('/visitors') });
  if (overview.isLoading || timeline.isLoading || photos.isLoading || visitors.isLoading) return <Loading title={userId ? 'Profile' : 'My space'} />;
  if (overview.isError || timeline.isError || photos.isError || visitors.isError) return <ErrorState retry={() => { void overview.refetch(); void timeline.refetch(); void photos.refetch(); void visitors.refetch(); }} />;
  const map = overview.data?.map ?? [];
  const summary = overview.data?.summary;
  const isMap = location.pathname.endsWith('/map');
  const isTimeline = location.pathname.endsWith('/timeline');
  const isPhotos = location.pathname.endsWith('/photos');
  const isVisitors = location.pathname.endsWith('/visitors');
  return <section className="memories-route"><header className="memories-header"><div><p className="memories-eyebrow">Personal archive</p><h1>{userId ? 'Profile memories' : 'Memories'}</h1><p>Authorized history, photos, and visitors.</p></div><Link to="/map">Open map</Link></header><nav className="memories-tabs" aria-label="Memory views">{tabs.map(([path, label]) => <Link key={path} className={location.pathname === path ? 'active' : undefined} to={userId ? path.replace('/me', base) : path}>{label}</Link>)}</nav>{!isMap && !isTimeline && !isPhotos && !isVisitors ? <><section className="memories-summary" aria-label="Memory summary"><strong>{summary?.footprintCount ?? 0}</strong><span>footprints</span><strong>{summary?.photoCount ?? 0}</strong><span>photos</span><strong>{summary?.visitorCount ?? 0}</strong><span>visitors</span></section><section className="memories-list">{map.length ? map.map((item) => <article key={item.id}><Link to={`/footprints/${item.id}`}><time dateTime={item.publishedAt}>{new Date(item.publishedAt).toLocaleDateString()}</time><p>{item.message || 'A shared moment'}</p></Link></article>) : <p className="memories-empty">No memories are visible here yet.</p>}</section></> : null}{isMap ? <section className="memories-list"><h2>Map memories</h2>{map.length ? map.map((item) => <article key={item.id}><Link to={`/footprints/${item.id}`}>{item.displayPoint.lat.toFixed(3)}, {item.displayPoint.lng.toFixed(3)}</Link></article>) : <p className="memories-empty">No visible map memories.</p>}</section> : null}{isTimeline ? <section className="memories-list"><h2>Timeline</h2>{timeline.data?.items.length ? timeline.data.items.map((item) => <article key={item.id}><Link to={`/footprints/${item.id}`}>{item.message || 'A shared moment'}</Link></article>) : <p className="memories-empty">Your timeline is empty.</p>}</section> : null}{isPhotos ? <section className="memories-photo-grid"><h2>Photos</h2>{photos.data?.items.length ? photos.data.items.map((item) => <Link key={item.assetId} to={`/footprints/${item.footprintId}`}><img src={item.url} alt="Footprint memory" loading="lazy" /></Link>) : <p className="memories-empty">No photos are visible here.</p>}</section> : null}{isVisitors ? <section className="memories-list"><h2>Visitors</h2>{visitors.data?.items.length ? visitors.data.items.map((item) => <article key={item.id}><span>{item.name}</span><time dateTime={item.visitedAt}>{new Date(item.visitedAt).toLocaleDateString()}</time></article>) : <p className="memories-empty">Visitor history is private or empty.</p>}</section> : null}</section>;
}
