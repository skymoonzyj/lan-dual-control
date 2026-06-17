[CmdletBinding()]
param(
  [ValidateSet("default", "deploy", "deep")]
  [string] $Profile = "default",
  [string] $HostName = "0.0.0.0",
  [int] $Port = 43770,
  [string] $Ffmpeg = "",
  [int] $TimeoutMs = 20000,
  [int] $MaxVideoFrameAgeMs = 1000,
  [int] $MaxAudioFrameAgeMs = 1000,
  [switch] $RequireWgc,
  [switch] $ProbeHost,
  [switch] $ProbeMedia,
  [switch] $ProbeVideo,
  [switch] $ProbeAudio,
  [switch] $ProbeClipboardSecurity,
  [switch] $ProbeWgcH264Sources,
  [string] $ExpectBuildId = "",
  [switch] $RequireCurrentBuildId,
  [switch] $SkipCurrentBuildCheck,
  [switch] $RequireOpen,
  [switch] $Strict,
  [string] $Server = "http://192.168.31.68:17888",
  [switch] $CheckBoard,
  [switch] $BoardSummary,
  [switch] $Json,
  [Alias("h")]
  [switch] $Help,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $ExtraArgs
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..\..")

if ($Help) {
  Write-Output @"
Usage:
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\check-windows-host-readiness.ps1 [options]

Common examples:
  # One-line Agent Link Board summary, safe to paste.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\check-windows-host-readiness.ps1 -CheckBoard -BoardSummary

  # Machine-readable readiness report for desktop shells or scripts.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\check-windows-host-readiness.ps1 -CheckBoard -Json

  # Deployment gate when Windows host is already running.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\check-windows-host-readiness.ps1 -Profile deploy -CheckBoard

  # Media baseline summary before Mac controls this Windows host.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\check-windows-host-readiness.ps1 -ProbeMedia -BoardSummary

Options:
  -Profile <name>             default, deploy, or deep. Default: default.
  -HostName <host>            Windows host bind/probe host. Default: 0.0.0.0.
  -Port <port>                Windows host port. Default: 43770.
  -Ffmpeg <path>              FFmpeg path. Defaults to LAN_DUAL_FFMPEG,
                              C:\DevTools\ffmpeg\bin\ffmpeg.exe, then PATH.
  -TimeoutMs <ms>             Timeout passed to child readiness checks. Default: 20000.
  -MaxVideoFrameAgeMs <ms>    Video frame freshness limit for explicit video probes.
  -MaxAudioFrameAgeMs <ms>    Audio frame freshness limit for explicit audio probes.
  -RequireWgc                 Fail if Windows Graphics Capture preflight is unsupported.
  -ProbeHost                  Run Windows host PowerShell self-test.
  -ProbeMedia                 Run combined Windows host video + audio media baseline.
  -ProbeVideo                 Run short Windows host video observer.
  -ProbeAudio                 Run short WASAPI audio observer. Does not play a tone.
  -ProbeClipboardSecurity     Run Windows host file clipboard abuse regression.
  -ProbeWgcH264Sources        Run short WGC H.264 raw-bgra vs NV12 source comparison.
  -ExpectBuildId <id>         Require running host runtime.buildId to equal this value.
  -RequireCurrentBuildId      Require running host runtime.buildId to match current git.
  -SkipCurrentBuildCheck      Do not warn when running host build differs from current git.
  -RequireOpen                Require LAN/firewall port probe to be open.
  -Strict                     Treat warnings as failure.
  -Server <url>               Agent Link Board URL.
  -CheckBoard                 Read Agent Link Board currentCall.
  -BoardSummary               Print one secret-free Agent Link Board summary line.
  -Json                       Print one machine-readable JSON object.
  -Help, -h                   Show this help without running checks.

Status summaries include:
  WindowsHostMedia=node scripts/windows/check-windows-host-readiness.mjs --checkBoard --probeMedia --boardSummary
  WindowsVideoSupport=node scripts/windows/check-windows-video-encoder-support.mjs --boardSummary
  ReverseGrant=node scripts/windows/allow-windows-reverse-control.mjs --host 127.0.0.1 --port <port> --durationMs 30000 --boardSummary
  ReverseGrantPs=pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port <port> -DurationMs 30000 -BoardSummary

Safety:
  -Help, default checks, -Json, and -BoardSummary do not ask for or print
  passwords, do not authenticate remote WebSockets, and do not send input/inject
  events. Explicit probe/profile options may start local test helpers or require
  an already running Windows host, but they still do not use a formal password.
"@
  exit 0
}

$nodeArgs = @(
  "scripts\windows\check-windows-host-readiness.mjs",
  "--profile", $Profile,
  "--host", $HostName,
  "--port", [string] $Port,
  "--timeoutMs", [string] $TimeoutMs
)

if ($PSBoundParameters.ContainsKey("MaxVideoFrameAgeMs")) {
  $nodeArgs += @("--maxVideoFrameAgeMs", [string] $MaxVideoFrameAgeMs)
}
if ($PSBoundParameters.ContainsKey("MaxAudioFrameAgeMs")) {
  $nodeArgs += @("--maxAudioFrameAgeMs", [string] $MaxAudioFrameAgeMs)
}
if ($Ffmpeg) { $nodeArgs += @("--ffmpeg", $Ffmpeg) }
if ($RequireWgc) { $nodeArgs += "--requireWgc" }
if ($ProbeHost) { $nodeArgs += "--probeHost" }
if ($ProbeMedia) { $nodeArgs += "--probeMedia" }
if ($ProbeVideo) { $nodeArgs += "--probeVideo" }
if ($ProbeAudio) { $nodeArgs += "--probeAudio" }
if ($ProbeClipboardSecurity) { $nodeArgs += "--probeClipboardSecurity" }
if ($ProbeWgcH264Sources) { $nodeArgs += "--probeWgcH264Sources" }
if ($ExpectBuildId) { $nodeArgs += @("--expectBuildId", $ExpectBuildId) }
if ($RequireCurrentBuildId) { $nodeArgs += "--requireCurrentBuildId" }
if ($SkipCurrentBuildCheck) { $nodeArgs += "--skipCurrentBuildCheck" }
if ($RequireOpen) { $nodeArgs += "--requireOpen" }
if ($Strict) { $nodeArgs += "--strict" }
if ($Server) { $nodeArgs += @("--server", $Server) }
if ($CheckBoard) { $nodeArgs += "--checkBoard" }
if ($BoardSummary) { $nodeArgs += "--boardSummary" }
if ($Json) { $nodeArgs += "--json" }
if ($ExtraArgs) { $nodeArgs += $ExtraArgs }

Push-Location $repoRoot
try {
  & node @nodeArgs
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
