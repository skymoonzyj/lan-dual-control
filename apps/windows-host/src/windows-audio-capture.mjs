export class WindowsAudioCaptureCoordinator {
  constructor({ logger } = {}) {
    this.logger = logger;
  }

  getCapabilities() {
    return {
      available: false,
      plannedBackend: "WASAPI loopback",
      message: "当前为骨架模式，暂不发送音频帧。",
    };
  }

  negotiate(message) {
    if (message.wantAudio) {
      this.logger?.warn("收到音频请求：骨架模式暂不采集 Windows 系统声音");
    }

    return {
      audioCodec: "none",
      audioEnabled: false,
    };
  }
}
