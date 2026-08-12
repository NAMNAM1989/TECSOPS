# Playwright HEADED trên máy kiểm soát — dual agent :8765 / :8766, không portal-worker.
# Dùng với Ops Railway + Ext + nút «PW local».
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\portal-env.ps1"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  TECSOPS — Playwright headed local" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

function Wait-Agent {
  param([int]$Port, [int]$Seconds = 50)
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $h = Invoke-RestMethod "http://127.0.0.1:$Port/health" -TimeoutSec 2
      if ($h.ok) { return $true }
    } catch { }
    Start-Sleep -Milliseconds 700
  }
  return $false
}

function Open-HeadedSession {
  param([int]$Port, [string]$Label)
  Write-Host "[session] $Label :$Port — mo Chrome headed..." -ForegroundColor Yellow
  try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/session/open" `
      -Method POST -ContentType "application/json" `
      -Body '{"visible":true,"headed":true,"show_browser":true}' `
      -TimeoutSec 180
    if ($r.logged_in) {
      Write-Host "[session] $Label OK — da DN" -ForegroundColor Green
    } else {
      Write-Host "[session] $Label Chrome da mo — nhap CAPTCHA tren cua so neu can" -ForegroundColor Yellow
      Write-Host ("         {0}" -f $r.message) -ForegroundColor DarkYellow
    }
  } catch {
    Write-Host "[session] $Label loi: $($_.Exception.Message)" -ForegroundColor Red
  }
}

$hubEnv = Join-Path $Root "tcs-awb-automation\.env.hub"
$tcsEnv = Join-Path $Root "tcs-awb-automation\.env.tcs"
$fallbackEnv = Join-Path $Root "tcs-awb-automation\.env"

if (-not (Test-Path $hubEnv)) {
  if (Test-Path $fallbackEnv) {
    Copy-Item $fallbackEnv $hubEnv -Force
    Write-Host "[hub] Tao .env.hub tu .env" -ForegroundColor DarkYellow
  } else {
    throw "Thieu tcs-awb-automation\.env.hub (hoac .env)"
  }
}

$forceHeadedHub = @{
  TCS_HEADLESS = "0"
  TCS_AUTO_OPEN = "0"
  TCS_AGENT_PORT = "8765"
  TCS_WAREHOUSE_SCOPE = "TECS-TCS"
}
$forceHeadedTcs = @{
  TCS_HEADLESS = "0"
  TCS_AUTO_OPEN = "0"
  TCS_AGENT_PORT = "8766"
  TCS_WAREHOUSE_SCOPE = "TCS"
}

# --- TECS-TCS :8765 ---
try {
  Invoke-WebRequest -Uri "http://127.0.0.1:8765/health" -UseBasicParsing -TimeoutSec 2 | Out-Null
  Write-Host "[hub] Agent :8765 dang chay" -ForegroundColor Yellow
} catch {
  Write-Host "[hub] Start TECS-TCS agent headed :8765..." -ForegroundColor Green
  Start-AgentFromEnvFile $hubEnv "TECS-TCS-headed" $forceHeadedHub
}

# --- TCS :8766 ---
$startTcs = $false
if (Test-Path $tcsEnv) {
  $tcsMap = Read-DotEnvFile $tcsEnv
  if ($tcsMap["TCS_USERNAME"] -and $tcsMap["TCS_PASSWORD"]) {
    $startTcs = $true
  } else {
    Write-Host "[tcs] Bo qua :8766 — dien TCS_USERNAME/TCS_PASSWORD trong .env.tcs" -ForegroundColor DarkYellow
  }
} else {
  Write-Host "[tcs] Bo qua :8766 — thieu .env.tcs" -ForegroundColor DarkYellow
}

if ($startTcs) {
  try {
    Invoke-WebRequest -Uri "http://127.0.0.1:8766/health" -UseBasicParsing -TimeoutSec 2 | Out-Null
    Write-Host "[tcs] Agent :8766 dang chay" -ForegroundColor Yellow
  } catch {
    Write-Host "[tcs] Start kho TCS agent headed :8766..." -ForegroundColor Green
    Start-AgentFromEnvFile $tcsEnv "Kho-TCS-headed" $forceHeadedTcs
  }
}

Write-Host ""
Write-Host "[wait] Cho agent san sang..." -ForegroundColor Cyan
$okHub = Wait-Agent -Port 8765
$okTcs = if ($startTcs) { Wait-Agent -Port 8766 } else { $false }
if (-not $okHub) { Write-Host "[warn] :8765 chua san sang" -ForegroundColor Red }
if ($startTcs -and -not $okTcs) { Write-Host "[warn] :8766 chua san sang" -ForegroundColor Red }

  if ($okHub) { Open-HeadedSession -Port 8765 -Label "TECS-TCS" }
if ($okTcs) { Open-HeadedSession -Port 8766 -Label "TCS" }

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Agent headed local san sang." -ForegroundColor Green
Write-Host "  1) Reload Chrome Ext (TCS + TECS-TCS)" -ForegroundColor Green
Write-Host "  2) Mo Ops Railway tren cung Chrome" -ForegroundColor Green
Write-Host "  3) Bat nut «PW local» tren thanh TCS" -ForegroundColor Green
Write-Host "  4) DN / Quet / Dien — nhin cua so Chromium" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Giu cac cua so agent. Nhan phim bat ky de dong script (agent van chay)..."
try {
  $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
} catch {
  pause
}
