# Bugbot — TECSOPS

Hướng dẫn review cho repo **air-cargo-tracking / TECSOPS** (Ops hàng không TCS/SCSC). Chỉ flag những gì khớp thực tế stack: React 18 + Vite + Tailwind 3 + Express + Postgres. Không yêu cầu thay đổi ngoài diff.

## 1. Bảng nguồn Supabase — cấm ghi

SoT namnamlogistics / Supabase: `lots`, `airlines`, `ops_customers`. App chỉ được **SELECT** / REST GET.

**Flag** mọi `INSERT` / `UPDATE` / `DELETE` / `TRUNCATE` / `DROP` / baseline / reset / `ON CONFLICT` ghi / migrate mutate ba bảng này (SQL, Supabase REST `POST`/`PATCH`/`DELETE`, script seed/reset). Overlay `synced_at` trên response là đọc — không được ghi ngược vào bảng nguồn.

Không nhầm với bảng Railway (`app_state`, `shipments`, `customers`, …): đó là persistence app, vẫn phải tránh `DROP`/`TRUNCATE`/`force-reset` (xem `scripts/check-deploy-safe.mjs`).

## 2. Secret / token trên client

**Flag** nếu `DATABASE_URL`, service-role / secret Supabase, `NAMNAMLOGISTICS_*` (trừ anon đã cố ý), cookie auth thô, hoặc token Railway xuất hiện trong `src/` (bundle Vite).

Cho phép: `VITE_DATA_SUPABASE_URL` + `VITE_DATA_SUPABASE_ANON_KEY` (publishable, RLS) — **không** commit giá trị thật. Anon key đọc `airlines` là GET catalog, không phải license ghi `lots`.

## 3. UI bypass kit / token

Khi diff đụng `src/**/*.tsx` hoặc style:

- Primitive mới (nút, input, dialog, toast) không dùng `src/ui` mà tự bịa markup/`<button>`/`<input>` ad-hoc.
- Màu cứng (`#0F766E`, `bg-white`/`text-slate-*` tùy tiện, inline style) thay vì `ui.*` (`bg-ui-surface`, `text-ui-text`, `border-ui-border`, … từ `src/styles/tokens.css` + `tailwind.config.js`).
- Thêm shadcn / Radix / MUI / Chakra / lib UI mới.

Feature screen vẫn nằm `src/components` — flag khi chúng tự invent design system thay vì import `../ui`.

## 4. Mobile + a11y

Nhân viên kho dùng điện thoại. **Flag**:

- Layout desktop-only (`md:`/`lg:` mới có UI dùng được; mất `BottomNav` / sheet / FAB / vùng chạm ≥44px / `min-h-11`).
- Bỏ `aria-label`, `role="alert"`, focus ring (`focus-visible`, `ring-ui-focus`).
- PR UI mà không có / phá `npm run test:e2e:a11y` (axe critical trong `tests/e2e/accessibility.mjs`).

## 5. Ext / eCargo — đã gỡ PR #74

**Flag** tái xuất hiện:

- `chrome-extension*`, menu/nút **Tải Ext**, CTA **Đăng Nhập TCS** (viết đủ, không «ĐN»)
- `/api/chrome-extensions`, `/api/tcs-extension*`, `/api/ecargo*`, mutation `SET_ECARGO_*`
- OCR/IMAP captcha, portal TCS tự động, VCT/OTP eCargo

ESID local (`EsidSettingsMenu`) được giữ — không flag trừ khi nó lại bridge Chrome/portal.

## 6. Railway deploy — cần lý do

**Flag** sửa `railway.toml`, `Dockerfile`, `nixpacks.toml`, `scripts/start-fullstack.mjs`, `scripts/check-deploy-safe.mjs`, `package.json` scripts `start` / `start:railway` / `deploy:*` nếu PR không giải thích. Đặc biệt: healthcheck `/api/health`, `DATABASE_URL` bắt buộc, 1 replica Socket.IO, không `DROP DATABASE` / Prisma `--force-reset`.

## 7. Phạm vi nghiệp vụ

Chỉ air cargo (4 kho trên). **Flag** module đường bộ/biển, hoặc copy UI tiếng Việt bị cắt/viết tắt sai so với chuỗi đang ship.
