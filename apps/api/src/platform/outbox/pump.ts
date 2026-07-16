export interface OutboxWorkerPort {
  runOnce(): Promise<boolean>;
}

export interface OutboxWorkerPumpOptions {
  readonly worker: OutboxWorkerPort;
  readonly intervalMs: number;
  readonly observeError?: (error: unknown) => void;
}

export class OutboxWorkerPump {
  private timer: ReturnType<typeof setInterval> | undefined;
  private inFlight: Promise<void> | undefined;
  private stopped = true;

  constructor(private readonly options: OutboxWorkerPumpOptions) {}

  start(): void {
    if (this.timer) return;
    this.stopped = false;
    this.timer = setInterval(() => this.tick(), this.options.intervalMs);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    await this.inFlight;
  }

  private tick(): void {
    if (this.stopped || this.inFlight) return;
    const operation = Promise.resolve()
      .then(() => this.options.worker.runOnce())
      .catch((error: unknown) => {
        try {
          this.options.observeError?.(error);
        } catch {
          // Observability must not turn a handled worker failure into an unhandled rejection.
        }
      })
      .then(() => undefined);
    this.inFlight = operation;
    void operation.then(() => {
      if (this.inFlight === operation) this.inFlight = undefined;
    });
  }
}
