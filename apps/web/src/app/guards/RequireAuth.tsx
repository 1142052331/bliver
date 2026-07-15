import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '../providers/SessionProvider.js';

export function RequireAuth() {
  const session = useSession(); const location = useLocation();
  if (session.isLoading) return <p role="status">Loading session...</p>;
  if (session.isError) return <Navigate to="/session-expired" replace state={{ from: `${location.pathname}${location.search}` }} />;
  return <Outlet />;
}
