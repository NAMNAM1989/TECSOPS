# Giao thức Ops ↔ Chrome Ext (TECSOPS)

## Mô hình thực thi (bắt buộc)

```
Người dùng bấm nút trên Ops (web)
        ↓  postMessage (content-ops.js)
Chrome Ext trên PC kho (ext_tcs / ext_scsc)
        ↓
Tab tcs.com.vn / ecargo.scsc.vn trên máy đó
```

**Không** dùng Playwright server / Railway dual-agent / automation trong container để thay Ext khi làm việc trên PC kho.
`TCS_AGENT_*` + `browser_profile` chỉ là **fallback** (tắt «Trực quan» hoặc mobile không có Ext).

## Hai Ext chuẩn

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
| `EXT_READY` | Ext→Ops | Content-script vừa load — Ops cập nhật chip Ext ngay |
| `PING` | Ops→Ext | Kiểm tra sống → `PONG` + `workspace` |
| Job TCS | Ops→Ext | `TCS_OPEN`, `TCS_BOOTSTRAP`, `TCS_SCAN_DATE`, `TCS_INVALIDATE_SESSION`, `FILL_ESID`, `DOWNLOAD_ESID_PDF`, `AGENT_FETCH` |
| Job SCSC | Ops→Ext | `ECARGO_OPEN`, `FILL_ECARGO_VCT`, `REGISTER_ECARGO_VCT`, `ECARGO_LOOKUP_AGENT`, `ECARGO_OTP_PROVIDE` |
| Result | Ext→Ops | Cùng `id`, `ok: true` (+ dữ liệu job) |
| Error | Ext→Ops | `ok: false` + `error` … Ops tự gắn `TIMEOUT` nếu hết hạn |

### `ECARGO_OTP_PROVIDE` (hook Ext-friendly)

Ops (hoặc mapper Gmail trên PC sau này) gửi `{ code?, verifyUrl? }` → Ext mở link + «Xác Thực».
Không chứa / không yêu cầu credential Gmail trong payload. IMAP server hiện tại vẫn dùng cho `REGISTER_ECARGO_VCT` cho đến khi mapping Gmail trên Ext sẵn sàng.

## UX trạng thái Ext (Ops bar)

| Trước | Sau |
|---|---|
| Trạng thái Ext lẫn với agent trong 1 pill | Chip **Ext · offline / sẵn sàng / đã login** luôn hiện |
| Ext offline + Trực quan → vẫn fallback Railway | Chỉ Ext; chip báo offline — cài từ «Tải Ext» |
| Menu tải 3 Ext | Chỉ **TCS + SCSC**; TECS-TCS soft-deprecate |

## eSID / eCargo

- eSID: không đụng trong PR này (chờ quyết định user).
- eCargo VCT + SCSC: App-click → Ext SCSC; hook OTP provide sẵn cho Gmail mapping sau.
