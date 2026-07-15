CREATE TABLE IF NOT EXISTS identity_users (
  id uuid PRIMARY KEY,
  username text NOT NULL,
  email text,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT identity_users_username_unique UNIQUE (username),
  CONSTRAINT identity_users_email_unique UNIQUE (email),
  CONSTRAINT identity_users_username_format CHECK (username ~ '^[a-zA-Z0-9_]{3,32}$')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS identity_credentials (
  user_id uuid PRIMARY KEY REFERENCES identity_users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS identity_devices (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  name text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('web', 'capacitor')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS identity_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES identity_devices(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  family_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  refresh_token_hash text UNIQUE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS identity_sessions_user_idx ON identity_sessions(user_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS identity_sessions_family_idx ON identity_sessions(family_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS identity_roles (
  user_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'moderator', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS identity_security_events (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES identity_users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  ip_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS identity_security_events_user_idx ON identity_security_events(user_id, created_at DESC);
