describe('backend Sentry configuration', () => {
  afterEach(() => {
    delete process.env.RENDER_GIT_COMMIT;
    delete process.env.RELEASE_SHA;
    delete process.env.DEPLOY_ENV;
  });

  test('uses Render commit and deployment environment metadata', () => {
    process.env.RENDER_GIT_COMMIT = 'render-commit';
    process.env.RELEASE_SHA = 'fallback-release';
    process.env.DEPLOY_ENV = 'candidate';

    const { getSentryOptions } = require('../config/sentry');

    expect(getSentryOptions('dsn')).toEqual(expect.objectContaining({
      dsn: 'dsn',
      release: 'render-commit',
      environment: 'candidate',
    }));
  });

  test('uses RELEASE_SHA when Render commit metadata is absent', () => {
    process.env.RELEASE_SHA = 'manual-release';

    const { getSentryOptions } = require('../config/sentry');

    expect(getSentryOptions('dsn')).toEqual(expect.objectContaining({
      release: 'manual-release',
    }));
  });
});
