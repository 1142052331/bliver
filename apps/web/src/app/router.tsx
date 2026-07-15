import { useState } from 'react';
import { geoPoint, publishFootprintRequest, type PublishFootprintRequest } from '@bliver/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createBrowserRouter,
  createMemoryRouter,
  Navigate,
  RouterProvider,
  useLocation,
  useNavigate,
  useSearchParams,
  Link,
  useParams,
} from 'react-router-dom';

import { AppShell } from './AppShell.js';
import { RoutePlaceholder } from './routes/RoutePlaceholder.js';
import { MapRoute } from '../features/map/MapRoute.js';
import { FootprintDetailRoute } from '../features/footprints/FootprintDetailRoute.js';
import { PublishFootprintRoute } from '../features/footprints/PublishFootprintRoute.js';
import type { PublishFootprintRouteProps } from '../features/footprints/PublishFootprintRoute.js';
import { uploadMedia } from '../features/footprints/media-upload.js';
import { RequireAuth } from './guards/RequireAuth.js';
import { ActivityRoute } from '../features/activity/ActivityRoute.js';
import { LoginRoute } from '../features/auth/LoginRoute.js';
import { PeopleRoute } from '../features/social/PeopleRoute.js';
import { ConversationRoute, MessagesRoute } from '../features/conversations/routes.js';
import { MemoriesRoute } from '../features/memories/index.js';
import { NotificationsRoute } from '../features/notifications/index.js';
import { AdminRoute } from '../features/moderation/index.js';

function NotFound() { return <RoutePlaceholder title="Not found" />; }
function SessionExpired() { const location = useLocation(); const destination = typeof location.state?.from === 'string' ? location.state.from : '/map'; return <section><h1>Session expired</h1><p>Please sign in again to continue.</p><Link to="/login" state={{ from: destination }}>Continue to sign in</Link></section>; }
function pointFrom(value: unknown): { readonly lat: number; readonly lng: number } | undefined { const parsed = geoPoint.safeParse(value); return parsed.success ? parsed.data : undefined; }
function FootprintRoute() { const footprintId = useParams().footprintId ?? ''; const navigate = useNavigate(); const close = (): void => { if (typeof window !== 'undefined' && typeof window.history.state?.idx === 'number' && window.history.state.idx > 0) navigate(-1); else navigate('/map', { replace: true }); }; return <FootprintDetailRoute loadFromApi onClose={close} footprint={{ id: footprintId, message: 'Footprint detail', visibility: 'public', locationPrecision: 'approximate' }} />; }
async function publishFootprint(input: PublishFootprintRouteProps['publish'] extends (value: infer T) => Promise<void> ? T : never): Promise<void> {
  const payload: PublishFootprintRequest = publishFootprintRequest.parse({ ...input, mediaAssetIds: input.mediaAssetIds ?? [] });
  const response = await fetch('/api/v1/footprints', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error('Publish failed');
}
function PublishRoute() { const [params] = useSearchParams(); const location = useLocation(); const statePoint = pointFrom((location.state as { initialPoint?: unknown } | null)?.initialPoint); const lat = params.get('lat'); const lng = params.get('lng'); const queryPoint = lat !== null && lng !== null ? pointFrom({ lat: Number(lat), lng: Number(lng) }) : undefined; const initialPoint = statePoint ?? queryPoint; return <PublishFootprintRoute {...(initialPoint ? { initialPoint } : {})} signUpload={uploadMedia} publish={publishFootprint} />; }
const routes = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/map" replace /> },
      { path: 'map', element: <MapRoute state="ready" loadFromApi /> },
      { path: 'activity', element: <ActivityRoute loadFromApi /> },
      { path: 'login', element: <LoginRoute /> },
      { path: 'people', element: <PeopleRoute /> },
      { path: 'messages', element: <MessagesRoute /> },
      { path: 'messages/:conversationId', element: <ConversationRoute /> },
      { path: 'notifications', element: <NotificationsRoute /> },
      { path: 'me', element: <MemoriesRoute /> },
      { path: 'me/map', element: <MemoriesRoute /> },
      { path: 'me/timeline', element: <MemoriesRoute /> },
      { path: 'me/photos', element: <MemoriesRoute /> },
      { path: 'me/visitors', element: <MemoriesRoute /> },
      { path: 'profile/:userId/memories', element: <MemoriesRoute /> },
      { path: 'profile/:userId/memories/map', element: <MemoriesRoute /> },
      { path: 'profile/:userId/memories/timeline', element: <MemoriesRoute /> },
      { path: 'profile/:userId/memories/photos', element: <MemoriesRoute /> },
      { path: 'profile/:userId/memories/visitors', element: <MemoriesRoute /> },
      { path: 'profile/:userId', element: <MemoriesRoute /> },
      {
        path: 'footprints/:footprintId',
        element: <FootprintRoute />,
      },
      { path: 'publish', element: <RequireAuth />, children: [{ index: true, element: <PublishRoute /> }] },
      { path: 'admin', element: <AdminRoute /> },
      { path: 'session-expired', element: <SessionExpired /> },
      { path: '*', element: <NotFound /> },
    ],
  },
];

export interface AppRouterProps {
  readonly initialEntries?: readonly string[];
}

export function AppRouter({ initialEntries }: AppRouterProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [router] = useState(() =>
    initialEntries
      ? createMemoryRouter(routes, { initialEntries: [...initialEntries] })
      : createBrowserRouter(routes),
  );

  return <QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>;
}
