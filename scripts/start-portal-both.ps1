# Start hub + TCS portal stacks
$ErrorActionPreference = "Stop"
& "$PSScriptRoot\start-portal-hub.ps1"
& "$PSScriptRoot\start-portal-tcs.ps1"
Write-Host ""
Write-Host "[both] Done. Test phone on Railway for TECS-TCS / TCS." -ForegroundColor Green
