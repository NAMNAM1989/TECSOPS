-- Label print foundation (SoT) — tách template bố cục khỏi printer profile máy.
-- Docs: docs/label-print-foundation-impl.md
-- Apply manually when approved:
--   psql $DATABASE_URL -f server/migrations/20260902_label_print_foundation.sql
-- Do NOT use 20260521_print_templates.sql as SoT (legacy / mixed layout+device).

CREATE TABLE IF NOT EXISTS label_templates (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  kind text NOT NULL
    CHECK (kind IN ('master-cargo', 'house-cargo')),
  format text NOT NULL
    CHECK (format IN ('100x80', '100x50')),
  active_version_id text,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS label_template_versions (
  id text PRIMARY KEY,
  template_id text NOT NULL REFERENCES label_templates(id) ON DELETE CASCADE,
  version_no integer NOT NULL,
  status text NOT NULL
    CHECK (status IN ('draft', 'published', 'archived')),
  canvas_width_mm numeric(6, 2) NOT NULL,
  canvas_height_mm numeric(6, 2) NOT NULL,
  scene_jsonb jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (template_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_label_template_versions_template
  ON label_template_versions(template_id);

ALTER TABLE label_templates
  DROP CONSTRAINT IF EXISTS label_templates_active_version_fk;
ALTER TABLE label_templates
  ADD CONSTRAINT label_templates_active_version_fk
  FOREIGN KEY (active_version_id) REFERENCES label_template_versions(id)
  ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS label_printer_profiles (
  id text PRIMARY KEY,
  name text NOT NULL,
  connection_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
  capabilities_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
  calibration_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
  label_sheet_format text NOT NULL DEFAULT '100x80'
    CHECK (label_sheet_format IN ('100x80', '100x50')),
  notes text NOT NULL DEFAULT '',
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS label_printer_template_bindings (
  printer_profile_id text NOT NULL REFERENCES label_printer_profiles(id) ON DELETE CASCADE,
  label_template_id text NOT NULL REFERENCES label_templates(id) ON DELETE CASCADE,
  is_default boolean NOT NULL DEFAULT false,
  PRIMARY KEY (printer_profile_id, label_template_id)
);

CREATE INDEX IF NOT EXISTS idx_label_printer_bindings_default
  ON label_printer_template_bindings(printer_profile_id)
  WHERE is_default;

CREATE TABLE IF NOT EXISTS shipment_houses (
  id text PRIMARY KEY,
  shipment_id text NOT NULL,
  hawb text NOT NULL,
  pcs integer,
  kg numeric(12, 3),
  dim_weight_kg numeric(12, 3),
  dim_lines_jsonb jsonb,
  dest text NOT NULL DEFAULT '',
  consignee_name text NOT NULL DEFAULT '',
  goods_description text NOT NULL DEFAULT '',
  special_handling text NOT NULL DEFAULT '',
  template_id text REFERENCES label_templates(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  allocation_status text NOT NULL DEFAULT 'needs-confirmation'
    CHECK (allocation_status IN ('needs-confirmation', 'confirmed', 'unassigned')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shipment_houses_pcs_chk CHECK (pcs IS NULL OR pcs >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shipment_houses_shipment_hawb
  ON shipment_houses (shipment_id, upper(btrim(hawb)));

CREATE INDEX IF NOT EXISTS idx_shipment_houses_shipment
  ON shipment_houses(shipment_id);

CREATE TABLE IF NOT EXISTS label_print_jobs (
  id text PRIMARY KEY,
  shipment_id text NOT NULL,
  template_version_id text REFERENCES label_template_versions(id) ON DELETE SET NULL,
  printer_profile_id text REFERENCES label_printer_profiles(id) ON DELETE SET NULL,
  delivery_mode text NOT NULL
    CHECK (delivery_mode IN ('browser-print', 'tspl-tcp', 'download-tspl')),
  requested_copies integer NOT NULL CHECK (requested_copies >= 1 AND requested_copies <= 999),
  status text NOT NULL DEFAULT 'accepted'
    CHECK (status IN ('accepted', 'failed', 'cancelled')),
  data_snapshot_jsonb jsonb NOT NULL,
  command_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_label_print_jobs_shipment
  ON label_print_jobs(shipment_id, created_at DESC);

CREATE TABLE IF NOT EXISTS label_print_job_items (
  id text PRIMARY KEY,
  print_job_id text NOT NULL REFERENCES label_print_jobs(id) ON DELETE CASCADE,
  house_id text REFERENCES shipment_houses(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('master', 'house')),
  copy_index integer NOT NULL CHECK (copy_index >= 1),
  copies_entered integer NOT NULL CHECK (copies_entered >= 1),
  data_snapshot_jsonb jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_label_print_job_items_job
  ON label_print_job_items(print_job_id);
