const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const DEFAULT_FRONTEND_INDEX_PATH = path.resolve(__dirname, '../../frontend/dist/index.html');
// Render gives a service a bounded grace period after SIGTERM. Keep the
// shutdown deadline below that window so the process can finish its cleanup.
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 25_000;

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

function closeResource(resource, stage, logger, timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS) {
  if (!resource || typeof resource.close !== 'function') return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    let timer;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const benign = error?.code === 'ERR_SERVER_NOT_RUNNING';
      if (error && !benign) logShutdownFailure(logger, stage);
      resolve(Boolean(error && !benign));
    };

    const boundedTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : DEFAULT_SHUTDOWN_TIMEOUT_MS;
    timer = setTimeout(() => finish(new Error('close timed out')), boundedTimeout);

    try {
      const result = resource.close(finish);
      if (result && typeof result.then === 'function') {
        result.then(() => finish(), (error) => finish(error || new Error('close failed')));
      } else if (resource.close.length === 0 && typeof resource.listening !== 'boolean') {
        // Synchronous test doubles and adapters may not accept a callback.
        finish();
      }
    } catch (error) {
      finish(error || new Error('close failed'));
    }
  });
}

function createGracefulShutdown({
  server,
  io,
  disconnect = () => mongoose.disconnect(),
  exit = (code) => process.exit(code),
  logger = console,
  timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
} = {}) {
  let shutdownPromise;

  const shutdown = () => {
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = (async () => {
      let failed = false;
      const boundedTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0
        ? timeoutMs
        : DEFAULT_SHUTDOWN_TIMEOUT_MS;
      const deadline = Date.now() + boundedTimeout;
      const remaining = () => Math.max(1, deadline - Date.now());

      // Calling server.close() stops new HTTP connections immediately, while
      // its callback waits for active requests. Start Socket.IO teardown now
      // so long-lived transports can drain before the shared deadline.
      const serverClose = closeResource(server, 'server', logger, remaining());
      const ioClose = closeResource(io, 'io', logger, remaining());
      const [serverFailed, ioFailed] = await Promise.all([serverClose, ioClose]);
      failed = serverFailed || ioFailed || failed;

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
