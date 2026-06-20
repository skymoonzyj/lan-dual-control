[CmdletBinding()]
param(
  [string] $Server = "http://192.168.31.68:17888",
  [int] $TimeoutMs = 5000,
  [switch] $CheckBoard,
  [switch] $RequireReady,
  [switch] $Json,
  [switch] $BoardSummary,
  [Alias("h")]
  [switch] $Help
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..\..")
$runnerScript = Join-Path $scriptRoot "check-windows-manual-ux-status.mjs"

if ($Help) {
  Write-Output @"
Usage:
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\check-windows-manual-ux-status.ps1 [options]

Common examples:
  # One-line Agent Link Board summary, safe to paste.
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\check-windows-manual-ux-status.ps1 -BoardSummary

  # Machine-readable report.
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\check-windows-manual-ux-status.ps1 -Json

  # Fail closed unless the Windows/User manual UX window is currently ready.
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\check-windows-manual-ux-status.ps1 -RequireReady -Json

Options:
  -Server <url>       Agent Link Board URL. Default: $Server
  -TimeoutMs <ms>     Board request timeout. Default: 5000.
  -CheckBoard         Compatibility switch; the command always reads the board.
  -RequireReady       Exit non-zero unless manual UX is ready.
  -Json               Print one machine-readable JSON object.
  -BoardSummary       Print one secret-free Agent Link Board summary line.
  -Help, -h           Show this help without probing.

Safety:
  This wrapper is read-only. It does not authenticate a WebSocket, does not ask
  for or print passwords, does not send user-auth requests, and does not send
  input/inject events. A timed-out Mac manual UX call remains blocked until Mac
  reconfirms a fresh user-present window.
"@
  exit 0
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host "[ERROR] node not found"
  exit 1
}

$nodeArgs = @(
  $runnerScript,
  "--server", $Server,
  "--timeoutMs", [string] $TimeoutMs
)

if ($CheckBoard) { $nodeArgs += "--checkBoard" }
if ($RequireReady) { $nodeArgs += "--requireReady" }
if ($Json) { $nodeArgs += "--json" }
if ($BoardSummary) { $nodeArgs += "--boardSummary" }

Push-Location $repoRoot
try {
  & node @nodeArgs
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
