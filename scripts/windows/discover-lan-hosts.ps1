[CmdletBinding()]
param(
  [int[]] $Port = @(43770),
  [string[]] $HostName = @(),
  [string[]] $Subnet = @(),
  [int] $TimeoutMs = 650,
  [int] $Concurrency = 64,
  [int] $MaxHostsPerSubnet = 254,
  [switch] $RequireFound,
  [switch] $RequireMacHost,
  [switch] $NoLocalSubnets,
  [switch] $BoardSummary,
  [switch] $Json,
  [switch] $Detailed,
  [Alias("h")]
  [switch] $Help
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..\..")

function Show-Usage {
  Write-Output @"
Usage:
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\discover-lan-hosts.ps1 [options]

Common examples:
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\discover-lan-hosts.ps1 -BoardSummary
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\discover-lan-hosts.ps1 -NoLocalSubnets -HostName 192.168.31.122 -Port 43770 -RequireMacHost -BoardSummary
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\discover-lan-hosts.ps1 -NoLocalSubnets -HostName 192.168.31.122 -Port 43770 -RequireMacHost -Json

Options:
  -Port <port[]>          Discovery port list. Default: 43770.
  -HostName <host[]>      Direct host list to probe.
  -Subnet <cidr[]>        IPv4 subnet list, for example 192.168.31.0/24.
  -TimeoutMs <ms>         Per-host HTTP timeout, 100-5000. Default: 650.
  -Concurrency <n>        Parallel probe count, 1-256. Default: 64.
  -MaxHostsPerSubnet <n>  Safety cap per subnet, 1-1024. Default: 254.
  -RequireFound           Exit non-zero when no LAN dual-control host is found.
  -RequireMacHost         Exit non-zero when no Mac host is found.
  -NoLocalSubnets         Only probe 127.0.0.1 plus explicit HostName/Subnet.
  -BoardSummary           Print one secret-free Agent Link Board summary line.
  -Json                   Print one machine-readable JSON object.
  -Detailed               Include failed probe details.
  -Help, -h               Show this help without scanning.

Description:
  This wrapper calls node scripts/windows/discover-lan-hosts.mjs.
  It is read-only: it does not authenticate WebSocket, ask for or print
  passwords, send input, execute inject, start a host, or change system settings.

When a Mac host is found, the board summary includes:
  FormalChecklist=node scripts/windows/check-mac-formal-e2e.mjs --preflightOnly --checkClientDiagnostics --boardSummary
  MacUnattendedFormal=node scripts/mac/check-mac-unattended-status.mjs --requireLaunchAgentMaxFps --requireLaunchAgentLoaded --boardSummary
  ManualChecklist=connection/video/audio/clipboard/input_ack/diagnostics
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

$nodeArgs = @("scripts\windows\discover-lan-hosts.mjs")

foreach ($item in $Port) {
  $nodeArgs += @("--port", [string] $item)
}
foreach ($item in $HostName) {
  if ($item) {
    $nodeArgs += @("--host", $item)
  }
}
foreach ($item in $Subnet) {
  if ($item) {
    $nodeArgs += @("--subnet", $item)
  }
}

$nodeArgs += @("--timeoutMs", [string] $TimeoutMs)
$nodeArgs += @("--concurrency", [string] $Concurrency)
$nodeArgs += @("--maxHostsPerSubnet", [string] $MaxHostsPerSubnet)

if ($RequireFound) { $nodeArgs += "--requireFound" }
if ($RequireMacHost) { $nodeArgs += "--requireMacHost" }
if ($NoLocalSubnets) { $nodeArgs += "--noLocalSubnets" }
if ($BoardSummary) { $nodeArgs += "--boardSummary" }
if ($Json) { $nodeArgs += "--json" }
if ($Detailed) { $nodeArgs += "--verbose" }

Push-Location $repoRoot
try {
  & node @nodeArgs
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
