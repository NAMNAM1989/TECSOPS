# Báo cáo kiểm thử — TCS AWB Automation × TECSOPS

**Ngày:** 2026-07-17  
**Phạm vi:** chỉ kho TECS-TCS  
**Môi trường:** Windows, Python 3.12.8, Node/Vitest

## Kết quả

| Hạng mục | Kết quả |
|---|---|
| Pytest sidecar | **18/18 PASS** |
| Vitest Ops (`tcsPortalJob`) | **2/2 PASS** |
| `tsc -b` | **PASS** |
| Mock batch Excel | **PASS** — xuất `TCS_AWB_RESULT_*.xlsx` |
| Agent HTTP e2e (`/health` + `/jobs`) | **PASS** — DOWNLOAD→DOWNLOADED, LOOKUP chưa xong→NOT_COMPLETED |
| Discovery cổng TCS thật | **Chưa chạy** (cần tài khoản + CAPTCHA thủ công trên máy kho) |
| LOOKUP/REGISTER thật trên portal | **Chặn an toàn** đến khi discovery + locators xác nhận |

## Quy ước mock (test không cần login)

- AWB kết thúc chữ số **chẵn** → hoàn thành  
- **Lẻ** → chưa hoàn thành  
- Kết thúc **9** → lỗi hệ thống  

## Cách tái chạy

```powershell
cd tcs-awb-automation
.\.venv\Scripts\Activate.ps1
pytest
python -m app.main agent --mock --dry-run
# Ops: nút Cổng TCS → Mock bật → Gửi agent
```
