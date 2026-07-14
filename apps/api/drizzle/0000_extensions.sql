CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS platform;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS platform.system_markers (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
