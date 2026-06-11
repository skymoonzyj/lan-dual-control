param(
  [Parameter(Mandatory = $true)]
  [string] $HostName,
  [int] $Port = 43770,
  [string] $Password = "demo-password",
  [int] $TimeoutMs = 8000,
  [int] $Width = 1920,
  [int] $Height = 1080,
  [int] $Fps = 60,
  [int] $BandwidthKbps = 50000
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
  & node $probeScript `
    --host $HostName `
    --port $Port `
    --password $Password `
    --timeoutMs $TimeoutMs `
    --width $Width `
    --height $Height `
    --fps $Fps `
    --bandwidthKbps $BandwidthKbps
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
