# ext_tcs — Agent status

**Phase:** 0 — Project recovery  
**Implementation sprint:** **chưa bắt đầu**  
**Ngày:** 2026-08-25  
**Nhánh docs:** `cursor/ext-tcs-phase0-recovery-59c4`  
**Base:** `main` @ `f2c8a5c` (PR #74)  
**Mã nguồn được đọc:** `b1c377d:chrome-extension-tcs/` (v1.5.3)

---

## Đã xong (Phase 0)

- [x] Xác định vị trí: **không** trên `main`; last tree = `chrome-extension-tcs/` @ `b1c377d` (= `60253f1` cho folder này)
- [x] Loại giả thuyết React/Vite/Dexie/Side Panel / `src/automation/tcs`
- [x] Đọc manifest, README, background, content-ops, content-tcs, locators, popup, OCR, packager, analysis cũ, protocol cũ
- [x] Đối chiếu P0/P1/P2 trên mã (không tin docs cũ)
- [x] `node --check` + parse JSON (không hit live TCS, không copy secret)
- [x] Viết `PROJECT_SPEC.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `PHASE0_RECOVERY_REPORT.md`
- [x] PR **docs-only** — không restore folder Ext, không gắn lại Tải Ext / Đăng Nhập TCS / eCargo

---

## Cố ý không làm

- Không commit `chrome-extension-tcs/` trở lại working tree
- Không đổi product / runtime / Manifest
- Không viết exploit, không cải tiến OCR, không bịa selector
- Không chạy `cdp-load-and-verify.mjs` / login live

---

## Chưa bắt đầu (chờ giao sprint 1)

- Site Analyst: đối chiếu locator trên `/Esid/Export` authorized
- Core Engineer: storage/message hardening, permission leftover
- Automation/Data: test thuần + sync DEFAULT_LOCATORS
- UI/UX Ops: host lệnh ngoài TECSOPS app; copy «ĐN»
- QA: bộ test không đụng live phá hủy

Chi tiết A–J: `PHASE0_RECOVERY_REPORT.md`.
