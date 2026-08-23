# Kho TCS: agent :8766 (dual-agent local). Không còn portal-worker.
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\portal-env.ps1"

$tcsEnv = Join-Path $Root "tcs-awb-automation\.env.tcs"
if (-not (Test-Path $tcsEnv)) { throw "Missing $tcsEnv" }

$map = Read-DotEnvFile $tcsEnv
if (-not $map["TCS_USERNAME"] -or -not $map["TCS_PASSWORD"]) {
  Write-Host ""
  Write-Host "[!] Fill kho TCS credentials in:" -ForegroundColor Red
  Write-Host "    tcs-awb-automation\.env.tcs"
  Write-Host "    TCS_USERNAME=..."
  Write-Host "    TCS_PASSWORD=..."
  Write-Host "    Then: npm run portal:start:tcs"
  Write-Host ""
  notepad $tcsEnv
  exit 1
}

try {
  Invoke-WebRequest -Uri "http://127.0.0.1:8766/health" -UseBasicParsing -TimeoutSec 2 | Out-Null
  Write-Host "[tcs] Agent :8766 already running" -ForegroundColor Yellow
} catch {
  Write-Host "[tcs] Starting kho TCS agent :8766..." -ForegroundColor Green
  Start-AgentFromEnvFile $tcsEnv "Kho-TCS"
  Start-Sleep -Seconds 4
}

Write-Host "[tcs] Agent TCS :8766 sẵn sàng. Đăng Nhập TCS / Quét / PDF qua Ext hoặc agent." -ForegroundColor Cyan
