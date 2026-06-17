[CmdletBinding()]
param(
  [string] $Ffmpeg = "",
  [int] $TimeoutMs = 20000,
  [switch] $SkipFfmpeg,
  [switch] $SkipWgc,
  [switch] $SkipWebCodecs,
  [switch] $RequireAnyH264,
  [switch] $RequireHardwareH264,
  [switch] $RequireWgc,
  [switch] $RequireWebCodecsH264,
  [switch] $Json,
  [switch] $BoardSummary,
  [switch] $VerboseOutput,
  [Alias("h")]
  [switch] $Help
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..\..")

if ($Help) {
  Write-Output @"
Usage:
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\check-windows-video-encoder-support.ps1 [options]

Common examples:
  # One-line Agent Link Board summary, safe to paste.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\check-windows-video-encoder-support.ps1 -BoardSummary

  # Machine-readable report.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\check-windows-video-encoder-support.ps1 -Json

  # Deployment-style capability gate.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\check-windows-video-encoder-support.ps1 -RequireAnyH264 -RequireHardwareH264 -RequireWgc -RequireWebCodecsH264

Options:
  -Ffmpeg <path>             FFmpeg executable path. Defaults to LAN_DUAL_FFMPEG,
                             C:\DevTools\ffmpeg\bin\ffmpeg.exe, then PATH.
  -TimeoutMs <ms>            Per probe timeout. Default: 20000.
  -SkipFfmpeg                Skip FFmpeg encoder list probe.
  -SkipWgc                   Skip Windows Graphics Capture preflight.
  -SkipWebCodecs             Skip browser WebCodecs H.264 decode probe.
  -RequireAnyH264            Fail if no FFmpeg H.264 encoder is available.
  -RequireHardwareH264       Fail if no FFmpeg hardware H.264 encoder is available.
  -RequireWgc                Fail if Windows Graphics Capture preflight fails.
  -RequireWebCodecsH264      Fail if browser WebCodecs H.264 support is unavailable.
  -Json                      Print one machine-readable JSON object.
  -BoardSummary              Print one secret-free Agent Link Board summary line.
  -VerboseOutput             Include child stderr tails in Node helper output.
  -Help, -h                  Show this help without probing.

Safety:
  This wrapper is read-only. It does not start Windows host, does not capture the
  screen, does not authenticate, does not ask for or print passwords, and does
  not send input/inject events.
"@
  exit 0
}

$nodeArgs = @(
  "scripts\windows\check-windows-video-encoder-support.mjs",
  "--timeoutMs", [string] $TimeoutMs
)

if ($Ffmpeg) { $nodeArgs += @("--ffmpeg", $Ffmpeg) }
if ($SkipFfmpeg) { $nodeArgs += "--skipFfmpeg" }
if ($SkipWgc) { $nodeArgs += "--skipWgc" }
if ($SkipWebCodecs) { $nodeArgs += "--skipWebCodecs" }
if ($RequireAnyH264) { $nodeArgs += "--requireAnyH264" }
if ($RequireHardwareH264) { $nodeArgs += "--requireHardwareH264" }
if ($RequireWgc) { $nodeArgs += "--requireWgc" }
if ($RequireWebCodecsH264) { $nodeArgs += "--requireWebCodecsH264" }
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
