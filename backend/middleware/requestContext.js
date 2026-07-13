const crypto = require('crypto');

const MAX_METRICS = 100;
const startedAt = Date.now();
const metrics = new Map();

function requestContext(req, res, next) {
  const requestId = req.get('X-Request-Id') || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  const started = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    const key = `${req.method} ${req.path} ${res.statusCode}`;
    const previous = metrics.get(key) || { method: req.method, path: req.path, status: res.statusCode, count: 0, durationMs: 0 };
    previous.count += 1;
    previous.durationMs = Math.round((previous.durationMs + durationMs) * 100) / 100;
    metrics.set(key, previous);
    while (metrics.size > MAX_METRICS) metrics.delete(metrics.keys().next().value);
    if (process.env.NODE_ENV !== 'test') {
      console.log(JSON.stringify({ requestId, method: req.method, path: req.path, status: res.statusCode, durationMs: Math.round(durationMs * 100) / 100 }));
    }
  });

  next();
}

function getRequestMetrics() {
  return Array.from(metrics.values()).map((entry) => ({ ...entry }));
}

function getUptimeSeconds() {
  return Math.round((Date.now() - startedAt) / 1000);
}

module.exports = { requestContext, getRequestMetrics, getUptimeSeconds };
