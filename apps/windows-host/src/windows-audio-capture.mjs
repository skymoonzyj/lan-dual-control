import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const mockMode = "mock";
const dshowMode = "dshow-pcm";
const wasapiMode = "wasapi-loopback";
const defaultSampleRate = 48000;
const defaultChannels = 2;
const defaultDurationMs = 20;
const defaultWasapiScript = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../scripts/windows/wasapi-loopback-capture.ps1",
);

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(number)));
}

function normalizeAudioMode(value) {
  const mode = String(value || "auto").trim().toLowerCase();
  if (mode === "dshow" || mode === "dshow-pcm" || mode === "ffmpeg") {
    return dshowMode;
  }
  if (mode === "wasapi" || mode === "wasapi-loopback" || mode === "loopback" || mode === "system") {
    return wasapiMode;
  }
  if (mode === "mock" || mode === "off") {
    return mockMode;
  }
  return "auto";
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function listDshowAudioDevicesSync({ ffmpegCommand = "ffmpeg", logger } = {}) {
  if (process.platform !== "win32") {
    return [];
  }

  const result = spawnSync(ffmpegCommand, ["-hide_banner", "-f", "dshow", "-list_devices", "true", "-i", "dummy"], {
    encoding: "utf8",
    timeout: 5000,
    windowsHide: true,
  });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.error && result.error.code !== "ENOENT") {
    logger?.warn(`DirectShow 音频设备枚举失败：${result.error.message}`);
  }

  const devices = [];
  const devicePattern = /"([^"]+)"\s+\(audio\)/g;
  let match = devicePattern.exec(output);
  while (match) {
    devices.push(match[1]);
    match = devicePattern.exec(output);
  }
  return [...new Set(devices)];
}

function frameBytes({ sampleRate, channels, durationMs }) {
  return Math.round((sampleRate * durationMs) / 1000) * channels * 4;
}

function queryWasapiInfoSync({ scriptPath, sampleRate, channels, durationMs, logger } = {}) {
  if (process.platform !== "win32") {
    return { ok: false, error: "WASAPI loopback is only available on Windows." };
  }
  if (!existsSync(scriptPath)) {
    return { ok: false, error: `WASAPI helper not found: ${scriptPath}` };
  }

  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
    "-InfoOnly",
    "-SampleRate",
    String(sampleRate),
    "-Channels",
    String(channels),
    "-FrameMs",
    String(durationMs),
  ], {
    encoding: "utf8",
    timeout: 10000,
    windowsHide: true,
  });

  const error = result.error?.message || result.stderr?.trim() || "";
  if (result.status !== 0 || result.error) {
    logger?.warn(`WASAPI loopback 检测失败：${error || `exit ${result.status}`}`);
    return { ok: false, error: error || `powershell exited with ${result.status}` };
  }

  const info = parseJson((result.stdout || "").trim());
  if (!info?.ok) {
    const detail = error || (result.stdout || "").trim() || "empty WASAPI info";
    logger?.warn(`WASAPI loopback 信息解析失败：${detail}`);
    return { ok: false, error: detail };
  }
  return info;
}

function computePcmLevel(buffer) {
  const alignedLength = buffer.length - (buffer.length % 4);
  if (alignedLength <= 0) {
    return 0;
  }

  let peak = 0;
  for (let offset = 0; offset < alignedLength; offset += 4) {
    const sample = buffer.readFloatLE(offset);
    if (Number.isFinite(sample)) {
      peak = Math.max(peak, Math.min(1, Math.abs(sample)));
    }
  }
  return Number(peak.toFixed(3));
}

