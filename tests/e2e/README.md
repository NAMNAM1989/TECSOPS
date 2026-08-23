# TECSOPS Playwright E2E

## L1 — read-only

```powershell
npm run test:e2e
$env:BASE_URL="https://<service>.up.railway.app"; npm run test:e2e
```

L1 được phép chạy trên Railway production: chỉ đọc health/UI, không mutation.

## L2 — mutation

Chỉ chạy trên Postgres test/local clone:

```powershell
$env:BASE_URL="http://127.0.0.1:3001"
$env:E2E_ALLOW_MUTATION="1"
npm run test:e2e:mutation
```

Remote staging còn yêu cầu `E2E_ALLOW_REMOTE_MUTATION=1`. Không bật biến này với production.

L2 tạo shipment có marker `E2E-G1-<timestamp>` và luôn xóa đúng ID trong `finally`.

## Cleanup

```powershell
$env:E2E_ALLOW_MUTATION="1"
npm run e2e:cleanup
```

Cleanup chỉ xóa shipment có `note` khớp marker `E2E-*` hợp lệ; không xóa dữ liệu khác.

Khi G2 auth bật, truyền `TECSOPS_APP_TOKEN` qua environment. Không commit token.
