const elements = {
  hostInput: document.querySelector("#hostInput"),
  portInput: document.querySelector("#portInput"),
  passwordInput: document.querySelector("#passwordInput"),
  discoverButton: document.querySelector("#discoverButton"),
  connectButton: document.querySelector("#connectButton"),
  disconnectButton: document.querySelector("#disconnectButton"),
  connectionStatus: document.querySelector("#connectionStatus"),
  remoteStatus: document.querySelector("#remoteStatus"),
  videoStatus: document.querySelector("#videoStatus"),
  audioStatus: document.querySelector("#audioStatus"),
  inputStatus: document.querySelector("#inputStatus"),
  remoteViewport: document.querySelector("#remoteViewport"),
  remoteImage: document.querySelector("#remoteImage"),
  emptyState: document.querySelector("#emptyState"),
  focusButton: document.querySelector("#focusButton"),
  eventLog: document.querySelector("#eventLog"),
  clearLogButton: document.querySelector("#clearLogButton"),
};

const state = {
  socket: null,
  connected: false,
  authenticated: false,
  remoteWidth: 1280,
  remoteHeight: 720,
  frameCount: 0,
  frameWindowStartedAt: 0,
  frameWindowCount: 0,
  lastPointerSentAt: 0,
  inputSequence: 0,
};

function nowText() {
  return new Date().toLocaleTimeString("zh-CN", { hour12: false });
}

function logEvent(title, detail = "") {
  const item = document.createElement("li");
  item.innerHTML = `<strong>${title}</strong>${detail ? ` · ${detail}` : ""} <span>${nowText()}</span>`;
  elements.eventLog.prepend(item);
  while (elements.eventLog.children.length > 80) {
    elements.eventLog.lastElementChild?.remove();
  }
}

function setConnectionStatus(text) {
  elements.connectionStatus.textContent = text;
}

function setConnected(connected) {
  state.connected = connected;
  elements.connectButton.disabled = connected;
  elements.disconnectButton.disabled = !connected;
  setConnectionStatus(connected ? "已连接" : "未连接");
}

function targetBaseUrl() {
  const host = elements.hostInput.value.trim() || "127.0.0.1";
  const port = elements.portInput.value.trim() || "43770";
  return `http://${host}:${port}`;
}

function targetWsUrl() {
  const host = elements.hostInput.value.trim() || "127.0.0.1";
  const port = elements.portInput.value.trim() || "43770";
  return `ws://${host}:${port}`;
}

