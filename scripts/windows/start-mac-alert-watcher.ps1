param(
    [string]$Server = "http://127.0.0.1:17888",
    [string]$Token = "",
    [string]$WatchPattern = "(?i)mac|macOS",
    [int]$IntervalSeconds = 15,
    [int]$StaleMinutes = 5,
    [int]$PopupTimeoutSeconds = 0,
    [switch]$AlertExistingEvents,
    [switch]$NoPopup
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$watcher = Join-Path $PSScriptRoot "watch-codex-link-mac-alerts.ps1"
$logDir = Join-Path $repoRoot ".dev-lab"
$outLog = Join-Path $logDir "mac-alert-watcher.out.log"
$errLog = Join-Path $logDir "mac-alert-watcher.err.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$powerShellExe = "powershell"
if (Get-Command "pwsh" -ErrorAction SilentlyContinue) {
    $powerShellExe = "pwsh"
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
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -PassThru

Write-Host "Mac alert watcher started."
Write-Host ("Process ID: {0}" -f $process.Id)
Write-Host ("Server: {0}" -f $Server)
Write-Host ("PowerShell: {0}" -f $powerShellExe)
Write-Host ("Stale threshold: {0} minute(s)" -f $StaleMinutes)
Write-Host ("Output log: {0}" -f $outLog)
Write-Host ("Error log: {0}" -f $errLog)
