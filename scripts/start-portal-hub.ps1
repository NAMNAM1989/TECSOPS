# TECS-TCS: agent :8765 (dual-agent local). Không còn portal-worker.
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\portal-env.ps1"

$hubEnv = Join-Path $Root "tcs-awb-automation\.env.hub"
if (-not (Test-Path $hubEnv)) {
  Copy-Item (Join-Path $Root "tcs-awb-automation\.env") $hubEnv -Force
}

try {
  Invoke-WebRequest -Uri "http://127.0.0.1:8765/health" -UseBasicParsing -TimeoutSec 2 | Out-Null
  Write-Host "[hub] Agent :8765 already running" -ForegroundColor Yellow
} catch {
  Write-Host "[hub] Starting TECS-TCS agent :8765..." -ForegroundColor Green
  Start-AgentFromEnvFile $hubEnv "TECS-TCS-hub"
  Start-Sleep -Seconds 3
}

Write-Host "[hub] Agent TECS-TCS :8765 sẵn sàng. Đăng Nhập TCS / Quét qua Ext hoặc agent." -ForegroundColor Cyan
