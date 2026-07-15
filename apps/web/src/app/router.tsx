import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createBrowserRouter,
  createMemoryRouter,
  Navigate,
  RouterProvider,
  useLocation,
  Link,
} from 'react-router-dom';

import { AppShell } from './AppShell.js';
import { RoutePlaceholder } from './routes/RoutePlaceholder.js';
import { MapRoute } from '../features/map/MapRoute.js';
import { FootprintDetailRoute } from '../features/footprints/FootprintDetailRoute.js';
import { PublishFootprintRoute } from '../features/footprints/PublishFootprintRoute.js';
import { RequireAuth } from './guards/RequireAuth.js';

function NotFound() { return <RoutePlaceholder title="Not found" />; }
function SessionExpired() { const location = useLocation(); const destination = typeof location.state?.from === 'string' ? location.state.from : '/map'; return <section><h1>Session expired</h1><p>Please sign in again to continue.</p><Link to={destination}>Continue</Link></section>; }
async function publishFootprint(input: { readonly message: string; readonly visibility: string; readonly locationPrecision: string }): Promise<void> {
  const response = await fetch('/api/v1/footprints', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify({ ...input, privatePoint: { lat: 31.23, lng: 121.47 }, mediaAssetIds: [] }) });
  if (!response.ok) throw new Error('Publish failed');
}
async function signUpload(file: File): Promise<unknown> {
  const response = await fetch('/api/v1/media/signature', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify({ mimeType: file.type, bytes: file.size }) });
  if (!response.ok) throw new Error('Upload signing failed');
  return response.json();
}

const routes = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/map" replace /> },
      { path: 'map', element: <MapRoute state="ready" loadFromApi /> },
      { path: 'activity', element: <RoutePlaceholder title="Activity" /> },
      { path: 'messages', element: <RoutePlaceholder title="Messages" /> },
      { path: 'me', element: <RoutePlaceholder title="My space" /> },
      { path: 'profile/:userId', element: <RoutePlaceholder title="Profile" /> },
      {
        path: 'footprints/:footprintId',
        element: <FootprintDetailRoute loadFromApi footprint={{ id: 'route', message: 'Footprint detail', visibility: 'public', locationPrecision: 'approximate' }} />,
      },
      { path: 'publish', element: <RequireAuth />, children: [{ index: true, element: <PublishFootprintRoute signUpload={signUpload} publish={publishFootprint} /> }] },
      { path: 'admin', element: <RoutePlaceholder title="Admin" /> },
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
