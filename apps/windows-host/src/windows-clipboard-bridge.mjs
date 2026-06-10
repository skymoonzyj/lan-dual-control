export class WindowsClipboardBridge {
  constructor({ logger } = {}) {
    this.logger = logger;
    this.lastText = "";
    this.fileTransfers = new Map();
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
