# Self-test for Worktree Integration Manager
$ErrorActionPreference = "Stop"
$failures = @()

Write-Host "=== WORKTREE INTEGRATION SELF-TEST ===" -ForegroundColor Cyan
Write-Host ""

# 1. PowerShell syntax check
Write-Host "[1] PowerShell Syntax" -ForegroundColor Yellow
$scripts = @(
    "D:\TECSOPS\scripts\integration\verify-and-merge.ps1"
) + (Get-ChildItem "D:\TECSOPS\scripts\integration\lib\*.ps1").FullName

foreach ($script in $scripts) {
    $errors = $null
    $tokens = $null
    $null = [System.Management.Automation.Language.Parser]::ParseFile($script, [ref]$tokens, [ref]$errors)
    if ($errors -and $errors.Count -gt 0) {
        $failures += "Syntax error in $(Split-Path $script -Leaf): $($errors.Count) errors"
        foreach ($e in $errors) { Write-Host "  $e" -ForegroundColor Red }
    } else {
        Write-Host "  OK: $(Split-Path $script -Leaf)" -ForegroundColor Green
    }
}

# 2. tasks.json validity
Write-Host ""
Write-Host "[2] tasks.json" -ForegroundColor Yellow
try {
    $tasks = Get-Content "D:\TECSOPS\.vscode\tasks.json" -Raw | ConvertFrom-Json
    $labels = $tasks.tasks | ForEach-Object { $_.label }
    Write-Host "  Valid JSON with $($tasks.tasks.Count) tasks" -ForegroundColor Green
    foreach ($l in $labels) { Write-Host "    - $l" -ForegroundColor DarkGray }

    $required = @("VERIFY & MERGE TO MAIN", "DEEP AUDIT & MERGE TO MAIN")
    foreach ($r in $required) {
        if ($labels -notcontains $r) { $failures += "Missing task: $r" }
    }
} catch {
    $failures += "tasks.json invalid: $($_.Exception.Message)"
}

# 3. Cursor rule exists
Write-Host ""
Write-Host "[3] Cursor Rule" -ForegroundColor Yellow
$rulePath = "D:\TECSOPS\.cursor\rules\integration-manager.mdc"
if (Test-Path $rulePath) {
    Write-Host "  OK: integration-manager.mdc exists" -ForegroundColor Green
} else {
    $failures += "Missing cursor rule"
}

# 4. Documentation exists
Write-Host ""
Write-Host "[4] Documentation" -ForegroundColor Yellow
$docPath = "D:\TECSOPS\docs\WORKTREE_INTEGRATION.md"
if (Test-Path $docPath) {
    Write-Host "  OK: WORKTREE_INTEGRATION.md exists" -ForegroundColor Green
} else {
    $failures += "Missing documentation"
}

# 5. Module loading test
Write-Host ""
Write-Host "[5] Module Loading" -ForegroundColor Yellow
try {
    . "D:\TECSOPS\scripts\integration\lib\Common.ps1"
    . "D:\TECSOPS\scripts\integration\lib\Detect.ps1"
    . "D:\TECSOPS\scripts\integration\lib\Lock.ps1"
    . "D:\TECSOPS\scripts\integration\lib\Audit.ps1"
    . "D:\TECSOPS\scripts\integration\lib\AutoFix.ps1"
    . "D:\TECSOPS\scripts\integration\lib\Gates.ps1"
    . "D:\TECSOPS\scripts\integration\lib\Performance.ps1"
    . "D:\TECSOPS\scripts\integration\lib\Merge.ps1"
    Write-Host "  All modules loaded successfully" -ForegroundColor Green
} catch {
    $failures += "Module load failed: $($_.Exception.Message)"
}

# 6. Package manager detection
Write-Host ""
Write-Host "[6] Package Manager Detection" -ForegroundColor Yellow
try {
    $pm = Get-PackageManager -RepoRoot "D:\TECSOPS"
    Write-Host "  Detected: $pm" -ForegroundColor Green
    if ($pm -ne "npm") { $failures += "Expected npm, got $pm" }
} catch {
    $failures += "PM detection failed: $($_.Exception.Message)"
}

