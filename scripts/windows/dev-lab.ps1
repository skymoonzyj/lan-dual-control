param(
  [switch] $Start,
  [switch] $Stop,
  [switch] $Build,
  [int] $ClientPort = 5178,
  [int] $MockMacPort = 43770,
  [int] $WindowsHostPort = 43772,
  [string] $Password = "demo-password"
)

$ErrorActionPreference = "Continue"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..\..")
$sessionRoot = Join-Path $repoRoot ".dev-lab"
$script:HadFailure = $false

function Write-Section {
  param([string] $Text)
  Write-Host ""
  Write-Host "== $Text =="
}

function Write-Result {
  param(
    [string] $Status,
    [string] $Text
  )
  if ($Status -eq "missing" -or $Status -eq "error") {
    $script:HadFailure = $true
  }
  Write-Host "[$Status] $Text"
}

function Test-CommandAvailable {
  param([string] $Command)
  $resolved = Get-Command $Command -ErrorAction SilentlyContinue
  if (-not $resolved) {
    Write-Result "missing" "$Command not found"
    return $false
  }
  try {
    $version = & $Command --version 2>&1 | Select-Object -First 1
    Write-Result "ok" "$Command - $version"
  } catch {
    Write-Result "ok" "$Command found"
  }
  return $true
}

function Test-PortOpen {
  param(
    [string] $HostName,
    [int] $Port
  )
  $client = New-Object Net.Sockets.TcpClient
  try {
    $async = $client.BeginConnect($HostName, $Port, $null, $null)
    $open = $async.AsyncWaitHandle.WaitOne(350)
    if ($open) {
      $client.EndConnect($async)
      return $true
    }
    return $false
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Test-Url {
  param(
    [string] $Name,
    [string] $Url
  )
  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
      Write-Result "ok" "$Name reachable: $Url"
      return $true
    }
    Write-Result "warn" "$Name returned $($response.StatusCode)"
    return $false
  } catch {
    Write-Result "wait" "$Name not reachable yet: $Url"
    return $false
  }
}

function Invoke-Check {
  param(
    [string] $Name,
    [string] $FilePath,
    [string[]] $Arguments,
    [string] $WorkingDirectory = $repoRoot
  )
  try {
    Push-Location $WorkingDirectory
    & $FilePath @Arguments
    $exitCode = $LASTEXITCODE
    Pop-Location
    if ($exitCode -eq 0) {
      Write-Result "ok" $Name
      return $true
    }
    Write-Result "error" "$Name failed with exit code $exitCode"
    return $false
  } catch {
    Pop-Location -ErrorAction SilentlyContinue
    Write-Result "error" "$Name failed: $($_.Exception.Message)"
    return $false
  }
}

function Stop-LabProcesses {
  if (-not (Test-Path $sessionRoot)) {
    Write-Result "ok" "No dev lab processes found"
    return
  }

  Get-ChildItem -Path $sessionRoot -Filter "*.pid" -ErrorAction SilentlyContinue | ForEach-Object {
    $name = $_.BaseName
    $pidText = Get-Content -Path $_.FullName -ErrorAction SilentlyContinue | Select-Object -First 1
    $pidValue = 0
    $parsed = [int]::TryParse($pidText, [ref] $pidValue)
    if (-not $parsed) {
      Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
      return
    }

    $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
    if ($process) {
      taskkill.exe /PID $pidValue /T /F | Out-Null
      Write-Result "ok" "Stopped $name, PID $pidValue"
    } else {
      Write-Result "ok" "$name was not running"
    }
    Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
  }
}

function Escape-PowerShellString {
  param([string] $Text)
  return $Text.Replace("'", "''")
}

function Start-LabService {
  param(
    [string] $Name,
    [int] $Port,
    [string] $Command
  )

  if (Test-PortOpen "127.0.0.1" $Port) {
    Write-Result "warn" "$Name port $Port is already in use; skipped"
    return
  }

  New-Item -ItemType Directory -Force -Path $sessionRoot | Out-Null
  $pidPath = Join-Path $sessionRoot "$Name.pid"
  $cmdPath = Join-Path $sessionRoot "$Name.cmd"
  $cmdContent = @(
    "@echo off",
    "cd /d ""$repoRoot""",
    "set LAN_DUAL_PASSWORD=$Password",
    $Command
  )
  Set-Content -Path $cmdPath -Value $cmdContent -Encoding ASCII

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "cmd.exe"
  $psi.Arguments = "/c ""$cmdPath"""
  $psi.WorkingDirectory = $repoRoot
  $psi.UseShellExecute = $true
  $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden

  $process = [System.Diagnostics.Process]::Start($psi)
  Start-Sleep -Milliseconds 250
  if ($process.HasExited) {
    Write-Result "error" "$Name exited immediately with code $($process.ExitCode)"
    return
  }

  Set-Content -Path $pidPath -Value $process.Id -Encoding ASCII
  Write-Result "ok" "Started $Name, PID $($process.Id), port $Port"
}

