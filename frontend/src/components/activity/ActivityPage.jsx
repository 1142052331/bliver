import { useMemo, useState } from 'react';
import useActivityFeed from '../../hooks/useActivityFeed';
import ActivityCard from './ActivityCard';
import ActivityScopeSheet from './ActivityScopeSheet';
import { ActivityEmpty, ActivityError, ActivitySkeletons } from './ActivityStates';

function queryForScope(scope, locationContext = {}) {
  if ((scope === 'smart' && !locationContext.countryCode)
    || (scope === 'region' && (!locationContext.countryCode || !locationContext.regionCode))
    || (scope === 'country' && !locationContext.countryCode)) {
    return { scope: 'global', limit: 20 };
  }
  const query = { scope, limit: 20 };
  if (scope === 'smart' || scope === 'region') {
    if (locationContext.countryCode) query.countryCode = locationContext.countryCode;
  }
  if (scope === 'smart' || scope === 'region') {
    if (locationContext.regionCode) query.regionCode = locationContext.regionCode;
  }
  if (scope === 'country' && locationContext.countryCode) query.countryCode = locationContext.countryCode;
  return query;
}

export default function ActivityPage({
  requireLogin,
  locationContext = {},
  initialScope = 'smart',
  onReact,
  onComment,
  onRequestLocation,
}) {
  const [scope, setScope] = useState(initialScope);
  const [sheetOpen, setSheetOpen] = useState(false);
  const query = useMemo(() => queryForScope(scope, locationContext), [scope, locationContext]);
  const feed = useActivityFeed(query);
  const items = useMemo(() => (feed.data?.pages || []).flatMap((page) => page.items || []).sort((a, b) => {
    const time = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return time || String(b._id).localeCompare(String(a._id));
  }), [feed.data]);
  const hasCached = items.length > 0;
  const isLocationFallback = scope === 'smart' && !locationContext.countryCode;
  return (
    <main className="bliver-activity-page" aria-labelledby="activity-page-title">
      <header className="bliver-activity-page__header">
        <div><p className="bliver-activity-page__eyebrow">公开发现</p><h1 id="activity-page-title">动态</h1></div>
        <button type="button" className="bliver-activity-page__scope" aria-label="选择动态范围" onClick={() => setSheetOpen(true)}>{scope === 'smart' ? '智能范围' : scope === 'region' ? '本省' : scope === 'country' ? '本国' : '全球'}</button>
      </header>
      {isLocationFallback && (
        <aside className="bliver-activity-location-notice" aria-label="定位范围提示">
          <p>无法获取位置，当前显示全球公开动态。</p>
          {onRequestLocation && (
            <button type="button" onClick={() => onRequestLocation({ explicit: true })}>开启定位</button>
          )}
        </aside>
      )}
      {feed.isPending && !feed.data ? <ActivitySkeletons /> : feed.isError && !hasCached ? <ActivityError onRetry={feed.refetch} /> : items.length === 0 ? <ActivityEmpty fixed={scope !== 'smart'} onBroaden={() => setScope('smart')} /> : <div className="bliver-activity-list">{items.map((item) => <ActivityCard key={item._id} item={item} requireLogin={requireLogin} onReact={onReact} onComment={onComment} />)}</div>}
      {feed.isError && hasCached && <ActivityError cached onRetry={feed.refetch} />}
      <ActivityScopeSheet
        open={sheetOpen}
        value={scope}
        onChange={setScope}
        onClose={() => setSheetOpen(false)}
        regionName={locationContext.regionName}
        countryName={locationContext.countryName}
        regionAvailable={Boolean(locationContext.regionCode && locationContext.countryCode)}
        countryAvailable={Boolean(locationContext.countryCode)}
      />
    </main>
  );
}
