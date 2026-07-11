import { Crosshair, ListFilter, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { useMap } from 'react-leaflet';
import { DEFAULT_MAP_QUERY } from '../domain/mapQuery';
import MapFilterSheet from './map/MapFilterSheet';
import MapScopeControl from './map/MapScopeControl';
import MapSearch from './map/MapSearch';

const DEFAULT_CENTER = [33.5597, 133.5311];

export default function MapHomeControls({
  footprints,
  query = DEFAULT_MAP_QUERY,
  isAuthenticated = false,
  locationContext = { scope: 'smart', reason: 'unresolved' },
  onQueryChange = () => {},
  onSelectPlace = () => {},
  onSelectFootprint = () => {},
  onRequestLocation,
}) {
  const map = useMap();
  const [locationError, setLocationError] = useState('');
  const [activeSheet, setActiveSheet] = useState(null);

  const resetView = () => {
    const latest = footprints.find((footprint) => footprint.location?.lat && footprint.location?.lng);
    setLocationError('');
    map.flyTo(latest ? [latest.location.lat, latest.location.lng] : DEFAULT_CENTER, latest ? 11 : 6, { duration: 0.6 });
  };

  const locate = () => {
    if (onRequestLocation) {
      setLocationError('');
      Promise.resolve(onRequestLocation({ explicit: true })).then((result) => {
        if (result?.coords) map.flyTo([result.coords.lat, result.coords.lng], 14, { duration: 0.8 });
        else if (result?.status === 'denied') setLocationError('无法获取当前位置，请检查定位权限');
        else if (result?.status === 'unavailable') setLocationError('此浏览器不支持定位');
      });
      return;
    }
    if (!navigator.geolocation) {
      setLocationError('此浏览器不支持定位');
      return;
    }

    setLocationError('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => map.flyTo([coords.latitude, coords.longitude], 14, { duration: 0.8 }),
      () => setLocationError('无法获取当前位置，请检查定位权限'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  };

  const changeScope = (scope) => {
    const next = { ...query, scope: scope.scope };
    delete next.countryCode;
    delete next.regionCode;
    if (scope.countryCode) next.countryCode = scope.countryCode;
    if (scope.regionCode) next.regionCode = scope.regionCode;
    onQueryChange(next);
  };

  const activeFilterCount = [
    query.relationship !== DEFAULT_MAP_QUERY.relationship,
    query.period !== DEFAULT_MAP_QUERY.period,
    query.content !== DEFAULT_MAP_QUERY.content,
  ].filter(Boolean).length;

  return (
    <div className="bliver-map-controls" aria-label="地图控制">
      <div className="bliver-map-controls__top">
        <MapSearch
          query={query.query}
          queryContext={query}
          onQueryChange={(search) => onQueryChange({ ...query, query: search })}
          onSelectPlace={onSelectPlace}
          onSelectFootprint={onSelectFootprint}
        />
        <div className="bliver-map-toolbar">
          <MapScopeControl
            open={activeSheet === 'scope'}
            value={query.scope}
            context={locationContext}
            onOpen={() => setActiveSheet('scope')}
            onClose={() => setActiveSheet(null)}
            onChange={changeScope}
            onRequestLocation={onRequestLocation || (() => locate())}
          />
          <button
            type="button"
            className="bliver-map-toolbar__control"
            onClick={() => setActiveSheet('filters')}
            aria-expanded={activeSheet === 'filters'}
            aria-haspopup="dialog"
            aria-label={activeFilterCount ? `筛选，已启用 ${activeFilterCount} 项` : '筛选'}
          >
            <ListFilter size={17} />
            <span>筛选</span>
            {activeFilterCount > 0 && <b aria-hidden="true">{activeFilterCount}</b>}
          </button>
        </div>
      </div>
      <div className="bliver-map-controls__summary" aria-live="polite">{footprints.length} 条足迹</div>
      <div className="bliver-map-controls__actions">
        <button type="button" onClick={locate} className="bliver-map-controls__button" aria-label="定位到我的位置" title="定位到我的位置">
          <Crosshair size={20} />
        </button>
        <button type="button" onClick={resetView} className="bliver-map-controls__button" aria-label="回到足迹视野" title="回到足迹视野">
          <RotateCcw size={19} />
        </button>
      </div>
      {locationError && <p className="bliver-map-controls__error" role="status">{locationError}</p>}
      <MapFilterSheet
        open={activeSheet === 'filters'}
        query={query}
        isAuthenticated={isAuthenticated}
        onApply={onQueryChange}
        onClose={() => setActiveSheet(null)}
      />
    </div>
  );
}
