CREATE TABLE conversations (
  id uuid PRIMARY KEY,
  participant_low_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  participant_high_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  initiator_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('requested', 'active', 'ignored', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (participant_low_id, participant_high_id),
  CHECK (participant_low_id < participant_high_id),
  CHECK (participant_low_id <> participant_high_id),
  CHECK (initiator_id = participant_low_id OR initiator_id = participant_high_id)
);
CREATE INDEX conversations_participant_updated_idx ON conversations (participant_low_id, updated_at DESC, id DESC);
CREATE INDEX conversations_participant_high_updated_idx ON conversations (participant_high_id, updated_at DESC, id DESC);

CREATE TABLE conversation_participants (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  hidden_at timestamptz,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE messages (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  kind text NOT NULL CHECK (kind IN ('greeting', 'message')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  event_id uuid NOT NULL UNIQUE,
  moderation_status text NOT NULL CHECK (moderation_status IN ('pending', 'clear', 'blocked')),
  moderation_labels jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX messages_conversation_history_idx ON messages (conversation_id, sent_at DESC, id DESC);

CREATE TABLE message_receipts (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, message_id, user_id)
);
CREATE INDEX message_receipts_unread_idx ON message_receipts (conversation_id, user_id, read_at DESC);

CREATE TABLE typing_presence (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  active boolean NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX typing_presence_expiry_idx ON typing_presence (conversation_id, expires_at);
