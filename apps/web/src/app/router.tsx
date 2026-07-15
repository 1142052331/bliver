import { useState } from 'react';
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

function NotFound() { return <RoutePlaceholder title="Not found" />; }
function SessionExpired() { const location = useLocation(); const destination = typeof location.state?.from === 'string' ? location.state.from : '/map'; return <section><h1>Session expired</h1><p>Please sign in again to continue.</p><Link to={destination}>Continue</Link></section>; }

const routes = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/map" replace /> },
      { path: 'map', element: <RoutePlaceholder title="Map" /> },
      { path: 'activity', element: <RoutePlaceholder title="Activity" /> },
      { path: 'messages', element: <RoutePlaceholder title="Messages" /> },
      { path: 'me', element: <RoutePlaceholder title="My space" /> },
      { path: 'profile/:userId', element: <RoutePlaceholder title="Profile" /> },
      {
        path: 'footprints/:footprintId',
        element: <RoutePlaceholder title="Footprint" />,
      },
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
  const [router] = useState(() =>
    initialEntries
      ? createMemoryRouter(routes, { initialEntries: [...initialEntries] })
      : createBrowserRouter(routes),
  );

  return <RouterProvider router={router} />;
}
