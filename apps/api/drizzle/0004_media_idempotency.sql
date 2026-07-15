CREATE TABLE IF NOT EXISTS media_assets (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  public_id text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  bytes integer NOT NULL CHECK (bytes > 0),
  version integer,
  width integer,
  height integer,
  format text,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS media_assets_owner_idx ON media_assets(owner_id, created_at DESC, id DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS platform.idempotency_keys (
  actor_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  scope text NOT NULL,
  key text NOT NULL,
  request_hash text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, scope, key)
);
--> statement-breakpoint
ALTER TABLE footprint_media
  ALTER COLUMN asset_id TYPE uuid USING asset_id::uuid;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'footprint_media_asset_fk'
  ) THEN
    ALTER TABLE footprint_media
      ADD CONSTRAINT footprint_media_asset_fk FOREIGN KEY (asset_id) REFERENCES media_assets(id) ON DELETE RESTRICT;
  END IF;
END $$;