export class WindowsAudioCaptureCoordinator {
  constructor({ logger } = {}) {
    this.logger = logger;
    this.frameId = 0;
    this.ffmpegCommand = process.env.LAN_DUAL_FFMPEG || "ffmpeg";
    this.wasapiScript = process.env.LAN_DUAL_WINDOWS_WASAPI_HELPER || defaultWasapiScript;
    this.deviceName = String(process.env.LAN_DUAL_WINDOWS_AUDIO_DEVICE || "").trim();
    this.requestedMode = normalizeAudioMode(process.env.LAN_DUAL_WINDOWS_AUDIO_MODE);
    this.audioDevices = listDshowAudioDevicesSync({ ffmpegCommand: this.ffmpegCommand, logger });
    this.requestedSettings = {
      sampleRate: clampNumber(process.env.LAN_DUAL_WINDOWS_AUDIO_SAMPLE_RATE, 8000, 192000, defaultSampleRate),
      channels: clampNumber(process.env.LAN_DUAL_WINDOWS_AUDIO_CHANNELS, 1, 8, defaultChannels),
      durationMs: clampNumber(process.env.LAN_DUAL_WINDOWS_AUDIO_FRAME_MS, 10, 60, defaultDurationMs),
    };
    this.wasapiInfo = this.requestedMode === wasapiMode
      ? queryWasapiInfoSync({
        scriptPath: this.wasapiScript,
        sampleRate: this.requestedSettings.sampleRate,
        channels: this.requestedSettings.channels,
        durationMs: this.requestedSettings.durationMs,
        logger,
      })
      : null;
    this.mode = this.resolveMode();
    this.settings = {
      enabled: false,
      volume: 80,
      muted: false,
      sampleRate: this.mode === wasapiMode
        ? (Number(this.wasapiInfo?.outputSampleRate) || this.requestedSettings.sampleRate)
        : this.requestedSettings.sampleRate,
      channels: this.mode === wasapiMode
        ? (Number(this.wasapiInfo?.outputChannels) || this.requestedSettings.channels)
        : this.requestedSettings.channels,
      durationMs: Number(this.wasapiInfo?.frameMs) || this.requestedSettings.durationMs,
    };
    this.captureProcess = null;
    this.captureBuffer = Buffer.alloc(0);
    this.pcmFrames = [];
    this.lastFailure = this.wasapiInfo && !this.wasapiInfo.ok ? this.wasapiInfo.error : "";
  }

  resolveMode() {
    if (this.requestedMode === mockMode) {
      return mockMode;
    }

    if (process.platform !== "win32") {
      return mockMode;
    }

    if (this.requestedMode === wasapiMode) {
      if (this.wasapiInfo?.ok) {
        return wasapiMode;
      }
      this.logger?.warn("已请求 WASAPI loopback，但系统声音接口不可用，继续使用模拟音频。");
      return mockMode;
    }

    if (!this.deviceName) {
      if (this.requestedMode === dshowMode) {
        this.logger?.warn("已请求 DirectShow 音频采集，但未设置 LAN_DUAL_WINDOWS_AUDIO_DEVICE，继续使用模拟音频。");
      }
      return mockMode;
    }

    return dshowMode;
  }

  isRealPcmMode() {
    return this.mode === dshowMode || this.mode === wasapiMode;
  }

  getBackendName() {
    if (this.mode === wasapiMode) {
      return "Windows WASAPI loopback PCM";
    }
    if (this.mode === dshowMode) {
      return "FFmpeg DirectShow PCM";
    }
    return "mock";
  }

  getAudioDeviceName() {
    if (this.mode === wasapiMode) {
      return "default-render-loopback";
    }
    return this.deviceName;
  }

  getCapabilities() {
    const usingRealPcm = this.isRealPcmMode();
    return {
      available: usingRealPcm,
      mode: this.mode,
      backend: this.getBackendName(),
      mockFrames: !usingRealPcm,
      sampleRate: this.settings.sampleRate,
      channels: this.settings.channels,
      durationMs: this.settings.durationMs,
      configuredDevice: this.deviceName,
      wasapi: this.wasapiInfo ?? { ok: false, helper: this.wasapiScript },
      devices: this.audioDevices,
      lastCaptureError: this.lastFailure,
      message: usingRealPcm
        ? `当前使用 ${this.getBackendName()} 发送 PCM 系统声音帧。`
        : "当前为骨架模式，先发送模拟音频帧；可显式设置 LAN_DUAL_WINDOWS_AUDIO_MODE=wasapi 试用系统声音，或设置 LAN_DUAL_WINDOWS_AUDIO_DEVICE 试用 DirectShow PCM。",
    };
  }

