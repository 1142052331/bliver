import { createContext, useContext } from 'react';
import useFootprintActions from '../hooks/useFootprintActions';

const FootprintActionsContext = createContext(null);

export function FootprintActionsProvider({ user, requireLogin, setFootprints, children }) {
  const actions = useFootprintActions({ user, requireLogin, setFootprints });
  return (
    <FootprintActionsContext.Provider value={actions}>
      {children}
    </FootprintActionsContext.Provider>
  );
}

export function useFootprintActionsContext() {
  const ctx = useContext(FootprintActionsContext);
  if (!ctx) throw new Error('useFootprintActionsContext must be used within FootprintActionsProvider');
  return ctx;
}
