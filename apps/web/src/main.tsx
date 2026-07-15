import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@bliver/ui/tokens.css';

import { AppErrorBoundary } from './app/ErrorBoundary.js';
import { AppRouter } from './app/router.js';
import { SessionProvider } from './app/providers/SessionProvider.js';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Web root element is missing');
}

const queryClient = new QueryClient();

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <AppErrorBoundary>
          <AppRouter />
        </AppErrorBoundary>
      </SessionProvider>
    </QueryClientProvider>
  </StrictMode>,
);
