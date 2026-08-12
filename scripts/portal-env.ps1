# Shared helpers for portal start scripts (dot-source).
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
if (-not $Root) { $Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path }

function Read-DotEnvFile([string]$Path) {
  $map = @{}
  if (-not (Test-Path $Path)) { return $map }
  Get-Content $Path -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $i = $line.IndexOf("=")
    if ($i -lt 1) { return }
    $k = $line.Substring(0, $i).Trim()
    $v = $line.Substring($i + 1).Trim()
    if (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'"))) {
      $v = $v.Substring(1, $v.Length - 2)
    }
    $map[$k] = $v
  }
  return $map
}

function Get-PortalSecret {
  $fromLocal = Read-DotEnvFile (Join-Path $Root ".env.local")
  if ($fromLocal["PORTAL_WORKER_SECRET"]) { return $fromLocal["PORTAL_WORKER_SECRET"] }
  $secretFile = Join-Path $Root "scripts\.portal-secret.local"
  if (Test-Path $secretFile) { return (Get-Content $secretFile -Raw).Trim() }
  throw "Missing PORTAL_WORKER_SECRET in .env.local"
}

function Get-OpsApiBase {
  $fromLocal = Read-DotEnvFile (Join-Path $Root ".env.local")
  if ($fromLocal["OPS_API_BASE"]) { return $fromLocal["OPS_API_BASE"].TrimEnd("/") }
  if ($fromLocal["TECSOPS_VERIFY_URL"]) { return $fromLocal["TECSOPS_VERIFY_URL"].TrimEnd("/") }
  return "https://ops-production-b405.up.railway.app"
}

function Start-PortalWorkerWindow([string]$Warehouse, [string]$AgentUrl) {
  $secret = Get-PortalSecret
  $ops = Get-OpsApiBase
  $cmd = @"
`$env:OPS_API_BASE='$ops'
`$env:PORTAL_WORKER_SECRET='$secret'
`$env:TCS_AGENT_URL='$AgentUrl'
`$env:PORTAL_WAREHOUSE='$Warehouse'
`$env:PORTAL_CLOSE_AFTER_PDF='1'
`$env:PORTAL_BROWSER_IDLE_MS='15000'
Set-Location '$Root'
Write-Host '[portal-worker]' '$Warehouse' '->' `$env:OPS_API_BASE 'agent' `$env:TCS_AGENT_URL -ForegroundColor Cyan
Write-Host '[portal-worker] close Chrome after PDF (idle 15s)' -ForegroundColor DarkCyan
npm run portal:worker
"@
  Start-Process powershell -ArgumentList @("-NoExit", "-Command", $cmd) -WorkingDirectory $Root
}

function Start-AgentFromEnvFile([string]$EnvFile, [string]$Title, [hashtable]$ForceEnv = @{}) {
  if (-not (Test-Path $EnvFile)) { throw "Missing $EnvFile" }
  $map = Read-DotEnvFile $EnvFile
  if (-not $map["TCS_USERNAME"] -or -not $map["TCS_PASSWORD"]) {
    throw "$EnvFile missing TCS_USERNAME / TCS_PASSWORD"
  }
  foreach ($k in $ForceEnv.Keys) {
    $map[$k] = [string]$ForceEnv[$k]
  }
  $assign = ($map.GetEnumerator() | ForEach-Object {
      $k = $_.Key
      $v = $_.Value -replace "'", "''"
      "`$env:$k='$v'"
    }) -join "; "
  $agentDir = Join-Path $Root "tcs-awb-automation"
  $py = Join-Path $agentDir ".venv\Scripts\python.exe"
  if (-not (Test-Path $py)) { $py = "python" }
  $cmd = @"
$assign
Set-Location '$agentDir'
Write-Host '[agent]' '$Title' 'port' `$env:TCS_AGENT_PORT 'user' `$env:TCS_USERNAME 'headless' `$env:TCS_HEADLESS -ForegroundColor Green
& '$py' -m app.main agent --real
"@
  Start-Process powershell -ArgumentList @("-NoExit", "-Command", $cmd) -WorkingDirectory $agentDir
}
