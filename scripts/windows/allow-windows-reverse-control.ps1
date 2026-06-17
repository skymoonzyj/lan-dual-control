[CmdletBinding()]
param(
  [Alias("Host")]
  [string] $HostName = "127.0.0.1",
  [int] $Port = 43770,
  [ValidateSet("status", "grant", "revoke")]
  [string] $Action = "grant",
  [switch] $Status,
  [switch] $Grant,
  [switch] $Revoke,
  [int] $DurationMs = 30000,
  [int] $TimeoutMs = 5000,
  [switch] $Json,
  [switch] $BoardSummary,
  [Alias("h")]
  [switch] $Help
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..\..")

if ($Help) {
  Write-Output @"
Usage:
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\allow-windows-reverse-control.ps1 [options]
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\allow-windows-reverse-control.ps1 [options]

Common examples:
  # Open a one-time 30 second reverse-control grant and print a safe board line.
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\allow-windows-reverse-control.ps1 -BoardSummary

  # Read current grant/recent-request state as JSON.
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\allow-windows-reverse-control.ps1 -Status -Json

  # Revoke the temporary grant window.
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\allow-windows-reverse-control.ps1 -Revoke -BoardSummary

Options:
  -HostName <host>       Local Windows host address. Alias: -Host. Default: 127.0.0.1.
  -Port <port>           Windows host port. Default: 43770.
  -Status                Read current local reverse-control grant state.
  -Grant                 Open a one-time temporary grant window. Default action.
  -Revoke                Revoke the temporary grant window.
  -Action <name>         One of: status, grant, revoke. Default: grant.
  -DurationMs <ms>       Grant duration, clamped by host to 5s-120s. Default: 30000.
  -TimeoutMs <ms>        HTTP timeout. Default: 5000.
  -Json                  Print one machine-readable JSON object.
  -BoardSummary          Print one secret-free Agent Link Board summary line.
  -Help, -h              Show this help without contacting a host.

Safety:
  This wrapper only calls the Windows host loopback management endpoint. It does
  not use or print passwords, does not authenticate to a remote peer, does not
  send input events, and does not execute inject.
"@
  exit 0
}

$selectedActions = @()
if ($Status) { $selectedActions += "status" }
if ($Grant) { $selectedActions += "grant" }
if ($Revoke) { $selectedActions += "revoke" }
if ($selectedActions.Count -gt 1) {
  Write-Error "Choose only one of -Status, -Grant, or -Revoke."
  exit 2
}
if ($selectedActions.Count -eq 1) {
  $Action = $selectedActions[0]
}

$nodeArgs = @(
  "scripts\windows\allow-windows-reverse-control.mjs",
  "--host", $HostName,
  "--port", [string] $Port,
  "--action", $Action,
  "--durationMs", [string] $DurationMs,
  "--timeoutMs", [string] $TimeoutMs
)

if ($Json) { $nodeArgs += "--json" }
if ($BoardSummary) { $nodeArgs += "--boardSummary" }

Push-Location $repoRoot
try {
  & node @nodeArgs
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
