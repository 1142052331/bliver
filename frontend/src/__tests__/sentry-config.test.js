import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  browserTracingIntegration: vi.fn(() => 'browser-tracing'),
}));

vi.mock('@sentry/react', () => sentry);

describe('frontend Sentry configuration', () => {
  beforeEach(() => {
    vi.resetModules();
    sentry.init.mockClear();
    sentry.browserTracingIntegration.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses deployment environment and release metadata', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://public@example.test/1');
    vi.stubEnv('VITE_DEPLOY_ENV', 'candidate');
    vi.stubEnv('VITE_RELEASE_SHA', 'release-sha');

    await import('../App');

    expect(sentry.init).toHaveBeenCalledWith(expect.objectContaining({
      environment: 'candidate',
      release: 'release-sha',
    }));
  });
});
