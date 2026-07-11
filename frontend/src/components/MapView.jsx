// @feature 地图视图 | Map View | MapView
import { useEffect, useState } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import MapResizeHandler from './MapResizeHandler';
import ClusterMarkers from './ClusterMarkers';
import FlyToFootprint from './FlyToFootprint';
import RecenterOnLoad from './RecenterOnLoad';
import PanToTarget from './PanToTarget';
import MapContextMenu from './MapContextMenu';
import MapHomeControls from './MapHomeControls';
import MapStatusNotice from './map/MapStatusNotice';

const CENTER = [33.5597, 133.5311];

export default function MapView({
  footprints, shareTarget, activeFootprintId, timelineTargetFpId,
  user, isAdmin,
  setFlyArrivedFp, setTimelineTargetFpId,
  loading, fetching = false, error, onRetry,
  emptyReason = 'account', onClearFilters, onExpandScope,
  query, queryContext, viewerKey, isAuthenticated, locationContext, onQueryChange,
  onRequestLocation, onSetFixedScope, onClearFixedScope, onSelectFootprint,
  pulseIds = new Set(), selectedId = null, onPulseComplete,
}) {
  const [tileErrorCount, setTileErrorCount] = useState(0);
  const [tileFailed, setTileFailed] = useState(false);
  const [tileGeneration, setTileGeneration] = useState(0);
  const [online, setOnline] = useState(() => navigator.onLine !== false);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const handleTileError = () => {
    setTileErrorCount((count) => {
      const next = count + 1;
      if (next >= 3) setTileFailed(true);
      return next;
    });
  };

  const handleTileLoad = () => {
    setTileErrorCount(0);
    setTileFailed(false);
  };

  const retryTiles = () => {
    setTileErrorCount(0);
    setTileFailed(false);
    setTileGeneration((generation) => generation + 1);
  };

  const empty = !loading && !error && footprints.length === 0;
  const emptyNotice = emptyReason === 'filters'
    ? { message: '当前筛选没有足迹', actionLabel: '清除筛选', onAction: onClearFilters }
    : emptyReason === 'scope'
      ? { message: '这个地区暂时没有可见足迹', actionLabel: '查看更大范围', onAction: onExpandScope }
      : { message: '这里还没有足迹', detail: '发布第一条足迹' };

  return (
    <MapContainer key="map" center={CENTER} zoom={6} scrollWheelZoom zoomControl={false}
      className="w-full h-full"
      style={{ zIndex: 0 }}>
      <MapResizeHandler />
      <TileLayer
        key={tileGeneration}
        className="bliver-map-tiles"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url={`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png?bliver=${tileGeneration}`}
        crossOrigin="anonymous"
        eventHandlers={{ tileerror: handleTileError, load: handleTileLoad }}
      />
      <RecenterOnLoad footprints={footprints} targetId={shareTarget} />
      <FlyToFootprint
        footprints={footprints}
        activeFootprintId={activeFootprintId}
        onArrive={(fp) => setFlyArrivedFp(fp)}
      />
      <PanToTarget
        targetId={timelineTargetFpId}
        footprints={footprints}
        onArrive={(fp) => {
          setTimelineTargetFpId(null);
          setFlyArrivedFp(fp);
        }}
      />
      <ClusterMarkers
        footprints={footprints}
        pulseIds={pulseIds}
        selectedId={selectedId}
        onPulseComplete={onPulseComplete}
      />
      <MapHomeControls
        footprints={footprints}
        query={query}
        queryContext={queryContext}
        viewerKey={viewerKey}
        isAuthenticated={isAuthenticated}
        locationContext={locationContext}
        onQueryChange={onQueryChange}
        onRequestLocation={onRequestLocation}
        onSetFixedScope={onSetFixedScope}
        onClearFixedScope={onClearFixedScope}
        onSelectFootprint={onSelectFootprint}
      />
      {isAdmin && <MapContextMenu />}
      <div className="bliver-map-notices" aria-live="polite">
        {tileFailed && (
          <MapStatusNotice kind="tile" message="底图暂时无法加载" actionLabel="重试底图" onAction={retryTiles} />
        )}
        {error && (
          <MapStatusNotice kind="data" message="足迹暂时无法加载" actionLabel="重试足迹" onAction={onRetry} />
        )}
        {loading && footprints.length === 0 && (
          <MapStatusNotice kind="refresh" message="正在读取地图足迹" />
        )}
        {fetching && footprints.length > 0 && !error && (
          <MapStatusNotice kind="refresh" message="正在更新足迹" />
        )}
        {!online && footprints.length > 0 && (
          <MapStatusNotice kind="offline" message="当前显示离线缓存" />
        )}
        {empty && <MapStatusNotice kind="empty" {...emptyNotice} />}
      </div>
    </MapContainer>
  );
}
