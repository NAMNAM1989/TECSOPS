# TECSOPS Playwright MCP Audit — 2026-08-12

## Executive Summary

Audit Giai đoạn 0 (code/baseline) + Giai đoạn 1 read-only Playwright trên `http://127.0.0.1:3001` (Postgres Docker local `:5434`). Baseline khớp tham chiếu ngày 12/08. UI shell/route/workflow kho/eCargo boundary/search/print/DIM/stats/mobile ổn định trên các case đã chạy. Rủi ro lớn nhất: **API state/mutation không auth** và **thiếu security headers**. Mutation/E2E ghi dữ liệu, portal submit, Sheet/AI/IMAP production **BLOCKED** vì state local đang chứa dữ liệu ops thật (~630+ lô, Live sync đang hoạt động; version tăng trong phiên). Không sửa production code; không submit portal; không in thật; không đụng Railway DB.

## Phạm vi

### Đã đọc sâu

- `package.json`, `.env.example` (tên biến), `App.tsx`, `useHashRoute.ts`, `constants/warehouses.ts`
- `shared/awbFormat.mjs`, `shared/shipmentWorkflowStatus.mjs`
- `scripts/dev.mjs` (TCS_AGENT_AUTO), `server/index.mjs` (API surface)
- `src/utils/tcsChromeExtension.ts` (postMessage trust)
- `server/stateStore.mjs` (AWB conflict gate); `useShipmentSync.ts` (offline queue / version)
- `customerDirectoryValidate.mjs` vs `customerDirectoryValidation.ts` (lệch rule mã KH)
- `scripts/qa-smoke-e2e.mjs` (tạo booking không cleanup)
- Inventory test: 83 Vitest + pytest suite
- Bổ sung dependency map từ khảo sát repo song song (routes API đầy đủ, localStorage, channels)

### Đã test (Playwright MCP, read-only)

- Routes `#/`, `#/customers`, `#/stats`, hash invalid, history back
- Live badge, KPI, warehouse tabs, status workflow theo family
- eCargo CTA chỉ SCSC direct
- Search AWB, flight-date facet, print preview (intercept `window.print`), DIM modal open/Escape
- Shortcut `/`, mobile 320/375 overflow, dark-class check
- `/api/health`, `/api/state` unauth, security headers probe
- Console: lặp 502 `/tcs-agent/health`

### Chưa test / BLOCKED

- Booking create/edit/delete, dual-browser sync, offline overwrite
- Google Sheet production fetch, AI Gemini, IMAP OTP, eSID/eCargo submit
- Visual diff đầy đủ mọi breakpoint; XSS payload trên note (không `dangerouslySetInnerHTML` trong `src/`)
- Pytest combobox chỉ xác nhận FAIL unit (không chạy portal thật)

### Chỉ kiểm kê

- Customers/Stats internals, CSD fill, Excel round-trip lớn, portal worker scripts — phụ thuộc case tương ứng ở đợt sau

## Environment

| Item | Value |
|------|-------|
| BASE_URL | `http://127.0.0.1:3001` |
| Vite `:5173` | không chạy (SPA từ `dist` qua Express) |
| Health | `ok`, `storage.postgres: true` |
| Docker | `tecsops-postgres` healthy `5434→5432` |
| State (đầu phiên) | ~version 1688, rows 632, customers 39 |
| State (giữa phiên) | version/rows tăng (Live concurrent) → **không mutation audit** |
| Warehouses (đếm) | TECS-TCS / TECS-SCSC / TCS / SCSC tách biệt |
| Evidence | `output/playwright-audit/20260812-140656/` |

**An toàn mutation:** Local ≠ Railway, nhưng **không phải DB test sạch**. Khuyến nghị: clone DB hoặc session date `E2E-*` riêng + cleanup trước khi mở ghi.

## Baseline

| Command | Expected | Actual |
|---------|----------|--------|
| typecheck | PASS | PASS |
| lint | 2 warnings any | khớp |
| lint:server | PASS | PASS |
| vitest | 83 / 529 PASS | khớp |
| build | PASS; AirCargo~1.27MB; excel~939KB | khớp |
| pytest | 1 FAIL combobox short-tail | khớp |

Chi tiết: `output/playwright-audit/20260812-140656/baseline.md`

## Coverage matrix A–P