  negotiate(message) {
    const wantAudio = Boolean(message.wantAudio);
    if (wantAudio && !this.isRealPcmMode()) {
      this.logger?.warn("收到音频请求：当前未配置真实系统声音采集，继续发送模拟音频帧。");
    }

    this.settings = {
      ...this.settings,
      enabled: wantAudio,
      volume: Number(message.audioVolume) || this.settings.volume,
      muted: !wantAudio,
    };

    if (wantAudio && this.isRealPcmMode()) {
      return {
        audioCodec: "pcm-f32le",
        audioEncoding: "pcm-f32le-base64",
        audioMode: "system-pcm",
        audioEnabled: true,
        audioFrameIntervalMs: this.settings.durationMs,
        sampleRate: this.settings.sampleRate,
        channels: this.settings.channels,
        audioDevice: this.getAudioDeviceName(),
      };
    }

    return {
      audioCodec: wantAudio ? (message.preferredAudioCodec ?? "opus") : "none",
      audioEncoding: "mock",
      audioMode: "mock",
      audioEnabled: wantAudio,
      audioFrameIntervalMs: 240,
      sampleRate: this.settings.sampleRate,
      channels: this.settings.channels,
    };
  }

  updateSettings(message = {}) {
    this.settings = {
      ...this.settings,
      enabled: Boolean(message.enabled),
      volume: Number(message.volume) || 0,
      muted: Boolean(message.muted),
      sampleRate: Number(message.sampleRate) || this.settings.sampleRate,
      channels: Number(message.channels) || this.settings.channels,
    };
    this.logger?.info(
      `音频设置已更新：${this.settings.enabled ? "开启" : "关闭"} / ${this.settings.volume}%`,
    );
    return {
      type: "audio_settings_ack",
      enabled: this.settings.enabled,
      volume: this.settings.volume,
      muted: this.settings.muted,
      codec: this.isRealPcmMode() ? "pcm-f32le" : "mock-opus",
      encoding: this.isRealPcmMode() ? "pcm-f32le-base64" : "mock",
      audioMode: this.isRealPcmMode() ? "system-pcm" : "mock",
      sampleRate: this.settings.sampleRate,
      channels: this.settings.channels,
    };
  }

  start(session = {}) {
    if (!session.audioEnabled || session.audioCodec === "none" || !this.isRealPcmMode()) {
      this.stop();
      return;
    }

    if (this.captureProcess) {
      return;
    }

    if (this.mode === wasapiMode) {
      this.startWasapi();
      return;
    }

    this.startDshow();
  }

  startDshow() {
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "dshow",
      "-i",
      `audio=${this.deviceName}`,
      "-vn",
      "-ac",
      String(this.settings.channels),
      "-ar",
      String(this.settings.sampleRate),
      "-f",
      "f32le",
      "-acodec",
      "pcm_f32le",
      "-",
    ];

    const child = spawn(this.ffmpegCommand, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    this.captureProcess = child;
    this.captureBuffer = Buffer.alloc(0);
    this.pcmFrames = [];

    child.stdout.on("data", (chunk) => this.handlePcmChunk(chunk));
    child.stderr.on("data", (chunk) => this.handleCaptureStderr(chunk));
    child.on("error", (error) => {
      if (this.captureProcess === child) {
        this.lastFailure = error.message;
        this.captureProcess = null;
      }
    });
    child.on("close", (code, signal) => {
      if (this.captureProcess === child) {
        this.captureProcess = null;
        if (code !== 0 && signal !== "SIGTERM") {
          this.lastFailure = `FFmpeg DirectShow audio exited with ${code ?? signal ?? "unknown"}`;
        }
      }
    });
    this.logger?.info(`DirectShow 音频采集已启动：${this.deviceName}`);
  }

