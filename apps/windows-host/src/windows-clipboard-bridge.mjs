import { spawnSync } from "node:child_process";

const defaultClipboardTimeoutMs = 4000;

function normalizeClipboardMode(mode) {
  return ["auto", "system", "memory"].includes(mode) ? mode : "auto";
}

export class WindowsClipboardBridge {
  constructor({
    logger,
    mode = process.env.LAN_DUAL_WINDOWS_CLIPBOARD_MODE || "auto",
    powershellCommand = process.env.LAN_DUAL_POWERSHELL || "powershell.exe",
    clipboardTimeoutMs = defaultClipboardTimeoutMs,
  } = {}) {
    this.logger = logger;
    this.mode = normalizeClipboardMode(mode);
    this.powershellCommand = powershellCommand;
    this.clipboardTimeoutMs = Number(clipboardTimeoutMs) || defaultClipboardTimeoutMs;
    this.lastText = "";
    this.fileTransfers = new Map();
  }

  getCapabilities() {
    const systemTextAvailable = this.canUseSystemTextClipboard();
    return {
      text: true,
      textMode: systemTextAvailable ? "system" : "memory-only",
      file: true,
      fileMode: "memory-only",
      backend: systemTextAvailable ? "PowerShell Set-Clipboard" : "memory",
      message: systemTextAvailable
        ? "Windows 文本剪贴板会写入系统剪贴板；文件剪贴板仍为接收骨架。"
        : "当前环境使用内存剪贴板回退；在 Windows 上会自动使用 PowerShell Set-Clipboard。",
    };
  }

  canUseSystemTextClipboard() {
    if (this.mode === "memory") {
      return false;
    }
    if (this.mode === "system") {
      return true;
    }
    return process.platform === "win32";
  }

  receiveText(message) {
    const text = message.text ?? "";
    this.lastText = text;

    if (!this.canUseSystemTextClipboard()) {
      this.logger?.info(`收到文本剪贴板：${text.length} 字 / memory-only`);
      return {
        type: "clipboard_ack",
        accepted: true,
        clipboardId: message.clipboardId,
        textLength: message.textLength ?? text.length,
        mode: "memory-only",
        reason: "当前环境不是 Windows，已用内存剪贴板回退保存。",
      };
    }

    const result = this.writeSystemText(text);
    if (!result.ok) {
      this.logger?.warn(`Windows 系统文本剪贴板写入失败：${result.reason}`);
      return {
        type: "clipboard_ack",
        accepted: false,
        clipboardId: message.clipboardId,
        textLength: message.textLength ?? text.length,
        mode: "system",
        code: "LAN011",
        reason: result.reason,
      };
    }

    this.logger?.info(`收到文本剪贴板：${text.length} 字 / system`);
    return {
      type: "clipboard_ack",
      accepted: true,
      clipboardId: message.clipboardId,
      textLength: message.textLength ?? text.length,
      mode: "system",
      reason: "Windows 系统文本剪贴板已写入。",
    };
  }

  writeSystemText(text) {
    const script = [
      "$ErrorActionPreference = 'Stop'",
      "[Console]::InputEncoding = [System.Text.Encoding]::UTF8",
      "$text = [Console]::In.ReadToEnd()",
      "Set-Clipboard -Value $text",
    ].join("; ");

    const result = spawnSync(
      this.powershellCommand,
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      {
        input: text,
        encoding: "utf8",
        timeout: this.clipboardTimeoutMs,
        windowsHide: true,
      },
    );

    if (result.error) {
      return {
        ok: false,
        reason:
          result.error.code === "ETIMEDOUT"
            ? `PowerShell 写入剪贴板超时（${this.clipboardTimeoutMs} ms）`
            : result.error.message,
      };
    }

    if (result.status !== 0) {
      const stderr = String(result.stderr || "").trim();
      const stdout = String(result.stdout || "").trim();
      return {
        ok: false,
        reason: stderr || stdout || `PowerShell 退出码 ${result.status}`,
      };
    }

    return { ok: true };
  }

  receiveFileOffer(message) {
    const transfer = {
      totalBytes: Number(message.totalBytes) || 0,
      receivedBytes: 0,
      fileCount: Number(message.fileCount) || message.files?.length || 0,
      files: message.files ?? [],
    };
    this.fileTransfers.set(message.transferId, transfer);
    this.logger?.info(`收到文件剪贴板清单：${transfer.fileCount} 个文件，共 ${transfer.totalBytes} 字节`);

    return {
      type: "clipboard_file_response",
      transferId: message.transferId,
      accepted: true,
      saveMode: "memory-only",
      maxChunkBytes: message.maxChunkBytes,
      reason: "Windows 被控端骨架已准备接收文件块。",
    };
  }

  receiveFileChunk(message) {
    const transfer = this.fileTransfers.get(message.transferId) ?? {
      totalBytes: Number(message.totalBytes) || 0,
      receivedBytes: 0,
      fileCount: 0,
      files: [],
    };
    transfer.receivedBytes =
      Number(message.sentBytes) ||
      Math.min(
        transfer.totalBytes || Number(message.totalBytes) || Number.MAX_SAFE_INTEGER,
        transfer.receivedBytes + Number(message.bytes || 0),
      );
    this.fileTransfers.set(message.transferId, transfer);

    return {
      type: "clipboard_file_progress",
      transferId: message.transferId,
      receivedBytes: transfer.receivedBytes,
      totalBytes: transfer.totalBytes || message.totalBytes,
    };
  }

  completeFileTransfer(message) {
    const transfer = this.fileTransfers.get(message.transferId);
    this.fileTransfers.delete(message.transferId);
    this.logger?.info(
      `文件剪贴板接收完成：${message.fileCount ?? transfer?.fileCount ?? 0} 个文件，${transfer?.receivedBytes ?? message.totalBytes ?? 0} 字节`,
    );

    return {
      type: "clipboard_file_result",
      transferId: message.transferId,
      accepted: true,
      receivedBytes: transfer?.receivedBytes ?? message.totalBytes ?? 0,
      totalBytes: message.totalBytes,
      fileCount: message.fileCount ?? transfer?.fileCount ?? 0,
      reason: "Windows 被控端骨架已接收文件块，真实剪贴板写入后续接入原生模块。",
    };
  }
}
