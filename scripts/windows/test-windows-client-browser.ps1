[CmdletBinding()]
param(
  [string] $HostName = "127.0.0.1",
  [int] $Port = 43770,
  [switch] $Discover,
  [switch] $DiscoverNoLocalSubnets,
  [int] $DiscoverTimeoutMs = 1200,
  [switch] $PromptPassword,
  [switch] $RequirePassword,
  [int] $ClientPort = 5197,
  [int] $DebugPort = 9337,
  [int] $TimeoutMs = 30000,
  [int] $ProgressIntervalMs = 10000,
  [switch] $Headed,
  [switch] $DiagnosticsOnly,
  [switch] $BoardSummary,
  [switch] $NoRequireVideoSurface,
  [switch] $RequireH264,
  [switch] $InjectPcmAudio,
  [string] $ExpectDiscoveryRuntimeBuildId = "",
  [Alias("h")]
  [switch] $Help
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..\..")

function Show-Usage {
  Write-Output @"
Usage:
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\test-windows-client-browser.ps1 [options]

Common examples:
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\test-windows-client-browser.ps1 -DiagnosticsOnly -BoardSummary
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\test-windows-client-browser.ps1 -Discover -DiscoverNoLocalSubnets -HostName 192.168.31.122 -Port 43770 -DiagnosticsOnly -BoardSummary -TimeoutMs 45000
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\test-windows-client-browser.ps1 -HostName 192.168.31.122 -Port 43770 -PromptPassword -RequirePassword -RequireH264

Options:
  -HostName <host>                     Mac host address. Default: 127.0.0.1.
  -Port <port>                         Mac host port. Default: 43770.
  -Discover                            Find the best Mac host before testing.
  -DiscoverNoLocalSubnets              With -Discover, only probe localhost and explicit HostName.
  -DiscoverTimeoutMs <ms>              Per-host discovery timeout. Default: 1200.
  -PromptPassword                      Ask for the Mac host password without echoing it.
  -RequirePassword                     Refuse empty/demo-password credentials before connecting.
  -ClientPort <port>                   Local Windows client web port. Default: 5197.
  -DebugPort <port>                    Browser remote debugging port. Default: 9337.
  -TimeoutMs <ms>                      Per-step timeout. Default: 30000.
  -ProgressIntervalMs <ms>             Progress interval; 0 disables. Default: 10000.
  -Headed                              Run browser headed instead of headless.
  -DiagnosticsOnly                     Only run local UI diagnostics; do not authenticate/connect.
  -BoardSummary                        Print one secret-free Agent Link Board summary line.
  -NoRequireVideoSurface               Do not require a visible decoded video surface.
  -RequireH264                         Require H.264/WebCodecs decoded video.
  -InjectPcmAudio                      Inject synthetic PCM into the page and require playback state.
  -ExpectDiscoveryRuntimeBuildId <id>  Require /discovery runtime.buildId before connecting.
  -Help, -h                            Show this help without starting browser diagnostics.

Safety:
  -Help is pure help. -DiagnosticsOnly is no-password and does not authenticate
  a WebSocket. Passwords are never printed; use LAN_DUAL_PASSWORD or
  -PromptPassword for real connection tests. This wrapper does not enable input
  injection by itself.
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

$nodeArgs = @(
  "scripts\windows\test-windows-client-browser.mjs",
  "--host", $HostName,
  "--port", [string] $Port,
  "--clientPort", [string] $ClientPort,
  "--debugPort", [string] $DebugPort,
  "--timeoutMs", [string] $TimeoutMs,
  "--progressIntervalMs", [string] $ProgressIntervalMs
)

if ($Discover) { $nodeArgs += "--discover" }
if ($DiscoverNoLocalSubnets) { $nodeArgs += "--discoverNoLocalSubnets" }
if ($DiscoverTimeoutMs -gt 0) { $nodeArgs += @("--discoverTimeoutMs", [string] $DiscoverTimeoutMs) }
if ($PromptPassword) { $nodeArgs += "--promptPassword" }
if ($RequirePassword) { $nodeArgs += "--requirePassword" }
if ($Headed) { $nodeArgs += "--headed" }
if ($DiagnosticsOnly) { $nodeArgs += "--diagnosticsOnly" }
if ($BoardSummary) { $nodeArgs += "--boardSummary" }
if ($NoRequireVideoSurface) { $nodeArgs += "--noRequireVideoSurface" }
if ($RequireH264) { $nodeArgs += "--requireH264" }
if ($InjectPcmAudio) { $nodeArgs += "--injectPcmAudio" }
if ($ExpectDiscoveryRuntimeBuildId) { $nodeArgs += @("--expectDiscoveryRuntimeBuildId", $ExpectDiscoveryRuntimeBuildId) }

Push-Location $repoRoot
try {
  & node @nodeArgs
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
