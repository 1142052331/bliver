CREATE TABLE IF NOT EXISTS profile_visitors (
  owner_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  visitor_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  last_visited_at timestamptz NOT NULL DEFAULT now(),
  visit_count integer NOT NULL DEFAULT 1,
  PRIMARY KEY (owner_id, visitor_id)
);
CREATE INDEX IF NOT EXISTS profile_visitors_owner_idx ON profile_visitors(owner_id, last_visited_at DESC);
CREATE TABLE IF NOT EXISTS memory_highlights (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  footprint_id uuid NOT NULL REFERENCES footprints(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id, footprint_id)
);
CREATE TABLE IF NOT EXISTS memory_projection_versions (
  projection text PRIMARY KEY,
  version bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS platform.processed_events (
  event_id uuid PRIMARY KEY,
  processed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY,
  recipient_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  type text NOT NULL,
  actor_id uuid REFERENCES identity_users(id) ON DELETE SET NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  dedupe_key text NOT NULL,
  UNIQUE(recipient_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON notifications(recipient_id, created_at DESC);
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES identity_users(id) ON DELETE CASCADE,
  reactions boolean NOT NULL DEFAULT true,
  comments boolean NOT NULL DEFAULT true,
  social boolean NOT NULL DEFAULT true,
  messages boolean NOT NULL DEFAULT true,
  moderation boolean NOT NULL DEFAULT true,
  push boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_subscriptions_endpoint_unique UNIQUE(endpoint),
  CONSTRAINT push_subscriptions_owner_endpoint_unique UNIQUE(user_id, endpoint)
);
CREATE TABLE IF NOT EXISTS delivery_attempts (
  id uuid PRIMARY KEY,
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel text NOT NULL,
  attempt integer NOT NULL,
  status text NOT NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS moderation_cases (
  id uuid PRIMARY KEY,
  report_id uuid REFERENCES reports(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','dismissed')),
  target_type text NOT NULL,
  target_id text NOT NULL,
  opened_by uuid NOT NULL REFERENCES identity_users(id),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE TABLE IF NOT EXISTS moderation_actions (
  id uuid PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES moderation_cases(id) ON DELETE RESTRICT,
  action text NOT NULL,
  actor_id uuid NOT NULL REFERENCES identity_users(id),
  target_id text NOT NULL,
  reason text NOT NULL,
  before_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY,
  case_id uuid REFERENCES moderation_cases(id) ON DELETE SET NULL,
  actor_id uuid NOT NULL REFERENCES identity_users(id),
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  reason text NOT NULL,
  before_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);
CREATE TABLE IF NOT EXISTS admin_roles (
  user_id uuid PRIMARY KEY REFERENCES identity_users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK(role IN ('moderator','admin')),
  granted_by uuid REFERENCES identity_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO admin_roles(user_id, role)
SELECT user_id, role FROM identity_roles WHERE role IN ('moderator','admin')
ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role;
ALTER TABLE identity_users ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
ALTER TABLE footprints ADD COLUMN IF NOT EXISTS moderation_hidden_at timestamptz;
