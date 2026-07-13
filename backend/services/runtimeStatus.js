const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const DEFAULT_FRONTEND_INDEX_PATH = path.resolve(__dirname, '../../frontend/dist/index.html');

function createRuntimeStatus({
  connection = mongoose.connection,
  existsSync = fs.existsSync,
  frontendIndexPath = DEFAULT_FRONTEND_INDEX_PATH,
  env = process.env,
  nodeVersion = process.version,
} = {}) {
  const release = () => env.RENDER_GIT_COMMIT || env.RELEASE_SHA || 'local';
  const environment = () => env.DEPLOY_ENV || env.NODE_ENV || 'development';

  const readiness = () => {
    let database = false;
    let frontend = false;

    try {
      database = connection?.readyState === 1;
    } catch (_error) {
      database = false;
    }
    try {
      frontend = Boolean(existsSync(frontendIndexPath));
    } catch (_error) {
      frontend = false;
    }

    return { ready: database && frontend, database, frontend };
  };

  const version = () => ({
    release: release(),
    node: nodeVersion,
    environment: environment(),
  });

  return {
    release,
    environment,
    node: () => nodeVersion,
    readiness,
    version,
  };
}

function logShutdownFailure(logger, stage) {
  try {
    logger?.error?.(`[shutdown] ${stage} failed`);
  } catch (_error) {
    // Logging must never prevent the remaining shutdown steps.
  }
}

function closeResource(resource, stage, logger) {
  if (!resource || typeof resource.close !== 'function') return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      const benign = error?.code === 'ERR_SERVER_NOT_RUNNING';
      if (error && !benign) logShutdownFailure(logger, stage);
      resolve(Boolean(error && !benign));
    };

    try {
      const result = resource.close(finish);
      if (result && typeof result.then === 'function') {
        result.then(() => finish(), () => finish(new Error('close failed')));
      } else if (resource.close.length === 0) {
        finish();
      } else if (resource.listening === false) {
        // Node's un-listened HTTP server normally invokes the callback with
        // ERR_SERVER_NOT_RUNNING; keep a fallback for injected test doubles.
        setImmediate(() => finish());
      }
    } catch (_error) {
      finish(new Error('close failed'));
    }
  });
}

function createGracefulShutdown({
  server,
  io,
  disconnect = () => mongoose.disconnect(),
  exit = (code) => process.exit(code),
  logger = console,
} = {}) {
  let shutdownPromise;

  const shutdown = () => {
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = (async () => {
      let failed = false;
      failed = (await closeResource(server, 'server', logger)) || failed;
      failed = (await closeResource(io, 'io', logger)) || failed;

      try {
        await Promise.resolve(disconnect?.());
      } catch (_error) {
        failed = true;
        logShutdownFailure(logger, 'mongo');
      }

      try {
        exit(failed ? 1 : 0);
      } catch (_error) {
        // A test-injected exit function may throw; the exit attempt remains one-shot.
      }
    })();

    return shutdownPromise;
  };

  return shutdown;
}

function registerShutdownSignals(options = {}) {
  const processRef = options.processRef || process;
  const signals = options.signals || ['SIGTERM', 'SIGINT'];
  const shutdown = createGracefulShutdown(options);
  const handlers = signals.map((signal) => {
    const handler = () => { void shutdown(); };
    processRef.once(signal, handler);
    return { signal, handler };
  });

  return {
    shutdown,
    unregister() {
      handlers.forEach(({ signal, handler }) => processRef.removeListener(signal, handler));
    },
  };
}

const defaultRuntimeStatus = createRuntimeStatus();

module.exports = {
  createRuntimeStatus,
  createGracefulShutdown,
  registerShutdownSignals,
  getRelease: defaultRuntimeStatus.release,
  getEnvironment: defaultRuntimeStatus.environment,
  getNodeVersion: defaultRuntimeStatus.node,
  getReadiness: defaultRuntimeStatus.readiness,
  getVersion: defaultRuntimeStatus.version,
};
