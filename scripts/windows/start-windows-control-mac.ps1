[CmdletBinding()]
param(
  [string] $HostName = "192.168.31.122",
  [int] $Port = 43770,
  [int] $ClientPort = 5200,
  [int] $DebugPort = 9340,
  [int] $TimeoutMs = 8000,
  [switch] $Discover,
  [switch] $NoDiscover,
  [string[]] $DiscoverHost = @(),
  [switch] $DiscoverNoLocalSubnets,
  [int] $DiscoverTimeoutMs = 650,
  [string] $Server = "http://192.168.31.68:17888",
  [switch] $NoBoardTarget,
  [int] $BoardTimeoutMs = 650,
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

  # Skip LAN discovery and use the fallback HostName/Port exactly.
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\start-windows-control-mac.ps1 -NoDiscover -DryRun -BoardSummary

Options:
  -HostName <ip>             Mac host LAN IP fallback. Default: $HostName
  -Port <port>               Mac host WebSocket/discovery port. Default: 43770.
  -ClientPort <port>         Local Windows control page port. Default: 5200.
  -DebugPort <port>          Reserved browser diagnostics debug port. Default: 9340.
  -TimeoutMs <ms>            Wait for local page server. Default: 8000.
  -Discover                  Force a read-only LAN /discovery probe before choosing the target.
  -NoDiscover                Skip discovery and use HostName/Port fallback directly.
  -DiscoverHost <ip[]>       Direct host(s) to probe during discovery.
  -DiscoverNoLocalSubnets    Only probe 127.0.0.1 and DiscoverHost targets.
  -DiscoverTimeoutMs <ms>    Per-host discovery timeout. Default: 650.
  -Server <url>              Agent Link Board URL for Mac target hints. Default: http://192.168.31.68:17888.
  -NoBoardTarget             Do not read Agent Link Board for extra Mac discovery candidates.
  -BoardTimeoutMs <ms>       Agent Link Board read timeout. Default: 650.
  -NoOpen                    Start/reuse the page server but do not open a browser.
  -DryRun                    Print the URL and plan without starting services or opening a browser.
  -Json                      Print one machine-readable JSON object.
  -BoardSummary              Print one secret-free Agent Link Board summary line.
  -Help, -h                  Show this help without starting services or browsers.

Safety:
  This wrapper does not include a password parameter. Discovery only reads
  /discovery metadata. Agent Link Board target hints only add candidates for
  the same read-only discovery probe; they do not authenticate, open a WebSocket, or send
  input/inject events. The opened page clears the demo password and waits for
  the user to type the current Mac temporary password locally. The dry-run/help
  paths do not start services, open browsers, authenticate, or send input/inject
  events.
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
  "--port", [string] $Port,
  "--clientPort", [string] $ClientPort,
  "--debugPort", [string] $DebugPort,
  "--timeoutMs", [string] $TimeoutMs,
  "--discoverTimeoutMs", [string] $DiscoverTimeoutMs,
  "--server", [string] $Server,
  "--boardTimeoutMs", [string] $BoardTimeoutMs
)

if ($PSBoundParameters.ContainsKey("HostName")) { $nodeArgs += @("--host", $HostName) }
if ($Discover) { $nodeArgs += "--discover" }
if ($NoDiscover) { $nodeArgs += "--noDiscover" }
if ($DiscoverNoLocalSubnets) { $nodeArgs += "--discoverNoLocalSubnets" }
if ($NoBoardTarget) { $nodeArgs += "--noBoardTarget" }
foreach ($item in $DiscoverHost) {
  if ($item) { $nodeArgs += @("--discoverHost", [string] $item) }
}
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