function makeEnvelope(message) {
  return {
    id: `${message.type}-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    ...message,
  };
}

function send(message) {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
    return null;
  }
  const envelope = makeEnvelope(message);
  state.socket.send(JSON.stringify(envelope));
  return envelope;
}

async function discover() {
  const url = `${targetBaseUrl()}/discovery`;
  elements.remoteStatus.textContent = "发现中";
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    elements.remoteStatus.textContent = `${payload.deviceName || payload.hostName || "Windows"} · ${payload.platform || "unknown"}`;
    logEvent("发现成功", `${payload.host || elements.hostInput.value}:${payload.port || elements.portInput.value}`);
    return payload;
  } catch (error) {
    elements.remoteStatus.textContent = "发现失败";
    logEvent("发现失败", error.message);
    throw error;
  }
}

async function connect() {
  disconnect();
  setConnectionStatus("连接中");
  elements.videoStatus.textContent = "等待视频";
  try {
    await discover();
  } catch {
    // Discovery is helpful but not mandatory for direct WebSocket testing.
  }

  const socket = new WebSocket(targetWsUrl());
  state.socket = socket;
  socket.addEventListener("open", () => {
    setConnected(true);
    logEvent("WebSocket 已连接", targetWsUrl());
    send({
      type: "hello",
      clientName: "Mac 控制端 Web 原型",
      clientPlatform: "macos",
      protocolVersion: 1,
    });
  });
  socket.addEventListener("message", (event) => {
    handleMessage(event.data);
  });
  socket.addEventListener("close", () => {
    setConnected(false);
    state.authenticated = false;
    logEvent("连接关闭");
  });
  socket.addEventListener("error", () => {
    setConnectionStatus("连接错误");
    logEvent("连接错误", targetWsUrl());
  });
}

function disconnect() {
  if (state.socket) {
    state.socket.close();
  }
  state.socket = null;
  state.authenticated = false;
  setConnected(false);
}

function handleMessage(rawData) {
  let message;
  try {
    message = JSON.parse(rawData);
  } catch {
    logEvent("收到无法解析的消息");
    return;
  }

  switch (message.type) {
    case "hello_ack":
      handleHelloAck(message);
      break;
    case "auth_result":
      handleAuthResult(message);
      break;
    case "session_answer":
      handleSessionAnswer(message);
      break;
    case "display_settings_ack":
      logEvent("显示设置已确认", `${message.videoCodec || "?"} · ${message.fps || "?"} fps`);
      break;
    case "video_frame":
      handleVideoFrame(message);
      break;
    case "audio_frame":
      elements.audioStatus.textContent = `${message.codec || "mock"} · level ${Math.round(Number(message.level || 0) * 100)}%`;
      break;
    case "input_ack":
      elements.inputStatus.textContent = `${message.accepted ? "已确认" : "被拒绝"} · ${message.mode || "unknown"}`;
      if (!message.accepted) {
        logEvent("输入被拒绝", message.reason || message.code || "unknown");
      }
      break;
    case "error":
      logEvent("远端错误", message.message || message.reason || message.code || "unknown");
      break;
    default:
      logEvent("收到消息", message.type || "unknown");
      break;
  }
}

function handleHelloAck(message) {
  elements.remoteStatus.textContent = `${message.hostName || message.deviceName || "Windows"} · ${message.hostPlatform || "windows"}`;
  logEvent("握手成功", message.hostName || message.deviceName || "Windows 被控端");
  send({
    type: "auth_request",
    method: "password",
    password: elements.passwordInput.value,
  });
}

function handleAuthResult(message) {
  if (!message.ok) {
    setConnectionStatus("认证失败");
    logEvent("认证失败", message.reason || message.message || message.code || "unknown");
    return;
  }
  state.authenticated = true;
  logEvent("认证通过");
  send({
    type: "session_offer",
    protocolVersion: 1,
    wantVideo: true,
    wantAudio: true,
    wantClipboardText: false,
    wantClipboardFile: false,
    preferredVideoCodec: "mjpeg",
    preferredAudioCodec: "opus",
    maxFps: 8,
    maxBandwidthKbps: 8000,
    qualityPreset: "balanced",
    displayMode: "window",
    displayId: "main",
    preferredWidth: 1280,
    preferredHeight: 720,
    audioVolume: 80,
  });
}

function handleSessionAnswer(message) {
  if (!message.ok) {
    logEvent("会话协商失败", message.reason || message.message || message.code || "unknown");
    return;
  }
  state.remoteWidth = Number(message.width || message.screenWidth || state.remoteWidth);
  state.remoteHeight = Number(message.height || message.screenHeight || state.remoteHeight);
  elements.remoteStatus.textContent = `${state.remoteWidth}x${state.remoteHeight} · ${message.hostMode || "windows-host"}`;
  logEvent("会话已协商", `${state.remoteWidth}x${state.remoteHeight} · ${message.videoCodec || "video"}`);
}

function handleVideoFrame(frame) {
  if (frame.dataUrl) {
    elements.remoteImage.src = frame.dataUrl;
    elements.remoteImage.classList.add("is-visible");
    elements.emptyState.classList.add("is-hidden");
  }
  state.remoteWidth = Number(frame.width || state.remoteWidth);
  state.remoteHeight = Number(frame.height || state.remoteHeight);
  state.frameCount += 1;
  state.frameWindowCount += 1;
  const now = performance.now();
  if (!state.frameWindowStartedAt) {
    state.frameWindowStartedAt = now;
  }
  const elapsed = now - state.frameWindowStartedAt;
  if (elapsed >= 1000) {
    const fps = (state.frameWindowCount * 1000) / elapsed;
    elements.videoStatus.textContent = `${frame.codec || "jpeg"} · #${frame.frameId || state.frameCount} · ${fps.toFixed(1)} fps`;
    state.frameWindowCount = 0;
    state.frameWindowStartedAt = now;
  } else {
    elements.videoStatus.textContent = `${frame.codec || "jpeg"} · #${frame.frameId || state.frameCount}`;
  }
}

