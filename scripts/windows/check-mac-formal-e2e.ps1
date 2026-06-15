param(
  [string] $HostName = "127.0.0.1",
  [int] $Port = 43770,
  [switch] $Discover,
  [switch] $DiscoverNoLocalSubnets,
  [int] $DiscoverTimeoutMs = 1200,
  [string] $Password = "",
  [switch] $PromptPassword,
  [switch] $RequirePassword,
  [switch] $AllowDemoPassword,
  [int] $TimeoutMs = 30000,
  [int] $VideoDurationMs = 300000,
  [int] $AudioDurationMs = 30000,
  [int] $MinVideoFrames = 1200,
  [double] $MinVideoFps = 5,
  [int] $MaxVideoGapMs = 3000,
  [int] $MinAudioFrames = 900,
  [double] $MinAudioFps = 40,
  [int] $MaxAudioGapMs = 1000,
  [int] $Width = 1920,
  [int] $Height = 1080,
  [int] $Fps = 60,
  [int] $BandwidthKbps = 50000,
  [int] $ClientPort = 5197,
  [int] $DebugPort = 9337,
  [switch] $FastProfile,
  [switch] $AllowMockVideo,
  [switch] $SkipProbe,
  [switch] $SkipBrowser,
  [switch] $SkipAudio,
  [switch] $SkipClipboard,
  [switch] $SkipFileClipboard,
  [switch] $SkipInputLog,
  [switch] $PreflightOnly,
  [switch] $CheckClientDiagnostics,
  [switch] $UserAuthRequest,
  [switch] $SendUserAuthRequest,
  [string] $Server = "http://192.168.31.68:17888",
  [switch] $Json,
  [switch] $BoardSummary,
  [switch] $Help
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..\..")
$runnerScript = Join-Path $scriptRoot "check-mac-formal-e2e.mjs"

function Show-Usage {
  Write-Host @"
Usage:
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\check-mac-formal-e2e.ps1 [options]

Common examples:
  scripts\windows\check-mac-formal-e2e.ps1 -Discover -PreflightOnly -BoardSummary
  scripts\windows\check-mac-formal-e2e.ps1 -Discover -PreflightOnly -CheckClientDiagnostics -UserAuthRequest
  scripts\windows\check-mac-formal-e2e.ps1 -Discover -PreflightOnly -CheckClientDiagnostics -SendUserAuthRequest
  scripts\windows\check-mac-formal-e2e.ps1 -Discover -PromptPassword
  scripts\windows\check-mac-formal-e2e.ps1 -Discover -DiscoverNoLocalSubnets -HostName 192.168.31.122 -Port 43770 -PreflightOnly -BoardSummary

This wrapper calls node scripts/windows/check-mac-formal-e2e.mjs. It does not
print passwords and does not enable inject.
"@
}

if ($Help) {
  Show-Usage
  exit 0
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
    "--timeoutMs", $TimeoutMs,
    "--videoDurationMs", $VideoDurationMs,
    "--audioDurationMs", $AudioDurationMs,
    "--minVideoFrames", $MinVideoFrames,
    "--minVideoFps", $MinVideoFps,
    "--maxVideoGapMs", $MaxVideoGapMs,
    "--minAudioFrames", $MinAudioFrames,
    "--minAudioFps", $MinAudioFps,
    "--maxAudioGapMs", $MaxAudioGapMs,
    "--width", $Width,
    "--height", $Height,
    "--fps", $Fps,
    "--bandwidthKbps", $BandwidthKbps,
    "--clientPort", $ClientPort,
    "--debugPort", $DebugPort
  )

  $hostProvided = $PSBoundParameters.ContainsKey("HostName")
  if ((-not $Discover) -or $hostProvided -or $DiscoverNoLocalSubnets) {
    $nodeArgs += @("--host", $HostName)
  }
  if ($Discover) {
    $nodeArgs += "--discover"
  }
  if ($DiscoverNoLocalSubnets) {
    $nodeArgs += "--discoverNoLocalSubnets"
  }
  if ($DiscoverTimeoutMs -gt 0) {
    $nodeArgs += @("--discoverTimeoutMs", $DiscoverTimeoutMs)
  }
  if ($Password) {
    $nodeArgs += @("--password", $Password)
  }
  if ($PromptPassword) {
    $nodeArgs += "--promptPassword"
  }
  if ($RequirePassword) {
    $nodeArgs += "--requirePassword"
  }
  if ($AllowDemoPassword) {
    $nodeArgs += "--allowDemoPassword"
  }
  if ($FastProfile) {
    $nodeArgs += "--fastProfile"
  }
  if ($AllowMockVideo) {
    $nodeArgs += "--allowMockVideo"
  }
  if ($SkipProbe) {
    $nodeArgs += "--skipProbe"
  }
  if ($SkipBrowser) {
    $nodeArgs += "--skipBrowser"
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
  if ($PreflightOnly) {
    $nodeArgs += "--preflightOnly"
  }
  if ($CheckClientDiagnostics) {
    $nodeArgs += "--checkClientDiagnostics"
  }
  if ($UserAuthRequest) {
    $nodeArgs += "--userAuthRequest"
  }
  if ($SendUserAuthRequest) {
    $nodeArgs += @("--sendUserAuthRequest", "--server", $Server)
  }
  if ($Json) {
    $nodeArgs += "--json"
  }
  if ($BoardSummary) {
    $nodeArgs += "--boardSummary"
  }

  & node @nodeArgs
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
