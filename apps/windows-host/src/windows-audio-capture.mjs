import { spawn, spawnSync } from "node:child_process";

const mockMode = "mock";
const dshowMode = "dshow-pcm";
const defaultSampleRate = 48000;
const defaultChannels = 2;
const defaultDurationMs = 20;

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
  if (mode === "mock" || mode === "off") {
    return mockMode;
  }
  return "auto";
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
    this.deviceName = String(process.env.LAN_DUAL_WINDOWS_AUDIO_DEVICE || "").trim();
    this.requestedMode = normalizeAudioMode(process.env.LAN_DUAL_WINDOWS_AUDIO_MODE);
    this.audioDevices = listDshowAudioDevicesSync({ ffmpegCommand: this.ffmpegCommand, logger });
    this.mode = this.resolveMode();
    this.settings = {
      enabled: false,
      volume: 80,
      muted: false,
      sampleRate: clampNumber(process.env.LAN_DUAL_WINDOWS_AUDIO_SAMPLE_RATE, 8000, 192000, defaultSampleRate),
      channels: clampNumber(process.env.LAN_DUAL_WINDOWS_AUDIO_CHANNELS, 1, 8, defaultChannels),
      durationMs: clampNumber(process.env.LAN_DUAL_WINDOWS_AUDIO_FRAME_MS, 10, 60, defaultDurationMs),
    };
    this.captureProcess = null;
    this.captureBuffer = Buffer.alloc(0);
    this.pcmFrames = [];
    this.lastFailure = "";
  }

  resolveMode() {
    if (this.requestedMode === mockMode) {
      return mockMode;
    }

    if (process.platform !== "win32") {
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

  getCapabilities() {
    const usingDshow = this.mode === dshowMode;
    return {
      available: usingDshow,
      mode: this.mode,
      backend: usingDshow ? "FFmpeg DirectShow PCM" : "mock",
      plannedBackend: "WASAPI loopback",
      mockFrames: !usingDshow,
      sampleRate: this.settings.sampleRate,
      channels: this.settings.channels,
      durationMs: this.settings.durationMs,
      configuredDevice: this.deviceName,
      devices: this.audioDevices,
      lastCaptureError: this.lastFailure,
      message: usingDshow
        ? "当前使用 FFmpeg DirectShow 采集指定音频设备并发送 PCM 帧；系统声音建议配置为 loopback/虚拟声卡设备。"
        : "当前为骨架模式，先发送模拟音频帧；设置 LAN_DUAL_WINDOWS_AUDIO_DEVICE 后可试用 FFmpeg DirectShow PCM。",
    };
  }

  negotiate(message) {
    const wantAudio = Boolean(message.wantAudio);
    if (wantAudio && this.mode !== dshowMode) {
      this.logger?.warn("收到音频请求：当前未配置 DirectShow 音频设备，继续发送模拟音频帧。");
    }

    this.settings = {
      ...this.settings,
      enabled: wantAudio,
      volume: Number(message.audioVolume) || this.settings.volume,
      muted: !wantAudio,
    };

    if (wantAudio && this.mode === dshowMode) {
      return {
        audioCodec: "pcm-f32le",
        audioEncoding: "pcm-f32le-base64",
        audioMode: "system-pcm",
        audioEnabled: true,
        audioFrameIntervalMs: this.settings.durationMs,
        sampleRate: this.settings.sampleRate,
        channels: this.settings.channels,
        audioDevice: this.deviceName,
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
      codec: this.mode === dshowMode ? "pcm-f32le" : "mock-opus",
      encoding: this.mode === dshowMode ? "pcm-f32le-base64" : "mock",
      audioMode: this.mode === dshowMode ? "system-pcm" : "mock",
      sampleRate: this.settings.sampleRate,
      channels: this.settings.channels,
    };
  }

  start(session = {}) {
    if (!session.audioEnabled || session.audioCodec === "none" || this.mode !== dshowMode) {
      this.stop();
      return;
    }

    if (this.captureProcess) {
      return;
    }

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
    child.stderr.on("data", (chunk) => {
      const detail = String(chunk).trim();
      if (detail) {
        this.lastFailure = detail;
      }
    });
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

  stop() {
    if (!this.captureProcess) {
      return;
    }
    const child = this.captureProcess;
    this.captureProcess = null;
    child.kill();
    this.captureBuffer = Buffer.alloc(0);
    this.pcmFrames = [];
    this.logger?.info("DirectShow 音频采集已停止");
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
      audioDevice: this.deviceName,
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
    if (this.mode === dshowMode && session.audioCodec === "pcm-f32le") {
      return this.makePcmFrame(session);
    }
    return this.makeMockFrame(session);
  }
}