function imagePointFromEvent(event) {
  const rect = elements.remoteImage.getBoundingClientRect();
  if (!rect.width || !rect.height || !elements.remoteImage.classList.contains("is-visible")) {
    return null;
  }
  const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
  return {
    x,
    y,
    remoteX: Math.round(x * Math.max(1, state.remoteWidth - 1)),
    remoteY: Math.round(y * Math.max(1, state.remoteHeight - 1)),
  };
}

function buttonName(button) {
  if (button === 2) return "right";
  if (button === 1) return "middle";
  return "left";
}

function sendPointerEvent(eventName, event, extra = {}) {
  if (!state.authenticated) return;
  const point = imagePointFromEvent(event);
  if (!point) return;
  state.inputSequence += 1;
  send({
    type: "input_event",
    event: eventName,
    sequence: state.inputSequence,
    pointerType: "mouse",
    ...point,
    ...extra,
  });
}

function keyboardModifiers(event) {
  const modifiers = [];
  if (event.shiftKey) modifiers.push("shift");
  if (event.altKey) modifiers.push("alt");
  if (event.ctrlKey || event.metaKey) modifiers.push("ctrl");
  return modifiers;
}

function sendKeyboardEvent(event) {
  if (!state.authenticated) return;
  state.inputSequence += 1;
  const modifiers = keyboardModifiers(event);
  const envelope = send({
    type: "input_event",
    event: "key",
    action: event.repeat ? "down" : "key",
    sequence: state.inputSequence,
    key: event.key,
    code: event.code,
    repeat: event.repeat,
    ctrlKey: modifiers.includes("ctrl"),
    altKey: modifiers.includes("alt"),
    shiftKey: modifiers.includes("shift"),
    metaKey: false,
    modifiers,
    remoteModifiers: modifiers,
    shortcutProfile: event.metaKey ? "mac_command_to_windows_ctrl" : "mac_to_windows",
    localKey: event.key,
    localCode: event.code,
    localCtrlKey: event.ctrlKey,
    localAltKey: event.altKey,
    localShiftKey: event.shiftKey,
    localMetaKey: event.metaKey,
  });
  if (envelope) {
    elements.inputStatus.textContent = `键盘已发送 · ${event.key}`;
  }
}

elements.discoverButton.addEventListener("click", () => {
  void discover();
});

elements.connectButton.addEventListener("click", () => {
  void connect();
});

elements.disconnectButton.addEventListener("click", disconnect);
elements.focusButton.addEventListener("click", () => elements.remoteViewport.focus());
elements.clearLogButton.addEventListener("click", () => {
  elements.eventLog.textContent = "";
});

elements.remoteViewport.addEventListener("pointerdown", (event) => {
  elements.remoteViewport.focus();
  event.preventDefault();
  sendPointerEvent("mouse_button", event, {
    action: "down",
    button: buttonName(event.button),
  });
});

elements.remoteViewport.addEventListener("pointerup", (event) => {
  event.preventDefault();
  sendPointerEvent("mouse_button", event, {
    action: "up",
    button: buttonName(event.button),
  });
});

elements.remoteViewport.addEventListener("pointermove", (event) => {
  const now = performance.now();
  if (now - state.lastPointerSentAt < 33) return;
  state.lastPointerSentAt = now;
  sendPointerEvent("mouse_move", event, { action: "move" });
});

elements.remoteViewport.addEventListener("wheel", (event) => {
  event.preventDefault();
  sendPointerEvent("mouse_wheel", event, {
    action: "wheel",
    deltaX: Math.round(event.deltaX),
    deltaY: Math.round(event.deltaY),
  });
}, { passive: false });

elements.remoteViewport.addEventListener("keydown", (event) => {
  if (!state.authenticated) return;
  event.preventDefault();
  sendKeyboardEvent(event);
});

logEvent("Mac 控制端已就绪", "默认连接 127.0.0.1:43772，可改为 Windows 局域网 IP:43770");
