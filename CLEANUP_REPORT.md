# TECSOPS — Safe Dead Code & Unused Feature Cleanup

**Protocol:** Phase 1–12 (ANALYZE + CLASSIFY trước khi xóa; KEEP > DELETE khi không chắc).  
**Base:** `main` @ `249af1a` (B1 #56+).  
**Ưu tiên:** B2 docs/mcp remnants sau Plan A, rồi leftover unused feature SAFE.

Hard no-touch: DB schema/data/migrations, `.env` / secrets, auth, live API Ops/Ext, production config, deploy.

KEEP bắt buộc: `chrome-extension-tcs` + `chrome-extension-scsc`, Docker OCR (#54), eCargo / print / CSD (logic thật), mã kho `TECS-TCS` / `TECS-SCSC`, CTA «Đăng Nhập TCS».

---

## Phase 1–2 — ANALYZE + CLASSIFY

### SAFE TO DELETE

| Path | Loại | Lý do SAFE |
|---|---|---|
| `docs/TECSOPS-PLAYWRIGHT-AUDIT-2026-08-12.md` | dead docs | Audit 12/08 — `/tcs-agent`, Gemini/Sheet, pytest agent. Pattern `TECSOPS-*-AUDIT*`. |
| `docs/TECSOPS-REDESIGN-AUDIT.md` | dead docs | Audit 26/07 — `tcs-awb-automation`, Sheet, baseline PNG đã xóa A2. |
| `scripts/generate-ui-redesign-checklist-pdf.mjs` | unused tooling | Không npm/CI script. PDF đã xóa A2. |
| `mcp/tecsops-deploy/*` | unused tooling | 0 reference repo/CI/`package.json`. Deploy = `npm run deploy:ship`. |
| `src/utils/portalExecutorPolicy.ts` + test | leftover B1 | Không import production; stub luôn Ext-only. |
| `src/utils/csdFdForm.ts` | unused barrel | `@deprecated` re-export `csdForms`. CSD thật ở `csdForms.ts` + PDF `public/templates/csd/`. |
| `src/components/InlineCneeCell.tsx` | unused feature | 0 import. Lưới live dùng `CneeDetailPopover` + `InlineCustomerInfoCell`. |
| `src/components/InlineConsigneeSelect.tsx` | unused feature | Chỉ được `InlineCneeCell` import — orphan sau khi cell chết. |

### REVIEW — không xóa

| Path | Vì sao REVIEW |
|---|---|
| `docs/TECSOPS-UPGRADE-PROPOSALS-2026-08-12.md` | Companion 12/08; không khớp `*-AUDIT*`. |
| `docs/TECSOPS-MASTER-UPGRADE-BLUEPRINT-2026-08-12.md` | Nhật ký G0–G5. |
| `docs/CURSOR_PLAYWRIGHT_MCP_COMPREHENSIVE_AUDIT_PROMPT.md` | Prompt cũ; QA live = `playwright-mcp-ops-qa.md`. |
| `docs/TECSOPS_CURSOR_REDESIGN_UPGRADE_SPEC.md` | Spec redesign. |
| `docs/tecsops-ui-redesign-checklist.html` | A2 giữ HTML. |
| `docs/ext_tcs-analysis.md` | Research protocol Ext. |
| `docs/playwright-mcp-ops-qa.md` | `TOOLS.md` trỏ tới. |
| `docs/air-cargo-label-100x80-100x50.html` | Khớp `PrintShippingLabel.tsx`. |
| `src/ui/Card.tsx`, `Badge`, `Input`/`TextArea`/`Select`, `KpiStat`, `ErrorState` | Kit chưa có consumer ngoài barrel — không leftover agent. |
| `public/downloads/*TCS*.html` | Trang tĩnh public; cần ops xác nhận. |
| `src/utils/tcsPortalAgentApi.ts` | **KEEP** types + `pickEsidScanReadyItems`. |
| `useTcsPortalActions` union `"playwright"` | Live hook — đổi type = rewrite. |
| Unused npm deps | Không có dep SAFE: `onnxruntime-web` (OCR Ext), `imapflow`/`mailparser` (eCargo), `recharts` (Stats), `tsx` (`sample:day-report`). |

### KEEP

Ext TCS/SCSC + OCR, Docker multi-stage, eCargo/IMAP/VCT, print/CSD (`csdForms.ts` + templates), mã kho, `tcsLoginCtaLabel`, auth, Postgres, `.env.example`, live docs railway/ops-ext/otp.

Không có thư mục rỗng trackable. `samples/*.xlsx` dùng bởi `sample:day-report`. `start-fullstack.mjs` = Docker/Railway CMD.

---

## Phase 3 — Indirect usage (trước mỗi path SAFE)

Kiểm tra: static import, `import()`, route registration, CI (`.github/workflows/ci.yml` → `npm run ci`), `package.json` scripts, tests, string path, webhook.

| Path | import() | routes | CI/scripts | tests | string/webhook |
|---|---|---|---|---|---|
| AUDIT md ×2 | không | không | không | không | chỉ docs REVIEW + `memory/` |
| PDF checklist script | không | không | không | không | không |
| `mcp/tecsops-deploy` | không | không | không | không | 0 grep ngoài chính nó |
| `portalExecutorPolicy` | không | không | không | chỉ self-test | `docs/ext_tcs-analysis` (REVIEW) |
| `csdFdForm.ts` | không | không | không | test import `csdForms` | `CSD_FD_TEMPLATE_URL` chỉ tự file |
| `InlineCneeCell` / `InlineConsigneeSelect` | không | không | không | không | 0 |

---

## Phase 4–7 — Removed (chỉ SAFE)

Đã `git rm` các path SAFE ở bảng trên. **Không** rewrite architecture. **Không** sửa business logic ngoài cleanup.

CSD: xóa barrel deprecated, giữ `csdForms.ts` + `CSD-FD.pdf` / `CSD-TH.pdf`.  
CNEE: xóa wrapper chết, giữ `CneeDetailPopover` + `InlineCustomerInfoCell` trên lưới.

---

## Preserved

Mọi mục REVIEW + KEEP. Không xóa khi không chắc.

---

## Phase 8–9 — Validation

- [x] `npm run lint` — PASS
- [x] `npm run lint:server` — PASS
- [x] `npm run typecheck` — PASS
- [ ] `npm test` — vòng 2 (sau khi gỡ 3 file unused feature)
- [x] `npm run deploy:check` — PASS vòng 1
- [x] `npm run build` — PASS vòng 1 (`tsc -b && vite build`; ZIP Ext TCS 1.5.3 / SCSC 1.0.3)

Không revert; không sửa logic nghiệp vụ ngoài cleanup.

---

## Phase 10

REMOVE only — không đổi contract API, không đổi schema, không đổi CTA, không đổi mã kho.

---

## Phase 11 — Metrics

| Đợt | Files | LOC (`wc -l`) | Bytes |
|---|---:|---:|---:|
| B2 docs/mcp/policy | 8 | 2 808 | 121 149 |
| Unused feature (CSD barrel + CNEE orphan) | 3 | 162 | 4 915 |
| **Tổng** | **11** | **2 970** | **126 064** (~123 KiB) |

Chi tiết đợt 2:

| File | Lines | Bytes |
|---|---:|---:|
| `src/utils/csdFdForm.ts` | 22 | 487 |
| `src/components/InlineCneeCell.tsx` | 86 | 2 659 |
| `src/components/InlineConsigneeSelect.tsx` | 54 | 1 769 |

---

## Phase 12 — Result

- App vẫn build; Ext/OCR/eCargo/print/CSD/auth/DB nguyên.
- CTA vẫn «Đăng Nhập TCS» (`tcsLoginCtaLabel` + test).
- GitHub CI vòng 1 (`54af291`) **success**.
- PR: https://github.com/NAMNAM1989/TECSOPS/pull/57

### Follow-up (không làm)

- Railway: gỡ `TCS_AGENT_*` / `GEMINI_*` + volume `browser_profile`.
- Nếu Cursor Desktop trỏ `mcp/tecsops-deploy` — xóa entry.
- Quyết định sau: 4 docs 12/08 + spec; UI kit chưa dùng; HTML downloads TCS.
