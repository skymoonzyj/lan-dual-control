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
  [string] $Ffmpeg = "",
  [string] $H264Encoder = "",
  [string] $WgcHelper = "",
  [switch] $WgcH264Bridge,
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
  [switch] $Json,
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
if ($H264Encoder) { $nodeArgs += @("--h264Encoder", $H264Encoder) }
if ($WgcHelper) { $nodeArgs += @("--wgcHelper", $WgcHelper) }
if ($WgcH264Bridge) { $nodeArgs += "--wgcH264Bridge" }
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
if ($Json) { $nodeArgs += "--json" }
if ($DryRun) { $nodeArgs += "--dryRun" }

Push-Location $repoRoot
try {
  & node @nodeArgs
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
