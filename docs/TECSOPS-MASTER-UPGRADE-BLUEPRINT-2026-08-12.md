# TECSOPS — Báo cáo định hướng & gói triển khai toàn phần

**Ngày:** 2026-08-12  
**Mục đích:** Một tài liệu duy nhất để chọn → code hàng loạt. Gộp audit Playwright, Railway, tốc độ, logic chuẩn, và lộ trình AI.  
**Trạng thái triển khai:** G0→G5 đã code trên nhánh `upgrade/g0-railway-ci`; chưa commit/push/deploy.

**Nguồn:**
- `docs/TECSOPS-PLAYWRIGHT-AUDIT-2026-08-12.md`
- `docs/TECSOPS-UPGRADE-PROPOSALS-2026-08-12.md`
- `output/playwright-audit/20260812-140656/`
- Định hướng: Railway + Playwright + load + logic + AI Ops

### Nhật ký thực thi

| Gói | Trạng thái | Kiểm chứng |
|-----|------------|------------|
| G0 | Hoàn tất | headers, redaction/rate-limit, agent health, pytest combobox, smoke cleanup, lint |
| G1 | Hoàn tất | L1 read-only 16/16; L2 marker/cleanup; AI mock không bill/không ghi DB |
| G2 | Hoàn tất | shared token → HttpOnly cookie; state/mutation/AI/Socket auth; offline queue fail-before-apply; validation parity/AWB contract |
| G3 | Hoàn tất | Ops chunk 1.272MB/586.5KB gzip → 249.5KB/73.7KB gzip; PDF/CSD/DIM/AI lazy |
| G4 | Hoàn tất | AI-1→AI-9; schema whitelist; PII-sanitized snapshot; auth/rate-limit; rule-before-Gemini; telemetry; `GEMINI_DISABLED` |
| G5 | Hoàn tất | axe 0 critical Ops/Customers/Stats/AI; focus trap + Escape return focus; mobile sticky buttons ≥44×44 |

Không mutation Postgres Ops hiện tại. L2 chạy trên container Postgres Docker cô lập, gắn marker `E2E-*`, xóa đúng ID trong `finally`; cleanup chỉ nhận marker hợp lệ.

---

## 1. Tầm nhìn sản phẩm (1 câu)

TECSOPS trên Railway phải **load nhanh, logic kho/AWB/workflow không sai, mọi thay đổi được Playwright khóa**, và **AI giảm gõ liệu** — không thay luật nghiệp vụ, không tự submit portal.

---

## 2. Bốn trụ bắt buộc (mọi PR phải thuộc ít nhất 1 trụ)

| Trụ | Mục tiêu đo được |
|-----|------------------|
| **R — Railway** | `deploy:ship` → `/api/health` `postgres:true`; không mất Postgres; API nhạy cảm có bảo vệ |
| **P — Playwright** | `tests/e2e` trong repo; L1 read-only CI; L2 mutation trên DB/`E2E-*` riêng; mock AI |
| **L — Logic** | Server enforce = UI; 4 kho / eCargo / workflow / AWB 11 số không regress |
| **S — Speed** | Chunk Ops/Excel giảm; TTI đo trên URL Railway |
| **A — AI** *(mở rộng)* | Gemini server-only; draft → Confirm → `/api/mutation`; không auto-submit eSID/eCargo |

---

## 3. Hiện trạng ngắn (baseline 2026-08-12)

| Hạng mục | Thực tế |
|----------|---------|
| Vitest | 83 files / 529 PASS |
| Lint | 2 warnings `any` |
| Build | PASS; AirCargoTracking ~1.27MB; vendor-excel ~939KB |
| Pytest | FAIL combobox short-tail (`PCS`) |
| Local app | `127.0.0.1:3001` + Postgres Docker; ~630+ lô ops thật |
| AI sẵn có | Gemini improvement-report + `ops_ai_events` + UI catalog + schema OCR shipper |
| Auth app | **Chưa có** trên `/api/state` + `/api/mutation(s)` |
| Security headers | **Chưa có** |

---

## 4. Findings phải xử lý (ưu tiên)

### P0 — Chặn trước khi đẩy mạnh public Railway / AI

| ID | Vấn đề | Hướng xử lý |
|----|--------|-------------|
| SEC-01 | `/api/state`, `/api/mutation(s)` không auth | Token/session; áp luôn `/api/ai/*` |
| SEC-02 | Thiếu CSP / XFO / XCTO / HSTS | Middleware headers |

### P1 — Ổn định & đúng dữ liệu

