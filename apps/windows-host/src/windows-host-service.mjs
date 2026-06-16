import { createServer } from "node:http";

import { WindowsAudioCaptureCoordinator } from "./windows-audio-capture.mjs";
import { WindowsClipboardBridge } from "./windows-clipboard-bridge.mjs";
import { WindowsHostLogger } from "./windows-host-logger.mjs";
import { WindowsInputInjector } from "./windows-input-injector.mjs";
import { WindowsScreenCaptureCoordinator } from "./windows-screen-capture.mjs";
import { decodeFrames, encodeBinaryFrame, encodeTextFrame, makeAcceptKey } from "./websocket-codec.mjs";

const protocolVersion = 1;
const defaultPassword = "demo-password";
const maxAuthAttempts = 3;
const binaryVideoMagic = Buffer.from("LDCV1\n", "ascii");
const reverseControlRequestRetentionMs = 120000;

function normalizeReverseControlMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["accept", "auto-accept", "auto_accept", "lab-accept", "test-accept"].includes(normalized)) {
    return "accept";
  }
  if (["disabled", "disable", "off", "false", "0"].includes(normalized)) {
    return "disabled";
  }
  return "deny";
}

function makeReverseControlCapabilities(mode) {
  const normalized = normalizeReverseControlMode(mode);
  return {
    supported: normalized !== "disabled",
    mode: normalized,
    requiresConfirmation: normalized !== "accept",
    autoAccept: normalized === "accept",
  };
}

