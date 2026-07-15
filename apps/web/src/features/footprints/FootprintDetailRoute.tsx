import { Button, Surface } from '@bliver/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useFootprintQuery } from './api.js';
import './footprints.css';
import { ConversationSection } from '../activity/ConversationSection.js';
import { savePendingActionRecord } from '../../platform/pending-action.js';
interface FootprintDetailProps { readonly footprint: { readonly id: string; readonly message: string; readonly visibility: 'public' | 'friends' | 'private'; readonly locationPrecision: 'precise' | 'approximate' }; readonly onClose?: () => void; readonly loadFromApi?: boolean; }
export function FootprintDetailRoute(props: FootprintDetailProps) { const client = useMemo(() => new QueryClient(), []); return <QueryClientProvider client={client}><FootprintDetailBody {...props} /></QueryClientProvider>; }
function FootprintDetailBody({ footprint, onClose, loadFromApi = false }: FootprintDetailProps) { const remote = useFootprintQuery(footprint.id, loadFromApi); const location = useLocation(); const displayed = remote.data ?? footprint; const onAuthRequired = (action: Record<string, string>): void => { savePendingActionRecord(action, `${location.pathname}${location.search}`); }; return <section className="footprint-detail"><Surface><Button variant="ghost" aria-label="Close footprint" onClick={onClose}>Close</Button><h1>Footprint</h1>{remote.isError ? <p role="status">Showing cached footprint</p> : null}<p>{displayed.message}</p><p>{displayed.visibility === 'public' ? 'Public' : displayed.visibility === 'friends' ? 'Friends only' : 'Only you'}</p><p>{displayed.locationPrecision === 'precise' ? 'Precise location' : 'Approximate location'}</p><ConversationSection footprintId={footprint.id} onAuthRequired={onAuthRequired} /></Surface></section>; }
