import { createHash } from 'node:crypto';

export interface RequestMetric {
  readonly requestId: string;
  readonly correlationId: string;
  readonly method: string;
  readonly status: number;
  readonly durationMs: number;
  readonly actorHash?: string;
}
interface RequestMetricInput extends Omit<RequestMetric, 'actorHash'> { readonly actorId?: string; readonly actorHash?: string; }

export interface ObservabilitySnapshot {
  readonly counters: Readonly<Record<string, number>>;
  readonly recentRequests: readonly RequestMetric[];
}
interface SafeLogger { info(fields: Record<string, unknown>, message?: string): void; }
interface EventDimensions { readonly requestId?: string; readonly correlationId?: string; readonly status?: string | number; readonly durationMs?: number; readonly actorId?: string; }

export function hashActorId(actorId: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${actorId}`).digest('hex');
}

export class ObservabilityRegistry {
  private readonly counts = new Map<string, number>();
  private readonly requests: RequestMetric[] = [];
  constructor(private readonly actorSalt = 'bliver-v2-observability', private readonly logger?: SafeLogger) {}
  private increment(name: string): void { this.counts.set(name, (this.counts.get(name) ?? 0) + 1); }

  request(input: RequestMetricInput): void {
    this.increment('requests');
    if (input.status >= 500) this.increment('errors');
    const { actorId, ...safe } = input;
    this.requests.push({ ...safe, ...(input.actorHash ? { actorHash: input.actorHash } : actorId ? { actorHash: hashActorId(actorId, this.actorSalt) } : {}) });
    if (this.requests.length > 100) this.requests.shift();
    this.logger?.info({ event: 'http.request', requestId: input.requestId, correlationId: input.correlationId, method: input.method, status: input.status, durationMs: input.durationMs, ...(actorId ? { actorHash: hashActorId(actorId, this.actorSalt) } : {}) }, 'request completed');
  }

  socket(event: 'connection' | 'reconnect' | 'disconnect' | 'auth_failure', dimensions: EventDimensions = {}): void {
    this.increment(`socket${event === 'connection' ? 'Connections' : event === 'reconnect' ? 'Reconnects' : event === 'disconnect' ? 'Disconnects' : 'AuthFailures'}`);
    this.logger?.info({ event: `socket.${event}`, ...this.safeDimensions(dimensions) }, 'socket event');
  }

  outbox(event: 'backlog' | 'retry' | 'failure', dimensions: EventDimensions = {}): void {
    this.increment(event === 'backlog' ? 'outboxBacklog' : event === 'retry' ? 'outboxRetries' : 'outboxFailures');
    this.logger?.info({ event: `outbox.${event}`, ...this.safeDimensions(dimensions) }, 'outbox event');
  }

  dependency(name: 'dbPool' | 'slowQuery' | 'cloudinary' | 'geocoder' | 'push', healthy: boolean): void {
    if (!healthy) this.increment(`${name}Failures`);
  }

  snapshot(): ObservabilitySnapshot {
    return { counters: Object.fromEntries(this.counts), recentRequests: this.requests.map((request) => ({ ...request })) };
  }

  private safeDimensions(input: EventDimensions): Record<string, unknown> {
    const { actorId, ...safe } = input;
    return { ...safe, ...(actorId ? { actorHash: hashActorId(actorId, this.actorSalt) } : {}) };
  }
}

export interface SentryTagSink { setTag(name: string, value: string): void; }
export function configureSentryRelease(sentry: SentryTagSink, release: string, environment: string): void {
  sentry.setTag('release', release);
  sentry.setTag('environment', environment);
}
