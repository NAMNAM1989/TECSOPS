# Git diff audit — secrets, debug code, scope validation

$script:SecretPatterns = @(
    '(?i)(api[_-]?key\s*[:=]\s*["''][a-zA-Z0-9_\-]{16,})',
    '(?i)(password\s*[:=]\s*["''][^"'']{4,})',
    '(?i)(secret\s*[:=]\s*["''][a-zA-Z0-9_\-]{8,})',
    '(?i)(token\s*[:=]\s*["''][a-zA-Z0-9_\-\.]{16,})',
    '(?i)(Bearer\s+[a-zA-Z0-9_\-\.]{20,})',
    '(?i)(sk-[a-zA-Z0-9]{20,})',
    '(?i)(ghp_[a-zA-Z0-9]{20,})',
    '(?i)(AKIA[A-Z0-9]{16})'
)

$script:DebugPatterns = @(
    '\bconsole\.(log|debug|info|warn)\(',
    '\bdebugger\b',
    '\bTODO:\s*remove\b',
    '\bFIXME:\s*temp',
    '\bHACK:',
    '\bXXX:'
)

function Invoke-DiffAudit {
    param([string]$RepoRoot)

    $findings = @()
    $changedFiles = Get-ChangedFiles

    if ($changedFiles.Count -eq 0) {
        return @{
            Pass     = $true
            Findings = @("No uncommitted changes detected.")
            Files    = @()
        }
    }

    foreach ($relPath in $changedFiles) {
        $fullPath = Join-Path $RepoRoot $relPath
        if (-not (Test-Path $fullPath)) { continue }
        if ((Get-Item $fullPath).PSIsContainer) { continue }

        $ext = [System.IO.Path]::GetExtension($relPath).ToLower()
        $textExts = @(".ts", ".tsx", ".js", ".jsx", ".mjs", ".json", ".env", ".md", ".yml", ".yaml", ".toml")
        if ($textExts -notcontains $ext) { continue }

        $content = Get-Content $fullPath -Raw -ErrorAction SilentlyContinue
        if (-not $content) { continue }

        foreach ($pattern in $script:SecretPatterns) {
            if ($content -match $pattern) {
                $findings += "SECRET SUSPECT: $relPath matches credential pattern"
            }
        }

        if ($ext -in @(".ts", ".tsx", ".js", ".jsx", ".mjs")) {
            foreach ($pattern in $script:DebugPatterns) {
                if ($content -match $pattern) {
                    $findings += "DEBUG CODE: $relPath contains debug/temp marker"
                    break
                }
            }
        }

        if ($relPath -eq "package.json") {
            $findings += "DEPENDENCY CHANGE: package.json modified - review carefully"
        }
    }

    $critical = $findings | Where-Object { $_ -match "SECRET SUSPECT" }
    return @{
        Pass     = ($critical.Count -eq 0)
        Findings = $findings
        Files    = $changedFiles
        Critical = $critical
    }
}

function Test-RepositorySafety {
    param(
        [string]$RepoRoot,
        [string]$Branch,
        [string]$MainBranch
    )
    $issues = @()

    if ($Branch -eq $MainBranch) {
        $issues += "Cannot integrate from MAIN branch itself. Use a feature worktree branch."
    }

    $status = git -C $RepoRoot status --porcelain 2>$null
    if (-not $status) {
        $issues += "No changes to integrate. Worktree appears clean."
    }

    $insideMerge = Test-Path (Join-Path (Join-Path $RepoRoot ".git") "MERGE_HEAD")
    if ($insideMerge) {
        $issues += "Repository is in merge state. Resolve or abort before integration."
    }

    $insideRebase = (Test-Path (Join-Path (Join-Path $RepoRoot ".git") "rebase-merge")) -or
                    (Test-Path (Join-Path (Join-Path $RepoRoot ".git") "rebase-apply"))
    if ($insideRebase) {
        $issues += "Repository is in rebase state. Resolve or abort before integration."
    }

    return @{
        Pass   = ($issues.Count -eq 0)
        Issues = $issues
    }
}
