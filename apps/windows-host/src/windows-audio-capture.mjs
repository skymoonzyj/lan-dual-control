export class WindowsAudioCaptureCoordinator {
  constructor({ logger } = {}) {
    this.logger = logger;
    this.frameId = 0;
    this.settings = {
      enabled: false,
      volume: 80,
      muted: false,
      sampleRate: 48000,
      channels: 2,
    };
  }

  getCapabilities() {
    return {
      available: false,
      plannedBackend: "WASAPI loopback",
      mockFrames: true,
      sampleRate: this.settings.sampleRate,
      channels: this.settings.channels,
      message: "当前为骨架模式，先发送模拟音频帧；真实 Windows 系统声音后续接 WASAPI loopback。",
    };
  }

  negotiate(message) {
    if (message.wantAudio) {
      this.logger?.warn("收到音频请求：骨架模式发送模拟音频帧，暂不采集 Windows 系统声音");
    }

    this.settings = {
      ...this.settings,
      enabled: Boolean(message.wantAudio),
      volume: Number(message.audioVolume) || this.settings.volume,
      muted: !message.wantAudio,
    };

    return {
      audioCodec: message.wantAudio ? (message.preferredAudioCodec ?? "opus") : "none",
      audioEnabled: Boolean(message.wantAudio),
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
      sampleRate: this.settings.sampleRate,
      channels: this.settings.channels,
    };
  }

  makeFrame(session = {}) {
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
    };
  }
}
