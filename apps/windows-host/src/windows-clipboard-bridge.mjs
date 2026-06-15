import { spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const defaultClipboardTimeoutMs = 6000;
const defaultMaxChunkBytes = 64 * 1024;
const defaultMaxFileCount = 64;
const defaultMaxTotalFileBytes = 512 * 1024 * 1024;

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

function toPositiveInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    return fallback;
  }
  return number;
}

function toNonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    return fallback;
  }
  return number;
}

function isNonNegativeInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0;
}

function intervalsOverlap(intervals, start, end) {
  return intervals.some((interval) => start < interval.end && end > interval.start);
}

function insertInterval(intervals, start, end) {
  if (end <= start) {
    return intervals;
  }
  intervals.push({ start, end });
  intervals.sort((left, right) => left.start - right.start || left.end - right.end);
  return intervals;
}

function coveredBytes(intervals) {
  return intervals.reduce((sum, interval) => sum + Math.max(0, interval.end - interval.start), 0);
}

function fileIsComplete(file) {
  if (file.size === 0) {
    return true;
  }
  return file.receivedBytes === file.size
    && file.intervals.length > 0
    && file.intervals[0].start === 0
    && file.intervals.at(-1).end === file.size
    && file.intervals.every((interval, index) => index === 0 || interval.start === file.intervals[index - 1].end);
}

function transferReceivedBytes(transfer) {
  return transfer.files.reduce((sum, file) => sum + (file?.receivedBytes || 0), 0);
}

export class WindowsClipboardBridge {
  constructor({
    logger,
    mode = process.env.LAN_DUAL_WINDOWS_CLIPBOARD_MODE || "auto",
    powershellCommand = process.env.LAN_DUAL_POWERSHELL || "powershell.exe",
    clipboardTimeoutMs = defaultClipboardTimeoutMs,
    maxChunkBytes = process.env.LAN_DUAL_WINDOWS_CLIPBOARD_MAX_CHUNK_BYTES,
    maxFileCount = process.env.LAN_DUAL_WINDOWS_CLIPBOARD_MAX_FILE_COUNT,
    maxTotalFileBytes = process.env.LAN_DUAL_WINDOWS_CLIPBOARD_MAX_TOTAL_BYTES,
  } = {}) {
    this.logger = logger;
    this.mode = normalizeClipboardMode(mode);
    this.powershellCommand = powershellCommand;
    this.clipboardTimeoutMs = Number(clipboardTimeoutMs) || defaultClipboardTimeoutMs;
    this.maxChunkBytes = toPositiveInteger(maxChunkBytes, defaultMaxChunkBytes);
    this.maxFileCount = toPositiveInteger(maxFileCount, defaultMaxFileCount);
    this.maxTotalFileBytes = toPositiveInteger(maxTotalFileBytes, defaultMaxTotalFileBytes);
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
    const transferKey = String(message.transferId || "");
    if (!transferKey) {
      return this.rejectFileOffer(message, "文件剪贴板清单缺少 transferId。");
    }
    if (this.fileTransfers.has(transferKey)) {
      return this.rejectFileOffer(message, "同一个 transferId 已有进行中的文件剪贴板传输。");
    }

    const transferId = sanitizeTransferId(message.transferId);
    const rootDir = join(tmpdir(), "lan-dual-control-windows-host-clipboard", transferId);
    const fileMetas = Array.isArray(message.files) ? message.files : [];
    const offeredFileCount = toNonNegativeInteger(message.fileCount, fileMetas.length);
    if (fileMetas.length === 0 || offeredFileCount === 0) {
      return this.rejectFileOffer(message, "文件剪贴板清单为空。");
    }
    if (offeredFileCount !== fileMetas.length) {
      return this.rejectFileOffer(message, `文件数量不一致：清单 ${fileMetas.length}，声明 ${offeredFileCount}。`);
    }
    if (offeredFileCount > this.maxFileCount) {
      return this.rejectFileOffer(message, `文件数量 ${offeredFileCount} 超过上限 ${this.maxFileCount}。`);
    }

    let files = [];
    try {
      files = fileMetas.map((file, index) => {
        const declaredIndex = file?.index == null ? index : Number(file.index);
        if (!Number.isSafeInteger(declaredIndex) || declaredIndex !== index) {
          throw new Error(`文件索引不连续：第 ${index + 1} 项声明为 ${file?.index ?? "missing"}。`);
        }
        const name = safeFileName(file?.name, `clipboard-${index + 1}`);
        const size = toNonNegativeInteger(file?.size, -1);
        if (size < 0) {
          throw new Error(`文件 ${name} 大小无效。`);
        }
        return {
          index,
          name,
          size,
          mimeType: file?.mimeType || "application/octet-stream",
          path: join(rootDir, `${String(index + 1).padStart(3, "0")}-${name}`),
          receivedBytes: 0,
          intervals: [],
          emptyChunkReceived: false,
          fileCreated: false,
        };
      });
    } catch (error) {
      return this.rejectFileOffer(message, error.message);
    }
    const declaredTotalBytes = toNonNegativeInteger(message.totalBytes, files.reduce((sum, file) => sum + file.size, 0));
    const expectedTotalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (declaredTotalBytes !== expectedTotalBytes) {
      return this.rejectFileOffer(message, `文件总大小不一致：清单 ${expectedTotalBytes}，声明 ${declaredTotalBytes}。`);
    }
    if (expectedTotalBytes > this.maxTotalFileBytes) {
      return this.rejectFileOffer(
        message,
        `文件总大小 ${expectedTotalBytes} 字节超过上限 ${this.maxTotalFileBytes} 字节。`,
      );
    }

    mkdirSync(rootDir, { recursive: true });
    const transferMaxChunkBytes = Math.min(
      toPositiveInteger(message.maxChunkBytes, this.maxChunkBytes),
      this.maxChunkBytes,
    );
    const transfer = {
      totalBytes: expectedTotalBytes,
      receivedBytes: 0,
      fileCount: offeredFileCount,
      maxChunkBytes: transferMaxChunkBytes,
      rootDir,
      files,
    };
    this.fileTransfers.set(transferKey, transfer);
    this.logger?.info(
      `收到文件剪贴板清单：${transfer.fileCount} 个文件，共 ${transfer.totalBytes} 字节 / ${rootDir}`,
    );

    return {
      type: "clipboard_file_response",
      transferId: message.transferId,
      accepted: true,
      saveMode: this.canUseSystemFileClipboard() ? "clipboard" : "temp",
      maxChunkBytes: transfer.maxChunkBytes,
      reason: "Windows 被控端已准备接收文件块并保存到临时目录。",
    };
  }

