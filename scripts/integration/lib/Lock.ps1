# Integration lock for concurrent merge protection

function Get-LockPath {
    param([string]$RepoRoot)
    return Join-Path (Join-Path $RepoRoot ".git") "integration.lock"
}

function Get-LockData {
    param([string]$RepoRoot)
    $lockPath = Get-LockPath -RepoRoot $RepoRoot
    if (-not (Test-Path $lockPath)) { return $null }
    try {
        return Get-Content $lockPath -Raw | ConvertFrom-Json
    } catch {
        return $null
    }
}

function Test-LockStale {
    param($LockData)
    if (-not $LockData) { return $true }
    if ($LockData.pid -and (Test-ProcessRunning -ProcessId $LockData.pid)) {
        return $false
    }
    return $true
}

function Test-IntegrationLock {
    param([string]$RepoRoot)
    $lockData = Get-LockData -RepoRoot $RepoRoot
    if (-not $lockData) { return @{ Locked = $false } }
    if (Test-LockStale -LockData $lockData) {
        Remove-IntegrationLock -RepoRoot $RepoRoot -Force
        return @{ Locked = $false; WasStale = $true }
    }
    return @{
        Locked  = $true
        Branch  = $lockData.branch
        Worktree = $lockData.worktree
        Pid     = $lockData.pid
        StartedAt = $lockData.startedAt
        Mode    = $lockData.mode
    }
}

function Set-IntegrationLock {
    param(
        [string]$RepoRoot,
        [string]$Branch,
        [string]$Mode
    )
    $lockPath = Get-LockPath -RepoRoot $RepoRoot
    $data = @{
        pid       = $PID
        branch    = $Branch
        worktree  = (Resolve-Path $RepoRoot).Path
        startedAt = (Get-Date).ToString("o")
        mode      = $Mode
    } | ConvertTo-Json -Compress
    Set-Content -Path $lockPath -Value $data -Encoding UTF8 -NoNewline
}

function Remove-IntegrationLock {
    param(
        [string]$RepoRoot,
        [switch]$Force
    )
    $lockPath = Get-LockPath -RepoRoot $RepoRoot
    if (-not (Test-Path $lockPath)) { return }

    if (-not $Force) {
        $lockData = Get-LockData -RepoRoot $RepoRoot
        if ($lockData -and $lockData.pid -ne $PID -and (Test-ProcessRunning -ProcessId $lockData.pid)) {
            Write-Warning "Cannot remove lock owned by PID $($lockData.pid)"
            return
        }
    }
    Remove-Item $lockPath -Force -ErrorAction SilentlyContinue
}

function Register-LockCleanup {
    param([string]$RepoRoot)
    Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action {
        Remove-IntegrationLock -RepoRoot $using:RepoRoot
    } | Out-Null
}