| ID | Vấn đề | Hướng xử lý |
|----|--------|-------------|
| SYNC-01 | Offline queue đầy → mất mutation im lặng | Chặn + toast; không apply-without-enqueue |
| SEC-03 | Mutation leak `e.message`; không rate-limit | Che lỗi prod + rate-limit |
| PERF-01 | Chunk Ops/Excel quá lớn | Code-split |
| PY-01 | Combobox eSID short-tail sai | Sửa Python + pytest xanh |
| EXT-01 | `/tcs-agent/health` 502 spam console | Treat offline êm |

### P2 — Parity & vệ sinh

| ID | Vấn đề | Hướng xử lý |
|----|--------|-------------|
| VAL-01 | Customer code server lỏng hơn client | Đồng bộ rule |
| AWB-01 | Unique chỉ khi đủ 11 số | Quyết định nghiệp vụ + test |
| SMOKE-01 | `qa:smoke` để booking rỗng | Marker E2E + DELETE |
| LINT-01 | 2× `any` | Type chặt |

---

## 5. Invariant nghiệp vụ — khóa bằng unit + Playwright (không để AI ghi đè)

1. Bốn mã kho tách: `TECS-TCS`, `TECS-SCSC`, `TCS`, `SCSC`.  
2. OpsTeam TECS = chỉ hub; báo cáo TCS/SCSC không gộp TECS-*.  
3. Family TCS = TECS-TCS+TCS; Family SCSC = TECS-SCSC+SCSC.  
4. eCargo VCT **chỉ** `SCSC` trực tiếp.  
5. Workflow TCS có `RECEPTION_COMPLETED`; SCSC **không**.  
6. AWB hợp lệ → 11 chữ số; duplicate gate server khi đủ 11 số.  
7. Auto-status: thiếu AWB/pcs → PENDING; đủ → RECEIVED; có DIM → VOLUME_DONE (trừ manual).  
8. Confirm AI → vẫn qua `formatAwb` / validate / `runMutation`.

---

## 6. Kiến trúc AI (chuẩn duy nhất)

```text
UI ──► POST /api/ai/<feature> ──► Railway Express
                                      ├ sanitize / redact
                                      ├ Gemini Flash (JSON schema)
                                      ├ ops_ai_events
                                      └ trả DRAFT + confidence
UI ◄── preview ── user Confirm ──► POST /api/mutation (deterministic)
```

**Cấm:** auto-submit portal, tự đổi status hải quan hàng loạt, Gemini key trên client, dump full state PII lên model.

**API AI hiện có:**  
`GET /api/ai/status` · `POST /api/ai/events` · `POST /api/ai/improvement-report`

**API AI sẽ thêm (gói AI):**  
`parse-booking-text` · `parse-profile-image` · `explain-sheet-rows` · `draft-esid-other-request` · `ops-ask`

---

## 7. Gói triển khai — chọn “code toàn bộ” theo thứ tự này

Mỗi gói = 1 PR (hoặc 1 nhánh) có AC + Playwright/Vitest.  
Khi bảo “code toàn bộ”, làm **G0 → G1 → G2 → G3 → G4 → G5** tuần tự (có thể G3∥G4 sau G2).

---

### GÓI G0 — Nền Railway + CI (bắt buộc trước AI công khai)

**Phạm vi**
- Security headers (SEC-02)
- Che lỗi mutation prod + rate-limit nhẹ (SEC-03)
- Sửa `/tcs-agent/health` noise (EXT-01)
- Sửa pytest combobox (PY-01)
- Sửa `qa:smoke` cleanup (SMOKE-01)
- Lint `any` (LINT-01)
- `npm run deploy:check` / health gate giữ nguyên kỷ luật Postgres

**AC**
- [x] Headers có trên `/` và `/api/health`
- [x] Prod mutation lỗi không lộ path/stack
- [x] `pytest` combobox PASS
- [x] `qa:smoke` trên DB test → delta rows = 0 sau cleanup
- [x] `lint` 0 warnings mục tiêu
- [x] Console không spam 502 khi agent offline

**Rollback:** revert PR nhỏ từng commit.

---

### GÓI G1 — Playwright trong repo + harness an toàn

**Phạm vi**
- `tests/e2e/` + script `npm run test:e2e`
- L1 read-only: routes, Live, workflow TCS/SCSC, eCargo chỉ SCSC, search mẫu
- Harness: DB clone **hoặc** `sessionDate`/`note` marker `E2E-<ts>` + cleanup script
- Cấu hình `BASE_URL` local và optional Railway URL (L1 only trên prod)

