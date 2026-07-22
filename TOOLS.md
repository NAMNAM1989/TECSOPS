# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH

- home-server → 192.168.1.100, user: admin

### TTS

- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

Add whatever helps you do your job. This is your cheat sheet.

## TCS — Điền ESID bằng Chrome extension (đường chính)

- Thư mục: `chrome-extension/` — xem [chrome-extension/README.md](chrome-extension/README.md).
- Mỗi máy nhập liệu: Load unpacked → Login TCS trên Chrome → Ops menu ⋮ → **Điền** → tự **HOÀN TẤT** trên TCS.
- Badge thanh TCS: **Ext OK** / **Ext thiếu**. Không fallback noVNC khi thiếu extension.
- Menu **Điền**: chỉ Chrome extension trên tab TCS. Hồ sơ **Agent ESID** = nút Agent trên thanh TCS. Quét / PDF vẫn qua Playwright.

## TCS agent — máy kho (headed)

- Chạy Ops + agent trên máy kho: `npm run dev` hoặc `npm run tcs:agent:real` → mặc định `TCS_HEADLESS=0` (Chrome thật).
- Nút **Login** Ops → Chrome Playwright cho Quét/PDF (không dùng cho Điền).
- Máy khác mở Ops qua IP máy kho; Điền chính vẫn dùng extension trên Chrome của người nhập liệu.

## TCS trên Railway — API-first (mặc định)

- Image mặc định: `TCS_VNC=0`, `TCS_HEADLESS=1` — Quét/PDF/Login agent từ Ops; **Điền** = extension trên máy user.
- Desktop noVNC (chậm, dự phòng): Railway Variables `TCS_VNC=1` + `TCS_HEADLESS=0` (+ `DISPLAY=:99`). Nút Ops **Sửa tay**.
- Volume `TCS_BROWSER_PROFILE` giữ session agent. Health: `GET /api/tcs-desktop` (`enabled` true/false).

## Related

- [Agent workspace](/concepts/agent-workspace)
