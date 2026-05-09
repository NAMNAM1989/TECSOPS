-- Bảng CNEE lưu sẵn theo khách + liên kết booking (phiếu cân SCSC).
BEGIN;

CREATE TABLE IF NOT EXISTS customer_consignees (
  id text PRIMARY KEY,
  customer_id text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  consignee_name text NOT NULL DEFAULT '',
  consignee_address text NOT NULL DEFAULT '',
  consignee_phone text NOT NULL DEFAULT '',
  consignee_email text NOT NULL DEFAULT '',
  notify_name text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_customer_consignees_customer ON customer_consignees(customer_id);

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS customer_consignee_id text REFERENCES customer_consignees(id) ON DELETE SET NULL;

COMMIT;
