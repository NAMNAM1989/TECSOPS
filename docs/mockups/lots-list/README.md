# Mockup — Bảng danh sách lô hàng (chỉ đề xuất giao diện)

**Không** nối vào app, không sửa `src/`, server, hay CI.

**Phương án 1 (đang chọn):** bảng desktop quét nhanh + card mobile. **Không** hiện trạng thái lô (đã gỡ khỏi Ops).

| File | Vai trò |
| --- | --- |
| [index.html](./index.html) | Phương án 1 — đề xuất (desktop bảng + mobile card) |
| [current.html](./current.html) | Tái tạo tĩnh màn hình Ops hiện tại để so sánh |

Dữ liệu trên cả hai file là **mẫu giả** (AWB `618-12345675`, chuyến `SQ 183` / `CX 766` / `VN 30x`). App thật cần Postgres + auth nên screenshot “hiện tại” được render từ `current.html`, bám layout `DesktopShipmentTable` / `OpsDesktopCommandBar`.

Mở file bằng trình duyệt, hoặc `npx serve docs/mockups/lots-list`.

Chụp PNG (Playwright, không chạy trong CI):

```bash
npx playwright install chromium
ARTIFACT_DIR=/opt/cursor/artifacts node docs/mockups/lots-list/screenshot.mjs
```

Ra `current-desktop.png` (1440×900), `mockup-desktop.png` (1440×900), `mockup-mobile.png` (390×844).
