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
    [Alias("h")]
    [switch]$Help,
    [string]$PidFile = "",
    [string]$OutLog = "",
    [string]$ErrLog = ""
)

$ErrorActionPreference = "Stop"

if ($Help) {
    Write-Output @"
Usage:
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\start-mac-alert-watcher.ps1 [options]
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\start-mac-alert-watcher.ps1 [options]

Common examples:
  # Start the local Windows popup watcher for Mac-side Agent Link alerts.
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\start-mac-alert-watcher.ps1 -Server http://YOUR_BOARD_IP:17888

  # Inspect watcher state as one machine-readable JSON object.
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\start-mac-alert-watcher.ps1 -Status -Json

  # Stop the watcher.
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\start-mac-alert-watcher.ps1 -Stop

Options:
  -Server <url>              Agent Link Board URL. Default: http://127.0.0.1:17888.
  -Token <token>             Optional Agent Link Board token. Not printed in JSON/status output.
  -WatchPattern <regex>      Text used to detect Mac-side events. Default: (?i)mac|macOS.
  -IntervalSeconds <sec>     Poll interval for the background watcher. Default: 15.
  -StaleMinutes <min>        Alert when Mac status is stale for this many minutes. Default: 5.
  -PopupTimeoutSeconds <sec> Windows popup timeout. Default: 0.
  -AlertExistingEvents       Alert on matching existing board events instead of only new ones.
  -NoPopup                   Print alerts without Windows popup/beep output.
  -Status                    Inspect whether the watcher is already running.
  -Stop                      Stop the watcher.
  -Restart                   Stop and start the watcher.
  -Json                      Print one machine-readable JSON object for start/status/stop/restart.
  -PidFile <path>            Override PID file path.
  -OutLog <path>             Override watcher stdout log path.
  -ErrLog <path>             Override watcher stderr log path.
  -Help, -h                  Show this help without starting or stopping the watcher.

Safety:
  -Help never starts or stops the watcher, never contacts the Agent Link Board,
  never prints tokens, and never sends passwords, authentication, input, or
  inject events.
"@
    exit 0
}

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

function Protect-WatcherText {
    param([string]$Text)
    $value = [string]$Text
    if ($Token) {
        $value = $value.Replace($Token, "[redacted-token]")
    }
    return $value
}

function Get-RecentWatcherAlerts {
    param([int]$Limit = 3)

    if (-not (Test-Path $OutLog)) {
        return @()
    }

    $lines = @(Get-Content -Path $OutLog -Tail 240 -ErrorAction SilentlyContinue)
    $alerts = @()
    $current = $null

    foreach ($line in $lines) {
        $text = [string]$line
        if ($text -match '^\[(?<at>[^\]]+)\]\s+ALERT:\s*(?<title>.*)$') {
            if ($null -ne $current) {
                $alerts += $current
            }
            $current = [ordered]@{
                at = Protect-WatcherText $Matches["at"]
                title = Protect-WatcherText $Matches["title"]
                lines = @()
            }
            continue
        }

        if ($null -ne $current -and -not [string]::IsNullOrWhiteSpace($text)) {
            $current.lines += (Protect-WatcherText $text)
        }
    }

    if ($null -ne $current) {
        $alerts += $current
    }

    $formatted = @()
    foreach ($alert in @($alerts | Select-Object -Last $Limit)) {
        $message = (@($alert.lines) | Select-Object -First 3) -join " | "
        $summaryParts = @([string]$alert.title)
        if ($message) {
            $summaryParts += $message
        }
        $formatted += [ordered]@{
            at = [string]$alert.at
            title = [string]$alert.title
            message = [string]$message
            summary = (($summaryParts | Where-Object { $_ }) -join " | ")
        }
    }

    return @($formatted)
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

    $recentAlerts = @(Get-RecentWatcherAlerts)
    $lastAlert = $null
    if ($recentAlerts.Count -gt 0) {
        $lastAlert = $recentAlerts[-1]
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
        recentAlerts = @($recentAlerts)
        lastAlert = $lastAlert
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
