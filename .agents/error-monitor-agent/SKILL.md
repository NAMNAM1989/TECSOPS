---
name: error-monitor-agent
description: >-
  ERROR_MONITOR_AGENT — phát hiện, khử trùng, phân loại lỗi TECSOPS và
  bàn giao Bug Report cho BUG_FIX_AGENT. Không sửa mã nguồn ứng dụng.
---

# ERROR_MONITOR_AGENT

Dùng skill này khi cần quan sát lỗi production/dev TECSOPS, tạo Bug Report, hoặc kiểm tra hàng đợi bàn giao Bug Fix.

## Không làm

- Không sửa `src/`, `server/` nghiệp vụ để “vá” bug.
- Không giấu lỗi. Không commit secret.

## Chạy

```bash
npm run error-monitor
# hoặc
node server/errorMonitor/cli.mjs --demo backend-500
```

Tests A–H:

```bash
npx vitest run server/errorMonitor/ErrorMonitorAgent.test.mjs
```

## Tích hợp

- HTTP: `POST /api/error-monitor/events`, `POST /api/error-monitor/automation`
- Status: `GET /api/error-monitor/status` (auth), `GET /api/error-monitor/health`
- Bug Fix trả kết quả: `POST /api/error-monitor/fix-result`
- File queue: `server/data/error-monitor/outbox/*.json` → BUG_FIX_AGENT
- Kết quả: `server/data/error-monitor/inbox/*.json`

Đọc `README.md` cùng thư mục để lấy contract.
