INSERT INTO discovery_entries (
  footprint_id,
  author_id,
  region_id,
  country_code,
  visibility,
  location_precision,
  display_point,
  message,
  has_media,
  published_at,
  discovery_expires_at,
  deleted_at,
  updated_at
)
SELECT
  f.id,
  f.author_id,
  f.region_id,
  r.country_code,
  f.visibility,
  f.location_precision,
  f.display_point,
  f.message,
  EXISTS (
    SELECT 1
    FROM footprint_media fm
    JOIN media_assets ma ON ma.id = fm.asset_id
    WHERE fm.footprint_id = f.id
      AND ma.version IS NOT NULL
      AND ma.width IS NOT NULL
      AND ma.height IS NOT NULL
      AND ma.format IS NOT NULL
  ),
  f.published_at,
  f.discovery_expires_at,
  NULL,
  now()
FROM footprints f
LEFT JOIN regions r ON r.id = f.region_id
WHERE f.moderation_hidden_at IS NULL
ON CONFLICT (footprint_id) DO UPDATE SET
  author_id = EXCLUDED.author_id,
  region_id = EXCLUDED.region_id,
  country_code = EXCLUDED.country_code,
  visibility = EXCLUDED.visibility,
  location_precision = EXCLUDED.location_precision,
  display_point = EXCLUDED.display_point,
  message = EXCLUDED.message,
  has_media = EXCLUDED.has_media,
  published_at = EXCLUDED.published_at,
  discovery_expires_at = EXCLUDED.discovery_expires_at,
  deleted_at = NULL,
  updated_at = now();
