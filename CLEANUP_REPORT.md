# TECSOPS B2 — Safe Dead Code Cleanup

**Base:** `main` @ `249af1a` (B1 #56 trở lên)  
**Phạm vi:** Phase 1–12 protocol — SCAN + CLASSIFY trước, chỉ xóa **SAFE TO DELETE**.  
**Không đụng:** DB schema/data/migrations, `.env` / secrets, auth, live API Ops/Ext, architecture rewrite.

Giữ nguyên theo brief: `chrome-extension-tcs` + `chrome-extension-scsc`, Docker OCR multi-stage (#54), eCargo / print / CSD, mã kho `TECS-TCS` / `TECS-SCSC`, UI Ext-first (chip + CTA luôn «Đăng Nhập TCS», không «ĐN»).

---

## Phase 1–2 — Inventory

### SAFE TO DELETE (đã xóa trong PR này)

| Path | Lý do SAFE | Verify trước xóa |
|---|---|---|
| `docs/TECSOPS-PLAYWRIGHT-AUDIT-2026-08-12.md` | Audit snapshot 12/08 — mô tả `/tcs-agent/health`, `TCS_AGENT_AUTO`, Gemini/Sheet, pytest agent. B2 hint: `TECSOPS-*-AUDIT*`. | Không import runtime; không có trong `package.json` / CI / `deploy:check` / tests. Chỉ được nhắc bởi docs REVIEW + `memory/`. |
| `docs/TECSOPS-REDESIGN-AUDIT.md` | Audit 26/07 — sidecar `tcs-awb-automation`, `GoogleSheetImportModal`, baseline PNG đã xóa ở A2 #49. B2 hint: `TECSOPS-*-AUDIT*`. | Không import runtime; không CI/scripts. Chỉ spec redesign + memory. |
| `scripts/generate-ui-redesign-checklist-pdf.mjs` | Script Playwright in PDF checklist Jul 2026. Không có npm script. PDF đã xóa ở A2. HTML checklist giữ. | Không `package.json` script; không CI; không test; không import. |
| `mcp/tecsops-deploy/` (`server.mjs`, `package.json`, `package-lock.json`) | MCP stdio bọc `npm run deploy:ship` + `GET /api/health`. **0** reference trong repo (không `AGENTS.md`, `TOOLS.md`, `.cursor/`, CI, root `package.json`, tests). Deploy thật vẫn qua `npm run deploy:ship` + skill Railway. | Grep toàn repo chỉ ra chính 3 file này. |
| `src/utils/portalExecutorPolicy.ts` | Leftover B1: policy `agent-only` / `remote-only` đã stub (luôn `["extension"]`, `portalPolicyUsesAgent` luôn `false`). Không component/hook nào import sau #56. | Grep production import = 0; chỉ test tự tham chiếu + `docs/ext_tcs-analysis.md` (REVIEW). |
| `src/utils/portalExecutorPolicy.test.ts` | Test cho module chết ở trên. | Chỉ import module vừa xóa. |

### REVIEW — Preserved / Needs review (không xóa)

| Path | Vì sao giữ |
|---|---|
| `docs/TECSOPS-UPGRADE-PROPOSALS-2026-08-12.md` | Companion audit 12/08. Nhiều mục đã ship (auth G2, v.v.) nhưng không khớp pattern `TECSOPS-*-AUDIT*`. |
| `docs/TECSOPS-MASTER-UPGRADE-BLUEPRINT-2026-08-12.md` | Nhật ký G0–G5; link sang AUDIT đã xóa. Lịch sử triển khai, không tooling chết. |
| `docs/CURSOR_PLAYWRIGHT_MCP_COMPREHENSIVE_AUDIT_PROMPT.md` | Prompt cũ (nhắc `TCS_AGENT_AUTO=0`). Không phải AUDIT*. QA Playwright hiện tại dùng `docs/playwright-mcp-ops-qa.md`. |
| `docs/TECSOPS_CURSOR_REDESIGN_UPGRADE_SPEC.md` | Spec giao việc redesign; tạo ra AUDIT đã xóa. Không runtime. |
| `docs/tecsops-ui-redesign-checklist.html` | A2 #49 giữ HTML; chỉ PDF + script generator bị coi unused. |
| `docs/ext_tcs-analysis.md` | Research Ext #42/#52; nhắc `portalExecutorPolicy` (stale). Vẫn hữu ích lịch sử protocol. |
| `docs/playwright-mcp-ops-qa.md` | Checklist QA live — `TOOLS.md` trỏ tới. |
| `docs/air-cargo-label-100x80-100x50.html` | Khớp comment `PrintShippingLabel.tsx` (mẫu tem). |
| `src/ui/Card.tsx` | Design-system primitive chưa có consumer (chỉ barrel `src/ui/index.ts`). Không leftover agent/portal. |
| `public/downloads/tai-so-do-tcs.html` + `TECSOPS-TCS-ESID-Automation-1page.html` | Trang tĩnh public; PDF sibling có thể đã mất. Cần ops xác nhận trước khi gỡ. |
| `src/utils/tcsPortalAgentApi.ts` | **KEEP** — types + `pickEsidScanReadyItems` dùng bởi Ext/hook. Tên file “Agent” là lịch sử, không phải HTTP agent. |
| `src/hooks/useTcsPortalActions.ts` type `executor: "extension" \| "playwright"` | Live hook. Đổi union = rewrite nhỏ — ngoài SAFE. |
| `mcp/` sau khi gỡ `tecsops-deploy` | Thư mục trống (git không track empty dir). Không thêm MCP mới. |

### KEEP (không đụng)

- `chrome-extension-tcs/`, `chrome-extension-scsc/` (OCR ONNX, handshake, ZIP catalog)
- `Dockerfile` multi-stage OCR (#54), `scripts/fetch-ext-captcha-ocr.mjs`
- eCargo / IMAP OTP / VCT, print / CSD / tem nhiệt
- Mã kho dữ liệu `TECS-TCS` / `TECS-SCSC`
- `src/utils/tcsLoginCtaLabel.ts` — CTA «Đăng Nhập TCS»
- Auth (`AppAuthGate`, `TECSOPS_APP_TOKEN`), Postgres / `app_state`, migrations
- `.env.example` (ghi chú follow-up `TCS_AGENT_*` / `GEMINI_*` trên Railway — ops, không secret)
- Live docs: `docs/ops-ext-protocol.md`, `docs/railway-online-portal.md`, `docs/railway-safe-deploy.md`, `docs/ecargo-vct-otp-flow.md`, `docs/ui-review.md`

---

## Removed

Đã `git rm` các path SAFE ở bảng trên.

**Không** xóa schema, migration, auth, Ext, OCR, eCargo, print/CSD.

---

## Preserved

Xem bảng REVIEW + KEEP. Mọi mục REVIEW-only giữ nguyên trên `main` lineage.

---

## Validation

Chạy trên nhánh này sau khi xóa:

- [ ] `npm run lint`
- [ ] `npm run lint:server`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run deploy:check`

Kết quả điền sau khi CI local xong.

---

## Metrics

| | Trước xóa | Đã gỡ |
|---|---|---|
| Files | — | **8 files** (2 audit + 1 PDF script + 3 mcp + 2 policy) |
| LOC (`wc -l`) | — | **2 808** |
| Bytes | — | **121 149** (~118 KiB) |

Chi tiết LOC:

| File | Lines | Bytes |
|---|---:|---:|
| `docs/TECSOPS-PLAYWRIGHT-AUDIT-2026-08-12.md` | 235 | 11 271 |
| `docs/TECSOPS-REDESIGN-AUDIT.md` | 542 | 29 586 |
| `scripts/generate-ui-redesign-checklist-pdf.mjs` | 623 | 32 376 |
| `mcp/tecsops-deploy/server.mjs` | 97 | 3 202 |
| `mcp/tecsops-deploy/package.json` | 14 | 331 |
| `mcp/tecsops-deploy/package-lock.json` | 1 139 | 40 210 |
| `src/utils/portalExecutorPolicy.ts` | 99 | 2 523 |
| `src/utils/portalExecutorPolicy.test.ts` | 59 | 1 650 |

---

## Follow-up (không làm trong PR này)

- Ops Railway: vẫn có thể xóa biến `TCS_AGENT_*` / `GEMINI_*` + volume `browser_profile` (A3/B1 notes).
- Nếu Cursor Desktop từng trỏ MCP `mcp/tecsops-deploy/server.mjs` — gỡ entry đó; dùng `npm run deploy:ship`.
- Quyết định sau: archive 4 docs 12/08 + spec redesign; `src/ui/Card.tsx`; HTML downloads TCS.
