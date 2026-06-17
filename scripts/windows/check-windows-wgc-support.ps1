[CmdletBinding()]
param(
  [int] $TimeoutMs = 10000,
  [switch] $RequireSupported,
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
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\check-windows-wgc-support.ps1 [options]

Common examples:
  # One-line Agent Link Board summary, safe to paste.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\check-windows-wgc-support.ps1 -BoardSummary

  # Machine-readable report.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\check-windows-wgc-support.ps1 -Json

  # Deployment-style capability gate.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\check-windows-wgc-support.ps1 -RequireSupported -BoardSummary

Options:
  -TimeoutMs <ms>       PowerShell probe timeout. Default: 10000.
  -RequireSupported     Fail if Windows Graphics Capture is unavailable.
  -Json                 Print one machine-readable JSON object.
  -BoardSummary         Print one secret-free Agent Link Board summary line.
  -VerboseOutput        Include raw probe details in Node helper output.
  -Help, -h             Show this help without probing.

Safety:
  This wrapper is read-only. It does not start Windows host, does not
  authenticate, does not ask for or print passwords, does not capture screen or
  audio, and does not send input/inject events.
"@
  exit 0
}

$nodeArgs = @(
  "scripts\windows\check-windows-wgc-support.mjs",
  "--timeoutMs", [string] $TimeoutMs
)

if ($RequireSupported) { $nodeArgs += "--requireSupported" }
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
