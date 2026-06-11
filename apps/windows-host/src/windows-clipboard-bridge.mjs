import { spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const defaultClipboardTimeoutMs = 6000;
const defaultMaxChunkBytes = 64 * 1024;

function normalizeClipboardMode(mode) {
  return ["auto", "system", "memory"].includes(mode) ? mode : "auto";
}

function safeFileName(name, fallback) {
  const baseName = basename(String(name || fallback)).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
  return baseName || fallback;
}

function sanitizeTransferId(transferId) {
  return String(transferId || `transfer-${Date.now().toString(16)}`).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function decodeFileChunk(message) {
  if (message.encoding === "base64" || message.dataBase64) {
    return Buffer.from(String(message.dataBase64 || ""), "base64");
  }
  if (typeof message.data === "string") {
    return Buffer.from(message.data, "utf8");
  }
  return Buffer.alloc(0);
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
    const systemFileAvailable = this.canUseSystemFileClipboard();
    return {
      text: true,
      textMode: systemTextAvailable ? "system" : "memory-only",
      file: true,
      fileMode: systemFileAvailable ? "system" : "temp",
      backend: systemTextAvailable || systemFileAvailable ? "PowerShell Set-Clipboard" : "temp-files",
      message: systemTextAvailable || systemFileAvailable
        ? "Windows 文本和文件剪贴板会写入系统剪贴板；非 Windows 环境保存到临时目录。"
        : "当前环境使用临时文件/内存回退；在 Windows 上会自动使用 PowerShell Set-Clipboard。",
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

  canUseSystemFileClipboard() {
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
      "$lastError = $null",
      "for ($attempt = 1; $attempt -le 5; $attempt += 1) { try { Set-Clipboard -Value $text; $lastError = $null; break } catch { $lastError = $_; Start-Sleep -Milliseconds (80 * $attempt) } }",
      "if ($lastError -ne $null) { throw $lastError }",
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
    const transferId = sanitizeTransferId(message.transferId);
    const rootDir = join(tmpdir(), "lan-dual-control-windows-host-clipboard", transferId);
    mkdirSync(rootDir, { recursive: true });
    const fileMetas = Array.isArray(message.files) ? message.files : [];
    const files = fileMetas.map((file, index) => {
      const name = safeFileName(file?.name, `clipboard-${index + 1}`);
      return {
        index,
        name,
        size: Number(file?.size) || 0,
        mimeType: file?.mimeType || "application/octet-stream",
        path: join(rootDir, `${String(index + 1).padStart(3, "0")}-${name}`),
        receivedBytes: 0,
        chunks: new Set(),
      };
    });
    const transfer = {
      totalBytes: Number(message.totalBytes) || 0,
      receivedBytes: 0,
      fileCount: Number(message.fileCount) || files.length,
      rootDir,
      files,
    };
    this.fileTransfers.set(message.transferId, transfer);
    this.logger?.info(
      `收到文件剪贴板清单：${transfer.fileCount} 个文件，共 ${transfer.totalBytes} 字节 / ${rootDir}`,
    );

    return {
      type: "clipboard_file_response",
      transferId: message.transferId,
      accepted: true,
      saveMode: this.canUseSystemFileClipboard() ? "clipboard" : "temp",
      maxChunkBytes: Math.min(Number(message.maxChunkBytes) || defaultMaxChunkBytes, defaultMaxChunkBytes),
      reason: "Windows 被控端已准备接收文件块并保存到临时目录。",
    };
  }

  receiveFileChunk(message) {
    const transfer = this.fileTransfers.get(message.transferId) ?? {
      totalBytes: Number(message.totalBytes) || 0,
      receivedBytes: 0,
      fileCount: 0,
      files: [],
      rootDir: join(tmpdir(), "lan-dual-control-windows-host-clipboard", sanitizeTransferId(message.transferId)),
    };
    mkdirSync(transfer.rootDir, { recursive: true });

    const fileIndex = Math.max(0, Number(message.fileIndex) || 0);
    if (!transfer.files[fileIndex]) {
      const name = safeFileName(message.fileName, `clipboard-${fileIndex + 1}`);
      transfer.files[fileIndex] = {
        index: fileIndex,
        name,
        size: Number(message.totalBytes) || 0,
        mimeType: "application/octet-stream",
        path: join(transfer.rootDir, `${String(fileIndex + 1).padStart(3, "0")}-${name}`),
        receivedBytes: 0,
        chunks: new Set(),
      };
    }

    const file = transfer.files[fileIndex];
    const offset = Math.max(0, Number(message.offset) || file.receivedBytes || 0);
    const chunkIndex = Number(message.chunkIndex) || 0;
    const chunkKey = `${fileIndex}:${chunkIndex}:${offset}`;
    const chunk = decodeFileChunk(message);

    if (!file.chunks.has(chunkKey)) {
      const fd = openSync(file.path, offset === 0 ? "w" : "r+");
      try {
        writeSync(fd, chunk, 0, chunk.length, offset);
      } finally {
        closeSync(fd);
      }
      file.chunks.add(chunkKey);
      file.receivedBytes += chunk.length;
      transfer.receivedBytes += chunk.length;
    }

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
    const paths = transfer?.files?.filter(Boolean).map((file) => file.path) ?? [];
    const expectedBytes = Number(message.totalBytes) || transfer?.totalBytes || 0;
    const receivedBytes = transfer?.receivedBytes ?? 0;
    const isComplete = expectedBytes === 0 || receivedBytes >= expectedBytes;
    this.logger?.info(
      `文件剪贴板接收完成：${message.fileCount ?? transfer?.fileCount ?? 0} 个文件，${receivedBytes} 字节`,
    );

    if (!transfer || paths.length === 0) {
      return {
        type: "clipboard_file_result",
        transferId: message.transferId,
        accepted: false,
        receivedBytes,
        totalBytes: message.totalBytes,
        fileCount: message.fileCount ?? 0,
        saveMode: "failed",
        reason: "没有找到可写入剪贴板的文件。",
      };
    }

    if (!isComplete) {
      return {
        type: "clipboard_file_result",
        transferId: message.transferId,
        accepted: false,
        receivedBytes,
        totalBytes: message.totalBytes,
        fileCount: message.fileCount ?? transfer.fileCount,
        saveMode: "failed",
        reason: `文件块未接收完整：${receivedBytes}/${expectedBytes} 字节。`,
      };
    }

    if (!this.canUseSystemFileClipboard()) {
      return {
        type: "clipboard_file_result",
        transferId: message.transferId,
        accepted: true,
        receivedBytes,
        totalBytes: message.totalBytes,
        fileCount: message.fileCount ?? transfer.fileCount,
        saveMode: "temp",
        savedPaths: paths,
        reason: `当前环境不是 Windows，文件已保存到临时目录：${transfer.rootDir}`,
      };
    }

    const result = this.writeSystemFiles(paths);
    if (!result.ok) {
      this.logger?.warn(`Windows 系统文件剪贴板写入失败：${result.reason}`);
      return {
        type: "clipboard_file_result",
        transferId: message.transferId,
        accepted: false,
        receivedBytes,
        totalBytes: message.totalBytes,
        fileCount: message.fileCount ?? transfer.fileCount,
        saveMode: "failed",
        savedPaths: paths,
        code: "LAN011",
        reason: result.reason,
      };
    }

    return {
      type: "clipboard_file_result",
      transferId: message.transferId,
      accepted: true,
      receivedBytes,
      totalBytes: message.totalBytes,
      fileCount: message.fileCount ?? transfer.fileCount,
      saveMode: "clipboard",
      savedPaths: paths,
      reason: "Windows 系统文件剪贴板已写入。",
    };
  }

  writeSystemFiles(paths) {
    const script = [
      "$ErrorActionPreference = 'Stop'",
      "[Console]::InputEncoding = [System.Text.Encoding]::UTF8",
      "$paths = [Console]::In.ReadToEnd() | ConvertFrom-Json",
      "$lastError = $null",
      "for ($attempt = 1; $attempt -le 5; $attempt += 1) { try { Set-Clipboard -Path $paths; $lastError = $null; break } catch { $lastError = $_; Start-Sleep -Milliseconds (80 * $attempt) } }",
      "if ($lastError -ne $null) { throw $lastError }",
    ].join("; ");

    const result = spawnSync(
      this.powershellCommand,
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      {
        input: JSON.stringify(paths),
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
            ? `PowerShell 写入文件剪贴板超时（${this.clipboardTimeoutMs} ms）`
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
}
