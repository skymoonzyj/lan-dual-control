import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const websocketGuid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const defaultPassword = "demo-password";
const mockDisplays = [
  { id: "main", name: "内建显示器", width: 1920, height: 1080, primary: true },
  { id: "secondary", name: "扩展显示器", width: 2560, height: 1440, primary: false },
];

function makeAcceptKey(key) {
  return createHash("sha1")
    .update(`${key}${websocketGuid}`)
    .digest("base64");
}

function encodeTextFrame(payload) {
  const body = Buffer.from(payload, "utf8");

  if (body.length < 126) {
    return Buffer.concat([Buffer.from([0x81, body.length]), body]);
  }

  if (body.length <= 0xffff) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(body.length, 2);
    return Buffer.concat([header, body]);
  }

  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(body.length), 2);
  return Buffer.concat([header, body]);
}

function decodeFrames(buffer) {
  const messages = [];
  let offset = 0;

  while (buffer.length - offset >= 2) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = Boolean(second & 0x80);
    let length = second & 0x7f;
    let headerLength = 2;

    if (length === 126) {
      if (buffer.length - offset < 4) break;
      length = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (length === 127) {
      if (buffer.length - offset < 10) break;
      length = Number(buffer.readBigUInt64BE(offset + 2));
      headerLength = 10;
    }

    const maskLength = masked ? 4 : 0;
    const frameLength = headerLength + maskLength + length;
    if (buffer.length - offset < frameLength) break;

    if (opcode === 0x8) {
      messages.push({ type: "close" });
      offset += frameLength;
      continue;
    }

    if (opcode !== 0x1) {
      offset += frameLength;
      continue;
    }

    const maskStart = offset + headerLength;
    const payloadStart = maskStart + maskLength;
    const payload = Buffer.from(buffer.subarray(payloadStart, payloadStart + length));

    if (masked) {
      const mask = buffer.subarray(maskStart, maskStart + 4);
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] ^= mask[index % 4];
      }
    }

    messages.push({
      type: "text",
      body: payload.toString("utf8"),
    });
    offset += frameLength;
  }

  return {
    messages,
    rest: buffer.subarray(offset),
  };
}

function pickMockDisplay(displayId) {
  return (
    mockDisplays.find((display) => display.id === displayId) ||
    mockDisplays.find((display) => display.primary) ||
    mockDisplays[0]
  );
}

function negotiateSession(message) {
  const activeDisplay = pickMockDisplay(message.displayId);
  const width = Number(message.preferredWidth) || activeDisplay.width || 1920;
  const height = Number(message.preferredHeight) || activeDisplay.height || 1080;
  const maxFps = Number(message.maxFps) || 60;
  const maxBandwidthKbps = Number(message.maxBandwidthKbps) || 50000;

  return {
    type: "session_answer",
    ok: true,
    videoCodec: message.preferredVideoCodec ?? "mjpeg",
    audioCodec: message.wantAudio ? (message.preferredAudioCodec ?? "opus") : "none",
    fps: Math.min(maxFps, 60),
    maxBandwidthKbps,
    width,
    height,
    displays: mockDisplays,
    activeDisplayId: activeDisplay.id,
    displayName: activeDisplay.name,
    audioEnabled: Boolean(message.wantAudio),
    sampleRate: 48000,
    channels: 2,
    clipboardText: Boolean(message.wantClipboardText),
    clipboardFile: Boolean(message.wantClipboardFile),
  };
}

