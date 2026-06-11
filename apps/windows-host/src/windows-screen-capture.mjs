import { spawn, spawnSync } from "node:child_process";

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

const systemMode = "system-jpeg";
const mockMode = "mock";

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

function normalizeScreenMode(value) {
  const mode = String(value ?? "auto").trim().toLowerCase();
  if (mode === "mock") {
    return mockMode;
  }
  if (mode === "system" || mode === "system-jpeg" || mode === "gdi" || mode === "auto") {
    return mode;
  }
  return "auto";
}

function parseJsonOutput(output) {
  const text = String(output ?? "").trim().replace(/^\uFEFF/, "");
  if (!text) {
    return null;
  }
  return JSON.parse(text);
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
    this.mode = this.resolveMode();
    this.quality = clampNumber(process.env.LAN_DUAL_WINDOWS_JPEG_QUALITY, 35, 92, 70);
    this.captureTimeoutMs = clampNumber(process.env.LAN_DUAL_WINDOWS_CAPTURE_TIMEOUT_MS, 1000, 12000, 5000);
    this.maxScreenFps = this.mode === systemMode
      ? clampNumber(process.env.LAN_DUAL_WINDOWS_MAX_SCREEN_FPS, 1, 8, 4)
      : 60;
    this.displays = this.mode === systemMode ? loadWindowsDisplaysSync(logger) : defaultDisplays;
    this.lastFailure = "";
    this.lastFailureLogAt = 0;
  }

  resolveMode() {
    if (this.requestedMode === mockMode) {
      return mockMode;
    }

    if (process.platform === "win32") {
      return systemMode;
    }

    if (this.requestedMode === "system" || this.requestedMode === systemMode || this.requestedMode === "gdi") {
      this.logger?.warn("当前不是 Windows 环境，无法启用系统屏幕采集，已回退模拟帧。");
    }
    return mockMode;
  }

  getCapabilities() {
    const usingSystemCapture = this.mode === systemMode;
    return {
      available: usingSystemCapture,
      mode: this.mode,
      capturePipeline: usingSystemCapture ? "windows-gdi-jpeg" : "mock-svg",
      plannedBackend: "Windows Graphics Capture",
      displays: this.getDisplays(),
      message: usingSystemCapture
        ? "当前使用 Windows 系统截图 JPEG 帧；后续可升级为 Windows Graphics Capture。"
        : "当前为骨架模式，先发送模拟视频帧。",
      lastCaptureError: this.lastFailure,
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
    return this.mode === systemMode ? "jpeg" : "mock-svg";
  }

  getCapturePipeline() {
    return this.mode === systemMode ? "windows-gdi-jpeg" : "mock-svg";
  }

  makeHostMode() {
    return this.mode === systemMode ? "windows-host-system-jpeg" : "windows-host-skeleton";
  }

  normalizeFps(value) {
    return Math.min(clampNumber(value, 1, 240, this.maxScreenFps), this.maxScreenFps);
  }

  negotiate(message) {
    const activeDisplay = this.pickDisplay(message.displayId);
    const width = clampNumber(message.preferredWidth, 320, 3840, activeDisplay.width || 1920);
    const height = clampNumber(message.preferredHeight, 180, 2160, activeDisplay.height || 1080);
    const requestedFps = clampNumber(message.maxFps, 1, 240, this.maxScreenFps);
    const fps = this.normalizeFps(requestedFps);
    const maxBandwidthKbps = Number(message.maxBandwidthKbps) || 50000;

    return {
      width,
      height,
      fps,
      requestedFps,
      maxScreenFps: this.maxScreenFps,
      frameIntervalMs: Math.round(1000 / fps),
      maxBandwidthKbps,
      videoCodec: this.getVideoCodec(),
      videoEncoding: "data-url",
      displays: this.getDisplays(),
      activeDisplayId: activeDisplay.id,
      displayName: activeDisplay.name,
      hostMode: this.makeHostMode(),
      capturePipeline: this.getCapturePipeline(),
    };
  }

  updateSessionDisplay(session, message) {
    const activeDisplay = this.pickDisplay(message.displayId || session.activeDisplayId);
    const requestedFps = clampNumber(message.fps, 1, 240, session.requestedFps || session.fps);
    const fps = this.normalizeFps(requestedFps);

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
      maxBandwidthKbps: Number(message.maxBandwidthKbps) || session.maxBandwidthKbps,
      videoCodec: this.getVideoCodec(),
      videoEncoding: "data-url",
      hostMode: this.makeHostMode(),
      capturePipeline: this.getCapturePipeline(),
    };
  }

  start(session) {
    this.logger?.info(
      `屏幕采集已启动：${session.displayName ?? "显示器"} / ${session.width}x${session.height} / ${session.fps} Hz / ${session.capturePipeline}`,
    );
  }

  stop() {
    this.logger?.info("屏幕采集已停止");
  }

  async makeFrame(frameId, session) {
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
        quality: this.quality,
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
      frameIntervalMs: session.frameIntervalMs ?? Math.round(1000 / (session.fps || 1)),
      codec: "jpeg",
      encoding: "data-url",
      keyFrame: true,
      source: "screen",
      capturePipeline: "windows-gdi-jpeg",
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
      frameIntervalMs: session.frameIntervalMs ?? Math.round(1000 / (session.fps || 1)),
      codec: "mock-svg",
      encoding: "data-url",
      keyFrame: frameId === 1 || frameId % 30 === 0,
      source: "mock",
      capturePipeline,
      streamFallbackReason: fallbackReason,
      droppedFrames: 0,
      dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`,
    };
  }
}
