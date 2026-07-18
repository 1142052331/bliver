import { useState } from 'react';
import { StatusView } from '@bliver/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  createBrowserRouter,
  createMemoryRouter,
  Navigate,
  RouterProvider,
  useLocation,
  Link,
} from 'react-router-dom';

import { AppShell } from './AppShell.js';

const lazyMapRoute = () => import('./routes/map.route.js');
const lazyActivityRoute = () => import('./routes/activity.route.js');
const lazyLoginRoute = () => import('./routes/login.route.js');
const lazyPeopleRoute = () => import('./routes/people.route.js');
const lazyMessagesRoute = () => import('./routes/messages.route.js');
const lazyConversationRoute = () => import('./routes/conversation.route.js');
const lazyMemoriesRoute = () => import('./routes/memories.route.js');
const lazyNotificationsRoute = () =>
  import('./routes/notifications.route.js');
const lazyFootprintRoute = () => import('./routes/footprint.route.js');
const lazyPublishRoute = () => import('./routes/publish.route.js');
const lazyAdminRoute = () => import('./routes/admin.route.js');
const lazyAuthGuardRoute = () => import('./routes/auth-guard.route.js');

function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="app-shell__status-shell">
      <StatusView
        action={
          <Link className="app-shell__status-link" to="/map">
            {t('nav.map')}
          </Link>
        }
        body={t('errors.notFoundBody')}
        title={t('errors.notFoundTitle')}
      />
    </div>
  );
}

function SessionExpired() {
  const { t } = useTranslation();
  const location = useLocation();
  const destination =
    typeof location.state?.from === 'string' ? location.state.from : '/map';

  return (
    <div className="app-shell__status-shell">
      <StatusView
        action={
          <Link
            className="app-shell__status-link"
            state={{ from: destination }}
            to="/login"
          >
            {t('session.signIn')}
          </Link>
        }
        body={t('session.expiredBody')}
        title={t('session.expiredTitle')}
      />
    </div>
  );
}

function RouteLoading() {
  const { t } = useTranslation();

  return (
    <div
      aria-live="polite"
      className="app-shell__status-shell"
      role="status"
    >
      <StatusView
        body={t('session.loadingBody')}
        title={t('common.loading')}
      />
    </div>
  );
}

const routeLoadingElement = <RouteLoading />;

const routes = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/map" replace /> },
      {
        path: 'map',
        lazy: lazyMapRoute,
        hydrateFallbackElement: routeLoadingElement,
      },
      {
        path: 'activity',
        lazy: lazyActivityRoute,
        hydrateFallbackElement: routeLoadingElement,
      },
      {
        path: 'login',
        lazy: lazyLoginRoute,
        hydrateFallbackElement: routeLoadingElement,
      },
      {
        path: 'people',
        lazy: lazyPeopleRoute,
        hydrateFallbackElement: routeLoadingElement,
      },
      {
        path: 'messages',
        lazy: lazyMessagesRoute,
        hydrateFallbackElement: routeLoadingElement,
      },
      {
        path: 'messages/:conversationId',
        lazy: lazyConversationRoute,
        hydrateFallbackElement: routeLoadingElement,
      },
      {
        path: 'notifications',
        lazy: lazyAuthGuardRoute,
        hydrateFallbackElement: routeLoadingElement,
        children: [
          {
            index: true,
            lazy: lazyNotificationsRoute,
            hydrateFallbackElement: routeLoadingElement,
          },
        ],
      },
      { path: 'me', lazy: lazyAuthGuardRoute, hydrateFallbackElement: routeLoadingElement, children: [
        { index: true, lazy: lazyMemoriesRoute, hydrateFallbackElement: routeLoadingElement },
        { path: 'map', lazy: lazyMemoriesRoute, hydrateFallbackElement: routeLoadingElement },
        { path: 'timeline', lazy: lazyMemoriesRoute, hydrateFallbackElement: routeLoadingElement },
        { path: 'photos', lazy: lazyMemoriesRoute, hydrateFallbackElement: routeLoadingElement },
        { path: 'visitors', lazy: lazyMemoriesRoute, hydrateFallbackElement: routeLoadingElement },
      ] },
      { path: 'profile/:userId/memories', lazy: lazyMemoriesRoute, hydrateFallbackElement: routeLoadingElement },
      { path: 'profile/:userId/memories/map', lazy: lazyMemoriesRoute, hydrateFallbackElement: routeLoadingElement },
      { path: 'profile/:userId/memories/timeline', lazy: lazyMemoriesRoute, hydrateFallbackElement: routeLoadingElement },
      { path: 'profile/:userId/memories/photos', lazy: lazyMemoriesRoute, hydrateFallbackElement: routeLoadingElement },
      { path: 'profile/:userId/memories/visitors', lazy: lazyMemoriesRoute, hydrateFallbackElement: routeLoadingElement },
      { path: 'profile/:userId', lazy: lazyMemoriesRoute, hydrateFallbackElement: routeLoadingElement },
      {
        path: 'footprints/:footprintId',
        lazy: lazyFootprintRoute,
        hydrateFallbackElement: routeLoadingElement,
      },
      {
        path: 'publish',
        lazy: lazyAuthGuardRoute,
        hydrateFallbackElement: routeLoadingElement,
        children: [
          {
            index: true,
            lazy: lazyPublishRoute,
            hydrateFallbackElement: routeLoadingElement,
          },
        ],
      },
      {
        path: 'admin',
        lazy: lazyAuthGuardRoute,
        hydrateFallbackElement: routeLoadingElement,
        children: [
          {
            index: true,
            lazy: lazyAdminRoute,
            hydrateFallbackElement: routeLoadingElement,
          },
        ],
      },
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

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
