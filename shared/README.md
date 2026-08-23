# Shared (server + client)

Nguồn sự thật cho logic dùng chung giữa Node (`server/`) và Vite (`src/`).

- `awbFormat.mjs` — format / digits AWB
- `airlineLabelDefaults.mjs` — map prefix → tên hãng
- `airlineLabelOverridesNormalize.mjs` — chuẩn hoá override tên hãng (AWB/chuyến)
- `thermalLabelPresets.mjs` — preset khổ tem 100×80 / 100×50 (mm)
- `esidProfilesNormalize.mjs` — normalize store Agent / Người khai ESID
- `vehiclePlateNormalize.mjs` — chuẩn hóa biển số (cho phép `;`)
- `primitiveNormalize.mjs` — `clamp` / `str` / `num` (printer profiles)
- `shipmentWorkflowStatus.mjs` — derive / migrate / patch trạng thái lô
- `customerProfileLimits.mjs` — giới hạn độ dài danh bạ khách (server validate + client clamp)
- `dbSyncedAt.mjs` — parse/format `lots.synced_at` / `ops_customers.synced_at` (Asia/Saigon)

`server/*` và `src/*` chỉ re-export (typed wrapper phía TS). Sửa quy tắc tại đây, không nhân bản.
