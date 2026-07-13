function getSentryOptions(dsn) {
  const release = process.env.RENDER_GIT_COMMIT || process.env.RELEASE_SHA;

  return {
    dsn,
    tracesSampleRate: 0.1,
    environment: process.env.DEPLOY_ENV || process.env.NODE_ENV || 'production',
    ...(release ? { release } : {}),
  };
}

module.exports = { getSentryOptions };
