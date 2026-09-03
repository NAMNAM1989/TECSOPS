# Catalog H21 — chỉ kho SCSC

Nguồn: `H21_SCSC.xlsx` (sheet DATA SC + STAMP_ID).

- `catalog.json` — 122 mặt hàng (seed Postgres `scsc_h21_goods`)
- `stamp-ids.json` — shipper → stamp ID

Tái tạo từ Excel:

```bash
python scripts/gen-scsc-h21-seed.py
npm run migrate:scsc-h21
```

Scope cứng: `warehouseScope = "SCSC"` (không dùng cho TECS-SCSC / TCS / TECS-TCS).
