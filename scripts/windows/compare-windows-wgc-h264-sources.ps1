[CmdletBinding()]
param(
  [string] $HostName = "127.0.0.1",
  [int] $Port = 43784,
  [string[]] $Source = @(),
  [string[]] $Profile = @(),
  [string] $Helper = "",
  [int] $Width = 1280,
  [int] $Height = 720,
  [int] $DurationMs = 1800,
  [int] $TimeoutMs = 60000,
  [int] $MinFrames = 1,
  [double] $MinFps = 0,
  [double] $MinFreshFps = 0,
  [double] $MinUniqueHelperFps = 0,
  [double] $MaxRepeatedFrameRatio = 1,
  [int] $MaxGapMs = 10000,
  [int] $MaxFrameAgeMs = 1000,
  [int] $MaxContentAgeMs = 0,
  [switch] $NoResourceSample,
  [switch] $NoResourceSampleTree,
  [switch] $NoRepeatLastFrame,
  [ValidateSet("full", "signal")]
  [string] $RepeatLastFrameMode = "full",
  [string] $H264Encoder = "",
  [switch] $MotionStimulus,
  [ValidateSet("winforms", "browser")]
  [string] $MotionStimulusBackend = "winforms",
  [int] $MotionStimulusWidth = 960,
  [int] $MotionStimulusHeight = 540,
  [int] $MotionStimulusWarmupMs = 1200,
  [string] $MotionStimulusBrowser = "",
  [int] $ProgressIntervalMs = 10000,
  [switch] $SkipBuild,
  [switch] $Json,
  [switch] $BoardSummary,
  [switch] $VerboseOutput,
  [Alias("h")]
  [switch] $Help
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..\..")

function ConvertTo-NodeBool {
  param([bool] $Value)
  if ($Value) { return "true" }
  return "false"
}

if ($Help) {
  Write-Output @"
Usage:
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\compare-windows-wgc-h264-sources.ps1 [options]

Common examples:
  # One-line Agent Link Board summary, safe to paste.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\compare-windows-wgc-h264-sources.ps1 -Profile 60:20000:balanced -DurationMs 1800 -BoardSummary

  # Machine-readable report.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\compare-windows-wgc-h264-sources.ps1 -Json

  # Add a temporary animated window to avoid judging a static desktop only.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\compare-windows-wgc-h264-sources.ps1 -MotionStimulus -BoardSummary

Options:
  -HostName <host>              Local benchmark host bind target. Default: 127.0.0.1.
  -Port <port>                  First temporary host port. Default: 43784.
  -Source <raw-bgra|nv12[]>     Source(s) to compare. Default: raw-bgra,nv12.
  -Profile <fps:kbps:preset[]>  Benchmark profile(s). Default: 60:20000:balanced.
  -Helper <path>                WGC helper executable path.
  -Width <px> -Height <px>      Requested video size. Default: 1280x720.
  -DurationMs <ms>              Per source/profile observation window. Default: 1800.
  -TimeoutMs <ms>               Per child command timeout. Default: 60000.
  -MinFrames <n>                Minimum frames for each source/profile.
  -MinFps <n>                   Minimum received FPS.
  -MinFreshFps <n>              Minimum non-repeated frame FPS.
  -MinUniqueHelperFps <n>       Minimum unique WGC helper source FPS.
  -MaxRepeatedFrameRatio <n>    Maximum repeated frame ratio, 0-1 or 0-100 percent.
  -MaxGapMs <ms>                Maximum receive gap. Default: 10000.
  -MaxFrameAgeMs <ms>           Maximum video_frame timestamp receive age.
  -MaxContentAgeMs <ms>         Maximum repeated content age; 0 disables.
  -NoResourceSample             Disable local host resource sampling.
  -NoResourceSampleTree         Sample only the host process, not child helpers.
  -NoRepeatLastFrame            Disable WGC repeat-last-frame pacing.
  -RepeatLastFrameMode <mode>   full | signal.
  -H264Encoder <name>           H.264 encoder, for example h264_nvenc.
  -MotionStimulus               Open a temporary animated window before each source run.
  -MotionStimulusBackend <name> winforms | browser.
  -MotionStimulusWidth <px>     Animated window width. Default: 960.
  -MotionStimulusHeight <px>    Animated window height. Default: 540.
  -MotionStimulusWarmupMs <ms>  Wait after opening animation. Default: 1200.
  -MotionStimulusBrowser <path> Browser exe for browser motion stimulus.
  -ProgressIntervalMs <ms>      Human progress heartbeat; 0 disables. Default: 10000.
  -SkipBuild                    Do not build the Rust helper before comparing.
  -Json                         Print one machine-readable JSON object.
  -BoardSummary                 Print one secret-free Agent Link Board summary line.
  -VerboseOutput                Include child output on failure.
  -Help, -h                     Show this help without starting benchmarks.

Safety:
  This wrapper may start temporary local Windows host/WGC helper benchmark
  processes when not in -Help mode. It does not connect to Mac, does not
  authenticate a formal remote session, does not ask for or print passwords,
  and does not send input/inject events.
"@
  exit 0
}

$nodeArgs = @(
  "scripts\windows\compare-windows-wgc-h264-sources.mjs",
  "--host", $HostName,
  "--port", [string] $Port,
  "--width", [string] $Width,
  "--height", [string] $Height,
  "--durationMs", [string] $DurationMs,
  "--timeoutMs", [string] $TimeoutMs,
  "--minFrames", [string] $MinFrames,
  "--minFps", [string] $MinFps,
  "--minFreshFps", [string] $MinFreshFps,
  "--minUniqueHelperFps", [string] $MinUniqueHelperFps,
  "--maxRepeatedFrameRatio", [string] $MaxRepeatedFrameRatio,
  "--maxGapMs", [string] $MaxGapMs,
  "--maxFrameAgeMs", [string] $MaxFrameAgeMs,
  "--maxContentAgeMs", [string] $MaxContentAgeMs,
  "--resourceSample", (ConvertTo-NodeBool (-not $NoResourceSample)),
  "--resourceSampleTree", (ConvertTo-NodeBool (-not $NoResourceSampleTree)),
  "--repeatLastFrame", (ConvertTo-NodeBool (-not $NoRepeatLastFrame)),
  "--repeatLastFrameMode", $RepeatLastFrameMode,
  "--motionStimulus", (ConvertTo-NodeBool $MotionStimulus),
  "--motionStimulusBackend", $MotionStimulusBackend,
  "--motionStimulusWidth", [string] $MotionStimulusWidth,
  "--motionStimulusHeight", [string] $MotionStimulusHeight,
  "--motionStimulusWarmupMs", [string] $MotionStimulusWarmupMs,
  "--progressIntervalMs", [string] $ProgressIntervalMs
)

foreach ($item in $Source) {
  if ($item) { $nodeArgs += @("--source", $item) }
}
foreach ($item in $Profile) {
  if ($item) { $nodeArgs += @("--profile", $item) }
}
if ($Helper) { $nodeArgs += @("--helper", $Helper) }
if ($H264Encoder) { $nodeArgs += @("--h264Encoder", $H264Encoder) }
if ($MotionStimulusBrowser) { $nodeArgs += @("--motionStimulusBrowser", $MotionStimulusBrowser) }
if ($SkipBuild) { $nodeArgs += "--skipBuild" }
if ($Json) { $nodeArgs += "--json" }
if ($BoardSummary) { $nodeArgs += "--boardSummary" }
if ($VerboseOutput) { $nodeArgs += "--verbose" }

Push-Location $repoRoot
try {
  & node @nodeArgs
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
