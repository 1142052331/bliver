CREATE TABLE IF NOT EXISTS friendships (
  requester_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);
CREATE INDEX IF NOT EXISTS friendships_addressee_status_idx ON friendships (addressee_id, status, requester_id);
CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx ON user_blocks (blocked_id, blocker_id);
CREATE TABLE IF NOT EXISTS discovery_entries (
  footprint_id uuid PRIMARY KEY REFERENCES footprints(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  region_id uuid REFERENCES regions(id) ON DELETE SET NULL,
  country_code text,
  visibility text NOT NULL CHECK (visibility IN ('public', 'friends', 'private')),
  location_precision text NOT NULL CHECK (location_precision IN ('precise', 'approximate')),
  display_point geography(Point, 4326) NOT NULL,
  message text NOT NULL,
  has_media boolean NOT NULL DEFAULT false,
  published_at timestamptz NOT NULL,
  discovery_expires_at timestamptz,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS discovery_entries_public_idx ON discovery_entries (visibility, discovery_expires_at, published_at DESC, footprint_id DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS discovery_entries_region_idx ON discovery_entries (region_id, published_at DESC, footprint_id DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS discovery_entries_country_idx ON discovery_entries (country_code, published_at DESC, footprint_id DESC) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS discovery_reads (
  footprint_id uuid NOT NULL REFERENCES footprints(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (footprint_id, viewer_id)
);
CREATE TABLE IF NOT EXISTS footprint_reactions (
  footprint_id uuid NOT NULL REFERENCES footprints(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (footprint_id, actor_id)
);
CREATE INDEX IF NOT EXISTS footprint_reactions_footprint_idx ON footprint_reactions (footprint_id, created_at, actor_id);
CREATE TABLE IF NOT EXISTS footprint_comments (
  id uuid PRIMARY KEY,
  footprint_id uuid NOT NULL REFERENCES footprints(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  parent_comment_id uuid REFERENCES footprint_comments(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS footprint_comments_thread_idx ON footprint_comments (footprint_id, parent_comment_id, created_at, id);
CREATE OR REPLACE FUNCTION enforce_footprint_comment_depth() RETURNS trigger AS $$
BEGIN
  IF NEW.parent_comment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM footprint_comments parent
    WHERE parent.id = NEW.parent_comment_id
      AND parent.footprint_id = NEW.footprint_id
      AND parent.parent_comment_id IS NULL
  ) THEN
    RAISE EXCEPTION 'comments support exactly two levels';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'footprint_comments_depth_trigger'
      AND tgrelid = 'footprint_comments'::regclass
  ) THEN
    CREATE TRIGGER footprint_comments_depth_trigger BEFORE INSERT OR UPDATE OF parent_comment_id, footprint_id ON footprint_comments FOR EACH ROW EXECUTE FUNCTION enforce_footprint_comment_depth();
  END IF;
END;
$$;
CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY,
  footprint_id uuid NOT NULL REFERENCES footprints(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('spam', 'harassment', 'hate', 'privacy', 'illegal', 'other')),
  details text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS reports_open_unique_idx ON reports (footprint_id, reporter_id) WHERE status = 'open';
