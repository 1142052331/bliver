ALTER TABLE identity_users
  DROP CONSTRAINT IF EXISTS identity_users_username_format;
--> statement-breakpoint
ALTER TABLE identity_users
  ADD CONSTRAINT identity_users_username_format CHECK (
    char_length(username) BETWEEN 1 AND 32
    AND username = btrim(username)
    AND username !~ '[[:cntrl:]]'
  );
