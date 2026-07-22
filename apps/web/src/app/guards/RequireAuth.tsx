import { LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { AppStatusScene } from '../AppStatusScene.js';
import { useSession } from '../providers/SessionProvider.js';

export function RequireAuth() {
  const { t } = useTranslation();
  const session = useSession();
  const location = useLocation();

  if (session.isLoading) {
    return (
      <div
        aria-live="polite"
        className="app-shell__status-shell app-shell__status-shell--scene"
        role="status"
      >
        <AppStatusScene
          Icon={LoaderCircle}
          busy
          body={t('session.loadingBody')}
          title={t('session.loading')}
        />
      </div>
    );
  }

  if (session.isError) {
    return (
      <Navigate
        replace
        state={{ from: `${location.pathname}${location.search}` }}
        to="/session-expired"
      />
    );
  }

  return <Outlet />;
}
