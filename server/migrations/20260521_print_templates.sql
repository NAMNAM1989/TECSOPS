-- Print template system: master forms + per-device profiles + mm field coordinates.
-- Run once on Postgres (Railway): psql $DATABASE_URL -f server/migrations/20260521_print_templates.sql

CREATE TABLE IF NOT EXISTS print_templates (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  page_width_mm numeric(6, 2) NOT NULL DEFAULT 210,
  page_height_mm numeric(6, 2) NOT NULL DEFAULT 297,
  background_asset_url text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS print_profiles (
  id text PRIMARY KEY,
  template_id text NOT NULL REFERENCES print_templates(id) ON DELETE CASCADE,
  name text NOT NULL,
  offset_x_mm numeric(6, 2) NOT NULL DEFAULT 0,
  offset_y_mm numeric(6, 2) NOT NULL DEFAULT 0,
  scale_x numeric(6, 4) NOT NULL DEFAULT 1,
  scale_y numeric(6, 4) NOT NULL DEFAULT 1,
  is_default boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_print_profiles_template ON print_profiles(template_id);

CREATE TABLE IF NOT EXISTS print_template_fields (
  id text PRIMARY KEY,
  profile_id text NOT NULL REFERENCES print_profiles(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  pos_x_mm numeric(7, 3) NOT NULL,
  pos_y_mm numeric(7, 3) NOT NULL,
  width_mm numeric(7, 3),
  font_size_pt numeric(5, 2) NOT NULL DEFAULT 9,
  line_height_mm numeric(6, 3),
  height_mm numeric(6, 3),
  max_lines integer,
  align text NOT NULL DEFAULT 'left'
    CHECK (align IN ('left', 'center', 'right')),
  multiline boolean NOT NULL DEFAULT false,
  bold boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_print_template_fields_profile ON print_template_fields(profile_id);
