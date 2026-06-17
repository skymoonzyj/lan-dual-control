param(
    [string]$Server = "http://127.0.0.1:17888",
    [string]$Token = "",
    [string]$WatchPattern = "(?i)mac|macOS",
    [int]$IntervalSeconds = 15,
    [int]$StaleMinutes = 5,
    [int]$PopupTimeoutSeconds = 0,
    [switch]$AlertExistingEvents,
    [switch]$NoPopup,
    [switch]$Status,
    [switch]$Stop,
    [switch]$Restart,
    [switch]$Json,
    [string]$PidFile = "",
    [string]$OutLog = "",
    [string]$ErrLog = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$watcher = Join-Path $PSScriptRoot "watch-codex-link-mac-alerts.ps1"
$logDir = Join-Path $repoRoot ".dev-lab"
if (-not $OutLog) {
    $OutLog = Join-Path $logDir "mac-alert-watcher.out.log"
}
if (-not $ErrLog) {
    $ErrLog = Join-Path $logDir "mac-alert-watcher.err.log"
}
if (-not $PidFile) {
    $PidFile = Join-Path $logDir "mac-alert-watcher.pid"
}

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$powerShellExe = "powershell"
if (Get-Command "pwsh" -ErrorAction SilentlyContinue) {
    $powerShellExe = "pwsh"
}

function Get-WatcherProcesses {
    $items = @{}
    if (Test-Path $PidFile) {
        $rawPid = (Get-Content -Path $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
        $processId = 0
        if ([int]::TryParse([string]$rawPid, [ref]$processId)) {
            $pidMatch = Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $processId) -ErrorAction SilentlyContinue
            if ($pidMatch) {
                $items[[string]$pidMatch.ProcessId] = $pidMatch
            }
        } else {
            Remove-Item -Path $PidFile -Force -ErrorAction SilentlyContinue
        }
    }

    $scriptPath = [string]$watcher
    $serverText = [string]$Server
    $byCommandLine = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            $_.CommandLine -and
            $_.CommandLine.Contains($scriptPath) -and
            $_.CommandLine.Contains($serverText)
        }
    foreach ($item in @($byCommandLine)) {
        $items[[string]$item.ProcessId] = $item
    }

    if ($items.Count -eq 0) {
        Remove-Item -Path $PidFile -Force -ErrorAction SilentlyContinue
    }

    return @($items.Values | Sort-Object ProcessId)
}

function Show-WatcherStatus {
    $existing = @(Get-WatcherProcesses)
    if ($Json) {
        $message = "Mac alert watcher is not running."
        if ($existing.Count -gt 0) {
            $message = "Mac alert watcher is running."
        }
        Write-WatcherJson -Action "status" -Processes $existing -Message $message
        return
    }
    if ($existing.Count -gt 0) {
        Write-Host "Mac alert watcher is running."
        foreach ($item in $existing) {
            Write-Host ("Process ID: {0}" -f $item.ProcessId)
            Write-Host ("Started: {0}" -f $item.CreationDate)
        }
    } else {
        Write-Host "Mac alert watcher is not running."
    }
    Write-Host ("Server: {0}" -f $Server)
    Write-Host ("PID file: {0}" -f $PidFile)
    Write-Host ("Output log: {0}" -f $OutLog)
    Write-Host ("Error log: {0}" -f $ErrLog)
}

function New-WatcherJsonPayload {
    param(
        [string]$Action,
        [array]$Processes = @(),
        [bool]$Ok = $true,
        [bool]$Started = $false,
        [bool]$Reused = $false,
        [array]$StoppedProcessIds = @(),
        [string]$Message = ""
    )

    $processIds = @()
    $startedAt = @()
    foreach ($item in @($Processes)) {
        if ($null -ne $item.ProcessId) {
            $processIds += [int]$item.ProcessId
        }
        if ($item.CreationDate) {
            $startedAt += [string]$item.CreationDate
        }
    }

    return [ordered]@{
        ok = $Ok
        action = $Action
        running = ($processIds.Count -gt 0)
        started = $Started
        reused = $Reused
        stoppedProcessIds = @($StoppedProcessIds)
        processIds = @($processIds)
        processStartedAt = @($startedAt)
        server = [string]$Server
        pidFile = [string]$PidFile
        outLog = [string]$OutLog
        errLog = [string]$ErrLog
        powerShell = [string]$powerShellExe
        message = [string]$Message
    }
}

