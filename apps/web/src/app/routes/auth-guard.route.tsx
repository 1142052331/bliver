import { RequireAuth } from '../guards/RequireAuth.js';
import { SessionProvider } from '../providers/SessionProvider.js';

export function Component() {
  return (
    <SessionProvider>
      <RequireAuth />
    </SessionProvider>
  );
}