  receiveFileChunk(message) {
    const transferKey = String(message.transferId || "");
    const transfer = this.fileTransfers.get(transferKey);
    if (!transfer) {
      return this.rejectFileChunk(message, "必须先发送并接受 clipboard_file_offer，不能直接发送文件块。");
    }

    if (!isNonNegativeInteger(message.fileIndex)) {
      return this.rejectFileChunk(message, "文件块缺少有效 fileIndex。", transfer);
    }
    const fileIndex = Number(message.fileIndex);
    const file = transfer.files[fileIndex];
    if (!file) {
      return this.rejectFileChunk(message, `文件索引 ${fileIndex} 不在清单范围内。`, transfer);
    }
    if (message.chunkIndex != null && !isNonNegativeInteger(message.chunkIndex)) {
      return this.rejectFileChunk(message, "文件块缺少有效 chunkIndex。", transfer);
    }
    if (!isNonNegativeInteger(message.offset)) {
      return this.rejectFileChunk(message, "文件块缺少有效 offset。", transfer);
    }
    const offset = Number(message.offset);
    const chunk = decodeFileChunk(message);
    if (message.bytes != null && toNonNegativeInteger(message.bytes, -1) !== chunk.length) {
      return this.rejectFileChunk(message, `文件块大小不一致：声明 ${message.bytes}，实际 ${chunk.length}。`, transfer);
    }
    if (chunk.length > transfer.maxChunkBytes) {
      return this.rejectFileChunk(
        message,
        `文件块 ${chunk.length} 字节超过本次协商上限 ${transfer.maxChunkBytes} 字节。`,
        transfer,
      );
    }
    if (chunk.length === 0 && file.size !== 0) {
      return this.rejectFileChunk(message, "非空文件不能接收 0 字节文件块。", transfer);
    }
    const end = offset + chunk.length;
    if (!Number.isSafeInteger(end) || end > file.size) {
      return this.rejectFileChunk(message, `文件块越界：${offset}+${chunk.length} > ${file.size}。`, transfer);
    }
    if (chunk.length > 0 && intervalsOverlap(file.intervals, offset, end)) {
      return this.rejectFileChunk(message, `文件块与已接收区间重叠：${offset}-${end}。`, transfer);
    }

    if (chunk.length === 0) {
      if (file.emptyChunkReceived) {
        return this.rejectFileChunk(message, `文件块与已接收区间重叠：${offset}-${end}。`, transfer);
      }
      const fd = openSync(file.path, file.fileCreated ? "r+" : "w");
      closeSync(fd);
      file.emptyChunkReceived = true;
      file.fileCreated = true;
    } else {
      const fd = openSync(file.path, file.fileCreated ? "r+" : "w+");
      try {
        writeSync(fd, chunk, 0, chunk.length, offset);
      } finally {
        closeSync(fd);
      }
      file.fileCreated = true;
      insertInterval(file.intervals, offset, end);
      file.receivedBytes = coveredBytes(file.intervals);
    }
    transfer.receivedBytes = transferReceivedBytes(transfer);

    this.fileTransfers.set(transferKey, transfer);

    return {
      type: "clipboard_file_progress",
      transferId: message.transferId,
      accepted: true,
      receivedBytes: transfer.receivedBytes,
      totalBytes: transfer.totalBytes,
    };
  }

