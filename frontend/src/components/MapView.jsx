// @feature 地图视图 | Map View | MapView
import { MapContainer, TileLayer } from 'react-leaflet';
import MapResizeHandler from './MapResizeHandler';
import ClusterMarkers from './ClusterMarkers';
import FlyToFootprint from './FlyToFootprint';
import RecenterOnLoad from './RecenterOnLoad';
import PanToTarget from './PanToTarget';
import MapContextMenu from './MapContextMenu';
import LocateMeButton from './LocateMeButton';
import CenterOnLocation from './CenterOnLocation';

const CENTER = [33.5597, 133.5311];

export default function MapView({
  footprints, shareTarget, activeFootprintId, timelineTargetFpId,
  user, isAdmin,
  setFlyArrivedFp, setTimelineTargetFpId,
}) {
  return (
    <MapContainer key="map" center={CENTER} zoom={6} scrollWheelZoom zoomControl={false}
      className="w-full h-full"
      style={{ zIndex: 0 }}>
      <MapResizeHandler />
      <TileLayer
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
      {isAdmin && <MapContextMenu />}
      <LocateMeButton />
      <CenterOnLocation />
    </MapContainer>
  );
}
