# TECSOPS Upgrade Proposals — 2026-08-12

Chỉ đề xuất dựa trên finding/bằng chứng audit. Không rewrite toàn bộ. Roadmap P0→P3, đợt nhỏ có rollback.

## Quick wins

### U-QW-01 — Giảm noise `/tcs-agent/health` 502

- **Vấn đề:** Console error lặp khi agent offline (EXT-01)
- **Giá trị Ops:** log sạch, dễ debug portal thật
- **Phạm vi:** proxy health client + server `/tcs-agent`
- **Giải pháp:** treat 502 như Offline expected; không `fetch` spam; hoặc trả 204/JSON `{ok:false}` không kích error đỏ
- **Thay thế:** giữ nguyên, lọc console trong QA
- **Rủi ro:** thấp
- **Effort:** S
- **AC:** toolbar Offline; DevTools không error 502 liên tục khi agent tắt
- **Hồi quy:** case J agent offline UI

### U-QW-02 — Sửa pytest combobox short-tail

- **Vấn đề:** PY-01 — query đầu không ưu tiên token ngắn cuối (`PCS`)
- **Giá trị:** eSID fill ổn định hơn với tên công ty dài
- **Phạm vi:** `tcs-awb-automation` EsidDeclarePage `_combobox_search_queries`
- **Giải pháp:** ưu tiên token ngắn/viết tắt cuối chuỗi trước khi cắt prefix dài
- **Effort:** S
- **AC:** `pytest tests/test_combobox_match.py` PASS; dry-run combobox không submit
- **Hồi quy:** toàn bộ pytest suite

### U-QW-03 — Dọn 2 warning `any`

- **Vấn đề:** LINT-01
- **Effort:** S
- **AC:** `npm run lint` 0 warnings

## Reliability / Data integrity

### U-REL-01 — Harness E2E an toàn (mở khóa ma trận B/M/F)

- **Vấn đề:** mutation BLOCKED vì DB ops thật
- **Giá trị:** regression booking/sync không phá phiên thật
- **Giải pháp:** DB clone hoặc `SESSION_DATE=E2E-<ts>`; marker note/customer; cleanup script theo ID list; cấm `qa:smoke` để booking rỗng
- **Effort:** M
- **Dependency:** Docker volume/snapshot riêng
- **AC:** tạo/xóa 1 booking E2E; reload + 2nd context sync; zero leftover

### U-REL-02 — Server luôn enforce invariant (đã có AWB conflict — mở rộng checklist)

- **Vấn đề:** client validation không đủ (prompt M/O); VAL-01 / AWB-01
- **Giải pháp:** đồng bộ rule customer code server=client; quyết định nghiệp vụ cho AWB &lt;11 số; contract test trùng AWB + `SET_CUSTOMERS` mã xấu
- **Effort:** M
- **AC:** mutation xấu → 400 ổn định; vitest/server tests xanh

### U-REL-03 — Offline queue: không silent drop

- **Vấn đề:** SYNC-01 — queue đầy vẫn áp local, không enqueue
- **Giải pháp:** chặn mutate + toast rõ; hoặc disk-backed queue; không bao giờ apply-without-enqueue
- **Effort:** M
- **AC:** khi queue full, UI báo lỗi; sau reconnect không mất row đã “thấy” trên UI
- **Hồi quy:** test offline giả lập với max queue nhỏ

### U-REL-04 — Sửa / thay `qa:smoke` để không để booking rỗng

- **Vấn đề:** SMOKE-01
- **Giải pháp:** marker `E2E-smoke-<ts>` + DELETE cleanup; hoặc bỏ create khỏi smoke mặc định
- **Effort:** S
- **AC:** chạy `npm run qa:smoke` trên DB test → delta rows = 0 sau cleanup

## Business logic

### U-BL-01 — Giữ ranh giới kho / eCargo (không regress)

- **Evidence:** PASS D-ecargo + workflow C
- **Đề xuất:** lock bằng UI e2e + unit `warehouses.test.ts` trong CI bắt buộc
- **Effort:** S
- **AC:** TECS-SCSC không hiện eCargo; SCSC không hiện RECEPTION_COMPLETED

## UI/UX / A11y

### U-UX-01 — Audit a11y formal (axe/keyboard trap)

