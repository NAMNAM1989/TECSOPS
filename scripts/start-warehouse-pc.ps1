# One-click: start both warehouse agents + portal workers, then open TCS sessions.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  TECSOPS - Khoi dong may kho" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

& "$PSScriptRoot\start-portal-both.ps1"

function Wait-Agent {
  param(
    [int]$Port,
    [int]$Seconds = 45
  )
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $h = Invoke-RestMethod "http://127.0.0.1:$Port/health" -TimeoutSec 2
      if ($h.ok) { return $true }
    } catch {
      # retry
    }
    Start-Sleep -Milliseconds 800
  }
  return $false
}

function Open-AgentSession {
  param(
    [int]$Port,
    [string]$Label
  )
  Write-Host "[session] $Label :$Port - mo Chrome + DN..." -ForegroundColor Yellow
  try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/session/open" `
      -Method POST -ContentType "application/json" `
      -Body '{"visible":true,"headed":true,"show_browser":true}' `
      -TimeoutSec 120
    if ($r.logged_in) {
      Write-Host "[session] $Label OK - da DN" -ForegroundColor Green
    } else {
      Write-Host "[session] $Label Chrome da mo - nhap CAPTCHA tren cua so Chrome neu can" -ForegroundColor Yellow
      Write-Host ("         {0}" -f $r.message) -ForegroundColor DarkYellow
    }
  } catch {
    Write-Host "[session] $Label loi: $($_.Exception.Message)" -ForegroundColor Red
  }
}

Write-Host ""
Write-Host "[wait] Cho agent :8765 / :8766..." -ForegroundColor Cyan
$okHub = Wait-Agent -Port 8765
$okTcs = Wait-Agent -Port 8766
if (-not $okHub) { Write-Host "[warn] Agent TECS-TCS :8765 chua san sang" -ForegroundColor Red }
if (-not $okTcs) { Write-Host "[warn] Agent TCS :8766 chua san sang" -ForegroundColor Red }

if ($okHub) { Open-AgentSession -Port 8765 -Label "TECS-TCS" }
if ($okTcs) { Open-AgentSession -Port 8766 -Label "TCS" }

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Xong. Giu cac cua so agent/worker." -ForegroundColor Green
Write-Host "  Phone Railway -> DN / Quet / PDF." -ForegroundColor Green
Write-Host "  Neu CAPTCHA: nhap tren Chrome agent." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Nhan phim bat ky de dong cua so nay (worker/agent van chay)..."
try {
  $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
} catch {
  pause
}
