import { createContext, useContext, type ReactNode } from 'react';
import { useSessionQuery } from '../../features/auth/queries.js';

interface SessionContextValue {
  readonly error: ReturnType<typeof useSessionQuery>['error'];
  readonly isError: boolean;
  readonly isLoading: boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { readonly children: ReactNode }) {
  const { error, isError, isLoading } = useSessionQuery();
  return (
    <SessionContext.Provider value={{ error, isError, isLoading }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('SessionProvider is required');
  return context;
}
