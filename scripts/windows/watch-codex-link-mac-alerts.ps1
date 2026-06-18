param(
    [string]$Server = "http://127.0.0.1:17888",
    [string]$Token = "",
    [string]$WatchPattern = "(?i)mac|macOS",
    [int]$IntervalSeconds = 15,
    [int]$StaleMinutes = 5,
    [int]$PopupTimeoutSeconds = 0,
    [switch]$AlertExistingEvents,
    [switch]$NoPopup,
    [switch]$Once,
    [Alias("h")]
    [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
    Write-Output @"
Usage:
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\watch-codex-link-mac-alerts.ps1 [options]
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\watch-codex-link-mac-alerts.ps1 [options]

Common examples:
  # Watch the LAN Agent Link Board and show Windows-side alerts for Mac requests.
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\watch-codex-link-mac-alerts.ps1 -Server http://YOUR_BOARD_IP:17888

  # Run one no-popup poll for diagnostics.
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\watch-codex-link-mac-alerts.ps1 -Server http://YOUR_BOARD_IP:17888 -Once -NoPopup

Options:
  -Server <url>              Agent Link Board URL. Default: http://127.0.0.1:17888.
  -Token <token>             Optional Agent Link Board token. Never printed.
  -WatchPattern <regex>      Text used to detect Mac-side events. Default: (?i)mac|macOS.
  -IntervalSeconds <sec>     Poll interval. Default: 15.
  -StaleMinutes <min>        Alert when Mac status is stale for this many minutes. Default: 5.
  -PopupTimeoutSeconds <sec> Windows popup timeout. Default: 0.
  -AlertExistingEvents       Alert on already-present matching board events.
  -NoPopup                   Print alerts without Windows popup/beep output.
  -Once                      Run one poll and exit.
  -Help, -h                  Show this help without watching the board.

Safety:
  -Help never contacts the Agent Link Board, never starts the watch loop, never
  shows popups or beeps, never prints tokens, and never sends passwords,
  authentication, input, or inject events.
"@
    exit 0
}

try {
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [Console]::OutputEncoding = $utf8NoBom
    $OutputEncoding = $utf8NoBom
} catch {
}

function ConvertFrom-CodePoints {
    param([int[]]$CodePoints)
    return -join ($CodePoints | ForEach-Object { [char]$_ })
}

$cnNeed = ConvertFrom-CodePoints @(0x9700, 0x8981)
$cnUser = ConvertFrom-CodePoints @(0x7528, 0x6237)
$cnManual = ConvertFrom-CodePoints @(0x4eba, 0x5de5)
$cnConfirm = ConvertFrom-CodePoints @(0x786e, 0x8ba4)
$cnHandle = ConvertFrom-CodePoints @(0x5904, 0x7406)
$cnAuth = ConvertFrom-CodePoints @(0x6388, 0x6743)
$cnPermission = ConvertFrom-CodePoints @(0x6743, 0x9650)
$cnStuck = ConvertFrom-CodePoints @(0x5361, 0x4f4f)
$cnBlocked = ConvertFrom-CodePoints @(0x963b, 0x585e)
$cnMissing = ConvertFrom-CodePoints @(0x7f3a, 0x5931)
$cnFailed = ConvertFrom-CodePoints @(0x5931, 0x8d25)
$cnNetwork = ConvertFrom-CodePoints @(0x7f51, 0x7edc)
$cnRequest = ConvertFrom-CodePoints @(0x8bf7, 0x6c42)
$cnInterface = ConvertFrom-CodePoints @(0x63a5, 0x53e3)
$cnTimeout = ConvertFrom-CodePoints @(0x8d85, 0x65f6)
$cnReverseControl = ConvertFrom-CodePoints @(0x53cd, 0x63a7)
$cnTemporary = ConvertFrom-CodePoints @(0x4e34, 0x65f6)
$cnAllow = ConvertFrom-CodePoints @(0x5141, 0x8bb8)
$cnRetry = ConvertFrom-CodePoints @(0x91cd, 0x8bd5)
$cnOneTime = ConvertFrom-CodePoints @(0x4e00, 0x6b21, 0x6027)

$nonEmptyFindingValuePattern = "(?!none\b|ok\b|0\b|false\b|-\b|$)[^\s;]+"
$findingFieldPattern = "\b(warnings|blockers)\s*[:=]\s*$nonEmptyFindingValuePattern"
$fpsFindingPattern = "fps-limit|mac-host-max-fps|launch-agent-max-fps"
$macClientFormalFindingPattern = "windows-host|video|build|auth|repo"

$urgentPatterns = @(
    "NEED_USER_AUTH",
    "USER_ACTION_REQUIRED",
    "BLOCKED_BY_PERMISSION",
    "AUTHORIZATION_REQUIRED",
    "PERMISSION_REQUIRED",
    "\b(HTTP\s*)?502\b",
    "Bad Gateway",
    "Gateway Timeout",
    "\bLAN008\b",
    "(LAN008|pending-request|ready=false|blocked|failed|$cnTemporary|$cnAllow|$cnAuth|$cnRetry|$cnRequest|$cnNeed).*(WindowsReverseGrant|WindowsOpenOneTimeReverseGrant|ReverseGrant|allow-windows-reverse-control)",
    "(WindowsReverseGrant|WindowsOpenOneTimeReverseGrant|ReverseGrant|allow-windows-reverse-control).*(LAN008|pending-request|ready=false|blocked|failed|$cnTemporary|$cnAllow|$cnAuth|$cnRetry|$cnRequest|$cnNeed)",
    "reverse_control_request",
    "reverse_control_response",
    "(reverse grant|one-time reverse|temporary reverse).*(LAN008|pending|request|retry|waiting|blocked|failed)",
    "MacUnattendedStatus.*(attention=(warning|blocker|failed)|ready=false|$findingFieldPattern)",
    "Mac unattended status.*(attention=(warning|blocker|failed)|ready=false|$findingFieldPattern)",
    "(MacResumeStatus|Mac resume status|check-mac-resume-status).*(ready with warnings|attention=(warning|blocker|failed)|ready=false|$findingFieldPattern)",
    "(MacHostReadiness|Mac host readiness|check-mac-host-readiness).*(ready with warnings|attention=(warning|blocker|failed)|ready=false|$findingFieldPattern)",
    "(MacFormalLocalSmoke|Mac formal local smoke|check-mac-formal-local-smoke|RerunFormalLocalSmoke).*(ready with warnings|blocked|failed|ready=false|$findingFieldPattern)",
    "(MacClientFormalSmoke|Mac client formal smoke|run-mac-client-formal-smoke).*(ready with warnings|blocked|failed|ready=false|$findingFieldPattern)",
    "(MacClient(Readiness|Formal)|Mac client (readiness|formal)|Mac formal E2E status|MacFormalE2EStatus|check-mac-(client-readiness|client-formal-status|formal-e2e-status)).*(ready with warnings|attention=(warning|blocker|failed)|ready=false|$findingFieldPattern)",
    "MacLaunchAgentPlan.*(missing|not-loaded|disabled|failed|enable|install|repair|fix|warning|blocker)",
    "MacHostSafeStart=.*($findingFieldPattern|host-(offline|unreachable)|ready=false)",
    "($findingFieldPattern|host-(offline|unreachable)|ready=false).*MacHostSafeStart=",
    "MacMaxFpsSafeStart=.*($fpsFindingPattern|host-(offline|unreachable)|ready=false)",
    "($fpsFindingPattern|host-(offline|unreachable)|ready=false).*MacMaxFpsSafeStart=",
    "MacClientFormalChecklist=.*($macClientFormalFindingPattern|ready=false|blocked|failed)",
    "($macClientFormalFindingPattern|ready=false|blocked|failed).*MacClientFormalChecklist=",
    "\bwarnings\s*[:=]\s*$nonEmptyFindingValuePattern",
    "\bblockers\s*[:=]\s*$nonEmptyFindingValuePattern",
    "launch-agent-(missing|not-loaded|disabled|failed)",
    "launch agent (missing|not loaded|disabled|failed)",
    "\bpower-(warning|risk|blocked)\b",
    "\bsleep-(risk|blocked|unreachable)\b",
    "\bhost-(offline|unreachable)\b",
    "permission",
    "authorization",
    "authorize"
)

$seen = New-Object 'System.Collections.Generic.HashSet[string]'
$initialized = $false

function Get-State {
    $headers = @{}
    if ($Token) {
        $headers["X-Codex-Link-Token"] = $Token
        $headers["X-Agent-Link-Token"] = $Token
    }
    $uri = ($Server.TrimEnd("/")) + "/api/state"
    Invoke-RestMethod -Method Get -Uri $uri -Headers $headers -TimeoutSec 10
}

function Test-UrgentText {
    param([string]$Text)
    if ([string]::IsNullOrWhiteSpace($Text)) {
        return $false
    }
    foreach ($pattern in $urgentPatterns) {
        if ($Text -match $pattern) {
            return $true
        }
    }
    if ((Test-ContainsPair -Text $Text -Left $cnNeed -Right $cnAuth) -or
        (Test-ContainsPair -Text $Text -Left $cnNeed -Right $cnPermission) -or
        (Test-ContainsPair -Text $Text -Left $cnNeed -Right $cnUser) -or
        (Test-ContainsPair -Text $Text -Left $cnNeed -Right $cnManual) -or
        (Test-ContainsPair -Text $Text -Left $cnNeed -Right $cnConfirm) -or
        (Test-ContainsPair -Text $Text -Left $cnNeed -Right $cnHandle) -or
        (Test-ContainsPair -Text $Text -Left $cnAuth -Right $cnStuck) -or
        (Test-ContainsPair -Text $Text -Left $cnAuth -Right $cnBlocked) -or
        (Test-ContainsPair -Text $Text -Left $cnPermission -Right $cnMissing) -or
        (Test-ContainsPair -Text $Text -Left $cnPermission -Right $cnFailed) -or
        (Test-ContainsPair -Text $Text -Left $cnNetwork -Right $cnFailed) -or
        (Test-ContainsPair -Text $Text -Left $cnRequest -Right $cnTimeout) -or
        (Test-ContainsPair -Text $Text -Left $cnInterface -Right $cnTimeout) -or
        (Test-ContainsPair -Text $Text -Left $cnReverseControl -Right $cnTemporary) -or
        (Test-ContainsPair -Text $Text -Left $cnReverseControl -Right $cnAllow) -or
        (Test-ContainsPair -Text $Text -Left $cnReverseControl -Right $cnRequest) -or
        (Test-ContainsPair -Text $Text -Left $cnReverseControl -Right $cnRetry) -or
        (Test-ContainsPair -Text $Text -Left $cnReverseControl -Right $cnOneTime)) {
        return $true
    }
    return $false
}

function Test-ContainsPair {
    param(
        [string]$Text,
        [string]$Left,
        [string]$Right
    )
    return ($Text.Contains($Left) -and $Text.Contains($Right))
}

function Test-MacRelated {
    param(
        [string]$From = "",
        [string]$Text = "",
        [string]$Role = ""
    )
    return (($From -match $WatchPattern) -or ($Text -match $WatchPattern) -or ($Role -match $WatchPattern))
}

function Test-WindowsRelated {
    param([string]$Text = "")
    return ($Text -match "(?i)windows|Windows Codex|Windows 端|Windows host|windows-host|start-windows-host")
}

function Test-ActiveCall {
    param($Call)
    if (-not $Call) {
        return $false
    }
    $status = ([string]$Call.status).Trim().ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($status)) {
        return $true
    }
    return -not (@("done", "complete", "completed", "clear", "cleared", "cancelled", "canceled", "idle") -contains $status)
}

