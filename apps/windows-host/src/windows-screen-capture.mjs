import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const defaultDisplays = [
  {
    id: "windows-display-0",
    name: "Windows 主显示器",
    width: 1920,
    height: 1080,
    x: 0,
    y: 0,
    primary: true,
    index: 0,
  },
];

const ffmpegMode = "ffmpeg-mjpeg";
const ffmpegH264Mode = "ffmpeg-h264";
const systemMode = "system-jpeg";
const mockMode = "mock";
const wgcMode = "wgc";
const wgcRepeatFullMode = "full";
const wgcRepeatSignalMode = "signal";

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

function hasConfiguredValue(value) {
  return String(value ?? "").trim() !== "";
}

function normalizeBandwidthKbps(value, fallback = 50000) {
  return Math.round(clampNumber(value, 1000, 200000, fallback));
}

function normalizeJpegQuality(value, fallback = 0.7) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  if (number > 1) {
    return clampNumber(number, 35, 92, fallback * 100) / 100;
  }
  return clampNumber(number, 0.1, 0.95, fallback);
}

function jpegQualityPercent(jpegQuality) {
  return Math.round(clampNumber(jpegQuality, 0.1, 0.95, 0.7) * 100);
}

function normalizeQualityPreset(value) {
  const preset = String(value ?? "balanced").trim().toLowerCase();
  if (["smooth", "balanced", "sharp", "custom"].includes(preset)) {
    return preset;
  }
  return "balanced";
}

function normalizeScreenMode(value) {
  const mode = String(value ?? "auto").trim().toLowerCase();
  if (mode === "mock") {
    return mockMode;
  }
  if (mode === "wgc" || mode === "windows-graphics-capture" || mode === "windowsgraphicscapture") {
    return wgcMode;
  }
  if (mode === "ffmpeg" || mode === "ffmpeg-mjpeg" || mode === "gdigrab") {
    return ffmpegMode;
  }
  if (mode === "h264" || mode === "ffmpeg-h264" || mode === "x264" || mode === "ffmpeg-x264") {
    return ffmpegH264Mode;
  }
  if (mode === "system" || mode === "system-jpeg" || mode === "gdi" || mode === "auto") {
    return mode;
  }
  return "auto";
}

function normalizeH264CodecString(value) {
  const codec = String(value ?? "").trim();
  return /^avc1\.[0-9a-f]{6}$/i.test(codec) ? codec : "avc1.42E01F";
}

function normalizeWgcRepeatLastFrameMode(value) {
  const mode = String(value ?? wgcRepeatFullMode).trim().toLowerCase();
  if (["signal", "light", "lightweight", "thin"].includes(mode)) {
    return wgcRepeatSignalMode;
  }
  return wgcRepeatFullMode;
}

function parseJsonOutput(output) {
  const text = String(output ?? "").trim().replace(/^\uFEFF/, "");
  if (!text) {
    return null;
  }
  return JSON.parse(text);
}

function splitCommandLineArgs(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return [];
  }

  const args = [];
  let current = "";
  let quote = "";

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === "\\" && text[index + 1] === quote) {
        current += text[index + 1];
        index += 1;
        continue;
      }
      if (char === quote) {
        quote = "";
      } else {
        current += char;
      }
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (current) {
    args.push(current);
  }
  return args;
}

function commandLooksLikePath(value) {
  return /^[A-Za-z]:[\\/]/.test(value) || value.includes("/") || value.includes("\\");
}

function commandExistsOrIsPathCommand(value) {
  const command = String(value ?? "").trim();
  if (!command) {
    return false;
  }
  return commandLooksLikePath(command) ? existsSync(command) : true;
}

function truthyEnv(value) {
  const text = String(value ?? "").trim().toLowerCase();
  return text === "1" || text === "true" || text === "yes" || text === "on";
}

function makeWgcPreflightScript() {
  return `
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Test-WinRtType {
  param([string]$Name, [scriptblock]$Resolver)
  try {
    $type = & $Resolver
    [pscustomobject]@{ name = $Name; available = [bool]($null -ne $type); error = "" }
  } catch {
    [pscustomobject]@{ name = $Name; available = $false; error = [string]$_.Exception.Message }
  }
}

$osCaption = ""
$osVersion = ""
$osBuild = 0
$osError = ""
try {
  $os = Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber
  $osCaption = [string]$os.Caption
  $osVersion = [string]$os.Version
  $osBuild = [int]$os.BuildNumber
} catch {
  $osError = [string]$_.Exception.Message
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
  osBuild = [int]$osBuild
  osCaption = [string]$osCaption
  osVersion = [string]$osVersion
  osError = [string]$osError
  winrtTypes = @($graphicsCaptureItem, $graphicsCaptureSession, $captureFramePool, $direct3dDevice)
  graphicsCaptureSessionIsSupported = $sessionSupported
  graphicsCaptureSessionIsSupportedError = $sessionSupportedError
} | ConvertTo-Json -Depth 5 -Compress
`;
}

function checkWgcSupportSync(logger) {
  const requiredTypes = [
    "Windows.Graphics.Capture.GraphicsCaptureItem",
    "Windows.Graphics.Capture.GraphicsCaptureSession",
    "Windows.Graphics.Capture.Direct3D11CaptureFramePool",
    "Windows.Graphics.DirectX.Direct3D11.IDirect3DDevice",
  ];
  const result = {
    supported: false,
    osBuild: 0,
    sessionSupported: null,
    missingTypes: [],
    blockers: [],
    notes: [],
  };

  if (process.platform !== "win32") {
    result.blockers.push(`platform ${process.platform} is not Windows`);
    return result;
  }

  const probe = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", makeWgcPreflightScript()],
    {
      encoding: "utf8",
      timeout: 4000,
      windowsHide: true,
    },
  );

  if (probe.error || probe.status !== 0) {
    const message = probe.error?.message || probe.stderr?.trim() || `exit ${probe.status}`;
    result.blockers.push(`WGC preflight failed: ${message}`);
    logger?.warn(`Windows Graphics Capture 检查失败，继续使用过渡采集层：${message}`);
    return result;
  }

  try {
    const parsed = parseJsonOutput(probe.stdout) || {};
    const osBuild = Number(parsed.osBuild) || 0;
    const types = Array.isArray(parsed.winrtTypes) ? parsed.winrtTypes : [];
    result.osBuild = osBuild;
    result.sessionSupported = parsed.graphicsCaptureSessionIsSupported ?? null;
    result.missingTypes = requiredTypes.filter((name) => !types.find((type) => type.name === name && type.available));
    if (osBuild > 0 && osBuild < 17134) {
      result.blockers.push(`Windows build ${osBuild} < 17134`);
    }
    if (result.missingTypes.length > 0) {
      result.blockers.push(`missing WinRT type(s): ${result.missingTypes.join(", ")}`);
    }
    if (parsed.graphicsCaptureSessionIsSupported === false) {
      result.blockers.push("GraphicsCaptureSession.IsSupported() returned false");
    }
    if (parsed.graphicsCaptureSessionIsSupportedError) {
      result.notes.push(`GraphicsCaptureSession.IsSupported() check unavailable: ${parsed.graphicsCaptureSessionIsSupportedError}`);
    }
    if (parsed.osError) {
      result.notes.push(`Windows OS detail unavailable: ${parsed.osError}`);
    }
    result.supported = result.blockers.length === 0;
  } catch (error) {
    result.blockers.push(`WGC preflight JSON parse failed: ${error.message}`);
  }

  return result;
}

function makePowerShellDisplayScript() {
  return `
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
$screens = [System.Windows.Forms.Screen]::AllScreens
$items = @()
for ($i = 0; $i -lt $screens.Length; $i++) {
  $screen = $screens[$i]
  $bounds = $screen.Bounds
  $items += [pscustomobject]@{
    id = "windows-display-$i"
    name = if ($screen.Primary) { "Windows 主显示器" } else { "Windows 显示器 " + ($i + 1) }
    width = [int]$bounds.Width
    height = [int]$bounds.Height
    x = [int]$bounds.X
    y = [int]$bounds.Y
    primary = [bool]$screen.Primary
    index = [int]$i
  }
}
$items | ConvertTo-Json -Compress
`;
}

