param(
    [string]$HostName = "0.0.0.0",
    [int]$Port = 17888,
    [string]$Token = "",
    [Alias("h")]
    [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
    Write-Output @"
Usage:
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\start-codex-link.ps1 [options]
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\start-codex-link.ps1 [options]

Common examples:
  # Start the Agent Link Board on the LAN default port.
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\start-codex-link.ps1

  # Start on localhost for single-machine checks.
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\start-codex-link.ps1 -HostName 127.0.0.1 -Port 17888

  # Start with a token on a trusted LAN.
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\start-codex-link.ps1 -Token YOUR_TOKEN

Options:
  -HostName <host>  Bind address. Default: 0.0.0.0.
  -Port <port>      Agent Link Board port. Default: 17888.
  -Token <token>    Optional board token. The script reports token mode but never prints the token value.
  -Help, -h         Show this help without starting the Agent Link Board.

Safety:
  -Help never starts the Agent Link Board, never creates logs, never prints
  tokens, and never sends passwords, authentication, input, or inject events.
"@
    exit 0
}

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
