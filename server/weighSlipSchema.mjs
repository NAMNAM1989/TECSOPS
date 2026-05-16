export const WEIGH_SLIPS_TABLE = "weigh_slips";

export async function ensureWeighSlipSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${WEIGH_SLIPS_TABLE} (
      id text PRIMARY KEY,
      status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'final', 'archived')),
      template_name text NOT NULL DEFAULT '',
      customer_id text REFERENCES customers(id) ON DELETE SET NULL,
      customer_consignee_id text REFERENCES customer_consignees(id) ON DELETE SET NULL,
      legacy_shipment_id text REFERENCES shipments(id) ON DELETE SET NULL,
      mawb_no text NOT NULL DEFAULT '',
      hawb_no text NOT NULL DEFAULT '',
      shipper_name text NOT NULL DEFAULT '',
      shipper_address text NOT NULL DEFAULT '',
      shipper_contact text NOT NULL DEFAULT '',
      shipper_email_fax text NOT NULL DEFAULT '',
      shipper_tax_code text NOT NULL DEFAULT '',
      consignee_name text NOT NULL DEFAULT '',
      consignee_address text NOT NULL DEFAULT '',
      consignee_tax_account text NOT NULL DEFAULT '',
      notify_agent_name text NOT NULL DEFAULT '',
      notify_agent_address text NOT NULL DEFAULT '',
      notify_agent_contact text NOT NULL DEFAULT '',
      notify_other text NOT NULL DEFAULT '',
      destination_airport char(3),
      flight_no text NOT NULL DEFAULT '',
      flight_date date,
      hawb_count_status text NOT NULL DEFAULT '',
      goods_description text NOT NULL DEFAULT '',
      hs_code text NOT NULL DEFAULT '',
      pieces integer,
      gross_weight double precision,
      chargeable_weight double precision,
      dimensions text NOT NULL DEFAULT '',
      handling_instruction text NOT NULL DEFAULT '',
      internal_note text NOT NULL DEFAULT '',
      print_form_snapshot jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      created_by uuid
    )
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_weigh_slips_status ON ${WEIGH_SLIPS_TABLE}(status)`
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_weigh_slips_mawb ON ${WEIGH_SLIPS_TABLE}(mawb_no)`
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_weigh_slips_created ON ${WEIGH_SLIPS_TABLE}(created_at DESC)`
  );
}
