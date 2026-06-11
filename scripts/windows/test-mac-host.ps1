param(
  [Parameter(Mandatory = $true)]
  [string] $HostName,
  [int] $Port = 43770,
  [string] $Password = "demo-password",
  [int] $TimeoutMs = 8000,
  [int] $Width = 1920,
  [int] $Height = 1080,
  [int] $Fps = 60,
  [int] $BandwidthKbps = 50000,
  [switch] $ClipboardText,
  [switch] $ClipboardFile,
  [int] $ClipboardFileBytes = 96,
  [switch] $InputEvents,
  [switch] $RequireRealVideo,
  [string] $ExpectInputMode = ""
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..\..")
$probeScript = Join-Path $scriptRoot "probe-mac-host.mjs"

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host "[ERROR] node not found"
  exit 1
}

Push-Location $repoRoot
try {
  $nodeArgs = @(
    $probeScript,
    "--host", $HostName,
    "--port", $Port,
    "--password", $Password,
    "--timeoutMs", $TimeoutMs,
    "--width", $Width,
    "--height", $Height,
    "--fps", $Fps,
    "--bandwidthKbps", $BandwidthKbps
  )
  if ($ClipboardText) {
    $nodeArgs += "--clipboardText"
  }
  if ($ClipboardFile) {
    $nodeArgs += @("--clipboardFile", "--clipboardFileBytes", $ClipboardFileBytes)
  }
  if ($InputEvents) {
    $nodeArgs += "--inputEvents"
  }
  if ($RequireRealVideo) {
    $nodeArgs += "--requireRealVideo"
  }
  if ($ExpectInputMode) {
    $nodeArgs += @("--expectInputMode", $ExpectInputMode)
  }

  & node @nodeArgs
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
