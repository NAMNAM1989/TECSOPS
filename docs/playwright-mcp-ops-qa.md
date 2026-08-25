# Playwright MCP — checklist QA Ops

Playwright MCP trong Cursor dùng để **test và debug UI Ops**. Không còn Chrome Ext / cổng TCS / eCargo.

## Vai trò

| Công cụ | Dùng khi |
|---|---|
| Playwright MCP (Cursor) | Agent chat: mở Ops, tái hiện lỗi layout/lọc/DIM/in |
| App login (`AppAuthGate`) | Gate web — không liên quan portal TCS |

**Không** wire Playwright MCP vào production Ops API.

## Prompt mẫu (Cursor + Playwright MCP)

```
Mở Ops local (http://127.0.0.1:5173), đăng nhập nếu cần.
Vào Air Cargo / phiên ngày hôm nay.
Xác nhận thanh công cụ: Booking, Nhập Sheet, Thống kê, Ảnh báo cáo, DayPulse, 4 chip kho.
Không còn nút Tải Ext, Đăng Nhập TCS, hay eCargo.
```

## Checklist smoke

1. **Ops load** — page + sync Live / Hạn chế; không 404 vì UI không gọi API Ext/eCargo.
2. **Không leftover UI** — không «Tải Ext», không «Đăng Nhập TCS», không «eCargo».
3. **4 mã kho** — chip TECS-TCS / TECS-SCSC / TCS / SCSC + DayPulse.
4. **Ảnh báo cáo** — Vantage / Tecs / TCS / SCSC trên toolbar (không chôn trong ⋯).
5. **DIM / in / CSD** — modal DIM, in tem, CSD vẫn mở từ hàng lô.
6. **Công cụ** — Sheet, Thống kê, Khách, Excel; `EsidSettingsMenu` (Người khai / Agent) trên thanh công cụ.

## Scripts đã gỡ

- Chrome Ext TCS/SCSC, menu Tải Ext, `/api/chrome-extensions`, `/api/tcs-extension*`, `/api/ecargo*`
- `tcs-awb-automation/` + `tcs:agent*` + `portal:start:*` + `portal:headed:local`
- `portal:worker` / `portal-worker.mjs`
- `/tcs-agent` stub 410 — không còn Playwright trong container
