import { createServer } from "node:http";

import { WindowsAudioCaptureCoordinator } from "./windows-audio-capture.mjs";
import { WindowsClipboardBridge } from "./windows-clipboard-bridge.mjs";
import { WindowsHostLogger } from "./windows-host-logger.mjs";
import { WindowsInputInjector } from "./windows-input-injector.mjs";
import { WindowsScreenCaptureCoordinator } from "./windows-screen-capture.mjs";
import { decodeFrames, encodeTextFrame, makeAcceptKey } from "./websocket-codec.mjs";

const protocolVersion = 1;
const defaultPassword = "demo-password";
const maxAuthAttempts = 3;

function makeMessageId(prefix = "winhost") {
  const random = Math.random().toString(16).slice(2, 8);
  return `${prefix}-${Date.now().toString(16)}-${random}`;
}

function makeInputAck(message, result) {
  return {
    type: "input_ack",
    inputId: message.id ?? "",
    sequence: message.sequence,
    event: message.event ?? message.action ?? message.kind ?? "unknown",
    accepted: Boolean(result.accepted),
    injected: Boolean(result.injected),
    mode: result.mode ?? "unknown",
    reason: result.reason ?? "",
  };
}

function makeSessionAnswer(message, screen, audio, clipboard) {
  const clipboardCapabilities = clipboard.getCapabilities();
  return {
    type: "session_answer",
    ok: true,
    videoCodec: screen.videoCodec,
    videoEncoding: screen.videoEncoding,
    audioCodec: audio.audioCodec,
    audioEnabled: audio.audioEnabled,
    sampleRate: audio.sampleRate,
    channels: audio.channels,
    fps: screen.fps,
    requestedFps: screen.requestedFps,
    maxScreenFps: screen.maxScreenFps,
    maxBandwidthKbps: screen.maxBandwidthKbps,
    width: screen.width,
    height: screen.height,
    displays: screen.displays,
    activeDisplayId: screen.activeDisplayId,
    displayName: screen.displayName,
    clipboardText: Boolean(message.wantClipboardText),
    clipboardTextMode: clipboardCapabilities.textMode,
    clipboardFile: Boolean(message.wantClipboardFile),
    clipboardFileMode: clipboardCapabilities.fileMode,
    hostMode: screen.hostMode ?? "windows-host-skeleton",
    capturePipeline: screen.capturePipeline ?? "mock-svg",
  };
}