function Write-WatcherJson {
    param(
        [string]$Action,
        [array]$Processes = @(),
        [bool]$Ok = $true,
        [bool]$Started = $false,
        [bool]$Reused = $false,
        [array]$StoppedProcessIds = @(),
        [string]$Message = ""
    )
    New-WatcherJsonPayload `
        -Action $Action `
        -Processes $Processes `
        -Ok $Ok `
        -Started $Started `
        -Reused $Reused `
        -StoppedProcessIds $StoppedProcessIds `
        -Message $Message |
        ConvertTo-Json -Depth 6
}

function Stop-WatcherProcess {
    param(
        [switch]$SuppressJson
    )
    $existing = @(Get-WatcherProcesses)
    $stoppedProcessIds = @()
    if ($existing.Count -eq 0) {
        if ($Json -and (-not $SuppressJson)) {
            Write-WatcherJson -Action "stop" -Processes @() -StoppedProcessIds @() -Message "Mac alert watcher is not running."
            return
        }
        Write-Host "Mac alert watcher is not running."
        return
    }
    foreach ($item in $existing) {
        $stoppedProcessIds += [int]$item.ProcessId
        Stop-Process -Id $item.ProcessId -Force -ErrorAction SilentlyContinue
        if (-not $Json) {
            Write-Host ("Mac alert watcher stopped. Process ID: {0}" -f $item.ProcessId)
        }
    }
    Remove-Item -Path $PidFile -Force -ErrorAction SilentlyContinue
    if ($Json -and (-not $SuppressJson)) {
        Write-WatcherJson -Action "stop" -Processes @() -StoppedProcessIds $stoppedProcessIds -Message "Mac alert watcher stopped."
    }
}

if ($Status) {
    Show-WatcherStatus
    return
}

if ($Stop -and (-not $Restart)) {
    Stop-WatcherProcess
    return
}

if ($Restart) {
    Stop-WatcherProcess -SuppressJson
} else {
    $existing = @(Get-WatcherProcesses)
    if ($existing.Count -gt 0) {
        if ($Json) {
            Write-WatcherJson -Action "start" -Processes $existing -Reused $true -Message "Mac alert watcher is already running."
            return
        }
        Write-Host "Mac alert watcher is already running."
        foreach ($item in $existing) {
            Write-Host ("Process ID: {0}" -f $item.ProcessId)
        }
        Write-Host ("Use -Restart to restart it, -Stop to stop it, or -Status to inspect it.")
        Write-Host ("Output log: {0}" -f $OutLog)
        Write-Host ("Error log: {0}" -f $ErrLog)
        return
    }
}

$arguments = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $watcher,
    "-Server", $Server,
    "-WatchPattern", $WatchPattern,
    "-IntervalSeconds", [string]$IntervalSeconds,
    "-StaleMinutes", [string]$StaleMinutes,
    "-PopupTimeoutSeconds", [string]$PopupTimeoutSeconds
)

if ($Token) {
    $arguments += @("-Token", $Token)
}
if ($AlertExistingEvents) {
    $arguments += "-AlertExistingEvents"
}
if ($NoPopup) {
    $arguments += "-NoPopup"
}

$process = Start-Process `
    -FilePath $powerShellExe `
    -ArgumentList $arguments `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $OutLog `
    -RedirectStandardError $ErrLog `
    -PassThru

Set-Content -Path $PidFile -Value ([string]$process.Id) -Encoding UTF8
$actualProcesses = @()
for ($attempt = 0; $attempt -lt 10; $attempt++) {
    $actualProcesses = @(Get-WatcherProcesses)
    if ($actualProcesses.Count -gt 0) {
        break
    }
    Start-Sleep -Milliseconds 200
}
if ($actualProcesses.Count -gt 0) {
    Set-Content -Path $PidFile -Value ([string]$actualProcesses[0].ProcessId) -Encoding UTF8
}

if ($Json) {
    $jsonAction = if ($Restart) { "restart" } else { "start" }
    Write-WatcherJson -Action $jsonAction -Processes $actualProcesses -Started $true -Message "Mac alert watcher started."
    return
}

Write-Host "Mac alert watcher started."
if ($actualProcesses.Count -gt 0) {
    foreach ($item in $actualProcesses) {
        Write-Host ("Process ID: {0}" -f $item.ProcessId)
    }
} else {
    Write-Host ("Process ID: {0}" -f $process.Id)
}
Write-Host ("Server: {0}" -f $Server)
Write-Host ("PowerShell: {0}" -f $powerShellExe)
Write-Host ("Stale threshold: {0} minute(s)" -f $StaleMinutes)
Write-Host ("PID file: {0}" -f $PidFile)
Write-Host ("Output log: {0}" -f $OutLog)
Write-Host ("Error log: {0}" -f $ErrLog)
