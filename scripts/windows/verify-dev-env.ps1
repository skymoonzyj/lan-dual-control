$ErrorActionPreference = "Continue"

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

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..\..")
$workspaceRoot = Split-Path -Parent $repoRoot
$toolsRoot = Join-Path $workspaceRoot ".tools"
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
Test-Command "MSVC cl.exe" "cl" @()
Test-Command "MSBuild" "msbuild" @("-version")

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