| Area | Result | Notes |
|------|--------|-------|
| A Shell/routes | PASS (sample) | Live, customers, stats, invalid hash, history |
| B Ops booking/edit | BLOCKED | dữ liệu ops thật + Live concurrent |
| C AWB/status | PASS (UI workflow) + unit | SCSC/TECS-SCSC không RECEPTION; TCS có; auto-status unit OK |
| D Warehouse bounds | PASS | 4 tabs; eCargo chỉ SCSC; registry code OK |
| E Date/search/KPI | PASS (sample) | search AWB, facet 12AUG; date extremes chưa đủ |
| F DIM | PASS (open) / BLOCKED (save) | modal mở; save/calc E2E BLOCKED |
| G Customers | PASS (list) / BLOCKED (CRUD) | 39 khách, Live, form tabs |
| H Excel/Sheet | BLOCKED | không gọi Sheet/AI production |
| I Print/CSD | PASS (preview) | dialog mở; `window.print` = 0; CSD sâu BLOCKED |
| J TCS/eSID | PASS (offline UI) / BLOCKED (fill submit) | agent Offline; 502 health; no submit |
| K eCargo | PASS (CTA gate) / BLOCKED (register) | menu gate OK |
| L Stats | PASS (shell) | số liệu tay/fixture chưa đối chiếu đầy đủ |
| M Realtime | FAIL (code) / BLOCKED (E2E) | version pickNewer PASS; offline queue đầy silent drop; dual-context chưa chạy |
| N A11y/responsive | PASS (sample) | `/` focus; 320/375 no overflow; contrast formal chưa chạy |
| O Security | FAIL findings | no auth/headers/rate-limit; mutation error leak; postMessage OK; XSS React path OK |
| P Performance | INFO | bundle lớn; long-task 1000+ rows chưa đo |

## Findings

### P0 — Critical

#### SEC-01 — API không xác thực

- **Files:** `server/index.mjs:239-292`
- **Route:** `GET /api/state`, `POST /api/mutation`, `POST /api/mutations`
- **Precondition:** host/port reachable
- **Repro:** `fetch('/api/state')` từ browser không credential → 200 + full rows/customers
- **Expected:** authn/authz hoặc network trust boundary rõ (VPN/mTLS/token)
- **Actual:** 200, state đầy đủ (counts only trong evidence)
- **Impact:** lộ PII vận đơn/khách; ghi đè ops nếu attacker POST mutation
- **Evidence:** Playwright case `O-unauth-state`; `network.json`
- **Root cause:** app tin tưởng mạng nội bộ; không có middleware auth
- **Confidence:** cao

#### SEC-02 — Thiếu security headers

- **Files:** `server/index.mjs` (không thấy helmet/CSP middleware)
- **Repro:** `GET /api/health` → header CSP/XFO/XCTO/HSTS = null
- **Expected:** tối thiểu `X-Content-Type-Options`, `X-Frame-Options`/`frame-ancestors`, CSP phù hợp SPA
- **Actual:** không có
- **Impact:** clickjacking / MIME sniff / XSS defense-in-depth yếu hơn
- **Evidence:** case `O-security-headers`
- **Confidence:** cao

### P1 — High

#### EXT-01 — TCS agent health 502 gây console error

- **Symptom:** `Failed to load resource … /tcs-agent/health 502` lặp
- **Expected:** UI Offline im lặng hoặc 503 có kiểm soát, không spam error
- **Actual:** console errors trong lúc toolbar hiện Offline đúng
- **Impact:** nhiễu QA/monitoring; khó phát hiện lỗi thật
- **Evidence:** `console.log`
- **Confidence:** cao

#### PERF-01 — Chunk Ops quá lớn

- **Evidence:** build `AirCargoTracking` 1,272 kB; `vendor-excel` 938 kB; `OpsStatsPage` 439 kB
- **Impact:** TTI kém trên máy kho/mạng chậm
- **Confidence:** cao (đo build)

#### PY-01 — Combobox search short-tail sai

- **File:** `tcs-awb-automation/tests/test_combobox_match.py`
- **Expected:** query đầu = `PCS`
- **Actual:** prefix dài tên công ty
- **Impact:** eSID combobox portal có thể gõ sai / chậm match
- **Confidence:** cao (pytest); ảnh hưởng portal thật chưa reproduce (BLOCKED)

#### SYNC-01 — Offline queue đầy → mất mutation im lặng

