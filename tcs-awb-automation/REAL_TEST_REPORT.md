# Báo cáo test chạy thật — Cổng TCS AWB

**Ngày:** 2026-07-17  
**Phạm vi:** TECS-TCS only

## Đã xác nhận tự động

| Case | Kết quả |
|---|---|
| Login page locators (`#basic_username`, `#basic_password`, `#basic_captchaCode`, Đăng nhập) | PASS (quan sát DOM thật) |
| `discovery --login-only --non-interactive` | PASS → `discovery_report.md` + screenshot |
| Pytest (gồm locators/page/client) | **22/22 PASS** |
| Agent `--real` `/health` mock=false | PASS |
| POST `/jobs` mock=false khi Chrome chưa mở | **400 NO_BROWSER** PASS |
| POST `/session/open` → URL AwbLogin, needs_login | PASS |
| POST `/jobs` khi còn trang login | **400 NEEDS_LOGIN** PASS |
| POST `/jobs` mock=true trên agent real (PDF mock) | PASS DOWNLOADED |
| Vitest Ops + `tsc -b` | PASS |

## Chưa chạy được (cần bạn)

| Case | Lý do |
|---|---|
| LOOKUP/DOWNLOAD PDF thật 1 AWB hoàn thành | Cần login tay + CAPTCHA + discovery bước tra AWB (awb_lookup.confirmed vẫn **false**) |
| 1 AWB chưa hoàn thành | Như trên |

## Cách hoàn tất trên máy kho

```powershell
# Terminal 1
npm run tcs:agent -- --real

# Terminal 2 — discovery đầy đủ (login + tra AWB + tải PDF mẫu)
cd tcs-awb-automation
.\.venv\Scripts\Activate.ps1
python -m app.main discovery
# → kiểm tra discovery_artifacts/locators.json awb_lookup.confirmed == true

# Ops: Cổng TCS → tắt Mock → Mở Chrome TCS → login tay → Tải PDF (cổng thật)
```

## File chính

- `discovery_artifacts/locators.json` — login confirmed; AWB chờ discovery
- `app/browser/pages/awb_page.py` — Page Object thật
- `app/services/agent_api.py` — `/session/open|status|close` + jobs + portal
- `src/components/TcsPortalModal.tsx` — UI session / chế độ thật
