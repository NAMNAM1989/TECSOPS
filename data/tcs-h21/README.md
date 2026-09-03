# Catalog H21 — chỉ kho TCS

Độc lập với H21 SCSC. Seed ban đầu trống — import qua trang H21 TCS.

- `catalog.json` — mặt hàng (Postgres `tcs_h21_goods`)
- `stamp-ids.json` — shipper stamp ID

```bash
npm run migrate:tcs-h21
```

Scope cứng: `warehouseScope = "TCS"` (không dùng TECS-TCS / SCSC / TECS-SCSC).
