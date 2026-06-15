param(
    [string]$Server = "http://127.0.0.1:17888",
    [string]$Token = "",
    [string]$WatchPattern = "(?i)mac|macOS",
    [int]$IntervalSeconds = 15,
    [int]$StaleMinutes = 5,
    [int]$PopupTimeoutSeconds = 0,
    [switch]$AlertExistingEvents,
    [switch]$NoPopup,
    [switch]$Once
)

$ErrorActionPreference = "Stop"

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

$urgentPatterns = @(
    "NEED_USER_AUTH",
    "USER_ACTION_REQUIRED",
    "BLOCKED_BY_PERMISSION",
    "AUTHORIZATION_REQUIRED",
    "PERMISSION_REQUIRED",
    "\b(HTTP\s*)?502\b",
    "Bad Gateway",
    "Gateway Timeout",
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
        (Test-ContainsPair -Text $Text -Left $cnInterface -Right $cnTimeout)) {
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
