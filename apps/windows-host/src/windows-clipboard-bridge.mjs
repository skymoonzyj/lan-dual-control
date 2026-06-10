export class WindowsClipboardBridge {
  constructor({ logger } = {}) {
    this.logger = logger;
    this.lastText = "";
  }

  receiveText(message) {
    this.lastText = message.text ?? "";
    this.logger?.info(`收到文本剪贴板：${this.lastText.length} 字`);

    return {
      type: "clipboard_ack",
      accepted: true,
      clipboardId: message.clipboardId,
      textLength: message.textLength ?? this.lastText.length,
      mode: "memory-only",
      reason: "Windows 系统剪贴板写入后续接入原生模块。",
    };
  }
}