function makeMockVideoFrame(frameId, width = 1920, height = 1080, displayName = "内建显示器") {
  const now = new Date();
  const hue = (frameId * 23) % 360;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="hsl(${hue}, 42%, 24%)"/>
          <stop offset="100%" stop-color="hsl(${(hue + 90) % 360}, 38%, 12%)"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
      <rect x="48" y="42" width="${width - 96}" height="46" rx="12" fill="rgba(255,255,255,0.9)"/>
      <text x="76" y="72" font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="22" fill="#1f2937">Mock Mac Desktop</text>
      <rect x="${Math.round(width * 0.12)}" y="${Math.round(height * 0.18)}" width="${Math.round(width * 0.48)}" height="${Math.round(height * 0.46)}" rx="18" fill="rgba(255,255,255,0.92)"/>
      <circle cx="${Math.round(width * 0.15)}" cy="${Math.round(height * 0.22)}" r="12" fill="#ef4444"/>
      <circle cx="${Math.round(width * 0.18)}" cy="${Math.round(height * 0.22)}" r="12" fill="#f59e0b"/>
      <circle cx="${Math.round(width * 0.21)}" cy="${Math.round(height * 0.22)}" r="12" fill="#22c55e"/>
      <text x="${Math.round(width * 0.15)}" y="${Math.round(height * 0.34)}" font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="44" font-weight="700" fill="#111827">局域网远控测试帧</text>
      <text x="${Math.round(width * 0.15)}" y="${Math.round(height * 0.42)}" font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="30" fill="#4b5563">${displayName}</text>
      <text x="${Math.round(width * 0.15)}" y="${Math.round(height * 0.49)}" font-family="Consolas, monospace" font-size="30" fill="#4b5563">frame #${frameId}</text>
      <text x="${Math.round(width * 0.15)}" y="${Math.round(height * 0.55)}" font-family="Consolas, monospace" font-size="26" fill="#4b5563">${now.toLocaleTimeString("zh-CN")}</text>
    </svg>`;

  return {
    type: "video_frame",
    frameId,
    timestamp: now.toISOString(),
    width,
    height,
    codec: "mock-svg",
    encoding: "data-url",
    keyFrame: frameId === 1 || frameId % 30 === 0,
    dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`,
  };
}

