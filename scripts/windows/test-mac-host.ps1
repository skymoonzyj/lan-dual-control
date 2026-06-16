param(
  [string] $HostName = "127.0.0.1",
  [int] $Port = 43770,
  [switch] $Discover,
  [switch] $DiscoverNoLocalSubnets,
  [int] $DiscoverTimeoutMs = 1200,
  [string] $Password = "",
  [switch] $PromptPassword,
  [switch] $RequirePassword,
  [int] $TimeoutMs = 8000,
  [int] $Width = 1920,
  [int] $Height = 1080,
  [int] $Fps = 60,
  [int] $BandwidthKbps = 50000,
  [int] $DurationMs = 0,
  [int] $ObserveVideoMs = 0,
  [int] $ObserveAudioMs = 0,
  [int] $MinVideoFrames = 0,
  [double] $MinVideoFps = 0,
  [int] $MaxVideoGapMs = 0,
  [int] $MinAudioFrames = 0,
  [double] $MinAudioFps = 0,
  [int] $MaxAudioGapMs = 0,
  [switch] $ClipboardText,
  [switch] $ClipboardHostToClient,
  [switch] $ClipboardRoundTrip,
  [switch] $ClipboardFile,
  [int] $ClipboardFileBytes = 96,
  [switch] $InputEvents,
  [string] $InputEventSet = "",
  [switch] $RequireRealVideo,
  [switch] $RequireH264,
  [switch] $RequireAudio,
  [string] $ExpectInputMode = "",
  [string] $ExpectInputInjected = ""
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..\..")
$probeScript = Join-Path $scriptRoot "probe-mac-host.mjs"

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host "[ERROR] node not found"
  exit 1
}

Push-Location $repoRoot
try {
  $nodeArgs = @(
    $probeScript,
    "--port", $Port,
    "--timeoutMs", $TimeoutMs,
    "--width", $Width,
    "--height", $Height,
    "--fps", $Fps,
    "--bandwidthKbps", $BandwidthKbps
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
  if ($DurationMs -gt 0) {
    $nodeArgs += @("--durationMs", $DurationMs)
  }
  if ($ObserveVideoMs -gt 0) {
    $nodeArgs += @("--observeVideoMs", $ObserveVideoMs)
  }
  if ($ObserveAudioMs -gt 0) {
    $nodeArgs += @("--observeAudioMs", $ObserveAudioMs)
  }
  if ($MinVideoFrames -gt 0) {
    $nodeArgs += @("--minVideoFrames", $MinVideoFrames)
  }
  if ($MinVideoFps -gt 0) {
    $nodeArgs += @("--minVideoFps", $MinVideoFps)
  }
  if ($MaxVideoGapMs -gt 0) {
    $nodeArgs += @("--maxVideoGapMs", $MaxVideoGapMs)
  }
  if ($MinAudioFrames -gt 0) {
    $nodeArgs += @("--minAudioFrames", $MinAudioFrames)
  }
  if ($MinAudioFps -gt 0) {
    $nodeArgs += @("--minAudioFps", $MinAudioFps)
  }
  if ($MaxAudioGapMs -gt 0) {
    $nodeArgs += @("--maxAudioGapMs", $MaxAudioGapMs)
  }
  if ($ClipboardText) {
    $nodeArgs += "--clipboardText"
  }
  if ($ClipboardHostToClient) {
    $nodeArgs += "--clipboardHostToClient"
  }
  if ($ClipboardRoundTrip) {
    $nodeArgs += "--clipboardRoundTrip"
  }
  if ($ClipboardFile) {
    $nodeArgs += @("--clipboardFile", "--clipboardFileBytes", $ClipboardFileBytes)
  }
  if ($InputEvents) {
    $nodeArgs += "--inputEvents"
  }
  if ($InputEventSet) {
    $nodeArgs += @("--inputEventSet", $InputEventSet)
  }
  if ($RequireRealVideo) {
    $nodeArgs += "--requireRealVideo"
  }
  if ($RequireH264) {
    $nodeArgs += "--requireH264"
  }
  if ($RequireAudio) {
    $nodeArgs += "--requireAudio"
  }
  if ($ExpectInputMode) {
    $nodeArgs += @("--expectInputMode", $ExpectInputMode)
  }
  if ($ExpectInputInjected) {
    $nodeArgs += @("--expectInputInjected", $ExpectInputInjected)
  }

  & node @nodeArgs
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