function Format-CallMessage {
    param($Call)
    $lines = New-Object 'System.Collections.Generic.List[string]'
    foreach ($entry in @(
        @("Status", [string]$Call.status),
        @("From", [string]$Call.from),
        @("Need", [string]$Call.need),
        @("Goal", [string]$Call.goal),
        @("Connection", [string]$Call.connection),
        @("Command", [string]$Call.command),
        @("Expected", [string]$Call.expected),
        @("Ask", [string]$Call.ask),
        @("Updated at", [string]$Call.updatedAt)
    )) {
        if (-not [string]::IsNullOrWhiteSpace($entry[1])) {
            $lines.Add(("{0}: {1}" -f $entry[0], $entry[1])) | Out-Null
        }
    }
    return ($lines -join "`n")
}

function Test-CallNeedsWindowsAttention {
    param($Call)
    if (-not (Test-ActiveCall -Call $Call)) {
        return $false
    }
    $from = [string]$Call.from
    $need = [string]$Call.need
    $text = @(
        [string]$Call.goal,
        [string]$Call.environment,
        [string]$Call.connection,
        [string]$Call.command,
        [string]$Call.expected,
        [string]$Call.actual,
        [string]$Call.blockedBy,
        [string]$Call.ask
    ) -join "`n"
    $needsWindows = (Test-WindowsRelated -Text $need) -or (Test-WindowsRelated -Text $text)
    $fromMacSide = Test-MacRelated -From $from -Text $text
    return ($needsWindows -and $fromMacSide)
}

