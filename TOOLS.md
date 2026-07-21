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

## TCS agent — máy kho (headed)

- Chạy Ops + agent trên máy kho: `npm run dev` hoặc `npm run tcs:agent:real` → mặc định `TCS_HEADLESS=0` (Chrome thật).
- Sau **Điền** ESID: kiểm tra form trên cửa sổ Chrome máy kho → HOÀN TẤT trên Chrome hoặc nút Ops.
- Máy khác chỉ mở Ops qua IP máy kho; đừng mở tab TCS riêng (session khác).
- Railway/container: `TCS_HEADLESS=1` (không có cửa sổ).

## Related

- [Agent workspace](/concepts/agent-workspace)
