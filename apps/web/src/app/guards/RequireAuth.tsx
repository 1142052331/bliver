import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useSession } from '../providers/SessionProvider.js';

export function RequireAuth() {
  const { t } = useTranslation();
  const session = useSession();
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}`;

  if (session.isLoading) {
    return (
      <p
        aria-live="polite"
        className="app-shell__sr-only"
        data-auth-session-state="loading"
        role="status"
      >
        {t('session.loading')}
      </p>
    );
  }

  if (session.isError) {
    const errorCode = (session.error as { readonly code?: unknown } | null)?.code;
    if (errorCode === 'AUTH_REQUIRED') {
      return (
        <Navigate
          replace
          state={{ from: returnTo }}
          to={`/login?returnTo=${encodeURIComponent(returnTo)}`}
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
