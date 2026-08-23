# Playwright MCP — checklist QA Ops / portal TCS

Playwright MCP trong Cursor dùng để **test và debug**, không thay Chrome Ext cho vận hành ngày.

## Vai trò

| Công cụ | Dùng khi |
|---|---|
| Chrome Ext (TCS + SCSC) | Đăng Nhập TCS, Quét, Điền, Tải PDF trên máy có Chrome |
| Playwright MCP (Cursor) | Agent chat: mở Ops/portal, tái hiện lỗi, kiểm locator |
| OCR trong Ext | ONNX trên Ext TCS — nhập tay trên tab TCS nếu CAPTCHA fail |

**Không** wire Playwright MCP vào production Ops API. Agent Python / dual-agent đã gỡ (A3).

## Prompt mẫu (Cursor + Playwright MCP)

```
Mở Ops local (http://127.0.0.1:5173), đăng nhập nếu cần.
Vào Air Cargo / phiên ngày hôm nay.
Chụp thanh TCS: trạng thái Ext (Đã Đăng Nhập TCS / cần Đăng Nhập TCS / Offline).
Không gọi API agent PDF/fill — chỉ quan sát UI.
```

## Checklist smoke

1. **Ext ping** — Ops hiện badge Ext (không «máy kho» / worker). Offline → hướng dẫn «Tải Ext» + đúng Chrome profile kho.
2. **ĐN** — form user/pass → tab TCS; nếu CAPTCHA không OCR được → nhập tay trên tab portal, không bắt buộc agent headed.
3. **Quét** — chỉ khi Ext đã ĐN; cập nhật lô chưa HT tiếp nhận đúng kho đang chọn.
4. **Điền dry-run** — menu ⋮ → Điền trên Ext; kiểm form trên tab TCS; không submit nếu đang dry-run.
5. **Tải PDF** — menu ⋮ → Tải PDF qua Ext (không chờ prefetch agent).
6. **Đổi kho** — TECS-TCS ↔ TCS: bắt ĐN lại đúng user; không dùng chung session giả định.

## Khi tái hiện bug portal

- Dùng MCP mở `https://www.tcs.com.vn` (hoặc URL login hiện tại) để đọc DOM/locator.
- Sửa locator trong Ext rồi verify lại bằng Ext trên Chrome user.
- Không dùng MCP làm đường ĐN/Quét/Điền/PDF thay Ext trong sản xuất.

## Scripts đã gỡ (A3)

- `tcs-awb-automation/` + `tcs:agent*` + `portal:start:*` + `portal:headed:local`
- `portal:worker` / `portal-worker.mjs` (gỡ trước)
- `/tcs-agent` stub 410 — không còn Playwright trong container