  completeFileTransfer(message) {
    const transferKey = String(message.transferId || "");
    const transfer = this.fileTransfers.get(transferKey);
    this.fileTransfers.delete(transferKey);
    const paths = transfer?.files?.filter(Boolean).map((file) => file.path) ?? [];
    const expectedBytes = transfer?.totalBytes ?? toNonNegativeInteger(message.totalBytes, 0);
    const receivedBytes = transfer?.receivedBytes ?? 0;
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

    const declaredCompleteFileCount = toNonNegativeInteger(message.fileCount, transfer.fileCount);
    const declaredCompleteTotalBytes = toNonNegativeInteger(message.totalBytes, transfer.totalBytes);
    if (declaredCompleteFileCount !== transfer.fileCount || declaredCompleteTotalBytes !== transfer.totalBytes) {
      return {
        type: "clipboard_file_result",
        transferId: message.transferId,
        accepted: false,
        receivedBytes,
        totalBytes: transfer.totalBytes,
        fileCount: transfer.fileCount,
        saveMode: "failed",
        code: "LAN010",
        reason: `完成消息与清单不一致：files ${declaredCompleteFileCount}/${transfer.fileCount}, bytes ${declaredCompleteTotalBytes}/${transfer.totalBytes}。`,
      };
    }

    const incompleteFile = transfer.files.find((file) => !fileIsComplete(file));
    if (incompleteFile || receivedBytes !== expectedBytes) {
      const detail = incompleteFile
        ? `${incompleteFile.name} ${incompleteFile.receivedBytes}/${incompleteFile.size} 字节`
        : `${receivedBytes}/${expectedBytes} 字节`;
      return {
        type: "clipboard_file_result",
        transferId: message.transferId,
        accepted: false,
        receivedBytes,
        totalBytes: transfer.totalBytes,
        fileCount: transfer.fileCount,
        saveMode: "failed",
        code: "LAN010",
        reason: `文件块未接收完整：${detail}。`,
      };
    }

    for (const file of transfer.files) {
      if (file.size === 0 && !file.fileCreated) {
        const fd = openSync(file.path, "w");
        closeSync(fd);
        file.fileCreated = true;
      }
    }

    if (!this.canUseSystemFileClipboard()) {
      return {
        type: "clipboard_file_result",
        transferId: message.transferId,
        accepted: true,
        receivedBytes,
        totalBytes: transfer.totalBytes,
        fileCount: transfer.fileCount,
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
        totalBytes: transfer.totalBytes,
        fileCount: transfer.fileCount,
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
      totalBytes: transfer.totalBytes,
      fileCount: transfer.fileCount,
      saveMode: "clipboard",
      savedPaths: paths,
      reason: "Windows 系统文件剪贴板已写入。",
    };
  }

  rejectFileOffer(message, reason, code = "LAN010") {
    this.logger?.warn(`文件剪贴板清单被拒绝：${reason}`);
    return {
      type: "clipboard_file_response",
      transferId: message.transferId,
      accepted: false,
      saveMode: "failed",
      maxChunkBytes: this.maxChunkBytes,
      code,
      reason,
    };
  }

  rejectFileChunk(message, reason, transfer = null, code = "LAN010") {
    this.logger?.warn(`文件剪贴板块被拒绝：${reason}`);
    return {
      type: "clipboard_file_progress",
      transferId: message.transferId,
      accepted: false,
      receivedBytes: transfer?.receivedBytes ?? 0,
      totalBytes: transfer?.totalBytes ?? message.totalBytes,
      code,
      reason,
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