  startWasapi() {
    const args = [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      this.wasapiScript,
      "-SampleRate",
      String(this.settings.sampleRate),
      "-Channels",
      String(this.settings.channels),
      "-FrameMs",
      String(this.settings.durationMs),
    ];

    const child = spawn("powershell.exe", args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    this.captureProcess = child;
    this.captureBuffer = Buffer.alloc(0);
    this.pcmFrames = [];

    child.stdout.on("data", (chunk) => this.handlePcmChunk(chunk));
    child.stderr.on("data", (chunk) => this.handleCaptureStderr(chunk));
    child.on("error", (error) => {
      if (this.captureProcess === child) {
        this.lastFailure = error.message;
        this.captureProcess = null;
      }
    });
    child.on("close", (code, signal) => {
      if (this.captureProcess === child) {
        this.captureProcess = null;
        if (code !== 0 && signal !== "SIGTERM") {
          this.lastFailure = `WASAPI loopback helper exited with ${code ?? signal ?? "unknown"}`;
        }
      }
    });
    this.logger?.info("WASAPI loopback 系统声音采集已启动");
  }

  stop() {
    if (!this.captureProcess) {
      return;
    }
    const child = this.captureProcess;
    this.captureProcess = null;
    child.kill();
    this.captureBuffer = Buffer.alloc(0);
    this.pcmFrames = [];
    this.logger?.info(`${this.getBackendName()} 音频采集已停止`);
  }

  handleCaptureStderr(chunk) {
    const detail = String(chunk).trim();
    if (!detail) {
      return;
    }
    const infoPrefix = "LAN_DUAL_WASAPI_INFO ";
    if (detail.startsWith(infoPrefix)) {
      const info = parseJson(detail.slice(infoPrefix.length));
      if (info?.ok) {
        this.wasapiInfo = info;
        this.settings.sampleRate = Number(info.outputSampleRate) || this.settings.sampleRate;
        this.settings.channels = Number(info.outputChannels) || this.settings.channels;
        this.settings.durationMs = Number(info.frameMs) || this.settings.durationMs;
        return;
      }
    }
    this.lastFailure = detail;
  }

  handlePcmChunk(chunk) {
    this.captureBuffer = Buffer.concat([this.captureBuffer, chunk]);
    const bytesPerFrame = frameBytes(this.settings);
    while (this.captureBuffer.length >= bytesPerFrame) {
      const payload = this.captureBuffer.subarray(0, bytesPerFrame);
      this.captureBuffer = this.captureBuffer.subarray(bytesPerFrame);
      this.pcmFrames.push(Buffer.from(payload));
      if (this.pcmFrames.length > 12) {
        this.pcmFrames.shift();
      }
    }

    const maxBufferBytes = bytesPerFrame * 24;
    if (this.captureBuffer.length > maxBufferBytes) {
      this.captureBuffer = this.captureBuffer.subarray(this.captureBuffer.length - maxBufferBytes);
    }
  }

  makePcmFrame(session = {}) {
    const payload = this.pcmFrames.shift();
    if (!payload) {
      return null;
    }

    this.frameId += 1;
    const volume = Math.max(0, Math.min(100, Number(session.audioVolume ?? this.settings.volume)));
    const level = computePcmLevel(payload);
    return {
      type: "audio_frame",
      frameId: this.frameId,
      timestamp: new Date().toISOString(),
      codec: "pcm-f32le",
      encoding: "pcm-f32le-base64",
      audioMode: "system-pcm",
      audioDevice: this.getAudioDeviceName(),
      sampleRate: this.settings.sampleRate,
      channels: this.settings.channels,
      frames: Math.round((this.settings.sampleRate * this.settings.durationMs) / 1000),
      durationMs: this.settings.durationMs,
      layout: "interleaved",
      level,
      volume,
      latencyMs: this.settings.durationMs,
      payloadBytes: payload.length,
      payload: payload.toString("base64"),
    };
  }

  makeMockFrame(session = {}) {
    this.frameId += 1;
    const volume = Math.max(0, Math.min(100, Number(session.audioVolume ?? this.settings.volume)));
    const wave = (Math.sin(this.frameId / 2.7) + 1) / 2;
    return {
      type: "audio_frame",
      frameId: this.frameId,
      codec: session.audioCodec === "none" ? "mock-opus" : (session.audioCodec ?? "mock-opus"),
      sampleRate: this.settings.sampleRate,
      channels: this.settings.channels,
      durationMs: 20,
      level: Number((wave * (volume / 100)).toFixed(3)),
      volume,
      latencyMs: 20 + (this.frameId % 9),
      encoding: "mock",
      audioMode: "mock",
    };
  }

  makeFrame(session = {}) {
    if (this.isRealPcmMode() && session.audioCodec === "pcm-f32le") {
      return this.makePcmFrame(session);
    }
    return this.makeMockFrame(session);
  }
}
