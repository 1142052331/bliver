CREATE TABLE friendships_phase5 (
  id uuid PRIMARY KEY,
  user_low_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  user_high_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_low_id, user_high_id),
  CHECK (user_low_id < user_high_id),
  CHECK (requester_id <> addressee_id),
  CHECK (requester_id IN (user_low_id, user_high_id)),
  CHECK (addressee_id IN (user_low_id, user_high_id))
);

INSERT INTO friendships_phase5 (id,user_low_id,user_high_id,requester_id,addressee_id,status,created_at,updated_at)
SELECT gen_random_uuid(), LEAST(requester_id,addressee_id), GREATEST(requester_id,addressee_id), requester_id, addressee_id,
  CASE status WHEN 'declined' THEN 'rejected' ELSE status END, created_at, updated_at
FROM (
  SELECT DISTINCT ON (LEAST(requester_id,addressee_id),GREATEST(requester_id,addressee_id)) *
  FROM friendships
  ORDER BY LEAST(requester_id,addressee_id),GREATEST(requester_id,addressee_id),updated_at DESC
) legacy_friendships;

DROP TABLE friendships;
ALTER TABLE friendships_phase5 RENAME TO friendships;
CREATE INDEX friendships_user_status_idx ON friendships (user_low_id,user_high_id,status);
CREATE INDEX friendships_addressee_status_idx ON friendships (addressee_id,status,updated_at DESC);

CREATE TABLE friendship_status_history (
  id uuid PRIMARY KEY,
  friendship_id uuid NOT NULL REFERENCES friendships(id) ON DELETE CASCADE,
  from_status text CHECK (from_status IS NULL OR from_status IN ('pending','accepted','rejected')),
  to_status text NOT NULL CHECK (to_status IN ('pending','accepted','rejected')),
  actor_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX friendship_status_history_timeline_idx ON friendship_status_history (friendship_id,occurred_at,id);

CREATE TABLE blocks (
  blocker_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
INSERT INTO blocks (blocker_id,blocked_id,created_at)
SELECT blocker_id,blocked_id,created_at FROM user_blocks
ON CONFLICT (blocker_id,blocked_id) DO NOTHING;
DROP TABLE user_blocks;
CREATE INDEX blocks_blocked_idx ON blocks (blocked_id,blocker_id);
