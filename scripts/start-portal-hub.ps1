# TECS-TCS: agent :8765 (if needed) + worker PORTAL_WAREHOUSE=TECS-TCS
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

Start-PortalWorkerWindow -Warehouse "TECS-TCS" -AgentUrl "http://127.0.0.1:8765"
Write-Host "[hub] Worker TECS-TCS window opened. Keep agent + worker running." -ForegroundColor Cyan
