<#
.SYNOPSIS
    Worktree Integration Manager — verify, test, and merge worktree changes into MAIN.

.DESCRIPTION
    Runs the full integration pipeline:
    Repository Check -> Diff Audit -> Safe Auto Fix -> Quality Gates ->
    Performance Gate -> E2E -> Commit -> Merge MAIN -> Post-Merge Validation

.PARAMETER Mode
    Quick (default): smoke E2E. Deep: full E2E suite.

.PARAMETER DryRun
    Run all validation gates but skip commit and merge.

.EXAMPLE
    .\verify-and-merge.ps1
    .\verify-and-merge.ps1 -Mode Deep
    .\verify-and-merge.ps1 -DryRun
#>
[CmdletBinding()]
param(
    [ValidateSet("Quick", "Deep")]
    [string]$Mode = "Quick",

    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LibDir = Join-Path $ScriptDir "lib"

. (Join-Path $LibDir "Common.ps1")
. (Join-Path $LibDir "Detect.ps1")
. (Join-Path $LibDir "Lock.ps1")
. (Join-Path $LibDir "Audit.ps1")
. (Join-Path $LibDir "AutoFix.ps1")
. (Join-Path $LibDir "Gates.ps1")
. (Join-Path $LibDir "Performance.ps1")
. (Join-Path $LibDir "Merge.ps1")

$lockAcquired = $false
$repoRoot = $null

try {
    Initialize-Integration -StartDir $ScriptDir
    $repoRoot = $script:RepoRoot

    $projectInfo = Get-ProjectInfo -RepoRoot $repoRoot
    $pm = $projectInfo.PackageManager
    $mainBranch = Get-MainBranch -RepoRoot $repoRoot
    $wtInfo = Get-WorktreeInfo -RepoRoot $repoRoot
    $branch = $wtInfo.Branch
    $mainPath = $wtInfo.MainPath

    Write-Banner "WORKTREE INTEGRATION MANAGER"
    Write-Host "Branch:  $branch"
    Write-Host "Target:  $mainBranch"
    Write-Host "Mode:    $Mode"
    if ($DryRun) { Write-Host "DryRun:  YES (no commit/merge)" -ForegroundColor Yellow }
    Write-Host "PM:      $pm"
    Write-Host "Path:    $repoRoot"
    Write-Host ""

    # --- [1] Repository Safety Check ---
    $safety = Test-RepositorySafety -RepoRoot $repoRoot -Branch $branch -MainBranch $mainBranch
    if (-not $safety.Pass) {
        Write-StageResult -Number 1 -Name "Repository Check" -Status "FAIL" -Detail ($safety.Issues -join "; ")
        Write-Blocked -Stage "Repository Check" -Error ($safety.Issues -join "`n")
        exit 1
    }
    Write-StageResult -Number 1 -Name "Repository Check" -Status "PASS"

    # --- Integration Lock ---
    if (-not $DryRun) {
        $lockStatus = Test-IntegrationLock -RepoRoot $mainPath
        if ($lockStatus.Locked) {
            Write-Blocked -Stage "Integration Lock" -Error @(
                "INTEGRATION LOCKED",
                "Branch:   $($lockStatus.Branch)",
                "Worktree: $($lockStatus.Worktree)",
                "PID:      $($lockStatus.Pid)",
                "Started:  $($lockStatus.StartedAt)"
            ) -join "`n"
            exit 2
        }
    }

    # --- [2] Git Diff Audit ---
    $audit = Invoke-DiffAudit -RepoRoot $repoRoot
    if (-not $audit.Pass) {
        $detail = ($audit.Critical -join "; ")
        Write-StageResult -Number 2 -Name "Git Diff Audit" -Status "FAIL" -Detail $detail
        Write-Blocked -Stage "Git Diff Audit" -Error ($audit.Findings -join "`n")
        exit 1
    }
    $auditDetail = if ($audit.Findings.Count -gt 0) { ($audit.Findings -join "; ") } else { "$($audit.Files.Count) files" }
    $auditStatus = if ($audit.Findings.Count -gt 0) { "WARN" } else { "PASS" }
    Write-StageResult -Number 2 -Name "Git Diff Audit" -Status $auditStatus -Detail $auditDetail

    # --- [3] Safe Auto Fix ---
    $autoFix = Invoke-SafeAutoFix -RepoRoot $repoRoot -PackageManager $pm
    if (-not $autoFix.Pass) {
        Write-StageResult -Number 3 -Name "Safe Auto Fix" -Status "WARN" -Detail ($autoFix.Errors -join "; ")
    } else {
        $fixDetail = if ($autoFix.Fixes.Count -gt 0) { ($autoFix.Fixes -join ", ") } else { "No fixes needed" }
        Write-StageResult -Number 3 -Name "Safe Auto Fix" -Status "PASS" -Detail $fixDetail
    }

    # --- [4-9] Quality Gates ---
    $gates = Get-QualityGates -RepoRoot $repoRoot -Mode $Mode
    $gateResult = Invoke-QualityGates -RepoRoot $repoRoot -PackageManager $pm -Gates $gates -StartNumber 3

    if (-not $gateResult.Pass) {
        $fail = $gateResult.FirstFail
        Write-Blocked -Stage $fail.Stage -Command $fail.Command -Error $fail.Error
        exit 1
    }

    # --- Performance Gate ---
    $perfNum = $gateResult.LastNumber + 1
    $perf = Invoke-PerformanceGate -RepoRoot $repoRoot
    $perfDetail = $perf.BaselineStatus
    if ($perf.Recommendations.Count -gt 0) {
        $perfDetail += " | $($perf.Recommendations.Count) recommendation(s)"
        foreach ($rec in $perf.Recommendations) {
            Write-Host "    $rec" -ForegroundColor DarkYellow
        }
    }
    Write-StageResult -Number $perfNum -Name "Performance" -Status "PASS" -Detail $perfDetail

    # --- Dry Run stops here ---
    if ($DryRun) {
        Write-Host ""
        Write-Banner "DRY RUN COMPLETE"
        Write-Host "All validation gates passed. No commit or merge performed." -ForegroundColor Green
        Write-Host ""
        exit 0
    }

    # --- Commit Worktree ---
    Write-Host ""
    Write-Host "COMMITTING WORKTREE..." -ForegroundColor Cyan
    $commitResult = Invoke-CommitWorktree -RepoRoot $repoRoot -Branch $branch
    if (-not $commitResult.Pass) {
        Write-Blocked -Stage "Commit" -Error $commitResult.Error
        exit 1
    }
    if ($commitResult.Committed) {
        Write-Host "  Commit: $($commitResult.Sha) - $($commitResult.Message)" -ForegroundColor Green
    } else {
        Write-Host "  $($commitResult.Message)" -ForegroundColor DarkGray
    }

    # --- Acquire Integration Lock ---
    Set-IntegrationLock -RepoRoot $mainPath -Branch $branch -Mode $Mode
    $lockAcquired = $true
    Register-LockCleanup -RepoRoot $mainPath

    # --- Check MAIN clean ---
    $mainClean = Test-MainClean -MainPath $mainPath -MainBranch $mainBranch
    if (-not $mainClean.Pass) {
        Write-Blocked -Stage "Main Clean Check" -Error ($mainClean.Issues -join "`n")
        exit 1
    }

    # --- Merge ---
    Write-Host ""
    Write-Host "MERGING..." -ForegroundColor Cyan
    Write-Host "  $branch -> $mainBranch" -ForegroundColor Cyan

    $mergeResult = Invoke-MergeToMain -MainPath $mainPath -MainBranch $mainBranch -FeatureBranch $branch
    if (-not $mergeResult.Pass) {
        if ($mergeResult.Conflict) {
            Write-Blocked -Stage "Merge Conflict" -Error $mergeResult.Error
        } else {
            Write-Blocked -Stage "Merge" -Error $mergeResult.Error
        }
        exit 1
    }

    Write-Host "  Merge commit: $($mergeResult.MergeSha)" -ForegroundColor Green

    # --- Post-Merge Validation (run from main worktree) ---
    $originalDir = Get-Location
    Set-Location $mainPath
    $postMerge = Invoke-PostMergeGates -RepoRoot $mainPath -PackageManager $pm -Mode $Mode
    Set-Location $originalDir

    if (-not $postMerge.Pass) {
        $fail = $postMerge.FirstFail
        Write-Host ""
        Write-Banner "POST-MERGE VALIDATION FAILED"
        Write-Host "Stage:   $($fail.Stage)" -ForegroundColor Red
        Write-Host "Command: $($fail.Command)" -ForegroundColor Red
        Write-Host ""
        Write-Host "Merge completed but MAIN validation failed." -ForegroundColor Red
        Write-Host "Branch:       $branch" -ForegroundColor Yellow
        Write-Host "Merge commit: $($mergeResult.MergeSha)" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Manual rollback:" -ForegroundColor Yellow
        Write-Host "  cd `"$mainPath`"" -ForegroundColor DarkGray
        Write-Host "  git reset --merge ORIG_HEAD   # or: git revert -m 1 $($mergeResult.MergeSha)" -ForegroundColor DarkGray
        Write-Host ""
        exit 1
    }

    Write-Success -Branch $branch -MainBranch $mainBranch
    exit 0

} catch {
    Write-Host ""
    Write-Blocked -Stage "Unexpected Error" -Error $_.Exception.Message
    if ($_.ScriptStackTrace) {
        Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray
    }
    exit 1
} finally {
    if ($lockAcquired -and $repoRoot) {
        $mainPath = (Get-WorktreeInfo -RepoRoot $repoRoot).MainPath
        Remove-IntegrationLock -RepoRoot $mainPath
    }
}
