import { describe, expect, it, vi, afterEach } from 'vitest';
import { recordMetric } from '../observability';

describe('recordMetric', () => {
  afterEach(() => {
    delete window.__bliverSentry;
  });

  it('dispatches a PII-free telemetry event and Sentry breadcrumb', () => {
    const addBreadcrumb = vi.fn();
    window.__bliverSentry = { addBreadcrumb };
    const listener = vi.fn();
    window.addEventListener('bliver:telemetry', listener);

    recordMetric('legacy_surface_load', {
      surface: 'photo',
      status: 'ok',
      durationMs: 12,
      content: 'secret',
    });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0].detail).toEqual({
      name: 'legacy_surface_load',
      surface: 'photo',
      status: 'ok',
      durationMs: 12,
    });
    expect(addBreadcrumb).toHaveBeenCalledWith(expect.objectContaining({ category: 'bliver.telemetry' }));
    window.removeEventListener('bliver:telemetry', listener);
  });
});
