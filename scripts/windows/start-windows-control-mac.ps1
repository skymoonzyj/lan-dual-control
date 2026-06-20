[CmdletBinding()]
param(
  [string] $HostName = "192.168.31.122",
  [int] $Port = 43770,
  [int] $ClientPort = 5200,
  [int] $DebugPort = 9340,
  [int] $TimeoutMs = 8000,
  [switch] $NoOpen,
  [switch] $DryRun,
  [switch] $Json,
  [switch] $BoardSummary,
  [Alias("h")]
  [switch] $Help
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..\..")
$runnerScript = Join-Path $scriptRoot "start-windows-control-mac.mjs"

if ($Help) {
  Write-Output @"
Usage:
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\start-windows-control-mac.ps1 [options]

Common examples:
  # Open/reuse the Windows control page for the current Mac host.
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\start-windows-control-mac.ps1

  # One-line Agent Link Board summary, safe to paste.
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\start-windows-control-mac.ps1 -DryRun -BoardSummary

  # Machine-readable dry-run plan.
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\start-windows-control-mac.ps1 -DryRun -Json

Options:
  -HostName <ip>       Mac host LAN IP. Default: $HostName
  -Port <port>         Mac host WebSocket port. Default: 43770.
  -ClientPort <port>   Local Windows control page port. Default: 5200.
  -DebugPort <port>    Reserved browser diagnostics debug port. Default: 9340.
  -TimeoutMs <ms>      Wait for local page server. Default: 8000.
  -NoOpen              Start/reuse the page server but do not open a browser.
  -DryRun              Print the URL and plan without starting services or opening a browser.
  -Json                Print one machine-readable JSON object.
  -BoardSummary        Print one secret-free Agent Link Board summary line.
  -Help, -h            Show this help without starting services or browsers.

Safety:
  This wrapper does not include a password parameter. The opened page clears the
  demo password and waits for the user to type the current Mac temporary
  password locally. The dry-run/help paths do not start services, open browsers,
  authenticate, or send input/inject events.
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
  "--host", $HostName,
  "--port", [string] $Port,
  "--clientPort", [string] $ClientPort,
  "--debugPort", [string] $DebugPort,
  "--timeoutMs", [string] $TimeoutMs
)

if ($NoOpen) { $nodeArgs += "--noOpen" }
if ($DryRun) { $nodeArgs += "--dryRun" }
if ($Json) { $nodeArgs += "--json" }
if ($BoardSummary) { $nodeArgs += "--boardSummary" }

Push-Location $repoRoot
try {
  & node @nodeArgs
  exit $LASTEXITCODE
} finally {
  Pop-Location
}