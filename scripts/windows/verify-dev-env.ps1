param(
  [Alias("h")]
  [switch] $Help
)

$ErrorActionPreference = "Continue"

if ($Help) {
  Write-Output @"
Usage:
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-dev-env.ps1 [options]
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-dev-env.ps1 [options]

Common examples:
  # Check whether the Windows development tools are available.
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-dev-env.ps1

Options:
  -Help, -h  Show this help without probing local tools.

Safety:
  This checker is read-only. It does not install tools, change system
  environment variables, start remote hosts, authenticate, print passwords, or
  send input/inject events. -Help exits before running any probes.
"@
  exit 0
}

function Test-Command {
  param(
    [string] $Name,
    [string] $Command,
    [string[]] $Arguments = @("--version")
  )

  $resolved = Get-Command $Command -ErrorAction SilentlyContinue
  if (-not $resolved) {
    Write-Host "[missing] $Name"
    return
  }

  try {
    $output = & $Command @Arguments 2>&1 | Select-Object -First 1
    Write-Host "[ok] $Name - $output"
  } catch {
    Write-Host "[error] $Name - $($_.Exception.Message)"
  }
}

function Test-ExecutablePath {
  param(
    [string] $Name,
    [string] $Path,
    [string[]] $Arguments = @("--version")
  )

  if (-not $Path -or -not (Test-Path $Path)) {
    Write-Host "[missing] $Name"
    return
  }

  try {
    $output = & $Path @Arguments 2>&1 | Select-Object -First 1
    Write-Host "[ok] $Name - $output"
  } catch {
    Write-Host "[error] $Name - $($_.Exception.Message)"
  }
}

function Find-FirstFile {
  param(
    [string[]] $Roots,
    [string] $Filter
  )

  foreach ($root in $Roots) {
    if (-not (Test-Path $root)) {
      continue
    }

    $match = Get-ChildItem $root -Recurse -Filter $Filter -ErrorAction SilentlyContinue |
      Select-Object -First 1 -ExpandProperty FullName

    if ($match) {
      return $match
    }
  }

  return $null
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..\..")
$toolsRoot = "C:\DevTools"
$cargoBin = Join-Path $toolsRoot "cargo\bin"

$env:RUSTUP_HOME = [Environment]::GetEnvironmentVariable("RUSTUP_HOME", "User")
if (-not $env:RUSTUP_HOME) {
  $env:RUSTUP_HOME = [Environment]::GetEnvironmentVariable("RUSTUP_HOME", "Machine")
}
if (-not $env:RUSTUP_HOME) {
  $env:RUSTUP_HOME = Join-Path $toolsRoot "rustup"
}

$env:CARGO_HOME = [Environment]::GetEnvironmentVariable("CARGO_HOME", "User")
if (-not $env:CARGO_HOME) {
  $env:CARGO_HOME = [Environment]::GetEnvironmentVariable("CARGO_HOME", "Machine")
}
if (-not $env:CARGO_HOME) {
  $env:CARGO_HOME = Join-Path $toolsRoot "cargo"
}

if (($env:Path -split ";") -notcontains $cargoBin) {
  $env:Path = "$cargoBin;$env:Path"
}

Write-Host "Windows development environment"
Write-Host "Repo: $repoRoot"
Write-Host "Tools: $toolsRoot"
Write-Host ""

Test-Command "Node.js" "node"
Test-Command "npm" "npm.cmd"
Test-Command "Git" "git"
Test-Command "Rust" "rustc"
Test-Command "Cargo" "cargo"

$visualStudioRoots = @(
  "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools",
  "C:\Program Files\Microsoft Visual Studio\2022\BuildTools",
  "C:\Program Files (x86)\Microsoft Visual Studio",
  "C:\Program Files\Microsoft Visual Studio"
)
$clPath = Find-FirstFile $visualStudioRoots "cl.exe"
$msbuildPath = Find-FirstFile $visualStudioRoots "MSBuild.exe"
Test-ExecutablePath "MSVC cl.exe" $clPath @()
Test-ExecutablePath "MSBuild" $msbuildPath @("-version")

$webViewRoots = @(
  "C:\Program Files (x86)\Microsoft\EdgeWebView\Application",
  "C:\Program Files\Microsoft\EdgeWebView\Application"
)
$webViewRoot = $webViewRoots | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($webViewRoot) {
  $version = Get-ChildItem $webViewRoot -Directory | Select-Object -First 1 -ExpandProperty Name
  Write-Host "[ok] WebView2 Runtime - $version"
} else {
  Write-Host "[missing] WebView2 Runtime"
}