function loadWindowsDisplaysSync(logger) {
  if (process.platform !== "win32") {
    return defaultDisplays;
  }

  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", makePowerShellDisplayScript()],
    {
      encoding: "utf8",
      timeout: 3000,
      windowsHide: true,
    },
  );

  if (result.error || result.status !== 0) {
    const message = result.error?.message || result.stderr?.trim() || `exit ${result.status}`;
    logger?.warn(`枚举 Windows 显示器失败，使用默认显示器：${message}`);
    return defaultDisplays;
  }

  try {
    const parsed = parseJsonOutput(result.stdout);
    const displays = Array.isArray(parsed) ? parsed : [parsed].filter(Boolean);
    const normalized = displays
      .map((display, index) => ({
        id: String(display.id || `windows-display-${index}`),
        name: String(display.name || `Windows 显示器 ${index + 1}`),
        width: clampNumber(display.width, 1, 16384, 1920),
        height: clampNumber(display.height, 1, 16384, 1080),
        x: Number(display.x) || 0,
        y: Number(display.y) || 0,
        primary: Boolean(display.primary),
        index: Number.isInteger(Number(display.index)) ? Number(display.index) : index,
      }))
      .filter((display) => display.width > 0 && display.height > 0);

    if (normalized.length > 0) {
      return normalized;
    }
  } catch (error) {
    logger?.warn(`解析 Windows 显示器信息失败，使用默认显示器：${error.message}`);
  }

  return defaultDisplays;
}

function hasFfmpegGdigrabSync({ ffmpegCommand = "ffmpeg", logger } = {}) {
  if (process.platform !== "win32") {
    return false;
  }

  const result = spawnSync(ffmpegCommand, ["-hide_banner", "-formats"], {
    encoding: "utf8",
    timeout: 3000,
    windowsHide: true,
  });

  if (result.error || result.status !== 0) {
    const message = result.error?.message || result.stderr?.trim() || `exit ${result.status}`;
    logger?.warn(`FFmpeg 不可用，Windows 屏幕采集使用 PowerShell 过渡层：${message}`);
    return false;
  }

  return `${result.stdout}\n${result.stderr}`.includes("gdigrab");
}

function qscaleFromJpegQuality(jpegQuality) {
  const normalized = (jpegQualityPercent(jpegQuality) - 35) / (92 - 35);
  return Math.round(Math.min(31, Math.max(2, 31 - normalized * 26)));
}

function makePowerShellCaptureScript({ displayIndex, targetWidth, targetHeight, quality }) {
  return `
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$displayIndex = ${displayIndex}
$targetWidth = ${targetWidth}
$targetHeight = ${targetHeight}
$quality = ${quality}
$sourceBitmap = $null
$sourceGraphics = $null
$frameBitmap = $null
$resizeGraphics = $null
$stream = $null
$encoderParams = $null
$json = $null

try {
  $screens = [System.Windows.Forms.Screen]::AllScreens
  if ($screens.Length -eq 0) {
    throw "No Windows screen is available"
  }
  if ($displayIndex -lt 0 -or $displayIndex -ge $screens.Length) {
    $screen = $screens | Where-Object { $_.Primary } | Select-Object -First 1
    if ($null -eq $screen) { $screen = $screens[0] }
  } else {
    $screen = $screens[$displayIndex]
  }

  $bounds = $screen.Bounds
  $sourceBitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
  $sourceGraphics = [System.Drawing.Graphics]::FromImage($sourceBitmap)
  $sourceGraphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)

  if ($targetWidth -ne $bounds.Width -or $targetHeight -ne $bounds.Height) {
    $frameBitmap = New-Object System.Drawing.Bitmap $targetWidth, $targetHeight
    $resizeGraphics = [System.Drawing.Graphics]::FromImage($frameBitmap)
    $resizeGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $resizeGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $resizeGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $resizeGraphics.DrawImage($sourceBitmap, 0, 0, $targetWidth, $targetHeight)
  } else {
    $frameBitmap = $sourceBitmap
  }

  $stream = New-Object System.IO.MemoryStream
  $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
    Where-Object { $_.MimeType -eq "image/jpeg" } |
    Select-Object -First 1
  if ($null -eq $codec) {
    throw "JPEG encoder is unavailable"
  }
  $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters 1
  $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter -ArgumentList ([System.Drawing.Imaging.Encoder]::Quality), ([int64]$quality)
  $frameBitmap.Save($stream, $codec, $encoderParams)
  $bytes = $stream.ToArray()

  $json = [pscustomobject]@{
    width = [int]$targetWidth
    height = [int]$targetHeight
    sourceWidth = [int]$bounds.Width
    sourceHeight = [int]$bounds.Height
    displayIndex = [int]$displayIndex
    payloadBytes = [int]$bytes.Length
    dataBase64 = [Convert]::ToBase64String($bytes)
  } | ConvertTo-Json -Compress
}
finally {
  if ($encoderParams -ne $null) { $encoderParams.Dispose() }
  if ($stream -ne $null) { $stream.Dispose() }
  if ($resizeGraphics -ne $null) { $resizeGraphics.Dispose() }
  if ($sourceGraphics -ne $null) { $sourceGraphics.Dispose() }
  if ($frameBitmap -ne $null -and -not [object]::ReferenceEquals($frameBitmap, $sourceBitmap)) {
    $frameBitmap.Dispose()
  }
  if ($sourceBitmap -ne $null) { $sourceBitmap.Dispose() }
}

$json
`;
}

