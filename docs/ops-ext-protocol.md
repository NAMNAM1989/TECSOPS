# Giao thức Ops ↔ Chrome Ext (TECSOPS)

Chuẩn hoá handshake giữa trang Ops và `content-ops.js` của **hai** Ext khuyến nghị:

| Ext | Thư mục | Channel | Kho |
|---|---|---|---|
| **TCS ESID** | `chrome-extension-tcs` | `tecsops-tcs-direct-ext` | TCS |
| **SCSC eCargo** | `chrome-extension-scsc` | `tecsops-scsc-ecargo-ext` | SCSC |

`chrome-extension/` (channel `tecsops-tcs-ext`, kho TECS-TCS) **deprecated** — vẫn hiểu protocol nếu đã cài, nhưng **không** hiện trong menu «Tải Ext».

## Envelope

```ts
// Ops → Ext
{ channel, direction: "to-ext", id: string, type: string, payload?: unknown }

// Ext → Ops (result / error — cùng id)
{ channel, direction: "from-ext", id: string, ok: boolean, error?: string, message?: string, ... }

// Ext → Ops (ready ping — không id)
{ channel, direction: "from-ext", type: "EXT_READY", ok: true, version?, portalWarehouse? }
```

- Chỉ nhận khi `event.source === window` và `event.origin === location.origin`.
- Ops gửi `postMessage(..., location.origin)`.

## Message types

| Type | Hướng | Ý nghĩa |
|---|---|---|
| `EXT_READY` | Ext→Ops | Content-script vừa load — Ops cập nhật chip Ext ngay (không chờ poll 10s) |
| `PING` | Ops→Ext | Kiểm tra sống → `PONG` + `workspace` |
| Job TCS | Ops→Ext | `TCS_OPEN`, `TCS_BOOTSTRAP`, `TCS_SCAN_DATE`, `TCS_INVALIDATE_SESSION`, `FILL_ESID`, `DOWNLOAD_ESID_PDF`, `AGENT_FETCH` |
| Job SCSC | Ops→Ext | `ECARGO_OPEN`, `FILL_ECARGO_VCT`, `REGISTER_ECARGO_VCT`, `ECARGO_LOOKUP_AGENT` |
| Result | Ext→Ops | Cùng `id`, `ok: true` (+ dữ liệu job) |
| Error | Ext→Ops | `ok: false` + `error` (`EXT_CONTEXT_INVALIDATED`, `EXT_SEND_FAILED`, `EMPTY_RESPONSE`, `EXT_THROW`, …). Ops tự gắn `TIMEOUT` nếu hết hạn |

## UX trạng thái Ext (Ops bar)

| Trước | Sau |
|---|---|
| Trạng thái Ext lẫn với agent trong 1 pill / title | Chip **Ext · offline / sẵn sàng / đã login** luôn hiện trên bar |
| Phải chờ poll 10s sau Reload Ext | `EXT_READY` → ping ngay |
| Menu tải 3 Ext (TECS-TCS / TCS / SCSC) | Chỉ **TCS + SCSC**; TECS-TCS soft-deprecate |

## Automation policy

- **Desktop mặc định Ext-first** (`trực quan` bật): có Ext → chỉ Ext; không có Ext → fallback agent Railway.
- **Mobile**: agent-only (Quét/PDF) — không đổi.
- Agent Railway (`TCS_AGENT_*`, `browser_profile`) giữ làm **fallback**, không xoá trong PR này.

## eSID / eCargo

- eSID (điền phiếu): không đụng trong PR protocol — vẫn qua Ext TCS / agent như cũ.
- eCargo VCT + SCSC: giữ nguyên luồng Ext SCSC.
