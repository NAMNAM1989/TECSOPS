# Quality gate runner

function Invoke-QualityGates {
    param(
        [string]$RepoRoot,
        [string]$PackageManager,
        [array]$Gates,
        [int]$StartNumber = 4
    )

    $results = @()
    $num = $StartNumber
    $firstFail = $null

    foreach ($gate in $Gates) {
        $num++
        if (-not $gate.Available) {
            Write-StageResult -Number $num -Name $gate.Name -Status "NOT CONFIGURED"
            $results += @{ Gate = $gate; Status = "NOT CONFIGURED" }
            continue
        }

        $run = Get-PackageRunCommand -Manager $PackageManager -Script $gate.Script
        $cmdLine = "$($run.Command) $($run.Args -join ' ')"
        $result = Invoke-CommandChecked -Name $gate.Name -Command $run.Command -Arguments $run.Args

        if ($result.Success) {
            Write-StageResult -Number $num -Name $gate.Name -Status "PASS"
            $results += @{ Gate = $gate; Status = "PASS" }
        } elseif ($gate.Required) {
            Write-StageResult -Number $num -Name $gate.Name -Status "FAIL" -Detail $result.Output.Substring(0, [Math]::Min(200, $result.Output.Length))
            $results += @{ Gate = $gate; Status = "FAIL"; Output = $result.Output; Command = $cmdLine }
            if (-not $firstFail) {
                $firstFail = @{
                    Stage   = $gate.Name
                    Command = $cmdLine
                    Error   = $result.Output
                }
            }
            break
        } else {
            Write-StageResult -Number $num -Name $gate.Name -Status "WARN" -Detail "Optional gate failed"
            $results += @{ Gate = $gate; Status = "WARN"; Output = $result.Output }
        }
    }

    return @{
        Pass      = ($null -eq $firstFail)
        Results   = $results
        FirstFail = $firstFail
        LastNumber = $num
    }
}

function Invoke-PostMergeGates {
    param(
        [string]$RepoRoot,
        [string]$PackageManager,
        [ValidateSet("Quick", "Deep")] [string]$Mode = "Quick"
    )

    Write-Host ""
    Write-Host "POST-MERGE:" -ForegroundColor Cyan

    $postGates = @(
        @{ Name = "Build"; Script = "build"; Required = $true },
        @{ Name = "Critical Tests"; Script = "test"; Required = $true }
    )

    if ($Mode -eq "Quick") {
        $postGates += @{ Name = "E2E Smoke"; Script = "qa:smoke"; Required = $false }
    } else {
        $postGates += @{ Name = "E2E Read-only"; Script = "test:e2e"; Required = $false }
    }

    $allPass = $true
    $firstFail = $null

    foreach ($gate in $postGates) {
        $pkg = Get-Content (Join-Path $RepoRoot "package.json") -Raw | ConvertFrom-Json
        if ($pkg.scripts.PSObject.Properties.Name -notcontains $gate.Script) {
            Write-Host ("{0,-24} NOT CONFIGURED" -f $gate.Name) -ForegroundColor Yellow
            continue
        }

        $run = Get-PackageRunCommand -Manager $PackageManager -Script $gate.Script
        $cmdLine = "$($run.Command) $($run.Args -join ' ')"
        $result = Invoke-CommandChecked -Name $gate.Name -Command $run.Command -Arguments $run.Args

        if ($result.Success) {
            Write-Host ("{0,-24} PASS" -f $gate.Name) -ForegroundColor Green
        } elseif ($gate.Required) {
            Write-Host ("{0,-24} FAIL" -f $gate.Name) -ForegroundColor Red
            $allPass = $false
            if (-not $firstFail) {
                $firstFail = @{ Stage = $gate.Name; Command = $cmdLine; Error = $result.Output }
            }
            break
        } else {
            Write-Host ("{0,-24} WARN" -f $gate.Name) -ForegroundColor Yellow
        }
    }

    return @{ Pass = $allPass; FirstFail = $firstFail }
}
