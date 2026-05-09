BEGIN;

CREATE TABLE IF NOT EXISTS state_meta (
  id text PRIMARY KEY,
  version bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_print_profiles (
  customer_id text PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  shipper_name text NOT NULL DEFAULT '',
  shipper_address text NOT NULL DEFAULT '',
  shipper_phone text NOT NULL DEFAULT '',
  shipper_email text NOT NULL DEFAULT '',
  shipper_vat_code text NOT NULL DEFAULT '',
  agent_name text NOT NULL DEFAULT '',
  agent_address text NOT NULL DEFAULT '',
  agent_phone text NOT NULL DEFAULT '',
  agent_email text NOT NULL DEFAULT '',
  agent_vat_code text NOT NULL DEFAULT '',
  consignee_name text NOT NULL DEFAULT '',
  consignee_address text NOT NULL DEFAULT '',
  consignee_phone text NOT NULL DEFAULT '',
  consignee_email text NOT NULL DEFAULT '',
  notify_name text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shipments (
  id text PRIMARY KEY,
  stt integer NOT NULL,
  session_date text NOT NULL,
  awb text NOT NULL,
  flight text NOT NULL,
  flight_date text NOT NULL,
  cutoff text NOT NULL,
  cutoff_note text NOT NULL,
  note text NOT NULL,
  dest text NOT NULL,
  warehouse text NOT NULL,
  pcs integer NULL,
  kg double precision NULL,
  dim_weight_kg double precision NULL,
  dim_lines jsonb NULL,
  dim_divisor integer NULL,
  customer text NOT NULL,
  customer_code text NOT NULL DEFAULT '',
  customer_id text NULL REFERENCES customers(id) ON DELETE SET NULL,
  shipper_name_print text NOT NULL DEFAULT '',
  shipper_address_print text NOT NULL DEFAULT '',
  shipper_phone_print text NOT NULL DEFAULT '',
  shipper_email_print text NOT NULL DEFAULT '',
  tax_code_print text NOT NULL DEFAULT '',
  agent_name_print text NOT NULL DEFAULT '',
  agent_address_print text NOT NULL DEFAULT '',
  agent_phone_print text NOT NULL DEFAULT '',
  agent_email_print text NOT NULL DEFAULT '',
  agent_tax_code_print text NOT NULL DEFAULT '',
  consignee_name_print text NOT NULL DEFAULT '',
  consignee_address_print text NOT NULL DEFAULT '',
  consignee_phone_print text NOT NULL DEFAULT '',
  consignee_email_print text NOT NULL DEFAULT '',
  notify_name_print text NOT NULL DEFAULT '',
  status text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shipments_session_date ON shipments(session_date);
CREATE INDEX IF NOT EXISTS idx_shipments_customer_id ON shipments(customer_id);

COMMIT;
