import { useState } from 'react';
import {
  createBrowserRouter,
  createMemoryRouter,
  Navigate,
  RouterProvider,
} from 'react-router-dom';

import { AppShell } from './AppShell.js';
import { RoutePlaceholder } from './routes/RoutePlaceholder.js';

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