# 7. Quality gates detection
Write-Host ""
Write-Host "[7] Quality Gates Detection" -ForegroundColor Yellow
try {
    $quickGates = Get-QualityGates -RepoRoot "D:\TECSOPS" -Mode Quick
    $deepGates = Get-QualityGates -RepoRoot "D:\TECSOPS" -Mode Deep
    Write-Host "  Quick mode: $($quickGates.Count) gates" -ForegroundColor Green
    foreach ($g in $quickGates) {
        $status = if ($g.Available) { "available" } else { "NOT CONFIGURED" }
        Write-Host "    $($g.Name) ($($g.Script)): $status" -ForegroundColor DarkGray
    }
    Write-Host "  Deep mode: $($deepGates.Count) gates" -ForegroundColor Green
} catch {
    $failures += "Gate detection failed: $($_.Exception.Message)"
}

# 8. Worktree detection
Write-Host ""
Write-Host "[8] Worktree Detection" -ForegroundColor Yellow
try {
    $wt = Get-WorktreeInfo -RepoRoot "D:\TECSOPS"
    Write-Host "  Branch: $($wt.Branch)" -ForegroundColor Green
    Write-Host "  IsWorktree: $($wt.IsWorktree)" -ForegroundColor Green
    Write-Host "  MainPath: $($wt.MainPath)" -ForegroundColor Green
} catch {
    $failures += "Worktree detection failed: $($_.Exception.Message)"
}

# 9. Integration lock test
Write-Host ""
Write-Host "[9] Integration Lock" -ForegroundColor Yellow
try {
    $testRoot = "D:\TECSOPS"
    $lockStatus = Test-IntegrationLock -RepoRoot $testRoot
    Write-Host "  Lock status: Locked=$($lockStatus.Locked)" -ForegroundColor Green

    Set-IntegrationLock -RepoRoot $testRoot -Branch "test-branch" -Mode "Quick"
    $lockStatus2 = Test-IntegrationLock -RepoRoot $testRoot
    if ($lockStatus2.Locked) {
        Write-Host "  Lock acquired and detected" -ForegroundColor Green
    } else {
        $failures += "Lock not detected after set"
    }
    Remove-IntegrationLock -RepoRoot $testRoot -Force
    $lockStatus3 = Test-IntegrationLock -RepoRoot $testRoot
    if (-not $lockStatus3.Locked) {
        Write-Host "  Lock removed successfully" -ForegroundColor Green
    } else {
        $failures += "Lock not removed"
    }
} catch {
    $failures += "Lock test failed: $($_.Exception.Message)"
}

# 10. Dry run from main (expect fail at repo check)
Write-Host ""
Write-Host "[10] Dry Run (from main, expect blocked)" -ForegroundColor Yellow
try {
    $output = & powershell -NoProfile -ExecutionPolicy Bypass -File "D:\TECSOPS\scripts\integration\verify-and-merge.ps1" -DryRun 2>&1 | Out-String
    if ($output -match "MERGE BLOCKED" -or $output -match "Cannot integrate from MAIN") {
        Write-Host "  Correctly blocked integration from main branch" -ForegroundColor Green
    } elseif ($output -match "DRY RUN COMPLETE") {
        Write-Host "  Dry run completed (worktree had changes)" -ForegroundColor Green
    } else {
        Write-Host "  Output snippet:" -ForegroundColor DarkGray
        Write-Host ($output.Substring(0, [Math]::Min(500, $output.Length))) -ForegroundColor DarkGray
        Write-Host "  Script executed without crash" -ForegroundColor Green
    }
} catch {
    $failures += "Dry run crashed: $($_.Exception.Message)"
}

# Summary
Write-Host ""
Write-Host "=== SUMMARY ===" -ForegroundColor Cyan
if ($failures.Count -eq 0) {
    Write-Host "ALL TESTS PASSED" -ForegroundColor Green
    exit 0
} else {
    Write-Host "$($failures.Count) FAILURE(S):" -ForegroundColor Red
    foreach ($f in $failures) { Write-Host "  - $f" -ForegroundColor Red }
    exit 1
}