function Get-AgeMinutes {
    param([string]$Timestamp)
    try {
        $updatedAt = [datetimeoffset]::Parse($Timestamp)
        return (([datetimeoffset]::UtcNow - $updatedAt.ToUniversalTime()).TotalMinutes)
    } catch {
        return $null
    }
}

function Show-Alert {
    param(
        [string]$Title,
        [string]$Message
    )

    if ($NoPopup) {
        return
    }

    try {
        [console]::beep(880, 180)
        Start-Sleep -Milliseconds 80
        [console]::beep(660, 180)
        Start-Sleep -Milliseconds 80
        [console]::beep(880, 220)
    } catch {
    }

    try {
        $shell = New-Object -ComObject WScript.Shell
        $null = $shell.Popup($Message, $PopupTimeoutSeconds, $Title, 0x30)
    } catch {
        Write-Warning $Message
    }
}

function Add-AlertOnce {
    param(
        [string]$Id,
        [string]$Title,
        [string]$Message
    )
    if ($seen.Contains($Id)) {
        return
    }
    $null = $seen.Add($Id)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp] ALERT: $Title"
    Write-Host $Message
    Show-Alert -Title $Title -Message $Message
}

Write-Host "Watching Mac-side Agent Link alerts from $Server"
Write-Host "Pattern: $WatchPattern"
Write-Host "Stale threshold: $StaleMinutes minute(s)"
if ($AlertExistingEvents) {
    Write-Host "Existing matching events will be alerted."
} else {
    Write-Host "Existing events are treated as already seen."
}
if ($NoPopup) {
    Write-Host "Popup/beep output is disabled; alerts are printed only."
}
Write-Host "Press Ctrl+C to stop."