function createClient(socket, options) {
  let buffer = Buffer.alloc(0);
  let inputCount = 0;
  let frameCount = 0;
  let audioFrameCount = 0;
  let frameTimer = null;
  let audioTimer = null;
  let session = null;
  let authenticated = false;
  const fileTransfers = new Map();

  function send(message) {
    socket.write(encodeTextFrame(JSON.stringify({
      id: `mock-${Date.now().toString(16)}`,
      timestamp: new Date().toISOString(),
      ...message,
    })));
  }

  function handleMessage(message) {
    if (message.type === "hello") {
      send({
        type: "hello_ack",
        protocolVersion: 1,
        hostName: "本机假 Mac",
        hostPlatform: "macos",
      });
      return;
    }

    if (message.type === "auth_request") {
      const ok = message.password === options.password && message.mockScenario !== "auth_failed";
      authenticated = ok;
      send({
        type: "auth_result",
        ok,
        code: ok ? "" : "LAN002",
        reason: ok ? "" : "连接密码不正确",
      });
      return;
    }

    if (!authenticated) {
      sendAuthRequired(message);
      return;
    }

    if (message.type === "session_offer") {
      if (message.mockScenario === "screen_permission_denied") {
        send({
          type: "session_answer",
          ok: false,
          code: "LAN004",
          reason: "Mac 缺少屏幕录制权限",
        });
        return;
      }

      if (message.mockScenario === "accessibility_permission_denied") {
        send({
          type: "session_answer",
          ok: false,
          code: "LAN005",
          reason: "Mac 缺少辅助功能权限",
        });
        return;
      }

      session = negotiateSession(message);
      send(session);
      startVideoFrames(session);
      if (message.wantAudio) {
        startAudioFrames(session);
      }
      if (message.mockScenario === "video_interrupted") {
        setTimeout(() => {
          send({
            type: "error",
            code: "LAN007",
            message: "视频流中断",
          });
          stopVideoFrames();
        }, 2600);
      }
      if (message.mockScenario === "disconnect_after_connect") {
        setTimeout(() => {
          stopVideoFrames();
          socket.end();
        }, 3200);
      }
      if (message.mockScenario === "incoming_reverse_request") {
        setTimeout(() => {
          send({
            type: "reverse_control_request",
            requestId: `reverse-${Date.now().toString(16)}`,
            from: "本机假 Mac",
            message: "本机假 Mac 请求切换为 Mac 控制 Windows",
          });
        }, 1800);
      }
      return;
    }

    if (message.type === "display_settings") {
      if (session) {
        const activeDisplay = pickMockDisplay(message.displayId);
        session = {
          ...session,
          activeDisplayId: activeDisplay.id,
          displayName: activeDisplay.name,
          width:
            message.resolutionMode === "native"
              ? activeDisplay.width
              : Number(message.width) || session.width,
          height:
            message.resolutionMode === "native"
              ? activeDisplay.height
              : Number(message.height) || session.height,
          fps: Number(message.fps) || session.fps,
          maxBandwidthKbps: Number(message.maxBandwidthKbps) || session.maxBandwidthKbps,
          audioEnabled: Boolean(message.audio),
          audioVolume: Number(message.audioVolume) || session.audioVolume || 80,
        };
        startVideoFrames(session);
        if (session.audioEnabled) {
          startAudioFrames(session);
        } else {
          stopAudioFrames();
        }
      }
      send({
        type: "display_settings_ack",
        accepted: true,
      });
      return;
    }

    if (message.type === "audio_settings_update") {
      if (session) {
        session = {
          ...session,
          audioEnabled: Boolean(message.enabled),
          audioVolume: Number(message.volume) || 0,
          muted: Boolean(message.muted),
        };
      }
      if (message.enabled && !message.muted) {
        startAudioFrames(session ?? message);
      } else {
        stopAudioFrames();
      }
      send({
        type: "audio_settings_ack",
        enabled: Boolean(message.enabled),
        volume: Number(message.volume) || 0,
        muted: Boolean(message.muted),
      });
      return;
    }

    if (message.type === "clipboard_text") {
      send({
        type: "clipboard_ack",
        accepted: true,
        clipboardId: message.clipboardId,
        textLength: message.textLength ?? message.text?.length ?? 0,
      });
      return;
    }

    if (message.type === "clipboard_file_offer") {
      fileTransfers.set(message.transferId, {
        totalBytes: Number(message.totalBytes) || 0,
        receivedBytes: 0,
        fileCount: Number(message.fileCount) || message.files?.length || 0,
      });
      send({
        type: "clipboard_file_response",
        transferId: message.transferId,
        accepted: true,
        saveMode: "memory-only",
        maxChunkBytes: message.maxChunkBytes,
        reason: "假 Mac 服务已准备接收文件块。",
      });
      return;
    }

    if (message.type === "clipboard_file_chunk") {
      const transfer = fileTransfers.get(message.transferId) ?? {
        totalBytes: Number(message.totalBytes) || 0,
        receivedBytes: 0,
        fileCount: 0,
      };
      transfer.receivedBytes =
        Number(message.sentBytes) ||
        Math.min(
          transfer.totalBytes || Number(message.totalBytes) || Number.MAX_SAFE_INTEGER,
          transfer.receivedBytes + Number(message.bytes || 0),
        );
      fileTransfers.set(message.transferId, transfer);
      send({
        type: "clipboard_file_progress",
        transferId: message.transferId,
        receivedBytes: transfer.receivedBytes,
        totalBytes: transfer.totalBytes || message.totalBytes,
      });
      return;
    }

    if (message.type === "clipboard_file_complete") {
      const transfer = fileTransfers.get(message.transferId);
      send({
        type: "clipboard_file_result",
        transferId: message.transferId,
        accepted: true,
        receivedBytes: transfer?.receivedBytes ?? message.totalBytes ?? 0,
        totalBytes: message.totalBytes,
        fileCount: message.fileCount,
        reason: "假 Mac 服务已接收文件块，真实剪贴板写入后续接入。",
      });
      fileTransfers.delete(message.transferId);
      return;
    }

    if (message.type === "input_event") {
      inputCount += 1;
      if (inputCount <= 3 || inputCount % 20 === 0) {
        console.log(`input_event #${inputCount}: ${message.kind ?? ""} ${message.detail ?? ""}`);
      }
      return;
    }

    if (message.type === "reverse_control_request") {
      if (message.mockScenario === "reverse_control_timeout") {
        return;
      }

      send({
        type: "reverse_control_response",
        requestId: message.requestId,
        accepted: message.mockScenario === "reverse_control_accepted",
        reason:
          message.mockScenario === "reverse_control_accepted"
            ? ""
            : "假 Mac 服务只用于联调，暂不切换控制方向",
      });
      return;
    }

    if (message.type === "reverse_control_response") {
      return;
    }
  }

  function sendAuthRequired(message) {
    const reason = "请先验证连接密码";
    if (message.type === "session_offer") {
      send({ type: "session_answer", ok: false, code: "LAN002", reason });
      return;
    }
    if (message.type === "display_settings") {
      send({ type: "display_settings_ack", accepted: false, code: "LAN002", reason });
      return;
    }
    if (message.type === "audio_settings_update") {
      send({ type: "audio_settings_ack", accepted: false, enabled: false, code: "LAN002", reason });
      return;
    }
    if (message.type === "clipboard_text") {
      send({ type: "clipboard_ack", accepted: false, clipboardId: message.clipboardId, code: "LAN002", reason });
      return;
    }
    if (message.type === "clipboard_file_offer") {
      send({ type: "clipboard_file_response", transferId: message.transferId, accepted: false, code: "LAN002", reason });
      return;
    }
    if (message.type === "reverse_control_request") {
      send({ type: "reverse_control_response", requestId: message.requestId, accepted: false, code: "LAN002", reason });
      return;
    }
    send({ type: "error", code: "LAN002", message: reason });
  }

  function startVideoFrames(session) {
    stopVideoFrames();
    const intervalMs = Math.max(120, Math.round(1000 / Math.min(Number(session.fps) || 5, 8)));
    frameTimer = setInterval(() => {
      frameCount += 1;
      send(makeMockVideoFrame(frameCount, session.width, session.height, session.displayName));
    }, intervalMs);
  }

  function stopVideoFrames() {
    if (frameTimer) {
      clearInterval(frameTimer);
      frameTimer = null;
    }
  }

  function startAudioFrames(settings = {}) {
    stopAudioFrames();
    const volume = Math.max(0, Math.min(100, Number(settings.audioVolume ?? settings.volume ?? 80)));
    audioTimer = setInterval(() => {
      audioFrameCount += 1;
      const wave = (Math.sin(audioFrameCount / 2.8) + 1) / 2;
      send({
        type: "audio_frame",
        frameId: audioFrameCount,
        codec: "mock-opus",
        sampleRate: Number(settings.sampleRate) || 48000,
        channels: Number(settings.channels) || 2,
        durationMs: 20,
        level: Number((wave * (volume / 100)).toFixed(3)),
        volume,
        latencyMs: 16 + (audioFrameCount % 8),
        encoding: "mock",
      });
    }, 240);
  }

  function stopAudioFrames() {
    if (audioTimer) {
      clearInterval(audioTimer);
      audioTimer = null;
    }
  }

  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    const decoded = decodeFrames(buffer);
    buffer = decoded.rest;

    decoded.messages.forEach((frame) => {
      if (frame.type === "close") {
        stopVideoFrames();
        stopAudioFrames();
        socket.end();
        return;
      }

      try {
        handleMessage(JSON.parse(frame.body));
      } catch (error) {
        send({
          type: "error",
          message: `无法解析消息：${error.message}`,
        });
      }
    });
  });

  socket.on("close", stopVideoFrames);
  socket.on("close", stopAudioFrames);
  socket.on("error", stopVideoFrames);
  socket.on("error", stopAudioFrames);
}

