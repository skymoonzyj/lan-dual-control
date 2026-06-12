[CmdletBinding()]
param(
  [string] $HostName = "0.0.0.0",
  [int] $Port = 43770,
  [ValidateSet("", "auto", "ffmpeg", "system", "mock")]
  [string] $ScreenMode = "",
  [ValidateSet("", "mock", "wasapi", "dshow")]
  [string] $AudioMode = "",
  [ValidateSet("", "auto", "log", "system")]
  [string] $InputMode = "",
  [string] $Ffmpeg = "",
  [switch] $Wasapi,
  [switch] $LogInput,
  [switch] $SystemInput,
  [switch] $SkipFirewallCheck,
  [switch] $NoRequireOpen,
  [switch] $DryRun
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..\..")

$nodeArgs = @(
  "scripts\windows\start-windows-host.mjs",
  "--host", $HostName,
  "--port", [string] $Port
)

if ($ScreenMode) { $nodeArgs += @("--screenMode", $ScreenMode) }
if ($AudioMode) { $nodeArgs += @("--audioMode", $AudioMode) }
if ($InputMode) { $nodeArgs += @("--inputMode", $InputMode) }
if ($Ffmpeg) { $nodeArgs += @("--ffmpeg", $Ffmpeg) }
if ($Wasapi) { $nodeArgs += "--wasapi" }
if ($LogInput) { $nodeArgs += "--logInput" }
if ($SystemInput) { $nodeArgs += "--systemInput" }
if ($SkipFirewallCheck) { $nodeArgs += "--skipFirewallCheck" }
if ($NoRequireOpen) { $nodeArgs += "--noRequireOpen" }
if ($DryRun) { $nodeArgs += "--dryRun" }

Push-Location $repoRoot
try {
  & node @nodeArgs
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
