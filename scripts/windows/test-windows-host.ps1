param(
  [string] $HostName = "127.0.0.1",
  [int] $Port = 43772,
  [string] $Password = "demo-password",
  [int] $TimeoutMs = 15000,
  [int] $Width = 640,
  [int] $Height = 360,
  [int] $Fps = 2,
  [int] $BandwidthKbps = 5000,
  [int] $ClipboardFileBytes = 128,
  [ValidateSet("auto", "ffmpeg", "system", "mock")]
  [string] $ScreenMode = "auto",
  [ValidateSet("auto", "system", "memory")]
  [string] $ClipboardMode = "system",
  [ValidateSet("auto", "system", "log")]
  [string] $InputMode = "log",
  [ValidateSet("auto", "mock", "dshow", "wasapi")]
  [string] $AudioMode = "auto",
  [string] $AudioDevice = $env:LAN_DUAL_WINDOWS_AUDIO_DEVICE,
  [string] $Ffmpeg = $env:LAN_DUAL_FFMPEG,
  [switch] $UseExisting,
  [switch] $KeepRunning,
  [switch] $MockVideo,
  [switch] $SkipClipboardText,
  [switch] $SkipClipboardFile,
  [switch] $RequireAudio,
  [switch] $InputEvents,
  [Alias("h")]
  [switch] $Help
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..\..")
$probeScript = Join-Path $scriptRoot "probe-mac-host.mjs"
$serverScript = Join-Path $repoRoot "apps\windows-host\server.mjs"
$startedProcess = $null

if ($Help) {
  Write-Output @"
Usage:
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\test-windows-host.ps1 [options]

Common examples:
  # Show this help without launching Windows host or probes.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\test-windows-host.ps1 -Help

  # Low-risk self-test with mock video and no clipboard checks.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\test-windows-host.ps1 -MockVideo -SkipClipboardText -SkipClipboardFile

  # Validate real FFmpeg screen capture at a requested frame rate.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\test-windows-host.ps1 -ScreenMode ffmpeg -Fps 30

  # Validate WASAPI loopback audio frames.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\test-windows-host.ps1 -AudioMode wasapi -RequireAudio

  # Safe input acknowledgement check; log mode does not inject real input.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\test-windows-host.ps1 -InputEvents -InputMode log

Options:
  -HostName <host>          Windows host bind/probe host. Default: 127.0.0.1.
  -Port <port>              Windows host port. Default: 43772.
  -Password <text>          Local test password for the temporary host. Default: demo-password.
  -TimeoutMs <ms>           Probe timeout. Default: 15000.
  -Width <px>               Requested session width. Default: 640.
  -Height <px>              Requested session height. Default: 360.
  -Fps <hz>                 Requested session refresh rate. Default: 2.
  -BandwidthKbps <kbps>     Requested video bandwidth. Default: 5000.
  -ScreenMode <mode>        auto, ffmpeg, system, or mock.
  -ClipboardMode <mode>     auto, system, or memory.
  -InputMode <mode>         auto, system, or log. Default: log.
  -AudioMode <mode>         auto, mock, dshow, or wasapi.
  -AudioDevice <name>       Optional DirectShow audio device name.
  -Ffmpeg <path>            FFmpeg path; defaults to LAN_DUAL_FFMPEG or C:\DevTools.
  -UseExisting              Probe an already running host on the target port.
  -KeepRunning              Keep the temporary host running after the probe.
  -MockVideo                Force mock video instead of real screen capture.
  -SkipClipboardText        Skip text clipboard verification.
  -SkipClipboardFile        Skip file clipboard verification.
  -ClipboardFileBytes <n>   Test file size for file clipboard verification.
  -RequireAudio             Require at least one audio frame.
  -InputEvents              Send input events and require the expected input mode.
  -Help, -h                 Show this help.

Safety:
  -Help/-h exits before checking ports, launching Windows host, running probes,
  authenticating, touching clipboard, capturing screen/audio, or sending input.
  Without -Help this script may start a temporary local Windows host; keep
  -InputMode log unless a user is watching the screen for real input tests.
"@
  exit 0
}

if (-not $Ffmpeg) {
  $defaultFfmpeg = "C:\DevTools\ffmpeg\bin\ffmpeg.exe"
  if (Test-Path $defaultFfmpeg) {
    $Ffmpeg = $defaultFfmpeg
  }
}

function Test-PortOpen {
  param(
    [string] $TargetHost,
    [int] $TargetPort
  )

  $client = New-Object Net.Sockets.TcpClient
  try {
    $async = $client.BeginConnect($TargetHost, $TargetPort, $null, $null)
    $open = $async.AsyncWaitHandle.WaitOne(450)
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

function Get-TemporaryTcpPort {
  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  try {
    $listener.Start()
    return $listener.LocalEndpoint.Port
  } finally {
    $listener.Stop()
  }
}

function Start-LocalWindowsHost {
  $envBlock = @{
    "LAN_DUAL_PASSWORD" = $Password
    "LAN_DUAL_WINDOWS_SCREEN_MODE" = if ($MockVideo) { "mock" } else { $ScreenMode }
    "LAN_DUAL_WINDOWS_CLIPBOARD_MODE" = $ClipboardMode
    "LAN_DUAL_WINDOWS_INPUT_MODE" = $InputMode
    "LAN_DUAL_WINDOWS_MAX_SCREEN_FPS" = [string]([Math]::Max(1, [Math]::Min($Fps, 60)))
  }
  if ($AudioMode -ne "auto") {
    $envBlock["LAN_DUAL_WINDOWS_AUDIO_MODE"] = $AudioMode
  }
  if ($AudioDevice) {
    $envBlock["LAN_DUAL_WINDOWS_AUDIO_DEVICE"] = $AudioDevice
  }
  if ($Ffmpeg) {
    $envBlock["LAN_DUAL_FFMPEG"] = $Ffmpeg
  }

  $previousEnv = @{}
  foreach ($entry in $envBlock.GetEnumerator()) {
    $previousEnv[$entry.Key] = [Environment]::GetEnvironmentVariable($entry.Key, "Process")
    [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, "Process")
  }

  try {
    $process = Start-Process -FilePath "node" `
      -ArgumentList @($serverScript, [string] $Port, $HostName) `
      -WorkingDirectory $repoRoot `
      -PassThru `
      -WindowStyle Hidden
  } finally {
    foreach ($entry in $previousEnv.GetEnumerator()) {
      [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, "Process")
    }
  }

  for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
    if ($process.HasExited) {
      throw "Windows host exited early with code $($process.ExitCode)"
    }
    if (Test-PortOpen $HostName $Port) {
      Write-Host "[OK] Started local Windows host PID $($process.Id) on $HostName`:$Port"
      return $process
    }
    Start-Sleep -Milliseconds 200
  }

  throw "Windows host did not open $HostName`:$Port in time"
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host "[ERROR] node not found"
  exit 1
}

Push-Location $repoRoot
try {
  $portAlreadyOpen = Test-PortOpen $HostName $Port
  if ($portAlreadyOpen) {
    if ($UseExisting) {
      Write-Host "[OK] Using existing Windows host on $HostName`:$Port"
    } else {
      $requestedPort = $Port
      $Port = Get-TemporaryTcpPort
      Write-Host "[INFO] $HostName`:$requestedPort is already open; using temporary Windows host port $Port. Pass -UseExisting to test the existing host."
      $startedProcess = Start-LocalWindowsHost
    }
  } else {
    $startedProcess = Start-LocalWindowsHost
  }

  $nodeArgs = @(
    $probeScript,
    "--host", $HostName,
    "--port", $Port,
    "--password", $Password,
    "--timeoutMs", $TimeoutMs,
    "--width", $Width,
    "--height", $Height,
    "--fps", $Fps,
    "--bandwidthKbps", $BandwidthKbps,
    "--preferredVideoCodec", "mjpeg"
  )

  if (-not $MockVideo) {
    $nodeArgs += "--requireRealVideo"
  }
  if (-not $SkipClipboardText) {
    $nodeArgs += "--clipboardText"
  }
  if (-not $SkipClipboardFile) {
    $nodeArgs += @("--clipboardFile", "--clipboardFileBytes", $ClipboardFileBytes)
  }
  if ($RequireAudio) {
    $nodeArgs += "--requireAudio"
  }
  if ($InputEvents) {
    $nodeArgs += @("--inputEvents", "--expectInputMode", $InputMode)
  }

  & node @nodeArgs
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    exit $exitCode
  }

  Write-Host "[OK] Windows host self-test passed"
} finally {
  if ($startedProcess -and -not $KeepRunning) {
    Stop-Process -Id $startedProcess.Id -Force -ErrorAction SilentlyContinue
    Write-Host "[OK] Stopped local Windows host PID $($startedProcess.Id)"
  } elseif ($startedProcess -and $KeepRunning) {
    Write-Host "[INFO] Local Windows host kept running on $HostName`:$Port, PID $($startedProcess.Id)"
  }
  Pop-Location
}