- **Vấn đề:** mới smoke shortcut `/` và overflow
- **Giải pháp:** axe-core trên Ops/Customers/Stats/modals; focus trap DIM/print
- **Effort:** M
- **AC:** zero critical axe; Escape trả focus

### U-UX-02 — Touch target ≥44px trên sticky mobile

- **Effort:** S–M (đo thật sau screenshot mobile sticky)
- **AC:** các CTA chính ≥44×44 trên 390×844

## Performance

### U-PERF-01 — Code-split `AirCargoTracking` / Excel / Stats

- **Vấn đề:** PERF-01
- **Giải pháp:** tách modal Sheet/Excel/print/CSD/portal khỏi chunk Ops chính; giữ lazy Stats/Customers
- **Thay thế:** chỉ tăng `chunkSizeWarningLimit` (không khuyến nghị)
- **Rủi ro:** lazy flash — đã có `PageSkeleton`
- **Effort:** L
- **AC:** Ops main chunk < ~600kB gz hợp lý; TTI cải thiện đo trên fixture 100/1000 rows

## Security

### U-SEC-01 — Authn cho mutation + đọc state nhạy cảm

- **Vấn đề:** SEC-01 (P0)
- **Giá trị Ops:** an toàn khi host expose ngoài LAN
- **Giải pháp lựa chọn:**
  1. **Shared secret / session cookie** nội bộ (nhanh)
  2. OIDC/SSO (lâu hơn)
  3. Network-only (Tailscale/VPN) + document rõ — chấp nhận rủi ro còn lại
- **Khuyến nghị đợt 1:** token/header bắt buộc cho `POST /api/mutation(s)` + tùy chọn đọc `/api/state`; Socket.IO cùng secret
- **Rủi ro migration:** mọi client/ext/agent phải gửi credential
- **Effort:** L
- **AC:** request không token → 401; Ops hợp lệ vẫn Live sync
- **Hồi quy:** httpMutationSmoke + dual context

### U-SEC-02 — Security headers

- **Vấn đề:** SEC-02
- **Giải pháp:** middleware helmet-lite / tự set XCTO, frame-ancestors, CSP tương thích Vite SPA + extension postMessage
- **Effort:** S–M
- **AC:** headers hiện trên `/` và `/api/health`; app không vỡ

### U-SEC-03 — Che lỗi mutation ở prod + rate-limit nhẹ

- **Vấn đề:** SEC-03
- **Giải pháp:** prod trả mã lỗi ổn định; log chi tiết server-side; rate-limit `/api/mutation(s)` theo IP/token
- **Effort:** S–M
- **AC:** prod response không chứa stack/path nội bộ; burst 100 req/s bị 429

## Test infrastructure

### U-TEST-01 — Playwright project trong repo (không chỉ MCP ad-hoc)

- **Giải pháp:** `tests/e2e` + config BASE_URL; artifact `output/playwright-audit/`
- **Effort:** M
- **AC:** `npm run test:e2e` smoke A/D/C read-only xanh trên CI local

### U-TEST-02 — Fixture Sheet/Excel offline

- **Vấn đề:** H BLOCKED
- **Effort:** M
- **AC:** import 9/22 cột + export round-trip không mạng

## Roadmap đề xuất

| Đợt | Nội dung | Rollback |
|-----|----------|----------|
| 1 | U-QW-01–03, U-SEC-02, U-SEC-03, U-REL-04, U-BL-01 | revert PR nhỏ |
| 2 | U-REL-01 + U-REL-03 + U-TEST-01 → mở mutation matrix | tắt job e2e |
| 3 | U-SEC-01 (auth) + U-REL-02 | feature flag LAN cũ |
| 4 | U-PERF-01 + U-UX-01 | revert split |

## 10 nâng cấp đáng làm nhất (value/effort)

1. U-SEC-01 Auth mutation/state  
2. U-SEC-02 Security headers  
3. U-REL-03 Offline queue không silent drop  
4. U-REL-01 E2E harness an toàn  
5. U-PERF-01 Code-split Ops/Excel  
6. U-SEC-03 Error leak + rate-limit  
7. U-REL-02 Customer code / AWB invariant parity  
8. U-QW-02 Combobox short-tail  
9. U-REL-04 Fix `qa:smoke` cleanup  
10. U-TEST-01 Playwright e2e repo  

Không đề xuất rewrite UI toàn phần trong đợt này.
