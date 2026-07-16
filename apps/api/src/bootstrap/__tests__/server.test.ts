import { describe, expect, it, vi } from 'vitest';

import { configureServerSentry, shutdownServer } from '../server.js';
import { createConfig } from '../config.js';

describe('API server lifecycle', () => {
  it('configures Sentry release metadata on the real bootstrap path without enabling PII', () => {
    const sentry = { init: vi.fn(), setTag: vi.fn() };
    const config = createConfig({
      NODE_ENV: 'production', DEPLOY_ENV: 'staging', RELEASE_SHA: 'release-observe',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test', SESSION_SECRET: 'server-observability-secret-long-enough',
      SENTRY_DSN: 'https://public@example.ingest.sentry.io/1',
    });

    configureServerSentry(config, sentry);

    expect(sentry.init).toHaveBeenCalledWith(expect.objectContaining({ dsn: config.sentryDsn, release: 'release-observe', environment: 'staging', sendDefaultPii: false }));
    expect(sentry.setTag).toHaveBeenCalledWith('release', 'release-observe');
    expect(sentry.setTag).toHaveBeenCalledWith('environment', 'staging');
  });

  it('forces lingering connections closed after the shutdown deadline', async () => {
    const server = {
      close: vi.fn((callback: () => void) => {
        void callback;
      }),
      closeAllConnections: vi.fn(),
    };
    const closeDatabase = vi.fn(async () => undefined);

    await shutdownServer(server, closeDatabase, 5);

    expect(server.close).toHaveBeenCalledOnce();
    expect(server.closeAllConnections).toHaveBeenCalledOnce();
    expect(closeDatabase).toHaveBeenCalledOnce();
  });
});