function compactReverseControlText(value, maxLength = 80) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}...`;
}

function makeRuntimeInfo(startedAtMs, buildId) {
  return {
    processId: process.pid,
    startedAt: new Date(startedAtMs).toISOString(),
    uptimeSeconds: Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)),
    buildId,
  };
}

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

function wantsBinaryJpegVideo(message = {}) {
  const values = [
    message.preferredVideoTransport,
    message.videoTransport,
    message.preferredVideoEncoding,
    message.videoEncoding,
    ...(Array.isArray(message.supportedVideoTransports) ? message.supportedVideoTransports : []),
  ].map((value) => String(value ?? "").trim().toLowerCase());
  return values.some((value) => ["binary", "binary-jpeg", "jpeg-binary", "binary-jpeg-v1"].includes(value));
}

function wantsBinaryH264Video(message = {}) {
  const values = [
    message.preferredVideoTransport,
    message.videoTransport,
    message.preferredVideoEncoding,
    message.videoEncoding,
    ...(Array.isArray(message.supportedVideoTransports) ? message.supportedVideoTransports : []),
  ].map((value) => String(value ?? "").trim().toLowerCase());
  return values.some((value) => ["binary", "binary-h264", "h264-binary", "annexb-binary", "binary-h264-v1"].includes(value));
}

function withVideoTransport(session, message) {
  const codec = String(session.videoCodec ?? "").trim().toLowerCase();
  return {
    ...session,
    videoTransport: codec === "h264" && wantsBinaryH264Video(message)
      ? "binary-h264"
      : codec === "jpeg" && wantsBinaryJpegVideo(message)
        ? "binary-jpeg"
        : "json",
  };
}

function makeSessionAnswer(message, screen, audio, clipboard) {
  const clipboardCapabilities = clipboard.getCapabilities();
  return {
    type: "session_answer",
    ok: true,
    videoCodec: screen.videoCodec,
    videoEncoding: screen.videoEncoding,
    codecString: screen.codecString ?? "",
    h264Encoder: screen.h264Encoder ?? "",
    h264Level: screen.h264Level ?? "",
    videoTransport: screen.videoTransport ?? "json",
    audioCodec: audio.audioCodec,
    audioEncoding: audio.audioEncoding,
    audioMode: audio.audioMode,
    audioEnabled: audio.audioEnabled,
    audioFrameIntervalMs: audio.audioFrameIntervalMs,
    audioDevice: audio.audioDevice,
    sampleRate: audio.sampleRate,
    channels: audio.channels,
    fps: screen.fps,
    requestedFps: screen.requestedFps,
    maxScreenFps: screen.maxScreenFps,
    maxBandwidthKbps: screen.maxBandwidthKbps,
    qualityPreset: screen.qualityPreset,
    jpegQuality: screen.jpegQuality,
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
    requestedScreenMode: screen.requestedScreenMode ?? "",
    wgcFallbackReason: screen.wgcFallbackReason ?? "",
  };
}

function makeEnvelope(message) {
  return {
    id: makeMessageId(message.type),
    timestamp: new Date().toISOString(),
    ...message,
  };
}

function makeReverseControlGrantManager() {
  const grant = {
    expiresAtMs: 0,
    grantedAt: "",
    consumedAt: "",
    revokedAt: "",
  };
  let lastRequest = null;
  const publicLastRequest = () => {
    if (!lastRequest) return null;
    const now = Date.now();
    const ageMs = Math.max(0, now - lastRequest.requestedAtMs);
    const active = lastRequest.status === "rejected_needs_grant" && ageMs <= reverseControlRequestRetentionMs;
    return {
      active,
      status: lastRequest.status,
      requestId: lastRequest.requestId,
      requester: lastRequest.requester,
      requestedAt: lastRequest.requestedAt,
      updatedAt: lastRequest.updatedAt,
      reason: lastRequest.reason,
      ageMs,
      expiresAt: active ? new Date(lastRequest.requestedAtMs + reverseControlRequestRetentionMs).toISOString() : "",
    };
  };
  const status = () => {
    const now = Date.now();
    const active = grant.expiresAtMs > now;
    return {
      active,
      oneTime: true,
      grantedAt: grant.grantedAt,
      expiresAt: active ? new Date(grant.expiresAtMs).toISOString() : "",
      remainingMs: active ? Math.max(0, grant.expiresAtMs - now) : 0,
      consumedAt: grant.consumedAt,
      revokedAt: grant.revokedAt,
      lastRequest: publicLastRequest(),
    };
  };
  return {
    status,
    recordRequest({ requestId = "", requester = "", status: requestStatus = "", reason = "" } = {}) {
      const now = Date.now();
      lastRequest = {
        requestId: compactReverseControlText(requestId),
        requester: compactReverseControlText(requester || "对方"),
        status: compactReverseControlText(requestStatus || "unknown"),
        reason: compactReverseControlText(reason),
        requestedAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
        requestedAtMs: now,
      };
      return publicLastRequest();
    },
    grant(durationMs = 30000) {
      const now = Date.now();
      const safeDurationMs = Math.max(5000, Math.min(120000, Number(durationMs) || 30000));
      grant.expiresAtMs = now + safeDurationMs;
      grant.grantedAt = new Date(now).toISOString();
      grant.consumedAt = "";
      grant.revokedAt = "";
      return status();
    },
    revoke() {
      grant.expiresAtMs = 0;
      grant.revokedAt = new Date().toISOString();
      return status();
    },
    consume() {
      const current = status();
      if (!current.active) return null;
      grant.expiresAtMs = 0;
      grant.consumedAt = new Date().toISOString();
      return current;
    },
  };
}

function makeReverseControlResponse({ message, mode, state, grantManager }) {
  const reverseMode = normalizeReverseControlMode(mode);
  const requestId = String(message.requestId ?? "").trim();
  const requester = String(message.from || "对方").trim() || "对方";
  const now = new Date().toISOString();

  if (!requestId) {
    Object.assign(state, {
      status: "rejected",
      requestId: "",
      updatedAt: now,
      reason: "缺少 requestId",
    });
    grantManager?.recordRequest?.({
      requestId: "",
      requester,
      status: "rejected_invalid",
      reason: "missing requestId",
    });
    return {
      type: "reverse_control_response",
      requestId: "",
      accepted: false,
      code: "LAN008",
      reason: "缺少 requestId，已拒绝一键反控请求。",
      reverseControlMode: reverseMode,
      reverseControlState: state.status,
    };
  }

  Object.assign(state, {
    status: "requested",
    requestId,
    requester,
    requestedAt: now,
    updatedAt: now,
    reason: "",
  });

  if (reverseMode === "disabled") {
    Object.assign(state, {
      status: "rejected",
      updatedAt: new Date().toISOString(),
      reason: "disabled",
    });
    grantManager?.recordRequest?.({
      requestId,
      requester,
      status: "rejected_disabled",
      reason: "disabled",
    });
    return {
      type: "reverse_control_response",
      requestId,
      accepted: false,
      code: "LAN008",
      reason: "Windows host 当前未启用一键反控接收，控制方向保持不变。",
      reverseControlMode: reverseMode,
      reverseControlState: state.status,
    };
  }

  if (reverseMode === "accept") {
    Object.assign(state, {
      status: "accepted",
      updatedAt: new Date().toISOString(),
      reason: "explicit lab auto-accept",
    });
    grantManager?.recordRequest?.({
      requestId,
      requester,
      status: "accepted_by_policy",
      reason: "accept policy",
    });
    return {
      type: "reverse_control_response",
      requestId,
      accepted: true,
      reason: "Windows host 已在显式实验策略下同意一键反控请求。",
      reverseControlMode: reverseMode,
      reverseControlState: state.status,
    };
  }

  if (reverseMode === "deny") {
    const consumedGrant = grantManager?.consume?.();
    if (consumedGrant?.active) {
      Object.assign(state, {
        status: "accepted",
        updatedAt: new Date().toISOString(),
        reason: "local temporary grant consumed",
      });
      grantManager?.recordRequest?.({
        requestId,
        requester,
        status: "accepted_by_temporary_grant",
        reason: "temporary grant consumed",
      });
      return {
        type: "reverse_control_response",
        requestId,
        accepted: true,
        reason: "Windows 本机用户已短时允许下一次反控请求，本次授权已使用。",
        reverseControlMode: reverseMode,
        reverseControlState: state.status,
        reverseControlGrant: "consumed",
      };
    }
  }

  Object.assign(state, {
    status: "rejected",
    updatedAt: new Date().toISOString(),
    reason: "confirmation required",
  });
  grantManager?.recordRequest?.({
    requestId,
    requester,
    status: "rejected_needs_grant",
    reason: "confirmation required",
  });
  return {
    type: "reverse_control_response",
    requestId,
    accepted: false,
    code: "LAN008",
    reason: `${requester} 请求一键反控；Windows host 当前需要用户确认，默认安全拒绝，控制方向保持不变。`,
    reverseControlMode: reverseMode,
    reverseControlState: state.status,
  };
}

function isLoopbackAddress(address = "") {
  const value = String(address || "").trim().toLowerCase();
  return value === "::1"
    || value === "127.0.0.1"
    || value.startsWith("127.")
    || value === "::ffff:127.0.0.1"
    || value.startsWith("::ffff:127.");
}

function sendJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    ...headers,
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request, maxBytes = 4096) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    request.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("请求正文过大。"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8").trim();
      if (!text) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch (error) {
        reject(new Error(`JSON 解析失败：${error.message}`));
      }
    });
    request.on("error", reject);
  });
}

function parseDataUrlPayload(dataUrl) {
  const match = /^data:([^;,]+)?;base64,(.*)$/s.exec(String(dataUrl || ""));
  if (!match) {
    return null;
  }
  const mimeType = match[1] || "application/octet-stream";
  const payload = Buffer.from(match[2], "base64");
  if (payload.length === 0) {
    return null;
  }
  return { mimeType, payload };
}

function parseBase64Payload(value) {
  const payload = Buffer.from(String(value || ""), "base64");
  return payload.length > 0 ? payload : null;
}

function makeBinaryVideoEnvelope(envelope) {
  if (envelope.type !== "video_frame") {
    return null;
  }
  if (envelope.repeatPreviousFrame === true) {
    return null;
  }

  const codec = String(envelope.codec ?? "").toLowerCase();
  const videoTransport = String(envelope.videoTransport ?? "").toLowerCase();
  let parsed = null;
  let headerOverrides = {};

  if (codec === "jpeg" && videoTransport === "binary-jpeg" && envelope.dataUrl) {
    parsed = parseDataUrlPayload(envelope.dataUrl);
    if (!parsed || !parsed.mimeType.toLowerCase().includes("jpeg")) {
      return null;
    }
    headerOverrides = {
      encoding: "binary-jpeg",
      videoTransport: "binary-jpeg",
      mimeType: parsed.mimeType,
    };
  } else if (codec === "h264" && videoTransport === "binary-h264" && envelope.payload) {
    const payload = parseBase64Payload(envelope.payload);
    if (!payload) {
      return null;
    }
    parsed = {
      mimeType: "video/avc",
      payload,
    };
    headerOverrides = {
      encoding: "annexb-binary",
      videoTransport: "binary-h264",
      mimeType: parsed.mimeType,
    };
  } else {
    return null;
  }

  const header = {
    ...envelope,
    ...headerOverrides,
    payloadBytes: parsed.payload.length,
    binaryPayloadBytes: parsed.payload.length,
  };
  delete header.dataUrl;
  delete header.payload;

  const headerBuffer = Buffer.from(JSON.stringify(header), "utf8");
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(headerBuffer.length, 0);
  return Buffer.concat([binaryVideoMagic, lengthBuffer, headerBuffer, parsed.payload]);
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
  const reverseControlMode = normalizeReverseControlMode(context.reverseControlMode);
  const reverseControlPolicy = makeReverseControlCapabilities(reverseControlMode);
  const reverseControlState = {
    status: "idle",
    requestId: "",
    requester: "",
    reason: "",
    updatedAt: new Date().toISOString(),
  };

  function send(message) {
    socket.write(encodeTextFrame(JSON.stringify(makeEnvelope(message))));
  }

  function sendVideoFrame(message, nextSession) {
    const envelope = makeEnvelope(message);
    const binaryEnvelope = makeBinaryVideoEnvelope({
      ...envelope,
      videoTransport: nextSession?.videoTransport ?? envelope.videoTransport,
    });
    if (binaryEnvelope) {
      socket.write(encodeBinaryFrame(binaryEnvelope));
      return;
    }
    socket.write(encodeTextFrame(JSON.stringify(envelope)));
  }

  function stopVideoFrames() {
    videoRunId += 1;
    captureBusy = false;
    if (frameTimer) {
      clearTimeout(frameTimer);
      frameTimer = null;
    }
    context.screen.stop();
  }

  function stopAudioFrames() {
    if (audioTimer) {
      clearInterval(audioTimer);
      audioTimer = null;
    }
    context.audio.stop();
  }

  function startVideoFrames(nextSession) {
    stopVideoFrames();
    context.screen.start(nextSession);
    const runId = videoRunId + 1;
    videoRunId = runId;
    captureBusy = false;
    const schedulerFps = Math.max(
      1,
      Math.min(Number(nextSession.fps) || 5, Number(nextSession.maxScreenFps) || 8),
    );
    const intervalMs = Math.max(16, Math.round(1000 / schedulerFps));
    let nextDueAt = performance.now();

    const scheduleNextFrame = (delayMs = 0) => {
      if (runId !== videoRunId) {
        return;
      }
      frameTimer = setTimeout(() => {
        frameTimer = null;
        void sendNextFrame();
      }, Math.max(0, delayMs));
    };

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
          sendVideoFrame(frame, nextSession);
        }
      } catch (error) {
        if (runId === videoRunId) {
          context.logger.warn(`视频帧生成失败：${error.message}`);
        }
      } finally {
        if (runId === videoRunId) {
          captureBusy = false;
          nextDueAt += intervalMs;
          scheduleNextFrame(nextDueAt - performance.now());
        }
      }
    };

    void sendNextFrame();
  }

  function startAudioFrames(nextSession) {
    stopAudioFrames();
    if (!nextSession.audioEnabled || nextSession.audioCodec === "none") {
      return;
    }
    context.audio.start(nextSession);
    const requestedIntervalMs = Number(nextSession.audioFrameIntervalMs)
      || (nextSession.audioEncoding === "pcm-f32le-base64" ? 20 : 240);
    const intervalMs = nextSession.audioEncoding === "pcm-f32le-base64"
      ? Math.max(8, Math.min(120, Math.round(requestedIntervalMs / 2)))
      : Math.max(20, Math.min(240, requestedIntervalMs));
    audioTimer = setInterval(() => {
      const frame = context.audio.makeFrame(nextSession);
      if (frame) {
        send(frame);
      }
    }, intervalMs);
  }

  async function handleMessage(message) {
    if (message.type === "hello") {
      const clipboardCapabilities = context.clipboard.getCapabilities();
      send({
        type: "hello_ack",
        protocolVersion,
        hostName: "Windows 被控端骨架",
        hostPlatform: "windows",
        runtime: context.runtime(),
        capabilities: {
          screen: context.screen.getCapabilities(),
          audio: context.audio.getCapabilities(),
          input: context.input.getCapabilities(),
          clipboardText: true,
          clipboardTextMode: clipboardCapabilities.textMode,
          clipboardFile: true,
          clipboardFileMode: clipboardCapabilities.fileMode,
          clipboard: clipboardCapabilities,
          reverseControl: reverseControlPolicy.supported,
          reverseControlMode,
          reverseControlPolicy,
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
      const screen = withVideoTransport(context.screen.negotiate(message), message);
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
        session = withVideoTransport(context.screen.updateSessionDisplay(session, message), message);
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
        codecString: session?.codecString ?? "",
        h264Encoder: session?.h264Encoder ?? "",
        h264Level: session?.h264Level ?? "",
        videoTransport: session?.videoTransport ?? "json",
        width: session?.width ?? (Number(message.width) || 1920),
        height: session?.height ?? (Number(message.height) || 1080),
        fps: session?.fps ?? (Number(message.fps) || 60),
        requestedFps: Number(message.fps) || session?.fps || 60,
        maxScreenFps: session?.maxScreenFps ?? 60,
        frameIntervalMs: session?.frameIntervalMs,
        activeDisplayId: session?.activeDisplayId ?? message.displayId ?? "main",
        displayName: session?.displayName ?? "",
        maxBandwidthKbps: session?.maxBandwidthKbps ?? (Number(message.maxBandwidthKbps) || 50000),
        qualityPreset: session?.qualityPreset ?? message.qualityPreset ?? "balanced",
        jpegQuality: session?.jpegQuality,
        hostMode: session?.hostMode ?? "windows-host-skeleton",
        capturePipeline: session?.capturePipeline ?? "mock-svg",
        requestedScreenMode: session?.requestedScreenMode ?? "",
        wgcFallbackReason: session?.wgcFallbackReason ?? "",
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
          audioEncoding: message.enabled ? (message.encoding ?? session.audioEncoding) : "none",
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
      send(makeInputAck(message, await context.input.inject(message)));
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
      const response = makeReverseControlResponse({
        message,
        mode: reverseControlMode,
        state: reverseControlState,
        grantManager: context.reverseControlGrant,
      });
      context.logger.info(response.accepted
        ? `一键反控请求已同意：requestId=${response.requestId}`
        : `一键反控请求已拒绝：requestId=${response.requestId || "missing"} reason=${response.reason}`);
      send(response);
      return;
    }

    if (message.type === "reverse_control_response") {
      Object.assign(reverseControlState, {
        status: message.accepted ? "peer_accepted" : "peer_rejected",
        requestId: String(message.requestId ?? ""),
        reason: String(message.reason ?? ""),
        updatedAt: new Date().toISOString(),
      });
      context.logger.info(`收到一键反控确认：accepted=${Boolean(message.accepted)} requestId=${reverseControlState.requestId || "missing"}`);
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
        void handleMessage(JSON.parse(frame.body)).catch((error) => {
          send({
            type: "error",
            message: `处理消息失败：${error.message}`,
          });
        });
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
  buildId = process.env.LAN_DUAL_BUILD_ID || "dev",
  reverseControlMode = process.env.LAN_DUAL_WINDOWS_REVERSE_CONTROL_MODE || "deny",
  logger = new WindowsHostLogger(),
} = {}) {
  const startedAtMs = Date.now();
  const runtime = () => makeRuntimeInfo(startedAtMs, buildId);
  const screen = new WindowsScreenCaptureCoordinator({ logger });
  const audio = new WindowsAudioCaptureCoordinator({ logger });
  const input = new WindowsInputInjector({ logger });
  const clipboard = new WindowsClipboardBridge({ logger });
  const normalizedReverseControlMode = normalizeReverseControlMode(reverseControlMode);
  const reverseControlPolicy = makeReverseControlCapabilities(normalizedReverseControlMode);
  const reverseControlGrant = makeReverseControlGrantManager();

  const server = createServer((request, response) => {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    const pathname = (request.url ?? "").split("?")[0];

    if (request.method === "OPTIONS") {
      response.writeHead(204, corsHeaders);
      response.end();
      return;
    }

    if (pathname === "/discovery") {
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
        runtime: runtime(),
        capabilities: {
          screen: screenCapabilities,
          audio: audio.getCapabilities(),
          input: input.getCapabilities(),
          clipboardText: true,
          clipboardTextMode: clipboardCapabilities.textMode,
          clipboardFile: true,
          clipboardFileMode: clipboardCapabilities.fileMode,
          clipboard: clipboardCapabilities,
          videoTransports: ["json", "binary-jpeg", "binary-h264"],
          reverseControl: reverseControlPolicy.supported,
          reverseControlMode: normalizedReverseControlMode,
          reverseControlPolicy,
          reverseControlGrant: reverseControlGrant.status(),
          mock: screenCapabilities.mode === "mock",
        },
        lastSeenAt: new Date().toISOString(),
      }));
      return;
    }

    if (pathname === "/reverse-control/status" || pathname === "/reverse-control/grant" || pathname === "/reverse-control/revoke") {
      if (!isLoopbackAddress(request.socket.remoteAddress)) {
        sendJson(response, 403, {
          ok: false,
          code: "LAN403",
          message: "反控授权管理只允许 Windows 本机访问。",
        }, corsHeaders);
        return;
      }
      if (pathname === "/reverse-control/status") {
        sendJson(response, 200, {
          ok: true,
          reverseControlMode: normalizedReverseControlMode,
          reverseControlPolicy,
          reverseControlGrant: reverseControlGrant.status(),
        }, corsHeaders);
        return;
      }
      if (request.method !== "POST") {
        sendJson(response, 405, {
          ok: false,
          code: "LAN405",
          message: "该反控授权端点只接受 POST。",
        }, corsHeaders);
        return;
      }
      void readJsonBody(request)
        .then((body) => {
          const grant = pathname === "/reverse-control/grant"
            ? reverseControlGrant.grant(body.durationMs)
            : reverseControlGrant.revoke();
          logger.info(pathname === "/reverse-control/grant"
            ? `Windows 本机已短时允许下一次反控请求：remainingMs=${grant.remainingMs}`
            : "Windows 本机已撤销临时反控授权。");
          sendJson(response, 200, {
            ok: true,
            reverseControlMode: normalizedReverseControlMode,
            reverseControlPolicy,
            reverseControlGrant: grant,
          }, corsHeaders);
        })
        .catch((error) => {
          sendJson(response, 400, {
            ok: false,
            code: "LAN400",
            message: error.message,
          }, corsHeaders);
        });
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
    createClient(socket, {
      password,
      logger,
      screen,
      audio,
      input,
      clipboard,
      runtime,
      reverseControlMode: normalizedReverseControlMode,
      reverseControlGrant,
    });
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
          const audioCapabilities = audio.getCapabilities();
          const audioSummary = audioCapabilities.mockFrames
            ? "音频为模拟帧"
            : `音频使用 ${audioCapabilities.backend}`;
          logger.info(
            screenCapabilities.mode === "system-jpeg"
              ? `当前使用 Windows 系统截图 JPEG 视频帧，${audioSummary}；可注入输入并写入系统文本/文件剪贴板。`
              : `当前视频管线为 ${screenCapabilities.capturePipeline ?? screenCapabilities.mode}，${audioSummary}；Windows 上可注入输入并写入系统文本/文件剪贴板。`,
          );
          logger.info(
            normalizedReverseControlMode === "accept"
              ? "一键反控策略：显式实验同意。仅用于可信局域网联调。"
              : normalizedReverseControlMode === "disabled"
                ? "一键反控策略：已禁用。"
                : "一键反控策略：默认安全拒绝；Windows 本机可临时允许下一次反控请求。",
          );
          resolve();
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => {
          input.close();
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}
