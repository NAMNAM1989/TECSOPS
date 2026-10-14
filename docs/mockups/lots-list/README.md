# Mockup — Bảng danh sách lô hàng (chỉ đề xuất giao diện)

Đã nối phương án 1 vào app thật (`DesktopShipmentTable` + `LotProfilePanel` + card/sheet mobile). File tĩnh dưới đây vẫn dùng để so sánh.

**Phương án 1 (đang chọn):** bảng desktop quét nhanh + card mobile. **Không** hiện trạng thái lô.

**Hồ sơ khách:** gộp cột KHÁCH + INFO KH. Hàng danh sách chỉ quét **mã KH → CNEE → hàng**. Shipper, địa chỉ, tên in nằm panel/sheet (desktop phải, mobile bottom sheet `?sheet=1`). Chip `Tên in ≠` khi tên in khác hồ sơ CNEE.

**Mật độ hàng:** mỗi lô đúng **3 dòng** (KH → CNEE → hàng). AWB / chuyến / cut-off nằm 1 dòng. Nút thao tác **không** nhét vào hàng — để trên panel/sheet, khỏi đội chiều cao.

**Thao tác nhanh:** panel/sheet là bàn lệnh — `In tem` + `Đo DIM` nổi, rồi `Copy AWB` / `Copy hồ sơ` / `Ghi chú` / `H21`. Cảnh báo tên in có nút `In tem với tên này`.

| File | Vai trò |
| --- | --- |
| [pro.html](./pro.html) | **Pro A/B** — polish: `?dir=a` calm light, `?dir=b` high-contrast dark |
| [index.html](./index.html) | Phương án 1 — đề xuất trước (desktop bảng + mobile card) |
| [current.html](./current.html) | Tái tạo tĩnh màn hình Ops hiện tại để so sánh |

## Pro A / B (nghiên cứu)

Cùng IA đã chốt (hàng 3 dòng, AWB+chuyến+cut-off 1 dòng, không status, thao tác panel). Token vẫn `ui.*`.

Tham chiếu thật (OpenDesign computed styles): **Vercel** (hairline, 4px grid, radius 6–8), **Linear** (dense dark, contrast, mono ID), **Mercury** (caption 11–12, restraint). Không có Flexport/airline catalog — không bịa token.

- **A calm light:** canvas `#EEF2F6`, rail 56px, command bar 1 hàng (⌘K), bảng flush không card-per-row, selected = teal rail 2px, skeleton “đang kéo Sheet”, kho 0 = chip nét đứt.
- **B ops dark:** token `.dark` official (`#020617` / `#2DD4BF`), hairline `white/8`, không đổ bóng.
- **Motion (ghi chú triển khai):** hover 150ms color-only; selected fade 900ms; skeleton 1.2s pulse; không bounce.

**Khuyến nghị: A** cho ca ngày kho (in tem/giấy, light-first hiện tại). B giữ làm ca đêm / `class="dark"`.

Dữ liệu trên cả hai file là **mẫu giả** (AWB `618-12345675`, chuyến `SQ 183` / `CX 766` / `VN 30x`). App thật cần Postgres + auth nên screenshot “hiện tại” được render từ `current.html`, bám layout `DesktopShipmentTable` / `OpsDesktopCommandBar`.

Mở file bằng trình duyệt, hoặc `npx serve docs/mockups/lots-list`.

Chụp PNG (Playwright, không chạy trong CI):

```bash
npx playwright install chromium
ARTIFACT_DIR=/opt/cursor/artifacts node docs/mockups/lots-list/screenshot.mjs
```

Ra thêm `pro-A-desktop.png`, `pro-A-mobile.png`, `pro-B-desktop.png`, `pro-B-mobile.png`.
