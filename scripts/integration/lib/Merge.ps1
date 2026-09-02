# Git merge operations with safety checks

function Test-MainClean {
    param(
        [string]$MainPath,
        [string]$MainBranch
    )
    $status = git -C $MainPath status --porcelain 2>$null
    $currentBranch = (git -C $MainPath branch --show-current 2>$null).Trim()

    $issues = @()
    if ($currentBranch -ne $MainBranch) {
        $issues += "Main worktree is on branch '$currentBranch', expected '$MainBranch'"
    }
    if ($status) {
        $issues += "Main worktree has uncommitted changes:`n$status"
    }

    return @{
        Pass   = ($issues.Count -eq 0)
        Issues = $issues
    }
}

function Invoke-CommitWorktree {
    param(
        [string]$RepoRoot,
        [string]$Branch
    )
    $status = git -C $RepoRoot status --porcelain 2>$null
    if (-not $status) {
        return @{ Pass = $true; Committed = $false; Message = "Nothing to commit" }
    }

    git -C $RepoRoot add -A 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        return @{ Pass = $false; Error = "git add failed" }
    }

    $msg = "integrate($Branch): worktree integration commit"
    git -C $RepoRoot commit -m $msg 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        return @{ Pass = $false; Error = "git commit failed" }
    }

    $sha = (git -C $RepoRoot rev-parse --short HEAD 2>$null).Trim()
    return @{ Pass = $true; Committed = $true; Sha = $sha; Message = $msg }
}

function Invoke-MergeToMain {
    param(
        [string]$MainPath,
        [string]$MainBranch,
        [string]$FeatureBranch,
        [switch]$DryRun
    )
    if ($DryRun) {
        return @{
            Pass    = $true
            DryRun  = $true
            Message = "Dry run - merge skipped"
        }
    }

    Set-Location $MainPath

    # Update main
    git -C $MainPath checkout $MainBranch 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        return @{ Pass = $false; Error = "Failed to checkout $MainBranch" }
    }

    git -C $MainPath pull --ff-only origin $MainBranch 2>&1 | Out-Null
    # pull failure is non-fatal if offline

    # Merge feature branch
    $mergeOutput = git -C $MainPath merge $FeatureBranch --no-ff -m "merge($FeatureBranch): integrate worktree changes" 2>&1 | Out-String

    if ($LASTEXITCODE -ne 0) {
        # Check for conflicts
        $conflictFiles = git -C $MainPath diff --name-only --diff-filter=U 2>$null
        if ($conflictFiles) {
            git -C $MainPath merge --abort 2>&1 | Out-Null
            return @{
                Pass            = $false
                Conflict        = $true
                ConflictingFiles = $conflictFiles
                Error           = "MERGE CONFLICT`nConflicting files:`n$($conflictFiles -join "`n")"
            }
        }
        return @{ Pass = $false; Error = "Merge failed: $mergeOutput" }
    }

    $mergeSha = (git -C $MainPath rev-parse --short HEAD 2>$null).Trim()
    return @{
        Pass     = $true
        MergeSha = $mergeSha
        Message  = "Merged $FeatureBranch into $MainBranch"
    }
}

function Invoke-AbortMergeSafe {
    param([string]$RepoRoot)
    $mergeHead = Join-Path (Join-Path $RepoRoot ".git") "MERGE_HEAD"
    if (Test-Path $mergeHead) {
        git -C $RepoRoot merge --abort 2>&1 | Out-Null
        return $true
    }
    return $false
}
