CREATE TABLE IF NOT EXISTS platform.outbox_events (
  id uuid PRIMARY KEY,
  type text NOT NULL,
  aggregate_id uuid NOT NULL,
  payload jsonb NOT NULL,
  available_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  processed_at timestamptz,
  last_error text,
  dead_lettered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS outbox_events_ready_idx ON platform.outbox_events (available_at, id) WHERE processed_at IS NULL AND dead_lettered_at IS NULL;
