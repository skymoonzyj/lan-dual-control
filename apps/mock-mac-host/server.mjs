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

function createClient(socket, options) {
  let buffer = Buffer.alloc(0);
  let inputCount = 0;

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
      const ok = message.password === options.password;
      send({
        type: "auth_result",
        ok,
        reason: ok ? "" : "连接密码不正确",
      });
      return;
    }

    if (message.type === "session_offer") {
      send(negotiateSession(message));
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

  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    const decoded = decodeFrames(buffer);
    buffer = decoded.rest;

    decoded.messages.forEach((frame) => {
      if (frame.type === "close") {
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