while ($true) {
    try {
        $state = Get-State

        if ((-not $initialized) -and (-not $AlertExistingEvents)) {
            foreach ($event in @($state.events)) {
                if ($event.id) {
                    $null = $seen.Add("event:" + [string]$event.id)
                }
            }
        }
        if (-not $initialized) {
            $initialized = $true
        }

        if (Test-CallNeedsWindowsAttention -Call $state.currentCall) {
            $callId = [string]$state.currentCall.updatedAt
            if ([string]::IsNullOrWhiteSpace($callId)) {
                $callId = [string]$state.currentCall.startedAt
            }
            if ([string]::IsNullOrWhiteSpace($callId)) {
                $callId = [string]$state.currentCall.goal
            }
            Add-AlertOnce `
                -Id ("call-windows:" + $callId) `
                -Title ("Agent Link call needs Windows attention - " + [string]$state.currentCall.from) `
                -Message (Format-CallMessage -Call $state.currentCall)
        }

        foreach ($event in @($state.events)) {
            $text = [string]$event.text
            $from = [string]$event.from
            if (-not (Test-MacRelated -From $from -Text $text)) {
                continue
            }
            if (-not (Test-UrgentText -Text $text)) {
                continue
            }

            Add-AlertOnce `
                -Id ("event:" + [string]$event.id) `
                -Title ("Mac side needs attention - " + $from) `
                -Message ($text + "`n`nSource: " + $from + "`nTime: " + [string]$event.at)
        }

        $statuses = @()
        if ($state.statuses) {
            $statuses = $state.statuses.PSObject.Properties
        }
        foreach ($entry in @($statuses)) {
            $device = [string]$entry.Name
            $item = $entry.Value
            $role = [string]$item.role
            $note = [string]$item.note
            $status = ([string]$item.status).ToLowerInvariant()
            if (-not (Test-MacRelated -From $device -Role $role)) {
                continue
            }

            $statusText = "$status`: $note"
            if (($status -eq "blocked") -or (Test-UrgentText -Text $statusText)) {
                Add-AlertOnce `
                    -Id ("status-urgent:" + $device + ":" + [string]$item.updatedAt) `
                    -Title ("Mac side status alert - " + $device) `
                    -Message ($statusText + "`n`nUpdated at: " + [string]$item.updatedAt)
            }

            if (@("coding", "testing", "waiting", "ready") -contains $status) {
                $ageMinutes = Get-AgeMinutes -Timestamp ([string]$item.updatedAt)
                if (($null -ne $ageMinutes) -and ($ageMinutes -gt $StaleMinutes)) {
                    Add-AlertOnce `
                        -Id ("stale:" + $device + ":" + [string]$item.updatedAt + ":" + $StaleMinutes) `
                        -Title ("Mac side may be stuck - " + $device) `
                        -Message ("Mac side has not updated for more than {0} minute(s).`nStatus: {1}`nNote: {2}`nUpdated at: {3}`n`nPossible causes: 502, permission prompt, network error, or a stuck Codex task. Please check the Mac Codex window." -f $StaleMinutes, $status, $note, [string]$item.updatedAt)
                }
            }
        }
    } catch {
        Add-AlertOnce `
            -Id ("watcher-error:" + (Get-Date -Format "yyyyMMddHHmm")) `
            -Title "Agent Link watcher error" `
            -Message ("Could not read Agent Link Board: {0}`nServer: {1}" -f $_.Exception.Message, $Server)
    }

    if ($Once) {
        break
    }

    Start-Sleep -Seconds $IntervalSeconds
}
