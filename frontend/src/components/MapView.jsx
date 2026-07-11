// @feature 地图视图 | Map View | MapView
import { MapContainer, TileLayer } from 'react-leaflet';
import MapResizeHandler from './MapResizeHandler';
import ClusterMarkers from './ClusterMarkers';
import FlyToFootprint from './FlyToFootprint';
import RecenterOnLoad from './RecenterOnLoad';
import PanToTarget from './PanToTarget';
import MapContextMenu from './MapContextMenu';
import MapHomeControls from './MapHomeControls';

const CENTER = [33.5597, 133.5311];

export default function MapView({
  footprints, shareTarget, activeFootprintId, timelineTargetFpId,
  user, isAdmin,
  setFlyArrivedFp, setTimelineTargetFpId,
  loading, error, onRetry,
}) {
  return (
    <MapContainer key="map" center={CENTER} zoom={6} scrollWheelZoom zoomControl={false}
      className="w-full h-full"
      style={{ zIndex: 0 }}>
      <MapResizeHandler />
      <TileLayer
        className="bliver-map-tiles"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        crossOrigin="anonymous"
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
        userId={user?._id}
        isAdmin={isAdmin}
      />
      <MapHomeControls footprints={footprints} />
      {isAdmin && <MapContextMenu />}
      {(loading || error || (!loading && !error && footprints.length === 0)) && (
        <div className="bliver-map-state" role={error ? 'alert' : 'status'}>
          {loading && <><span className="bliver-map-state__spinner" aria-hidden="true" />正在读取地图足迹</>}
          {error && <><strong>足迹暂时无法加载</strong><button type="button" onClick={onRetry}>重试</button></>}
          {!loading && !error && footprints.length === 0 && <><strong>这里还没有足迹</strong><span>发布第一条，地图就会开始记录你的生活。</span></>}
        </div>
      )}
    </MapContainer>
  );
}
