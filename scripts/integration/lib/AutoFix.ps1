# Safe auto-fix — lint fix only, high-confidence fixes

function Invoke-SafeAutoFix {
    param(
        [string]$RepoRoot,
        [string]$PackageManager
    )

    $fixes = @()
    $errors = @()

    # ESLint auto-fix for src
    $lintSrc = Get-PackageRunCommand -Manager $PackageManager -Script "lint"
    $lintArgs = $lintSrc.Args + @("--", "--fix")
    $result = Invoke-CommandChecked -Name "Lint Fix (src)" -Command $lintSrc.Command -Arguments $lintArgs -AllowFail
    if ($result.Success -or $result.ExitCode -eq 0) {
        $fixes += "ESLint auto-fix (src)"
    } else {
        $errors += "ESLint auto-fix (src) had issues: $($result.Output)"
    }

    # ESLint auto-fix for server
    $lintServer = Get-PackageRunCommand -Manager $PackageManager -Script "lint:server"
    $lintServerArgs = $lintServer.Args + @("--", "--fix")
    $result2 = Invoke-CommandChecked -Name "Lint Fix (server)" -Command $lintServer.Command -Arguments $lintServerArgs -AllowFail
    if ($result2.Success -or $result2.ExitCode -eq 0) {
        $fixes += "ESLint auto-fix (server)"
    } else {
        $errors += "ESLint auto-fix (server) had issues: $($result2.Output)"
    }

    return @{
        Pass   = ($errors.Count -eq 0)
        Fixes  = $fixes
        Errors = $errors
    }
}
