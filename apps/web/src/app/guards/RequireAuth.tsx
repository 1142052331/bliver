import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { AppLoadingScene } from '../AppLoadingScene.js';
import { useSession } from '../providers/SessionProvider.js';

export function RequireAuth() {
  const { t } = useTranslation();
  const session = useSession();
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}`;

  if (session.isLoading) {
    return (
      <div
        className="app-shell__status-shell app-shell__status-shell--loading"
        data-auth-session-state="loading"
      >
        <AppLoadingScene label={t('session.loading')} />
      </div>
    );
  }

  if (session.isError) {
    const errorCode = (session.error as { readonly code?: unknown } | null)?.code;
    if (errorCode === 'AUTH_REQUIRED') {
      return (
        <Navigate
          replace
          state={{ from: returnTo }}
          to={`/auth-required?returnTo=${encodeURIComponent(returnTo)}`}
        />
      );
    }

    return (
      <Navigate
        replace
        state={{ from: returnTo }}
        to="/session-expired"
      />
    );
  }

  return <Outlet />;
}
