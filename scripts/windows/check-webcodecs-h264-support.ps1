[CmdletBinding()]
param(
  [int] $DebugPort = 9347,
  [int] $TimeoutMs = 15000,
  [int] $Width = 1920,
  [int] $Height = 1080,
  [string] $Codecs = "",
  [switch] $RequireAny,
  [string] $RequireCodec = "",
  [switch] $Json,
  [switch] $BoardSummary,
  [switch] $Headed,
  [Alias("h")]
  [switch] $Help
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..\..")

if ($Help) {
  Write-Output @"
Usage:
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\check-webcodecs-h264-support.ps1 [options]

Common examples:
  # One-line Agent Link Board summary, safe to paste.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\check-webcodecs-h264-support.ps1 -RequireCodec avc1.42C02A -BoardSummary

  # Machine-readable report.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\check-webcodecs-h264-support.ps1 -Json

  # Strict browser decode gate for H.264 work.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\check-webcodecs-h264-support.ps1 -RequireAny -RequireCodec avc1.42C02A

Options:
  -DebugPort <port>       Browser remote debugging port. Default: 9347.
  -TimeoutMs <ms>         Per-step timeout. Default: 15000.
  -Width <px>             Coded width in support probe. Default: 1920.
  -Height <px>            Coded height in support probe. Default: 1080.
  -Codecs <list>          Comma-separated avc1 codec strings to probe.
  -RequireAny             Fail if no tested H.264 WebCodecs config is supported.
  -RequireCodec <codec>   Fail if the given codec has no supported config.
  -Json                   Print one machine-readable JSON object.
  -BoardSummary           Print one secret-free Agent Link Board summary line.
  -Headed                 Run browser headed instead of headless.
  -Help, -h               Show this help without probing.

Safety:
  This wrapper is read-only. It opens a temporary local browser profile and a
  loopback probe page only. It does not start Windows host, does not authenticate,
  does not ask for or print passwords, does not capture screen/audio, and does
  not send input/inject events.
"@
  exit 0
}

$nodeArgs = @(
  "scripts\windows\check-webcodecs-h264-support.mjs",
  "--debugPort", [string] $DebugPort,
  "--timeoutMs", [string] $TimeoutMs,
  "--width", [string] $Width,
  "--height", [string] $Height
)

if ($Codecs) { $nodeArgs += @("--codecs", $Codecs) }
if ($RequireAny) { $nodeArgs += "--requireAny" }
if ($RequireCodec) { $nodeArgs += @("--requireCodec", $RequireCodec) }
if ($Json) { $nodeArgs += "--json" }
if ($BoardSummary) { $nodeArgs += "--boardSummary" }
if ($Headed) { $nodeArgs += "--headed" }

Push-Location $repoRoot
try {
  & node @nodeArgs
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