**AC**
- [x] `test:e2e` L1 xanh CI local
- [x] Document cách chạy L1 trên Railway URL (không mutation prod)
- [x] Script cleanup E2E chỉ xóa record marker

**Rollback:** tắt job e2e.

---

### GÓI G2 — Auth + logic integrity (P0/P1 data)

**Phạm vi**
- Auth token/session cho `POST /api/mutation(s)`, `GET /api/state` (hoặc đọc hạn chế), **mọi** `/api/ai/*` (SEC-01)
- Offline queue không silent-drop (SYNC-01)
- Customer code server = client (VAL-01)
- Contract test AWB duplicate + quyết định AWB &lt;11 (AWB-01)
- Socket.IO cùng credential nếu cần

**AC**
- [x] Request không token → 401
- [x] Ops hợp lệ vẫn Live sync
- [x] Queue full → UI báo, không mất “ảo”
- [x] `SET_CUSTOMERS` mã xấu bị server từ chối giống UI
- [x] Playwright L2 (harness): create/update/delete + reload

**Rollback:** feature flag “LAN open” tạm (không khuyến nghị giữ lâu trên Railway public).

---

### GÓI G3 — Tốc độ load web

**Phạm vi**
- Code-split `AirCargoTracking` / Excel / Sheet / print-CSD / portal modals khỏi critical path (PERF-01)
- Giữ lazy Customers/Stats + skeleton
- Đo trước/sau: kB chunk + thời gian load Ops trên Railway

**AC**
- [x] Ops entry chunk giảm rõ (mục tiêu hướng &lt; ~600KB gzip phần chính nếu khả thi)
- [x] L1 e2e không regress
- [x] Số liệu trước/sau ghi trong nhật ký tài liệu này

**Không đụng:** CSS `@page`, mm tem, layout CSD in — trừ PR riêng có phép đo.

---

### GÓI G4 — AI Ops (toàn bộ tầng A + nền B)

Làm **sau G0+G1**; **nên sau hoặc cùng G2 auth** nếu Railway public.

#### G4.1 — Hạ tầng AI
- Tái dụng `geminiClient.mjs`, timeout/quota đã có
- JSON schema cứng từng endpoint
- Redact PII; rate-limit AI
- Playwright **mock** Gemini (không bill trên CI)
- `trackAiEvent` cho mọi feature mới

#### G4.2 — Tính năng AI (theo thứ tự code)

| # | Feature | UI | API | Confirm |
|---|---------|----|-----|---------|
| AI-1 | Dán tin nhắn → draft booking | Ops: «Dán tin → Booking» | `POST /api/ai/parse-booking-text` | Tạo lô qua mutation + AWB gate |
| AI-2 | Ảnh/PDF → hồ sơ KH | Customers + eSID quick fill | `POST /api/ai/parse-profile-image` | Lưu khách / apply shipper (schema OCR sẵn) |
| AI-3 | Giải thích dòng Sheet | GoogleSheetImportModal | `POST /api/ai/explain-sheet-rows` | Không auto-apply; chỉ gợi ý |
| AI-4 | Draft `other_request` eSID | Trước Fill Ext | `POST /api/ai/draft-esid-other-request` | User sửa → Fill (không submit) |
| AI-5 | Ops Ask phiên ngày | Panel / modal Ops | `POST /api/ai/ops-ask` | Chỉ đọc snapshot sanitize |
| AI-6 | Giữ & nâng Đề xuất AI hiện có | Công cụ → Đề xuất AI | improvement-report | Copy Cursor prompt; optional lưu backlog |

#### G4.3 — AI tầng B (cùng gói nếu “code toàn bộ”, sau AI-1…5)

| # | Feature | Ghi chú |
|---|---------|---------|
| AI-7 | Checklist bất thường trước Fill/Register | **Rule trước**, Gemini diễn giải |
| AI-8 | Parse paste DIM bẩn → dimLines | Divisor/limits vẫn util hiện có |
| AI-9 | Tóm tắt cuối ngày trên Stats | Aggregate + bullets |

**AC gói G4**
- [x] Mọi AI route yêu cầu auth (nếu G2 đã bật)
- [x] Không endpoint nào gọi submit portal
- [x] E2E mock: mở UI → nhận draft → Confirm gọi mutation đúng 1 lần
- [x] Gemini tắt (`GEMINI_NOT_CONFIGURED`) → UI báo rõ, app Ops vẫn dùng được
- [x] Telemetry events ghi nhận start/ok/fail