function runPowerShellJson(script, { timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true },
    );

    const stdout = [];
    const stderr = [];
    let settled = false;

    const finish = (error, value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    };

    const timer = setTimeout(() => {
      child.kill();
      finish(new Error(`PowerShell screen capture timed out after ${timeoutMs} ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (code !== 0) {
        const detail = Buffer.concat(stderr).toString("utf8").trim();
        finish(new Error(detail || `PowerShell screen capture exited with ${code}`));
        return;
      }

      try {
        finish(null, parseJsonOutput(Buffer.concat(stdout).toString("utf8")));
      } catch (error) {
        finish(error);
      }
    });
  });
}

export class WindowsScreenCaptureCoordinator {
  constructor({ logger } = {}) {
    this.logger = logger;
    this.requestedMode = normalizeScreenMode(process.env.LAN_DUAL_WINDOWS_SCREEN_MODE);
    this.ffmpegCommand = process.env.LAN_DUAL_FFMPEG || "ffmpeg";
    this.ffmpegAvailable = hasFfmpegGdigrabSync({ ffmpegCommand: this.ffmpegCommand, logger });
    this.h264CodecString = normalizeH264CodecString(process.env.LAN_DUAL_WINDOWS_H264_CODEC_STRING);
    this.wgcHelperCommand = String(process.env.LAN_DUAL_WINDOWS_WGC_HELPER || "").trim();
    this.wgcHelperArgs = splitCommandLineArgs(process.env.LAN_DUAL_WINDOWS_WGC_HELPER_ARGS);
    this.wgcHelperConfigured = Boolean(this.wgcHelperCommand);
    this.wgcHelperAvailable = commandExistsOrIsPathCommand(this.wgcHelperCommand);
    this.wgcHelperAllowUnsupported = truthyEnv(process.env.LAN_DUAL_WINDOWS_WGC_ALLOW_UNSUPPORTED);
    this.wgcRepeatLastFrame = truthyEnv(process.env.LAN_DUAL_WINDOWS_WGC_REPEAT_LAST_FRAME);
    this.wgcRepeatLastFrameMode = normalizeWgcRepeatLastFrameMode(process.env.LAN_DUAL_WINDOWS_WGC_REPEAT_LAST_FRAME_MODE);
    this.wgcPreflight = this.requestedMode === wgcMode ? checkWgcSupportSync(logger) : null;
    this.wgcFallbackReason = "";
    this.mode = this.resolveMode();
    this.jpegQualityOverride = hasConfiguredValue(process.env.LAN_DUAL_WINDOWS_JPEG_QUALITY)
      ? normalizeJpegQuality(process.env.LAN_DUAL_WINDOWS_JPEG_QUALITY)
      : null;
    this.captureTimeoutMs = clampNumber(process.env.LAN_DUAL_WINDOWS_CAPTURE_TIMEOUT_MS, 1000, 12000, 5000);
    this.maxScreenFps = this.mode === ffmpegMode || this.mode === ffmpegH264Mode
      ? clampNumber(process.env.LAN_DUAL_WINDOWS_MAX_SCREEN_FPS, 1, 60, 60)
      : this.mode === wgcMode
        ? clampNumber(process.env.LAN_DUAL_WINDOWS_MAX_SCREEN_FPS, 1, 240, 60)
        : this.mode === systemMode
        ? clampNumber(process.env.LAN_DUAL_WINDOWS_MAX_SCREEN_FPS, 1, 8, 4)
        : 60;
    this.displays = this.mode === ffmpegMode || this.mode === ffmpegH264Mode || this.mode === systemMode || this.mode === wgcMode
      ? loadWindowsDisplaysSync(logger)
      : defaultDisplays;
    this.lastFailure = "";
    this.lastFailureLogAt = 0;
    this.ffmpegProcess = null;
    this.ffmpegKey = "";
    this.ffmpegBuffer = Buffer.alloc(0);
    this.ffmpegFrame = null;
    this.ffmpegFrameId = 0;
    this.ffmpegFrameWaiters = [];
    this.lastServedFfmpegFrameId = 0;
    this.ffmpegStreamKind = "";
    this.ffmpegPendingH264Nals = [];
    this.ffmpegPendingH264NalTypes = [];
    this.ffmpegH264SawAud = false;
    this.wgcHelperProcess = null;
    this.wgcHelperKey = "";
    this.wgcHelperLineBuffer = "";
    this.wgcHelperFrame = null;
    this.wgcHelperFrameId = 0;
    this.wgcHelperFrameWaiters = [];
    this.lastServedWgcHelperFrameId = 0;
    this.wgcHelperInfo = null;
  }

  resolveMode() {
    if (this.requestedMode === mockMode) {
      return mockMode;
    }

    if (this.requestedMode === wgcMode) {
      const blockers = this.wgcPreflight?.blockers || [];
      const supportStatus = this.wgcPreflight?.supported
        ? "preflight passed"
        : `preflight blocked: ${blockers.join("; ") || "unknown reason"}`;
      const helperStatus = this.wgcHelperConfigured
        ? this.wgcHelperAvailable
          ? "helper configured"
          : `helper not found: ${this.wgcHelperCommand}`
        : "LAN_DUAL_WINDOWS_WGC_HELPER is not configured";
      const helperMayRun = this.wgcHelperConfigured
        && this.wgcHelperAvailable
        && (this.wgcPreflight?.supported || this.wgcHelperAllowUnsupported);
      if (helperMayRun) {
        if (!this.wgcPreflight?.supported) {
          this.logger?.warn(`Windows Graphics Capture helper is allowed despite preflight block: ${supportStatus}`);
        }
        return wgcMode;
      }
      this.wgcFallbackReason = `Windows Graphics Capture helper is not active (${supportStatus}; ${helperStatus}); using ${this.ffmpegAvailable ? "FFmpeg gdigrab" : "PowerShell/System.Drawing"} fallback`;
      this.logger?.warn(this.wgcFallbackReason);
      if (process.platform === "win32") {
        return this.ffmpegAvailable ? ffmpegMode : systemMode;
      }
      return mockMode;
    }

    if (this.requestedMode === ffmpegMode) {
      if (this.ffmpegAvailable) {
        return ffmpegMode;
      }
      this.logger?.warn("已请求 FFmpeg gdigrab，但当前环境不可用，回退 PowerShell/System.Drawing。");
      return process.platform === "win32" ? systemMode : mockMode;
    }

    if (this.requestedMode === ffmpegH264Mode) {
      if (this.ffmpegAvailable) {
        return ffmpegH264Mode;
      }
      this.logger?.warn("Requested FFmpeg H.264, but gdigrab is unavailable; falling back to PowerShell/System.Drawing.");
      return process.platform === "win32" ? systemMode : mockMode;
    }

    if (this.requestedMode === "system" || this.requestedMode === systemMode || this.requestedMode === "gdi") {
      if (process.platform === "win32") {
        return systemMode;
      }
      this.logger?.warn("当前不是 Windows 环境，无法启用系统屏幕采集，已回退模拟帧。");
      return mockMode;
    }

    if (process.platform === "win32") {
      return this.ffmpegAvailable ? ffmpegMode : systemMode;
    }

    return mockMode;
  }

  getCapabilities() {
    const usingFfmpegCapture = this.mode === ffmpegMode;
    const usingFfmpegH264Capture = this.mode === ffmpegH264Mode;
    const usingSystemCapture = this.mode === systemMode;
    const usingWgcHelperCapture = this.mode === wgcMode;
    return {
      available: usingFfmpegCapture || usingFfmpegH264Capture || usingSystemCapture || usingWgcHelperCapture,
      mode: this.mode,
      requestedMode: this.requestedMode,
      capturePipeline: this.getCapturePipeline(),
      videoCodec: this.getVideoCodec(),
      videoEncoding: this.getVideoEncoding(),
      codecString: usingFfmpegH264Capture ? this.h264CodecString : "",
      plannedBackend: "Windows Graphics Capture",
      wgc: this.wgcPreflight
        ? {
            requested: this.requestedMode === wgcMode,
            supported: Boolean(this.wgcPreflight.supported),
            active: usingWgcHelperCapture,
            backendImplemented: this.wgcHelperAvailable,
            helperConfigured: this.wgcHelperConfigured,
            helperAvailable: this.wgcHelperAvailable,
            helperCommand: this.wgcHelperCommand,
            helperArgs: this.wgcHelperArgs,
            helperProtocol: "json-lines-v1",
            helperInfo: this.wgcHelperInfo,
            repeatLastFrame: this.wgcRepeatLastFrame,
            repeatLastFrameMode: this.wgcRepeatLastFrameMode,
            preflightBypassed: usingWgcHelperCapture && !this.wgcPreflight.supported && this.wgcHelperAllowUnsupported,
            fallbackReason: this.wgcFallbackReason,
            osBuild: this.wgcPreflight.osBuild,
            sessionSupported: this.wgcPreflight.sessionSupported,
            missingTypes: this.wgcPreflight.missingTypes,
            blockers: this.wgcPreflight.blockers,
            notes: this.wgcPreflight.notes,
          }
        : {
            requested: false,
            supported: false,
            active: false,
            backendImplemented: this.wgcHelperAvailable,
            helperConfigured: this.wgcHelperConfigured,
            helperAvailable: this.wgcHelperAvailable,
            helperCommand: this.wgcHelperCommand,
            helperArgs: this.wgcHelperArgs,
            helperProtocol: "json-lines-v1",
            helperInfo: this.wgcHelperInfo,
            repeatLastFrame: this.wgcRepeatLastFrame,
            repeatLastFrameMode: this.wgcRepeatLastFrameMode,
            preflightBypassed: false,
            fallbackReason: "",
            blockers: [],
            notes: [],
          },
      displays: this.getDisplays(),
      message: usingFfmpegCapture
        ? "当前使用 FFmpeg gdigrab 持续采集 MJPEG 帧；后续可升级为 Windows Graphics Capture。"
        : usingWgcHelperCapture
          ? "当前使用 Windows Graphics Capture helper JSON 行协议接收 JPEG 帧。"
          : usingSystemCapture
          ? "当前使用 Windows 系统截图 JPEG 帧；后续可升级为 Windows Graphics Capture。"
          : "当前为骨架模式，先发送模拟视频帧。",
      lastCaptureError: this.lastFailure || this.wgcFallbackReason,
    };
  }

  getDisplays() {
    return this.displays;
  }

  pickDisplay(displayId) {
    return (
      this.displays.find((display) => display.id === displayId) ||
      this.displays.find((display) => display.primary) ||
      this.displays[0] ||
      defaultDisplays[0]
    );
  }

  getVideoCodec() {
    if (this.mode === ffmpegH264Mode) {
      return "h264";
    }
    return this.mode === ffmpegMode || this.mode === systemMode || this.mode === wgcMode ? "jpeg" : "mock-svg";
  }

  getVideoEncoding() {
    if (this.mode === ffmpegH264Mode) {
      return "annexb-base64";
    }
    return "data-url";
  }

  getCapturePipeline() {
    if (this.mode === wgcMode) {
      return "windows-wgc-helper-jpeg";
    }
    if (this.mode === ffmpegH264Mode) {
      return "windows-ffmpeg-gdigrab-h264";
    }
    if (this.mode === ffmpegMode) {
      return "windows-ffmpeg-gdigrab-mjpeg";
    }
    return this.mode === systemMode ? "windows-gdi-jpeg" : "mock-svg";
  }

  makeHostMode() {
    if (this.mode === wgcMode) {
      return "windows-host-wgc-helper";
    }
    if (this.mode === ffmpegH264Mode) {
      return "windows-host-ffmpeg-h264";
    }
    if (this.mode === ffmpegMode) {
      return "windows-host-ffmpeg-mjpeg";
    }
    return this.mode === systemMode ? "windows-host-system-jpeg" : "windows-host-skeleton";
  }

  normalizeFps(value) {
    return Math.min(clampNumber(value, 1, 240, this.maxScreenFps), this.maxScreenFps);
  }

  jpegQualityForSettings({ qualityPreset = "balanced", maxBandwidthKbps = 50000 } = {}) {
    if (this.jpegQualityOverride !== null) {
      return this.jpegQualityOverride;
    }

    const bandwidthKbps = normalizeBandwidthKbps(maxBandwidthKbps);
    let baseQuality;
    switch (normalizeQualityPreset(qualityPreset)) {
      case "smooth":
        baseQuality = 0.42;
        break;
      case "sharp":
        baseQuality = 0.72;
        break;
      case "custom":
        baseQuality = bandwidthKbps >= 40000 ? 0.68 : 0.56;
        break;
      default:
        baseQuality = 0.56;
        break;
    }

    if (bandwidthKbps <= 10000) {
      return Math.max(0.35, baseQuality - 0.12);
    }
    if (bandwidthKbps >= 40000) {
      return Math.min(0.82, baseQuality + 0.06);
    }
    return baseQuality;
  }

  jpegQualityForSession(session) {
    return normalizeJpegQuality(
      session.jpegQuality,
      this.jpegQualityForSettings({
        qualityPreset: session.qualityPreset,
        maxBandwidthKbps: session.maxBandwidthKbps,
      }),
    );
  }

  negotiate(message) {
    const activeDisplay = this.pickDisplay(message.displayId);
    const width = clampNumber(message.preferredWidth, 320, 3840, activeDisplay.width || 1920);
    const height = clampNumber(message.preferredHeight, 180, 2160, activeDisplay.height || 1080);
    const requestedFps = clampNumber(message.maxFps, 1, 240, this.maxScreenFps);
    const fps = this.normalizeFps(requestedFps);
    const maxBandwidthKbps = normalizeBandwidthKbps(message.maxBandwidthKbps);
    const qualityPreset = normalizeQualityPreset(message.qualityPreset);
    const jpegQuality = this.jpegQualityForSettings({ qualityPreset, maxBandwidthKbps });

    return {
      width,
      height,
      fps,
      requestedFps,
      maxScreenFps: this.maxScreenFps,
      frameIntervalMs: Math.round(1000 / fps),
      maxBandwidthKbps,
      qualityPreset,
      jpegQuality,
      videoCodec: this.getVideoCodec(),
      videoEncoding: this.getVideoEncoding(),
      codecString: this.mode === ffmpegH264Mode ? this.h264CodecString : "",
      displays: this.getDisplays(),
      activeDisplayId: activeDisplay.id,
      displayName: activeDisplay.name,
      hostMode: this.makeHostMode(),
      capturePipeline: this.getCapturePipeline(),
      requestedScreenMode: this.requestedMode,
      wgcFallbackReason: this.wgcFallbackReason,
    };
  }

  updateSessionDisplay(session, message) {
    const activeDisplay = this.pickDisplay(message.displayId || session.activeDisplayId);
    const requestedFps = clampNumber(message.fps, 1, 240, session.requestedFps || session.fps);
    const fps = this.normalizeFps(requestedFps);
    const maxBandwidthKbps = normalizeBandwidthKbps(message.maxBandwidthKbps, session.maxBandwidthKbps);
    const qualityPreset = normalizeQualityPreset(message.qualityPreset || session.qualityPreset);
    const jpegQuality = this.jpegQualityForSettings({ qualityPreset, maxBandwidthKbps });

    return {
      ...session,
      activeDisplayId: activeDisplay.id,
      displayName: activeDisplay.name,
      width:
        message.resolutionMode === "native"
          ? activeDisplay.width
          : clampNumber(message.width, 320, 3840, session.width),
      height:
        message.resolutionMode === "native"
          ? activeDisplay.height
          : clampNumber(message.height, 180, 2160, session.height),
      fps,
      requestedFps,
      maxScreenFps: this.maxScreenFps,
      frameIntervalMs: Math.round(1000 / fps),
      maxBandwidthKbps,
      qualityPreset,
      jpegQuality,
      videoCodec: this.getVideoCodec(),
      videoEncoding: this.getVideoEncoding(),
      codecString: this.mode === ffmpegH264Mode ? this.h264CodecString : "",
      hostMode: this.makeHostMode(),
      capturePipeline: this.getCapturePipeline(),
      requestedScreenMode: this.requestedMode,
      wgcFallbackReason: this.wgcFallbackReason,
    };
  }

  start(session) {
    this.logger?.info(
      `屏幕采集已启动：${session.displayName ?? "显示器"} / ${session.width}x${session.height} / ${session.fps} Hz / ${session.capturePipeline}`,
    );
    if (this.mode === ffmpegMode || this.mode === ffmpegH264Mode) {
      this.startFfmpegCapture(session);
    } else if (this.mode === wgcMode) {
      this.startWgcHelperCapture(session);
    }
  }

  stop() {
    this.stopFfmpegCapture();
    this.stopWgcHelperCapture();
    this.logger?.info("屏幕采集已停止");
  }

  async makeFrame(frameId, session) {
    if (this.mode === wgcMode) {
      try {
        return await this.makeWgcHelperJpegFrame(frameId, session);
      } catch (error) {
        this.recordCaptureFailure(error);
        try {
          return await this.makeSystemJpegFrame(frameId, session);
        } catch (fallbackError) {
          this.recordCaptureFailure(fallbackError);
          return this.makeMockFrame(frameId, session, {
            capturePipeline: "windows-wgc-helper-fallback-mock",
            fallbackReason: `${error.message}; ${fallbackError.message}`,
          });
        }
      }
    }

    if (this.mode === ffmpegH264Mode) {
      try {
        return await this.makeFfmpegH264Frame(frameId, session);
      } catch (error) {
        this.recordCaptureFailure(error);
        try {
          return await this.makeSystemJpegFrame(frameId, session);
        } catch (fallbackError) {
          this.recordCaptureFailure(fallbackError);
          return this.makeMockFrame(frameId, session, {
            capturePipeline: "windows-ffmpeg-gdigrab-h264-fallback-mock",
            fallbackReason: `${error.message}; ${fallbackError.message}`,
          });
        }
      }
    }

    if (this.mode === ffmpegMode) {
      try {
        return await this.makeFfmpegMjpegFrame(frameId, session);
      } catch (error) {
        this.recordCaptureFailure(error);
        try {
          return await this.makeSystemJpegFrame(frameId, session);
        } catch (fallbackError) {
          this.recordCaptureFailure(fallbackError);
          return this.makeMockFrame(frameId, session, {
            capturePipeline: "windows-ffmpeg-gdigrab-fallback-mock",
            fallbackReason: `${error.message}; ${fallbackError.message}`,
          });
        }
      }
    }

    if (this.mode === systemMode) {
      try {
        return await this.makeSystemJpegFrame(frameId, session);
      } catch (error) {
        this.recordCaptureFailure(error);
        return this.makeMockFrame(frameId, session, {
          capturePipeline: "windows-gdi-jpeg-fallback-mock",
          fallbackReason: error.message,
        });
      }
    }

    return this.makeMockFrame(frameId, session);
  }

  makeWgcHelperKey(session) {
    const activeDisplay = this.pickDisplay(session.activeDisplayId);
    const width = clampNumber(session.width, 320, 3840, activeDisplay.width || 1920);
    const height = clampNumber(session.height, 180, 2160, activeDisplay.height || 1080);
    const fps = this.normalizeFps(session.fps);
    const jpegQuality = this.jpegQualityForSession(session);
    const bandwidthKbps = normalizeBandwidthKbps(session.maxBandwidthKbps);
    return [
      this.wgcHelperCommand,
      this.wgcHelperArgs.join("\u001f"),
      activeDisplay.id,
      activeDisplay.x,
      activeDisplay.y,
      activeDisplay.width,
      activeDisplay.height,
      width,
      height,
      fps,
      jpegQuality.toFixed(3),
      bandwidthKbps,
      this.wgcRepeatLastFrame ? `repeat-${this.wgcRepeatLastFrameMode}` : "fresh",
    ].join(":");
  }

  startWgcHelperCapture(session) {
    if (!this.wgcHelperCommand) {
      throw new Error("LAN_DUAL_WINDOWS_WGC_HELPER is not configured");
    }
    if (!this.wgcHelperAvailable) {
      throw new Error(`WGC helper not found: ${this.wgcHelperCommand}`);
    }

    const activeDisplay = this.pickDisplay(session.activeDisplayId);
    const width = clampNumber(session.width, 320, 3840, activeDisplay.width || 1920);
    const height = clampNumber(session.height, 180, 2160, activeDisplay.height || 1080);
    const fps = this.normalizeFps(session.fps);
    const jpegQuality = this.jpegQualityForSession(session);
    const bandwidthKbps = normalizeBandwidthKbps(session.maxBandwidthKbps);
    const key = this.makeWgcHelperKey(session);

    if (this.wgcHelperProcess && this.wgcHelperKey === key) {
      return;
    }

    this.stopWgcHelperCapture({ silent: true });
    this.wgcHelperKey = key;
    this.wgcHelperLineBuffer = "";
    this.wgcHelperFrame = null;
    this.wgcHelperFrameId = 0;
    this.lastServedWgcHelperFrameId = 0;
    this.wgcHelperInfo = null;

    const child = spawn(this.wgcHelperCommand, this.wgcHelperArgs, {
      env: {
        ...process.env,
        LAN_DUAL_WGC_HELPER_PROTOCOL: "json-lines-v1",
        LAN_DUAL_WGC_DISPLAY_ID: activeDisplay.id,
        LAN_DUAL_WGC_DISPLAY_INDEX: String(Number(activeDisplay.index) || 0),
        LAN_DUAL_WGC_DISPLAY_X: String(Number(activeDisplay.x) || 0),
        LAN_DUAL_WGC_DISPLAY_Y: String(Number(activeDisplay.y) || 0),
        LAN_DUAL_WGC_SOURCE_WIDTH: String(activeDisplay.width || width),
        LAN_DUAL_WGC_SOURCE_HEIGHT: String(activeDisplay.height || height),
        LAN_DUAL_WGC_WIDTH: String(width),
        LAN_DUAL_WGC_HEIGHT: String(height),
        LAN_DUAL_WGC_FPS: String(fps),
        LAN_DUAL_WGC_JPEG_QUALITY: String(jpegQuality),
        LAN_DUAL_WGC_MAX_BANDWIDTH_KBPS: String(bandwidthKbps),
        LAN_DUAL_WGC_QUALITY_PRESET: String(session.qualityPreset || "balanced"),
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    this.wgcHelperProcess = child;

    child.stdout.on("data", (chunk) => this.handleWgcHelperChunk(chunk));
    child.stderr.on("data", (chunk) => {
      const detail = String(chunk).trim();
      if (detail) {
        this.lastFailure = detail;
      }
    });
    child.on("error", (error) => {
      if (this.wgcHelperProcess === child) {
        this.recordCaptureFailure(error);
        this.rejectWgcHelperFrameWaiters(error);
        this.wgcHelperProcess = null;
      }
    });
    child.on("close", (code, signal) => {
      if (this.wgcHelperProcess === child) {
        this.wgcHelperProcess = null;
        if (code !== 0 && signal !== "SIGTERM") {
          const error = new Error(`WGC helper exited with ${code ?? signal ?? "unknown"}`);
          this.recordCaptureFailure(error);
          this.rejectWgcHelperFrameWaiters(error);
        } else {
          this.rejectWgcHelperFrameWaiters(new Error("WGC helper stopped before another frame was available"));
        }
      }
    });
  }

  stopWgcHelperCapture({ silent = false } = {}) {
    if (!this.wgcHelperProcess) {
      return;
    }
    const child = this.wgcHelperProcess;
    this.wgcHelperProcess = null;
    child.kill();
    if (!silent) {
      this.wgcHelperKey = "";
    }
    this.wgcHelperLineBuffer = "";
    this.wgcHelperFrame = null;
    this.rejectWgcHelperFrameWaiters(new Error("WGC helper stopped"));
  }

  handleWgcHelperChunk(chunk) {
    this.wgcHelperLineBuffer += String(chunk);
    while (this.wgcHelperLineBuffer.length > 0) {
      const newlineIndex = this.wgcHelperLineBuffer.indexOf("\n");
      if (newlineIndex < 0) {
        if (this.wgcHelperLineBuffer.length > 4 * 1024 * 1024) {
          this.wgcHelperLineBuffer = "";
          this.recordCaptureFailure(new Error("WGC helper line buffer exceeded 4MB before newline"));
        }
        return;
      }

      const line = this.wgcHelperLineBuffer.slice(0, newlineIndex).trim();
      this.wgcHelperLineBuffer = this.wgcHelperLineBuffer.slice(newlineIndex + 1);
      if (!line) {
        continue;
      }
      this.handleWgcHelperLine(line);
    }
  }

  handleWgcHelperLine(line) {
    let message;
    try {
      message = JSON.parse(line.replace(/^\uFEFF/, ""));
    } catch (error) {
      this.recordCaptureFailure(new Error(`WGC helper emitted non-JSON line: ${error.message}`));
      return;
    }

    const type = String(message.type || "").toLowerCase();
    if (type === "hello" || type === "ready" || type === "metadata") {
      this.wgcHelperInfo = {
        backend: String(message.backend || "unknown"),
        codec: String(message.codec || "jpeg"),
        encoding: String(message.encoding || "base64"),
        width: Number(message.width) || 0,
        height: Number(message.height) || 0,
        fps: Number(message.fps) || 0,
      };
      this.lastFailure = "";
      return;
    }

    if (type === "error") {
      this.recordCaptureFailure(new Error(String(message.message || message.error || "WGC helper reported an error")));
      return;
    }

    if (type && type !== "frame") {
      return;
    }

    const dataUrl = String(message.dataUrl || "").trim();
    const dataBase64 = String(message.dataBase64 || message.data || message.payload || "").trim();
    const normalizedDataUrl = dataUrl || (dataBase64 ? `data:image/jpeg;base64,${dataBase64}` : "");
    if (!normalizedDataUrl.startsWith("data:image/jpeg;base64,")) {
      this.recordCaptureFailure(new Error("WGC helper frame did not contain JPEG base64 data"));
      return;
    }

    this.wgcHelperFrame = {
      dataUrl: normalizedDataUrl,
      width: Number(message.width) || 0,
      height: Number(message.height) || 0,
      sourceWidth: Number(message.sourceWidth) || 0,
      sourceHeight: Number(message.sourceHeight) || 0,
      helperFrameId: Number(message.frameId) || 0,
      timestamp: String(message.timestamp || "").trim(),
      payloadBytes: Number(message.payloadBytes) || Math.max(0, Math.floor((normalizedDataUrl.length * 3) / 4)),
    };
    this.wgcHelperFrameId += 1;
    this.lastFailure = "";
    this.resolveWgcHelperFrameWaiters();
  }

  resolveWgcHelperFrameWaiters() {
    const remaining = [];
    for (const waiter of this.wgcHelperFrameWaiters) {
      if (this.wgcHelperFrameId > waiter.afterFrameId && this.wgcHelperFrame) {
        waiter.resolve();
      } else {
        remaining.push(waiter);
      }
    }
    this.wgcHelperFrameWaiters = remaining;
  }

  rejectWgcHelperFrameWaiters(error) {
    const waiters = this.wgcHelperFrameWaiters.splice(0);
    for (const waiter of waiters) {
      waiter.reject(error);
    }
  }

  waitForWgcHelperFrame(afterFrameId, timeoutMs) {
    if (this.wgcHelperFrameId > afterFrameId && this.wgcHelperFrame) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const waiter = {
        afterFrameId,
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      };
      const timer = setTimeout(() => {
        this.wgcHelperFrameWaiters = this.wgcHelperFrameWaiters.filter((item) => item !== waiter);
        reject(new Error(`WGC helper did not produce a JPEG frame within ${timeoutMs} ms`));
      }, timeoutMs);
      this.wgcHelperFrameWaiters.push(waiter);
    });
  }

  async makeWgcHelperJpegFrame(frameId, session) {
    if (!this.wgcHelperProcess) {
      this.startWgcHelperCapture(session);
    }
    const frameIntervalMs = session.frameIntervalMs ?? Math.round(1000 / (session.fps || 1));
    const waitTimeoutMs = this.wgcRepeatLastFrame && this.wgcHelperFrame
      ? 1
      : Math.max(1000, this.captureTimeoutMs);
    let repeatedFrame = false;
    try {
      await this.waitForWgcHelperFrame(this.lastServedWgcHelperFrameId, waitTimeoutMs);
    } catch (error) {
      if (!this.wgcRepeatLastFrame || !this.wgcHelperFrame) {
        throw error;
      }
      repeatedFrame = true;
    }
    const activeDisplay = this.pickDisplay(session.activeDisplayId);
    const payload = this.wgcHelperFrame || {};
    const sourceFrameId = this.wgcHelperFrameId;
    const previousServedFrameId = this.lastServedWgcHelperFrameId;
    if (!repeatedFrame) {
      this.lastServedWgcHelperFrameId = sourceFrameId;
    }
    const now = new Date();
    const sourceTimestamp = String(payload.timestamp || "").trim();
    const sourceTimestampMs = Date.parse(sourceTimestamp);
    const contentAgeMs = Number.isFinite(sourceTimestampMs)
      ? Math.max(0, now.getTime() - sourceTimestampMs)
      : null;
    const repeatPreviousFrame = repeatedFrame && this.wgcRepeatLastFrameMode === wgcRepeatSignalMode;
    const sourcePayloadBytes = Number(payload.payloadBytes) || 0;

    const frame = {
      type: "video_frame",
      frameId,
      timestamp: now.toISOString(),
      sourceTimestamp: sourceTimestamp || "",
      contentAgeMs,
      repeatedFrame,
      repeatPreviousFrame,
      repeatLastFrameMode: this.wgcRepeatLastFrameMode,
      width: Number(payload.width) || clampNumber(session.width, 320, 3840, activeDisplay.width || 1920),
      height: Number(payload.height) || clampNumber(session.height, 180, 2160, activeDisplay.height || 1080),
      sourceWidth: Number(payload.sourceWidth) || activeDisplay.width,
      sourceHeight: Number(payload.sourceHeight) || activeDisplay.height,
      fps: session.fps,
      requestedFps: session.requestedFps,
      maxScreenFps: session.maxScreenFps,
      maxBandwidthKbps: session.maxBandwidthKbps,
      qualityPreset: session.qualityPreset,
      jpegQuality: this.jpegQualityForSession(session),
      frameIntervalMs,
      codec: "jpeg",
      encoding: "data-url",
      keyFrame: true,
      source: "screen",
      capturePipeline: "windows-wgc-helper-jpeg",
      requestedScreenMode: this.requestedMode,
      streamFallbackReason: "",
      droppedFrames: Math.max(0, sourceFrameId - previousServedFrameId - 1),
      payloadBytes: repeatPreviousFrame ? 0 : sourcePayloadBytes,
      helperFrameId: Number(payload.helperFrameId) || sourceFrameId,
    };

    if (repeatPreviousFrame) {
      frame.sourcePayloadBytes = sourcePayloadBytes;
    } else {
      frame.dataUrl = payload.dataUrl;
    }

    return frame;
  }

  makeFfmpegKey(session) {
    const activeDisplay = this.pickDisplay(session.activeDisplayId);
    const width = clampNumber(session.width, 320, 3840, activeDisplay.width || 1920);
    const height = clampNumber(session.height, 180, 2160, activeDisplay.height || 1080);
    const fps = this.normalizeFps(session.fps);
    const jpegQuality = this.jpegQualityForSession(session);
    const bandwidthKbps = normalizeBandwidthKbps(session.maxBandwidthKbps);
    return [
      this.mode,
      activeDisplay.id,
      activeDisplay.x,
      activeDisplay.y,
      activeDisplay.width,
      activeDisplay.height,
      width,
      height,
      fps,
      jpegQuality.toFixed(3),
      bandwidthKbps,
      this.h264CodecString,
    ].join(":");
  }

  startFfmpegCapture(session) {
    const activeDisplay = this.pickDisplay(session.activeDisplayId);
    const width = clampNumber(session.width, 320, 3840, activeDisplay.width || 1920);
    const height = clampNumber(session.height, 180, 2160, activeDisplay.height || 1080);
    const fps = this.normalizeFps(session.fps);
    const jpegQuality = this.jpegQualityForSession(session);
    const bandwidthKbps = normalizeBandwidthKbps(session.maxBandwidthKbps);
    const key = this.makeFfmpegKey(session);

    if (this.ffmpegProcess && this.ffmpegKey === key) {
      return;
    }

    this.stopFfmpegCapture({ silent: true });
    this.ffmpegKey = key;
    this.ffmpegBuffer = Buffer.alloc(0);
    this.ffmpegFrame = null;
    this.ffmpegFrameId = 0;
    this.lastServedFfmpegFrameId = 0;
    this.ffmpegStreamKind = this.mode === ffmpegH264Mode ? "h264" : "mjpeg";
    this.ffmpegPendingH264Nals = [];
    this.ffmpegPendingH264NalTypes = [];
    this.ffmpegH264SawAud = false;

    const inputArgs = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "gdigrab",
      "-framerate",
      String(fps),
      "-offset_x",
      String(Number(activeDisplay.x) || 0),
      "-offset_y",
      String(Number(activeDisplay.y) || 0),
      "-video_size",
      `${activeDisplay.width}x${activeDisplay.height}`,
      "-i",
      "desktop",
      "-vf",
      `scale=${width}:${height}:flags=fast_bilinear`,
    ];
    const outputArgs = this.mode === ffmpegH264Mode
      ? [
          "-an",
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-tune",
          "zerolatency",
          "-threads",
          "1",
          "-profile:v",
          "baseline",
          "-level:v",
          "4.2",
          "-pix_fmt",
          "yuv420p",
          "-b:v",
          `${bandwidthKbps}k`,
          "-maxrate",
          `${bandwidthKbps}k`,
          "-bufsize",
          `${Math.max(1000, Math.round(bandwidthKbps / 2))}k`,
          "-g",
          String(Math.max(1, fps)),
          "-keyint_min",
          String(Math.max(1, fps)),
          "-sc_threshold",
          "0",
          "-bf",
          "0",
          "-x264-params",
          "repeat-headers=1:aud=1:sliced-threads=0:slices=1",
          "-f",
          "h264",
          "-",
        ]
      : [
          "-q:v",
          String(qscaleFromJpegQuality(jpegQuality)),
          "-f",
          "image2pipe",
          "-vcodec",
          "mjpeg",
          "-",
        ];
    const args = [...inputArgs, ...outputArgs];

    const child = spawn(this.ffmpegCommand, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    this.ffmpegProcess = child;

    child.stdout.on("data", (chunk) => this.handleFfmpegChunk(chunk));
    child.stderr.on("data", (chunk) => {
      const detail = String(chunk).trim();
      if (detail) {
        this.lastFailure = detail;
      }
    });
    child.on("error", (error) => {
      if (this.ffmpegProcess === child) {
        this.recordCaptureFailure(error);
        this.ffmpegProcess = null;
      }
    });
    child.on("close", (code, signal) => {
      if (this.ffmpegProcess === child) {
        this.ffmpegProcess = null;
        if (code !== 0 && signal !== "SIGTERM") {
          this.recordCaptureFailure(new Error(`FFmpeg gdigrab exited with ${code ?? signal ?? "unknown"}`));
        }
      }
    });
  }

  stopFfmpegCapture({ silent = false } = {}) {
    if (!this.ffmpegProcess) {
      return;
    }
    const child = this.ffmpegProcess;
    this.ffmpegProcess = null;
    child.kill();
    if (!silent) {
      this.ffmpegKey = "";
    }
    this.ffmpegBuffer = Buffer.alloc(0);
    this.ffmpegFrame = null;
    this.ffmpegPendingH264Nals = [];
    this.ffmpegPendingH264NalTypes = [];
    this.ffmpegH264SawAud = false;
  }

  handleFfmpegChunk(chunk) {
    if (this.ffmpegStreamKind === "h264") {
      this.handleFfmpegH264Chunk(chunk);
      return;
    }

    this.ffmpegBuffer = Buffer.concat([this.ffmpegBuffer, chunk]);
    while (this.ffmpegBuffer.length > 0) {
      const start = this.ffmpegBuffer.indexOf(Buffer.from([0xff, 0xd8]));
      if (start < 0) {
        this.ffmpegBuffer = this.ffmpegBuffer.length > 1024
          ? this.ffmpegBuffer.subarray(this.ffmpegBuffer.length - 1024)
          : this.ffmpegBuffer;
        return;
      }
      if (start > 0) {
        this.ffmpegBuffer = this.ffmpegBuffer.subarray(start);
      }
      const end = this.ffmpegBuffer.indexOf(Buffer.from([0xff, 0xd9]), 2);
      if (end < 0) {
        if (this.ffmpegBuffer.length > 64 * 1024 * 1024) {
          this.ffmpegBuffer = this.ffmpegBuffer.subarray(0, 0);
          this.recordCaptureFailure(new Error("FFmpeg MJPEG buffer exceeded 64MB before a complete JPEG frame"));
        }
        return;
      }

      this.ffmpegFrame = this.ffmpegBuffer.subarray(0, end + 2);
      this.ffmpegBuffer = this.ffmpegBuffer.subarray(end + 2);
      this.ffmpegFrameId += 1;
      this.lastFailure = "";
      this.resolveFfmpegFrameWaiters();
    }
  }

  findAnnexBStartCode(buffer, fromIndex = 0) {
    for (let index = Math.max(0, fromIndex); index <= buffer.length - 3; index += 1) {
      if (buffer[index] !== 0 || buffer[index + 1] !== 0) {
        continue;
      }
      if (buffer[index + 2] === 1) {
        return { index, length: 3 };
      }
      if (index <= buffer.length - 4 && buffer[index + 2] === 0 && buffer[index + 3] === 1) {
        return { index, length: 4 };
      }
    }
    return null;
  }

  nalTypeFromAnnexB(nal) {
    const start = this.findAnnexBStartCode(nal, 0);
    if (!start || start.index + start.length >= nal.length) {
      return 0;
    }
    return nal[start.index + start.length] & 0x1f;
  }

  handleFfmpegH264Chunk(chunk) {
    this.ffmpegBuffer = Buffer.concat([this.ffmpegBuffer, chunk]);
    const pendingNals = this.ffmpegPendingH264Nals || [];
    const pendingTypes = this.ffmpegPendingH264NalTypes || [];
    let buffer = this.ffmpegBuffer;

    while (buffer.length > 0) {
      const start = this.findAnnexBStartCode(buffer, 0);
      if (!start) {
        buffer = buffer.length > 1024 ? buffer.subarray(buffer.length - 1024) : buffer;
        break;
      }
      if (start.index > 0) {
        buffer = buffer.subarray(start.index);
      }
      const next = this.findAnnexBStartCode(buffer, start.length);
      if (!next) {
        break;
      }

      const nal = buffer.subarray(0, next.index);
      buffer = buffer.subarray(next.index);
      const nalType = this.nalTypeFromAnnexB(nal);
      if (nalType === 9) {
        this.ffmpegH264SawAud = true;
        if (pendingTypes.some((type) => type === 1 || type === 5)) {
          this.publishH264Frame(pendingNals.splice(0), pendingTypes.splice(0));
        } else if (pendingNals.length > 0) {
          pendingNals.splice(0);
          pendingTypes.splice(0);
        }
        pendingNals.push(nal);
        pendingTypes.push(nalType);
        continue;
      }

      const isVcl = nalType === 1 || nalType === 5;
      const pendingHasVcl = pendingTypes.some((type) => type === 1 || type === 5);

      if (!this.ffmpegH264SawAud && isVcl && pendingHasVcl) {
        this.publishH264Frame(pendingNals.splice(0), pendingTypes.splice(0));
      }

      pendingNals.push(nal);
      pendingTypes.push(nalType);
    }

    this.ffmpegBuffer = buffer;
    this.ffmpegPendingH264Nals = pendingNals;
    this.ffmpegPendingH264NalTypes = pendingTypes;

    if (this.ffmpegBuffer.length > 64 * 1024 * 1024) {
      this.ffmpegBuffer = Buffer.alloc(0);
      this.ffmpegPendingH264Nals = [];
      this.ffmpegPendingH264NalTypes = [];
      this.recordCaptureFailure(new Error("FFmpeg H.264 buffer exceeded 64MB before a complete frame"));
    }
  }

  publishH264Frame(nals, nalTypes) {
    if (!nals.length) {
      return;
    }
    const payload = Buffer.concat(nals);
    if (payload.length === 0) {
      return;
    }
    const spsIndex = nalTypes.findIndex((type) => type === 7);
    if (spsIndex >= 0) {
      this.updateH264CodecStringFromSps(nals[spsIndex]);
    }
    this.ffmpegFrame = {
      payload,
      nalTypes,
      keyFrame: nalTypes.includes(5) || nalTypes.includes(7) || nalTypes.includes(8),
    };
    this.ffmpegFrameId += 1;
    this.lastFailure = "";
    this.resolveFfmpegFrameWaiters();
  }

  updateH264CodecStringFromSps(nal) {
    const start = this.findAnnexBStartCode(nal, 0);
    if (!start) {
      return;
    }
    const offset = start.index + start.length;
    if (offset + 4 > nal.length) {
      return;
    }
    const profile = nal[offset + 1];
    const compatibility = nal[offset + 2];
    const level = nal[offset + 3];
    this.h264CodecString = `avc1.${profile.toString(16).padStart(2, "0")}${compatibility.toString(16).padStart(2, "0")}${level.toString(16).padStart(2, "0")}`.toUpperCase().replace(/^AVC1/, "avc1");
  }

  resolveFfmpegFrameWaiters() {
    const remaining = [];
    for (const waiter of this.ffmpegFrameWaiters) {
      if (this.ffmpegFrameId > waiter.afterFrameId && this.ffmpegFrame) {
        waiter.resolve();
      } else {
        remaining.push(waiter);
      }
    }
    this.ffmpegFrameWaiters = remaining;
  }

  waitForFfmpegFrame(afterFrameId, timeoutMs) {
    if (this.ffmpegFrameId > afterFrameId && this.ffmpegFrame) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const waiter = {
        afterFrameId,
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
      };
      const timer = setTimeout(() => {
        this.ffmpegFrameWaiters = this.ffmpegFrameWaiters.filter((item) => item !== waiter);
        const frameType = this.ffmpegStreamKind === "h264" ? "H.264 frame" : "JPEG frame";
        reject(new Error(`FFmpeg did not produce a ${frameType} within ${timeoutMs} ms`));
      }, timeoutMs);
      this.ffmpegFrameWaiters.push(waiter);
    });
  }

  async makeFfmpegMjpegFrame(frameId, session) {
    if (!this.ffmpegProcess) {
      this.startFfmpegCapture(session);
    }
    await this.waitForFfmpegFrame(this.lastServedFfmpegFrameId, Math.max(1000, this.captureTimeoutMs));
    const activeDisplay = this.pickDisplay(session.activeDisplayId);
    const payload = this.ffmpegFrame;
    const sourceFrameId = this.ffmpegFrameId;
    const previousServedFrameId = this.lastServedFfmpegFrameId;
    this.lastServedFfmpegFrameId = sourceFrameId;
    const now = new Date();

    return {
      type: "video_frame",
      frameId,
      timestamp: now.toISOString(),
      width: clampNumber(session.width, 320, 3840, activeDisplay.width || 1920),
      height: clampNumber(session.height, 180, 2160, activeDisplay.height || 1080),
      sourceWidth: activeDisplay.width,
      sourceHeight: activeDisplay.height,
      fps: session.fps,
      requestedFps: session.requestedFps,
      maxScreenFps: session.maxScreenFps,
      maxBandwidthKbps: session.maxBandwidthKbps,
      qualityPreset: session.qualityPreset,
      jpegQuality: this.jpegQualityForSession(session),
      frameIntervalMs: session.frameIntervalMs ?? Math.round(1000 / (session.fps || 1)),
      codec: "jpeg",
      encoding: "data-url",
      keyFrame: true,
      source: "screen",
      capturePipeline: "windows-ffmpeg-gdigrab-mjpeg",
      requestedScreenMode: this.requestedMode,
      streamFallbackReason: this.wgcFallbackReason,
      droppedFrames: Math.max(0, sourceFrameId - previousServedFrameId - 1),
      payloadBytes: payload.length,
      dataUrl: `data:image/jpeg;base64,${payload.toString("base64")}`,
    };
  }

  async makeFfmpegH264Frame(frameId, session) {
    if (!this.ffmpegProcess) {
      this.startFfmpegCapture(session);
    }
    await this.waitForFfmpegFrame(this.lastServedFfmpegFrameId, Math.max(1000, this.captureTimeoutMs));
    const activeDisplay = this.pickDisplay(session.activeDisplayId);
    const frame = this.ffmpegFrame || {};
    const payload = frame.payload;
    if (!Buffer.isBuffer(payload) || payload.length === 0) {
      throw new Error("FFmpeg did not return H.264 payload data");
    }

    const sourceFrameId = this.ffmpegFrameId;
    const previousServedFrameId = this.lastServedFfmpegFrameId;
    this.lastServedFfmpegFrameId = sourceFrameId;
    const now = new Date();
    const fps = this.normalizeFps(session.fps);
    const durationUs = Math.round(1_000_000 / Math.max(1, fps));

    return {
      type: "video_frame",
      frameId,
      timestamp: now.toISOString(),
      width: clampNumber(session.width, 320, 3840, activeDisplay.width || 1920),
      height: clampNumber(session.height, 180, 2160, activeDisplay.height || 1080),
      sourceWidth: activeDisplay.width,
      sourceHeight: activeDisplay.height,
      fps: session.fps,
      requestedFps: session.requestedFps,
      maxScreenFps: session.maxScreenFps,
      maxBandwidthKbps: session.maxBandwidthKbps,
      qualityPreset: session.qualityPreset,
      frameIntervalMs: session.frameIntervalMs ?? Math.round(1000 / Math.max(1, session.fps || 1)),
      codec: "h264",
      codecString: this.h264CodecString,
      encoding: "annexb-base64",
      keyFrame: Boolean(frame.keyFrame),
      source: "screen",
      capturePipeline: "windows-ffmpeg-gdigrab-h264",
      requestedScreenMode: this.requestedMode,
      streamFallbackReason: this.wgcFallbackReason,
      droppedFrames: Math.max(0, sourceFrameId - previousServedFrameId - 1),
      payloadBytes: payload.length,
      payload: payload.toString("base64"),
      timestampUs: Math.max(0, (frameId - 1) * durationUs),
      durationUs,
      nalTypes: Array.isArray(frame.nalTypes) ? frame.nalTypes : [],
    };
  }

  async makeSystemJpegFrame(frameId, session) {
    const now = new Date();
    const activeDisplay = this.pickDisplay(session.activeDisplayId);
    const width = clampNumber(session.width, 320, 3840, activeDisplay.width || 1920);
    const height = clampNumber(session.height, 180, 2160, activeDisplay.height || 1080);
    const frame = await runPowerShellJson(
      makePowerShellCaptureScript({
        displayIndex: Number(activeDisplay.index) || 0,
        targetWidth: width,
        targetHeight: height,
        quality: jpegQualityPercent(this.jpegQualityForSession(session)),
      }),
      { timeoutMs: this.captureTimeoutMs },
    );

    if (!frame?.dataBase64) {
      throw new Error("PowerShell did not return JPEG data");
    }

    this.lastFailure = "";
    return {
      type: "video_frame",
      frameId,
      timestamp: now.toISOString(),
      width: Number(frame.width) || width,
      height: Number(frame.height) || height,
      sourceWidth: Number(frame.sourceWidth) || activeDisplay.width,
      sourceHeight: Number(frame.sourceHeight) || activeDisplay.height,
      fps: session.fps,
      requestedFps: session.requestedFps,
      maxScreenFps: session.maxScreenFps,
      maxBandwidthKbps: session.maxBandwidthKbps,
      qualityPreset: session.qualityPreset,
      jpegQuality: this.jpegQualityForSession(session),
      frameIntervalMs: session.frameIntervalMs ?? Math.round(1000 / (session.fps || 1)),
      codec: "jpeg",
      encoding: "data-url",
      keyFrame: true,
      source: "screen",
      capturePipeline: "windows-gdi-jpeg",
      requestedScreenMode: this.requestedMode,
      streamFallbackReason: this.wgcFallbackReason,
      droppedFrames: 0,
      payloadBytes: Number(frame.payloadBytes) || 0,
      dataUrl: `data:image/jpeg;base64,${frame.dataBase64}`,
    };
  }

  recordCaptureFailure(error) {
    this.lastFailure = error?.message || "unknown capture error";
    const now = Date.now();
    if (now - this.lastFailureLogAt > 5000) {
      this.lastFailureLogAt = now;
      this.logger?.warn(`Windows 屏幕采集失败，回退模拟帧：${this.lastFailure}`);
    }
  }

  makeMockFrame(frameId, session, { capturePipeline = "mock-svg", fallbackReason = "" } = {}) {
    const now = new Date();
    const width = session.width || 1920;
    const height = session.height || 1080;
    const hue = (frameId * 17) % 360;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <defs>
          <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stop-color="hsl(${hue}, 36%, 22%)"/>
            <stop offset="100%" stop-color="hsl(${(hue + 120) % 360}, 40%, 12%)"/>
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#bg)"/>
        <rect x="42" y="38" width="${width - 84}" height="54" rx="8" fill="rgba(255,255,255,0.92)"/>
        <text x="70" y="73" font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="24" font-weight="700" fill="#17202a">Windows Host Skeleton</text>
        <rect x="${Math.round(width * 0.12)}" y="${Math.round(height * 0.2)}" width="${Math.round(width * 0.52)}" height="${Math.round(height * 0.42)}" rx="10" fill="rgba(255,255,255,0.9)"/>
        <text x="${Math.round(width * 0.16)}" y="${Math.round(height * 0.34)}" font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="42" font-weight="700" fill="#111827">Mac 反控 Windows 测试帧</text>
        <text x="${Math.round(width * 0.16)}" y="${Math.round(height * 0.43)}" font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="30" fill="#4b5563">${session.displayName ?? "Windows 主显示器"}</text>
        <text x="${Math.round(width * 0.16)}" y="${Math.round(height * 0.5)}" font-family="Consolas, monospace" font-size="30" fill="#4b5563">frame #${frameId}</text>
        <text x="${Math.round(width * 0.16)}" y="${Math.round(height * 0.57)}" font-family="Consolas, monospace" font-size="26" fill="#4b5563">${now.toLocaleTimeString("zh-CN")}</text>
      </svg>`;

    return {
      type: "video_frame",
      frameId,
      timestamp: now.toISOString(),
      width,
      height,
      fps: session.fps,
      requestedFps: session.requestedFps,
      maxScreenFps: session.maxScreenFps,
      maxBandwidthKbps: session.maxBandwidthKbps,
      qualityPreset: session.qualityPreset,
      jpegQuality: this.jpegQualityForSession(session),
      frameIntervalMs: session.frameIntervalMs ?? Math.round(1000 / (session.fps || 1)),
      codec: "mock-svg",
      encoding: "data-url",
      keyFrame: frameId === 1 || frameId % 30 === 0,
      source: "mock",
      capturePipeline,
      streamFallbackReason: fallbackReason,
      requestedScreenMode: this.requestedMode,
      droppedFrames: 0,
      dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`,
    };
  }
}
