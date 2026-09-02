# Project and environment detection

function Get-PackageManager {
    param([string]$RepoRoot)
    if (Test-Path (Join-Path $RepoRoot "pnpm-lock.yaml")) { return "pnpm" }
    if (Test-Path (Join-Path $RepoRoot "yarn.lock")) { return "yarn" }
    if (Test-Path (Join-Path $RepoRoot "bun.lockb")) { return "bun" }
    if (Test-Path (Join-Path $RepoRoot "package-lock.json")) { return "npm" }
    if (Test-Path (Join-Path $RepoRoot "package.json")) { return "npm" }
    throw "No package manager detected."
}

function Get-PackageRunCommand {
    param([string]$Manager, [string]$Script)
    switch ($Manager) {
        "pnpm" { return @{ Command = "pnpm"; Args = @("run", $Script) } }
        "yarn" { return @{ Command = "yarn"; Args = @($Script) } }
        "bun"  { return @{ Command = "bun"; Args = @("run", $Script) } }
        default { return @{ Command = "npm"; Args = @("run", $Script) } }
    }
}

function Get-MainBranch {
    param([string]$RepoRoot)
    $defaultRef = git -C $RepoRoot symbolic-ref refs/remotes/origin/HEAD 2>$null
    if ($defaultRef -match "origin/(.+)$") { return $Matches[1] }
    $branches = git -C $RepoRoot branch --list main master 2>$null
    if ($branches -match "main") { return "main" }
    if ($branches -match "master") { return "master" }
    return "main"
}

function Get-WorktreeInfo {
    param([string]$RepoRoot)
    $currentPath = (Resolve-Path $RepoRoot).Path
    $lines = git -C $RepoRoot worktree list --porcelain 2>$null
    if (-not $lines) {
        $branch = (git -C $RepoRoot branch --show-current 2>$null).Trim()
        return @{
            Path       = $currentPath
            Branch     = $branch
            IsWorktree = $false
            MainPath   = $currentPath
        }
    }

    $worktrees = @()
    $entry = @{}
    foreach ($line in $lines) {
        if ($line -match "^worktree (.+)$") {
            if ($entry.Count -gt 0) { $worktrees += [PSCustomObject]$entry }
            $entry = @{ Path = $Matches[1] }
        } elseif ($line -match "^branch refs/heads/(.+)$") {
            $entry.Branch = $Matches[1]
        } elseif ($line -eq "bare") {
            $entry.Bare = $true
        } elseif ($line -match "^detached") {
            $entry.Detached = $true
        }
    }
    if ($entry.Count -gt 0) { $worktrees += [PSCustomObject]$entry }

    $current = $worktrees | Where-Object {
        (Resolve-Path $_.Path -ErrorAction SilentlyContinue).Path -eq $currentPath
    } | Select-Object -First 1

    $mainWt = $worktrees | Where-Object { $_.Branch -eq (Get-MainBranch -RepoRoot $RepoRoot) } | Select-Object -First 1
    if (-not $mainWt) { $mainWt = $worktrees | Select-Object -First 1 }

    $branch = if ($current.Branch) { $current.Branch } else { (git -C $RepoRoot branch --show-current).Trim() }

    return @{
        Path       = $currentPath
        Branch     = $branch
        IsWorktree = ($worktrees.Count -gt 1)
        MainPath   = $mainWt.Path
        All        = $worktrees
    }
}

function Get-QualityGates {
    param([string]$RepoRoot, [ValidateSet("Quick", "Deep")] [string]$Mode = "Quick")
    $pkgPath = Join-Path $RepoRoot "package.json"
    if (-not (Test-Path $pkgPath)) { throw "package.json not found." }
    $pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
    $scripts = $pkg.scripts

    $gates = [ordered]@{
        LintSrc    = @{ Name = "Lint (src)"; Script = "lint"; Required = $true }
        LintServer = @{ Name = "Lint (server)"; Script = "lint:server"; Required = $true }
        Typecheck  = @{ Name = "Typecheck"; Script = "typecheck"; Required = $true }
        Test       = @{ Name = "Tests"; Script = "test"; Required = $true }
        Build      = @{ Name = "Build"; Script = "build"; Required = $true }
        DeployCheck = @{ Name = "Deploy Check"; Script = "deploy:check"; Required = $true }
    }

    if ($Mode -eq "Quick") {
        $gates.E2E = @{ Name = "E2E Smoke"; Script = "qa:smoke"; Required = $false }
    } else {
        $gates.E2E = @{ Name = "E2E Read-only"; Script = "test:e2e"; Required = $false }
        $gates.E2EA11y = @{ Name = "E2E A11y"; Script = "test:e2e:a11y"; Required = $false }
    }

    $resolved = @()
    foreach ($key in $gates.Keys) {
        $gate = $gates[$key]
        $scriptName = $gate.Script
        if ($scripts.PSObject.Properties.Name -contains $scriptName) {
            $resolved += [PSCustomObject]@{
                Key      = $key
                Name     = $gate.Name
                Script   = $scriptName
                Required = $gate.Required
                Available = $true
            }
        } else {
            $resolved += [PSCustomObject]@{
                Key      = $key
                Name     = $gate.Name
                Script   = $scriptName
                Required = $gate.Required
                Available = $false
            }
        }
    }
    return $resolved
}

function Get-ProjectInfo {
    param([string]$RepoRoot)
    $pkg = Get-Content (Join-Path $RepoRoot "package.json") -Raw | ConvertFrom-Json
    return @{
        Name            = $pkg.name
        PackageManager  = Get-PackageManager -RepoRoot $RepoRoot
        Framework       = "React + Vite + Express"
        TestFramework   = if ($pkg.devDependencies.vitest) { "Vitest" } else { "Unknown" }
        E2E             = if ($pkg.devDependencies.playwright) { "Playwright" } else { "None" }
        BuildSystem     = "Vite + TypeScript"
    }
}
