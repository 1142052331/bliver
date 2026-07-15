import { Button } from '@bliver/ui';
import { useState } from 'react';

export interface MapControlsProps { readonly visibility: string; readonly onVisibilityChange: (value: string) => void; readonly onSearch: (query: string) => void; readonly onLocate: () => void | Promise<void>; }
export function MapControls({ visibility, onVisibilityChange, onSearch, onLocate }: MapControlsProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [locating, setLocating] = useState(false);
  const submitSearch = (): void => { setSearchOpen(true); onSearch(query.trim()); };
  const locate = async (): Promise<void> => { setLocating(true); try { await onLocate(); } finally { setLocating(false); } };
  return <div className="map-route__controls"><Button variant="secondary" aria-label="Search places" onClick={submitSearch}>Search</Button>{searchOpen ? <input aria-label="Place search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submitSearch(); }} /> : null}<Button variant="secondary" aria-label="Locate me" onClick={() => void locate()} disabled={locating}>{locating ? 'Locating...' : 'Locate'}</Button><label><span className="map-route__control-label">Visibility</span><select aria-label="Visibility filter" value={visibility} onChange={(event) => onVisibilityChange(event.target.value)}><option value="">All</option><option value="public">Public</option><option value="friends">Friends</option><option value="private">Private</option></select></label></div>;
}
