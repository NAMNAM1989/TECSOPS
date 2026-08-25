# Giao thức Ops ↔ Chrome Ext (TECSOPS)

## Mô hình thực thi (bắt buộc)

```
Người dùng bấm nút trên Ops (web)
        ↓  postMessage (content-ops.js)
Chrome Ext trên PC kho (chrome-extension-tcs / chrome-extension-scsc)
        ↓
Tab tcs.com.vn / ecargo.scsc.vn trên máy đó
```

**Không** dùng Playwright server / Railway dual-agent / Python `tcs-awb-automation`.
`TCS_AGENT_*` + volume `browser_profile` là ops follow-up (gỡ trên Railway, không trong code).

## Hai Ext chuẩn

| Ext | Thư mục | Channel | Mã kho dữ liệu |
|---|---|---|---|
| **TCS ESID** | `chrome-extension-tcs` | `tecsops-tcs-direct-ext` | **TCS** và **TECS-TCS** |
| **SCSC eCargo** | `chrome-extension-scsc` | `tecsops-scsc-ecargo-ext` | SCSC |

Không còn gói / thư mục `chrome-extension/` (legacy). Cài **TCS + SCSC**.  
Mã kho **TECS-TCS** giữ trong DB / `warehouses.ts` — Ops gửi lệnh qua channel Ext TCS, không qua `tecsops-tcs-ext`.  
Channel `tecsops-tcs-ext` chỉ còn lắng nghe (máy còn Ext cũ unpacked) — không gửi lệnh mới.

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
| Ext offline + Trực quan → fallback Railway | Chỉ Ext; mobile báo «cần Ext trên PC» |
| Menu tải 3 Ext | Chỉ **TCS + SCSC** |

## eSID / eCargo

- eSID: không đụng trong PR này (chờ quyết định user).
- eCargo VCT + SCSC: App-click → Ext SCSC; hook OTP provide sẵn cho Gmail mapping sau.
