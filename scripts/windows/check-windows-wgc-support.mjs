import { spawn } from "node:child_process";

const defaults = {
  timeoutMs: 10000,
  requireSupported: false,
  json: false,
  verbose: false,
};

function printHelp() {
  console.log(`Usage:
  node scripts/windows/check-windows-wgc-support.mjs [options]

Options:
  --timeoutMs <ms>        PowerShell probe timeout. Default: ${defaults.timeoutMs}
  --requireSupported     Exit non-zero when Windows Graphics Capture is unavailable
  --json                 Print machine-readable JSON summary
  --verbose              Print raw probe details
  --help, -h             Show this help without probing

Description:
  Runs a read-only preflight for the future Windows Graphics Capture backend.
  It does not start capture, does not replace the current FFmpeg gdigrab path,
  and does not change system settings.
`);
}

function parseArgs(argv) {
  const args = { ...defaults, help: false };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--requireSupported") {
      args.requireSupported = true;
      continue;
    }
    if (token === "--json") {
      args.json = true;
      continue;
    }
    if (token === "--verbose") {
      args.verbose = true;
      continue;
    }
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = Math.max(3000, Number(next) || defaults.timeoutMs);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function print(kind, text, args) {
  if (args.json) return;
  console.log(`[${kind}] ${text}`);
}

function makeProbeScript() {
  return String.raw`
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Test-WinRtType {
  param(
    [Parameter(Mandatory=$true)][string]$Name,
    [Parameter(Mandatory=$true)][scriptblock]$Resolver
  )
  try {
    $type = & $Resolver
    [pscustomobject]@{
      name = $Name
      available = [bool]($null -ne $type)
      fullName = if ($null -ne $type) { [string]$type.FullName } else { "" }
      error = ""
    }
  } catch {
    [pscustomobject]@{
      name = $Name
      available = $false
      fullName = ""
      error = [string]$_.Exception.Message
    }
  }
}

$os = $null
$osError = ""
try {
  $os = Get-CimInstance Win32_OperatingSystem |
    Select-Object Caption, Version, BuildNumber, OSArchitecture
} catch {
  $osError = [string]$_.Exception.Message
}

$gpuError = ""
$gpus = @()
try {
  $gpus = @(Get-CimInstance Win32_VideoController | ForEach-Object {
    $pnp = [string]$_.PNPDeviceID
    $name = [string]$_.Name
    $virtual = ($pnp -like "ROOT\DISPLAY\*") -or ($name -match "Virtual|Parsec|ToDesk|Oray|GameViewer|MuMu")
    [pscustomobject]@{
      name = $name
      driverVersion = [string]$_.DriverVersion
      adapterRam = if ($null -ne $_.AdapterRAM) { [int64]$_.AdapterRAM } else { $null }
      pnpDeviceId = $pnp
      hardwareAdapter = [bool]($pnp -like "PCI\*")
      virtualAdapter = [bool]$virtual
    }
  })
} catch {
  $gpuError = [string]$_.Exception.Message
}

$graphicsCaptureItem = Test-WinRtType "Windows.Graphics.Capture.GraphicsCaptureItem" {
  [Windows.Graphics.Capture.GraphicsCaptureItem, Windows.Graphics.Capture, ContentType=WindowsRuntime]
}
$graphicsCaptureSession = Test-WinRtType "Windows.Graphics.Capture.GraphicsCaptureSession" {
  [Windows.Graphics.Capture.GraphicsCaptureSession, Windows.Graphics.Capture, ContentType=WindowsRuntime]
}
$captureFramePool = Test-WinRtType "Windows.Graphics.Capture.Direct3D11CaptureFramePool" {
  [Windows.Graphics.Capture.Direct3D11CaptureFramePool, Windows.Graphics.Capture, ContentType=WindowsRuntime]
}
$direct3dDevice = Test-WinRtType "Windows.Graphics.DirectX.Direct3D11.IDirect3DDevice" {
  [Windows.Graphics.DirectX.Direct3D11.IDirect3DDevice, Windows.Graphics.DirectX.Direct3D11, ContentType=WindowsRuntime]
}

$sessionSupported = $null
$sessionSupportedError = ""
try {
  if ($graphicsCaptureSession.available) {
    $sessionSupported = [Windows.Graphics.Capture.GraphicsCaptureSession, Windows.Graphics.Capture, ContentType=WindowsRuntime]::IsSupported()
  }
} catch {
  $sessionSupportedError = [string]$_.Exception.Message
}

[pscustomobject]@{
  platform = "win32"
  os = [pscustomobject]@{
    caption = if ($null -ne $os) { [string]$os.Caption } else { "" }
    version = if ($null -ne $os) { [string]$os.Version } else { "" }
    buildNumber = if ($null -ne $os) { [int]$os.BuildNumber } else { 0 }
    architecture = if ($null -ne $os) { [string]$os.OSArchitecture } else { "" }
    error = [string]$osError
  }
  winrtTypes = @($graphicsCaptureItem, $graphicsCaptureSession, $captureFramePool, $direct3dDevice)
  graphicsCaptureSessionIsSupported = $sessionSupported
  graphicsCaptureSessionIsSupportedError = $sessionSupportedError
  gpus = $gpus
  gpuError = [string]$gpuError
} | ConvertTo-Json -Depth 6 -Compress
`;
}