**Cấm trong G4:** chatbot thay Ops board; fine-tune model; auto OTP/CAPTCHA trên web.

---

### GÓI G5 — UI/UX cứng hóa (sau perf + AI nhập liệu)

**Phạm vi**
- Axe/a11y modal DIM/print/AI; focus trap; Escape trả focus
- Touch target mobile sticky ≥44px
- Lock regression UI gate kho/eCargo trong e2e (đã ở G1 — mở rộng)
- Chỉ polish visual theo spec redesign **nếu** không phá invariant & không đụng print mm

**AC**
- [x] 0 axe critical trên Ops/Customers/Stats shell
- [x] L1+L2 xanh

---

## 8. Lịch thực thi đề xuất khi “code toàn bộ”

```text
Tuần 1     G0 + khởi động G1 (e2e L1)
Tuần 2     G1 xong + G2 (auth + offline + parity)
Tuần 3     G3 (code-split) + đo Railway
Tuần 4–5   G4 (AI-1…6 rồi AI-7…9)
Tuần 6     G5 a11y/mobile + ổn định + deploy:ship
```

Song song được: G3 với cuối G2; AI-3/AI-5 với AI-1/2 nếu người khác làm — nhưng **auth AI trước khi public**.

---

## 9. Definition of Done — “đã nâng cấp xong theo báo cáo này”

- [x] Railway code gate: health postgres; headers; auth mutation/state/ai *(chưa deploy trong phiên này)*  
- [x] Playwright: L1; L2 harness Docker cô lập; mock AI  
- [x] Logic: invariant kho/workflow/AWB/customer/offline có test  
- [x] Speed: chunk Ops giảm có số liệu trước/sau local production build  
- [x] AI: AI-1→AI-9; preview→Confirm; improvement-report giữ nguyên  
- [x] Không silent offline drop; smoke/mutation cleanup đúng marker  
- [x] Không regress eCargo/TECS-SCSC; combobox pytest xanh  

---

## 10. Checklist trước mỗi lần `deploy:ship`

1. Backup Postgres nếu đổi schema/auth lớn (`backup:postgres-state`)  
2. `npm run typecheck && lint && test && build`  
3. `npm run test:e2e` (L1)  
4. `deploy:check` / `deploy:ship`  
5. Poll `/api/health`  
6. Smoke tay: Login/token (nếu có), Ops Live, 1 AI draft (staging), không submit portal  

---

## 11. Cách bạn chọn để agent “code toàn bộ”

Trả lời một dòng theo mẫu:

```text
CODE TOÀN BỘ theo docs/TECSOPS-MASTER-UPGRADE-BLUEPRINT-2026-08-12.md
Thứ tự: G0 → G1 → G2 → G3 → G4 → G5
Bắt đầu: G0
Railway URL: <optional>
GEMINI: dùng key Railway hiện có
Harness: E2E marker trên local Docker (không đụng prod rows)
```

Hoặc chọn subset:

```text
CODE G0+G1+G3 trước; G4 chỉ AI-1 và AI-2; tạm hoãn G2 auth nếu chỉ LAN
```

---

## 12. File liên quan nhanh

| File | Vai trò |
|------|---------|
| `server/index.mjs` | Auth, headers, rate-limit, AI routes |
| `server/ai/*` | Gemini, events, report, endpoint mới |
| `src/hooks/useShipmentSync.ts` | Offline queue |
| `server/stateStore.mjs` / `customerDirectoryValidate.mjs` | Logic parity |
| `src/constants/warehouses.ts` | Invariant kho |
| `shared/shipmentWorkflowStatus.mjs` / `awbFormat.mjs` | Workflow + AWB |
| `scripts/qa-smoke-e2e.mjs` | Cleanup smoke |
| `tcs-awb-automation/.../combobox` | PY-01 |
| `vite.config.ts` / lazy imports | Perf split |
| `tests/e2e/**` *(tạo mới)* | Playwright |

---

## 13. Tóm tắt một trang cho quyết định

| Bạn muốn | Làm gói |
|----------|---------|
| An toàn Railway trước | G0 → G2 |
| Test tự động trước | G1 |
| Web nhanh | G3 |
| AI vào app mạnh | G4 (sau G0+G1, ideally G2) |
| UI/a11y | G5 |
| **Code hết** | G0→G5 đúng §8 |

**Nguyên tắc vàng:** AI chỉ tạo *draft*; *sự thật* là Postgres + mutation đã validate; Playwright là hàng rào; Railway Postgres không được reset/seed bừa.
