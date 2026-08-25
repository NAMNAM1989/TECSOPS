# TECSOPS — Safe Dead Code & Unused Feature Cleanup

**Cập nhật 2026-08-25:** Tải Ext / Đăng Nhập TCS / eCargo **đã gỡ** (PR mới, không reopen #72).  
Hard no-touch còn lại: 4 mã kho, DayPulse, DIM, print/CSD, ảnh báo cáo #71, Sheet, ESID local, auth, DB / `.env` / migrations.  
Phần KEEP Ext/OCR/eCargo bên dưới là **snapshot lịch sử #57/#61** — không đưa các cây đó trở lại.

**Protocol:** Phase 1–12 (ANALYZE + CLASSIFY trước khi xóa; KEEP > DELETE khi không chắc).  
**Đợt này:** REVIEW follow-up sau SAFE cleanup **#57** (`main` @ `f82b1a9`).  
**Base lịch sử:** `f82b1a9` (báo cáo dưới đây là snapshot — đừng đưa Ext/eCargo trở lại từ mục KEEP cũ).

---

## Bug_fix review (PR #61) — 4 tiêu chí

KEEP > DELETE. Xóa **chỉ** khi đủ điều kiện dưới; không đủ thì giữ.

### 1) Docs — xóa ONLY nếu 0 link từ TOOLS.md / skills / AGENTS.md / live docs

| Path | TOOLS.md | skills | AGENTS.md | live docs (`docs/*` còn lại) | Quyết định |
|---|---|---|---|---|---|
| `TECSOPS-UPGRADE-PROPOSALS-2026-08-12.md` | 0 | 0 | 0 | 0 (`memory/` không tính) | **SAFE — đã xóa** |
| `TECSOPS-MASTER-UPGRADE-BLUEPRINT-2026-08-12.md` | 0 | 0 | 0 | 0 | **SAFE — đã xóa** |
| `CURSOR_PLAYWRIGHT_MCP_COMPREHENSIVE_AUDIT_PROMPT.md` | 0 (TOOLS trỏ `playwright-mcp-ops-qa.md`) | 0 | 0 | 0 | **SAFE — đã xóa** |
| `TECSOPS_CURSOR_REDESIGN_UPGRADE_SPEC.md` | 0 | 0 | 0 | self-ref only | **KEEP** — SoT 50 hạng mục / kit §4.4; `ui-review.md` không thay hết. Link-gate đạt nhưng KEEP > DELETE. |
| `tecsops-ui-redesign-checklist.html` | 0 | 0 | 0 | 0 | **KEEP** — companion spec; A2 cố ý giữ HTML. |
| `ext_tcs-analysis.md` | 0 | 0 | 0 | 0 (SoT live = `ops-ext-protocol.md`) | **KEEP** — research cookie/OCR/mutex; chưa chứng minh overlap 100%. |

Skills đã quét: `.agents/skills/*`, `.cursor/skills/*` (chỉ `tecsops-railway-state-persistence` trỏ `docs/railway-safe-deploy.md`).

### 2) UI kit — xóa ONLY nếu barrel **không còn** export cho live feature **và** 0 consumer

Barrel `src/ui/index.ts` **vẫn export**: `Card`, `Badge`, `Input`/`TextArea`/`Select`, `KpiStat`, `ErrorState`.

Live import từ barrel (`AirCargoTracking`, `CustomersPage`, `OpsStatsPage`, `AppAuthGate`, …) dùng `AppShell` / `EmptyState` / `Button` / Toast — **không** import Card/Badge/Input/KpiStat/ErrorState.

**Không xóa.** Tiêu chí 2 chặn: barrel còn export. Không gỡ export chỉ để được xóa.

### 3) `public/downloads` TCS* — xóa ONLY nếu 0 link Ops/print

| Nguồn | Kết quả |
|---|---|
| `src/` href / `window.open` / string `tai-so-do` / `ESID-Automation` | 0 |
| `PrintShippingLabel.tsx` + `print-label.css` | chỉ `docs/air-cargo-label-100x80-100x50.html` (KEEP, print) |
| `server/index.mjs` `/downloads/` | tem print; **không** còn ZIP Ext |
| Tests | ZIP Ext / catalog đã gỡ cùng feature |

TCS HTML + PDF companion: **SAFE — đã xóa**.  
`public/downloads/air-cargo-label-*.html`: **KEEP** (print / no-touch).

### 4) KEEP always (không đụng)

**Cũ (trước khi gỡ 2026-08-25):** Ext/OCR/eCargo từng no-touch. Hiện đã gỡ.  
Còn no-touch: print/CSD, auth, DB / `.env` / migrations, 4 mã kho, DIM, ảnh báo cáo.

---

## Phase 1–2 — Re-classify (sau #57)

### SAFE TO DELETE (mới xác nhận)

| Path | Loại | Bằng chứng SAFE |
|---|---|---|
| `docs/TECSOPS-UPGRADE-PROPOSALS-2026-08-12.md` | dead docs | Companion audit 12/08. Nội dung `/tcs-agent`, `tcs-awb-automation`, pytest, Gemini — đã teardown A3. AUDIT cặp đã xóa ở #57 → orphan. 0 ref ngoài `memory/` + chính nó. |
| `docs/TECSOPS-MASTER-UPGRADE-BLUEPRINT-2026-08-12.md` | dead docs | Nhật ký G0–G5 (đã xong). Trỏ AUDIT đã xóa + AI/Gemini/`/tcs-agent`. Snapshot lịch sử, không phải SoT live (`docs/railway-*.md`, `ops-ext-protocol.md`). |
| `docs/CURSOR_PLAYWRIGHT_MCP_COMPREHENSIVE_AUDIT_PROMPT.md` | dead docs | Prompt one-shot 12/08. QA live = `docs/playwright-mcp-ops-qa.md` (`TOOLS.md`). Prompt cũ bảo `TCS_AGENT_AUTO=0` / Python agent — lệch Ext-only. |
| `public/downloads/tai-so-do-tcs.html` | leftover static | Landing «Sơ đồ tự động hóa TECS-TCS». 0 href từ app / CI / scripts / tests. Chỉ trỏ one-pager Agent/Playwright. |
| `public/downloads/TECSOPS-TCS-ESID-Automation-1page.html` | leftover static | One-pager mô tả `/tcs-agent`, Playwright PDF, Agent fallback, `TCS_HEADLESS`, Sheet — kiến trúc đã gỡ A3. Lệch protocol Ext-only. |
| `public/downloads/TECSOPS-TCS-ESID-Automation-1page.pdf` | leftover static | PDF cùng nội dung; HTML chỉ tồn tại để tải file này. 0 link từ app. |

### REVIEW — giữ (không đủ bằng chứng SAFE)

| Path | Vì sao vẫn REVIEW |
|---|---|
| `docs/TECSOPS_CURSOR_REDESIGN_UPGRADE_SPEC.md` | Spec 50 hạng mục / kit bắt buộc (`Input`, `Badge`, `ErrorState`…). `docs/ui-review.md` là nhật ký Round 3, không thay toàn bộ spec. |
| `docs/tecsops-ui-redesign-checklist.html` | Checklist in được; A2 cố ý giữ HTML sau khi xóa PDF. Companion spec. |
| `docs/ext_tcs-analysis.md` | Research Ext (#47). Header đã ghi A2, nhưng còn chi tiết cookie/OCR/mutex. SoT live = `docs/ops-ext-protocol.md` — chưa chứng minh overlap 100%. |
| `src/ui/Card.tsx`, `Badge.tsx`, `Input.tsx` (`Input`/`TextArea`/`Select`) | Bug_fix #2: barrel **vẫn export**. 0 consumer live, nhưng không xóa khi barrel còn export. Spec §4.4 vẫn liệt kê. |
| `KpiStat` (`AppShell.tsx`), `ErrorState` (`EmptyState.tsx`) | Cùng lý do. `AppShell` + `EmptyState` **đang dùng** — chỉ hàm phụ chưa có caller. |
| `public/downloads/air-cargo-label-100x80-100x50.html` | Tem in. Khác `docs/air-cargo-label-*.html`. `PrintShippingLabel.tsx` khớp bản `docs/`. Public copy có thể là URL in kho — **print = no-touch**. |
| `docs/air-cargo-label-100x80-100x50.html` | SoT comment trong `PrintShippingLabel.tsx`. KEEP. |
| `docs/playwright-mcp-ops-qa.md` | `TOOLS.md` trỏ tới. KEEP. |

### KEEP (không đụng)

**Cũ:** Ext/OCR/eCargo/`tcsLoginCtaLabel` từng KEEP. **2026-08-25 đã gỡ** cùng `tcsPortalAgentApi`, IMAP, ONNX.  
Còn KEEP: print/CSD, 4 mã kho, DIM, ảnh báo cáo, ESID local, auth, Postgres, `.env.example`.  
npm deps còn: `recharts` (Stats), `tsx` (`sample:day-report`).

---

## Phase 3 — Indirect usage (trước mỗi path SAFE)

Kiểm tra: static import, `import()`, route, CI (`.github/workflows/ci.yml` → `npm run ci`), `package.json` scripts, tests, string path, webhook, href từ app.

| Path | import() | routes / app href | CI / scripts | tests | string / webhook |
|---|---|---|---|---|---|
| Proposals 12/08 | không | không | không | không | chỉ `memory/` + blueprint (cũng xóa) |
| Blueprint 12/08 | không | không | không | không | chỉ `memory/` + self-ref |
| Audit prompt 12/08 | không | không | không | không | `TOOLS.md` trỏ `playwright-mcp-ops-qa.md`, không file này |
| `tai-so-do-tcs.html` | không | không | không | không | chỉ self + one-pager |
| `*ESID-Automation-1page.html` | không | không | không | không | chỉ landing + PDF cùng thư mục |
| `*ESID-Automation-1page.pdf` | không | không (ngoài HTML xóa) | không | không | 0 |

`server/index.mjs` chỉ serve `/downloads/*.zip` Ext. Vite copy `public/` → dist; xóa HTML/PDF = hết URL tĩnh leftover, không đổi catalog Ext.

---

## Phase 4–7 — Removed (chỉ SAFE mới)

Đã `git rm` 6 path bảng SAFE. **Không** rewrite architecture. **Không** sửa business logic.

Giữ `public/downloads/air-cargo-label-100x80-100x50.html` (print).  
Giữ toàn bộ `src/ui/*` đang dùng (`Button`, `AppShell`, `EmptyState`, Toast, …).

---

## Preserved

Mọi mục REVIEW + KEEP ở trên. Không xóa khi không chắc.

---

## Phase 8–9 — Validation

- [x] `npm run lint` — PASS
- [x] `npm run lint:server` — PASS
- [x] `npm run typecheck` — PASS
- [x] `npm test` — PASS **81 files / 489 tests** (`csdForms` 12/12, `tcsLoginCtaLabel` 2/2)
- [x] `npm run deploy:check` — PASS
- [x] GitHub CI (`ff1a5d6`) — **success** (2 checks)

Không revert; không sửa logic nghiệp vụ ngoài cleanup.

---

## Phase 10

REMOVE only — không đổi contract API, không đổi schema, không đổi CTA, không đổi mã kho.

---

## Phase 11 — Metrics (delta đợt này vs #57)

| File | Lines | Bytes |
|---|---:|---:|
| `docs/TECSOPS-UPGRADE-PROPOSALS-2026-08-12.md` | 168 | 6 961 |
| `docs/TECSOPS-MASTER-UPGRADE-BLUEPRINT-2026-08-12.md` | 349 | 14 438 |
| `docs/CURSOR_PLAYWRIGHT_MCP_COMPREHENSIVE_AUDIT_PROMPT.md` | 267 | 21 028 |
| `public/downloads/tai-so-do-tcs.html` | 43 | 1 693 |
| `public/downloads/TECSOPS-TCS-ESID-Automation-1page.html` | 235 | 10 331 |
| `public/downloads/TECSOPS-TCS-ESID-Automation-1page.pdf` | — (binary) | 131 234 |
| **Tổng đợt này** | **1 062 text** | **185 685** (~181 KiB) |

#57 đã gỡ 11 files / 2 970 LOC / ~123 KiB. Cộng dồn (nếu merge): **17 files** / **4 032 text LOC** + 1 PDF.

---

## Phase 12 — Result

- Snapshot #61: app / print / CSD / auth / DB nguyên. Ext/OCR/eCargo + CTA portal **đã gỡ sau này**.
- Public downloads còn: tem `air-cargo-label-*.html` (không ZIP Ext).
- GitHub CI `ff1a5d6` **success**.
- PR: https://github.com/NAMNAM1989/TECSOPS/pull/61

### Follow-up (không làm)

- Railway: gỡ `TCS_AGENT_*` / `GEMINI_*` + volume `browser_profile`.
- Quyết định sau: spec redesign + checklist HTML; UI kit chưa dùng; `ext_tcs-analysis` vs `ops-ext-protocol`; public tem HTML.

---

## Appendix — #57 baseline (đã merge)

Base lúc đó: `main` @ `249af1a`. Removed: `TECSOPS-*-AUDIT*`, PDF checklist script, `mcp/tecsops-deploy/`, `portalExecutorPolicy`, `csdFdForm.ts`, `InlineCneeCell` + `InlineConsigneeSelect`.

Validation #57: lint / typecheck / 81 files · 489 tests / deploy:check / build PASS.  
PR: https://github.com/NAMNAM1989/TECSOPS/pull/57
