const ALLOWED_FIELDS = ['surface', 'status', 'durationMs', 'count', 'reason'];

export function recordMetric(name, detail = {}) {
  const payload = { name };
  ALLOWED_FIELDS.forEach((field) => {
    if (detail[field] !== undefined) payload[field] = detail[field];
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('bliver:telemetry', { detail: payload }));
    window.__bliverSentry?.addBreadcrumb({
      category: 'bliver.telemetry',
      message: name,
      data: payload,
      level: payload.status === 'error' ? 'error' : 'info',
    });
  }

  return payload;
}
