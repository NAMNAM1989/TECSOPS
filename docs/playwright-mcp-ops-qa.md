# Playwright MCP — checklist QA Ops / portal TCS

Playwright MCP trong Cursor dùng để **test và debug**, không thay Chrome Ext cho vận hành ngày.

## Vai trò

| Công cụ | Dùng khi |
|---|---|
| Chrome Ext (TCS + SCSC) | Đăng Nhập TCS, Quét, Điền, Tải PDF trên máy có Chrome |
| Playwright MCP (Cursor) | Agent chat: mở Ops/portal, tái hiện lỗi, kiểm locator |
| OCR agent `:8765`/`:8766` | Tuỳ chọn — Ext có thể nhập CAPTCHA tay nếu OCR offline |

**Không** wire Playwright MCP vào production Ops API. Script `portal:worker` / `portal:start:warehouse` đã gỡ (A3).

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
- Sửa locator trong Ext / `tcs-awb-automation` rồi verify lại bằng Ext trên Chrome user.
- Không dùng MCP làm đường ĐN/Quét/Điền/PDF thay Ext trong sản xuất.

## Scripts đã gỡ (A3)

- `portal:worker` / `portal:start:warehouse` / `portal-worker.mjs` — không còn trong package.
- Dual-agent local vẫn dùng `portal:start:hub` / `portal:start:tcs` / `portal:headed:local`.

Giữ `tcs-awb-automation` / `npm run tcs:agent:real` chỉ khi cần OCR nội bộ hoặc tooling debug (`VITE_PORTAL_EXECUTOR_POLICY=agent-only`).
