import { createServer } from "node:http";

import { WindowsAudioCaptureCoordinator } from "./windows-audio-capture.mjs";
import { WindowsClipboardBridge } from "./windows-clipboard-bridge.mjs";
import { WindowsHostLogger } from "./windows-host-logger.mjs";
import { WindowsInputInjector } from "./windows-input-injector.mjs";
import { WindowsScreenCaptureCoordinator } from "./windows-screen-capture.mjs";
import { decodeFrames, encodeTextFrame, makeAcceptKey } from "./websocket-codec.mjs";

const protocolVersion = 1;
const defaultPassword = "demo-password";

function makeMessageId(prefix = "winhost") {
  const random = Math.random().toString(16).slice(2, 8);
  return `${prefix}-${Date.now().toString(16)}-${random}`;
}

function makeSessionAnswer(message, screen, audio) {
  return {
    type: "session_answer",
    ok: true,
    videoCodec: screen.videoCodec,
    audioCodec: audio.audioCodec,
    fps: screen.fps,
    maxBandwidthKbps: screen.maxBandwidthKbps,
    width: screen.width,
    height: screen.height,
    clipboardText: Boolean(message.wantClipboardText),
    clipboardFile: false,
    hostMode: "windows-host-skeleton",
  };
}

function createClient(socket, context) {
  let buffer = Buffer.alloc(0);
  let session = null;
  let frameId = 0;
  let frameTimer = null;

  function send(message) {
    socket.write(
      encodeTextFrame(JSON.stringify({
        id: makeMessageId(message.type),
        timestamp: new Date().toISOString(),
        ...message,
      })),
    );
  }

  function stopVideoFrames() {
    if (frameTimer) {
      clearInterval(frameTimer);
      frameTimer = null;
    }
    context.screen.stop();
  }

  function startVideoFrames(nextSession) {
    stopVideoFrames();
    context.screen.start(nextSession);
    const intervalMs = Math.max(120, Math.round(1000 / Math.min(Number(nextSession.fps) || 5, 8)));
    frameTimer = setInterval(() => {
      frameId += 1;
      send(context.screen.makeFrame(frameId, nextSession));
    }, intervalMs);
  }

  function handleMessage(message) {
    if (message.type === "hello") {
      send({
        type: "hello_ack",
        protocolVersion,
        hostName: "Windows 被控端骨架",
        hostPlatform: "windows",
        capabilities: {
          screen: context.screen.getCapabilities(),
          audio: context.audio.getCapabilities(),
          input: context.input.getCapabilities(),
          clipboardText: true,
          clipboardFile: false,
        },
      });
      return;
    }

    if (message.type === "auth_request") {
      const ok = message.password === context.password;
      send({
        type: "auth_result",
        ok,
        code: ok ? "" : "LAN002",
        reason: ok ? "" : "连接密码不正确",
      });
      context.logger.info(ok ? "认证通过" : "认证失败");
      return;
    }

    if (message.type === "session_offer") {
      const screen = context.screen.negotiate(message);
      const audio = context.audio.negotiate(message);
      session = makeSessionAnswer(message, screen, audio);
      send(session);
      if (message.wantVideo !== false) {
        startVideoFrames(session);
      }
      context.logger.info(`会话已协商：${session.width}x${session.height} / ${session.fps} FPS`);
      return;
    }

    if (message.type === "display_settings") {
      if (session) {
        session = {
          ...session,
          width: Number(message.width) || session.width,
          height: Number(message.height) || session.height,
          fps: Number(message.fps) || session.fps,
          maxBandwidthKbps: Number(message.maxBandwidthKbps) || session.maxBandwidthKbps,
        };
        startVideoFrames(session);
      }
      send({ type: "display_settings_ack", accepted: true });
      return;
    }

    if (message.type === "input_event") {
      context.input.inject(message);
      return;
    }

    if (message.type === "clipboard_text") {
      send(context.clipboard.receiveText(message));
      return;
    }

    if (message.type === "reverse_control_request") {
      send({
        type: "reverse_control_response",
        requestId: message.requestId,
        accepted: false,
        reason: "Windows 被控端骨架已收到请求，反控切换状态机尚未实装。",
      });
      return;
    }

    send({
      type: "error",
      code: "LAN003",
      message: `Windows 被控端暂不支持消息：${message.type ?? "unknown"}`,
    });
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

export function createWindowsHostServer({
  host = "0.0.0.0",
  port = 43770,
  password = defaultPassword,
  logger = new WindowsHostLogger(),
} = {}) {
  const screen = new WindowsScreenCaptureCoordinator({ logger });
  const audio = new WindowsAudioCaptureCoordinator({ logger });
  const input = new WindowsInputInjector({ logger });
  const clipboard = new WindowsClipboardBridge({ logger });

  const server = createServer((request, response) => {
    response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("LAN dual control Windows host skeleton. Use WebSocket to connect.\n");
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

    logger.info(`收到控制端连接：${request.socket.remoteAddress ?? "unknown"}`);
    createClient(socket, { password, logger, screen, audio, input, clipboard });
  });

  return {
    host,
    port,
    server,
    listen() {
      return new Promise((resolve) => {
        server.listen(port, host, () => {
          logger.info(`Windows 被控端骨架已监听 ws://${host}:${port}`);
          logger.info("当前为骨架模式：模拟视频帧、记录输入事件、不注入系统。");
          resolve();
        });
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
