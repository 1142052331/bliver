import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Search, X } from 'lucide-react';
import { apiClient } from '../../api';
import { DEFAULT_MAP_QUERY } from '../../domain/mapQuery';

function resultLabel(item) {
  return item.kind === 'place'
    ? item.value.label
    : item.value.placeName || item.value.message || '未命名足迹';
}

export default function MapSearch({
  query,
  queryContext = DEFAULT_MAP_QUERY,
  viewerKey = 'guest',
  onQueryChange,
  onSelectPlace,
  onSelectFootprint,
}) {
  const [value, setValue] = useState(query || '');
  const [debounced, setDebounced] = useState(query || '');
  const [expanded, setExpanded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    setValue(query || '');
    setDebounced(query || '');
  }, [query]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = value.trim().slice(0, 80);
      setDebounced(next);
      if (next !== (query || '')) onQueryChange(next);
    }, 300);
    return () => clearTimeout(timer);
  }, [onQueryChange, query, value]);

  const searchQuery = useQuery({
    queryKey: ['footprints', 'map-search', viewerKey, { ...queryContext, query: debounced }],
    queryFn: async ({ signal }) => (
      await apiClient.map.search({ ...queryContext, query: debounced }, { signal })
    ).data,
    enabled: Boolean(debounced),
    staleTime: 60_000,
  });

  const data = searchQuery.data || { places: [], footprints: [], errors: {} };
  const results = useMemo(() => [
    ...(data.places || []).map((place) => ({ kind: 'place', value: place })),
    ...(data.footprints || []).map((footprint) => ({ kind: 'footprint', value: footprint })),
  ], [data.footprints, data.places]);

  useEffect(() => setActiveIndex(-1), [debounced, results.length]);

  const choose = (result) => {
    if (!result) return;
    if (result.kind === 'place') onSelectPlace(result.value);
    else onSelectFootprint(result.value);
    setExpanded(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      setExpanded(false);
      setActiveIndex(-1);
      return;
    }
    if (!expanded || results.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) => {
        if (current < 0) return direction > 0 ? 0 : results.length - 1;
        return (current + direction + results.length) % results.length;
      });
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      choose(results[activeIndex]);
    }
  };

  const showResults = expanded && Boolean(value.trim());
  let optionOffset = 0;

  return (
    <div className="bliver-map-search">
      <div className="bliver-map-search__field">
        <Search size={18} aria-hidden="true" />
        <input
          type="search"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setExpanded(true);
          }}
          onFocus={() => setExpanded(Boolean(value.trim()))}
          onKeyDown={handleKeyDown}
          role="searchbox"
          aria-label="搜索地点或足迹"
          aria-expanded={showResults}
          aria-controls="bliver-map-search-results"
          aria-activedescendant={activeIndex >= 0 ? `bliver-map-search-option-${activeIndex}` : undefined}
          placeholder="搜索地点或足迹"
          autoComplete="off"
        />
        {value && (
          <button
            type="button"
            className="bliver-map-search__clear"
            aria-label="清除搜索"
            onClick={() => {
              setValue('');
              setDebounced('');
              setExpanded(false);
              onQueryChange('');
            }}
          >
            <X size={17} />
          </button>
        )}
      </div>

      {showResults && (
        <div id="bliver-map-search-results" className="bliver-map-search__results" role="listbox" aria-label="搜索结果">
          {searchQuery.isFetching && <p className="bliver-map-search__state">正在搜索</p>}
          {searchQuery.isError && <p className="bliver-map-search__error">搜索暂时不可用</p>}

          {(data.places || []).length > 0 && (
            <section aria-labelledby="bliver-place-results">
              <h3 id="bliver-place-results">地点</h3>
              {data.places.map((place) => {
                const index = optionOffset++;
                return (
                  <button
                    key={`place-${place.id}`}
                    id={`bliver-map-search-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={activeIndex === index}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose({ kind: 'place', value: place })}
                  >
                    <MapPin size={16} aria-hidden="true" />
                    <span>{place.label}</span>
                  </button>
                );
              })}
            </section>
          )}
          {data.errors?.places && <p className="bliver-map-search__error">{data.errors.places}</p>}

          {(data.footprints || []).length > 0 && (
            <section aria-labelledby="bliver-footprint-results">
              <h3 id="bliver-footprint-results">足迹</h3>
              {data.footprints.map((footprint) => {
                const index = optionOffset++;
                const item = { kind: 'footprint', value: footprint };
                return (
                  <button
                    key={`footprint-${footprint._id}`}
                    id={`bliver-map-search-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={activeIndex === index}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(item)}
                  >
                    <span aria-hidden="true">{footprint.mood || '•'}</span>
                    <span>{resultLabel(item)}</span>
                    <small>{footprint.userId?.name || ''}</small>
                  </button>
                );
              })}
            </section>
          )}
          {data.errors?.footprints && <p className="bliver-map-search__error">{data.errors.footprints}</p>}

          {!searchQuery.isFetching && !searchQuery.isError && results.length === 0
            && !data.errors?.places && !data.errors?.footprints
            && <p className="bliver-map-search__state">没有找到相关结果</p>}
        </div>
      )}
    </div>
  );
}
