import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@bliver/ui/tokens.css';

import { AppErrorBoundary } from './app/ErrorBoundary.js';
import { AppRouter } from './app/router.js';
import { registerPushServiceWorker } from './features/notifications/push.js';
import { BliverI18nProvider } from './i18n/I18nProvider.js';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Web root element is missing');
}

void registerPushServiceWorker();

createRoot(rootElement).render(
  <StrictMode>
    <BliverI18nProvider>
      <AppErrorBoundary>
        <AppRouter />
      </AppErrorBoundary>
    </BliverI18nProvider>
  </StrictMode>,
);
