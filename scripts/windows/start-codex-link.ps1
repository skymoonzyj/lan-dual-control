param(
    [string]$HostName = "0.0.0.0",
    [int]$Port = 17888,
    [string]$Token = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$server = Join-Path $repoRoot "scripts\codex-link-server.mjs"
$logDir = Join-Path $repoRoot ".dev-lab"
$outLog = Join-Path $logDir "codex-link.out.log"
$errLog = Join-Path $logDir "codex-link.err.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$arguments = @($server, "--host", $HostName, "--port", [string]$Port)
if ($Token) {
    $arguments += @("--token", $Token)
}

$process = Start-Process -FilePath "node" -ArgumentList $arguments -WorkingDirectory $repoRoot -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru

Write-Host "Codex LAN Link started."
Write-Host ("Process ID: {0}" -f $process.Id)
Write-Host ("Local URL: http://127.0.0.1:{0}" -f $Port)

$addresses = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown" } |
    Select-Object -ExpandProperty IPAddress

foreach ($address in $addresses) {
    Write-Host ("LAN URL: http://{0}:{1}" -f $address, $Port)
}

if ($Token) {
    Write-Host "Token is enabled. Open the page with ?token=YOUR_TOKEN once."
} else {
    Write-Host "Token is disabled. Use only on a trusted LAN."
}
