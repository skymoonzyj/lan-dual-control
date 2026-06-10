# Run this file from an elevated PowerShell window.
# It configures machine-level Rust paths and installs Visual Studio C++ Build Tools.

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..\..")
$workspaceRoot = Split-Path -Parent $repoRoot
$toolsRoot = Join-Path $workspaceRoot ".tools"
$cargoHome = Join-Path $toolsRoot "cargo"
$rustupHome = Join-Path $toolsRoot "rustup"
$cargoBin = Join-Path $cargoHome "bin"
$buildToolsInstaller = Join-Path $toolsRoot "installers\vs_BuildTools.exe"

function Add-MachinePathEntry {
  param([string] $PathEntry)

  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $entries = $machinePath -split ";" | Where-Object { $_ -ne "" }

  if ($entries -notcontains $PathEntry) {
    [Environment]::SetEnvironmentVariable("Path", "$PathEntry;$machinePath", "Machine")
  }
}

Write-Host "Configuring machine Rust environment..."
[Environment]::SetEnvironmentVariable("RUSTUP_HOME", $rustupHome, "Machine")
[Environment]::SetEnvironmentVariable("CARGO_HOME", $cargoHome, "Machine")
Add-MachinePathEntry $cargoBin

if (-not (Test-Path $buildToolsInstaller)) {
  throw "Visual Studio Build Tools installer not found: $buildToolsInstaller"
}

Write-Host "Installing Visual Studio C++ Build Tools..."
Start-Process -FilePath $buildToolsInstaller -ArgumentList @(
  "--quiet",
  "--wait",
  "--norestart",
  "--nocache",
  "--add",
  "Microsoft.VisualStudio.Workload.VCTools",
  "--includeRecommended"
) -Wait

Write-Host "Done. Open a new terminal and run scripts/windows/verify-dev-env.ps1."