Write-Host "LAN Dual Control Windows dev lab"
Write-Host "Repo: $repoRoot"

if ($Stop) {
  Write-Section "Stop services"
  Stop-LabProcesses
  exit 0
}

Write-Section "Base tools"
$nodeOk = Test-CommandAvailable "node"
$npmOk = Test-CommandAvailable "npm.cmd"
$gitOk = Test-CommandAvailable "git"

Write-Section "Syntax and protocol checks"
if ($nodeOk) {
  Invoke-Check "Windows client mapping-utils.js" "node" @("--check", "apps\windows-client\mapping-utils.js") | Out-Null
  Invoke-Check "Windows client app.js" "node" @("--check", "apps\windows-client\app.js") | Out-Null
  Invoke-Check "Windows client protocol-client.js" "node" @("--check", "apps\windows-client\protocol-client.js") | Out-Null
  Invoke-Check "Windows client coordinate mapping" "node" @("scripts\windows\test-coordinate-mapping.mjs") | Out-Null
  Invoke-Check "Mock Mac host" "node" @("--check", "apps\mock-mac-host\server.mjs") | Out-Null
  Invoke-Check "Protocol example JSON" "node" @("-e", "const fs=require('fs'); JSON.parse(fs.readFileSync('shared/protocol/messages.example.json','utf8'));") | Out-Null
}
if ($npmOk) {
  Invoke-Check "Windows host skeleton" "npm.cmd" @("run", "check") (Join-Path $repoRoot "apps\windows-host") | Out-Null
}

Write-Section "Ports"
foreach ($item in @(
  @{ Name = "Windows client page"; Port = $ClientPort },
  @{ Name = "Mock Mac WebSocket"; Port = $MockMacPort },
  @{ Name = "Windows host"; Port = $WindowsHostPort }
)) {
  if (Test-PortOpen "127.0.0.1" $item.Port) {
    Write-Result "used" "$($item.Name) port $($item.Port) is open"
  } else {
    Write-Result "free" "$($item.Name) port $($item.Port) is free"
  }
}

if ($Build) {
  Write-Section "Desktop exe build"
  Invoke-Check "Windows desktop exe" "npm.cmd" @("run", "build") (Join-Path $repoRoot "apps\windows-desktop") | Out-Null
} else {
  $exePath = Join-Path $repoRoot "apps\windows-desktop\src-tauri\target\release\lan-dual-control-windows.exe"
  Write-Section "Desktop exe"
  if (Test-Path $exePath) {
    Write-Result "ok" "Exists: $exePath"
  } else {
    Write-Result "warn" "Not found; rerun with -Build to build it"
  }
}

if ($Start) {
  Write-Section "Start services"
  Start-LabService "windows-client" $ClientPort "node apps\windows-client\server.mjs $ClientPort"
  Start-LabService "mock-mac-host" $MockMacPort "node apps\mock-mac-host\server.mjs $MockMacPort 127.0.0.1"
  Start-LabService "windows-host" $WindowsHostPort "node apps\windows-host\server.mjs $WindowsHostPort 127.0.0.1"

  Start-Sleep -Milliseconds 1800
  Write-Section "HTTP checks"
  if (-not (Test-Url "Windows client page" "http://127.0.0.1:$ClientPort/")) { $script:HadFailure = $true }
  if (-not (Test-Url "Mock Mac discovery" "http://127.0.0.1:$MockMacPort/discovery")) { $script:HadFailure = $true }
  if (-not (Test-Url "Windows host discovery" "http://127.0.0.1:$WindowsHostPort/discovery")) { $script:HadFailure = $true }

  Write-Host ""
  Write-Host "Open: http://127.0.0.1:$ClientPort/"
  Write-Host "Mock Mac: 127.0.0.1:$MockMacPort, password: $Password"
  Write-Host "Windows host: 127.0.0.1:$WindowsHostPort, password: $Password"
  Write-Host "Stop: scripts\windows\dev-lab.ps1 -Stop"
}

if ($script:HadFailure) {
  Write-Host ""
  Write-Result "error" "Dev lab check failed"
  exit 1
}

Write-Host ""
Write-Result "ok" "Dev lab check passed"
