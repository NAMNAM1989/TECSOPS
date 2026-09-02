# Performance gate — static analysis on changed files

$script:PerfPatterns = @(
    @{ Pattern = 'useEffect\s*\(\s*\(\)\s*=>\s*\{[^}]*setInterval'; Message = "setInterval in useEffect without visible cleanup" },
    @{ Pattern = 'useEffect\s*\(\s*\(\)\s*=>\s*\{[^}]*setTimeout'; Message = "setTimeout in useEffect without visible cleanup" },
    @{ Pattern = 'addEventListener'; Message = "addEventListener - verify cleanup in useEffect return" },
    @{ Pattern = '(?m)^\s*["'']use client["'']'; Message = "use client directive - verify server/client boundary" },
    @{ Pattern = 'fetch\s*\([^)]+\)[^;]*;\s*fetch\s*\('; Message = "Duplicate fetch calls in proximity" },
    @{ Pattern = 'import\s+.*exceljs'; Message = "Heavy dependency (exceljs) - verify lazy loading" },
    @{ Pattern = 'import\s+.*recharts'; Message = "Heavy dependency (recharts) - verify lazy loading" },
    @{ Pattern = 'while\s*\(\s*true\s*\)'; Message = "Infinite loop pattern detected" },
    @{ Pattern = 'setInterval\s*\('; Message = "setInterval - verify cleanup on unmount" }
)

function Invoke-PerformanceGate {
    param([string]$RepoRoot)

    $changedFiles = Get-ChangedFiles
    $codeFiles = $changedFiles | Where-Object { $_ -match '\.(tsx?|jsx?|mjs)$' }

    if ($codeFiles.Count -eq 0) {
        return @{
            Pass            = $true
            Findings        = @()
            BaselineStatus  = "PERFORMANCE BASELINE NOT AVAILABLE"
            Recommendations = @()
        }
    }

    $findings = @()
    $recommendations = @()

    foreach ($relPath in $codeFiles) {
        $fullPath = Join-Path $RepoRoot $relPath
        if (-not (Test-Path $fullPath)) { continue }
        $content = Get-Content $fullPath -Raw -ErrorAction SilentlyContinue
        if (-not $content) { continue }

        foreach ($check in $script:PerfPatterns) {
            if ($content -match $check.Pattern) {
                $findings += "${relPath}: $($check.Message)"
            }
        }
    }

    # Bundle baseline check
    $distPath = Join-Path $RepoRoot "dist"
    $baselineStatus = "PERFORMANCE BASELINE NOT AVAILABLE"
    if (Test-Path $distPath) {
        $assets = Get-ChildItem $distPath -Recurse -File -ErrorAction SilentlyContinue
        if ($assets) {
            $totalSize = ($assets | Measure-Object -Property Length -Sum).Sum
            $totalKB = [Math]::Round($totalSize / 1024, 1)
            $baselineStatus = "Bundle size (current dist): ${totalKB} KB - no before/after comparison available"
        }
    }

    if ($findings.Count -gt 0) {
        $recommendations = $findings | ForEach-Object { "Review: $_" }
    }

    return @{
        Pass            = $true
        Findings        = $findings
        BaselineStatus  = $baselineStatus
        Recommendations = $recommendations
    }
}