- **Files:** `src/hooks/useShipmentSync.ts` (~308–310; max queue 500)
- **Expected:** chặn thao tác / cảnh báo / không áp local nếu không enqueue được
- **Actual:** vẫn `applyShipmentMutation` local nhưng không push queue → mất khi reconnect
- **Impact:** data loss ops khi offline kéo dài / storm
- **Evidence:** code review deep-read sync
- **Confidence:** cao (code); E2E reproduce BLOCKED

#### SEC-03 — Mutation error leakage + không rate-limit

- **Files:** `server/index.mjs:263-264`, `:289-290`; JSON body 12mb; batch max 500; không rate-limit
- **Expected:** message an toàn ở prod; rate-limit mutation/state
- **Actual:** luôn trả `e.message`; REST không CORS middleware / không rate-limit
- **Impact:** lộ chi tiết nội bộ; abuse DoS nếu host expose
- **Confidence:** cao

### P2 — Medium

#### LINT-01 — `no-explicit-any`

- `MobileDimKgModal.tsx:591`, `customerFullProfileExcel.ts:148`

#### AUTH-UX-01 — Không có auth app (xác nhận finding)

- Đúng thiết kế hiện tại nhưng là lỗ hổng triển khai nếu expose public internet (Railway) mà không có lớp bảo vệ ngoài.

#### VAL-01 — Customer code: server lỏng hơn client

- **Files:** `server/customerDirectoryValidate.mjs` vs `src/utils/customerDirectoryValidation.ts`
- **Expected:** cùng rule 2–5 A–Z (sync code) / agent code
- **Actual:** server chủ yếu non-empty + unique + clamp length (code ≤40)
- **Impact:** API `SET_CUSTOMERS` có thể nhận mã UI từ chối
- **Confidence:** cao

#### AWB-01 — Duplicate gate chỉ khi đủ 11 chữ số

- **Files:** `server/stateStore.mjs:139-155`; `shipmentMutations.ts:60-65`
- **Expected:** (tùy nghiệp vụ) chặn/cảnh báo trùng sớm hơn, hoặc document rõ
- **Actual:** AWB &lt; 11 số không vào unique gate
- **Impact:** nhiều lô “cùng dở AWB” trước khi đủ 11 số
- **Confidence:** cao

#### SMOKE-01 — `qa:smoke` để lại booking rỗng

- **File:** `scripts/qa-smoke-e2e.mjs:96-105`
- **Expected:** marker E2E + cleanup DELETE
- **Actual:** tạo `+ Booking` cố ý không xóa
- **Impact:** bẩn DB ops nếu chạy nhầm
- **Confidence:** cao

### P3 — Low

- Coverage gap mutation/E2E infrastructure
- Screenshot MCP không ghi trực tiếp vào `output/` (root allowlist) — copy thủ công
- Socket.IO in-memory: multi-instance Railway cần adapter (ops/deploy caveat)

## Security / privacy (tách riêng)

| ID | Topic | Status |
|----|-------|--------|
| SEC-01 | Unauth state/mutation | FAIL |
| SEC-02 | Security headers | FAIL |
| SEC-03a | Mutation error leak + no rate-limit | FAIL |
| SEC-03b | postMessage `event.source===window` + origin + channel | PASS (code) |
| SEC-04 | XSS note/customer React text paths | PASS (giả thuyết code) |
| SEC-05 | AWB duplicate server gate (đủ 11 số) | PASS; &lt;11 số không gate |
| SEC-06 | Secret trong report | PASS (không dump `.env.local`) |
| SEC-07 | Customer code server vs client | FAIL (lệch invariant) |

Redaction: báo cáo chỉ ghi counts/version; không copy địa chỉ/SĐT/AWB đầy đủ vào findings (AWB trong UI test chỉ dùng prefix đã có trên màn hình ops).

## Visual / a11y / performance summary

- Light mode; không dark class nửa vời
- Mobile 320/375: không horizontal overflow ngoài ý muốn
- Shortcut `/` focus search combobox
- Print preview dialog; không gọi máy in
- Bundle: ưu tiên code-split Ops/Excel/Stats

## E2E data / cleanup

- **Không tạo** record `E2E-*` trong phiên này
- Cleanup: N/A
- Concurrent Live: state version tăng ngoài kiểm soát audit → khẳng định BLOCKED mutation đúng đắn

## Xác nhận an toàn cuối phiên

- Không submit eSID / eCargo / OTP / CAPTCHA
- Không in thật (`window.print` stub = 0 lần)
- Không dùng Railway/production DB URL
- Không sửa code production
- Artifact: `output/playwright-audit/20260812-140656/`
