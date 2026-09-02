# Giai đoạn 1 — Data foundation (in tem)

Ngày: 2026-09-02  
Cha: [label-print-platform-design.md](./label-print-platform-design.md)  
Trạng thái: triển khai model + schema + test (chưa nối API/Ops UI)

## Mục tiêu

Tách rõ **template bố cục**, **printer profile máy**, và **ShipmentHouse** trước khi làm TSPL bridge / designer / in theo HAWB.

Không đổi hành vi modal browser `PrintShippingLabel` trong giai đoạn này.

## File / module

| Path | Việc |
|---|---|
| `src/printing/labelFoundationTypes.ts` | Types: `ShipmentHouse`, template version, print job snapshot, allocation |
| `src/printing/shipmentHouseCore.ts` | Normalize, validate, migrate `hawb` → houses, tổng PCS |
| `src/printing/shipmentHouseCore.test.ts` | Unit test model |
| `src/printing/labelTemplateScene.ts` | Scene graph tối thiểu (mm) + validate clipping |
| `src/printing/labelTemplateScene.test.ts` | Unit test scene |
| `server/migrations/20260902_label_print_foundation.sql` | Schema Postgres SoT |
| `server/migrations/20260521_print_templates.sql` | Đánh dấu LEGACY |

## Schema (Postgres)

Tables:

- `label_templates` — id, code, name, kind (`master-cargo` \| `house-cargo`), format (`100x80` \| `100x50`), active_version_id
- `label_template_versions` — version_no, status (`draft` \| `published` \| `archived`), canvas mm, `scene_jsonb`
- `label_printer_profiles` — connection + capabilities + calibration JSONB (tách khỏi template)
- `label_printer_template_bindings` — máy ↔ template mặc định
- `shipment_houses` — nhiều HAWB / MAWB; `allocation_status`

Không dùng lại bảng `print_templates` / `print_profiles` / `print_template_fields` từ migration 20260521.

## API (chưa implement — khóa contract)

| Method | Path | Mục đích |
|---|---|---|
| `GET` | `/api/printing/templates` | List templates + active version meta |
| `POST` | `/api/printing/templates` | Tạo template + draft version 1 |
| `POST` | `/api/printing/templates/:id/versions` | Draft mới từ version hiện tại |
| `POST` | `/api/printing/templates/:id/versions/:version/publish` | Publish (If-Match revision) |
| `GET`/`PUT` | `/api/printing/printers` | Catalog profile máy |
| `GET`/`PUT` | `/api/shipments/:id/houses` | CRUD house + validation tổng PCS |

Mọi update dùng `revision` / `If-Match`. Payload print job nhận snapshot đã validate, không nhận raw TSPL từ client ở giai đoạn sau.

## Quy tắc model House

- HAWB không trùng trong cùng `shipmentId` (so khớp trim + upper).
- `pcs` house: `null` (chưa xác nhận) hoặc số nguyên ≥ 1.
- Tổng `pcs` house (chỉ đếm số đã có) ≤ master `pcs` khi master `pcs` là số ≥ 1.
- Migrate từ `shipment.hawb` khác rỗng → một house, `pcs: null`, `allocationStatus: "needs-confirmation"`.
- Không tự gán toàn bộ master PCS cho HAWB cũ.

## Test plan

```bash
npm run test -- src/printing/shipmentHouseCore.test.ts src/printing/labelTemplateScene.test.ts
```

Coverage tối thiểu:

- Normalize id / hawb / sortOrder
- Reject duplicate HAWB
- Reject tổng pcs vượt master
- Migrate legacy `hawb` → needs-confirmation
- Scene: element ngoài canvas → invalid; field thiếu bắt buộc khi publish draft → invalid

## Ngoài phạm vi giai đoạn này

- UI cân chỉnh máy / TSPL bridge
- Designer kéo-thả
- Đổi `LabelContent` để in HAWB trên tem Master
- Nối `shipment_houses` vào `postgresStateStore` write path (làm ở PR follow-up khi API sẵn)
- Chạy migration trên Railway production (cần approve riêng)
