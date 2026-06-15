param(
    [string]$Server = "http://127.0.0.1:17888",
    [string]$Token = "",
    [string]$WatchPattern = "(?i)mac|macOS",
    [int]$IntervalSeconds = 15,
    [int]$StaleMinutes = 5,
    [int]$PopupTimeoutSeconds = 0
)

$ErrorActionPreference = "Stop"

$urgentPatterns = @(
    "NEED_USER_AUTH",
    "USER_ACTION_REQUIRED",
    "BLOCKED_BY_PERMISSION",
    "AUTHORIZATION_REQUIRED",
    "PERMISSION_REQUIRED",
    "\b(HTTP\s*)?502\b",
    "Bad Gateway",
    "Gateway Timeout"
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
    foreach ($pattern in $urgentPatterns) {
        if ($Text -match $pattern) {
            return $true
        }
    }
    return $false
}

function Test-MacRelated {
    param(
        [string]$From = "",
        [string]$Text = "",
        [string]$Role = ""
    )
    return (($From -match $WatchPattern) -or ($Text -match $WatchPattern) -or ($Role -match $WatchPattern))
}

function Show-Alert {
    param(
        [string]$Title,
        [string]$Message
    )

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
Write-Host "Press Ctrl+C to stop."

while ($true) {
    try {
        $state = Get-State

        if (-not $initialized) {
            foreach ($event in @($state.events)) {
                if ($event.id) {
                    $null = $seen.Add("event:" + [string]$event.id)
                }
            }
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

        $statuses = $state.statuses.PSObject.Properties
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
                $updatedAt = [datetimeoffset]::Parse([string]$item.updatedAt)
                $ageMinutes = (([datetimeoffset]::UtcNow - $updatedAt.ToUniversalTime()).TotalMinutes)
                if ($ageMinutes -gt $StaleMinutes) {
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

    Start-Sleep -Seconds $IntervalSeconds
}