export function createMockMacHostServer({
  host = "127.0.0.1",
  port = 43770,
  password = defaultPassword,
} = {}) {
  const server = createServer((request, response) => {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      response.writeHead(204, corsHeaders);
      response.end();
      return;
    }

    if ((request.url ?? "").split("?")[0] === "/discovery") {
      const requestHost = request.headers.host?.split(":")[0];
      const advertisedHost = host === "0.0.0.0" ? (requestHost ?? host) : host;
      response.writeHead(200, {
        ...corsHeaders,
        "Content-Type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify({
        type: "lan_dual_discovery",
        protocolVersion: 1,
        deviceId: `mock-mac-${advertisedHost}-${port}`,
        deviceName: "本机假 Mac",
        platform: "macos",
        role: "host",
        host: advertisedHost,
        port,
        controlPort: port,
        capabilities: {
          video: true,
          audio: true,
          input: true,
          clipboardText: true,
          clipboardFile: true,
          reverseControl: true,
          mock: true,
          displays: mockDisplays,
        },
        lastSeenAt: new Date().toISOString(),
      }));
      return;
    }

    response.writeHead(200, {
      ...corsHeaders,
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end("LAN dual control mock Mac host. Use WebSocket to connect.\n");
  });

  server.on("upgrade", (request, socket) => {
    const key = request.headers["sec-websocket-key"];
    if (!key) {
      socket.destroy();
      return;
    }

    socket.write([
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${makeAcceptKey(key)}`,
      "\r\n",
    ].join("\r\n"));
    createClient(socket, { password });
  });

  return {
    host,
    port,
    server,
    listen() {
      return new Promise((resolve) => {
        server.listen(port, host, resolve);
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const portArg = Number.parseInt(process.argv[2] ?? "", 10);
  const host = process.argv[3] ?? "127.0.0.1";
  const service = createMockMacHostServer({
    host,
    port: Number.isFinite(portArg) ? portArg : 43770,
  });

  await service.listen();
  console.log(`Mock Mac host: ws://${service.host}:${service.port}`);
  console.log(`Password: ${defaultPassword}`);
}
