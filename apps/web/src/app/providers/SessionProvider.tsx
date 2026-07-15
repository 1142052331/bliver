import { createContext, useContext, type ReactNode } from 'react';
import { useSessionQuery } from '../../features/auth/queries.js';

const SessionContext = createContext<ReturnType<typeof useSessionQuery> | null>(null);
export function SessionProvider({ children }: { readonly children: ReactNode }) { const query = useSessionQuery(); return <SessionContext.Provider value={query}>{children}</SessionContext.Provider>; }
export function useSession() { const context = useContext(SessionContext); if (!context) throw new Error('SessionProvider is required'); return context; }