function runPowerShellProbe(timeoutMs) {
  if (process.platform !== "win32") {
    return Promise.resolve({
      platform: process.platform,
      os: {},
      winrtTypes: [],
      graphicsCaptureSessionIsSupported: null,
      graphicsCaptureSessionIsSupportedError: "Windows Graphics Capture is only available on Windows.",
      gpus: [],
    });
  }

  return new Promise((resolveProbe, rejectProbe) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", makeProbeScript()],
      {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      rejectProbe(new Error(`Windows Graphics Capture probe timed out after ${timeoutMs} ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      rejectProbe(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      if (exitCode !== 0) {
        rejectProbe(new Error(stderr.trim() || `PowerShell exited with ${exitCode}`));
        return;
      }
      try {
        resolveProbe(JSON.parse(stdout.trim().replace(/^\uFEFF/, "")));
      } catch (error) {
        rejectProbe(new Error(`Unable to parse WGC probe JSON: ${error.message}`));
      }
    });
  });
}

function summarizeProbe(probe) {
  const minWgcBuild = 17134;
  const osBuild = Number(probe.os?.buildNumber) || 0;
  const types = Array.isArray(probe.winrtTypes) ? probe.winrtTypes : [];
  const typeByName = new Map(types.map((type) => [type.name, type]));
  const requiredTypeNames = [
    "Windows.Graphics.Capture.GraphicsCaptureItem",
    "Windows.Graphics.Capture.GraphicsCaptureSession",
    "Windows.Graphics.Capture.Direct3D11CaptureFramePool",
    "Windows.Graphics.DirectX.Direct3D11.IDirect3DDevice",
  ];
  const missingTypes = requiredTypeNames.filter((name) => !typeByName.get(name)?.available);
  const gpus = Array.isArray(probe.gpus) ? probe.gpus : [];
  const hardwareGpus = gpus.filter((gpu) => gpu.hardwareAdapter);
  const virtualGpus = gpus.filter((gpu) => gpu.virtualAdapter);
  const sessionSupported = probe.graphicsCaptureSessionIsSupported;

  const blockers = [];
  const notes = [];
  if (process.platform !== "win32") {
    blockers.push(`platform ${process.platform} is not Windows`);
  }
  if (osBuild > 0 && osBuild < minWgcBuild) {
    blockers.push(`Windows build ${osBuild} < ${minWgcBuild}`);
  }
  if (missingTypes.length > 0) {
    blockers.push(`missing WinRT type(s): ${missingTypes.join(", ")}`);
  }
  if (sessionSupported === false) {
    blockers.push("GraphicsCaptureSession.IsSupported() returned false");
  }

  if (osBuild === 0) {
    notes.push("Windows build number was not reported");
  }
  if (probe.os?.error) {
    notes.push(`Windows OS detail unavailable: ${probe.os.error}`);
  }
  if (sessionSupported == null && !probe.graphicsCaptureSessionIsSupportedError) {
    notes.push("GraphicsCaptureSession.IsSupported() did not return a value");
  }
  if (probe.graphicsCaptureSessionIsSupportedError) {
    notes.push(`GraphicsCaptureSession.IsSupported() check unavailable: ${probe.graphicsCaptureSessionIsSupportedError}`);
  }
  if (probe.gpuError) {
    notes.push(`GPU detail unavailable: ${probe.gpuError}`);
  }
  if (gpus.length === 0) {
    notes.push("No Win32 video controllers were reported");
  } else if (hardwareGpus.length === 0) {
    notes.push("Only virtual display adapters were reported");
  }

  const supported = blockers.length === 0;
  return {
    supported,
    required: false,
    osBuild,
    osCaption: probe.os?.caption || "",
    osVersion: probe.os?.version || "",
    sessionSupported,
    requiredTypesAvailable: missingTypes.length === 0,
    missingTypes,
    gpuCount: gpus.length,
    hardwareGpuCount: hardwareGpus.length,
    virtualGpuCount: virtualGpus.length,
    hardwareGpus: hardwareGpus.map((gpu) => ({
      name: gpu.name || "",
      driverVersion: gpu.driverVersion || "",
      adapterRam: gpu.adapterRam ?? null,
    })),
    virtualGpus: virtualGpus.map((gpu) => ({
      name: gpu.name || "",
      driverVersion: gpu.driverVersion || "",
    })),
    blockers,
    notes,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const probe = await runPowerShellProbe(args.timeoutMs);
  const summary = summarizeProbe(probe);
  summary.required = args.requireSupported;
  const ok = summary.supported || !args.requireSupported;
  const result = { ok, summary, probe: args.verbose ? probe : undefined };

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    print("INFO", `OS: ${summary.osCaption || "unknown"} build ${summary.osBuild || "unknown"}`, args);
    print("INFO", `GPU: ${summary.hardwareGpuCount} hardware adapter(s), ${summary.virtualGpuCount} virtual adapter(s)`, args);
    if (summary.supported) {
      print("OK", "Windows Graphics Capture preflight passed; current FFmpeg path remains unchanged.", args);
    } else {
      print(
        args.requireSupported ? "ERROR" : "INFO",
        `Windows Graphics Capture is not ready yet: ${summary.blockers.join("; ") || "unknown reason"}`,
        args,
      );
      print("INFO", "This is informational until the WGC backend is implemented and explicitly required.", args);
    }
    for (const note of summary.notes) {
      print("INFO", note, args);
    }
  }

  process.exitCode = ok ? 0 : 1;
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
