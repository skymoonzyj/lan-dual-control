# Run this file from an elevated PowerShell window.
# It configures machine-level Rust paths and installs Visual Studio C++ Build Tools.

param(
  [Alias("h")]
  [switch] $Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
  Write-Output @"
Usage:
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\setup-dev-env-admin.ps1 [options]
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\setup-dev-env-admin.ps1 [options]

Common examples:
  # Show this help first; it is safe from a non-admin terminal.
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\setup-dev-env-admin.ps1 -Help

  # From an elevated terminal, configure machine-level dev paths and run the
  # Visual Studio Build Tools installer.
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\setup-dev-env-admin.ps1

Options:
  -Help, -h  Show this help without creating directories, changing machine
             environment variables, or starting the Build Tools installer.

Safety:
  Running without -Help requires an elevated terminal and may modify machine
  RUSTUP_HOME, CARGO_HOME, and Path, then start the Visual Studio Build Tools
  installer from C:\DevTools\installers\vs_BuildTools.exe. -Help exits before
  any system-level operation.
"@
  exit 0
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$toolsRoot = "C:\DevTools"
$cargoHome = Join-Path $toolsRoot "cargo"
$rustupHome = Join-Path $toolsRoot "rustup"
$cargoBin = Join-Path $cargoHome "bin"
$buildToolsInstaller = Join-Path $toolsRoot "installers\vs_BuildTools.exe"

New-Item -ItemType Directory -Force $toolsRoot | Out-Null

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
$installer = Start-Process -FilePath $buildToolsInstaller -ArgumentList @(
  "--quiet",
  "--wait",
  "--norestart",
  "--nocache",
  "--add",
  "Microsoft.VisualStudio.Workload.VCTools",
  "--includeRecommended"
) -Wait -PassThru

if ($installer.ExitCode -ne 0 -and $installer.ExitCode -ne 3010) {
  throw "Visual Studio Build Tools installer failed with exit code $($installer.ExitCode)."
}

Write-Host "Done. Open a new terminal and run scripts/windows/verify-dev-env.ps1."
