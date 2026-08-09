# Create Desktop shortcut "Khoi dong may kho TECSOPS.lnk"
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$bat = Join-Path $Root "KHOI-DONG-MAY-KHO.bat"
if (-not (Test-Path $bat)) { throw "Missing $bat" }

$desktop = [Environment]::GetFolderPath("Desktop")
$lnkPath = Join-Path $desktop "Khoi dong may kho TECSOPS.lnk"
$w = New-Object -ComObject WScript.Shell
$sc = $w.CreateShortcut($lnkPath)
$sc.TargetPath = $bat
$sc.WorkingDirectory = $Root
$sc.WindowStyle = 1
$sc.Description = "TECSOPS warehouse agents + portal workers for phone Railway"
$sc.Save()
Write-Host "Created shortcut: $lnkPath" -ForegroundColor Green
