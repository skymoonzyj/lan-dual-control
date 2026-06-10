import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const websocketGuid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const defaultPassword = "demo-password";

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

function negotiateSession(message) {
  const width = Number(message.preferredWidth) || 1920;
  const height = Number(message.preferredHeight) || 1080;
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
    clipboardText: Boolean(message.wantClipboardText),
    clipboardFile: Boolean(message.wantClipboardFile),
  };
}

function makeMockVideoFrame(frameId, width = 1920, height = 1080) {
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
      <text x="${Math.round(width * 0.15)}" y="${Math.round(height * 0.42)}" font-family="Consolas, monospace" font-size="30" fill="#4b5563">frame #${frameId}</text>
      <text x="${Math.round(width * 0.15)}" y="${Math.round(height * 0.48)}" font-family="Consolas, monospace" font-size="26" fill="#4b5563">${now.toLocaleTimeString("zh-CN")}</text>
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
  let frameTimer = null;

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
      send({
        type: "auth_result",
        ok,
        code: ok ? "" : "LAN002",
        reason: ok ? "" : "连接密码不正确",
      });
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

      const session = negotiateSession(message);
      send(session);
      startVideoFrames(session);
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
      return;
    }

    if (message.type === "display_settings") {
      send({
        type: "display_settings_ack",
        accepted: true,
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

    if (message.type === "input_event") {
      inputCount += 1;
      if (inputCount <= 3 || inputCount % 20 === 0) {
        console.log(`input_event #${inputCount}: ${message.kind ?? ""} ${message.detail ?? ""}`);
      }
      return;
    }

    if (message.type === "reverse_control_request") {
      send({
        type: "reverse_control_response",
        accepted: false,
        reason: "假 Mac 服务只用于联调，暂不切换控制方向",
      });
    }
  }

  function startVideoFrames(session) {
    stopVideoFrames();
    const intervalMs = Math.max(120, Math.round(1000 / Math.min(Number(session.fps) || 5, 8)));
    frameTimer = setInterval(() => {
      frameCount += 1;
      send(makeMockVideoFrame(frameCount, session.width, session.height));
    }, intervalMs);
  }

  function stopVideoFrames() {
    if (frameTimer) {
      clearInterval(frameTimer);
      frameTimer = null;
    }
  }

  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    const decoded = decodeFrames(buffer);
    buffer = decoded.rest;

    decoded.messages.forEach((frame) => {
      if (frame.type === "close") {
        stopVideoFrames();
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
  socket.on("error", stopVideoFrames);
}

export function createMockMacHostServer({
  host = "127.0.0.1",
  port = 43770,
  password = defaultPassword,
} = {}) {
  const server = createServer((request, response) => {
    response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
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
