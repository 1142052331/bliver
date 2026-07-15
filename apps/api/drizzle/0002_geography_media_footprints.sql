CREATE TABLE IF NOT EXISTS regions (
  id uuid PRIMARY KEY,
  parent_id uuid REFERENCES regions(id) ON DELETE SET NULL,
  country_code text NOT NULL,
  region_code text,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT regions_country_code_format CHECK (country_code ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS regions_country_region_code_idx
  ON regions(country_code, region_code)
  WHERE region_code IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS regions_parent_idx ON regions(parent_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS places (
  id uuid PRIMARY KEY,
  region_id uuid REFERENCES regions(id) ON DELETE SET NULL,
  name text NOT NULL,
  country_code text,
  location geography(Point, 4326) NOT NULL,
  provider text,
  provider_place_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT places_country_code_format CHECK (
    country_code IS NULL OR country_code ~ '^[A-Z]{2}$'
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS places_location_gist_idx ON places USING gist (location);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS places_region_name_idx ON places(region_id, name);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS places_provider_reference_idx
  ON places(provider, provider_place_id)
  WHERE provider IS NOT NULL AND provider_place_id IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS footprints (
  id uuid PRIMARY KEY,
  author_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  place_id uuid REFERENCES places(id) ON DELETE SET NULL,
  region_id uuid REFERENCES regions(id) ON DELETE SET NULL,
  private_point geography(Point, 4326) NOT NULL,
  display_point geography(Point, 4326) NOT NULL,
  visibility text NOT NULL,
  location_precision text NOT NULL,
  message text NOT NULL,
  mood text,
  published_at timestamptz NOT NULL DEFAULT now(),
  discovery_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT footprints_visibility_valid CHECK (
    visibility IN ('public', 'friends', 'private')
  ),
  CONSTRAINT footprints_location_precision_valid CHECK (
    location_precision IN ('precise', 'approximate')
  ),
  CONSTRAINT footprints_display_point_required CHECK (display_point IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS footprints_display_point_gist_idx
  ON footprints USING gist (display_point);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS footprints_author_published_idx
  ON footprints(author_id, published_at DESC, id DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS footprints_visibility_published_idx
  ON footprints(visibility, published_at DESC, id DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS footprints_visibility_discovery_expiry_idx
  ON footprints(visibility, discovery_expires_at, published_at DESC, id DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS footprint_media (
  id uuid PRIMARY KEY,
  footprint_id uuid NOT NULL REFERENCES footprints(id) ON DELETE CASCADE,
  asset_id text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT footprint_media_position_nonnegative CHECK (position >= 0),
  CONSTRAINT footprint_media_asset_unique UNIQUE (footprint_id, asset_id),
  CONSTRAINT footprint_media_position_unique UNIQUE (footprint_id, position)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS footprint_media_footprint_idx
  ON footprint_media(footprint_id, position);
