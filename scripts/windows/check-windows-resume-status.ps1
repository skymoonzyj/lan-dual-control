param(
  [string] $HostName = "127.0.0.1",
  [int] $Port = 43770,
  [switch] $Discover,
  [switch] $NoDiscover,
  [switch] $DiscoverNoLocalSubnets,
  [int] $DiscoverTimeoutMs = 1200,
  [int] $TimeoutMs = 12000,
  [string] $Server = "http://192.168.31.68:17888",
  [switch] $CheckBoard,
  [switch] $CheckClientDiagnostics,
  [switch] $AllowMockVideo,
  [switch] $SkipAudio,
  [switch] $SkipClipboard,
  [switch] $SkipFileClipboard,
  [switch] $SkipInputLog,
  [switch] $RequireClean,
  [switch] $RequireMacReady,
  [switch] $Json,
  [switch] $BoardSummary,
  [switch] $UserAuthRequest,
  [switch] $SendUserAuthRequest,
  [Alias("h")]
  [switch] $Help
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..\..")
$runnerScript = Join-Path $scriptRoot "check-windows-resume-status.mjs"

function Show-Usage {
  Write-Host @"
Usage:
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\check-windows-resume-status.ps1 [options]

Common examples:
  scripts\windows\check-windows-resume-status.ps1 -CheckBoard -BoardSummary
  scripts\windows\check-windows-resume-status.ps1 -CheckBoard -CheckClientDiagnostics -BoardSummary
  scripts\windows\check-windows-resume-status.ps1 -CheckBoard -CheckClientDiagnostics -UserAuthRequest
  scripts\windows\check-windows-resume-status.ps1 -CheckBoard -CheckClientDiagnostics -SendUserAuthRequest
  scripts\windows\check-windows-resume-status.ps1 -DiscoverNoLocalSubnets -HostName 192.168.31.122 -Port 43770 -Json
  scripts\windows\check-windows-resume-status.ps1 -NoDiscover -HostName 127.0.0.1 -Port 9 -Json -RequireMacReady

This wrapper calls node scripts/windows/check-windows-resume-status.mjs. It is
read-only: it does not authenticate a WebSocket, does not ask for or print
passwords, does not send input, and does not execute inject.

When -CheckBoard is set, the report also summarizes the current Agent Link
call so Windows can see active Mac -> Windows test requests during resume.
The report also includes a Windows host media baseline command:
node scripts/windows/check-windows-host-readiness.mjs --checkBoard --probeMedia --boardSummary
It also includes a secret-free Mac host discovery command:
node scripts/windows/discover-lan-hosts.mjs --noLocalSubnets --host <Mac IP> --port 43770 --requireMacHost --boardSummary
PowerShell equivalent:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/discover-lan-hosts.ps1 -NoLocalSubnets -HostName <Mac IP> -Port 43770 -RequireMacHost -BoardSummary
It also includes the Windows -> Mac formal manual checklist command:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-mac-formal-e2e.ps1 -Discover -DiscoverNoLocalSubnets -HostName <Mac IP> -Port 43770 -PreflightOnly -CheckClientDiagnostics -BoardSummary
The board summary labels it as:
ManualChecklist=connection/video/audio/clipboard/input_ack/diagnostics
It also includes a Windows local one-time reverse-control grant command:
node scripts/windows/allow-windows-reverse-control.mjs --host 127.0.0.1 --port 43770 --durationMs 30000 --boardSummary
PowerShell 7 equivalent:
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770 -DurationMs 30000 -BoardSummary
It also includes a one-line no-password Windows client diagnostics command:
node scripts/windows/test-windows-client-browser.mjs --discover --diagnosticsOnly --boardSummary --timeoutMs 45000
It also includes a read-only Windows video encoder/WGC/WebCodecs support command:
node scripts/windows/check-windows-video-encoder-support.mjs --boardSummary
It also includes Windows PowerShell help coverage commands:
node scripts/windows/test-windows-powershell-help.mjs --timeoutMs 10000 --boardSummary
node scripts/windows/test-windows-powershell-help.mjs --shell pwsh --timeoutMs 10000 --boardSummary
Use that first for Agent Link Board, then use the page Event Log "复制诊断"
action when the full "快速摘要" report is needed.
JSON and human output also include Windows local Mac alert watcher commands:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/start-mac-alert-watcher.ps1 -Server $Server
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/start-mac-alert-watcher.ps1 -Server $Server -Status
The Node report also checks the watcher status read-only and does not start it.
"@
}

if ($Help) {
  Show-Usage
  exit 0
}

if ($Discover -and $NoDiscover) {
  Write-Host "[ERROR] Use either -Discover or -NoDiscover, not both."
  exit 1
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host "[ERROR] node not found"
  exit 1
}

Push-Location $repoRoot
try {
  $nodeArgs = @(
    $runnerScript,
    "--port", $Port,
    "--discoverTimeoutMs", $DiscoverTimeoutMs,
    "--timeoutMs", $TimeoutMs,
    "--server", $Server
  )

  $hostProvided = $PSBoundParameters.ContainsKey("HostName")
  if ($NoDiscover -or $hostProvided -or $DiscoverNoLocalSubnets) {
    $nodeArgs += @("--host", $HostName)
  }
  if ($Discover) {
    $nodeArgs += "--discover"
  }
  if ($NoDiscover) {
    $nodeArgs += "--noDiscover"
  }
  if ($DiscoverNoLocalSubnets) {
    $nodeArgs += "--discoverNoLocalSubnets"
  }
  if ($CheckBoard) {
    $nodeArgs += "--checkBoard"
  }
  if ($CheckClientDiagnostics) {
    $nodeArgs += "--checkClientDiagnostics"
  }
  if ($AllowMockVideo) {
    $nodeArgs += "--allowMockVideo"
  }
  if ($SkipAudio) {
    $nodeArgs += "--skipAudio"
  }
  if ($SkipClipboard) {
    $nodeArgs += "--skipClipboard"
  }
  if ($SkipFileClipboard) {
    $nodeArgs += "--skipFileClipboard"
  }
  if ($SkipInputLog) {
    $nodeArgs += "--skipInputLog"
  }
  if ($RequireClean) {
    $nodeArgs += "--requireClean"
  }
  if ($RequireMacReady) {
    $nodeArgs += "--requireMacReady"
  }
  if ($Json) {
    $nodeArgs += "--json"
  }
  if ($BoardSummary) {
    $nodeArgs += "--boardSummary"
  }
  if ($UserAuthRequest) {
    $nodeArgs += "--userAuthRequest"
  }
  if ($SendUserAuthRequest) {
    $nodeArgs += "--sendUserAuthRequest"
  }

  & node @nodeArgs
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
