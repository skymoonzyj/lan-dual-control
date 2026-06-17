[CmdletBinding()]
param(
  [string] $HostName = "0.0.0.0",
  [int] $Port = 43770,
  [ValidateSet("", "auto", "ffmpeg", "ffmpeg-h264", "h264", "system", "mock", "wgc")]
  [string] $ScreenMode = "",
  [ValidateSet("", "mock", "wasapi", "dshow")]
  [string] $AudioMode = "",
  [ValidateSet("", "auto", "log", "system")]
  [string] $InputMode = "",
  [ValidateSet("deny", "accept", "disabled")]
  [string] $ReverseControlMode = "deny",
  [string] $Ffmpeg = "",
  [string] $H264Encoder = "",
  [string] $WgcHelper = "",
  [switch] $WgcH264Bridge,
  [ValidateSet("", "jpeg", "raw-bgra", "bgra", "raw", "nv12", "raw-nv12", "raw_nv12", "yuv", "yuv420")]
  [string] $WgcH264Source = "",
  [switch] $WgcRepeatLastFrame,
  [ValidateSet("", "full", "signal")]
  [string] $WgcRepeatLastFrameMode = "",
  [switch] $Wasapi,
  [switch] $LogInput,
  [switch] $SystemInput,
  [switch] $PromptPassword,
  [switch] $RequirePassword,
  [switch] $AddFirewallRule,
  [switch] $DryRunFirewallRule,
  [switch] $SkipFirewallCheck,
  [switch] $NoRequireOpen,
  [switch] $Status,
  [switch] $CheckBoard,
  [string] $Server = "",
  [switch] $BoardSummary,
  [switch] $Json,
  [switch] $DryRun,
  [Alias("h")]
  [switch] $Help
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..\..")

if ($Help) {
  Write-Output @"
Usage:
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\start-windows-host.ps1 [options]

Common examples:
  # Read-only status, safe for Agent Link Board summaries.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\start-windows-host.ps1 -Status -CheckBoard -BoardSummary

  # Machine-readable status for desktop shells or scripts.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\start-windows-host.ps1 -Status -Json -CheckBoard

  # Start Windows host with a hidden local password prompt.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\start-windows-host.ps1 -PromptPassword -RequirePassword

Options:
  -Status             Read current /discovery status only; does not start the host.
  -CheckBoard         Read Agent Link Board currentCall in status mode.
  -BoardSummary       Print one secret-free Agent Link Board summary line.
  -Json               Print machine-readable JSON when supported by the Node helper.
  -PromptPassword     Ask for a local hidden password prompt before starting.
  -RequirePassword    Reject startup if no password is available.
  -ScreenMode <mode>  auto, ffmpeg, ffmpeg-h264, system, mock, or wgc.
  -AudioMode <mode>   mock, wasapi, or dshow.
  -InputMode <mode>   auto, log, or system.
  -ReverseControlMode deny, accept, or disabled. Default: deny.
  -DryRun             Print the resolved startup plan without starting.
  -Help, -h           Show this help.

Status summaries include:
  WindowsHostMedia=node scripts/windows/check-windows-host-readiness.mjs --checkBoard --probeMedia --boardSummary
  WindowsVideoSupport=node scripts/windows/check-windows-video-encoder-support.mjs --boardSummary
  WindowsVideoSupportPs=powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-windows-video-encoder-support.ps1 -BoardSummary
  WindowsWgcBenchmark=node scripts/windows/benchmark-windows-wgc-settings.mjs --profile 60:20000:balanced --durationMs 1800 --boardSummary
  WindowsWgcBenchmarkPs=powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/benchmark-windows-wgc-settings.ps1 -Profile 60:20000:balanced -DurationMs 1800 -BoardSummary
  ReverseGrant=node scripts/windows/allow-windows-reverse-control.mjs --host 127.0.0.1 --port <port> --durationMs 30000 --boardSummary
  ReverseGrantPs=pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port <port> -DurationMs 30000 -BoardSummary

Safety:
  -Status/-BoardSummary never starts Windows host, never authenticates, never asks for or prints passwords, and never sends input/inject events.
"@
  exit 0
}

$nodeArgs = @(
  "scripts\windows\start-windows-host.mjs",
  "--host", $HostName,
  "--port", [string] $Port
)

if ($ScreenMode) { $nodeArgs += @("--screenMode", $ScreenMode) }
if ($AudioMode) { $nodeArgs += @("--audioMode", $AudioMode) }
if ($InputMode) { $nodeArgs += @("--inputMode", $InputMode) }
if ($ReverseControlMode) { $nodeArgs += @("--reverseControlMode", $ReverseControlMode) }
if ($Ffmpeg) { $nodeArgs += @("--ffmpeg", $Ffmpeg) }
if ($H264Encoder) { $nodeArgs += @("--h264Encoder", $H264Encoder) }
if ($WgcHelper) { $nodeArgs += @("--wgcHelper", $WgcHelper) }
if ($WgcH264Bridge) { $nodeArgs += "--wgcH264Bridge" }
if ($WgcH264Source) { $nodeArgs += @("--wgcH264Source", $WgcH264Source) }
if ($WgcRepeatLastFrame) { $nodeArgs += "--wgcRepeatLastFrame" }
if ($WgcRepeatLastFrameMode) { $nodeArgs += @("--wgcRepeatLastFrameMode", $WgcRepeatLastFrameMode) }
if ($Wasapi) { $nodeArgs += "--wasapi" }
if ($LogInput) { $nodeArgs += "--logInput" }
if ($SystemInput) { $nodeArgs += "--systemInput" }
if ($PromptPassword) { $nodeArgs += "--promptPassword" }
if ($RequirePassword) { $nodeArgs += "--requirePassword" }
if ($AddFirewallRule) { $nodeArgs += "--addFirewallRule" }
if ($DryRunFirewallRule) { $nodeArgs += "--dryRunFirewallRule" }
if ($SkipFirewallCheck) { $nodeArgs += "--skipFirewallCheck" }
if ($NoRequireOpen) { $nodeArgs += "--noRequireOpen" }
if ($Status) { $nodeArgs += "--status" }
if ($CheckBoard) { $nodeArgs += "--checkBoard" }
if ($Server) { $nodeArgs += @("--server", $Server) }
if ($BoardSummary) { $nodeArgs += "--boardSummary" }
if ($Json) { $nodeArgs += "--json" }
if ($DryRun) { $nodeArgs += "--dryRun" }

Push-Location $repoRoot
try {
  & node @nodeArgs
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
