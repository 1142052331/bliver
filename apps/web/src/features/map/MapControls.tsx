import { IconButton } from '@bliver/ui';
import { LocateFixed, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface MapControlStatus {
  readonly kind: 'info' | 'error';
  readonly message: string;
}

export interface MapControlsProps {
  readonly visibility: string;
  readonly searchOpen: boolean;
  readonly onVisibilityChange: (value: string) => void;
  readonly onSearchOpenChange: (open: boolean) => void;
  readonly onSearch: (query: string) => void | Promise<void>;
  readonly onLocate: () => void | Promise<void>;
  readonly status?: MapControlStatus;
  readonly onDismissStatus?: () => void;
}

export function MapControls({
  visibility,
  searchOpen,
  onVisibilityChange,
  onSearchOpenChange,
  onSearch,
  onLocate,
  status,
  onDismissStatus,
}: MapControlsProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [locating, setLocating] = useState(false);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const previousSearchOpenRef = useRef(searchOpen);

  useEffect(() => {
    if (previousSearchOpenRef.current && !searchOpen) {
      searchTriggerRef.current?.focus();
    }
    previousSearchOpenRef.current = searchOpen;
  }, [searchOpen]);

  const closeSearch = (): void => {
    setQuery('');
    onSearchOpenChange(false);
  };
  const submitSearch = (): void => {
    const value = query.trim();
    if (value) void onSearch(value);
  };
  const locate = async (): Promise<void> => {
    setLocating(true);
    try {
      await onLocate();
    } finally {
      setLocating(false);
    }
  };

  return (
    <div className="map-route__controls">
      <IconButton
        ref={searchTriggerRef}
        aria-expanded={searchOpen}
        className="map-route__icon-control"
        label={t('map.searchPlaces')}
        onClick={() => searchOpen ? submitSearch() : onSearchOpenChange(true)}
      >
        <Search aria-hidden="true" />
      </IconButton>
      <IconButton
        className="map-route__icon-control"
        label={locating ? t('map.locating') : t('map.locateMe')}
        loading={locating}
        onClick={() => void locate()}
      >
        <LocateFixed aria-hidden="true" />
      </IconButton>
      <label className="map-route__visibility-control">
        <span className="map-route__control-label">{t('map.visibility')}</span>
        <select
          aria-label={t('map.visibility')}
          value={visibility}
          onChange={(event) => onVisibilityChange(event.target.value)}
        >
          <option value="">{t('map.visibilityAll')}</option>
          <option value="public">{t('map.visibilityPublic')}</option>
          <option value="friends">{t('map.visibilityFriends')}</option>
          <option value="private">{t('map.visibilityPrivate')}</option>
        </select>
      </label>
      {searchOpen ? (
        <div className="map-route__search-field">
          <input
            aria-label={t('map.placeSearch')}
            autoFocus
            className="map-route__search-input"
            placeholder={t('map.search')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submitSearch();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                closeSearch();
              }
            }}
          />
          <IconButton
            className="map-route__search-close"
            label={t('map.closeSearch')}
            onClick={closeSearch}
          >
            <X aria-hidden="true" />
          </IconButton>
        </div>
      ) : null}
      {status ? (
        <div
          className={`map-route__control-notice map-route__control-notice--${status.kind}`}
          data-testid="map-control-notice"
          role={status.kind === 'error' ? 'alert' : 'status'}
        >
          <span>{status.message}</span>
          {onDismissStatus ? (
            <IconButton label={t('common.close')} onClick={onDismissStatus}>
              <X aria-hidden="true" />
            </IconButton>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
