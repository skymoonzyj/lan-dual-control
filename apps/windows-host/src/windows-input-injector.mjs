export class WindowsInputInjector {
  constructor({ logger } = {}) {
    this.logger = logger;
    this.inputCount = 0;
  }

  getCapabilities() {
    return {
      available: false,
      plannedBackend: "SendInput",
      message: "当前为骨架模式，只记录输入事件，不注入系统。",
    };
  }

  inject(message) {
    this.inputCount += 1;
    const action = message.action ?? message.kind ?? message.event ?? "unknown";
    const detail = message.detail ?? `${message.remoteX ?? message.x ?? "-"},${message.remoteY ?? message.y ?? "-"}`;

    if (this.inputCount <= 8 || this.inputCount % 20 === 0) {
      this.logger?.info(`输入事件 #${this.inputCount}: ${action} / ${detail}`);
    }

    return {
      accepted: true,
      injected: false,
      reason: "Windows SendInput 尚未实装，当前仅记录事件。",
    };
  }
}