function createClient(socket, context) {
  let buffer = Buffer.alloc(0);
  let session = null;
  let frameId = 0;
  let frameTimer = null;
  let videoRunId = 0;
  let captureBusy = false;
  let audioTimer = null;
  let authenticated = false;
  let failedAuthAttempts = 0;

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
    videoRunId += 1;
    captureBusy = false;
    if (frameTimer) {
      clearInterval(frameTimer);
      frameTimer = null;
    }
    context.screen.stop();
  }

  function stopAudioFrames() {
    if (audioTimer) {
      clearInterval(audioTimer);
      audioTimer = null;
    }
  }

  function startVideoFrames(nextSession) {
    stopVideoFrames();
    context.screen.start(nextSession);
    const runId = videoRunId + 1;
    videoRunId = runId;
    captureBusy = false;
    const intervalMs = Math.max(120, Math.round(1000 / Math.min(Number(nextSession.fps) || 5, 8)));
    const sendNextFrame = async () => {
      if (runId !== videoRunId || captureBusy) {
        return;
      }

      captureBusy = true;
      try {
        const nextFrameId = frameId + 1;
        const frame = await context.screen.makeFrame(nextFrameId, nextSession);
        if (runId === videoRunId) {
          frameId = nextFrameId;
          send(frame);
        }
      } catch (error) {
        context.logger.warn(`视频帧生成失败：${error.message}`);
      } finally {
        if (runId === videoRunId) {
          captureBusy = false;
        }
      }
    };

    frameTimer = setInterval(() => {
      void sendNextFrame();
    }, intervalMs);
    void sendNextFrame();
  }

  function startAudioFrames(nextSession) {
    stopAudioFrames();
    if (!nextSession.audioEnabled || nextSession.audioCodec === "none") {
      return;
    }
    audioTimer = setInterval(() => {
      send(context.audio.makeFrame(nextSession));
    }, 240);
  }

  function handleMessage(message) {
    if (message.type === "hello") {
      const clipboardCapabilities = context.clipboard.getCapabilities();
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
          clipboardTextMode: clipboardCapabilities.textMode,
          clipboardFile: true,
          clipboardFileMode: clipboardCapabilities.fileMode,
          clipboard: clipboardCapabilities,
        },
      });
      return;
    }

    if (message.type === "auth_request") {
      const ok = message.password === context.password;
      authenticated = ok;
      if (ok) {
        failedAuthAttempts = 0;
      } else {
        failedAuthAttempts += 1;
      }
      const attemptsRemaining = Math.max(0, maxAuthAttempts - failedAuthAttempts);
      const shouldClose = !ok && attemptsRemaining === 0;
      send({
        type: "auth_result",
        ok,
        code: ok ? "" : "LAN002",
        reason: ok ? "" : shouldClose ? "连接密码错误次数过多，请重新连接后再试。" : "连接密码不正确",
        message: ok ? "验证通过" : "密码错误",
        attemptsRemaining,
        maxAttempts: maxAuthAttempts,
      });
      context.logger.info(ok ? "认证通过" : `认证失败，剩余 ${attemptsRemaining} 次`);
      if (shouldClose) {
        socket.end();
      }
      return;
    }

    if (!authenticated) {
      sendAuthRequired(message);
      return;
    }

    if (message.type === "session_offer") {
      const screen = context.screen.negotiate(message);
      const audio = context.audio.negotiate(message);
      session = makeSessionAnswer(message, screen, audio, context.clipboard);
      send(session);
      if (message.wantVideo !== false) {
        startVideoFrames(session);
      }
      startAudioFrames(session);
      context.logger.info(`会话已协商：${session.width}x${session.height} / ${session.fps} Hz`);
      return;
    }

    if (message.type === "display_settings") {
      if (session) {
        session = context.screen.updateSessionDisplay(session, message);
        session = {
          ...session,
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
      const clipboardCapabilities = context.clipboard.getCapabilities();
      send({
        type: "display_settings_ack",
        accepted: true,
        videoCodec: session?.videoCodec ?? "mock-svg",
        videoEncoding: session?.videoEncoding ?? "data-url",
        fps: session?.fps ?? (Number(message.fps) || 60),
        requestedFps: Number(message.fps) || session?.fps || 60,
        maxScreenFps: session?.maxScreenFps ?? 60,
        frameIntervalMs: session?.frameIntervalMs,
        hostMode: session?.hostMode ?? "windows-host-skeleton",
        capturePipeline: session?.capturePipeline ?? "mock-svg",
        clipboardText: Boolean(message.clipboardText ?? session?.clipboardText ?? true),
        clipboardTextMode: clipboardCapabilities.textMode,
        clipboardFile: Boolean(message.clipboardFile ?? session?.clipboardFile ?? true),
        clipboardFileMode: clipboardCapabilities.fileMode,
      });
      return;
    }

    if (message.type === "audio_settings_update") {
      send(context.audio.updateSettings(message));
      if (session) {
        session = {
          ...session,
          audioEnabled: Boolean(message.enabled),
          audioVolume: Number(message.volume) || 0,
          audioCodec: message.enabled ? (message.codec ?? session.audioCodec ?? "opus") : "none",
        };
      }
      if (message.enabled && !message.muted) {
        startAudioFrames(session ?? { audioEnabled: true, audioCodec: message.codec ?? "opus" });
      } else {
        stopAudioFrames();
      }
      return;
    }

    if (message.type === "input_event") {
      send(makeInputAck(message, context.input.inject(message)));
      return;
    }

    if (message.type === "clipboard_text") {
      send(context.clipboard.receiveText(message));
      return;
    }

    if (message.type === "clipboard_file_offer") {
      send(context.clipboard.receiveFileOffer(message));
      return;
    }

    if (message.type === "clipboard_file_chunk") {
      send(context.clipboard.receiveFileChunk(message));
      return;
    }

    if (message.type === "clipboard_file_complete") {
      send(context.clipboard.completeFileTransfer(message));
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
    if (message.type === "input_event") {
      send(makeInputAck(message, {
        accepted: false,
        injected: false,
        mode: "auth",
        reason,
      }));
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
      const clipboardCapabilities = clipboard.getCapabilities();
      const screenCapabilities = screen.getCapabilities();
      response.writeHead(200, {
        ...corsHeaders,
        "Content-Type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify({
        type: "lan_dual_discovery",
        protocolVersion,
        deviceId: `windows-host-${advertisedHost}-${port}`,
        deviceName: "Windows 被控端骨架",
        platform: "windows",
        role: "host",
        host: advertisedHost,
        port,
        controlPort: port,
        capabilities: {
          screen: screenCapabilities,
          audio: audio.getCapabilities(),
          input: input.getCapabilities(),
          clipboardText: true,
          clipboardTextMode: clipboardCapabilities.textMode,
          clipboardFile: true,
          clipboardFileMode: clipboardCapabilities.fileMode,
          clipboard: clipboardCapabilities,
          reverseControl: true,
          mock: screenCapabilities.mode === "mock",
        },
        lastSeenAt: new Date().toISOString(),
      }));
      return;
    }

    response.writeHead(200, {
      ...corsHeaders,
      "Content-Type": "text/plain; charset=utf-8",
    });
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
          const screenCapabilities = screen.getCapabilities();
          logger.info(
            screenCapabilities.mode === "system-jpeg"
              ? "当前使用 Windows 系统截图 JPEG 视频帧，音频仍为模拟帧；可注入输入并写入系统文本/文件剪贴板。"
              : "当前为骨架模式：模拟视频帧和音频帧；Windows 上可注入输入并写入系统文本/文件剪贴板。",
          );
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
