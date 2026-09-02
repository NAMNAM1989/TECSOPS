# Shared utilities for Worktree Integration Manager

$script:StageResults = @()
$script:RepoRoot = $null
$script:ExitCode = 0

function Initialize-Integration {
    param([string]$StartDir)
    $script:RepoRoot = Resolve-RepoRoot -StartDir $StartDir
    Set-Location $script:RepoRoot
}

function Resolve-RepoRoot {
    param([string]$StartDir = (Get-Location).Path)
    $dir = $StartDir
    while ($dir) {
        if (Test-Path (Join-Path $dir ".git")) {
            return (Resolve-Path $dir).Path
        }
        $parent = Split-Path $dir -Parent
        if ($parent -eq $dir) { break }
        $dir = $parent
    }
    throw "Not inside a Git repository."
}

function Write-Banner {
    param([string]$Title)
    Write-Host ""
    Write-Host "====================================" -ForegroundColor Cyan
    Write-Host $Title -ForegroundColor Cyan
    Write-Host "====================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-StageResult {
    param(
        [int]$Number,
        [string]$Name,
        [ValidateSet("PASS", "FAIL", "SKIP", "NOT CONFIGURED", "WARN")]
        [string]$Status,
        [string]$Detail = ""
    )
    $color = switch ($Status) {
        "PASS" { "Green" }
        "FAIL" { "Red" }
        "SKIP" { "DarkGray" }
        "NOT CONFIGURED" { "Yellow" }
        "WARN" { "Yellow" }
        default { "White" }
    }
    $label = "[{0}] {1,-24} {2}" -f $Number, $Name, $Status
    Write-Host $label -ForegroundColor $color
    if ($Detail) { Write-Host "    $Detail" -ForegroundColor DarkGray }
    $script:StageResults += [PSCustomObject]@{
        Number = $Number
        Name   = $Name
        Status = $Status
        Detail = $Detail
    }
}

function Write-Blocked {
    param(
        [string]$Stage,
        [string]$Command = "",
        [string]$Error = ""
    )
    Write-Host ""
    Write-Banner "MERGE BLOCKED"
    Write-Host "Stage:   $Stage" -ForegroundColor Red
    if ($Command) { Write-Host "Command: $Command" -ForegroundColor Red }
    if ($Error) {
        Write-Host "Error:" -ForegroundColor Red
        Write-Host $Error -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "MAIN WAS NOT MODIFIED" -ForegroundColor Yellow
    Write-Host ""
}

function Write-Success {
    param([string]$Branch, [string]$MainBranch)
    Write-Host ""
    Write-Banner "INTEGRATION SUCCESS"
    Write-Host "Branch: $Branch -> $MainBranch" -ForegroundColor Green
    Write-Host ""
}

function Invoke-CommandChecked {
    param(
        [string]$Name,
        [string]$Command,
        [string[]]$Arguments = @(),
        [switch]$AllowFail
    )
    Write-Host "  > $Command $($Arguments -join ' ')" -ForegroundColor DarkGray
    $output = & $Command @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0 -and -not $AllowFail) {
        return @{
            Success = $false
            Output  = ($output | Out-String).Trim()
            ExitCode = $exitCode
        }
    }
    return @{
        Success  = $true
        Output   = ($output | Out-String).Trim()
        ExitCode = $exitCode
    }
}

function Get-ChangedFiles {
    param([string]$BaseRef = "HEAD")
    $files = git diff --name-only $BaseRef 2>$null
    $staged = git diff --name-only --cached 2>$null
    $untracked = git ls-files --others --exclude-standard 2>$null
    $all = @($files) + @($staged) + @($untracked) | Where-Object { $_ } | Select-Object -Unique
    return $all
}

function Test-ProcessRunning {
    param([int]$ProcessId)
    if ($ProcessId -le 0) { return $false }
    try {
        $proc = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
        return $null -ne $proc
    } catch {
        return $false
    }
}
